import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numOf, stepWeight, stepReps, workOf, barsOf, barsText, withWarmup, withDrop, withSets, withRest, withSide,
  canWarmup, canDrop, navOf, restAdvice,
} from '../src/trainer/exercise-card-model.js';
import { patchPlanExercise } from '../src/plan-block-actions.js';
import { techniqueOf } from '../src/exercise-track.js';

/** Карточка упражнения в редакторе тренировки (этап 5, 17.11.2026) */

test('вес: шаг 2,5 кг, до 10 кг — 1 кг', () => {
  assert.equal(stepWeight('80', 1), '82,5');
  assert.equal(stepWeight('82,5', -1), '80');
  assert.equal(stepWeight('9', 1), '10');
  assert.equal(stepWeight('10', 1), '12,5');
  assert.equal(stepWeight('10', -1), '9');
  assert.equal(stepWeight('12.5', -1), '10');
  assert.equal(stepWeight('4', -1), '3');
  assert.equal(stepWeight('1', -1), '');
  assert.equal(stepWeight('', 1), '1');
  assert.equal(stepWeight('', -1), null);
});

test('вес: неровный приводится к сетке 2,5, текст не трогаем', () => {
  assert.equal(stepWeight('11', 1), '12,5');
  assert.equal(stepWeight('11', -1), '10');
  assert.equal(stepWeight('+5', 1), null);
  assert.equal(stepWeight('макс', -1), null);
  assert.equal(numOf('12,5'), 12.5);
  assert.ok(Number.isNaN(numOf('8–12')));
});

test('повторы: целое, диапазон, время, списки — клавиатурой', () => {
  assert.equal(stepReps('12', 1), '13');
  assert.equal(stepReps('1', -1), '1');
  assert.equal(stepReps('8–12', 1), '9–13');
  assert.equal(stepReps('1-3', -1), null);
  assert.equal(stepReps('60', 1, true), '65');
  assert.equal(stepReps('5', -1, true), '5');
  assert.equal(stepReps('', 1), '12');
  assert.equal(stepReps('', -1, true), '60');
  assert.equal(stepReps('12, 15, 20', 1), null);
  assert.equal(stepReps('до отказа', 1), null);
});

test('подходы столбиками: разминка, рабочие, дропсет последним', () => {
  const ex = { sets: '4', technique: 'warmup1 dropset rest120' };
  assert.deepEqual(barsOf(ex), ['warmup', 'work', 'work', 'work', 'drop']);
  assert.equal(barsText(ex), '1 разм. + 4 рабочих, последний — дропсет');
  assert.equal(barsText({ sets: '1' }), '1 рабочий');
  assert.equal(workOf({ sets: '' }), 3);
  assert.equal(workOf({ sets: '99' }), 20);
});

test('правки подходов не трогают остальное в technique', () => {
  const ex = { sets: '3', technique: 'warmup1 side1 rest90' };
  assert.deepEqual(techniqueOf(withWarmup(ex, 3).technique), { ...techniqueOf(ex.technique), warmup: 3 });
  assert.equal(techniqueOf(withWarmup(ex, 9).technique).warmup, 5);
  assert.equal(techniqueOf(withWarmup(ex, -1).technique).warmup, 0);
  assert.equal(techniqueOf(withDrop(ex, true).technique).dropset, true);
  assert.equal(techniqueOf(withDrop(ex, true).technique).rest, 90);
  assert.equal(techniqueOf(withRest(ex, 150).technique).rest, 150);
  assert.equal(techniqueOf(withRest(ex, 150).technique).side, 'one');
  assert.equal(techniqueOf(withSide(ex, false).technique).side, 'two');
  assert.deepEqual(withSets(ex, 0), { sets: '1' });
  assert.deepEqual(withSets(ex, 30), { sets: '20' });
});

test('суперсет: подходы и разминка — у всех, дропсет — свой', () => {
  const list = [
    { name: 'A', sets: '3', supersetGroup: 'g', technique: 'dropset' },
    { name: 'B', sets: '3', supersetGroup: 'g', technique: '' },
    { name: 'C', sets: '2', supersetGroup: '', technique: '' },
  ];
  const a = patchPlanExercise(list, 1, withSets(list[1], 4));
  assert.deepEqual(a.map((e) => e.sets), ['4', '4', '2']);
  const b = patchPlanExercise(a, 1, withWarmup(a[1], 1));
  assert.deepEqual(b.map((e) => techniqueOf(e.technique).warmup), [1, 1, 0]);
  assert.equal(techniqueOf(b[0].technique).dropset, true);
});

test('разминка и дропсет — по виду упражнения', () => {
  assert.equal(canWarmup({ name: 'Жим' }), true);
  assert.equal(canDrop({ name: 'Жим' }), true);
  assert.equal(canDrop({ name: 'Отжимания', track: { kind: 'bodyweight' } }), false);
  assert.equal(canWarmup({ name: 'Планка', track: { kind: 'timed' } }), false);
  assert.equal(canWarmup({ name: 'Дорожка', cardio: { machine: 'treadmill' } }), false);
});

test('«‹ 2 из 6 ›» без перехода по кругу', () => {
  assert.deepEqual(navOf(1, 6), { text: '2 из 6', prev: 0, next: 2 });
  assert.deepEqual(navOf(0, 6), { text: '1 из 6', prev: -1, next: 1 });
  assert.deepEqual(navOf(5, 6), { text: '6 из 6', prev: 4, next: -1 });
});

test('рекомендация отдыха: базовые — 2–3 мин, изолирующие — 1–1,5', () => {
  assert.deepEqual(restAdvice({ name: 'Жим ногами 45°' }), [120, 150, 180]);
  assert.deepEqual(restAdvice({ name: 'Сгибание ног сидя' }), [60, 90]);
  assert.deepEqual(restAdvice({ name: 'Планка', track: { kind: 'timed' } }), [60, 90]);
  assert.deepEqual(restAdvice({ name: 'Дорожка', cardio: { machine: 'treadmill' } }), []);
});
