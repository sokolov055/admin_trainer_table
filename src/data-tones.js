import { sessionQueue } from './program-timeline.js';

/**
 * Цвета-данные экранов тренировок (макет colors-mockup-2026-11-17.html,
 * согласован владельцем 18.11.2026). Чистые функции без React: какой тон у
 * тренировки программы и у группы мышц упражнения. Сами цвета — токены
 * --slot-*, --mg-*, --kind-cardio в styles.css (DESIGN-APP.md, «Токены»).
 */

const isCardioBlock = (b) => !!b && (b.exercises || []).length > 0 && b.exercises.every((e) => e && e.cardio);

/**
 * Тон тренировки программы — по порядку занятий (sessionQueue), как буквы в
 * календаре «Назначить»: 1-е занятие — 0, 2-е — 1… (цвет — по кругу из 6).
 * Занятие только из кардио — 'cardio' и номера не занимает. Одинаковые
 * занятия разных недель — один тон. Возвращает Map: название тренировки → тон
 * (тренировка-добавка «вместе с» получает тон своего занятия).
 */
export function slotTones(blocks) {
  const byKey = new Map();
  const byTitle = new Map();
  let next = 0;
  sessionQueue((blocks || []).filter(Boolean)).forEach((g) => {
    const key = g.map((b) => b.title).join(' + ');
    if (!byKey.has(key)) byKey.set(key, g.every(isCardioBlock) ? 'cardio' : next++);
    g.forEach((b) => { if (!byTitle.has(b.title)) byTitle.set(b.title, byKey.get(key)); });
  });
  return byTitle;
}

/** Класс тона тренировки: 'tone-s0'…'tone-s5', 'tone-cardio'; нет — '' */
export const slotClass = (tone) => (tone === undefined || tone === null || tone === '' ? '' : 'tone-' + (tone === 'cardio' ? 'cardio' : 's' + (tone % 6)));

const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';
/** Буква тренировки, как в календаре «Назначить»: 0 → «А»; кардио — '' */
export const slotLetter = (tone) => (typeof tone === 'number' ? LETTERS[tone % LETTERS.length] : '');

// Группа упражнения из базы («Ноги», «Спина»…) → тон
const GROUP_TONE = {
  'ноги': 'legs', 'ягодицы': 'legs', 'спина': 'back', 'пресс': 'core',
  'грудь': 'chest', 'плечи': 'chest', 'руки': 'arms', 'предплечье': 'arms', 'кардио': 'cardio',
};
// Мышцы фигуры → тон (те же 5 групп, что «Нагрузка на мышцы»)
const ID_TONE = {};
[
  ['legs', ['quadriceps', 'hamstrings', 'adductors', 'abductors', 'calves', 'glutes', 'hip-flexors']],
  ['back', ['lats', 'trapezius', 'lower-back']],
  ['core', ['abs', 'obliques']],
  ['chest', ['chest', 'serratus', 'front-deltoids', 'side-deltoids', 'back-deltoids', 'rotator-cuff']],
  ['arms', ['biceps', 'triceps', 'forearms']],
].forEach(([tone, ids]) => ids.forEach((id) => { ID_TONE[id] = tone; }));

/** Названия групп «Нагрузки на мышцы» → тон */
export const LOAD_GROUP_TONE = { 'Ноги и ягодицы': 'legs', 'Спина': 'back', 'Пресс и кор': 'core', 'Грудь и плечи': 'chest', 'Руки': 'arms' };

/**
 * Тон группы мышц: по группе из базы, иначе по первой основной мышце.
 * «Всё тело» и неизвестное — '' (нейтрально). Принимает упражнение
 * программы ({ cardio, exercise: { muscle }, muscles }) или { group, primary }
 */
export function muscleTone(ex) {
  if (!ex) return '';
  if (ex.cardio) return 'cardio';
  const group = String(ex.group || (ex.exercise && ex.exercise.muscle) || ex.muscle || (ex.load && ex.load.muscle) || '').trim().toLowerCase();
  if (GROUP_TONE[group]) return GROUP_TONE[group];
  if (group) return '';
  const primary = ex.primary || (ex.muscles && ex.muscles.primary) || [];
  return ID_TONE[primary[0]] || '';
}

/** Класс тона мышц: 'tone-legs'…; нет — '' */
export const muscleClass = (tone) => (tone ? 'tone-' + tone : '');
