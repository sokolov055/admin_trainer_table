/**
 * Углеводы блюда и дня (FT-709, 22.10.2026). Без React — проверяется
 * scripts/test-carbs.mjs.
 *
 * Уровень углеводов блюда не размечается руками: он считается из КБЖУ
 * порции — какая доля калорий приходится на углеводы (4 ккал на грамм).
 * Доля не зависит от размера порции, поэтому так же считается и для
 * своего рецепта на 100 г. Пороги подобраны по 131 блюду сервера
 * (dish-seed-*.js): «мало» — меньше 30 % (44 блюда, есть в каждом приёме),
 * «много» — от 45 % (40), между — «средне» (47). При ориентире «мало ≤ 25 %»
 * обедов с малым количеством углеводов не было бы вовсе.
 */

export const CARB_LOW = 0.30;
export const CARB_HIGH = 0.45;

export const CARB_LEVELS = [
  { id: 'high', label: 'Много', tag: 'углеводов много' },
  { id: 'mid', label: 'Средне', tag: 'углеводов средне' },
  { id: 'low', label: 'Мало', tag: 'углеводов мало' },
];

/** Доля калорий из углеводов; нет калорий — null */
export function carbShare(p) {
  const kcal = Number(p && p.kcal), carbs = Number(p && p.carbs);
  if (!(kcal > 0) || !Number.isFinite(carbs)) return null;
  return (carbs * 4) / kcal;
}

/** 'high' | 'mid' | 'low' | null — по КБЖУ порции (per блюда или строка каталога) */
export function carbLevel(p) {
  const share = carbShare(p);
  if (share === null) return null;
  return share >= CARB_HIGH ? 'high' : share < CARB_LOW ? 'low' : 'mid';
}

export const carbTag = (level) => (CARB_LEVELS.find((l) => l.id === level) || {}).tag || '';

/* ==================================================================
 * Углеводы по дням тренировок
 * ================================================================== */

/** Шаги настройки тренера; 0 — выключено. Те же, что на сервере (lib/carb-days.js) */
export const CARB_CYCLE_STEPS = [10, 15, 20, 25, 30];
export const CARB_CYCLE_DEFAULT = 20;
const FAT_FLOOR = 0.6;

/**
 * Цель дня из базовой — копия server/src/lib/carb-days.js (сервер сверяет
 * их тестом carb-days.test.js). Здесь — для предпросмотра у тренера и демо.
 */
export function cycleTargets(base, kind, percent) {
  const plain = base ? { kcal: base.kcal, protein: base.protein, fat: base.fat, carbs: base.carbs } : base;
  if (!base || !percent || !kind || !(Number(base.carbs) > 0)) return plain;
  const carbs = Number(base.carbs), fat = Number(base.fat) || 0;
  let delta = Math.round(carbs * percent / 100);
  if (kind === 'train') delta = Math.min(delta, Math.max(0, Math.floor((fat - fat * FAT_FLOOR) * 9 / 4)));
  else delta = -delta;
  return { ...plain, carbs: Math.round(carbs + delta), fat: Math.round(fat - delta * 4 / 9) };
}

/** Какие блюда предлагать первыми: в день тренировки — с углеводами, в день отдыха — без */
export function preferredLevel(carbDay) {
  if (!carbDay) return null;
  return carbDay.kind === 'train' ? 'high' : carbDay.kind === 'rest' ? 'low' : null;
}

/**
 * Приёмы до и после занятия. Время приёмов — обычный день: завтрак в 8,
 * обед в 13, перекус в 16, ужин в 19. Для подсказки, а не для правила.
 */
const MEAL_HOURS = [['breakfast', 8], ['lunch', 13], ['snack', 16], ['dinner', 19]];
const MEAL_WORDS = { breakfast: 'завтрак', lunch: 'обед', snack: 'перекус', dinner: 'ужин' };
export function aroundTraining(at) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(at || ''));
  if (!m) return null;
  const hour = Number(m[1]) + Number(m[2]) / 60;
  const before = [...MEAL_HOURS].reverse().find(([, h]) => h <= hour - 1);
  const after = MEAL_HOURS.find(([, h]) => h >= hour + 1);
  return { before: before ? before[0] : null, after: after ? after[0] : null };
}

/**
 * Одна строка, почему подбор такой. today — выбран сегодняшний день
 * («Сегодня тренировка»), иначе «В этот день».
 */
export function carbDayLine(carbDay, { today = true } = {}) {
  if (!carbDay || !carbDay.kind) return '';
  const when = today ? 'Сегодня' : 'В этот день';
  if (carbDay.kind === 'rest') return when + ' отдых — сначала блюда, где углеводов меньше.';
  const near = aroundTraining(carbDay.at);
  const meals = near ? [near.before && 'в ' + MEAL_WORDS[near.before] + ' до неё', near.after && 'в ' + MEAL_WORDS[near.after] + ' после'].filter(Boolean) : [];
  return when + ' тренировка' + (carbDay.at ? ' в ' + carbDay.at : '') + ' — больше углеводов'
    + (meals.length ? ', особенно ' + meals.join(' и ') : '') + '.';
}

/** Пояснение к цели дня, когда тренер включил углеводы по дням */
export function carbTargetLine(carbDay) {
  if (!carbDay || !carbDay.percent) return '';
  if (carbDay.kind === 'train') return 'День тренировки: углеводов на ' + carbDay.percent + ' % больше, жиров меньше — калории и белок те же.';
  if (carbDay.kind === 'rest') return 'День отдыха: углеводов на ' + carbDay.percent + ' % меньше, жиров больше — калории и белок те же.';
  return 'Тренер включил углеводы по дням тренировок, но занятий в расписании нет — цель обычная.';
}
