import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeksOf, muscleLoad, gapsLine, schemeOf, clientsLine, LOAD_WORD } from '../src/trainer/program-view-model.js';

/** Экран программы «Библиотеки» (этап 2, 17.11.2026) */

const leg = { muscles: { primary: ['quadriceps', 'glutes'], secondary: ['hamstrings'] }, sets: '4' };
const back = { muscles: { primary: ['lats'], secondary: ['biceps'] }, sets: '3' };

test('недели: вкладки с нагрузкой, без недель — одна без номера', () => {
  const weeks = weeksOf({ weekLength: 3, blocks: [
    { title: 'А', week: 1, exercises: [] }, { title: 'Б', week: 2, load: 'heavy', exercises: [] },
    { title: 'В', week: 2, load: 'heavy', exercises: [] },
  ] });
  assert.deepEqual(weeks.map((w) => [w.n, w.load, w.items.map((i) => i.index)]), [[1, '', [0]], [2, 'heavy', [1, 2]], [3, '', []]]);
  assert.equal(LOAD_WORD[weeks[1].load], '+ вес');
  const flat = weeksOf({ blocks: [{ title: 'А', exercises: [] }, { title: 'Б', exercises: [] }] });
  assert.equal(flat.length, 1);
  assert.equal(flat[0].n, 0);
  assert.equal(flat[0].items.length, 2);
});

test('нагрузка на мышцы за всю программу: полоски от самой нагруженной и пробелы', () => {
  const { bars, gaps } = muscleLoad([{ exercises: [leg, leg] }, { exercises: [back] }]);
  assert.equal(bars[0].label, 'Ноги и ягодицы');
  assert.equal(bars[0].share, 1);
  assert.ok(bars[1].share < 1 && bars[1].share > 0);
  assert.ok(bars.length <= 4);
  assert.ok(gaps.includes('грудь') && gaps.includes('бицепс'), 'синергист — не основная нагрузка');
  assert.ok(!gaps.includes('ягодицы'));
  assert.deepEqual(muscleLoad([{ exercises: [{ name: 'Без разметки', sets: '3' }] }]).gaps, [], 'без разметки пробелы не выдумываем');
  assert.equal(gapsLine(['бицепс', 'икры']), 'Бицепс, икры');
  assert.equal(gapsLine(['а', 'б', 'в', 'г', 'д', 'е']), 'А, б, в, г и ещё 2');
});

test('схема плашками и строка клиентов', () => {
  assert.deepEqual(schemeOf({ sets: '4', reps: '10', weight: '40' }), ['4×10', '40 кг']);
  assert.deepEqual(schemeOf({ sets: '3', reps: '', weight: '' }), ['3']);
  assert.deepEqual(schemeOf({ sets: '3', reps: '12', weight: 'резинка' }), ['3×12', 'резинка']);
  assert.equal(clientsLine([{ name: 'Анна Ковалёва', week: 2 }, { name: 'Мария', week: 3 }, { name: 'Елена', week: 2 }]), 'Анна, Мария, Елена · неделя 2–3');
  assert.equal(clientsLine([{ name: 'Дмитрий', week: 1 }]), 'Дмитрий · неделя 1');
  assert.equal(clientsLine([{ name: 'Дмитрий' }]), 'Дмитрий');
});
