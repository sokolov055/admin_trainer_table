/**
 * Наборы для игр (22.10.2026): вопросы «Тренера в планке» и уровни «Блинов»
 * из «Управление → Игры» дополняют встроенное, номера встроенных уровней не
 * сдвигаются; закрытый набор действует только у владельца на примерке.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
};

const packs = await import('../src/game-packs-store.js');
const plank = await import('../src/plank-game.js');
const blini = await import('../src/blini-model.js');
const { readPackFile } = await import('../src/trainer/admin-model.js');

const quiz = {
  format: 'fittrack-game', game: 'plank', id: 'protein-quiz', name: 'Белок',
  categories: [{ id: 'protein', name: 'Белок' }],
  questions: [
    { category: 'protein', level: 1, text: 'Где больше белка?', right: 'Творог', wrong: ['Огурец', 'Яблоко'], why: 'В твороге около 17 г.' },
    { category: 'food', level: 2, text: 'Сколько ккал в 1 г белка?', right: 'Около 4', wrong: ['Около 9', 'Около 7'], why: 'Около 4 ккал.' },
  ],
};
const round = {
  format: 'fittrack-game', game: 'blini', id: 'round-4', name: 'Четвёртый круг',
  levels: [
    { track: 'stadium', speed: 0.7, start: 0.35, target: 3400, colors: 5, slow: 2, powerEvery: 1200, par: 110 },
    { track: 'couch', speed: 0.16, start: 0.4, target: 0, colors: 5, slow: 2, powerEvery: 1200, par: 80, rail: true, rampAt: 0, boss: { hp: 12 } },
  ],
};

const builtInQuestions = plank.QUESTIONS.length;
const builtInLevels = blini.LEVELS.length;

test('открытый набор вопросов — в банке и в колоде своей темы', () => {
  packs.setGamePacks({ packs: [quiz] });
  assert.equal(plank.QUESTIONS.length, builtInQuestions + 2);
  assert.ok(plank.CATEGORIES.some((c) => c.id === 'protein' && c.name === 'Белок'));
  const deck = plank.makeDeck('protein', 0, () => 0.5);
  assert.equal(deck.length, 1);
  assert.equal(deck[0].answers[deck[0].correct], 'Творог', 'верный ответ остаётся верным после перемешивания');
  assert.equal(deck[0].id, 'protein-quiz-1');
});

test('открытый набор уровней — после 15-го, встроенные на местах, босс работает', () => {
  const third = blini.LEVELS[2];
  packs.setGamePacks({ packs: [quiz, round] });
  assert.equal(blini.LEVELS.length, builtInLevels + 2);
  assert.equal(blini.LEVELS[2], third, 'встроенные номера не сдвинулись');
  const rules = blini.levelRules(builtInLevels + 1);
  assert.equal(rules.boss.hp, 12);
  assert.equal(rules.rail, true);
  const game = blini.createBlini(7, builtInLevels);
  assert.ok(game);
});

test('закрытый: у людей нет, у владельца — только на примерке', () => {
  packs.setGamePacks({ packs: [{ ...quiz, closed: true }] });
  assert.equal(plank.QUESTIONS.length, builtInQuestions, 'без trial закрытый не действует');
  packs.setGamePacks({ packs: [{ ...quiz, closed: true }], trial: true });
  assert.equal(plank.QUESTIONS.length, builtInQuestions, 'владелец ещё не примерил');
  packs.setTried('protein-quiz', true);
  assert.ok(packs.isTried('protein-quiz'));
  assert.equal(plank.QUESTIONS.length, builtInQuestions + 2);
  packs.setTried('protein-quiz', false);
  assert.equal(plank.QUESTIONS.length, builtInQuestions);
  packs.setGamePacks({ packs: [] });
  assert.equal(blini.LEVELS.length, builtInLevels);
});

test('файл набора на телефоне: что внутри — до загрузки', () => {
  const q = readPackFile('﻿' + JSON.stringify(quiz));
  assert.equal(q.pack.summary, '2 вопр., новых тем 1');
  assert.equal(q.pack.preview[0].text, 'Где больше белка?');
  const b = readPackFile(JSON.stringify(round));
  assert.equal(b.pack.preview[1].text, 'Гостиная · Диван 12 ♥ · норматив 80 с');
  assert.match(readPackFile('{oops').error, /JSON/);
  assert.match(readPackFile(JSON.stringify({ ...quiz, format: 'x' })).error, /не файл набора/);
  assert.match(readPackFile(JSON.stringify({ ...quiz, questions: [] })).error, /нет вопросов/);
});
