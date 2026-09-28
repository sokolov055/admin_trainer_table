/**
 * Конец отдыха — уведомление, которое ставит телефон (native-rest.js).
 *
 * 28.09.2026: на iPhone оно приходило беззвучным — без звука iOS не
 * вибрирует, а Apple Watch не стучит по руке. Здесь настоящий
 * native-rest.js, подменены только мост Capacitor и плагин уведомлений.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const fake = { platform: 'ios', scheduled: [] };
globalThis.__rest = fake;
globalThis.window = { Capacitor: { getPlatform: () => fake.platform } };

const stub = `
  const f = () => globalThis.__rest;
  export const isNativeApp = () => true;
  export const plugin = (name) => name !== 'LocalNotifications' ? null : ({
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    cancel: async () => {},
    schedule: async (o) => { f().scheduled.push(...o.notifications); },
  });`;

const dir = mkdtempSync(join(tmpdir(), 'rest-test-'));
const out = join(dir, 'native-rest.mjs');
await build({
  entryPoints: ['src/native-rest.js'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/native-bridge\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
  } }],
});
const rest = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('iPhone: конец отдыха со звуком — значит с вибрацией и тапом на часах', async () => {
  assert.equal(await rest.scheduleRestEnd(Date.now() + 90000), true);
  const n = fake.scheduled.at(-1);
  assert.equal(n.sound, 'default');
  assert.equal(n.interruptionLevel, 'timeSensitive');
});

test('Android: звук берётся из канала, лишнего не передаём', async () => {
  fake.platform = 'android';
  assert.equal(await rest.scheduleRestEnd(Date.now() + 90000), true);
  assert.equal(fake.scheduled.at(-1).sound, undefined);
});
