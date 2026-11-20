/**
 * Пропуск упражнения и «Позже» (src/workout-skip.js, макет
 * progress-skip-chat-2026-11-19, владелец 20.11.2026).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { canSkip, skipExercise, unskipExercise, postponeExercise, skippedList, skipText } from '../src/workout-skip.js';

const ex = (id, states, extra = {}) => ({ id, name: 'Упр ' + id, sets: states.map((state) => ({ state, weight: '10', reps: '' })), ...extra });

test('пропустить: несделанные — «пропущен», сделанные остаются, причина у упражнения', () => {
  const list = [ex('a', ['done', 'pending', 'pending']), ex('b', ['pending'])];
  const next = skipExercise(list, 'a', 'busy');
  assert.deepEqual(next[0].sets.map((s) => s.state), ['done', 'skipped', 'skipped']);
  assert.equal(next[0].skip, 'busy');
  assert.equal(next[1], list[1], 'другие упражнения не трогаются');
  assert.equal(skipExercise(list, 'a', 'колено').find((e) => e.id === 'a').skip, 'yes', 'чужая причина — «без причины»');
});

test('вернуть: пропущенные снова ждут, причины нет, «закрытые» тоже возвращаются', () => {
  const skipped = skipExercise([ex('a', ['done', 'pending'])], 'a', 'pain');
  skipped[0].sets[1].closed = true;
  const back = unskipExercise(skipped, 'a');
  assert.deepEqual(back[0].sets.map((s) => s.state), ['done', 'pending']);
  assert.equal('skip' in back[0], false);
  assert.equal('closed' in back[0].sets[1], false);
});

test('позже: в конец списка с пометкой', () => {
  const next = postponeExercise([ex('a', ['pending']), ex('b', ['pending']), ex('c', ['pending'])], 'a');
  assert.deepEqual(next.map((e) => e.id), ['b', 'c', 'a']);
  assert.equal(next[2].later, true);
});

test('что можно пропустить и итог словами', () => {
  assert.equal(canSkip(ex('a', ['done', 'done'])), false, 'всё сделано');
  assert.equal(canSkip(ex('a', ['pending'], { supersetGroup: 'A' })), false, 'суперсет — своим «Пропустить круг»');
  assert.equal(canSkip(ex('a', ['pending'])), true);
  assert.deepEqual(skippedList([ex('a', [], { skip: 'busy' }), ex('b', []), ex('c', [], { skip: 'yes' })]), ['Упр a (тренажёр занят)', 'Упр c']);
  assert.equal(skipText('pain'), 'Болит');
});
