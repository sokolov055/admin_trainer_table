import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

/**
 * FT-507, 20.10.2026: с мобильного интернета залп из 5–6 одновременных
 * соединений к серверу «замерзает» у фильтра оператора, одиночное проходит.
 * Поэтому, пока соединение не подтверждено ответом, запросы идут по одному;
 * после ответа — все сразу; после обрыва — снова по одному.
 */

const store = new Map();
globalThis.localStorage = new Proxy({
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : Reflect.getOwnPropertyDescriptor(t, k)),
});
globalThis.window = globalThis.window || { location: { search: '', href: 'https://x/' }, addEventListener() {} };
globalThis.document = globalThis.document || { baseURI: 'https://x/' };

// Каждый запрос висит, пока тест не ответит ему сам: так видно, сколько их
// в полёте одновременно
const open = [];        // { action, resolve, fail }
const started = [];     // порядок отправки
globalThis.fetch = (url, init = {}) => {
  if (String(url).includes('config.json')) return Promise.resolve({ ok: false, json: async () => null });
  const body = init.body ? JSON.parse(init.body) : {};
  started.push(body.action);
  return new Promise((resolve, reject) => {
    const entry = {
      action: body.action,
      resolve: () => resolve({ ok: true, json: async () => ({ ok: true, data: { fresh: body.action } }) }),
      fail: () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); },
    };
    open.push(entry);
    if (init.signal) init.signal.addEventListener('abort', entry.fail);
  });
};

const output = await build({ entryPoints: ['src/api.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
  define: { 'import.meta.env.VITE_MOCK': '"0"', 'import.meta.env.VITE_API_URL': '"https://api.test/"', 'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false' } });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { api, apiWait } = mod.exports;

const settle = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const answer = (i = 0) => { const e = open.splice(i, 1)[0]; e.resolve(); return settle(); };

test('холодный старт: первый запрос один, остальные — после его ответа и сразу все', async () => {
  started.length = 0;
  const p = Promise.all([api('a.one', {}, { fresh: true }), api('a.two', {}, { fresh: true }), api('a.three', {}, { fresh: true })]);
  await settle();
  assert.deepEqual(started, ['a.one'], 'залпа нет: открывает один');
  await answer();
  assert.deepEqual(started, ['a.one', 'a.two', 'a.three'], 'соединение открыто — остальные пошли вместе');
  await answer(); await answer();
  assert.equal((await p).length, 3);

  started.length = 0;
  const q = Promise.all([api('b.one', {}, { fresh: true }), api('b.two', {}, { fresh: true })]);
  await settle();
  assert.deepEqual(started, ['b.one', 'b.two'], 'дальше — параллельно, без очереди');
  await answer(); await answer();
  await q;
});

test('обрыв закрывает очередь: после него снова по одному', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  started.length = 0;
  const hung = api('c.hung', {}, { fresh: true }).then(() => null, (e) => e);
  await settle();
  // Чтение: 6 с и повтор, 14 с и отказ — оба висят
  for (let ms = 0; ms < 21000; ms += 1000) { t.mock.timers.tick(1000); await settle(1); }
  const err = await hung;
  assert.match(String(err && err.message), /не отвечает/);
  assert.deepEqual(started, ['c.hung', 'c.hung'], 'две попытки чтения, как раньше');
  open.length = 0;
  t.mock.timers.reset();

  started.length = 0;
  const p = Promise.all([api('d.one', {}, { fresh: true }), api('d.two', {}, { fresh: true })]);
  await settle();
  assert.deepEqual(started, ['d.one'], 'после обрыва — снова по одному');
  await answer();
  assert.deepEqual(started, ['d.one', 'd.two']);
  await answer();
  await p;
});

test('долгое ожидание (workout.wait) не ведёт остальных за собой', async () => {
  // Соединение открыто после предыдущего теста; закрываем его обрывом
  started.length = 0;
  const lost = api('e.lost', {}, { fresh: true }).then(() => null, (e) => e);
  await settle();
  // Обрываем каждую попытку (в тихом режиме она одна, иначе две)
  while (open.length) { open.shift().fail(); await settle(); }
  await lost;

  started.length = 0;
  const w = apiWait('workout.wait', {}, 25000).then(() => null, (e) => e);
  const r = api('f.read', {}, { fresh: true });
  await settle();
  assert.deepEqual(started, ['workout.wait', 'f.read'], 'ожидание не держит чтение в очереди');
  await answer(1);
  await answer(0);
  await r; await w;
});
