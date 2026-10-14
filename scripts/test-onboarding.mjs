import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, canAdvance } from '../src/client/onboarding-model.js';
test('каждый шаг требует свой допустимый ответ; следующий ответ не пропускает предыдущий', () => {
  assert.equal(QUESTIONS.length, 4);
  assert.equal(canAdvance({ days: 2 }, 0), false);
  assert.equal(canAdvance({ goal: 'fitness' }, 0), true);
  assert.equal(canAdvance({ days: 7 }, 3), false);
  assert.equal(canAdvance({ days: 2 }, 3), true);
  assert.equal(canAdvance({}, 4), false);
});
