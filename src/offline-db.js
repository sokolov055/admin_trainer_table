/**
 * Хранилище на телефоне для работы без сети (FT-566).
 *
 * localStorage для этого мал и хрупок: пять мегабайт на всё, синхронная
 * запись, и при переполнении api.js выбрасывает свой кеш целиком. Здесь —
 * то, что терять нельзя или что крупно: неотправленные занятия, история за
 * три месяца целиком, видео упражнений программы. IndexedDB есть во всех
 * трёх местах, где живёт приложение: в браузере, в WebView Android и в
 * WKWebView iPhone.
 *
 * Хранилища:
 *   outbox   — занятия, ещё не подтверждённые сервером (workout-outbox.js);
 *   sessions — занятия с сервера за 90 дней, целиком;
 *   media    — видео упражнений: Blob по адресу;
 *   meta     — мелочи: когда что обновляли.
 *
 * Ключи outbox и sessions начинаются с аккаунта (offline-account.js):
 * один телефон — разные люди, и чужие записи не видны и не отправляются.
 *
 * Ошибка записи не проглатывается: вызывающий обязан сказать человеку, что
 * сохранить на телефоне не вышло, а не обещать сохранение (FT-566,
 * «обязательные правила»).
 */

const NAME = 'fittrack-offline';
const VERSION = 1;
export const STORES = ['outbox', 'sessions', 'media', 'meta'];

let opening = null;

function idb() {
  return typeof indexedDB !== 'undefined' ? indexedDB : null;
}

/** Ключи с префиксом: от prefix до prefix + последний символ */
function prefixRange(prefix) {
  return typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.bound(prefix, prefix + '￿') : null;
}

export function offlineDbAvailable() {
  return !!idb();
}

function open() {
  if (opening) return opening;
  const source = idb();
  if (!source) return Promise.reject(new Error('Хранилище телефона недоступно.'));
  opening = new Promise((resolve, reject) => {
    let req;
    try {
      req = source.open(NAME, VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((name) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name); });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Другая вкладка подняла версию — закрываемся, чтобы не мешать ей;
      // следующий вызов откроет базу заново
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Хранилище телефона недоступно.'));
    req.onblocked = () => reject(new Error('Хранилище телефона занято другой вкладкой.'));
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

function run(store, mode, work) {
  return open().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(store, mode);
    } catch (error) {
      // База закрылась под нами (versionchange) — один раз переоткрываем
      opening = null;
      reject(error);
      return;
    }
    const os = tx.objectStore(store);
    let result;
    Promise.resolve(work(os, (value) => { result = value; }))
      .catch((error) => { try { tx.abort(); } catch (_) {} reject(error); });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Не удалось записать на телефон.'));
    tx.onabort = () => reject(tx.error || new Error('Не удалось записать на телефон.'));
  }));
}

const request = (req, done) => { req.onsuccess = () => done(req.result); };

export function dbGet(store, key) {
  return run(store, 'readonly', (os, done) => request(os.get(key), done));
}

export function dbPut(store, key, value) {
  return run(store, 'readwrite', (os) => { os.put(value, key); });
}

export function dbDelete(store, key) {
  return run(store, 'readwrite', (os) => { os.delete(key); });
}

/** Все записи с ключом, начинающимся с prefix: [{ key, value }] */
export function dbList(store, prefix) {
  return run(store, 'readonly', (os, done) => {
    const out = [];
    const req = os.openCursor(prefixRange(prefix));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { done(out); return; }
      if (String(cursor.key).indexOf(prefix) === 0) out.push({ key: cursor.key, value: cursor.value });
      cursor.continue();
    };
  });
}

/** Заменить все записи с префиксом на новые — одной транзакцией */
export function dbReplace(store, prefix, entries) {
  return run(store, 'readwrite', (os) => new Promise((resolve) => {
    const req = os.openCursor(prefixRange(prefix));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (String(cursor.key).indexOf(prefix) === 0) cursor.delete();
        cursor.continue();
        return;
      }
      entries.forEach(({ key, value }) => os.put(value, key));
      resolve();
    };
  }));
}

/** Стереть всё с префиксом (выход из аккаунта) */
export function dbClear(store, prefix) {
  return dbReplace(store, prefix, []);
}

/**
 * Попросить браузер не вычищать хранилище при нехватке места. Chrome
 * обычно соглашается для установленного приложения; отказ не мешает
 * работе — просто данные не защищены от вычистки.
 */
export function askPersistent() {
  try {
    const storage = typeof navigator !== 'undefined' && navigator.storage;
    if (storage && storage.persist) return storage.persist().catch(() => false);
  } catch (_) {}
  return Promise.resolve(false);
}
