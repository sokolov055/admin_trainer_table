/**
 * Проверка правил сервис-воркера.
 *
 * Ошибка здесь дороже обычной: воркер живёт в браузере клиента и переживает
 * перезагрузку страницы. Отдал не тот ответ на открытие приложения — человек
 * видит белый экран и не может это починить, а тренер узнаёт об этом звонком.
 * Отдал из кеша ответ сервера — человек видит вчерашний баланс и верит ему.
 *
 * Поэтому воркер запускается здесь по-настоящему: файл исполняется в
 * песочнице с поддельными `caches`, `fetch` и `self`, а тест дёргает те же
 * события, что дёргал бы браузер.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '..', 'public', 'sw.js'), 'utf8');

const SCOPE = 'https://sokolov055.github.io/admin_trainer_table/';
const INDEX = SCOPE + 'index.html';

/* ==========================================================================
 * Песочница
 * ========================================================================== */

function makeResponse(body, { ok = true } = {}) {
  return {
    body,
    ok,
    async text() { return body; },
    clone() { return makeResponse(body, { ok }); },
  };
}

function makeCache() {
  const store = new Map();
  return {
    store,
    async match(key) { return store.get(keyOf(key)) || undefined; },
    async put(key, value) { store.set(keyOf(key), value); },
  };
}

function keyOf(key) {
  return typeof key === 'string' ? key : key.url;
}

function makeRequest(url, { mode = 'no-cors', method = 'GET' } = {}) {
  return { url, mode, method };
}

/**
 * Запускает sw.js и возвращает ручки управления.
 *
 * `network` — карта «адрес → ответ»; отсутствующий адрес означает обрыв
 * связи, ровно как в метро.
 */
function boot({ network = new Map(), cached = new Map(), extraCaches = [] } = {}) {
  const listeners = {};
  const cache = makeCache();
  cached.forEach((value, key) => cache.store.set(key, value));

  const cacheNames = ['shell-v1', ...extraCaches];
  const deleted = [];
  const asked = [];
  let claimed = false;
  let skipped = false;

  const posted = [];
  const pages = [{ postMessage: (message) => posted.push(message) }];

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    Promise,
    Error,
    Response: { error: () => makeResponse(null, { ok: false }) },
    self: {
      location: { origin: 'https://sokolov055.github.io' },
      registration: { scope: SCOPE },
      skipWaiting() { skipped = true; },
      clients: {
        claim: async () => { claimed = true; },
        matchAll: async () => pages,
      },
      addEventListener(type, fn) { listeners[type] = fn; },
    },
    caches: {
      open: async () => cache,
      keys: async () => cacheNames,
      delete: async (name) => { deleted.push(name); return true; },
    },
    fetch: async (input) => {
      const url = keyOf(input);
      asked.push(url);
      if (!network.has(url)) throw new Error('сети нет');
      return network.get(url);
    },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);

  return {
    listeners, cache, deleted, asked, posted,
    isClaimed: () => claimed, isSkipped: () => skipped,
  };
}

/** Даёт фоновому обновлению доработать: ответ человеку уходит раньше него */
async function settle() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

/** Дёргает событие fetch и возвращает ответ, либо null, если воркер не вмешался */
async function handle(worker, request) {
  let answer = null;
  const event = {
    request,
    respondWith(value) { answer = value; },
    waitUntil() {},
  };
  worker.listeners.fetch(event);
  return answer ? await answer : null;
}

/* ==========================================================================
 * Чужое не трогаем
 * ========================================================================== */

test('ответы сервера API воркер не перехватывает', async () => {
  const worker = boot();
  const answer = await handle(
    worker,
    makeRequest('https://194-58-102-135.nip.io/?action=me', { mode: 'cors' })
  );

  assert.equal(answer, null, 'запрос к API должен уйти в сеть мимо воркера');
  assert.equal(worker.cache.store.size, 0, 'данные клиента в кеш не попадают');
});

test('запись не перехватывается', async () => {
  const worker = boot();
  const answer = await handle(worker, makeRequest(SCOPE + 'config.json', { method: 'POST' }));
  assert.equal(answer, null);
});

/* ==========================================================================
 * Открытие приложения
 * ========================================================================== */

test('запуск берёт оболочку из кеша и не ждёт сеть', async () => {
  const shell = makeResponse('старая оболочка');
  const worker = boot({
    cached: new Map([[INDEX, shell]]),
    network: new Map([[INDEX, makeResponse('новая оболочка')]]),
  });

  const answer = await handle(worker, makeRequest(SCOPE, { mode: 'navigate' }));

  assert.equal(answer.body, 'старая оболочка', 'ответ приходит из кеша');
});

test('персональная ссылка не заводит в кеше свою копию оболочки', async () => {
  const shell = makeResponse('оболочка');
  const worker = boot({ cached: new Map([[INDEX, shell]]) });

  const answer = await handle(
    worker,
    makeRequest(SCOPE + '?access=1gwqD9rPoXGIXoAocSx1rw2gnesZ', { mode: 'navigate' })
  );

  assert.equal(answer.body, 'оболочка');
  assert.deepEqual([...worker.cache.store.keys()], [INDEX], 'ключ в кеше один, без токена');
});

test('без кеша запуск идёт в сеть и запоминает оболочку', async () => {
  const worker = boot({ network: new Map([[INDEX, makeResponse('оболочка')]]) });

  const answer = await handle(worker, makeRequest(SCOPE, { mode: 'navigate' }));

  assert.equal(answer.body, 'оболочка');
  assert.ok(worker.cache.store.has(INDEX), 'оболочка сохранена на следующий запуск');
});

test('первый запуск без сети не притворяется работающим', async () => {
  const worker = boot();
  const answer = await handle(worker, makeRequest(SCOPE, { mode: 'navigate' }));
  assert.equal(answer.ok, false);
});

/* ==========================================================================
 * Выложенная правка
 *
 * Оболочка отдаётся из кеша, поэтому свежая версия по умолчанию доезжает
 * до человека только на следующий запуск. Для того, кто ждёт свою правку,
 * это выглядит как «не выложили», и воркер обязан сказать странице, что
 * оболочка сменилась. Сказать — именно про смену: слово на каждый запуск
 * означало бы перезагрузку на каждый запуск.
 * ========================================================================== */

test('о новой оболочке страница узнаёт', async () => {
  const worker = boot({
    cached: new Map([[INDEX, makeResponse('старая оболочка')]]),
    network: new Map([[INDEX, makeResponse('новая оболочка')]]),
  });

  await handle(worker, makeRequest(SCOPE, { mode: 'navigate' }));
  await settle();

  // Сравниваем текстом: объект родился внутри песочницы, и его прототип
  // не тот же самый, что здесь, — deepEqual на это ругается.
  assert.equal(JSON.stringify(worker.posted), JSON.stringify([{ type: 'shell-updated' }]));
  assert.equal(worker.cache.store.get(INDEX).body, 'новая оболочка', 'новая легла в кеш');
});

test('о прежней оболочке страницу не беспокоят', async () => {
  const worker = boot({
    cached: new Map([[INDEX, makeResponse('оболочка')]]),
    network: new Map([[INDEX, makeResponse('оболочка')]]),
  });

  await handle(worker, makeRequest(SCOPE, { mode: 'navigate' }));
  await settle();

  assert.deepEqual(worker.posted, [], 'выкладки не было — перезагружать нечего');
});

test('обрыв связи при проверке обновления ничего не ломает', async () => {
  const worker = boot({ cached: new Map([[INDEX, makeResponse('оболочка')]]) });

  const answer = await handle(worker, makeRequest(SCOPE, { mode: 'navigate' }));
  await settle();

  assert.equal(answer.body, 'оболочка', 'приложение открылось');
  assert.deepEqual(worker.posted, []);
  assert.equal(worker.cache.store.get(INDEX).body, 'оболочка', 'кеш цел');
});

/* ==========================================================================
 * Статика и настройки
 * ========================================================================== */

test('файл сборки с хешем в имени берётся из кеша без похода в сеть', async () => {
  const asset = SCOPE + 'assets/index-r7dj79tQ.js';
  const worker = boot({ cached: new Map([[asset, makeResponse('бандл')]]) });

  const answer = await handle(worker, makeRequest(asset));

  assert.equal(answer.body, 'бандл');
  assert.deepEqual(worker.asked, [], 'сеть не спрашивали вовсе');
});

test('config.json спрашивает сеть первым: это переключатель адреса API', async () => {
  const url = SCOPE + 'config.json';
  const worker = boot({
    cached: new Map([[url, makeResponse('{"apiUrl":"старый"}')]]),
    network: new Map([[url, makeResponse('{"apiUrl":"новый"}')]]),
  });

  const answer = await handle(worker, makeRequest(url));

  assert.equal(answer.body, '{"apiUrl":"новый"}', 'свежий адрес важнее быстрого');
});

test('config.json без сети отдаётся из кеша', async () => {
  const url = SCOPE + 'config.json';
  const worker = boot({ cached: new Map([[url, makeResponse('{"apiUrl":"старый"}')]]) });

  const answer = await handle(worker, makeRequest(url));

  assert.equal(answer.body, '{"apiUrl":"старый"}');
});

/* ==========================================================================
 * Обновление
 * ========================================================================== */

test('новая версия выбрасывает кеши прежних версий и забирает управление', async () => {
  const worker = boot({ extraCaches: ['shell-v0', 'что-то-постороннее'] });

  let done;
  worker.listeners.activate({ waitUntil: (promise) => { done = promise; } });
  await done;

  assert.deepEqual(worker.deleted.sort(), ['shell-v0', 'что-то-постороннее'].sort());
  assert.ok(worker.isClaimed(), 'воркер берёт на себя уже открытые вкладки');
});

test('установка не ждёт закрытия старых вкладок', async () => {
  const worker = boot();
  worker.listeners.install({ waitUntil: () => {} });
  assert.ok(worker.isSkipped());
});

/* ==========================================================================
 * Сторона страницы
 *
 * Воркер только сообщает, что оболочка сменилась. Решает страница, и
 * решение у неё одно важное: не выдёргивать себя из-под человека. Момент
 * «только что открыл» — это мигание; момент «ведёт тренировку» — потерянный
 * подход и непонятно что с ним случилось.
 * ========================================================================== */

const { startOffline } = await import('../src/offline.js');

/** Поддельный navigator: собирает слушателей и говорит, просили ли очередь */
function makeNavigator() {
  const handlers = {};
  let started = false;

  return {
    started: () => started,
    send: (data) => (handlers.message || (() => {}))({ data }),
    serviceWorker: {
      register: async () => ({}),
      addEventListener(type, fn) { handlers[type] = fn; },
      startMessages() { started = true; },
    },
  };
}

test('сразу после запуска страница берёт новую версию', () => {
  const nav = makeNavigator();
  let reloaded = 0;

  startOffline({
    enabled: true, navigator: nav, baseURI: SCOPE,
    openedFor: () => 1500, reload: () => { reloaded += 1; },
  });

  assert.ok(nav.started(), 'очередь сообщений включена, иначе слово воркера не придёт');
  nav.send({ type: 'shell-updated' });

  assert.equal(reloaded, 1);
});

test('во время работы страница себя не перезагружает', () => {
  const nav = makeNavigator();
  let reloaded = 0;

  startOffline({
    enabled: true, navigator: nav, baseURI: SCOPE,
    openedFor: () => 20 * 60 * 1000, reload: () => { reloaded += 1; },
  });

  nav.send({ type: 'shell-updated' });

  assert.equal(reloaded, 0, 'человек что-то делает — версия подождёт до следующего запуска');
});

test('перезагрузка случается один раз', () => {
  const nav = makeNavigator();
  let reloaded = 0;

  startOffline({
    enabled: true, navigator: nav, baseURI: SCOPE,
    openedFor: () => 0, reload: () => { reloaded += 1; },
  });

  nav.send({ type: 'shell-updated' });
  nav.send({ type: 'shell-updated' });

  assert.equal(reloaded, 1);
});

test('чужое сообщение страницу не трогает', () => {
  const nav = makeNavigator();
  let reloaded = 0;

  startOffline({
    enabled: true, navigator: nav, baseURI: SCOPE,
    openedFor: () => 0, reload: () => { reloaded += 1; },
  });

  nav.send({ type: 'что-то ещё' });
  nav.send(null);

  assert.equal(reloaded, 0);
});
