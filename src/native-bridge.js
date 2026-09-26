/**
 * Мост к Android-оболочке (mobile/ основного репозитория): плагины
 * Capacitor, если страница открыта внутри приложения. В браузере и в
 * Telegram — null, и всё, что на нём построено, просто выключено.
 *
 * Отдельным файлом без зависимостей: его берут и настройки уведомлений,
 * и шаги, и тесты, которым незачем тянуть за собой жесты экрана.
 */
export function bridge() {
  return typeof window !== 'undefined' && window.Capacitor ? window.Capacitor : null;
}

export function isNativeApp() {
  const cap = bridge();
  try { return !!(cap && cap.isNativePlatform && cap.isNativePlatform()); } catch (_) { return false; }
}

export function plugin(name) {
  const cap = bridge();
  if (!cap || !isNativeApp()) return null;
  if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name];
  try { return cap.registerPlugin ? cap.registerPlugin(name) : null; } catch (_) { return null; }
}
