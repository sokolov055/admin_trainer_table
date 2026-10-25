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
    addListener: async (name, cb) => { (f().listeners ||= {})[name] = cb; return { remove: () => { delete f().listeners[name]; } }; },
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

test('номер сохранения на сервере — часам: прочитанное раньше их нажатий они не берут (23.10.2026)', () => {
  assert.equal(la.activityPayload({ ...record({}), revision: 41 }).revision, 41);
  assert.equal(la.activityPayload(record({})).revision, undefined, 'ещё не на сервере — номера нет');
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

test('«Отдых» с номером через один (часы до 1.4 (16)) — подходы всё равно по порядку (07.10.2026)', () => {
  const s = record({ exercises: [
    { id: 'e1', name: 'Тяга', sets: [set('pending', '20'), set('pending', '40'), set('pending', '30'), set('pending', '40')] },
  ] }).session;
  // Старые часы при спящей странице слали 0, 2, 4, 6 вместо 0, 1, 2, 3
  const press = (i) => ({ kind: 'done', sessionId: 's1', exerciseId: 'e1', who: '', weight: '', setIndex: i });
  const states = (x) => x.exercises[0].sets.map((y) => y.state);
  let out = la.applyActions(s, [press(0), press(2)]);
  assert.deepEqual(states(out), ['done', 'done', 'pending', 'pending'], 'второй, а не третий');
  out = la.applyActions(out, [press(4), press(6)]);
  assert.deepEqual(states(out), ['done', 'done', 'done', 'done'], 'номер за концом — первый неотмеченный');
  // Отмеченный уже подход второй раз не отмечает следующий
  assert.deepEqual(states(la.applyActions(s, [press(0), press(0)])), ['done', 'pending', 'pending', 'pending']);
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

test('часы тренера: разминка в начало и подход в конец (addSet, FT-533)', () => {
  const r = record({});
  const s = la.applyActions(r.session, [
    { kind: 'addSet', sessionId: 's1', exerciseId: 'e1', warmup: true },
    { kind: 'addSet', sessionId: 's1', exerciseId: 'e1', warmup: false },
  ]);
  const list = la.activityPayload({ ...r, session: s }, { coach: true }).exercises[0];
  assert.deepEqual(list.kinds, ['warmup', 'work', 'work', 'work', 'work']);
  assert.deepEqual(list.weights, ['30', '60', '62.5', '60', '60']);
  assert.deepEqual(list.sets, ['pending', 'done', 'pending', 'pending', 'pending']);
  const sup = record({ exercises: [{ id: 'a', name: 'Жим', supersetGroup: 'g1', sets: [set('pending')] }, { id: 'b', name: 'Тяга', supersetGroup: 'g1', sets: [set('pending')] }] });
  assert.equal(la.applyActions(sup.session, [{ kind: 'addSet', sessionId: 's1', exerciseId: 'a', warmup: false }]).exercises[0].sets.length, 1, 'суперсет — не с часов');
});

test('часы: исправить подход (setEdit) — вес и повторы, сделан он или нет', () => {
  const r = record({});
  const s = la.applyActions(r.session, [{ kind: 'setEdit', sessionId: 's1', exerciseId: 'e1', who: '', setIndex: 0, weight: '65', reps: '6' }]);
  assert.deepEqual([s.exercises[0].sets[0].weight, s.exercises[0].sets[0].reps, s.exercises[0].sets[0].state], ['65', '6', 'done']);
  const bad = la.applyActions(r.session, [{ kind: 'setEdit', sessionId: 's1', exerciseId: 'e1', who: '', setIndex: 0, weight: 'abc', reps: '' }]);
  assert.equal(bad.exercises[0].sets[0].weight, '60', 'мусор не пишем');
  assert.deepEqual(la.activityPayload(r).exercises[0].weights, ['60', '62.5', '60']);
});

test('суперсет в очереди — кругами: круг 1 по всем упражнениям, потом круг 2', () => {
  const r = record({ exercises: [
    { id: 'a', name: 'Жим', supersetGroup: 'g1', sets: [set('pending', '60'), set('pending', '60')] },
    { id: 'b', name: 'Тяга', supersetGroup: 'g1', sets: [set('pending', '40'), set('pending', '40')] },
    { id: 'c', name: 'Присед', sets: [set('pending', '80')] },
  ] });
  const q = la.setQueue(r.session);
  assert.deepEqual(q.map((x) => [x.exercise, x.round, x.group || '']), [
    ['Жим', 0, 'g1'], ['Тяга', 0, 'g1'], ['Жим', 1, 'g1'], ['Тяга', 1, 'g1'], ['Присед', undefined, ''],
  ]);
  assert.equal(q[0].detail, 'Круг 1 из 2');
  assert.equal(q[0].next, 'Присед · 1 × 8');
});

test('перестановка с часов: суперсет переезжает целиком', () => {
  const r = record({ exercises: [
    { id: 'a', name: 'Жим', supersetGroup: 'g1', sets: [set('pending')] },
    { id: 'b', name: 'Тяга', supersetGroup: 'g1', sets: [set('pending')] },
    { id: 'c', name: 'Присед', sets: [set('pending')] },
    { id: 'd', name: 'Выпады', sets: [set('pending')] },
  ] });
  const s = la.applyActions(r.session, [{ kind: 'move', sessionId: 's1', group: 'g1', index: 2 }]);
  assert.deepEqual(s.exercises.map((e) => e.id), ['c', 'd', 'a', 'b']);
  const one = la.applyActions(r.session, [{ kind: 'move', sessionId: 's1', exerciseId: 'd', index: 0 }]);
  assert.deepEqual(one.exercises.map((e) => e.id), ['d', 'a', 'b', 'c']);
  assert.equal(la.activityPayload(r).exercises[0].group, 'g1');
});

test('перестановка внутри суперсета: из него не выйти, чужое не встанет внутрь', () => {
  const r = record({ exercises: [
    { id: 'c', name: 'Присед', sets: [set('pending')] },
    { id: 'a', name: 'Жим', supersetGroup: 'g1', sets: [set('pending'), set('pending')] },
    { id: 'b', name: 'Тяга', supersetGroup: 'g1', sets: [set('pending'), set('pending')] },
    { id: 'e', name: 'Отжимания', supersetGroup: 'g1', sets: [set('pending'), set('pending')] },
    { id: 'd', name: 'Выпады', sets: [set('pending')] },
  ] });
  const ids = (s) => s.exercises.map((e) => e.id).join('');
  const move = (exerciseId, index) => la.applyActions(r.session, [{ kind: 'move', sessionId: 's1', exerciseId, index }]);
  // Внутри — да: «Тяга» первой, круги в новом порядке
  const inside = move('b', 1);
  assert.equal(ids(inside), 'cbaed');
  assert.deepEqual(la.setQueue(inside).slice(1, 4).map((x) => x.exerciseId), ['b', 'a', 'e']);
  // Наружу — нет: в начало и в конец списка остаётся с краю суперсета
  assert.equal(ids(move('a', 0)), 'cabed');
  assert.equal(ids(move('a', 4)), 'cbead');
  // Чужое в середину суперсета не встаёт — за ним
  assert.equal(ids(move('c', 2)), 'abecd');
  assert.equal(ids(move('d', 2)), 'cabed');
});

test('20.10.2026: очередь часов — вся тренировка, а не 12 подходов (страница спала — «Все подходы отмечены» посреди)', () => {
  const exercises = Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, name: 'Упражнение ' + i, sets: [set('pending'), set('pending'), set('pending'), set('pending')] }));
  assert.equal(la.setQueue(record({ exercises }).session).length, 24);
});

test('FT-628 на часах: вес помощи в поле веса, вес с часов — в помощь, «легко» убавляет помощь', () => {
  const grav = (state, assist) => ({ state, weight: '', assist, reps: '10', rpe: '', kind: 'work' });
  const exercises = [{ id: 'g', name: 'Подтягивания в гравитроне', track: { kind: 'bodyweight', weightMode: 'assistance' },
    sets: [grav('pending', '56'), grav('pending', '56'), grav('pending', '56')] }];
  const s = record({ exercises }).session;
  const q = la.setQueue(s);
  assert.deepEqual([q[0].weight, q[0].assist, q[0].step, q[0].reps], ['56', true, 5, '10']);
  assert.equal(la.exerciseList(s)[0].assist, true);
  assert.deepEqual(la.exerciseList(s)[0].weights, ['56', '56', '56']);
  let next = la.applyActions(s, [{ kind: 'done', sessionId: 's1', exerciseId: 'g', who: '', weight: '56', setIndex: 0, effort: 'easy' }]);
  assert.deepEqual(next.exercises[0].sets.map((x) => [x.state, x.assist]), [['done', '56'], ['pending', '51'], ['pending', '51']], '«легко» — помощи меньше');
  assert.match(la.setQueue(next)[0].suggest, /^−5 кг помощи/);
  // Вес с часов — свой (own), оценки его больше не двигают, как и у обычного веса
  next = la.applyActions(next, [{ kind: 'weight', sessionId: 's1', exerciseId: 'g', who: '', value: '50' }]);
  assert.deepEqual(next.exercises[0].sets.map((x) => x.assist), ['56', '50', '50'], 'колёсико крутит помощь');
  next = la.applyActions(next, [{ kind: 'setEdit', sessionId: 's1', exerciseId: 'g', who: '', setIndex: 2, weight: '40' }]);
  assert.equal(next.exercises[0].sets[2].assist, '40', 'правка подхода с часов — тоже помощь');
});

test('нажатие на часах — событие «watch»: экран забирает журнал, отдых не трогает (22.10.2026)', async () => {
  const got = [];
  const off = la.onLiveAction((e) => got.push(e));
  await new Promise((r) => setTimeout(r, 0));
  const fire = fake.listeners.liveAction;
  fire({ sessionId: 's1', kind: 'watch', restUntil: 0 });
  fire({ sessionId: 's1', kind: 'extend', restUntil: 5000 });
  fire({ sessionId: 's1', kind: 'что-то новое' });
  assert.deepEqual(got.map((e) => e.kind), ['watch', 'extend', 'stop']);
  off();
  assert.equal(fake.listeners.liveAction, undefined);
});

test('FT-753: отметка с часов без повторов пропускается, остальные нажатия ложатся — занятие можно сохранить', () => {
  const s = record({ exercises: [
    { id: 'e1', name: 'Жим лёжа', sets: [set('done'), set('pending', '62.5')] },
    { id: 'e2', name: 'Рукоход', sets: [set('pending', '', ''), set('pending', '', '')] },
  ] }).session;
  const until = Date.now() + 90000;
  const out = la.applyChecked(s, [
    { kind: 'done', sessionId: 's1', exerciseId: 'e1', who: '', weight: '62.5', setIndex: 1 },
    { kind: 'done', sessionId: 's1', exerciseId: 'e2', who: '', weight: '', setIndex: 0, effort: 'hard' },
    { kind: 'rest', sessionId: 's1', restUntil: until },
  ], 'ios');
  assert.deepEqual(out.exercises[0].sets.map((x) => x.state), ['done', 'done'], 'подход с весом и повторами — отмечен');
  assert.deepEqual(out.exercises[1].sets.map((x) => x.state), ['pending', 'pending'], 'без повторов — ждёт, как на сервере');
  assert.equal(out.restUntil, until, 'отдых после него — есть');
  // Всё в порядке — то же, что applyActions
  const ok = [{ kind: 'done', sessionId: 's1', exerciseId: 'e1', who: '', weight: '62.5', setIndex: 1 }];
  assert.deepEqual(la.applyChecked(s, ok), la.applyActions(s, ok));
  assert.equal(la.applyChecked(s, []), s);
});

test('FT-753: отдых, кончившийся до того, как дошёл с часов, — не отдых (без «Отдых окончен»)', () => {
  const now = 1_000_000_600_000;
  const s = record({}).session;
  const late = la.applyActions(s, [{ kind: 'rest', sessionId: 's1', restUntil: now - 60000 }], 'ios', now);
  assert.equal(late.restUntil, 0);
  const live = la.applyActions(s, [{ kind: 'rest', sessionId: 's1', restUntil: now + 30000 }], 'ios', now);
  assert.equal(live.restUntil, now + 30000);
});

test('FT-754: вес с часов снимает подсказку «−1 кг · после …» с подхода; «сегодня» — одной строкой с весом', async () => {
  const { tiredToday, tiredText } = await import(pathToFileURL(join(process.cwd(), 'src/effort.js')).href);
  const tired = { after: 'Обратное разведение рук в тренажёре «Пек-дек»', step: '1' };
  const s = record({ exercises: [
    { id: 'e1', name: 'Подъём гантелей в стороны сидя', tired, sets: [set('pending', '2', '15', { suggest: 'tired' }), set('pending', '2', '15', { suggest: 'tired' })] },
  ] }).session;
  assert.equal(tiredToday(tired, s.exercises[0].sets), 'сегодня после «Обратное разведение рук в тренажёре «Пек-дек»» — 2 кг, на шаг легче');
  const turned = la.applyActions(s, [{ kind: 'weight', sessionId: 's1', exerciseId: 'e1', who: '', value: '3' }]);
  assert.deepEqual(turned.exercises[0].sets.map((x) => [x.weight, x.suggest || '']), [['3', ''], ['3', '']]);
  assert.equal(tiredToday(tired, turned.exercises[0].sets), '', 'вес вернули — строки про шаг нет');
  assert.equal(la.setQueue(turned)[0].suggest, undefined, 'и на часах');
  // Первый подход сделан — подсказка на следующих не продолжается
  const worked = { ...s.exercises[0], sets: [{ ...s.exercises[0].sets[0], state: 'done' }, s.exercises[0].sets[1]] };
  assert.equal(tiredText(worked, worked.sets[1]), '');
  assert.equal(tiredToday(tired, worked.sets), '');
});

test('FT-753: подход без повторов — часам needReps; повторы с часов приходят с отметкой, занятие сохраняется', () => {
  const s = record({ exercises: [
    { id: 'e1', name: 'Рукоход', track: { kind: 'bodyweight' }, sets: [set('pending', '', ''), set('pending', '', '8')] },
  ] }).session;
  const q = la.setQueue(s);
  assert.deepEqual(q.map((x) => !!x.needReps), [true, false]);
  const out = la.applyChecked(s, [{ kind: 'done', sessionId: 's1', exerciseId: 'e1', who: '', weight: '', setIndex: 0, effort: 'hard', reps: '6' }]);
  assert.deepEqual(out.exercises[0].sets.map((x) => [x.state, x.reps]), [['done', '6'], ['pending', '8']]);
  // Кардио и на время повторов не просят
  const timed = record({ exercises: [{ id: 'e2', name: 'Планка', track: { kind: 'timed' }, sets: [set('pending', '', '')] }] }).session;
  assert.equal(la.setQueue(timed)[0].needReps, undefined);
});
