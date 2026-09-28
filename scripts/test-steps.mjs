/**
 * Шаги с телефона: «Проверить ещё раз» говорит, что произошло.
 *
 * 28.09.2026 кнопка молчала при любом исходе: ошибку глотала, пустой ответ
 * «Здоровья» не отличала от успеха. На iPhone без доступа к шагам HealthKit
 * отдаёт пустые или нулевые дни и не сообщает, что чтение запрещено, — и
 * экран бесконечно писал «подключены, но телефон пока не передал».
 *
 * Здесь настоящий native-steps.js: подменены только телефон (Health, мост
 * Capacitor) и сеть.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const fake = { platform: 'ios', samples: [], authorized: true, sent: [], fail: null };
globalThis.__steps = fake;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { dispatchEvent: () => true, location: { href: 'https://app.example/' } };
globalThis.Event = class { constructor(type) { this.type = type; } };

const stubs = {
  './native-bridge.js': `
    const f = () => globalThis.__steps;
    export const bridge = () => ({ getPlatform: () => f().platform });
    export const isNativeApp = () => true;
    export const iosApp = () => f().platform === 'ios';
    export const plugin = (name) => name !== 'Health' ? null : ({
      isAvailable: async () => ({ available: true }),
      checkAuthorization: async () => ({ readAuthorized: f().authorized ? ['steps'] : [] }),
      requestAuthorization: async () => ({ readAuthorized: f().authorized ? ['steps'] : [] }),
      queryAggregated: async () => ({ samples: f().samples }),
      queryWorkouts: async (o) => { f().workoutQuery = o; return { workouts: f().workouts || [] }; },
      openHealthConnectSettings: async () => { f().opened = (f().opened || 0) + 1; },
    });`,
  './api.js': `
    export const apiMutate = async (op, params) => {
      if (globalThis.__steps.fail) throw new Error(globalThis.__steps.fail);
      globalThis.__steps.sent.push({ op, params });
      return { saved: (params.days || params.workouts).length };
    };
    export const apiPrimary = async () => ({});`,
  './version.js': `export const APP_VERSION = 'test';`,
};

const dir = mkdtempSync(join(tmpdir(), 'steps-test-'));
const out = join(dir, 'native-steps.mjs');
await build({
  entryPoints: ['src/native-steps.js'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(native-bridge|api|version)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
});
const steps = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const day = (n, value) => ({ startDate: new Date(Date.now() - n * 86400000).toISOString(), value });

test('iPhone без доступа отдаёт нули — «пусто», в прогресс нули не уходят', async () => {
  fake.samples = [day(0, 0), day(1, 0), day(2, 0)];
  const res = await steps.connectSteps();
  assert.equal(res.ok, true);
  assert.equal(res.reason, 'empty');
  assert.equal(res.sent, 0);
  assert.equal(fake.sent.length, 0);
});

test('шаги есть — уходят на сервер, кнопка знает сколько дней', async () => {
  fake.samples = [day(0, 5120), day(1, 0), day(2, 8034)];
  const res = await steps.syncSteps(true);
  assert.deepEqual([res.reason, res.sent], ['ok', 3]);
  assert.equal(fake.sent.at(-1).op, 'steps.sync');
  assert.equal(fake.sent.at(-1).params.source, 'healthkit');
});

test('ошибка сети не глотается — её покажет кнопка', async () => {
  fake.fail = 'Нет связи';
  await assert.rejects(steps.syncSteps(true), /Нет связи/);
  fake.fail = null;
});

test('Android без разрешения — «не выдан», а не молчание', async () => {
  fake.platform = 'android';
  fake.authorized = false;
  const res = await steps.syncSteps(true);
  assert.deepEqual([res.sent, res.reason], [0, 'denied']);
});

test('не подключали на этом телефоне — «выключено»', async () => {
  steps.disconnectSteps();
  const res = await steps.syncSteps(true);
  assert.equal(res.reason, 'off');
});

test('«Открыть „Здоровье“»: iPhone — ссылкой в «Здоровье», Android — настройки Health Connect', async () => {
  fake.platform = 'ios';
  assert.equal(await steps.openHealthSettings(), true);
  assert.equal(window.location.href, 'x-apple-health://');
  fake.platform = 'android';
  assert.equal(await steps.openHealthSettings(), true);
  assert.equal(fake.opened, 1);
});

test('тренировки с часов: не подключали — не читаем; подключили — уходят на сервер', async () => {
  fake.platform = 'ios';
  fake.authorized = true;
  assert.equal((await steps.syncWorkouts(true)).reason, 'off');
  fake.workouts = [{
    platformId: 'W1', workoutType: 'traditionalStrengthTraining', startDate: new Date(Date.now() - 3600000).toISOString(),
    endDate: new Date().toISOString(), duration: 3600, totalEnergyBurned: 400, sourceName: 'Apple Watch', metadata: { x: 'лишнее' },
  }];
  const res = await steps.connectWorkouts();
  assert.deepEqual([res.ok, res.sent], [true, 1]);
  const last = fake.sent.at(-1);
  assert.equal(last.op, 'health.workouts.sync');
  assert.equal(last.params.workouts[0].platformId, 'W1');
  assert.equal(last.params.workouts[0].metadata, undefined, 'лишнего с часов не шлём');
  assert.ok(Date.now() - Date.parse(fake.workoutQuery.startDate) >= 29 * 86400000, 'за месяц');
  assert.equal((await steps.syncWorkouts()).reason, 'recent');
});

test('тренировки на Android пока не подключаются', async () => {
  fake.platform = 'android';
  const res = await steps.connectWorkouts();
  assert.equal(res.ok, false);
  assert.match(res.reason, /iPhone/);
  fake.platform = 'ios';
});
