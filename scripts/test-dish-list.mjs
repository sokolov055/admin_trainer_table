import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_FILTERS, filterCount, matches, sorted, shownDishes } from '../src/trainer/dish-list-model.js';

/** Лист «Фильтры» списка блюд (26.11.2026): время, метки, порядок */

const dishes = [
  { id: 1, name: 'Гречка с курицей', meal: 'обед', minutes: 20, tags: ['быстро', 'бюджетно'] },
  { id: 2, name: 'Овсяноблин с творогом', meal: 'завтрак', minutes: 15, tags: ['без молочного'] },
  { id: 3, name: 'Запечённая рыба с овощами', meal: 'ужин', minutes: 35, tags: ['высокобелковое'] },
  { id: 4, name: 'Творожная запеканка', meal: 'перекус', minutes: 45, tags: [] },
];

test('число на «Фильтрах»: время — один, каждая метка — своя, порядок не в счёт', () => {
  assert.equal(filterCount(NO_FILTERS), 0);
  assert.equal(filterCount({ ...NO_FILTERS, time: 15 }), 1);
  assert.equal(filterCount({ ...NO_FILTERS, tags: ['быстро', 'бюджетно'] }), 2);
  assert.equal(filterCount({ ...NO_FILTERS, time: 30, tags: ['быстро'], sort: 'az' }), 2, 'порядок — не фильтр');
});

test('совпадение: поиск, приём пищи, время, метки — «хотя бы одна»', () => {
  assert.equal(matches(dishes[0], { q: 'греч' }), true);
  assert.equal(matches(dishes[0], { q: 'ГРЕЧКА' }), true, 'поиск без учёта регистра');
  assert.equal(matches(dishes[0], { meal: 'завтрак' }), false);
  assert.equal(matches(dishes[1], { filters: { ...NO_FILTERS, time: 15 } }), true, '15 минут вписываются в 15′');
  assert.equal(matches(dishes[0], { filters: { ...NO_FILTERS, time: 15 } }), false, '20 минут — уже нет');
  assert.equal(matches(dishes[0], { filters: { ...NO_FILTERS, tags: ['бюджетно'] } }), true);
  assert.equal(matches(dishes[0], { filters: { ...NO_FILTERS, tags: ['бюджетно', 'без молочного'] } }), true, 'метки — «или»');
  assert.equal(matches(dishes[3], { filters: { ...NO_FILTERS, tags: ['быстро'] } }), false, 'без меток — не подходит');
});

test('порядок: как отдал сервер или по алфавиту', () => {
  assert.deepEqual(sorted(dishes).map((d) => d.id), [1, 2, 3, 4]);
  assert.deepEqual(sorted(dishes, 'az').map((d) => d.name), ['Гречка с курицей', 'Запечённая рыба с овощами', 'Овсяноблин с творогом', 'Творожная запеканка']);
  assert.equal(sorted(dishes).length, 4, 'исходный список не мутируется');
});

test('показ: всё вместе — поиск, приём и фильтры листа сужают вместе', () => {
  assert.deepEqual(shownDishes(dishes, {}).map((d) => d.id), [1, 2, 3, 4]);
  assert.deepEqual(shownDishes(dishes, { meal: 'завтрак' }).map((d) => d.id), [2]);
  assert.deepEqual(shownDishes(dishes, { q: 'овсян' }).map((d) => d.id), [2]);
  assert.deepEqual(shownDishes(dishes, { filters: { ...NO_FILTERS, time: 30 } }).map((d) => d.id), [1, 2]);
  assert.deepEqual(shownDishes(dishes, { filters: { ...NO_FILTERS, time: 15, tags: ['без молочного'] } }).map((d) => d.id), [2]);
  assert.deepEqual(shownDishes(dishes, { q: 'греч', filters: { ...NO_FILTERS, time: 15 } }), [], '20 минут не проходят через «до 15»');
});
