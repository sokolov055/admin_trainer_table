import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shownWorkouts, scopeFilters, workoutFilterCount, WORKOUT_NO_FILTERS } from '../src/trainer/workout-list-model.js';

const list = [
  { id: 1, title: 'Ноги', goal: 'Тонус', uses: 2, isPublic: false, inPrograms: [{ id: 9, title: 'Программа' }] },
  { id: 2, title: 'Верх', goal: 'Набор массы', uses: 7, isPublic: true, inPrograms: [] },
  { id: 3, title: 'Абс', goal: 'Рельеф', uses: 0, isPublic: false },
];
const ids = (xs) => xs.map((t) => t.id);

test('фильтр «Показать»: в программах и общие', () => {
  assert.deepEqual(ids(shownWorkouts(list, { filters: { ...WORKOUT_NO_FILTERS, show: 'inprog' } })), [1]);
  assert.deepEqual(ids(shownWorkouts(list, { filters: { ...WORKOUT_NO_FILTERS, show: 'shared' } })), [2]);
  assert.equal(workoutFilterCount({ ...WORKOUT_NO_FILTERS, show: 'shared' }), 1);
  assert.equal(workoutFilterCount(WORKOUT_NO_FILTERS), 0, 'порядок — не фильтр');
});

test('поиск и цель сужают список, без совпадений — пусто', () => {
  assert.deepEqual(ids(shownWorkouts(list, { q: ' верх ' })), [2]);
  assert.deepEqual(ids(shownWorkouts(list, { goal: 'Тонус' })), [1]);
  assert.deepEqual(shownWorkouts(list, { q: 'нет такой' }), []);
});

test('порядок: чаще назначаю — по числу использований', () => {
  const sorted = shownWorkouts(list, { filters: { ...WORKOUT_NO_FILTERS, sort: 'uses' } });
  assert.deepEqual(ids(sorted), [2, 1, 3]);
});

test('«В программах» не отсекает общие: на вкладке «Общие» фильтр не применяется', () => {
  const inprog = { ...WORKOUT_NO_FILTERS, show: 'inprog' };
  const shared = [{ id: 7, title: 'Чужая', goal: '', uses: 0, isPublic: true }];
  assert.deepEqual(scopeFilters(inprog, 'public').show, '');
  assert.deepEqual(ids(shownWorkouts(shared, { filters: scopeFilters(inprog, 'public') })), [7]);
  assert.equal(scopeFilters(inprog, 'mine').show, 'inprog', 'на «Моих» фильтр остаётся');
});
