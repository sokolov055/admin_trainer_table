/**
 * Где именно открыто приложение.
 *
 * Нужно ровно для одного вопроса: можно ли отсюда поставить приложение на
 * телефон. Ссылку тренер шлёт в Telegram, а Telegram открывает её у себя
 * внутри — во встроенном браузере, из которого иконку на рабочий стол не
 * поставить никак. Человек листает кабинет, закрывает Telegram и больше
 * приложение не находит.
 *
 * Правила у систем разные, и это не прихоть:
 *
 * iOS — «На экран „Домой“» есть ТОЛЬКО в Safari. Ни Chrome, ни Яндекс,
 * ни встроенный браузер Telegram такого пункта не имеют: все они обёртки
 * над WKWebView, и добавить оттуда можно разве что закладку. Поэтому на
 * iOS всё, кроме Safari, — тупик, и разговор об этом честнее начать сразу.
 *
 * Android — установку умеют все настоящие браузеры: Chrome, Samsung
 * Internet, Edge, Яндекс. Тупик здесь один — встроенный WebView, в котором
 * Telegram и открывает ссылки. Его и отсекаем, а выбор браузера оставляем
 * человеку: гнать в Chrome того, кто живёт в Samsung Internet, значит
 * чинить несуществующую поломку.
 *
 * Определяем по двум признакам, потому что одного не хватает.
 *
 * `navigator.standalone` — свойство, которое заводит только Safari: в
 * обычной вкладке `false`, в приложении с рабочего стола `true`. В любом
 * WKWebView, то есть и в Chrome для iOS, и во встроенном браузере
 * Telegram, его нет вовсе. Это и отличает Safari от всего остального.
 *
 * Строка `; wv)` в User-Agent — признак системного WebView на Android.
 * Настоящий браузер её не ставит.
 */

const IOS_OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|YaApp|DuckDuckGo/i;

export function detectBrowser(options = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};

  const ua = options.userAgent !== undefined ? options.userAgent : (nav.userAgent || '');
  const standalone = options.standalone !== undefined ? options.standalone : nav.standalone;
  const touches = options.maxTouchPoints !== undefined ? options.maxTouchPoints : (nav.maxTouchPoints || 0);

  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touches > 1);
  const android = /Android/i.test(ua);

  if (ios) {
    // Установленное приложение — уже цель пути, дальше вести некуда
    if (standalone === true) return frame('ios', 'installed');
    if (IOS_OTHER_BROWSERS.test(ua)) return frame('ios', 'other-browser');
    if (standalone === undefined) return frame('ios', 'webview');
    return frame('ios', 'ok');
  }

  if (android) {
    return frame('android', /;\s*wv\)/i.test(ua) ? 'webview' : 'ok');
  }

  // Компьютер и всё незнакомое: ставить на рабочий стол там или незачем,
  // или само собой разумеется. Мешать не надо.
  return frame('other', 'ok');
}

function frame(platform, kind) {
  return {
    platform,
    kind,
    /** Отсюда приложение на телефон не поставить */
    deadEnd: kind === 'webview' || kind === 'other-browser',
  };
}

/**
 * Адрес, которым Android выходит из встроенного браузера в настоящий.
 *
 * `intent://` — системная схема: WebView не открывает такое сам, а отдаёт
 * Android, и тот запускает браузер. `browser_fallback_url` — на случай,
 * когда Chrome не установлен: тогда откроется обычная ссылка, и человек
 * хотя бы попадёт в кабинет.
 *
 * Схема указывается отдельным полем и убирается из самого адреса — так
 * требует формат: `intent://host/path?query#Intent;scheme=https;…;end`.
 */
export function androidBrowserUrl(href, pkg = 'com.android.chrome') {
  let url;
  try {
    url = new URL(href);
  } catch (_) {
    return '';
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';

  const scheme = url.protocol.replace(':', '');
  const rest = url.host + url.pathname + url.search;

  return 'intent://' + rest + '#Intent'
    + ';scheme=' + scheme
    + ';package=' + pkg
    + ';S.browser_fallback_url=' + encodeURIComponent(url.href)
    + ';end';
}

/**
 * Копирование ссылки — запасной путь для тех, у кого меню браузера
 * выглядит иначе, чем на картинке. Открыть Safari руками и вставить адрес
 * умеет каждый; отказ буфера обмена поэтому не ошибка, а «сделайте сами».
 */
export async function copyCurrentLink(options = {}) {
  const href = options.href || (typeof window !== 'undefined' ? window.location.href : '');
  const clip = options.clipboard
    || (typeof navigator !== 'undefined' ? navigator.clipboard : null);

  if (!href || !clip || !clip.writeText) return false;

  try {
    await clip.writeText(href);
    return true;
  } catch (_) {
    return false;
  }
}
