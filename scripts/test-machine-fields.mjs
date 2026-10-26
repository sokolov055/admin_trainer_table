import test from 'node:test';
import assert from 'node:assert/strict';
import { noteFields, noteSummary, valuesToSave } from '../src/machine-fields.js';

/**
 * Поля настройки тренажёра (FT-760, владелец, 26.10.2026): значения — текст
 * или число; старая строка «Сиденье 5, спинка 3» разбирается по полям
 * тренажёра, что не разобралось — заметкой
 */

const FIELDS = ['Сиденье', 'Спинка', 'Высота блока'];

test('старая строка разбирается по полям, остальное — заметкой', () => {
  const f = noteFields({ text: 'Сиденье 5, спинка: вертикально. Упор левой ногой' }, FIELDS);
  assert.deepEqual(f.values, [{ name: 'Сиденье', value: '5' }, { name: 'Спинка', value: 'вертикально' }, { name: 'Высота блока', value: '' }]);
  assert.equal(f.note, 'Упор левой ногой');
  assert.equal(f.parsed, true);
});

test('похожее начало слова — не поле: «Сиденьем» не «Сиденье», «Высота» не «Высота блока»', () => {
  const f = noteFields({ text: 'Сиденьем ниже, высота 3' }, FIELDS);
  assert.equal(f.parsed, false);
  assert.equal(f.note, 'Сиденьем ниже, высота 3', 'не разобралось — строка целиком');
  assert.equal(noteFields({ text: 'Высота блока 12,5' }, FIELDS).values[2].value, '12', 'запятая — разделитель частей');
  assert.equal(noteFields({ text: 'Высота блока 12.5' }, FIELDS).values[2].value, '12.5', 'точка в числе — не конец фразы');
});

test('записанные полями: сначала поля тренажёра по порядку, потом свои клиента', () => {
  const note = { text: '…', values: [{ name: 'Шаг от стойки', value: '2' }, { name: 'спинка', value: '3' }], note: 'Локти' };
  const f = noteFields(note, FIELDS);
  assert.deepEqual(f.values.map((v) => [v.name, v.value, !!v.own]),
    [['Сиденье', '', false], ['Спинка', '3', false], ['Высота блока', '', false], ['Шаг от стойки', '2', true]]);
  assert.equal(f.note, 'Локти');
  assert.equal(f.parsed, false);
});

test('плашка: до трёх значений строкой, без значений — заметка', () => {
  const note = { text: '', values: [{ name: 'Сиденье', value: '5' }, { name: 'Спинка', value: '3' }, { name: 'Высота блока', value: '12' }, { name: 'Хват', value: 'узкий' }], note: '' };
  assert.equal(noteSummary(note, FIELDS), 'Сиденье 5 · Спинка 3 · Высота блока 12 · …');
  assert.equal(noteSummary({ text: 'Упор на 2-й' }, FIELDS), 'Упор на 2-й');
  assert.equal(noteSummary({ text: 'Сиденье 4' }, []), 'Сиденье 4', 'у тренажёра полей нет — строка как есть');
  assert.equal(noteSummary({ text: 'Сиденье 4' }, FIELDS), 'Сиденье 4');
});

test('на сервер — только заполненные', () => {
  assert.deepEqual(valuesToSave([{ name: 'Сиденье', value: ' 5 ' }, { name: 'Спинка', value: '' }, { name: '', value: '7', own: true }]), [{ name: 'Сиденье', value: '5' }]);
});
