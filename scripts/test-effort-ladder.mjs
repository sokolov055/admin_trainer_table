import test from 'node:test';
import assert from 'node:assert/strict';
import { rateSet } from '../src/effort.js';

/**
 * Подсказка веса отсчитывается от того, что сделано сейчас, а не от веса
 * прошлой тренировки (владелец, 16.10.2026): прошлый раз 50 · 50 · 50,
 * сегодня первый подход 60 — «легко» даёт следующим 62,5, а не 50.
 */

const press = (weights, last = weights) => ({
  name: 'Жим лёжа', target: '8',
  lastRun: { date: '2026-10-09', weights: last.map(String), reps: last.map(() => '8') },
  sets: weights.map((w) => ({ weight: String(w), reps: '8', state: 'pending', kind: 'work' })),
});
const rate = (ex, si, effort, weight) => {
  const copy = { ...ex, sets: ex.sets.map((s, i) => (i === si && weight ? { ...s, weight: String(weight), own: true } : s)) };
  return rateSet(copy, si, effort).ex.sets.map((s) => s.weight);
};

test('сделали тяжелее прошлого раза и «легко» — дальше от сделанного, а не от прошлого', () => {
  assert.deepEqual(rate(press([50, 50, 50]), 0, 'easy', 60), ['60', '62.5', '62.5']);
});

test('«тяжело» и не добил — от сделанного минус шаг', () => {
  const ex = press([60, 60, 60]);
  ex.sets[0].reps = '5';
  assert.deepEqual(rate(ex, 0, 'hard', 55), ['55', '52.5', '52.5']);
});

test('«норм» вес не двигает — как было', () => {
  assert.deepEqual(rate(press([50, 50, 50]), 0, 'ok', 60), ['60', '50', '50']);
});

test('вес как в прошлый раз — всё по-старому: +шаг следующим', () => {
  assert.deepEqual(rate(press([100, 100, 100]), 0, 'easy'), ['100', '102.5', '102.5']);
});

test('лесенка прошлого раза сохраняется: подход, что был тяжелее на столько-то, тяжелее и теперь', () => {
  // Прошлый раз 100 · 100 · 120, сегодня 90 и не добил: 87,5 · 107,5 (разница в 20 кг осталась)
  const ex = press([100, 100, 120]);
  ex.sets[0].reps = '5';
  assert.deepEqual(rate(ex, 0, 'hard', 90), ['90', '87.5', '107.5']);
});

test('подход, который в прошлый раз был легче, остаётся своим (сброс, разминка)', () => {
  assert.deepEqual(rate(press([100, 80]), 0, 'easy'), ['100', '80']);
});

test('без истории — как раньше: не легче сделанного двигаем, ниже не трогаем', () => {
  const ex = { name: 'Жим лёжа', target: '8', sets: [50, 50, 40].map((w) => ({ weight: String(w), reps: '8', state: 'pending', kind: 'work' })) };
  assert.deepEqual(rate(ex, 0, 'easy'), ['50', '52.5', '40']);
});

test('вписанное руками не трогаем', () => {
  const ex = press([50, 50, 50]);
  ex.sets[1] = { ...ex.sets[1], own: true };
  assert.deepEqual(rate(ex, 0, 'easy', 60), ['60', '50', '62.5']);
});
