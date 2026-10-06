import { techniqueOf, techniqueText } from './exercise-track.js';

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
  if (!group) return next;

  if ('sets' in values) {
    next.forEach((exercise) => {
      if (exercise.supersetGroup === group) exercise.sets = values.sets;
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
