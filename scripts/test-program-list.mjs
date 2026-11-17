import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  goalLook, daysOf, filterCount, matches, shownPrograms, filterValues, initials, avatarTone, NO_FILTERS,
} from '../src/trainer/program-list-model.js';

/** Список программ «Библиотеки» (17.11.2026): обложки, фильтры, порядок */

const list = [
  { id: 1, title: 'Похудение и функциональность', goal: 'Похудение', level: 'Средний', place: 'gym', days: 4, weekSessions: [4, 4], forClients: true, isPublic: false, clients: [{ row: 1, name: 'Анна' }], uses: 2 },
  { id: 2, title: 'Девушки 2 раза', goal: 'Набор массы', level: 'Новичок', place: 'gym', days: null, weekSessions: [2, 2], forClients: false, isPublic: true, clients: [], uses: 7 },
  { id: 3, title: 'Дома', goal: 'Подготовка к забегу', level: '', place: 'home', days: 3, weekSessions: [3], forClients: false, isPublic: false, clients: [], uses: 0 },
];

test('цель — обложка: известная по списку, своя — нейтральная', () => {
  assert.equal(goalLook('Похудение').key, 'lose');
  assert.equal(goalLook('Набор массы').icon, 'dumbbell');
  assert.equal(goalLook('Подготовка к забегу').key, 'own');
});

test('раз в неделю: вписанное тренером, иначе по неделе 1', () => {
  assert.deepEqual(daysOf(list[0]), { n: 4, auto: false });
  assert.deepEqual(daysOf(list[1]), { n: 2, auto: true });
  assert.deepEqual(daysOf({ weekSessions: [] }), { n: 0, auto: false });
});

test('поиск, цель и фильтры листа сужают вместе', () => {
  assert.deepEqual(shownPrograms(list, { q: 'девушки' }).map((t) => t.id), [2]);
  assert.deepEqual(shownPrograms(list, { goal: 'Похудение' }).map((t) => t.id), [1]);
  assert.deepEqual(shownPrograms(list, { filters: { ...NO_FILTERS, days: 2 } }).map((t) => t.id), [2], 'авто-частота тоже фильтруется');
  assert.deepEqual(shownPrograms(list, { filters: { ...NO_FILTERS, place: 'home' } }).map((t) => t.id), [3]);
  assert.deepEqual(shownPrograms(list, { filters: { ...NO_FILTERS, show: 'assigned' } }).map((t) => t.id), [1]);
  assert.deepEqual(shownPrograms(list, { filters: { ...NO_FILTERS, show: 'shared' } }).map((t) => t.id), [2]);
  assert.deepEqual(shownPrograms(list, { filters: { ...NO_FILTERS, show: 'clients', level: 'Новичок' } }), []);
  assert.equal(matches(list[0], {}), true);
});

test('порядок: как отдал сервер, чаще назначаю, по алфавиту', () => {
  assert.deepEqual(shownPrograms(list, {}).map((t) => t.id), [1, 2, 3]);
  assert.deepEqual(shownPrograms(list, { filters: { ...NO_FILTERS, sort: 'uses' } }).map((t) => t.id), [2, 1, 3]);
  assert.deepEqual(shownPrograms(list, { filters: { ...NO_FILTERS, sort: 'az' } }).map((t) => t.title), ['Девушки 2 раза', 'Дома', 'Похудение и функциональность']);
});

test('число на «Фильтрах» — без порядка; плитки — только встречающиеся значения', () => {
  assert.equal(filterCount(NO_FILTERS), 0);
  assert.equal(filterCount({ ...NO_FILTERS, days: 3, show: 'shared', sort: 'az' }), 2);
  assert.deepEqual(filterValues(list), { days: [2, 3, 4], place: ['gym', 'home'], level: ['Новичок', 'Средний'] });
});

test('аватарка: инициалы и постоянный цвет', () => {
  assert.equal(initials('Анна Ковалёва'), 'АК');
  assert.equal(initials('Олег'), 'ОЛ');
  assert.equal(initials(''), '?');
  assert.equal(avatarTone('Анна'), avatarTone('Анна'));
  assert.ok(avatarTone('Мария Смирнова') >= 0 && avatarTone('Мария Смирнова') < 6);
});
