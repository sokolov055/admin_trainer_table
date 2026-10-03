/**
 * Шаги и тренировки с Huawei без Google (03.10.2026).
 *
 * Health Connect на таком телефоне не ставится — native-steps.js берёт
 * модуль HuaweiHealth (APK 1.4 (7)). Проверяем, что источник выбирается
 * сам, шаги уходят с source 'huawei-health', а история — не дальше недели,
 * как в заявке Huawei. Телефон с Health Connect Huawei не трогает.
 *
 * Выбор источника запоминается на запуск, поэтому каждый телефон — своя
 * сборка модуля.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { dispatchEvent: () => true, location: { href: 'https://app.example/' } };
globalThis.Event = class { constructor(type) { this.type = type; } };

function phone(name) {
  return `
    const f = () => globalThis.${name};
    const fake = (kind) => ({
      isAvailable: async () => ({ available: f()[kind] }),
      checkAuthorization: async (o) => ({ readAuthorized: o.read }),
      requestAuthorization: async (o) => { f().asked = kind; return { readAuthorized: o.read }; },
      queryAggregated: async (o) => { f().stepsFrom = o.startDate; f().read = kind; return { samples: [{ startDate: new Date().toISOString(), value: 4200 }] }; },
      queryWorkouts: async (o) => { f().workoutsFrom = o.startDate; return { workouts: [{ platformId: 'w1', workoutType: 'running', startDate: o.startDate, endDate: o.endDate, duration: 600, sourceName: 'Huawei Health' }] }; },
    });
    export const bridge = () => ({ getPlatform: () => 'android' });
    export const isNativeApp = () => true;
    export const plugin = (n) => n === 'Health' ? fake('hc') : n === 'HuaweiHealth' ? fake('huawei') : null;`;
}

async function load(name) {
  const stubs = {
    './native-bridge.js': phone(name),
    './api.js': `
      export const apiMutate = async (op, params) => { globalThis.${name}.sent.push({ op, params }); return {}; };
      export const apiPrimary = async () => ({});`,
    './version.js': `export const APP_VERSION = 'test';`,
  };
  const dir = mkdtempSync(join(tmpdir(), 'steps-huawei-'));
  const out = join(dir, `${name}.mjs`);
  await build({
    entryPoints: ['src/native-steps.js'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^\.\/(native-bridge|api|version)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
    } }],
  });
  test.after(() => rmSync(dir, { recursive: true, force: true }));
  return import(pathToFileURL(out).href);
}

const daysAgo = (iso) => Math.round((Date.now() - new Date(iso).getTime()) / 86400000);

test('Huawei без Google: шаги из Huawei Health, source huawei-health, не дальше недели', async () => {
  store.clear();
  globalThis.__hw = { hc: false, huawei: true, sent: [] };
  const steps = await load('__hw');
  const res = await steps.connectSteps();
  assert.equal(res.ok, true);
  assert.equal(__hw.asked, 'huawei');
  assert.equal(__hw.read, 'huawei');
  assert.equal(steps.onHuawei(), true);
  assert.equal(steps.healthHub(), 'Huawei Health');
  assert.ok(daysAgo(__hw.stepsFrom) <= 7, 'шаги — за неделю');
  assert.equal(__hw.sent[0].op, 'steps.sync');
  assert.equal(__hw.sent[0].params.source, 'huawei-health');

  steps.noteAppBuild({ build: 7 });
  const w = await steps.connectWorkouts();
  assert.equal(w.ok, true);
  assert.ok(daysAgo(__hw.workoutsFrom) <= 7, 'тренировки — за неделю');
  assert.equal(__hw.sent.at(-1).op, 'health.workouts.sync');
});

test('телефон с Health Connect Huawei не трогает', async () => {
  store.clear();
  globalThis.__hc = { hc: true, huawei: true, sent: [] };
  const steps = await load('__hc');
  await steps.connectSteps();
  assert.equal(__hc.read, 'hc');
  assert.equal(steps.onHuawei(), false);
  assert.equal(__hc.sent[0].params.source, 'health-connect');
  assert.ok(daysAgo(__hc.stepsFrom) >= 29, 'Health Connect — за месяц, как раньше');
});

test('нет ни Health Connect, ни сервисов Huawei — шагов нет, как раньше', async () => {
  store.clear();
  globalThis.__none = { hc: false, huawei: false, sent: [] };
  const steps = await load('__none');
  const avail = await steps.stepsAvailability();
  assert.equal(avail.available, false);
  assert.equal(steps.onHuawei(), false);
});
