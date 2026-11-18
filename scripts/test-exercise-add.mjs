import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupsOf, chipsOf, startChip, shownOf, newName, togglePick, addLabel, rowsOf, CHIP_ALL, CHIP_RECENT, RECENT_MAX,
} from '../src/trainer/exercise-add-model.js';

/** Лист «＋ Упражнения» (этап 5, шаг 3, 18.11.2026) */

const BASE = [
  { id: 1, name: 'Тяга верхнего блока', muscle: 'Спина', muscles: { primary: ['lats'], secondary: ['biceps'] }, uses: 5 },
  { id: 2, name: 'Жим лёжа', muscle: 'Грудь', muscles: { primary: ['chest'], secondary: ['triceps'] }, uses: 9 },
  { id: 3, name: 'Присед со штангой', muscle: '', muscles: { primary: ['quadriceps', 'glutes'], secondary: [] }, uses: 0 },
  { id: 4, name: 'Гиперэкстензия', muscle: 'Спина', muscles: { primary: ['lower-back'], secondary: [] } },
  { id: 5, name: 'Беговая дорожка', muscle: 'Кардио', muscles: { primary: [], secondary: [] }, track: { kind: 'cardio', machine: 'treadmill' }, uses: 1 },
  { id: 6, name: '  ', muscle: 'Спина', uses: 50 },
];
const ids = (list) => list.map((e) => e.id);

test('группы — из основных мышц и поля «мышца»; синергист не в счёт', () => {
  assert.deepEqual([...groupsOf(BASE[0])], ['Спина']);
  assert.deepEqual([...groupsOf(BASE[2])].sort(), ['Ноги', 'Ягодицы']);
  assert.deepEqual([...groupsOf(BASE[4])], []);
  assert.deepEqual([...groupsOf(null)], []);
});

test('плашки: «Недавние» первой, только если тренер что-то ставил; пустых групп нет', () => {
  assert.deepEqual(chipsOf(BASE).map((c) => c.label), ['Недавние', 'Все', 'Спина', 'Грудь', 'Ноги', 'Ягодицы']);
  const fresh = BASE.map((e) => ({ ...e, uses: 0 }));
  assert.equal(chipsOf(fresh)[0].id, CHIP_ALL);
  assert.equal(startChip(BASE), CHIP_RECENT);
  assert.equal(startChip(fresh), CHIP_ALL);
});

test('«Недавние» — чаще поставленные, без пустых названий, не больше 12', () => {
  assert.deepEqual(ids(shownOf(BASE, { chip: CHIP_RECENT })), [2, 1, 5]);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: 'Упр ' + i, uses: i + 1 }));
  const recent = shownOf(many, { chip: CHIP_RECENT });
  assert.equal(recent.length, RECENT_MAX);
  assert.equal(recent[0].id, 129);
});

test('«Все» — по алфавиту, группа — сначала частые', () => {
  assert.deepEqual(ids(shownOf(BASE, { chip: CHIP_ALL })), [5, 4, 2, 3, 1]);
  assert.deepEqual(ids(shownOf(BASE, { chip: 'Спина' })), [1, 4]);
});

test('поиск: слова в любом порядке, ё = е, начало названия выше, по всей базе при любой плашке', () => {
  assert.deepEqual(ids(shownOf(BASE, { q: 'лежа жим' })), [2]);
  assert.deepEqual(ids(shownOf(BASE, { q: 'тяга', chip: CHIP_RECENT })), [1], 'в «Недавних» ищет по всей базе');
  const list = [{ id: 1, name: 'Обратная тяга', uses: 9 }, { id: 2, name: 'Тяга гантели' }];
  assert.deepEqual(ids(shownOf(list, { q: 'тяга' })), [2, 1]);
  assert.deepEqual(ids(shownOf(BASE, { q: 'тяга', chip: 'Ноги' })), [1]);
});

test('«＋ Новое» — от трёх букв и только если такого нет', () => {
  assert.equal(newName(BASE, 'Тяга Т-грифа  '), 'Тяга Т-грифа');
  assert.equal(newName(BASE, 'жим лежа'), '');
  assert.equal(newName(BASE, 'ab'), '');
  assert.equal(newName(BASE, ''), '');
});

test('отметки: номер — порядок отметки; снятая выпадает, остальные сдвигаются', () => {
  let p = [];
  p = togglePick(p, 3); p = togglePick(p, 1); p = togglePick(p, 2);
  assert.deepEqual(p, [3, 1, 2]);
  p = togglePick(p, 1);
  assert.deepEqual(p, [3, 2]);
  assert.equal(addLabel(3), 'Добавить 3 · по 3 × 12');
  assert.equal(addLabel(0), 'Отметьте упражнения');
});

test('строки — в порядке отметки, из базы, 3 × 12; кардио — отрезком', () => {
  const blank = () => ({ name: '', sets: '3', reps: '', weight: '', supersetGroup: '', exerciseId: null, cardio: null });
  const cardio = (machine) => ({ machine, segments: [] });
  const rows = rowsOf([2, 5, 99, 1], BASE, { blank, cardio });
  assert.deepEqual(rows.map((r) => r.name), ['Жим лёжа', 'Беговая дорожка', 'Тяга верхнего блока']);
  assert.equal(rows[0].exerciseId, 2);
  assert.equal(rows[0].sets, '3');
  assert.equal(rows[0].reps, '12');
  assert.equal(rows[0].cardio, null);
  assert.equal(rows[0].supersetGroup, '');
  assert.deepEqual(rows[0].muscles, BASE[1].muscles);
  assert.equal(rows[1].sets, '1');
  assert.equal(rows[1].reps, '');
  assert.deepEqual(rows[1].cardio, { machine: 'treadmill', segments: [] });
});
