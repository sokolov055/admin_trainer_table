// «Неделя» в питании (макет nutrition-redesign-2026-11-20, этап 3): чистые функции
import test from 'node:test';
import assert from 'node:assert/strict';
import { weekdayOf, bandTarget, energyShares, weekView, sparkPath } from '../src/nutrition/week-model.js';

const day = (d, kcal, { complete = true, target = 2000, water = 0, entries } = {}) => ({
  day: d, totals: { kcal, protein: kcal / 20, fat: kcal / 30, carbs: kcal / 8 }, targets: target ? { kcal: target } : {},
  complete, waterMl: water, entries: entries ?? (kcal ? [{}] : []),
});

test('день недели по дате', () => {
  assert.equal(weekdayOf('2026-11-20'), 'пт');
  assert.equal(weekdayOf('2026-11-16'), 'пн');
  assert.equal(weekdayOf('2026-11-22'), 'вс');
});

test('норма коридора — последнего дня, где она есть', () => {
  assert.equal(bandTarget([day('2026-11-19', 0, { target: 1800 }), day('2026-11-20', 0, { target: 0 })]), 1800);
  assert.equal(bandTarget([]), 0);
});

test('доли энергии БЖУ в сумме 100', () => {
  const s = energyShares({ protein: 121, fat: 63, carbs: 231 });
  assert.equal(s.protein + s.fat + s.carbs, 100);
  assert.deepEqual(s, { protein: 25, fat: 29, carbs: 46 });
  assert.equal(energyShares({}), null);
  assert.equal(energyShares(null), null);
});

test('столбики: цвет по норме своего дня, часть — штрихом, пусто — пусто', () => {
  const days = [
    day('2026-11-14', 1920), day('2026-11-15', 2310), day('2026-11-16', 1100, { complete: false }),
    day('2026-11-17', 1950), day('2026-11-18', 0, { complete: false }), day('2026-11-19', 2010), day('2026-11-20', 1340),
  ];
  const v = weekView({ days, fullDays: 5, average: { kcal: 1906, protein: 95, fat: 63, carbs: 238 }, weights: [] });
  assert.deepEqual(v.bars.map((b) => b.tone), ['good', 'over', 'under', 'good', 'empty', 'good', 'under']);
  assert.deepEqual(v.bars.map((b) => b.part), [false, false, true, false, false, false, false]);
  assert.deepEqual(v.inNorm, { n: 3, of: 5 }, 'в норме считаются только полные дни');
  assert.equal(v.streak, 2, '19 и 20 — полные подряд до последнего дня');
  assert.ok(v.bars.every((b) => b.h >= 0 && b.h <= 1));
  assert.ok(v.band.lo < v.band.hi && v.band.hi < 1, 'коридор помещается в график');
  assert.equal(v.bars[4].h, 0);
  assert.ok(v.band.from < v.band.to && v.band.from % 10 === 0, 'границы нормы для подписи под графиком');
  assert.equal(v.empty, false);
});

test('неделя без записей — пустая, без голых полосок', () => {
  const v = weekView({ days: [day('2026-11-19', 0, { target: 1800 }), day('2026-11-20', 0, { target: 1800 })], fullDays: 0, average: null });
  assert.equal(v.empty, true);
});

test('без нормы: нет коридора и счёта «в норме»', () => {
  const v = weekView({ days: [day('2026-11-20', 1500, { target: 0 })], fullDays: 1, average: null });
  assert.equal(v.band, null);
  assert.equal(v.inNorm, null);
  assert.equal(v.bars[0].tone, 'neutral');
  assert.equal(v.shares, null);
});

test('вес: первый, последний, разница; вода — доля цели не больше 1', () => {
  const v = weekView({ days: [day('2026-11-19', 0, { water: 3000 }), day('2026-11-20', 0, { water: 1200 })], weights: [{ day: '2026-11-14', weight: 82.4 }, { day: '2026-11-20', weight: 81.9 }] }, 2400);
  assert.deepEqual([v.weight.first, v.weight.last, v.weight.delta], [82.4, 81.9, -0.5]);
  assert.deepEqual(v.water.map((w) => w.share), [1, 0.5]);
  assert.equal(weekView({ days: [] }).weight, null);
});

test('линия веса: от двух точек, в пределах рамки', () => {
  assert.equal(sparkPath([80]), '');
  const d = sparkPath([82.4, 82, 81.9]);
  assert.match(d, /^M5\.0 5\.0 L150\.0 [\d.]+ L295\.0 41\.0$/);
  assert.equal(sparkPath([80, 80]), 'M5.0 23.0 L295.0 23.0');
});
