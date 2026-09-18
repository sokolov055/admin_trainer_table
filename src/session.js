/**
 * session.js — вход, который не зависит от Telegram.
 *
 * Внутри мессенджера личность подтверждает сам Telegram: он присылает
 * подписанную строку при каждом запуске, и хранить на устройстве нечего.
 * Но с иконки на рабочем столе приложение запускается само по себе,
 * подписи там взяться неоткуда — и тогда работает второй способ: человек
 * один раз подтверждает вход у бота, сервер выдаёт ключ, и дальше
 * приложение живёт с ним (server/src/lib/sessions.js).
 *
 * Здесь только хранение этого ключа и оповещение о его смене. Всё, что
 * связано с получением, — в LoginScreen.jsx.
 *
 * ВАЖНО ПРО ХРАНИЛИЩЕ. В вебвью и в приватном режиме обращение к
 * localStorage бросает исключение НА САМОМ ОБРАЩЕНИИ к свойству, а не при
 * записи. Поэтому каждое касание хранилища обёрнуто, а значение
 * дублируется в памяти: даже если запомнить не удалось, вход доживёт до
 * конца запуска, а не сломается на первом же запросе.
 */

const TOKEN_KEY = 'auth_token_v1';
const PENDING_KEY = 'auth_pending_v1';

let token = readToken();

/** Кому сообщить, что вход появился или закончился */
const listeners = new Set();

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function getToken() {
  return token;
}

export function hasToken() {
  return !!token;
}

export function setToken(value) {
  token = String(value || '');
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (_) {}
  listeners.forEach((fn) => fn(token));
}

export function clearToken() {
  setToken('');
}

/**
 * Подписка на смену входа.
 *
 * Нужна ровно для одного случая: сервер отказал по устаревшему ключу,
 * api.js его выбросил — и корень приложения должен сам вернуться на экран
 * входа, не дожидаясь, пока человек нажмёт «Обновить».
 */
export function onTokenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ==========================================================================
 * Незаконченный вход
 * ========================================================================== */

/**
 * Код, подтверждения которого мы ждём.
 *
 * Хранится между запусками, потому что подтверждение уводит человека в
 * Telegram — а приложение с рабочего стола система вправе выгрузить из
 * памяти, пока его не видно. Без этого возврат означал бы новый код и
 * ещё один заход к боту.
 */
export function readPendingLogin() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw);
    if (!saved || !saved.code || !saved.link) return null;
    if (!saved.expiresAt || new Date(saved.expiresAt).getTime() <= Date.now()) return null;

    return saved;
  } catch (_) {
    return null;
  }
}

export function writePendingLogin(value) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch (_) {}
}

export function clearPendingLogin() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (_) {}
}

/* ==========================================================================
 * Устройство
 * ========================================================================== */

/** Запущено ли приложение с иконки на рабочем столе, а не во вкладке */
export function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    // iOS до сих пор сообщает об этом собственным свойством, а не
    // медиазапросом — на старых версиях без него режим не определить
    return window.navigator.standalone === true;
  } catch (_) {
    return false;
  }
}

/**
 * Короткое описание устройства — его увидит человек в списке своих входов.
 * Разбор строки браузера здесь уместен: точность не нужна, нужна подпись
 * вроде «iPhone, с рабочего стола», по которой узнаёшь своё устройство.
 */
export function describeDevice() {
  let ua = '';
  try { ua = navigator.userAgent || ''; } catch (_) {}

  const os = /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /Android/i.test(ua) ? 'Android'
    : /Macintosh/i.test(ua) ? 'Mac'
    : /Windows/i.test(ua) ? 'Windows'
    : '';

  const home = isStandalone();

  // Устройство не опознано — не выдумываем: «Неизвестный браузер, браузер»
  // хуже, чем честное «этот браузер»
  if (!os) return home ? 'С рабочего стола' : 'Этот браузер';

  return os + (home ? ', с рабочего стола' : ', браузер');
}
