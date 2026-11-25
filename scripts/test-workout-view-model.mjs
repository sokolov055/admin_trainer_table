import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exercisesOf, setsOf, startsSuperset } from '../src/trainer/workout-view-model.js';

const ex = (over) => ({ name: 'Упражнение', sets: '3', reps: '10', ...over });

test('упражнения склеиваются по блокам, подходы без кардио', () => {
  const blocks = [
    { exercises: [ex({ sets: '4' }), ex({ sets: '3' })] },
    { exercises: [ex({ cardio: { mode: 'x' }, sets: '' }), ex({ sets: 'два' })] },
  ];
  assert.equal(exercisesOf(blocks).length, 4);
  assert.equal(setsOf(exercisesOf(blocks)), 4 + 3 + 0 + 0, 'кардио и нечисло не дают подходов');
  assert.deepEqual(exercisesOf(undefined), []);
});

test('подпись «Суперсет» — только перед первым упражнением группы', () => {
  const xs = [
    ex(), ex({ supersetGroup: 'a' }), ex({ supersetGroup: 'a' }),
    ex({ supersetGroup: 'b' }), ex(),
  ];
  assert.deepEqual(xs.map((_, i) => startsSuperset(xs, i)), [false, true, false, true, false]);
});
