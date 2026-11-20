// «Сегодня» в питании (макет nutrition-redesign-2026-11-20, этап 1): чистые функции
import test from 'node:test';
import assert from 'node:assert/strict';
import { weekOf, dayTone, mealTarget, foodEmoji, glassCount, glassDelta, finishFace, fullStreak } from '../src/nutrition/today-model.js';

test('неделя — с понедельника по воскресенье, в том числе через месяц и год', () => {
  assert.deepEqual(weekOf('2026-11-20'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.equal(weekOf('2026-11-16')[0], '2026-11-16', 'понедельник — сам');
  assert.equal(weekOf('2026-11-22')[0], '2026-11-16', 'воскресенье — в той же неделе');
  assert.deepEqual([weekOf('2027-01-01')[0], weekOf('2027-01-01')[6]], ['2026-12-28', '2027-01-03']);
});

test('тон дня: коридор ±12 %, пусто, без нормы', () => {
  assert.equal(dayTone(0, 2000), 'empty');
  assert.equal(dayTone(1760, 2000), 'good'); assert.equal(dayTone(2240, 2000), 'good');
  assert.equal(dayTone(1759, 2000), 'under'); assert.equal(dayTone(2241, 2000), 'over');
  assert.equal(dayTone(500, 0), 'neutral'); assert.equal(dayTone(500, undefined), 'neutral');
});

test('норма приёма: своя доля или 25/35/30/10', () => {
  assert.equal(mealTarget('breakfast', 2000), 500);
  assert.equal(mealTarget('snack', 2000), 200);
  assert.equal(mealTarget('lunch', 2000, { lunch: 50 }), 1000);
  assert.equal(mealTarget('dinner', 2000, { dinner: 0 }), 0, 'ноль — тоже выбор человека');
  assert.equal(mealTarget('lunch', 0), 0);
});

test('значок еды: блюдо раньше продукта, неизвестное — тарелка', () => {
  assert.equal(foodEmoji('Куриный суп'), '🍲');
  assert.equal(foodEmoji('Филе куриное'), '🍗');
  assert.equal(foodEmoji('Творог 5 %'), '🥛');
  assert.equal(foodEmoji('Овсянка на молоке'), '🥣');
  assert.equal(foodEmoji('Ёжик'), '🍽️');
  assert.equal(foodEmoji(undefined), '🍽️');
});

test('стаканы: восемь на 2 л, сверх нормы — на один больше; касание наливает или убирает последний', () => {
  assert.equal(glassCount(0), 8); assert.equal(glassCount(2000), 9); assert.equal(glassCount(2600), 11);
  assert.equal(glassDelta(0, 0), 250);
  assert.equal(glassDelta(4, 1000), 250, 'следующий пустой');
  assert.equal(glassDelta(6, 1000), 750, 'дальний пустой — налить до него');
  assert.equal(glassDelta(3, 1000), -250, 'последний полный — убрать');
  assert.equal(glassDelta(1, 1000), 0, 'полный в середине — не трогаем');
  assert.equal(glassDelta(4, 1100), 250, 'неполный стакан (100 мл) не считается полным');
});

test('итог дня и серия полных дней', () => {
  assert.equal(finishFace(1950, 2000).emoji, '🎯');
  assert.equal(finishFace(2600, 2000).tone, 'over');
  assert.equal(finishFace(900, 2000).tone, 'under');
  assert.equal(finishFace(900, 0).emoji, '✅');
  const days = [{ day: '2026-11-16', complete: true }, { day: '2026-11-17', complete: false }, { day: '2026-11-18', complete: true }, { day: '2026-11-19', complete: true }, { day: '2026-11-20', complete: false }];
  assert.equal(fullStreak(days, '2026-11-19'), 2);
  assert.equal(fullStreak(days, '2026-11-20'), 0);
  assert.equal(fullStreak(undefined, '2026-11-20'), 0);
});
