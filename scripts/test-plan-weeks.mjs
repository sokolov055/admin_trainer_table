import test from 'node:test';
import assert from 'node:assert/strict';

import { monthWeeks, weekDates, weekPlan, weekQueue, programLength, withLength, weekLoad } from '../src/plan-weeks.js';

/**
 * Программа по неделям (IDEA-7, 27–28.10.2026): программа на 1–4 недели
 * раскладывается по циклам месяца по кругу, за цикл — оценка, неполный цикл
 * требует столько, сколько приходится на его дни, тренировки без недель —
 * месячная очередь, как раньше.
 */

const MONTH = 'Ноябрь 2026';
const b = (id, title, week, load) => ({ id: 'b' + id.repeat(16), title, ...(week ? { week } : {}), ...(load ? { load } : {}), exercises: [] });
const A = b('a', 'А', 1);
const B = b('b', 'Б', 1);
const C = b('c', 'В', 2, 'light');
const D = b('d', 'Г', 2, 'light');
const PROGRAM = [A, B, C, D];
const done = (block, day) => ({ status: 'completed', sourceBlockId: block.id, month: MONTH, startedAt: `2026-11-${day}T10:00:00`, updatedAt: `2026-11-${day}T11:00:00` });
const cfg = (extra = {}) => ({ rule: 'client', choices: {}, ...extra });
const at = (day) => new Date(`2026-11-${day}T12:00:00`);
const titles = (rows) => rows.map((r) => r.block.title);

test('ноябрь 2026: шесть циклов, первый и последний — по дню', () => {
  const w = monthWeeks(MONTH);
  assert.deepEqual(w.map(weekDates), ['1 ноября', '2–8 ноября', '9–15 ноября', '16–22 ноября', '23–29 ноября', '30 ноября']);
  assert.equal(monthWeeks('Своё название'), null);
});

test('без недель у тренировок — null: месячная очередь как раньше', () => {
  assert.equal(programLength([b('a', 'А'), b('b', 'Б')]), 0);
  assert.equal(weekPlan({ blocks: [b('a', 'А')], sessions: [], month: MONTH, cfg: cfg() }), null);
});

test('программа на 2 недели идёт по кругу до конца месяца', () => {
  const p = weekPlan({ blocks: PROGRAM, sessions: [], month: MONTH, cfg: cfg(), today: at('04') });
  assert.equal(p.length, 2);
  assert.deepEqual(p.weeks.map((w) => w.week), [1, 2, 1, 2, 1, 2]);
  assert.deepEqual(titles(weekQueue(p.weeks[1])), ['В', 'Г']);
  assert.equal(p.weeks[1].load, 'light');
  assert.equal(p.weeks[2].load, '');
});

test('неполный цикл: нужно по дням — одна из двух за 1 ноября', () => {
  const p = weekPlan({ blocks: PROGRAM, sessions: [done(A, '01')], month: MONTH, cfg: cfg(), today: at('04') });
  const first = p.weeks[0];
  assert.equal(first.need, 1);
  assert.equal(first.status, 'done');
  // Сделанная в неполном — в очереди нет, вторая — можно
  assert.deepEqual(titles(weekQueue(first)), ['Б']);
});

test('полный цикл: оценка «выполнен» / «не выполнен», месяц — сколько из скольких', () => {
  const sessions = [done(A, '01'), done(C, '03'), done(D, '05'), done(A, '10')];
  const p = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg({ rule: 'skip' }), today: at('17') });
  assert.deepEqual(p.weeks.slice(0, 4).map((w) => w.status), ['done', 'done', 'missed', 'open']);
  assert.equal(p.weeks[2].missed, 1);
  assert.deepEqual(p.score, { done: 2, graded: 3, total: 6, allDone: false });
});

test('все циклы выполнены — молодец', () => {
  const s = [done(A, '01'), done(C, '02'), done(D, '03'), done(A, '09'), done(B, '10'), done(C, '16'), done(D, '17'),
    done(A, '23'), done(B, '24'), done(C, '30')];
  const p = weekPlan({ blocks: PROGRAM, sessions: s, month: MONTH, cfg: cfg(), today: new Date('2026-12-01T12:00:00') });
  assert.equal(p.score.allDone, true);
});

test('пропуск: лист выбора; «доделать» — первой в следующем цикле', () => {
  const sessions = [done(C, '03'), done(D, '04'), done(A, '09')];
  const ask = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg(), today: at('17') });
  assert.deepEqual(titles(ask.pending), ['Б']);
  assert.equal(ask.pendingWeek.n, 3);
  assert.deepEqual(titles(weekQueue(ask.weeks[3])), ['В', 'Г']);
  const redo = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg({ choices: { ['3:' + B.id]: 'redo' } }), today: at('17') });
  assert.equal(redo.pending.length, 0);
  assert.deepEqual(titles(weekQueue(redo.weeks[3])), ['Б', 'В', 'Г']);
  assert.equal(redo.weeks[3].need, 3);
  // Правило тренера решает без клиента
  const rule = weekPlan({ blocks: PROGRAM, sessions, month: MONTH, cfg: cfg({ rule: 'redo' }), today: at('17') });
  assert.equal(rule.pending.length, 0);
  assert.deepEqual(titles(weekQueue(rule.weeks[3])), ['Б', 'В', 'Г']);
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
