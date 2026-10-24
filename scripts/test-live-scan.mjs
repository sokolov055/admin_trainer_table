// Живой сканер продуктов (FT-732): подсказка поверх камеры по живому тексту
// этикетки и мост к камере приложения. Код телефона проверяет
// mobile/test/food-scanner.test.mjs основного репозитория.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveLabel, LABEL_HINT } from '../src/nutrition/live-label.js';

const FULL = 'Пищевая ценность на 100 г\nБелки 8,5 г Жиры 3 г Углеводы 20,5 г\nЭнергетическая ценность 145 ккал';
const ENGLISH = 'Nutrition facts per 100 g\nEnergy 610 kJ / 145 kcal\nFat 3 g\nCarbohydrate 20.5 g\nProtein 8.5 g';

test('живой текст: без таблицы — общая подсказка, цифры без «на 100 г» — просьба захватить таблицу', () => {
  assert.equal(liveLabel('Молоко 3,2%').hint, LABEL_HINT);
  const digits = liveLabel('Белки 8,5 г\nЖиры 3 г');
  assert.equal(digits.ready, false);
  assert.match(digits.hint, /на 100 г/);
});

test('живой текст: чего не хватает — называем по именам', () => {
  const state = liveLabel('на 100 г\nБелки 8,5 г\nЖиры 3 г');
  assert.equal(state.ready, false);
  assert.match(state.hint, /Есть: белки, жиры/);
  assert.match(state.hint, /Ещё: ккал, углеводы/);
});

test('живой текст: закрываем после двух одинаковых полных кадров, а не по одному', () => {
  const first = liveLabel(FULL);
  assert.equal(first.ready, true);
  assert.equal(first.done, false);
  const second = liveLabel(FULL, first);
  assert.equal(second.done, true);
  // Цифра в кадре другая — ещё не готово
  const other = liveLabel(FULL.replace('145', '146'), first);
  assert.equal(other.done, false);
});

test('живой текст: английская этикетка читается так же', () => {
  const state = liveLabel(ENGLISH, liveLabel(ENGLISH));
  assert.equal(state.done, true);
});

test('лучший кадр помнится, если потом камера увидела меньше', () => {
  const good = liveLabel(FULL);
  const worse = liveLabel('на 100 г\nБелки 8,5 г', good);
  assert.equal(worse.best, FULL);
  assert.equal(worse.bestScore, 5);
});

test('FoodScan: в приложении — камера сразу и «Прикрепить фото» окном телефона, на сайте — прежние файлы', () => {
  const src = readFileSync(new URL('../src/nutrition/FoodScan.jsx', import.meta.url), 'utf8');
  assert.match(src, /if \(native && autoOpened\.current !== start\)[\s\S]*openCamera\(start\)/, 'плитка открывает камеру сама');
  assert.match(src, /native\.plugin\.scan\(/);
  assert.match(src, /native\.plugin\.pickPhoto\(/);
  assert.match(src, /reason === 'gallery'/);
  assert.match(src, /capture="environment"/, 'сайт снимает через выбор файла, как раньше');
  // Подсказку «как снять» в приложении заменяет подсказка поверх камеры
  assert.match(src, /native === null && !image/);
});

test('мост: нет модуля или он не отвечает — сканер как на сайте', async () => {
  const { nativeScanner } = await import('../src/native-scan.js');
  assert.equal(await nativeScanner(), null);
});
