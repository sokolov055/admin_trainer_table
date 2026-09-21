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
