/**
 * Apple Watch: ключ входа для часов (28.09.2026).
 *
 * Часы ходят на сервер сами — начинают тренировку и ведут её, пока
 * приложение на iPhone закрыто. Ключ им выдаёт сервер по просьбе этого
 * приложения (auth.watch.token): отдельный сеанс «Apple Watch», его видно и
 * можно отозвать в списке устройств. iPhone передаёт ключ часам
 * (WatchBridge, WatchConnectivity), часы кладут его в Keychain.
 *
 * Просим ключ, только если часы подключены, приложение на них стоит, а
 * ключа у них ещё нет: иначе в списке устройств копились бы сеансы «Apple
 * Watch» на каждом запуске.
 */
import { apiPrimary } from './api.js';
import { currentApiUrl, loadApiConfig } from './apiConfig.js';
import { getToken } from './session.js';
import { bridge, isNativeApp, plugin } from './native-bridge.js';

function native() {
  if (!isNativeApp()) return null;
  const cap = bridge();
  try { if (cap.isPluginAvailable && !cap.isPluginAvailable('WorkoutActivity')) return null; } catch (_) { return null; }
  const p = plugin('WorkoutActivity');
  return p && p.watchStatus && p.setWatchAuth ? p : null;
}

let running = null;

/** Выдать часам ключ, если он им нужен. Тихо: сбой не мешает человеку */
export function linkWatch() {
  if (running) return running;
  running = (async () => {
    const p = native();
    if (!p || !getToken()) return false;
    const status = await p.watchStatus();
    if (!status || !status.paired || !status.installed || status.hasToken) return false;
    await loadApiConfig();
    const { token } = await apiPrimary('auth.watch.token');
    await p.setWatchAuth({ token, api: currentApiUrl() });
    return true;
  })().catch(() => false).finally(() => { running = null; });
  return running;
}
