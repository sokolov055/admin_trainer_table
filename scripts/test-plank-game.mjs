import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, CATEGORIES, shuffledQuestions, judgeAnswer, makeDeck } from '../src/plank-game.js';
import { createPlankSession } from '../src/plank-session.js';
import { enterFullscreen } from '../src/game-feel.js';

test('викторина: правильный ответ до дедлайна, ошибка и истечение времени', () => {
  const q = QUESTIONS[0];
  assert.equal(judgeAnswer(q, q.correct, 10000, 9999), 'correct');
  assert.equal(judgeAnswer(q, (q.correct + 1) % 3, 10000, 9999), 'wrong');
  assert.equal(judgeAnswer(q, q.correct, 10000, 10000), 'timeout');
});
test('240 вопросов: шесть категорий, четыре сложности, непустые и уникальные варианты', () => {
  assert.equal(QUESTIONS.length, 240);
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, 240);
  assert.equal(new Set(QUESTIONS.map(q => q.text)).size, 240);
  for (const c of CATEGORIES) for (let level = 1; level <= 4; level++) {
    assert.equal(QUESTIONS.filter(q => q.category === c.id && q.level === level).length, 10);
    const deck = makeDeck(c.id, level);
    assert.equal(deck.length, 10);
    for (const q of deck) {
      assert.equal(new Set(q.answers).size, 3);
      const original = QUESTIONS.find(original => original.id === q.id);
      assert.equal(q.answers[q.correct], original.answers[original.correct]);
      assert.ok(q.why);
    }
  }
  const mixed = makeDeck(); assert.equal(mixed.length, 240);
  assert.equal(new Set(mixed.map(q => q.id)).size, 240);
  assert.deepEqual(mixed.map(q => q.level), mixed.map(q => q.level).sort());
});

test('рестарт после проигрыша не повторяет показанные вопросы до исчерпания подборки', () => {
  const s = createPlankSession(); s.configure({ category: 'food', level: 1 });
  const ids = new Set();
  for (let i = 0; i < 10; i++) {
    s.start(0, () => .5);
    const q = s.getSnapshot().round.deck[0];
    assert.ok(!ids.has(q.id)); ids.add(q.id);
    s.answer((q.correct + 1) % 3, 1000);
  }
  assert.equal(ids.size, 10);
  s.start(0); assert.equal(s.getSnapshot().seen.length, 1, 'новый цикл сбрасывает только выбранную подборку');
  assert.equal(s.getSnapshot().round.deck.length, 10);
});

test('конец отдыха сохраняет тот же вопрос, варианты, счёт и точный остаток; новый экран продолжает', () => {
  const s = createPlankSession(); s.configure({ category: 'gym', level: 1 }); s.claim('rest-1', 0); s.start(0);
  let r = s.getSnapshot().round; s.answer(r.deck[0].correct, 1000); s.next(2000);
  r = s.getSnapshot().round;
  s.release('rest-1', 8000, 6000); // экран отрисовался с задержкой в 2 секунды
  const paused = s.getSnapshot().round;
  assert.equal(paused.status, 'paused'); assert.equal(paused.pauseReason, 'rest');
  assert.equal(paused.remaining, 6000); assert.equal(paused.score, 1); assert.equal(paused.index, 1);
  assert.deepEqual(paused.deck, r.deck);
  s.claim('rest-2', 90000); s.resume(90000);
  assert.equal(s.getSnapshot().round.deadline, 96000);
  s.answer(r.deck[1].correct, 95000);
  assert.equal(s.getSnapshot().round.score, 2);
});

test('приоритет дедлайнов: отдых раньше вопроса ставит паузу, просроченный ответ остаётся проигрышем', () => {
  const s = createPlankSession(); s.configure({ category: 'gym', level: 1 }); s.start(0);
  s.tick(12000, 5000); assert.equal(s.getSnapshot().round.status, 'paused');
  assert.equal(s.getSnapshot().round.remaining, 5000);
  s.start(0); s.tick(12000, 11000); assert.equal(s.getSnapshot().round.status, 'lost');
  s.start(0); s.tick(10000, 10000); assert.equal(s.getSnapshot().round.status, 'paused');
  s.start(0); s.pause('manual', 10000); assert.equal(s.getSnapshot().round.status, 'lost');
});

test('пауза не дублирует ответ; скрытый экран не может забрать чужую партию; кабинеты изолированы', () => {
  const s = createPlankSession(); s.configure({ category: 'gym', level: 1 }); s.claim('menu', 0); s.start(0);
  const q = s.getSnapshot().round.deck[0]; s.answer(q.correct, 1000); s.answer(q.correct, 1000);
  assert.equal(s.getSnapshot().round.score, 1);
  s.claim('rest', 2000); s.release('menu', 3000);
  assert.equal(s.getSnapshot().owner, 'rest'); assert.equal(s.getSnapshot().round.pausedFrom, 'feedback');
  s.resume(50000); s.next(50000); assert.equal(s.getSnapshot().round.index, 1);
  const other = createPlankSession(); assert.equal(other.getSnapshot().round, null); assert.deepEqual(other.getSnapshot().seen, []);
});

test('прерывание аудио не запускает таймер и не оживляет закрытую партию', () => {
  const s = createPlankSession(); s.configure({ category: 'music', level: 4 });
  s.start(0, () => .9999);
  const r = s.getSnapshot().round; assert.equal(r.status, 'listening');
  s.pause('rest', 1000, 1000); s.listened(r, 4000);
  assert.equal(s.getSnapshot().round.status, 'paused');
  s.resume(90000); assert.equal(s.getSnapshot().round.status, 'listening');
  s.listened(s.getSnapshot().round, 91000);
  assert.equal(s.getSnapshot().round.deadline, 101000);
});
test('колода содержит каждый вопрос ровно один раз и не меняет исходник', () => {
  const original = [...QUESTIONS];
  const deck = shuffledQuestions(() => 0);
  assert.deepEqual(new Set(deck), new Set(QUESTIONS));
  assert.equal(deck.length, QUESTIONS.length);
  assert.deepEqual(QUESTIONS, original);
  for (const q of QUESTIONS) assert.ok(q.correct >= 0 && q.correct < q.answers.length);
});

test('игра просит весь экран только в браузере: в приложении iPhone иначе плашка «capacitor://localhost открыто на весь экран»', () => {
  let asked = 0;
  const scene = { requestFullscreen: () => { asked++; return Promise.resolve(); } };
  const node = { closest: sel => (sel === '.game-shell' ? scene : null) };
  const before = { window: globalThis.window, document: globalThis.document };
  globalThis.document = { fullscreenElement: null };
  try {
    globalThis.window = { Capacitor: { isNativePlatform: () => true } };
    enterFullscreen(node);
    assert.equal(asked, 0);
    globalThis.window = {};
    enterFullscreen(node);
    assert.equal(asked, 1);
  } finally {
    globalThis.window = before.window;
    globalThis.document = before.document;
  }
});
