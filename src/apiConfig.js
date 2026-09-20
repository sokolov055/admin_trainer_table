/**
 * Откуда приложение узнаёт адрес API.
 *
 * Адрес НЕ вшивается при сборке, а лежит в config.json рядом с index.html.
 * Причина простая: переезд с Apps Script на свой сервер и откат обратно
 * должны занимать минуту и не требовать пересборки, секретов в CI и
 * ожидания, пока прокатится деплой. Один файл — один адрес.
 *
 * Адрес API и так виден в собранном приложении, так что публичным файлом
 * мы ничего не раскрываем.
 *
 * Запасной адрес нужен ровно на время переезда: если новый сервер вдруг
 * не отвечает, приложение само возвращается на старый, и клиенты этого
 * не замечают. Когда переезд закончен, поле остаётся пустым.
 */

const CONFIG_PATH = 'config.json';

/** Сколько ждать config.json, прежде чем работать по вшитому адресу */
const CONFIG_TIMEOUT_MS = 3000;

let resolved = null;
let loading = null;

/** Адрес из сборки — запасной вариант, если config.json недоступен */
const BUILT_IN = import.meta.env?.VITE_API_URL || '';

export function currentApiUrl() {
  return resolved?.apiUrl || BUILT_IN;
}

export function currentApiLabel() {
  return resolved?.label || '';
}

export function fallbackApiUrl() {
  return resolved?.fallbackUrl || '';
}

/**
 * Загружает config.json один раз за сессию.
 *
 * Файл лежит на том же домене, что и приложение, поэтому запрос занимает
 * десятки миллисекунд. Если он почему-то не доступен — работаем по адресу
 * из сборки, а не показываем ошибку: отсутствие конфига не должно
 * превращаться в неработающее приложение.
 */
export function loadApiConfig() {
  if (resolved) return Promise.resolve(resolved);
  if (loading) return loading;

  loading = fetchWithTimeout(CONFIG_PATH, CONFIG_TIMEOUT_MS)
    .then((res) => (res.ok ? res.json() : null))
    .then((cfg) => {
      resolved = {
        apiUrl: (cfg && cfg.apiUrl) || BUILT_IN,
        fallbackUrl: (cfg && cfg.fallbackUrl) || '',
        label: (cfg && cfg.label) || '',
      };
      return resolved;
    })
    .catch(() => {
      resolved = { apiUrl: BUILT_IN, fallbackUrl: '', label: 'встроенный' };
      return resolved;
    });

  return loading;
}

function fetchWithTimeout(url, ms) {
  // Приложение не должно зависеть от того, ответит ли хостинг статики:
  // не ответил за три секунды — идём дальше со встроенным адресом
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return fetch(url + '?t=' + Date.now(), {
    signal: controller.signal,
    cache: 'no-store',
  }).finally(() => clearTimeout(timer));
}
