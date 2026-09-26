/**
 * Подключение сервис-воркера.
 *
 * Правила кеширования живут в `public/sw.js`, здесь только регистрация —
 * и она намеренно скучная: ошибка регистрации не должна мешать работе.
 * Воркер ускоряет запуск, но приложение без него исправно, поэтому любой
 * отказ (старый браузер, приватный режим, запрет на хранение) проглатываем
 * молча. Ронять кабинет из-за неудавшегося ускорения — обмен не в ту
 * сторону.
 *
 * В разработке не регистрируем: воркер держал бы старую оболочку поверх
 * горячей перезагрузки Vite, и правки переставали бы доезжать до экрана.
 */
export function startOffline(options = {}) {
  const nav = options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const enabled = options.enabled !== undefined ? options.enabled : import.meta.env.PROD;
  const base = options.baseURI || (typeof document !== 'undefined' ? document.baseURI : '');

  if (!enabled || !nav || !nav.serviceWorker || !base) return false;
  // Внутри приложения (mobile/) оболочку держит само приложение, а на
  // iPhone воркер и не работает — адрес там не https
  if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform
    && window.Capacitor.isNativePlatform()) return false;

  // Адрес считается от базового, а не от текущей страницы: у приложения
  // она бывает с «?access=…», и относительный путь от неё увёл бы область
  // действия воркера не туда.
  let url;
  try {
    url = new URL('sw.js', base).href;
  } catch (_) {
    return false;
  }

  const register = () => {
    nav.serviceWorker.register(url).catch(() => {});
  };

  listenForUpdate(nav, options);

  // После загрузки страницы, а не во время: регистрация соревнуется за сеть
  // с бандлом и данными первого экрана, а выигрыш от неё — на СЛЕДУЮЩЕМ
  // запуске. Торопиться ей некуда.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('load', register, { once: true });
  } else {
    register();
  }

  return true;
}

/**
 * «Приложение обновилось» — и перезагрузка, если человек только что вошёл.
 *
 * Воркер отдаёт оболочку из кеша, поэтому первый запуск после выкладки
 * показывает прежнюю версию: новая встаёт со следующего. Обычно это
 * незаметно, но у того, кто сам ждёт правку, выглядит так, будто её не
 * выложили.
 *
 * Перезагружаемся только в первую минуту после открытия: там человек ещё
 * смотрит на первый экран, и обновление для него — мигание. Дальше он уже
 * что-то делает — ведёт тренировку, заполняет анкету, — и выдёргивать
 * страницу из-под него ради свежей версии нельзя. Ему она достанется на
 * следующем запуске, как и раньше.
 */
const RELOAD_WINDOW_MS = 60000;

// Человек уже что-то делает — касался экрана, листал, печатал. Тогда
// перезагрузка — это мигание посреди прокрутки, и её не будет даже в
// первую минуту.
let touched = false;
if (typeof window !== 'undefined' && window.addEventListener) {
  const mark = () => { touched = true; };
  ['touchstart', 'pointerdown', 'scroll', 'keydown'].forEach((type) => {
    window.addEventListener(type, mark, { once: true, passive: true, capture: true });
  });
}

function listenForUpdate(nav, options) {
  const reload = options.reload || (() => {
    if (typeof location !== 'undefined' && location.reload) location.reload();
  });
  const since = options.openedFor || (() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const busy = options.interacted || (() => touched);

  if (!nav.serviceWorker.addEventListener) return;

  let done = false;

  nav.serviceWorker.addEventListener('message', (event) => {
    if (done) return;
    if (!event || !event.data || event.data.type !== 'shell-updated') return;
    if (since() > RELOAD_WINDOW_MS || busy()) return;

    done = true;
    reload();
  });

  // Слушателя, поставленного через addEventListener, браузер держит на
  // паузе, пока его не попросят начать: без этого сообщение воркера
  // копится в очереди и не приходит никогда.
  if (nav.serviceWorker.startMessages) nav.serviceWorker.startMessages();
}
