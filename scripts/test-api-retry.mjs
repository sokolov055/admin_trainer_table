import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

/**
 * FT-507, 08.10.2026: с мобильного интернета (T2, «белые списки»)
 * приложение стояло скелетом ровно 20 с. Часть соединений до сервера
 * проходит сразу, часть висит до конца предела. Отсюда два правила:
 * сохранённое показываем сразу любой давности, а чтение после короткого
 * ожидания повторяем новым соединением. Запись не повторяем никогда.
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

// hang — сколько следующих запросов «повиснут» (ответа нет до обрыва)
let hang = 0;
const posts = [];
globalThis.fetch = (url, init = {}) => {
  if (String(url).includes('config.json')) return Promise.resolve({ ok: false, json: async () => null });
  const body = init.body ? JSON.parse(init.body) : {};
  posts.push(body.action);
  if (hang > 0) {
    hang -= 1;
    return new Promise((_, reject) => init.signal && init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }));
  }
  return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { fresh: body.action } }) });
};

const output = await build({ entryPoints: ['src/api.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
  define: { 'import.meta.env.VITE_MOCK': '"0"', 'import.meta.env.VITE_API_URL': '"https://api.test/"', 'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false' } });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { api, apiStale, apiMutate } = mod.exports;

async function drive(t, ms) {
  for (let left = ms; left > 0; left -= 1000) { t.mock.timers.tick(1000); await new Promise((r) => setImmediate(r)); }
}

test('сохранённое вчера и после записи показывается сразу, свежее — следом', async () => {
  store.set('api_cache_v1:client.summary|{}', JSON.stringify({ at: Date.now() - 20 * 3600 * 1000, dirty: true, data: { old: true } }));
  const { data, stale, promise } = apiStale('client.summary', {});
  assert.deepEqual(data, { old: true }, 'не скелет, а то, что знали');
  assert.equal(stale, true);
  assert.deepEqual(await promise, { fresh: 'client.summary' });
});

test('чтение повисло — через 6 с повтор новым соединением, а не ожидание 20 с', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  hang = 1; posts.length = 0;
  let result = null;
  const pending = api('client.plan', {}, { fresh: true }).then((d) => { result = d; });
  await drive(t, 5000);
  assert.equal(result, null, 'первые 5 с ещё ждём');
  await drive(t, 2000);
  await pending;
  assert.deepEqual(result, { fresh: 'client.plan' });
  assert.deepEqual(posts, ['client.plan', 'client.plan']);
});

test('запись повисла — не повторяется, отказ через 20 с', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  hang = 5; posts.length = 0;
  const pending = apiMutate('payment.create', { clientRow: 3, price: 2000 }).then(() => null, (e) => e);
  await drive(t, 21000);
  const error = await pending;
  assert.match(String(error && error.message), /не отвечает/);
  assert.deepEqual(posts, ['payment.create'], 'оплата ушла один раз');
  hang = 0;
});
