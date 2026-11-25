/**
 * Экран тренировки в «Библиотеке» (этап 2 макета trainirovki-library-v2,
 * 25.11.2026): упражнения, цифры героя, где начинается суперсет.
 * Чистые функции без React — scripts/test-workout-view-model.mjs.
 */

/** Упражнения тренировки подряд: блоков у тренировки обычно один */
export function exercisesOf(blocks = []) {
  return blocks.flatMap((b) => b.exercises || []);
}

/** Подходов всего; кардио подходами не считается */
export function setsOf(exercises) {
  return exercises.reduce((sum, e) => sum + (e.cardio ? 0 : Math.max(0, parseInt(e.sets, 10) || 0)), 0);
}

/** Подпись «Суперсет» ставим перед первым упражнением каждого суперсета */
export function startsSuperset(exercises, i) {
  const group = exercises[i] && exercises[i].supersetGroup;
  return !!group && (!exercises[i - 1] || exercises[i - 1].supersetGroup !== group);
}
