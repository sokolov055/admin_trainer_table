/**
 * Свежие экраны для приложения, у которого они лежат внутри (iPhone).
 *
 * Android-оболочка открывает живой сайт и обновляется сама. На iPhone
 * экраны вшиты в приложение — так оно открывается мгновенно и без сети,
 * и так его охотнее пропускает проверка App Store. Чтобы правки сайта всё
 * равно доходили без новой сборки и новой проверки, приложение при каждом
 * запуске сверяется с сайтом: рядом с ним лежит app/web.json (номер сборки
 * и архив, см. .github/workflows/deploy.yml). Номер другой — скачиваем
 * архив и ставим его на следующий запуск: посреди работы экран не
 * подменяется.
 *
 * Страховка (27.09.2026: первая сборка из TestFlight так и не подхватила
 * новые экраны, хотя архив на сайте был исправен). Если при запуске
 * нужный архив уже скачан, а экраны всё ещё старые — «на следующий
 * запуск» не сработало, и мы включаем его сразу (set): одна перезагрузка
 * в первые секунды. Чем кончилась последняя попытка, запоминаем — это
 * видно в меню под версией (updateStatus), чтобы следующий сбой не
 * пришлось угадывать.
 *
 * Модуль обновлений (@capgo/capacitor-updater) настроен без их серверов:
 * ни проверок, ни статистики — только наш web.json.
 *
 * Каждый запуск сообщаем модулю, что экраны поднялись (notifyAppReady):
 * если свежий архив окажется сломанным и не сообщит, модуль сам вернёт
 * прежний.
 */
import { plugin } from './native-bridge.js';

const MANIFEST = 'https://sokolov055.github.io/admin_trainer_table/app/web.json';
const STATUS_KEY = 'bundle_update_v1';

/** Экраны вшиты в приложение (а не открыт живой сайт, как на Android) */
export function bundledApp() {
  return typeof window !== 'undefined' && window.location.protocol === 'capacitor:';
}

export function currentBuild() {
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="build-sha"]');
  return meta ? meta.getAttribute('content') : '';
}

function remember(state, detail = '') {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify({ state, detail: String(detail).slice(0, 160), at: new Date().toISOString() }));
  } catch (_) { /* без хранилища — просто не покажем */ }
}

/** Последняя попытка обновления: { state, detail, at } или null */
export function updateStatus() {
  try { return JSON.parse(localStorage.getItem(STATUS_KEY) || 'null'); } catch (_) { return null; }
}

export async function startBundleUpdates() {
  const updater = plugin('CapacitorUpdater');
  if (!bundledApp()) return;
  if (!updater) { remember('нет модуля'); return; }
  try { await updater.notifyAppReady(); } catch (_) { /* старая сборка без модуля */ }

  try {
    const res = await fetch(MANIFEST + '?n=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) { remember('сайт не ответил', res.status); return; }
    const latest = await res.json();
    if (!latest || !latest.version || !latest.url) { remember('нет web.json'); return; }
    if (latest.version === currentBuild()) { remember('свежие'); return; }

    // Уже скачан на прошлом запуске, а экраны прежние — включаем сразу
    const { bundles = [] } = await updater.list().catch(() => ({ bundles: [] }));
    // pending — скачан и ни разу не включался; success — уже работал
    const ready = bundles.find((b) => b.version === latest.version && (b.status === 'pending' || b.status === 'success'));
    if (ready) {
      remember('включаю ' + latest.version);
      await updater.set({ id: ready.id });
      return;
    }

    remember('скачиваю ' + latest.version);
    // checksum обязателен: без него модуль не скачивает («Checksum required»)
    if (!latest.checksum) { remember('нет контрольной суммы'); return; }
    const bundle = await updater.download({ url: latest.url, version: latest.version, checksum: latest.checksum });
    await updater.next({ id: bundle.id });
    remember('ждёт перезапуска', latest.version);
  } catch (error) {
    // Нет сети или архив не скачался — попробуем при следующем запуске
    remember('ошибка', (error && error.message) || error);
  }
}

/**
 * Подпись под версией в меню: какие экраны внутри и чем кончилось
 * последнее обновление. На сайте и в Android — пусто.
 */
export function screensNote() {
  if (!bundledApp()) return '';
  const status = updateStatus();
  return ' · экраны ' + (currentBuild() || '?') + (status ? ' · ' + status.state + (status.detail ? ' ' + status.detail : '') : '');
}
