import test from 'node:test';
import assert from 'node:assert/strict';

import { supersets, blockSessions } from '../src/plan-model.js';

/* ==========================================================================
 * Суперсеты
 * ========================================================================== */

test('подряд идущие упражнения одной группы собираются в суперсет', () => {
  const groups = supersets([
    { name: 'Жим лёжа', sets: '4', supersetGroup: '' },
    { name: 'Подтягивания', sets: '3', supersetGroup: 'superset-4-5' },
    { name: 'Тяга блока', sets: '3', supersetGroup: 'superset-4-5' },
    { name: 'Планка', sets: '3', supersetGroup: '' },
  ]);

  assert.deepEqual(groups.map((g) => g.superset), [false, true, false]);
  assert.deepEqual(groups[1].items.map((e) => e.name), ['Подтягивания', 'Тяга блока']);
  assert.equal(groups[1].sets, '3', 'число подходов у группы общее');
});

/**
 * Объединение могло остаться от оформления. «Суперсет из одного»
 * человека только собьёт: делать подряд нечего.
 */
test('группа из одного упражнения суперсетом не считается', () => {
  const groups = supersets([{ name: 'Планка', sets: '3', supersetGroup: 'superset-9-10' }]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].superset, false);
});

test('одинаковые группы через разрыв не склеиваются', () => {
  const groups = supersets([
    { name: 'А', supersetGroup: 'g1' },
    { name: 'Б', supersetGroup: '' },
    { name: 'В', supersetGroup: 'g1' },
  ]);

  assert.equal(groups.length, 3, 'суперсет — это соседство, а не совпадение имени');
  assert.equal(groups.every((g) => !g.superset), true);
});

/* ==========================================================================
 * Отметка «тренировка проведена»
 * ========================================================================== */

const SESSIONS = [
  { id: 'a', status: 'completed', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-10T10:00:00Z' },
  { id: 'b', status: 'completed', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-17T10:00:00Z' },
  { id: 'c', status: 'completed', sourceBlock: 'Тренировка № 2', month: 'Сентябрь 2026', updatedAt: '2026-09-12T10:00:00Z' },
  { id: 'd', status: 'completed', sourceBlock: 'Тренировка № 1', month: 'Август 2026', updatedAt: '2026-08-20T10:00:00Z' },
  { id: 'e', status: 'active', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-23T10:00:00Z' },
  { id: 'f', status: 'cancelled', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-22T10:00:00Z' },
];

test('к блоку относятся только его завершённые занятия этого месяца', () => {
  const past = blockSessions(SESSIONS, 'Тренировка № 1', 'Сентябрь 2026');

  assert.deepEqual(past.map((s) => s.id), ['b', 'a'], 'свежие сверху');
});

/**
 * Идущее занятие — ещё не результат, а отменённое не состоялось. Зелёная
 * отметка и кнопка «посмотреть веса» по ним обещали бы несуществующее.
 */
test('незакрытое и отменённое занятия блок выполненным не делают', () => {
  const past = blockSessions(SESSIONS, 'Тренировка № 1', 'Сентябрь 2026');

  assert.equal(past.some((s) => ['e', 'f'].includes(s.id)), false);
});

test('прошлый месяц не красит блок текущего', () => {
  assert.deepEqual(blockSessions(SESSIONS, 'Тренировка № 1', 'Август 2026').map((s) => s.id), ['d']);
});

/**
 * Занятие переименовывают прямо в зале. Название меняется, sourceBlock —
 * нет: иначе блок программы переставал бы считаться выполненным.
 */
test('переименованное занятие остаётся привязанным к своему блоку', () => {
  const renamed = [{
    id: 'x', status: 'completed', title: 'Ноги, спина болит',
    sourceBlock: 'Тренировка № 3', month: 'Сентябрь 2026', updatedAt: '2026-09-18T10:00:00Z',
  }];

  assert.deepEqual(blockSessions(renamed, 'Тренировка № 3', 'Сентябрь 2026').map((s) => s.id), ['x']);
  assert.deepEqual(blockSessions(renamed, 'Ноги, спина болит', 'Сентябрь 2026'), []);
});

test('свободная тренировка ни к одному блоку не относится', () => {
  const free = [{ id: 'y', status: 'completed', sourceBlock: '', month: '', updatedAt: '2026-09-18T10:00:00Z' }];

  assert.deepEqual(blockSessions(free, 'Тренировка № 1', 'Сентябрь 2026'), []);
});
