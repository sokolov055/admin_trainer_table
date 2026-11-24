import test from 'node:test';
import assert from 'node:assert/strict';
import { shownExercises, exerciseFilterCount, loadKey, loadLabel, coverFrame, NO_EXERCISE_FILTERS } from '../src/trainer/exercise-list-model.js';

const list = [
  { id: 1, name: 'Жим штанги лёжа', muscle: 'Грудь', equipment: 'Штанга', common: true, mine: false, media: { kind: 'animation', url: 'x' }, setup: 'Лечь', machines: [{ kind: 'machine' }], track: { kind: 'strength' } },
  { id: 2, name: 'Моё: Разводка в кроссовере', muscle: 'Грудь', mine: true, common: false, machines: [], track: { kind: 'strength' } },
  { id: 3, name: 'Подтягивания с помощью', muscle: 'Спина', common: true, mine: false, machines: [{ kind: 'equipment' }], track: { kind: 'bodyweight', weightMode: 'assistance' }, setup: '  ' },
  { id: 4, name: 'Планка', muscle: '', common: true, mine: false, machines: [], track: { kind: 'timed' }, media: { kind: 'link', url: 'y' } },
];
const ids = (options) => shownExercises(list, options).map((e) => e.id);

test('«Мои» — своё и свои версии общих, «Общие» — база', () => {
  assert.deepEqual(ids(), [2]);
  assert.deepEqual(ids({ scope: 'public' }), [4, 3, 1]);
});

test('поиск по названию, мышце и оборудованию без учёта ё и регистра', () => {
  assert.deepEqual(ids({ scope: 'public', q: 'ЛЕЖА' }), [1]);
  assert.deepEqual(ids({ scope: 'public', q: 'спина' }), [3]);
  assert.deepEqual(ids({ scope: 'public', q: 'штанга' }), [1]);
  assert.deepEqual(ids({ q: 'нет такого' }), []);
});

test('мышцы: группа и «Без группы»; фильтры листа пересекаются', () => {
  assert.deepEqual(ids({ scope: 'public', muscle: '—' }), [4]);
  assert.deepEqual(ids({ scope: 'public', muscle: 'Спина' }), [3]);
  const f = (patch) => ({ ...NO_EXERCISE_FILTERS, ...patch });
  assert.deepEqual(ids({ scope: 'public', filters: f({ load: 'assistance' }) }), [3]);
  assert.deepEqual(ids({ scope: 'public', filters: f({ load: 'bodyweight' }) }), []);
  assert.deepEqual(ids({ scope: 'public', filters: f({ gear: 'machine' }) }), [1]);
  assert.deepEqual(ids({ scope: 'public', filters: f({ gear: 'none' }) }), [4]);
  assert.deepEqual(ids({ scope: 'public', filters: f({ media: true }) }), [4, 1]);
  assert.deepEqual(ids({ scope: 'public', filters: f({ noSetup: true }) }), [4, 3]);
  assert.deepEqual(ids({ scope: 'public', filters: f({ media: true, noSetup: true }) }), [4]);
});

test('счётчик фильтров не включает порядок и мышцу', () => {
  assert.equal(exerciseFilterCount({ ...NO_EXERCISE_FILTERS, sort: 'az' }), 0);
  assert.equal(exerciseFilterCount({ load: 'cardio', gear: 'none', media: true, noSetup: true, sort: 'recent' }), 4);
});

test('порядок: недавние по номеру, А–Я по алфавиту; исходный список не меняется', () => {
  const before = JSON.stringify(list);
  assert.deepEqual(ids({ scope: 'public', filters: { ...NO_EXERCISE_FILTERS, sort: 'az' } }), [1, 4, 3]);
  assert.equal(JSON.stringify(list), before);
});

test('подпись нагрузки: помощь отдельно, без вида — силовое', () => {
  assert.equal(loadKey(list[2]), 'assistance');
  assert.equal(loadLabel(list[2]), 'Вес помощи');
  assert.equal(loadLabel({}), 'Силовое');
  assert.equal(loadLabel(list[3]), 'На время');
});

test('обложка: кадр анимации вместо значка; видео, ролик и небезопасный id — значок', () => {
  assert.equal(coverFrame({ kind: 'animation', url: 'Air_Bike' }), '/anim/Air_Bike/0.jpg');
  assert.equal(coverFrame({ kind: 'animation', url: 'Air_Bike' }, '/app/'), '/app/anim/Air_Bike/0.jpg');
  assert.equal(coverFrame({ kind: 'clip', url: 'x' }), '');
  assert.equal(coverFrame({ kind: 'link', url: 'https://example.test/v' }), '');
  assert.equal(coverFrame({ kind: 'animation', url: '../secret' }), '');
  assert.equal(coverFrame(null), '');
});
