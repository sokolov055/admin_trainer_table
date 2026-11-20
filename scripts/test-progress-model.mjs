/**
 * «Прогресс», этап 1 (макет progress-skip-chat-2026-11-19): темп и прогноз
 * веса, фраза «Моего пути», сила за месяц.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { weightTrend, journeyHeadline, strengthPct, weeksSince, signed } from '../src/client/progress-model.js';

const pts = (list) => list.map(([x, y]) => ({ x, y }));

test('темп: прямая по последним 8 неделям и вес через месяц', () => {
  const t = weightTrend(pts([['2026-10-01', 80], ['2026-10-15', 79], ['2026-10-29', 78], ['2026-11-12', 77]]), -1);
  assert.equal(t.perWeek, -0.5);
  assert.equal(t.inMonth, 74.9);
  assert.equal(t.against, false);
  assert.equal(t.flat, false);
});

test('темп против цели — фраза вместо прогноза', () => {
  const t = weightTrend(pts([['2026-10-01', 70], ['2026-10-15', 71], ['2026-10-29', 72]]), -1);
  assert.equal(t.against, true);
  assert.equal(weightTrend(pts([['2026-10-01', 70], ['2026-10-15', 71], ['2026-10-29', 72]]), 1).against, false);
});

test('мало замеров или близко по датам — без прогноза', () => {
  assert.equal(weightTrend(pts([['2026-10-01', 80], ['2026-10-15', 79]])), null, 'двух точек мало');
  assert.equal(weightTrend(pts([['2026-11-01', 80], ['2026-11-05', 79], ['2026-11-09', 78]])), null, 'меньше двух недель');
  assert.equal(weightTrend(pts([['2025-01-01', 90], ['2025-02-01', 88], ['2026-11-01', 80]])), null, 'старые замеры не в счёт');
});

test('ровный вес — «держится»', () => {
  const t = weightTrend(pts([['2026-10-01', 80], ['2026-10-15', 80.1], ['2026-10-29', 80]]), -1);
  assert.equal(t.flat, true);
  assert.equal(t.against, false);
});

test('фраза пути: вес и талия, иначе тренировки', () => {
  const rows = [{ date: '2026-09-12', 'Вес': 82, 'Талия': 86 }, { date: '2026-11-17', 'Вес': 78.4, 'Талия': 81 }];
  assert.equal(journeyHeadline(rows, 23), '−3,6 кг и −5 см в талии');
  assert.equal(journeyHeadline([{ date: '2026-09-12', 'Вес': 82 }], 23), '23 тренировки позади');
  assert.equal(journeyHeadline([], 0), '');
});

test('сила за месяц — суммарно к прошлому месяцу', () => {
  assert.equal(strengthPct([{ weight: 120, prevWeight: 100 }, { weight: 60, prevWeight: 60 }]), 13);
  assert.equal(strengthPct([]), null);
  assert.equal(signed(0.5, 'см'), '+0,5 см');
  assert.equal(weeksSince('2026-09-12', new Date('2026-11-20T10:00:00Z')), 9);
});
