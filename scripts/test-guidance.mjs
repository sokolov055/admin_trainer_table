// Раздел «Тренажёр и техника», вариант А (18.10.2026): одна нумерация,
// повторы из карточки тренажёра и техники — один раз, ошибки — одним списком
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guideSteps, stepLabel } from '../src/equipment-guidance.js';

const belt = 'Стопы — чуть шире плеч.\nПояс — пристегните к рычагу.\nКолени — туда же, куда носки.\nОшибка: сводить колени внутрь.';

test('техника слово в слово как настройка — один список, одна ошибка', () => {
  const r = guideSteps({ setup: belt, notes: belt, mistakes: 'сводить колени внутрь' });
  assert.equal(r.prep.length, 3);
  assert.deepEqual(r.move, []);
  assert.deepEqual(r.mistakes, ['Сводить колени внутрь.']);
});

test('совпадение без учёта регистра и знаков; разные ошибки — обе', () => {
  const r = guideSteps({ setup: 'Сиденье — рукояти на уровне плеч.\nОшибка: разное положение рычагов.', notes: 'сиденье — рукояти на уровне плеч\nГрудь — прижата к опоре.', mistakes: 'Раскачивать корпус.' });
  assert.deepEqual(r.prep, ['Сиденье — рукояти на уровне плеч.']);
  assert.deepEqual(r.move, ['Грудь — прижата к опоре.']);
  assert.deepEqual(r.mistakes, ['Разное положение рычагов.', 'Раскачивать корпус.']);
});

test('без тренажёра — только движение', () => {
  const r = guideSteps({ setup: '', notes: 'Вдох внизу.\nВыдох наверху.', mistakes: '' });
  assert.deepEqual(r.prep, []);
  assert.equal(r.move.length, 2);
});

test('метка шага — короткое слово до тире', () => {
  assert.deepEqual(stepLabel('Сиденье — на уровне плеч'), { label: 'Сиденье', text: 'на уровне плеч' });
  assert.equal(stepLabel('Для разведения рук (задние дельты) — лицом к подушке').label, '');
  assert.equal(stepLabel('Плавно опускайтесь вниз').label, '');
});
