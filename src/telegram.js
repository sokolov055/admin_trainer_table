/**
 * telegram.js — всё, что мы знаем о среде Telegram, в одном месте.
 *
 * Приложение должно открываться и вне Telegram (при разработке в браузере),
 * поэтому каждый вызов SDK защищён: нет window.Telegram — работаем дальше,
 * просто без initData и без нативной темы.
 */

export function tg() {
  return typeof window !== 'undefined' && window.Telegram ? window.Telegram.WebApp : null;
}

export function isInsideTelegram() {
  const app = tg();
  return !!(app && app.initData);
}

/**
 * initData — подписанная строка, которую проверяет сервер. Никогда не
 * разбираем её здесь для принятия решений: роль и доступ определяет только
 * бэкенд, фронт лишь передаёт строку дальше.
 *
 * При локальной разработке подставляется VITE_DEV_INIT_DATA — реальная
 * строка, скопированная из Telegram. Работает, пока она не протухла (сутки).
 */
export function getInitData() {
  const app = tg();
  if (app && app.initData) return app.initData;
  return import.meta.env.VITE_DEV_INIT_DATA || '';
}

/** Готовим окно: раскрыть на всю высоту и сообщить Telegram, что мы готовы */
export function initTelegramUi() {
  const app = tg();
  if (!app) return;

  try { app.ready(); } catch (_) {}
  try { app.expand(); } catch (_) {}

  // Telegram 7.7+ — отключаем свайп вниз, иначе прокрутка длинных таблиц
  // то и дело схлопывает приложение
  try { if (app.disableVerticalSwipes) app.disableVerticalSwipes(); } catch (_) {}

  applyTheme(app);
  try { app.onEvent('themeChanged', () => applyTheme(app)); } catch (_) {}
}

/**
 * Переносим тему Telegram в CSS-переменные.
 *
 * Свои цвета мы не выбрасываем: переменные Telegram подставляются как
 * значение, а наши — как запасное. Так приложение выглядит «родным» внутри
 * мессенджера и остаётся читаемым в обычном браузере, где тем нет вовсе.
 */
function applyTheme(app) {
  const root = document.documentElement;
  const params = (app && app.themeParams) || {};

  const map = {
    '--tg-bg': params.bg_color,
    '--tg-text': params.text_color,
    '--tg-hint': params.hint_color,
    '--tg-link': params.link_color,
    '--tg-button': params.button_color,
    '--tg-button-text': params.button_text_color,
    '--tg-secondary-bg': params.secondary_bg_color,
    '--tg-section-bg': params.section_bg_color,
    '--tg-header-bg': params.header_bg_color,
  };

  Object.keys(map).forEach((key) => {
    if (map[key]) root.style.setProperty(key, map[key]);
  });

  const scheme = (app && app.colorScheme) || 'light';
  root.setAttribute('data-theme', scheme === 'dark' ? 'dark' : 'light');
}

/** Тактильный отклик на переключение вкладок — мелочь, но приложение
 *  сразу перестаёт ощущаться веб-страницей внутри мессенджера */
export function haptic(type = 'light') {
  const app = tg();
  try {
    if (app && app.HapticFeedback) app.HapticFeedback.impactOccurred(type);
  } catch (_) {}
}

export function closeApp() {
  const app = tg();
  try { if (app) app.close(); } catch (_) {}
}
