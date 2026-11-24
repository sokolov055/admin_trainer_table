/**
 * Список упражнений библиотеки (этап 1): чистое представление каталога.
 * Данные, права и личные версии общих упражнений не меняются — только отбор и порядок.
 */
import { KIND_LABELS } from '../exercise-track.js';

export const NO_EXERCISE_FILTERS = { load: '', gear: '', media: false, noSetup: false, sort: 'recent' };

export const LOAD_TILES = [
  ['strength', KIND_LABELS.strength],
  ['bodyweight', 'Свой вес'],
  ['timed', KIND_LABELS.timed],
  ['cardio', KIND_LABELS.cardio],
  ['assistance', 'Вес помощи'],
];

const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

/** Включённые фильтры листа; мышцы (чипы) и порядок в счётчик не входят */
export const exerciseFilterCount = (f) => Number(!!f.load) + Number(!!f.gear) + Number(!!f.media) + Number(!!f.noSetup);

/** Ключ способа учёта нагрузки: «вес помощи» — отдельный, хотя вид у него «свой вес» */
export const loadKey = (e) => (e.track?.weightMode === 'assistance' ? 'assistance' : e.track?.kind || 'strength');

export const loadLabel = (e) => (LOAD_TILES.find(([key]) => key === loadKey(e)) || LOAD_TILES[0])[1];

const hasGear = (e, kind) => (e.machines || []).some((m) => m.kind === kind);

export function shownExercises(list, { scope = 'mine', q = '', muscle = '', filters = NO_EXERCISE_FILTERS } = {}) {
  const query = norm(q);
  const shown = list
    .filter((e) => !!e.mine === (scope === 'mine'))
    .filter((e) => !muscle || (muscle === '—' ? !e.muscle : e.muscle === muscle))
    .filter((e) => !filters.load || loadKey(e) === filters.load)
    .filter((e) => !filters.gear || (filters.gear === 'none' ? !(e.machines || []).length : hasGear(e, filters.gear)))
    .filter((e) => !filters.media || !!e.media)
    .filter((e) => !filters.noSetup || !String(e.setup || '').trim())
    .filter((e) => !query || [e.name, e.muscle, e.equipment].some((s) => norm(s).includes(query)));
  // Дат у упражнений нет: недавние — с наибольшим номером записи
  if (!filters.sort || filters.sort === 'recent') shown.sort((a, b) => (b.id || 0) - (a.id || 0));
  if (filters.sort === 'az') shown.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return shown;
}
