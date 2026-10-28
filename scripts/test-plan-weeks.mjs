import test from 'node:test';
import assert from 'node:assert/strict';

import {
  monthWeeks, weekDates, weekPlan, weekQueue, programLength, withLength, weekLoad, cycleMonthOf, startWeekOf,
  byWeek, shownLength, weekOrder, resized, withWeekLoad, movedToWeek, copiedWeek, defaultHow, assignPreview, lengthHint,
} from '../src/plan-weeks.js';

/**
 * Программа по неделям (IDEA-7, 27–28.10.2026): программа на 1–4 недели
 * раскладывается по циклам месяца по кругу, за цикл — оценка, тренировки
 * без недель — месячная очередь, как раньше. Стык месяцев (28.10.2026):
 * цикл — целая неделя по правилу четверга, «начать с недели», долг через
 * месяц, прошлая программа крутится, пока не назначена следующая.
 */

const MONTH = 'Ноябрь 2026';
const b = (id, title, week, load) => ({ id: 'b' + id.repeat(16), title, ...(week ? { week } : {}), ...(load ? { load } : {}), exercises: [] });
const A = b('a', 'А', 1);
const B = b('b', 'Б', 1);
const C = b('c', 'В', 2, 'light');
const D = b('d', 'Г', 2, 'light');
const PROGRAM = [A, B, C, D];
const doneAt = (block, iso, month = MONTH) => ({ id: 's' + block.id + iso, status: 'completed', sourceBlockId: block.id, month, startedAt: `${iso}T10:00:00`, updatedAt: `${iso}T11:00:00` });
const done = (block, day) => doneAt(block, `2026-11-${day}`);
const cfg = (extra = {}) => ({ rule: 'client', startWeek: 1, choices: {}, ...extra });
const at = (day) => new Date(`2026-11-${day}T12:00:00`);
const titles = (rows) => rows.map((r) => r.block.title);
const titles2 = (list) => list.map((x) => x.title);

test('ноябрь 2026: четыре целых цикла 2–29 ноября; 1 ноября — октябрь, 30 ноября — декабрь', () => {
  assert.deepEqual(monthWeeks(MONTH).map(weekDates), ['2–8 ноября', '9–15 ноября', '16–22 ноября', '23–29 ноября']);
  assert.deepEqual(monthWeeks('Октябрь 2026').map(weekDates), ['28 сентября – 4 октября', '5–11 октября', '12–18 октября', '19–25 октября', '26 октября – 1 ноября']);
  assert.deepEqual(monthWeeks('Декабрь 2026').map((w) => [w.start, w.end])[0], ['2026-11-30', '2026-12-06']);
  assert.equal(monthWeeks('Декабрь 2026').length, 5);
  assert.equal(monthWeeks('Своё название'), null);
  assert.equal(cycleMonthOf(new Date('2026-11-01T12:00:00')), 'Октябрь 2026');
  assert.equal(cycleMonthOf(new Date('2026-11-30T12:00:00')), 'Декабрь 2026');
  assert.equal(cycleMonthOf(new Date('2026-11-15T12:00:00')), 'Ноябрь 2026');
});

test('без недель у тренировок — null: месячная очередь как раньше', () => {
  assert.equal(programLength([b('a', 'А'), b('b', 'Б')]), 0);
  assert.equal(weekPlan({ blocks: [b('a', 'А')], sessions: [], month: MONTH, cfg: cfg() }), null);
});

test('программа на 2 недели идёт по кругу; «начать с недели 2» сдвигает круг', () => {
  const p = weekPlan({ blocks: PROGRAM, sessions: [], month: MONTH, cfg: cfg(), today: at('04') });
  assert.equal(p.length, 2);
  assert.deepEqual(p.weeks.map((w) => w.week), [1, 2, 1, 2]);
  assert.deepEqual(titles(weekQueue(p.weeks[1])), ['В', 'Г']);
  assert.equal(p.weeks[1].load, 'light');
  assert.equal(p.weeks[2].load, '');
  const shifted = weekPlan({ blocks: PROGRAM, sessions: [], month: MONTH, cfg: cfg({ startWeek: 2 }), today: at('04') });
  assert.deepEqual(shifted.weeks.map((w) => w.week), [2, 1, 2, 1]);
  assert.equal(startWeekOf({ startWeek: 5 }, 2), 1);
  assert.equal(startWeekOf(null, 3), 1);
});

test('занятие до первого цикла месяца в него не входит: 1 ноября — не ноябрь', () => {
  const p = weekPlan({ blocks: PROGRAM, sessions: [done(A, '01')], month: MONTH, cfg: cfg(), today: at('04') });
  assert.equal(p.weeks[0].done, 0);
  assert.equal(p.currentIndex, 0);
  // 1 ноября — ещё нет текущего цикла ноября
  assert.equal(weekPlan({ blocks: PROGRAM, sessions: [], month: MONTH, cfg: cfg(), today: at('01') }).currentIndex, -1);
});

test('полный цикл: оценка «выполнен» / «не выполнен», месяц — сколько из скольких', () => {
  const sessions = [done(A, '03'), done(B, '05'), done(C, '10')];
  const p = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg({ rule: 'skip' }), today: at('17') });
  assert.deepEqual(p.weeks.map((w) => w.status), ['done', 'missed', 'open', 'open']);
  assert.equal(p.weeks[1].missed, 1);
  assert.deepEqual(p.score, { done: 1, graded: 2, total: 4, allDone: false });
});

test('все циклы выполнены — молодец', () => {
  const s = [done(A, '02'), done(B, '03'), done(C, '09'), done(D, '10'), done(A, '16'), done(B, '17'), done(C, '23'), done(D, '24')];
  const p = weekPlan({ blocks: PROGRAM, sessions: s, month: MONTH, cfg: cfg(), today: new Date('2026-12-01T12:00:00') });
  assert.equal(p.score.allDone, true);
});

test('пропуск: лист выбора; «доделать» — первой в следующем цикле', () => {
  const sessions = [done(A, '03'), done(C, '10')];
  const ask = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg(), today: at('17') });
  assert.deepEqual(titles(ask.pending), ['Г']);
  assert.equal(ask.pendingWeek.n, 2);
  assert.equal(ask.pendingMonth, MONTH);
  assert.deepEqual(titles(weekQueue(ask.weeks[2])), ['А', 'Б']);
  const redo = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg({ choices: { ['2:' + D.id]: 'redo' } }), today: at('17') });
  assert.equal(redo.pending.length, 0);
  assert.deepEqual(titles(weekQueue(redo.weeks[2])), ['Г', 'А', 'Б']);
  assert.equal(redo.weeks[2].need, 3);
  // Правило тренера решает без клиента: Б из цикла 1 тянется через цикл 2 дальше
  const rule = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg({ rule: 'redo' }), today: at('17') });
  assert.equal(rule.pending.length, 0);
  assert.deepEqual(titles(weekQueue(rule.weeks[2])), ['Б', 'Г', 'А']);
});

test('стык: долг последнего цикла ноября — первым в первый цикл декабря, занятие по нему засчитывается', () => {
  const DEC = 'Декабрь 2026';
  const X = b('x', 'Х', 1);
  const Y = b('y', 'У', 1);
  // Ноябрь: в последнем цикле (23–29) сделана только В из В, Г
  const nov = [done(A, '02'), done(B, '03'), done(C, '09'), done(D, '10'), done(A, '16'), done(B, '17'), done(C, '24')];
  const prev = { month: MONTH, blocks: PROGRAM, weeks: cfg() };
  const ask = weekPlan({ blocks: [X, Y], sessions: nov, month: DEC, cfg: cfg(), prev, today: new Date('2026-12-01T12:00:00') });
  // Выбор — за ноябрьский цикл 4, сохраняется под ноябрём
  assert.deepEqual([titles(ask.pending), ask.pendingWeek.n, ask.pendingMonth], [['Г'], 4, MONTH]);
  assert.deepEqual(titles(weekQueue(ask.weeks[0])), ['Х', 'У']);
  const redo = weekPlan({ blocks: [X, Y], sessions: nov, month: DEC, cfg: cfg(), prev: { ...prev, weeks: cfg({ choices: { ['4:' + D.id]: 'redo' } }) }, today: new Date('2026-12-01T12:00:00') });
  assert.equal(redo.pending.length, 0);
  const q = weekQueue(redo.weeks[0]);
  assert.deepEqual(titles(q), ['Г', 'Х', 'У']);
  assert.deepEqual([q[0].block.foreign, q[0].block.month], [true, MONTH]);
  assert.equal(redo.weeks[0].need, 3);
  // Сделал долг 1 декабря (занятие — ноябрьской программы) — учтён один раз
  const paid = weekPlan({ blocks: [X, Y], sessions: [...nov, doneAt(D, '2026-12-01')], month: DEC, cfg: cfg(), prev: { ...prev, weeks: cfg({ choices: { ['4:' + D.id]: 'redo' } }) }, today: new Date('2026-12-02T12:00:00') });
  assert.deepEqual([paid.weeks[0].done, paid.weeks[0].extra, titles(weekQueue(paid.weeks[0]))], [1, 0, ['Х', 'У']]);
  // Правило тренера в ноябре «пропускать» — долга нет
  const skip = weekPlan({ blocks: [X, Y], sessions: nov, month: DEC, cfg: cfg(), prev: { ...prev, weeks: cfg({ rule: 'skip' }) }, today: new Date('2026-12-01T12:00:00') });
  assert.deepEqual([skip.pending.length, skip.weeks[0].need], [0, 2]);
});

test('следующий месяц не назначен — программа крутится дальше с пометкой, в оценку месяца не идёт', () => {
  const p = weekPlan({ blocks: PROGRAM, sessions: [], month: MONTH, cfg: cfg({ rule: 'skip' }), latest: true, today: new Date('2026-12-09T12:00:00') });
  assert.equal(p.own, 4);
  assert.deepEqual(p.weeks.slice(4).map((w) => [w.n, w.week, w.beyond, weekDates(w)]), [[5, 1, 'Декабрь 2026', '30 ноября – 6 декабря'], [6, 2, 'Декабрь 2026', '7–13 декабря']]);
  assert.equal(p.currentIndex, 5);
  assert.deepEqual(p.score, { done: 0, graded: 4, total: 4, allDone: false });
  // Не последний лист — за край не идёт; до края — тоже
  assert.equal(weekPlan({ blocks: PROGRAM, sessions: [], month: MONTH, cfg: cfg(), today: new Date('2026-12-09T12:00:00') }).weeks.length, 4);
  assert.equal(weekPlan({ blocks: PROGRAM, sessions: [], month: MONTH, cfg: cfg(), latest: true, today: at('20') }).weeks.length, 4);
});

test('назначили среди недели: сделанное по прошлой программе в том же цикле засчитано', () => {
  const X = b('x', 'Х', 1);
  const Y = b('y', 'У', 1);
  const Z = b('z', 'Я', 1);
  // Понедельник 30 ноября — ещё по ноябрьской (А), декабрь назначен в среду
  const s = [doneAt(A, '2026-11-30'), doneAt(X, '2026-12-03', 'Декабрь 2026')];
  const p = weekPlan({ blocks: [X, Y, Z], sessions: s, month: 'Декабрь 2026', cfg: cfg(), today: new Date('2026-12-03T14:00:00') });
  assert.deepEqual([p.weeks[0].need, p.weeks[0].done, p.weeks[0].extra, titles(weekQueue(p.weeks[0]))], [3, 2, 1, ['У', 'Я']]);
});

test('длина программы: по кругу при сокращении, снять — без недель', () => {
  assert.deepEqual(withLength([b('a', 'А'), b('b', 'Б', 3), b('c', 'В', 2)], 2).map((x) => x.week), [1, 1, 2]);
  assert.deepEqual(withLength(PROGRAM, 0).map((x) => 'week' in x), [false, false, false, false]);
  assert.equal(weekLoad(PROGRAM, 2), 'light');
  // Длиннее — поровну по порядку: 12 тренировок на 4 недели по 3
  const twelve = Array.from({ length: 12 }, (_, i) => b(String.fromCharCode(97 + i), String(i), 1));
  assert.deepEqual(withLength(twelve, 4).map((x) => x.week), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
  assert.equal(programLength(withLength(twelve, 4)), 4);
  assert.equal(programLength(withLength(PROGRAM, 4)), 4);
  assert.equal(weekLoad([A, b('x', 'Х', 1, 'heavy')], 1), '');
});

/* Неделя — раздел (FT-775, 28.10.2026): правила редактора, листа «Разложить» и формы «Назначить» */

test('разделы недель: тренировки по неделям, порядок экрана — по неделям', () => {
  const mixed = [C, A, D, B];
  assert.deepEqual(byWeek(mixed, 2).map((g) => [g.week, titles2(g.blocks)]), [[1, ['А', 'Б']], [2, ['В', 'Г']]]);
  // Выбранная длина больше — пустые недели на экране, у тренировок — как было
  assert.equal(shownLength(PROGRAM, 4), 4);
  assert.equal(shownLength(PROGRAM, 1), 2);
  assert.deepEqual(byWeek(PROGRAM, 3)[2].blocks, []);
  assert.deepEqual(titles2(weekOrder(mixed, 2)), ['А', 'Б', 'В', 'Г']);
  assert.deepEqual(weekOrder(mixed, 0), mixed);
});

test('длина с экрана: больше — тренировки не двигаются, меньше — по кругу, список — разложить поровну, 0 — снять', () => {
  assert.deepEqual(resized(PROGRAM, 4), PROGRAM);
  assert.deepEqual(resized(PROGRAM, 1).map((x) => x.week), [1, 1, 1, 1]);
  const list = [b('x', 'Х'), b('y', 'У'), b('z', 'Ж')];
  assert.deepEqual(resized(list, 2).map((x) => x.week), [1, 2, 2]);
  assert.deepEqual(resized(list, 1).map((x) => x.week), [1, 1, 1]);
  assert.deepEqual(resized(PROGRAM, 0).map((x) => 'week' in x), [false, false, false, false]);
});

test('нагрузка — у недели целиком; перенос берёт нагрузку новой недели; копия недели — новыми тренировками', () => {
  const heavy = withWeekLoad(PROGRAM, 1, 'heavy');
  assert.deepEqual(heavy.map((x) => x.load || ''), ['heavy', 'heavy', 'light', 'light']);
  assert.equal(weekLoad(heavy, 1), 'heavy');
  assert.deepEqual(withWeekLoad(heavy, 2, '').map((x) => 'load' in x), [true, true, false, false]);
  const moved = movedToWeek(PROGRAM, A, 2);
  assert.deepEqual(moved.map((x) => [x.week, x.load || '']), [[2, 'light'], [1, ''], [2, 'light'], [2, 'light']]);
  assert.equal(moved[0].id, A.id);
  const copied = copiedWeek([A, B], 1, 2);
  assert.equal(copied.length, 4);
  assert.deepEqual(copied.slice(2).map((x) => [x.title, x.week, 'id' in x]), [['А', 2, false], ['Б', 2, false]]);
  assert.notEqual(copied[2].exercises, A.exercises);
});

test('назначить список: умолчание — по кругу при 2–4 тренировках; предпросмотр по циклам', () => {
  const three = [b('x', 'Верх'), b('y', 'Низ'), b('z', 'Всё')];
  assert.equal(defaultHow(three), 'cycle');
  assert.equal(defaultHow([three[0]]), 'list');
  assert.equal(defaultHow([...three, ...three]), 'list');
  // Ноябрь 2026 — 4 цикла; по кругу: все три в каждом
  const cycle = assignPreview({ blocks: three, month: MONTH, how: 'cycle' });
  assert.equal(cycle.length, 4);
  assert.deepEqual(cycle.map((c) => [c.week, c.titles.length]), [[1, 3], [1, 3], [1, 3], [1, 3]]);
  // Разложить на 2: Верх | Низ, Всё — по кругу
  const split = assignPreview({ blocks: three, month: MONTH, how: 'split', length: 2 });
  assert.deepEqual(split.map((c) => c.titles), [['Верх'], ['Низ', 'Всё'], ['Верх'], ['Низ', 'Всё']]);
  assert.deepEqual(assignPreview({ blocks: three, month: MONTH, how: 'list' }), []);
  // Шаблон по неделям: продолжить со 2-й
  assert.deepEqual(assignPreview({ blocks: PROGRAM, month: MONTH, startWeek: 2 }).map((c) => c.week), [2, 1, 2, 1]);
  assert.deepEqual(assignPreview({ blocks: three, month: 'Разминка', how: 'cycle' }), []);
  assert.match(lengthHint(0), /списком/);
  assert.match(lengthHint(1, { count: 3 }), /Все 3 тренировки — каждую неделю/);
  assert.match(lengthHint(2, { cycles: 4 }), /Две разные недели.*4 цикла/);
  assert.match(lengthHint(4, { cycles: 4 }), /каждую неделю по разу/);
});
