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
 * Модуль обновлений (@capgo/capacitor-updater) настроен без их серверов:
 * ни проверок, ни статистики — только наш web.json.
 *
 * Каждый запуск сообщаем модулю, что экраны поднялись (notifyAppReady):
 * если свежий архив окажется сломанным и не сообщит, модуль сам вернёт
 * прежний.
 */
import { plugin } from './native-bridge.js';

const MANIFEST = 'https://sokolov055.github.io/admin_trainer_table/app/web.json';

/** Экраны вшиты в приложение (а не открыт живой сайт, как на Android) */
export function bundledApp() {
  return typeof window !== 'undefined' && window.location.protocol === 'capacitor:';
}

function currentBuild() {
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="build-sha"]');
  return meta ? meta.getAttribute('content') : '';
}

export async function startBundleUpdates() {
  const updater = plugin('CapacitorUpdater');
  if (!updater || !bundledApp()) return;
  try { await updater.notifyAppReady(); } catch (_) { /* старая сборка без модуля */ }

  try {
    const res = await fetch(MANIFEST + '?n=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const latest = await res.json();
    if (!latest || !latest.version || !latest.url || latest.version === currentBuild()) return;
    const bundle = await updater.download({ url: latest.url, version: latest.version });
    await updater.next({ id: bundle.id });
  } catch (_) {
    // Нет сети или архив не скачался — попробуем при следующем запуске
  }
}
