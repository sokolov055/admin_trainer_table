import { lazy, createElement, Suspense } from 'react';

/**
 * Экраны по требованию.
 *
 * Первый экран не должен ждать того, что человеку сейчас не нужно:
 * клиенту — кабинета тренера, вошедшему — экранов входа, открывшему обзор —
 * тренировки и рациона. Раньше всё это (~790 КБ) ехало одним файлом.
 *
 * Две оговорки, из-за которых это не просто React.lazy:
 *
 * 1. Без сети. Сервис-воркер кладёт в кеш только то, что загружали, и
 *    тренировка, ни разу не открытая на этом телефоне, без сети не
 *    открылась бы. Поэтому после показа первого экрана части тихо
 *    догружаются в фоне (warmUp) — и попадают в кеш.
 *
 * 2. После выкладки. Старая страница просит часть со старым именем, а на
 *    сайте уже новые. Тогда — одна перезагрузка на свежую версию, а не
 *    белый экран. Повторно в течение минуты не перезагружаемся, чтобы не
 *    зациклиться, если часть не грузится по другой причине (нет сети).
 */

const RELOAD_KEY = 'lazy_reload_at';

function reloadOnce(error) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last > 60000 && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    }
  } catch (_) { /* без хранилища — не перезагружаемся, чтобы не зациклиться */ }
  throw error;
}

/** Компонент по требованию: lazyPage(() => import('./X.jsx')) или с именем экспорта */
export function lazyPage(load, name = 'default') {
  const page = lazy(() => load().then((m) => ({ default: m[name] })).catch(reloadOnce));
  page.preload = load;
  return page;
}

/** Место, где экран по требованию ещё грузится: fallback — что показать */
export function Deferred({ children, fallback = null }) {
  return createElement(Suspense, { fallback }, children);
}

/**
 * Догрузить части в фоне, когда телефон свободен: они лягут в кеш
 * сервис-воркера и откроются мгновенно — и без сети.
 */
export function warmUp(pages) {
  const run = () => pages.forEach((page) => { try { page.preload().catch(() => {}); } catch (_) { /* нет — и ладно */ } });
  if (typeof window === 'undefined') return;
  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
