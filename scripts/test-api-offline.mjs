import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

/**
 * Без связи — последнее, что знали, а не «сервер не отвечает».
 *
 * 27.09.2026 iPhone в авиарежиме открыл кабинет пустым экраном ошибки:
 * кэш старше 12 часов считался негодным, а любая запись (подход,
 * оплата) стирала его целиком. Теперь запись только помечает кэш
 * устаревшим, а без связи годится и вчерашнее.
 */

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  key: (i) => [...store.keys()][i],
  get length() { return store.size; },
};
// Object.keys(localStorage) в api.js перебирает ключи хранилища
globalThis.localStorage = new Proxy(globalThis.localStorage, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)),
});
globalThis.window = globalThis.window || { location: { search: '', href: 'https://x/' }, addEventListener() {} };
globalThis.document = globalThis.document || { baseURI: 'https://x/' };

let online = true;
const served = [];
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('config.json')) return { ok: false, json: async () => null };
  if (!online) throw new TypeError('Network request failed');
  const body = init.body ? JSON.parse(init.body) : {};
  served.push(body.action);
  const data = body.action === 'me' ? { role: 'client', name: 'Анна' } : { ok: true };
  return { ok: true, json: async () => ({ ok: true, data }) };
};

// Как в соседних тестах: собираем esbuild — api.js читает import.meta.env Vite
const output = await build({ entryPoints: ['src/api.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
  define: { 'import.meta.env.VITE_MOCK': '"0"', 'import.meta.env.VITE_API_URL': '"https://api.test/"', 'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false' } });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { api, apiMutate } = mod.exports;

test('после записи и без связи кабинет открывается на последнем известном', async () => {
  const fresh = await api('me', {}, { fresh: true });
  assert.equal(fresh.name, 'Анна');

  await apiMutate('workout.save', { id: 'x' });
  const kept = [...store.keys()].find((k) => k.includes('me|'));
  assert.ok(kept, 'запись не стёрла кэш «кто я»');
  assert.equal(JSON.parse(store.get(kept)).dirty, true, 'а только пометила устаревшим');

  online = false;
  const offline = await api('me', {}, { fresh: true });
  assert.equal(offline.name, 'Анна', 'без связи — последнее известное, не ошибка');
});

test('без связи годится и вчерашнее (старше 12 часов)', async () => {
  const key = [...store.keys()].find((k) => k.includes('me|'));
  const parsed = JSON.parse(store.get(key));
  store.set(key, JSON.stringify({ ...parsed, at: Date.now() - 20 * 3600 * 1000 }));
  online = false;
  const offline = await api('me', {}, { fresh: true });
  assert.equal(offline.name, 'Анна');
});

test('чего никогда не читали — без связи честная ошибка', async () => {
  online = false;
  await assert.rejects(api('client.plan', { month: 'нет' }, { fresh: true }), /не отвечает/);
});

test('сервер молчит — через 20 с отказ «не отвечает», а не вечное ожидание; GET не повторяем', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const seen = [];
  const saved = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => {
    seen.push(init.method || 'GET');
    if (String(url).includes('config.json')) return Promise.resolve({ ok: false, json: async () => null });
    return new Promise((_, reject) => {
      if (init.signal) init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
  };
  try {
    // Итог ловим сразу: отказ приходит раньше, чем до него дойдёт проверка
    const pending = api('workout.list', {}, { fresh: true }).then(() => null, (e) => e);
    await Promise.resolve();
    for (let i = 0; i < 5; i += 1) { t.mock.timers.tick(5000); await new Promise((r) => setImmediate(r)); }
    const error = await pending;
    assert.match(String(error && error.message), /не отвечает/);
    assert.equal(seen.filter((m) => m === 'GET').length, 0, 'после таймаута запрос не повторяется GET-ом');
  } finally {
    globalThis.fetch = saved;
  }
});
