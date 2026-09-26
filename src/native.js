/**
 * native.js — приложение для Android (оболочка Capacitor, каталог mobile/
 * основного репозитория).
 *
 * Оболочка открывает эту же живую страницу и добавляет мост к телефону:
 * window.Capacitor с плагинами. Сборка веба одна на всех, поэтому всё
 * здесь включается только при мосте — в браузере и в Telegram этого кода
 * будто нет.
 *
 * Что даёт оболочка:
 *   - системная кнопка «Назад» ведёт по экранам приложения, как жест
 *     «смахнуть вправо», а с главного экрана сворачивает приложение;
 *   - строка состояния телефона — цвета фона приложения и в тёмной теме.
 */
import { goBack } from './gestures.jsx';

function bridge() {
  return typeof window !== 'undefined' && window.Capacitor ? window.Capacitor : null;
}

/** Запущено в Android-приложении, а не в браузере */
export function isNativeApp() {
  const cap = bridge();
  try { return !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (_) { return false; }
}

function plugin(name) {
  const cap = bridge();
  if (!cap) return null;
  if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name];
  try { return cap.registerPlugin ? cap.registerPlugin(name) : null; } catch (_) { return null; }
}

export function startNative() {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('is-native');

  const app = plugin('App');
  if (app && app.addListener) {
    // Персональная ссылка тренера и одноразовый вход открываются прямо в
    // приложении: Android отдаёт их сюда (intent-filter в mobile/), а
    // страница читает ?access= и #loginTicket= при загрузке
    app.addListener('appUrlOpen', (event) => openLink(event && event.url));
    if (app.getLaunchUrl) app.getLaunchUrl().then((res) => openLink(res && res.url, true)).catch(() => {});
    app.addListener('backButton', () => {
      if (goBack()) return;
      if (app.minimizeApp) app.minimizeApp(); else if (app.exitApp) app.exitApp();
    });
  }

  const bar = plugin('StatusBar');
  if (bar && bar.setBackgroundColor) {
    // Цвет строки — по настоящему фону страницы: тема бывает выбрана
    // вручную, системной или пришла от Telegram
    let last = '';
    const paint = () => {
      const color = toHex(getComputedStyle(document.body).backgroundColor);
      if (!color || color === last) return;
      last = color;
      bar.setBackgroundColor({ color }).catch(() => {});
      bar.setStyle({ style: isDark(color) ? 'DARK' : 'LIGHT' }).catch(() => {});
    };
    const later = () => requestAnimationFrame(paint);
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', later); } catch (_) {}
    if (document.body) later(); else window.addEventListener('DOMContentLoaded', later);
  }
}

function openLink(href, launch = false) {
  let url;
  try { url = new URL(href); } catch (_) { return; }
  const here = window.location;
  if (url.origin !== here.origin || !url.pathname.startsWith(new URL('./', here.href).pathname)) return;
  if (url.href === here.href) return;
  // Ссылка запуска остаётся у приложения до его закрытия: не открывать её
  // заново при каждой перезагрузке страницы
  if (launch) {
    try {
      if (sessionStorage.getItem('native_launch_url') === url.href) return;
      sessionStorage.setItem('native_launch_url', url.href);
    } catch (_) {}
  }
  window.location.replace(url.href);
}

function toHex(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(rgb || '');
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return '';
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 128;
}
