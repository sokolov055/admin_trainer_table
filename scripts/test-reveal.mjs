import test from 'node:test';
import assert from 'node:assert/strict';
import { revealShift } from '../src/reveal.js';

/**
 * Экран — к тому, что появилось после действия (FT-595). Здесь — сам
 * расчёт сдвига; как это выглядит в настоящем браузере (липкая шапка,
 * нижнее меню, перенос истории) — test-reveal-browser.mjs.
 * Видимая часть — от 100 (под шапкой) до 700 (над меню), воздух 12.
 */

test('блок целиком на экране — не двигаем', () => {
  assert.equal(revealShift({ top: 200, bottom: 400 }, 100, 700), 0);
  assert.equal(revealShift({ top: 112, bottom: 688 }, 100, 700), 0);
});

test('блок ниже экрана — поднимаем ровно настолько, чтобы показался низ', () => {
  assert.equal(revealShift({ top: 600, bottom: 900 }, 100, 700), 212);
});

test('блок выше экрана или под шапкой — опускаем к началу', () => {
  assert.equal(revealShift({ top: -500, bottom: -300 }, 100, 700), -612);
  assert.equal(revealShift({ top: 90, bottom: 300 }, 100, 700), -22);
});

test('длинный блок не влезает — показываем начало, а не конец', () => {
  // Низ ушёл на 1500, но начало при этом не должно уехать под шапку
  assert.equal(revealShift({ top: 400, bottom: 1500 }, 100, 700), 288);
  // Начало уже наверху — дальше не листаем, пусть человек читает сверху
  assert.equal(revealShift({ top: 112, bottom: 1500 }, 100, 700), 0);
});
