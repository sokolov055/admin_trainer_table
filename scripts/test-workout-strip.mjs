import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shownSetOf, viewSet, stripOf, stepOfField, stepValue } from '../src/workout-strip.js';

/** Упражнение в занятии полосой столбиков (FT-802, этап 2, 18.11.2026) */

const set = (state = 'pending', extra = {}) => ({ state, weight: '20', reps: '12', ...extra });
const curl = { name: 'Молотковые сгибания рук с гантелями', track: { kind: 'strength' }, sets: [set('done', { effort: 'easy' }), set(), set(), set()] };

test('на виду — ближайший неотмеченный; все сделаны — последний', () => {
  assert.equal(shownSetOf(curl), 1);
  assert.equal(shownSetOf({ ...curl, sets: curl.sets.map((x) => ({ ...x, state: 'done' })) }), 3);
  assert.equal(shownSetOf({ sets: [] }), -1);
  // Пропущенный — не ближайший
  assert.equal(shownSetOf({ ...curl, sets: [set('done'), set('skipped'), set()] }), 2);
});

test('нажали столбик — на виду он, пока не отмечен следующий подход', () => {
  const view = viewSet(curl, 0);
  assert.equal(shownSetOf(curl, view), 0);
  const after = { ...curl, sets: curl.sets.map((x, i) => (i === 1 ? { ...x, state: 'done', effort: 'ok' } : x)) };
  assert.equal(shownSetOf(after, view), 2, 'отметили — снова ближайший');
  assert.equal(shownSetOf(curl, { si: 9, done: 1 }), 1, 'подхода уже нет — ближайший');
});

test('полоса: номера рабочих, разминка «Р», оценка у сделанных, ближайший и на виду', () => {
  const ex = { ...curl, sets: [set('done', { kind: 'warmup' }), ...curl.sets] };
  const bars = stripOf(ex, viewSet(ex, 1));
  assert.deepEqual(bars.map((b) => b.label), ['Р', '1', '2', '3', '4']);
  assert.deepEqual(bars.map((b) => b.effort), ['ok', 'easy', '', '', '']);
  assert.deepEqual(bars.map((b) => b.next), [false, false, true, false, false]);
  assert.deepEqual(bars.map((b) => b.shown), [false, true, false, false, false]);
  assert.equal(bars[0].warmup, true);
});

test('шаг «− / +»: гантели 1 кг, штанга и тренажёр 2,5, свой шаг тренажёра, помощь 5, повторы 1, время 5 с', () => {
  assert.equal(stepOfField(curl, 'weight'), 1);
  assert.equal(stepOfField({ name: 'Жим лёжа', track: { kind: 'strength' } }, 'weight'), 2.5);
  assert.equal(stepOfField({ name: 'Жим в тренажёре', load: { step: 5 } }, 'weight'), 5);
  assert.equal(stepOfField({ name: 'Подтягивания в гравитроне' }, 'assist'), 5);
  assert.equal(stepOfField(curl, 'reps'), 1);
  assert.equal(stepOfField(curl, 'time'), 5);
});

test('«− / +»: от кратного — на шаг, от некратного — к ближайшему кратному, не ниже нуля, пусто', () => {
  const bench = { name: 'Жим лёжа' };
  assert.equal(stepValue(bench, 'weight', '70', 1), '72.5');
  assert.equal(stepValue(bench, 'weight', '72,5', 1), '75');
  assert.equal(stepValue(bench, 'weight', '72.3', 1), '72.5');
  assert.equal(stepValue(bench, 'weight', '72.3', -1), '70');
  assert.equal(stepValue(bench, 'weight', '1', -1), '0');
  assert.equal(stepValue(bench, 'weight', '0', -1), '0');
  assert.equal(stepValue(bench, 'weight', '', 1), '2.5');
  assert.equal(stepValue(bench, 'weight', '', -1), '');
  assert.equal(stepValue(curl, 'weight', '14', 1), '15');
  assert.equal(stepValue(curl, 'reps', '12', -1), '11');
  assert.equal(stepValue(curl, 'reps', '0', -1), '0');
});

test('время: секундами и «м:сс»', () => {
  assert.equal(stepValue(curl, 'time', '60', 1), '65');
  assert.equal(stepValue(curl, 'time', '1:30', 1), '1:35');
  assert.equal(stepValue(curl, 'time', '1:00', -1), '0:55');
  assert.equal(stepValue(curl, 'time', '0:03', -1), '0:00');
});

test('суперсет: на виду ближайший круг, нажатый — до следующей отметки; квадратики кругов', async () => {
  const { shownRoundOf, viewRound, roundsOf } = await import('../src/workout-strip.js');
  const a = { sets: [set('done'), set(), set()] };
  const b = { sets: [set('done'), set('done'), set()] };
  assert.equal(shownRoundOf([a, b]), 1, 'во втором круге A не отмечено');
  const view = viewRound([a, b], 0);
  assert.equal(shownRoundOf([a, b], view), 0);
  const a2 = { sets: [set('done'), set('done'), set()] };
  assert.equal(shownRoundOf([a2, b], view), 2, 'отметили — ближайший');
  const rounds = roundsOf([a, b]);
  assert.deepEqual(rounds.map((x) => [x.done, x.next, x.shown]), [[true, false, false], [false, true, true], [false, false, false]]);
  const all = { sets: [set('done'), set('skipped')] };
  assert.deepEqual(roundsOf([all, { sets: [set('done'), set('done')] }]).map((x) => x.done), [true, true]);
  assert.equal(shownRoundOf([all, { sets: [set('done'), set('done')] }]), 1, 'всё сделано — последний');
});
