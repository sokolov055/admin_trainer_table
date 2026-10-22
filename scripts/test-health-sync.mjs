/**
 * Данные о здоровье одним окном (FT-708) — настоящий native-steps.js:
 * какой список уходит в системное окно (новая и старая сборка, с галочкой
 * согласия и без), что решение пишется на сервер до первой отправки, что
 * сон, пульс и вес уходят по дням не глубже 30 дней, а пульс тренировок —
 * только с согласием. Подменены только телефон (Health, App, мост) и сеть.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const fake = { platform: 'ios', build: '26', granted: null, requested: null, sent: [], reads: [], data: {}, aggregated: {}, workouts: [], events: [] };
globalThis.__health = fake;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { dispatchEvent: (e) => { fake.events.push(e.type); return true; }, location: { href: 'https://app.example/' } };
globalThis.Event = class { constructor(type) { this.type = type; } };

const stubs = {
  './native-bridge.js': `
    const f = () => globalThis.__health;
    const allowed = (list) => (f().granted ? list.filter((t) => f().granted.includes(t)) : list);
    export const bridge = () => ({ getPlatform: () => f().platform });
    export const isNativeApp = () => true;
    export const plugin = (name) => {
      if (name === 'App') return { getInfo: async () => ({ version: '1.7', build: f().build }) };
      if (name !== 'Health') return null;
      return {
        isAvailable: async () => ({ available: true }),
        checkAuthorization: async (o) => ({ readAuthorized: allowed(o.read) }),
        requestAuthorization: async (o) => { f().requested = o.read; return { readAuthorized: allowed(o.read) }; },
        readSamples: async (o) => { f().reads.push(o); return { samples: f().data[o.dataType] || [] }; },
        queryAggregated: async (o) => { f().reads.push(o); return { samples: (f().aggregated[o.dataType] || (() => []))(o) }; },
        queryWorkouts: async () => ({ workouts: f().workouts }),
      };
    };`,
  './api.js': `
    export const apiMutate = async (op, params, opts) => {
      globalThis.__health.sent.push({ op, params, quiet: !!(opts && opts.quiet) });
      if (op === 'health.daily.sync') return globalThis.__health.dailyAnswer || { saved: params.days.length };
      return { saved: 1 };
    };
    export const apiPrimary = async () => ({});`,
  './version.js': `export const APP_VERSION = 'test';`,
};

const dir = mkdtempSync(join(tmpdir(), 'health-sync-test-'));
const out = join(dir, 'native-steps.mjs');
await build({
  entryPoints: ['src/native-steps.js'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(native-bridge|api|version)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
});
const h = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const reset = () => {
  store.clear();
  Object.assign(fake, { granted: null, requested: null, sent: [], reads: [], data: {}, aggregated: {}, workouts: [], events: [], dailyAnswer: null });
};
const ops = () => fake.sent.map((s) => s.op);
const iso = (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
const key = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('iPhone 26 с галочкой: одно окно на всё, решение full+согласие уходит до отправки данных', async () => {
  reset();
  fake.platform = 'ios';
  fake.build = '26';
  fake.data.sleep = [{ startDate: iso(1, 23), endDate: iso(0, 7), value: 480, sleepState: 'asleep', stages: [{ stage: 'asleep', durationMinutes: 480 }] }];
  fake.aggregated.steps = () => [{ startDate: iso(0, 0), value: 5000 }];
  assert.equal(await h.deviceHealthScope(), 'full');
  const res = await h.connectHealth({ consent: true });
  assert.equal(res.scope, 'full');
  for (const t of ['steps', 'workouts', 'sleep', 'restingHeartRate', 'heartRateVariability', 'heartRate', 'weight', 'bodyFat', 'height', 'vo2Max', 'calories']) {
    assert.ok(fake.requested.includes(t), t);
  }
  const set = fake.sent.find((s) => s.op === 'health.access.set');
  assert.deepEqual(set.params, { decision: 'granted', scope: 'full', consent: true, device: 'ios' });
  assert.ok(ops().indexOf('health.access.set') < ops().indexOf('health.daily.sync'), 'сначала согласие, потом данные');
  assert.equal(res.daily, 'ok');
  assert.equal(h.healthDailyOn(), true);
  const daily = fake.sent.find((s) => s.op === 'health.daily.sync');
  assert.deepEqual(daily.params.days, [{ date: key(0), sleepMin: 480 }]);
  assert.equal(daily.params.source, 'healthkit');
  assert.equal(daily.quiet, true, 'фоновая запись не будит все экраны');
  assert.ok(fake.events.includes(h.HEALTH_SENT));
});

test('без галочки — только шаги и тренировки, решение granted+basic без согласия, сон не читаем', async () => {
  reset();
  fake.platform = 'ios';
  fake.build = '26';
  const res = await h.connectHealth({ consent: false });
  assert.equal(res.scope, 'basic');
  assert.deepEqual(fake.requested, ['steps', 'workouts']);
  assert.deepEqual(fake.sent.find((s) => s.op === 'health.access.set').params, { decision: 'granted', scope: 'basic', device: 'ios' });
  assert.equal(h.healthDailyOn(), false);
  assert.ok(!ops().includes('health.daily.sync'));
  assert.equal(h.healthFullAsked(), true, 'на полном устройстве показали — из-за basic второй раз не спросим');
});

test('старая сборка (Android 10) и галочка: окно как раньше, scope basic', async () => {
  reset();
  fake.platform = 'android';
  fake.build = '10';
  const res = await h.connectHealth({ consent: true });
  assert.equal(res.scope, 'basic');
  assert.deepEqual(fake.requested, ['steps', 'workouts', 'calories', 'totalCalories', 'distance']);
  assert.equal(h.healthFullAsked(), false);
  assert.equal(await h.healthAskNeeded({ decision: 'granted', scope: 'basic' }), '', 'на старой сборке нечего спрашивать');
  fake.build = '11';
  assert.equal(await h.healthAskNeeded({ decision: 'granted', scope: 'basic' }), 'full', 'обновился — спросить ещё раз');
  assert.equal(await h.healthAskNeeded({ decision: 'declined', scope: 'basic' }), '');
});

test('Android 11: по дням — пульс покоя, ккал, вес, % жира; выключенный в окне тип не читаем; не глубже 30 дней', async () => {
  reset();
  fake.platform = 'android';
  fake.build = '11';
  // В системном окне человек выключил сон
  fake.granted = ['steps', 'workouts', 'calories', 'totalCalories', 'distance', 'restingHeartRate', 'heartRateVariability', 'heartRate', 'weight', 'bodyFat', 'height', 'vo2Max'];
  fake.aggregated.restingHeartRate = () => [{ startDate: iso(1, 0), value: 58.4, values: { average: 58.4 } }];
  fake.aggregated.calories = () => [{ startDate: iso(0, 0), value: 412.6, values: { sum: 412.6 } }];
  fake.data.totalCalories = [
    { startDate: iso(0, 1), value: 900, sourceId: 'watch' }, { startDate: iso(0, 9), value: 800, sourceId: 'watch' },
    { startDate: iso(0, 9), value: 1500, sourceId: 'phone' },
  ];
  fake.data.weight = [{ startDate: iso(2, 7), value: 77.42 }, { startDate: iso(2, 21), value: 77.9 }];
  fake.data.bodyFat = [{ startDate: iso(2, 7), value: 21.36 }];
  fake.data.height = [{ startDate: iso(20, 9), value: 181 }, { startDate: iso(3, 9), value: 182.2 }];
  const res = await h.connectHealth({ consent: true });
  assert.equal(res.daily, 'ok');
  const daily = fake.sent.find((s) => s.op === 'health.daily.sync').params;
  assert.deepEqual(daily.days, [
    { date: key(2), weightKg: 77.9, bodyFatPct: 21.4 },
    { date: key(1), restingHr: 58 },
    { date: key(0), activeKcal: 413, totalKcal: 1700 },
  ]);
  assert.equal(daily.heightCm, 182);
  assert.equal(daily.source, 'health-connect');
  assert.ok(!fake.reads.some((r) => r.dataType === 'sleep'), 'сон не выдан — не читаем');
  const oldest = Math.min(...fake.reads.filter((r) => r.startDate).map((r) => Date.parse(r.startDate)));
  assert.ok(Date.now() - oldest <= 30 * 86400000, 'старше 30 дней Health Connect без отдельного разрешения не даёт');
});

test('сервер без действующего согласия ничего не пишет — так и говорим', async () => {
  reset();
  fake.platform = 'ios';
  fake.build = '26';
  store.set('native_health_on_v1', '1');
  fake.data.weight = [{ startDate: iso(0, 7), value: 77 }];
  fake.dailyAnswer = { saved: 0, skipped: 'no-consent' };
  const res = await h.syncHealthDaily(true);
  assert.equal(res.reason, 'no-consent');
  assert.ok(!fake.events.includes(h.HEALTH_SENT));
  assert.equal((await h.syncHealthDaily()).reason, 'recent', 'пауза между отправками — как у шагов');
});

test('пульс тренировок: с данными о здоровье — средний и максимальный, без — не читаем; отключение не трогает шаги', async () => {
  reset();
  fake.platform = 'ios';
  fake.build = '26';
  store.set('native_workouts_on_v1', '1');
  store.set('native_steps_on_v1', '1');
  fake.workouts = [
    { platformId: 'W1', workoutType: 'running', startDate: iso(2, 8), endDate: iso(2, 9), duration: 3600 },
    { platformId: 'W2', workoutType: 'walking', startDate: iso(3, 8), endDate: iso(3, 9), duration: 3600 },
  ];
  fake.aggregated.heartRate = (o) => (o.startDate === fake.workouts[0].startDate ? [{ value: 141, values: { average: 141.4, max: 174 } }] : []);
  await h.syncWorkouts(true);
  let sent = fake.sent.at(-1).params.workouts;
  assert.equal(sent[0].hrAvg, undefined, 'без согласия пульс не читаем');
  assert.ok(!fake.reads.some((r) => r.dataType === 'heartRate'));

  store.set('native_health_on_v1', '1');
  await h.syncWorkouts(true);
  sent = fake.sent.at(-1).params.workouts;
  assert.deepEqual([sent[0].hrAvg, sent[0].hrMax], [141, 174]);
  assert.equal(sent[1].hrAvg, undefined, 'пульса нет — поля нет');
  const asked = fake.reads.filter((r) => r.dataType === 'heartRate').length;
  await h.syncWorkouts(true);
  assert.equal(fake.reads.filter((r) => r.dataType === 'heartRate').length, asked, 'прочитанное помним');
  assert.equal(fake.sent.at(-1).params.workouts[0].hrMax, 174);

  h.disconnectHealth();
  assert.equal(h.healthDailyOn(), false);
  assert.equal(store.get('native_steps_on_v1'), '1', 'шаги не трогаем');
  assert.equal(store.get('native_workouts_on_v1'), '1', 'тренировки не трогаем');
});
