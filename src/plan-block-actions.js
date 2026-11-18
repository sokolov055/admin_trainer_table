import { techniqueOf, techniqueText } from './exercise-track.js';
import { resizeRounds } from './round-plan.js';

/** Копия тренировки не наследует связь с проведёнными занятиями. */
export function copyPlanBlocks(blocks, indices, stamp = Date.now()) {
  const next = blocks.map((block) => ({ ...block, exercises: block.exercises.map((exercise) => ({ ...exercise })) }));
  const selected = [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < next.length)
    .sort((a, b) => a - b);
  const copies = selected.map((index) => {
    const source = next[index];
    const copiedGroups = new Map();
    return {
      ...source,
      id: '',
      exercises: source.exercises.map((exercise) => ({
        ...exercise,
        supersetGroup: exercise.supersetGroup
          ? copiedGroups.get(exercise.supersetGroup)
            || (() => {
              const copied = exercise.supersetGroup + '-c' + stamp + '-' + index + '-' + copiedGroups.size;
              copiedGroups.set(exercise.supersetGroup, copied);
              return copied;
            })()
          : '',
      })),
    };
  });
  return next.concat(copies);
}

/**
 * У суперсета число рабочих и разминочных кругов общее. Дропсет остаётся
 * свойством конкретного упражнения, поэтому при синхронизации его сохраняем.
 */
export function patchPlanExercise(exercises, index, values) {
  const next = exercises.map((exercise) => ({ ...exercise }));
  const current = next[index];
  if (!current) return next;
  Object.assign(current, values);
  const group = current.supersetGroup;
  // Кругов (подходов) стало больше — значения «по кругам» продолжают шаг
  // (12, 15, 20 → 25), меньше — последний убирается (этап 5, 17.11.2026)
  const rounds = 'sets' in values ? parseInt(values.sets, 10) : 0;
  const resize = (exercise) => { if (rounds > 0) Object.assign(exercise, resizeRounds(exercise, rounds)); };
  resize(current);
  if (!group) return next;

  if ('sets' in values) {
    next.forEach((exercise) => {
      if (exercise.supersetGroup !== group) return;
      exercise.sets = values.sets;
      if (exercise !== current) resize(exercise);
    });
  }
  if ('technique' in values) {
    const warmup = techniqueOf(values.technique).warmup;
    next.forEach((exercise, exerciseIndex) => {
      if (exerciseIndex === index || exercise.supersetGroup !== group) return;
      const own = techniqueOf(exercise.technique);
      exercise.technique = techniqueText({ ...own, warmup });
    });
  }
  return next;
}

/** Параметры узкой правки названия уже завершённого занятия. */
export function workoutRenameParams(session, title, requestId) {
  return {
    session: { ...session, title },
    revision: session.revision,
    requestId,
    baseTitle: session.title,
  };
}
