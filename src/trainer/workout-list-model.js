/**
 * Список тренировок в «Библиотеке» (25.11.2026, этап 1 макета): поиск, цель и
 * фильтры листа. Порядок и цвета целей — общие с программами. Чистые функции
 * без React — проверяются scripts/test-workout-list.mjs.
 */

import { sorted } from './program-list-model.js';

export const WORKOUT_NO_FILTERS = { show: '', sort: 'recent' };

/** Число на кнопке «Фильтры»: показ — единственный фильтр, порядок — не фильтр */
export function workoutFilterCount(f) {
  return f.show ? 1 : 0;
}

/** Совпадает ли тренировка с поиском, целью и «Показать» */
export function matchesWorkout(t, { q = '', goal = '', show = '' } = {}) {
  const query = q.trim().toLowerCase();
  if (query && !(t.title + ' ' + (t.goal || '')).toLowerCase().includes(query)) return false;
  if (goal && t.goal !== goal) return false;
  if (show === 'inprog' && !(t.inPrograms || []).length) return false;
  if (show === 'shared' && !t.isPublic) return false;
  return true;
}

export function shownWorkouts(list, { q = '', goal = '', filters = WORKOUT_NO_FILTERS } = {}) {
  const found = (list || []).filter((t) => matchesWorkout(t, { q, goal, show: filters.show }));
  return sorted(found, filters.sort);
}
