import test from 'node:test';
import assert from 'node:assert/strict';
import { goalDots, dotsLabel, daysLeft, MAX_DOTS } from '../src/client/goal-dots.js';

const count = (dots, kind) => dots.filter((d) => d === kind).length;

test('месяц: сделано, пропущено, впереди — по порядку и в сумме план', () => {
  const r = goalDots({ done: 5, target: 9, due: 6 });
  assert.deepEqual([r.missed, r.ahead, r.per], [1, 3, 1]);
  assert.deepEqual(r.dots, ['done', 'done', 'done', 'done', 'done', 'missed', 'ahead', 'ahead', 'ahead']);
  assert.equal(dotsLabel(r), 'Сделано 5 из 9, пропущено 1');
  assert.equal(dotsLabel(goalDots({ done: 6, target: 9, due: 6 })), 'Сделано 6 из 9', 'без пропусков — без хвоста');
});

test('неделя без пропусков; перевыполнение — лишние точки залиты', () => {
  assert.deepEqual(goalDots({ done: 1, target: 3, due: 2 }, { withMissed: false }).dots, ['done', 'ahead', 'ahead']);
  const over = goalDots({ done: 11, target: 9, due: 9 });
  assert.equal(over.dots.length, 11);
  assert.equal(count(over.dots, 'done'), 11);
  assert.deepEqual([over.missed, over.ahead], [0, 0]);
});

test('due больше плана или меньше сделанного — пропуски не врут', () => {
  assert.equal(goalDots({ done: 2, target: 4, due: 7 }).missed, 2, 'пропущено не больше, чем осталось до плана');
  assert.equal(goalDots({ done: 5, target: 9, due: 3 }).missed, 0);
  assert.equal(goalDots({ done: 0, target: 9 }).missed, 0, 'нет due — нет и пропусков');
});

test('цели нет — точек нет', () => {
  const r = goalDots({ done: 3, target: 0, due: 2 });
  assert.deepEqual([r.done, r.target, r.missed, r.dots.length], [3, 0, 0, 0]);
});

test('год: до 156 точек — 13 колонок, до 300 — 26, дальше точка — несколько тренировок', () => {
  assert.equal(goalDots({ done: 71, target: 104, due: 82 }).columns, 13);
  const five = goalDots({ done: 100, target: 261, due: 210 });
  assert.deepEqual([five.per, five.dots.length, five.columns], [1, 261, 26]);
  const seven = goalDots({ done: 151, target: 365, due: 290 });
  assert.equal(seven.per, 2);
  assert.ok(seven.dots.length <= MAX_DOTS);
  assert.equal(seven.dots.length, 183, '365 / 2 — последняя точка неполная');
  assert.equal(count(seven.dots, 'done'), 75, '151 / 2: неполная точка не залита');
  assert.equal(count(seven.dots, 'missed'), 70, 'до 290: 145 точек, из них 75 сделаны');
  assert.deepEqual([seven.done, seven.missed, seven.ahead], [151, 139, 75], 'подписи — в тренировках, не в точках');
});

test('сколько дней осталось: неделя до воскресенья, месяц до конца, сегодняшняя тренировка — минус день', () => {
  assert.equal(daysLeft('2026-10-21', 'week'), 5, 'среда — ср, чт, пт, сб, вс');
  assert.equal(daysLeft('2026-10-25', 'week'), 1, 'воскресенье');
  assert.equal(daysLeft('2026-10-19', 'week', true), 6);
  assert.equal(daysLeft('2026-10-21', 'month'), 11);
  assert.equal(daysLeft('2026-02-28', 'month'), 1);
  assert.equal(daysLeft('2026-10-31', 'month', true), 0);
});
