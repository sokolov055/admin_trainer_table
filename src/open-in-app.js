/**
 * Перенести открытый кабинет в Android-приложение — одной кнопкой.
 *
 * Человек уже вошёл в браузере (по персональной ссылке, из Telegram).
 * Сервер выдаёт одноразовый билет на 15 минут — тот же «мост установки»,
 * что переносит вход в приложение на iPhone (auth.install.create), — и
 * страница открывает приложение адресом с этим билетом. Приложение само
 * обменивает билет на свой вход (native.js → #loginTicket=), и человек
 * оказывается в том же кабинете, ничего не вставляя.
 *
 * Адрес — intent:// с пакетом приложения: и Chrome, и браузер внутри
 * Telegram отдают его Android, а тот — приложению. Приложения нет —
 * Android идёт по запасному адресу, и начинается скачивание APK.
 *
 * Билет едет в строке запроса (?loginTicket=): часть после # в intent://
 * занята самим intent. Сеть его не видит — адрес открывает приложение, а
 * оно до загрузки переносит билет за решётку.
 */
import { apiPrimary } from './api.js';
import { getToken } from './session.js';
import { detectBrowser, ANDROID_APP_PACKAGE } from './browser.js';

export const ANDROID_APK_URL = 'https://raw.githubusercontent.com/sokolov055/admin_trainer_table/main/public/android/fit-track.apk';

/** Показывать ли «Открыть в приложении»: Android, браузер (не само приложение), вход есть */
export function canOpenInApp(options = {}) {
  const where = options.where || detectBrowser();
  const token = options.token !== undefined ? options.token : getToken();
  return where.platform === 'android' && where.kind !== 'installed' && !!token;
}

/**
 * Стоит ли приложение на телефоне. Умеет только Chrome на Android
 * (getInstalledRelatedApps): сайт называет приложение в манифесте
 * (related_applications), приложение называет сайт (asset_statements в
 * mobile/customize.py) — только тогда Chrome отвечает. В браузере Telegram
 * и прочих — null: «не знаю», а не «не стоит».
 */
export async function appInstalled() {
  try {
    if (typeof navigator === 'undefined' || !navigator.getInstalledRelatedApps) return null;
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some((app) => app.id === ANDROID_APP_PACKAGE);
  } catch (_) {
    return null;
  }
}

export function appIntentUrl(ticket, href) {
  const url = new URL('./', href);
  url.search = '?loginTicket=' + encodeURIComponent(ticket);
  const scheme = url.protocol.replace(':', '');
  return 'intent://' + url.host + url.pathname + url.search + '#Intent'
    + ';scheme=' + scheme
    + ';package=' + ANDROID_APP_PACKAGE
    + ';S.browser_fallback_url=' + encodeURIComponent(ANDROID_APK_URL)
    + ';end';
}

/**
 * В приложении: билет из строки запроса — за решётку, где его ждёт вход
 * (readLoginTicket). Нет билета — адрес как был.
 */
export function ticketToHash(href) {
  const url = new URL(href);
  const ticket = url.searchParams.get('loginTicket');
  if (!ticket) return url.href;
  url.searchParams.delete('loginTicket');
  url.hash = 'loginTicket=' + encodeURIComponent(ticket);
  return url.href;
}

/**
 * Ссылка, пришедшая в приложение, — в адрес его собственной страницы.
 * fittrack://open?access=… (iPhone: из Safari по кнопке) и адрес сайта
 * (когда экраны вшиты в приложение и живут на capacitor://localhost)
 * переносят только своё — строку запроса и часть после решётки — на
 * страницу приложения. Билет входа при этом уходит за решётку.
 */
export const APP_SCHEME = 'fittrack';

export function localLink(href, hereHref) {
  let url;
  try { url = new URL(href); } catch (_) { return ''; }
  const here = new URL(hereHref);
  const base = new URL('./', here.href);
  const site = url.protocol === 'https:' && url.host === 'sokolov055.github.io' && url.pathname.startsWith('/admin_trainer_table');
  if (url.protocol === APP_SCHEME + ':' || (site && here.origin !== url.origin)) {
    return ticketToHash(new URL(url.search + url.hash, base).href);
  }
  return ticketToHash(url.href);
}

export async function openInApp(options = {}) {
  const request = options.request || apiPrimary;
  const result = await request('auth.install.create', {});
  if (!result || !result.ticket) throw new Error('Сервер не выдал билет для входа. Попробуйте ещё раз.');
  const target = appIntentUrl(result.ticket, (options.location || window.location).href);
  (options.go || ((href) => { window.location.href = href; }))(target);
  return target;
}
