/**
 * telegram.js — всё, что мы знаем о среде Telegram, в одном месте.
 *
 * Главное решение здесь: подпись читается НЕ через SDK.
 *
 * Официальный telegram-web-app.js тянется с telegram.org, а доступ к этому
 * домену бывает ограничен провайдером. Тогда скрипт молча не загружается,
 * window.Telegram остаётся пустым, и приложение считает, что его открыли
 * вне мессенджера — хотя человек нажал кнопку в боте.
 *
 * При этом Telegram передаёт всё необходимое прямо в адресе страницы,
 * во фрагменте после решётки: tgWebAppData (та самая подпись),
 * tgWebAppThemeParams, tgWebAppPlatform, tgWebAppVersion. Это часть
 * протокола мини-приложений, а не обходной путь. Читаем оттуда, а SDK
 * используем как necessary-приятное дополнение, когда он доступен:
 * развернуть окно, отключить свайп, вибрация.
 *
 * Фрагмент живёт недолго — при первой же навигации внутри приложения он
 * теряется, поэтому разобранные параметры сразу складываются в
 * sessionStorage.
 */

const STORAGE_KEY = 'tg_init_params_v1';

/** Разобранные параметры запуска: читаются один раз при загрузке модуля */
const launchParams = readLaunchParams();

export function tg() {
  return typeof window !== 'undefined' && window.Telegram ? window.Telegram.WebApp : null;
}

/**
 * Параметры запуска из фрагмента адреса, с запасным вариантом из
 * sessionStorage: фрагмент пропадает после навигации, а данные нужны
 * на протяжении всей сессии.
 */
function readLaunchParams() {
  if (typeof window === 'undefined') return {};

  let fromHash = {};
  try {
    // Строку перехватывает inline-скрипт в index.html: к моменту, когда
    // выполняется этот модуль, SDK уже мог вычистить адрес.
    const raw = window.__tgLaunchHash
      || sessionStorage.getItem('tg_launch_hash')
      || window.location.hash
      || '';

    const hash = String(raw).replace(/^#/, '');
    if (hash) {
      const params = new URLSearchParams(hash);
      params.forEach((value, key) => {
        if (key.indexOf('tgWebApp') === 0) fromHash[key] = value;
      });
    }
  } catch (_) {
    fromHash = {};
  }

  if (Object.keys(fromHash).length > 0) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromHash)); } catch (_) {}
    return fromHash;
  }

  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (_) {}

  return {};
}

export function isInsideTelegram() {
  return !!getInitData();
}

/**
 * initData — подписанная строка, которую проверяет сервер. Никогда не
 * разбираем её здесь для принятия решений: роль и доступ определяет
 * только бэкенд, фронт лишь передаёт строку дальше.
 *
 * Порядок источников: сначала фрагмент адреса (работает всегда, когда
 * приложение запущено из Telegram), затем SDK, затем подстановка для
 * локальной разработки.
 */
export function getInitData() {
  if (launchParams.tgWebAppData) return launchParams.tgWebAppData;

  const app = tg();
  if (app && app.initData) return app.initData;

  return import.meta.env.VITE_DEV_INIT_DATA || '';
}

/** Готовим окно: раскрыть на всю высоту и сообщить Telegram, что мы готовы */
export function initTelegramUi() {
  applyTheme();

  const app = tg();
  if (!app) return; // без SDK окно просто останется как есть — это не мешает работе

  try { app.ready(); } catch (_) {}
  try { app.expand(); } catch (_) {}

  // Telegram 7.7+ — отключаем свайп вниз, иначе прокрутка длинных таблиц
  // то и дело схлопывает приложение
  try { if (app.disableVerticalSwipes) app.disableVerticalSwipes(); } catch (_) {}

  try { app.onEvent('themeChanged', () => applyTheme()); } catch (_) {}
}

/**
 * Переносим тему Telegram в CSS-переменные.
 *
 * Свои цвета не выбрасываем: переменные Telegram подставляются как
 * значение, наши — как запасное. Параметры темы тоже приезжают во
 * фрагменте адреса, поэтому тема работает и без SDK.
 */
function applyTheme() {
  if (typeof document === 'undefined') return;

  const app = tg();
  let params = (app && app.themeParams) || null;

  if (!params && launchParams.tgWebAppThemeParams) {
    try { params = JSON.parse(launchParams.tgWebAppThemeParams); } catch (_) { params = null; }
  }

  const root = document.documentElement;

  if (params) {
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
  }

  const scheme = (app && app.colorScheme)
    || (params && isDarkColor(params.bg_color) ? 'dark' : null)
    || null;

  if (scheme) root.setAttribute('data-theme', scheme === 'dark' ? 'dark' : 'light');
}

/** Светлый или тёмный фон прислал Telegram — по яркости цвета */
function isDarkColor(hex) {
  if (!hex) return false;
  const h = String(hex).replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return false;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

/** Тактильный отклик — мелочь, но приложение перестаёт ощущаться
 *  веб-страницей внутри мессенджера. Без SDK просто не срабатывает. */
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

/**
 * Срез того, что видно про среду запуска. Нужен для экрана «откройте через
 * Telegram»: без него непонятно, то ли приложение открыли обычной ссылкой,
 * то ли SDK не загрузился, то ли Telegram не передал подпись.
 */
export function environmentInfo() {
  const app = tg();
  const initData = getInitData();

  return {
    sdkLoaded: !!app,
    platform: launchParams.tgWebAppPlatform || (app && app.platform) || '—',
    version: launchParams.tgWebAppVersion || (app && app.version) || '—',
    initDataLength: initData ? initData.length : 0,
    fromHash: !!launchParams.tgWebAppData,
    hasLaunchParams: Object.keys(launchParams).length > 0,
  };
}

/** Короткий вывод: почему подписи нет */
export function diagnoseMissingInitData(info) {
  if (!info.hasLaunchParams) {
    return 'Страница открыта по прямой ссылке, а не из бота. Telegram передаёт подпись ' +
      'только при запуске через кнопку мини-приложения.';
  }
  if (!info.initDataLength) {
    return 'Telegram запустил приложение, но подпись не пришла. Помогает полностью ' +
      'закрыть приложение и открыть заново из бота.';
  }
  return '';
}
