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
    takePendingRest: async () => { const r = f().pending || {}; f().pending = null; return r; },
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
  assert.equal(p.detail, 'Подход 2 из 3 · 62.5 кг × 8');
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
  const p = la.activityPayload(record({ exercises: [{ name: 'Присед', sets: [
    set('done', '50', '10', { who: 'Анна' }), set('done', '80', '8', { who: 'Олег' }),
    set('pending', '50', '10', { who: 'Анна' }), set('pending', '80', '8', { who: 'Олег' }),
  ] }] }));
  assert.equal(p.detail, 'Анна · Подход 2 из 2 · 50 кг × 10');
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

test('отдых с кнопки на плашке: страница забирает его один раз', async () => {
  fake.pending = { sessionId: 's1', restUntil: 1790000000000.4 };
  assert.deepEqual(await la.takePendingRest(), { sessionId: 's1', restUntil: 1790000000000 });
  assert.equal(await la.takePendingRest(), null, 'второй раз — пусто');
  assert.equal(la.activityPayload(record({})).restSeconds, 90, '«вручную» — 1:30');
  assert.equal(la.activityPayload(record({ restSeconds: 120 })).restSeconds, 120);
});

test('очередь подходов для плашки: текущий и следующие, с «Дальше» у каждого', () => {
  const q = la.setQueue(record({}).session);
  assert.deepEqual(q.map((x) => [x.exercise, x.detail, x.weight, x.exerciseDone]), [
    ['Жим лёжа', 'Подход 2 из 3', '62.5', 1],
    ['Жим лёжа', 'Подход 3 из 3', '60', 2],
    ['Тяга', 'Подход 1 из 1', '', 0],
  ]);
  assert.equal(q[0].next, 'Тяга · 1 × 12');
  assert.equal(q[2].next, '');
  assert.equal(la.activityPayload(record({})).sets.length, 3);
});

test('журнал с плашки: вес, «Отдых» (подход сделан + отдых), снова вес — по порядку', () => {
  const s = record({}).session;
  const until = Date.now() + 90000;
  const out = la.applyActions(s, [
    { kind: 'weight', sessionId: 's1', exerciseId: 'e1', who: '', value: '65' },
    { kind: 'done', sessionId: 's1', exerciseId: 'e1', who: '', weight: '65' },
    { kind: 'rest', sessionId: 's1', restUntil: until },
    { kind: 'weight', sessionId: 's1', exerciseId: 'e1', who: '', value: '67.5' },
    { kind: 'done', sessionId: 'чужое', exerciseId: 'e1', who: '' },
  ], 'ios');
  assert.deepEqual(out.exercises[0].sets.map((x) => [x.state, x.weight]), [['done', '60'], ['done', '65'], ['pending', '67.5']]);
  assert.equal(out.restUntil, until);
  assert.equal(out.restLocal, 'ios');
  assert.equal(la.applyActions(s, []), s, 'пусто — занятие то же');
});

test('часы: пауза и продолжение — по времени нажатия, а не открытия', () => {
  const now = 1_000_000_600_000;
  const s = { ...record({}).session, elapsedMs: 600000 };
  const paused = la.applyActions(s, [{ kind: 'pause', sessionId: 's1', at: now - 120000 }], '', now);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.elapsedMs, 480000, 'две минуты после паузы не считаем');
  const back = la.applyActions(paused, [{ kind: 'resume', sessionId: 's1', at: now - 60000 }], '', now);
  assert.equal(back.status, 'active');
  assert.equal(back.elapsedMs, 540000, 'минута после продолжения — тренировка');
});

test('часы: следующее упражнение, время отдыха, отдых закончить, завершить', () => {
  const s = { ...record({}).session, restUntil: Date.now() + 60000 };
  const out = la.applyActions(s, [
    { kind: 'restSeconds', sessionId: 's1', value: 120 },
    { kind: 'restStop', sessionId: 's1' },
    { kind: 'skipExercise', sessionId: 's1', exerciseId: 'e1', who: '' },
  ]);
  assert.equal(out.restSeconds, 120);
  assert.equal(out.restUntil, 0);
  assert.deepEqual(out.exercises[0].sets.map((x) => x.state), ['done', 'skipped', 'skipped']);
  const done = la.applyActions(out, [{ kind: 'finish', sessionId: 's1' }, { kind: 'weight', sessionId: 's1', exerciseId: 'e2', who: '', value: '5' }]);
  assert.equal(done.status, 'completed');
  assert.equal(done.exercises[1].sets[0].state, 'skipped');
  assert.equal(done.exercises[1].sets[0].weight, '', 'после завершения нажатия не применяем');
});

test('первый экран часов: объём и упражнения', () => {
  const p = la.activityPayload(record({}));
  assert.equal(p.volume, 480, '60 кг × 8');
  assert.deepEqual([p.exercisesDone, p.exercisesTotal], [0, 2]);
});

test('«Отдых» с двух часов на одном подходе (setIndex) — отмечен один', () => {
  const s = record({}).session;
  const press = { kind: 'done', sessionId: 's1', exerciseId: 'e1', who: '', weight: '62.5', setIndex: 1 };
  const out = la.applyActions(s, [press, press]);
  assert.deepEqual(out.exercises[0].sets.map((x) => x.state), ['done', 'done', 'pending']);
});

test('часы тренера: список упражнений с подходами и перестановка (move)', () => {
  const r = record({});
  const p = la.activityPayload(r, { coach: true });
  assert.equal(p.coach, true);
  assert.deepEqual(p.exercises.map((e) => [e.name, e.sets]), [['Жим лёжа', ['done', 'pending', 'pending']], ['Тяга', ['pending']]]);
  const moved = la.applyActions(r.session, [{ kind: 'move', sessionId: 's1', exerciseId: 'e2', index: 0 }]);
  assert.deepEqual(moved.exercises.map((e) => e.id), ['e2', 'e1']);
  assert.equal(la.applyActions(r.session, [{ kind: 'move', sessionId: 's1', exerciseId: 'nope', index: 0 }]), r.session, 'чужое — без изменений');
  assert.equal(la.activityPayload(r).coach, false);
});

test('часы: исправить подход (setEdit) — вес и повторы, сделан он или нет', () => {
  const r = record({});
  const s = la.applyActions(r.session, [{ kind: 'setEdit', sessionId: 's1', exerciseId: 'e1', who: '', setIndex: 0, weight: '65', reps: '6' }]);
  assert.deepEqual([s.exercises[0].sets[0].weight, s.exercises[0].sets[0].reps, s.exercises[0].sets[0].state], ['65', '6', 'done']);
  const bad = la.applyActions(r.session, [{ kind: 'setEdit', sessionId: 's1', exerciseId: 'e1', who: '', setIndex: 0, weight: 'abc', reps: '' }]);
  assert.equal(bad.exercises[0].sets[0].weight, '60', 'мусор не пишем');
  assert.deepEqual(la.activityPayload(r).exercises[0].weights, ['60', '62.5', '60']);
});
