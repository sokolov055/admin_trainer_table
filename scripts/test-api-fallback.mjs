import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

/**
 * Запасной адрес API (27.09.2026: api.fitness100.ru, запасной — прежний
 * nip.io того же сервера). Основной не соединился — идём на запасной, в
 * том числе за тренировками: это тот же сервер. Не дождались ответа — не
 * идём: запрос мог дойти, и повтор записи задвоил бы её.
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

let mode = 'refused';
const hosts = [];
globalThis.fetch = (url, init = {}) => {
  if (String(url).includes('config.json')) {
    return Promise.resolve({ ok: true, json: async () => ({ apiUrl: 'https://api.primary.test', fallbackUrl: 'https://spare.test' }) });
  }
  hosts.push(new URL(url).host);
  if (String(url).includes('primary')) {
    if (mode === 'refused') return Promise.reject(new TypeError('getaddrinfo ENOTFOUND'));
    return new Promise((_, reject) => init.signal && init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); }));
  }
  return Promise.resolve({ ok: true, json: async () => ({ ok: true, data: { from: 'spare' } }) });
};

const output = await build({ entryPoints: ['src/api.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
  define: { 'import.meta.env.VITE_MOCK': '"0"', 'import.meta.env.VITE_API_URL': '""', 'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false' } });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { api, apiMutate } = mod.exports;

test('основной не соединился — тренировки и остальное через запасной', async () => {
  mode = 'refused'; hosts.length = 0;
  const res = await api('workout.list', {}, { fresh: true });
  assert.equal(res.from, 'spare');
  assert.deepEqual([...new Set(hosts)], ['api.primary.test', 'spare.test']);
});

test('основной не ответил за 20 с — на запасной не идём, запись не задваивается', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  mode = 'silent'; hosts.length = 0;
  const pending = apiMutate('payment.create', { clientRow: 3, price: 2000, count: 1 }).then(() => null, (e) => e);
  await Promise.resolve();
  for (let i = 0; i < 5; i += 1) { t.mock.timers.tick(5000); await new Promise((r) => setImmediate(r)); }
  const error = await pending;
  assert.match(String(error && error.message), /не отвечает/);
  assert.ok(!hosts.includes('spare.test'), 'оплата не ушла второй раз на запасной адрес');
});
