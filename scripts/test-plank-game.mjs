import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, CATEGORIES, shuffledQuestions, judgeAnswer, makeDeck } from '../src/plank-game.js';

test('викторина: правильный ответ до дедлайна, ошибка и истечение времени', () => {
  const q = QUESTIONS[0];
  assert.equal(judgeAnswer(q, q.correct, 10000, 9999), 'correct');
  assert.equal(judgeAnswer(q, (q.correct + 1) % 3, 10000, 9999), 'wrong');
  assert.equal(judgeAnswer(q, q.correct, 10000, 10000), 'timeout');
});
test('120 вопросов: шесть категорий, четыре сложности, непустые и уникальные варианты', () => {
  assert.equal(QUESTIONS.length, 120);
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, 120);
  assert.equal(new Set(QUESTIONS.map(q => q.text)).size, 120);
  for (const c of CATEGORIES) for (let level = 1; level <= 4; level++) {
    assert.equal(QUESTIONS.filter(q => q.category === c.id && q.level === level).length, 5);
    const deck = makeDeck(c.id, level);
    assert.equal(deck.length, 5);
    for (const q of deck) {
      assert.equal(new Set(q.answers).size, 3);
      const original = QUESTIONS.find(original => original.id === q.id);
      assert.equal(q.answers[q.correct], original.answers[original.correct]);
      assert.ok(q.why);
    }
  }
  const mixed = makeDeck(); assert.equal(mixed.length, 10);
  assert.equal(new Set(mixed.map(q => q.id)).size, 10);
  assert.deepEqual(mixed.map(q => q.level), mixed.map(q => q.level).sort());
});
test('колода содержит каждый вопрос ровно один раз и не меняет исходник', () => {
  const original = [...QUESTIONS];
  const deck = shuffledQuestions(() => 0);
  assert.deepEqual(new Set(deck), new Set(QUESTIONS));
  assert.equal(deck.length, QUESTIONS.length);
  assert.deepEqual(QUESTIONS, original);
  for (const q of QUESTIONS) assert.ok(q.correct >= 0 && q.correct < q.answers.length);
});
