/**
 * Плашка тренировки на экране блокировки iPhone (native-activity.js):
 * что уходит в приложение из черновика занятия. Настоящий модуль, подменён
 * только мост Capacitor.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const fake = { calls: [], available: true };
globalThis.document = { documentElement: { getAttribute: () => fake.theme || null } };
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.__la = fake;
const stub = `
  const f = () => globalThis.__la;
  export const isNativeApp = () => true;
  export const bridge = () => ({ isPluginAvailable: (n) => n === 'WorkoutActivity' && f().available });
  export const plugin = () => ({
    update: async (p) => { f().calls.push(['update', p]); return { shown: true }; },
    end: async () => { f().calls.push(['end']); },
    takePending: async () => { const r = f().pending || {}; f().pending = null; return r; },
  });`;

const dir = mkdtempSync(join(tmpdir(), 'activity-test-'));
const out = join(dir, 'native-activity.mjs');
await build({
  entryPoints: ['src/native-activity.js'], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/native-bridge\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
  } }],
});
const la = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const set = (state, weight = '60', reps = '8', extra = {}) => ({ state, weight, reps, rpe: '', kind: 'work', ...extra });
const record = (session, tick = 1_000_000_000_000) => ({ tick, session: {
  id: 's1', title: 'Верх', status: 'active', elapsedMs: 600000, restUntil: 0,
  exercises: [
    { id: 'e1', name: 'Жим лёжа', sets: [set('done'), set('pending', '62.5'), set('pending')] },
    { id: 'e2', name: 'Тяга', sets: [set('pending', '', '12')] },
  ],
  ...session,
} });

test('упражнение, подход, вес и секундомер — с первого неотмеченного подхода', () => {
  const p = la.activityPayload(record({}));
  assert.equal(p.exercise, 'Жим лёжа');
  assert.equal(p.detail, 'Подход 2 из 3');
  assert.deepEqual([p.weight, p.reps, p.exerciseId, p.amount], ['62.5', '8', 'e1', ''], 'вес отдельно — его меняют кнопки');
  assert.deepEqual([p.done, p.total], [1, 4]);
  assert.equal(p.startedAt, 1_000_000_000_000 - 600000, 'от начала без пауз');
  assert.equal(p.pausedSeconds, undefined);
  assert.deepEqual([p.exerciseDone, p.exerciseTotal], [1, 3], 'полоска подходов упражнения');
  assert.equal(p.next, 'Тяга · 1 × 12');
  assert.equal(p.dark, false);
});

test('пауза — секундомер стоит; отдых идёт — его конец', () => {
  assert.equal(la.activityPayload(record({ status: 'paused' })).pausedSeconds, 600);
  const until = Date.now() + 60000;
  assert.equal(la.activityPayload(record({ restUntil: until })).restUntil, until);
  const over = Date.now() - 60000;
  assert.equal(la.activityPayload(record({ restUntil: over })).restUntil, over, 'кончившийся отдых — плашка считает «+»');
  assert.equal(la.activityPayload(record({ restUntil: Date.now() - 3600000 })).restUntil, undefined, 'давний — уже нет');
  assert.equal(la.activityPayload(record({ status: 'paused', restUntil: until })).restUntil, undefined, 'на паузе отдыха нет');
});

test('тема приложения: тёмная — тёмная плашка', () => {
  fake.theme = 'dark';
  assert.equal(la.activityPayload(record({})).dark, true);
  fake.theme = null;
});

test('пара: номер подхода у своего человека', () => {
  const p = la.activityPayload(record({ exercises: [{ id: 'e3', name: 'Присед', sets: [
    set('done', '50', '10', { who: 'Анна' }), set('done', '80', '8', { who: 'Олег' }),
    set('pending', '50', '10', { who: 'Анна' }), set('pending', '80', '8', { who: 'Олег' }),
  ] }] }));
  assert.equal(p.detail, 'Анна · Подход 2 из 2');
  assert.deepEqual([p.who, p.weight], ['Анна', '50']);
});

test('всё отмечено — упражнения нет; завершённое занятие — плашки нет', () => {
  const done = record({ exercises: [{ name: 'Жим', sets: [set('done')] }] });
  assert.equal(la.activityPayload(done).exercise, '');
  assert.equal(la.activityPayload(record({ status: 'completed' })), null);
});

test('одно и то же в телефон не шлём; завершили — плашку убираем, чужое завершённое — нет', async () => {
  fake.calls.length = 0;
  await la.showWorkoutActivity(record({}));
  await la.showWorkoutActivity(record({}));
  assert.equal(fake.calls.filter((c) => c[0] === 'update').length, 1);
  await la.endWorkoutActivity('старое-занятие');
  assert.equal(fake.calls.filter((c) => c[0] === 'end').length, 0);
  await la.endWorkoutActivity('s1');
  assert.equal(fake.calls.filter((c) => c[0] === 'end').length, 1);
});

test('сборка без плашки — ничего не зовём', async () => {
  fake.available = false;
  fake.calls.length = 0;
  assert.equal(await la.showWorkoutActivity(record({ title: 'Низ' })), false);
  assert.equal(fake.calls.length, 0);
  fake.available = true;
});

test('нажатое на плашке: страница забирает один раз', async () => {
  fake.pending = { rest: { sessionId: 's1', restUntil: 1790000000000.4 }, weight: { sessionId: 's1', exerciseId: 'e1', who: '', value: '65' } };
  assert.deepEqual(await la.takePending(), {
    rest: { sessionId: 's1', restUntil: 1790000000000 },
    weight: { sessionId: 's1', exerciseId: 'e1', who: '', value: '65' },
  });
  assert.equal(await la.takePending(), null, 'второй раз — пусто');
  assert.equal(la.activityPayload(record({})).restSeconds, 90, '«вручную» — 1:30');
  assert.equal(la.activityPayload(record({ restSeconds: 120 })).restSeconds, 120);
});

test('вес с плашки — в текущий и оставшиеся подходы упражнения, у пары — только своему', () => {
  const session = record({}).session;
  const out = la.applyWeight(session, { exerciseId: 'e1', who: '', value: '65' });
  assert.deepEqual(out.exercises[0].sets.map((x) => x.weight), ['60', '65', '65'], 'сделанный не трогаем');
  assert.equal(out.exercises[1].sets[0].weight, '', 'другое упражнение не трогаем');
  const pair = { exercises: [{ id: 'e3', name: 'Присед', sets: [
    set('pending', '50', '10', { who: 'Анна' }), set('pending', '80', '8', { who: 'Олег' }),
  ] }] };
  assert.deepEqual(la.applyWeight(pair, { exerciseId: 'e3', who: 'Анна', value: '52.5' }).exercises[0].sets.map((x) => x.weight), ['52.5', '80']);
});

test('кардио и упражнения без веса — без кнопок веса', () => {
  const p = la.activityPayload(record({ exercises: [{ id: 'c1', name: 'Бег', track: { kind: 'cardio' }, sets: [set('pending', '', '', { time: '20' })] }] }));
  assert.equal(p.weight, undefined);
  assert.equal(p.amount, 'время 20');
});
