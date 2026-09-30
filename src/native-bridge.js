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

/**
 * Приложение для iPhone. Там нет входа через Telegram: сторонний вход по
 * правилам App Store (4.8) требует рядом «Вход с Apple», а у нас хватает
 * своего — персональной ссылки и кода на почту.
 */
export function iosApp() {
  const cap = bridge();
  try { return isNativeApp() && cap.getPlatform && cap.getPlatform() === 'ios'; } catch (_) { return false; }
}

/**
 * Подпись под версией в меню: какой коммит сайта вшит в приложение для
 * iPhone. На сайте и в Android — пусто.
 *
 * Экраны на iPhone меняются только новой сборкой из App Store. До 30.09.2026
 * приложение скачивало их с сайта само (@capgo/capacitor-updater), и Apple
 * отклонила его по правилу 2.5.2: код, меняющий приложение после проверки,
 * запрещён. Не возвращать — ни этот модуль, ни свою загрузку JS с сайта.
 */
export function screensNote() {
  if (typeof window === 'undefined' || window.location.protocol !== 'capacitor:') return '';
  const meta = document.querySelector('meta[name="build-sha"]');
  return ' · экраны ' + ((meta && meta.getAttribute('content')) || '?');
}
