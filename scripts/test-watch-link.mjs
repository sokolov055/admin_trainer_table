/**
 * Ключ входа для Apple Watch (native-watch.js): просим у сервера, только
 * если часы подключены, приложение на них стоит и ключа у них нет.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const fake = { status: { paired: true, installed: true, hasToken: false }, calls: [], token: 'user-token' };
globalThis.__w = fake;
const stubs = {
  './api.js': `export const apiPrimary = async (a) => { globalThis.__w.calls.push(['api', a]); return { token: 'watch-key' }; };`,
  './apiConfig.js': `export const currentApiUrl = () => 'https://api.example/'; export const loadApiConfig = async () => ({});`,
  './session.js': `export const getToken = () => globalThis.__w.token;`,
  './native-bridge.js': `
    const f = () => globalThis.__w;
    export const isNativeApp = () => true;
    export const bridge = () => ({ isPluginAvailable: () => true });
    export const plugin = () => ({
      watchStatus: async () => f().status,
      setWatchAuth: async (o) => { f().calls.push(['set', o]); },
    });`,
};
const dir = mkdtempSync(join(tmpdir(), 'watch-link-'));
const out = join(dir, 'm.mjs');
await build({
  entryPoints: ['src/native-watch.js'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(api|apiConfig|session|native-bridge)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
});
const m = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('часы без ключа — просим у сервера и отдаём часам с адресом API', async () => {
  assert.equal(await m.linkWatch(), true);
  assert.deepEqual(fake.calls, [['api', 'auth.watch.token'], ['set', { token: 'watch-key', api: 'https://api.example/' }]]);
});

test('ключ уже есть, часов нет или не вошли — сервер не трогаем', async () => {
  fake.calls = [];
  fake.status = { paired: true, installed: true, hasToken: true };
  assert.equal(await m.linkWatch(), false);
  fake.status = { paired: false, installed: false, hasToken: false };
  assert.equal(await m.linkWatch(), false);
  fake.status = { paired: true, installed: true, hasToken: false };
  fake.token = '';
  assert.equal(await m.linkWatch(), false);
  assert.deepEqual(fake.calls, []);
});
