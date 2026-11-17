import { techniqueOf, techniqueText, trackOf } from '../exercise-track.js';

/**
 * Карточка упражнения в редакторе тренировки (этап 5, 17.11.2026, FT-798):
 * счётчики «− / +», подходы столбиками, «‹ 2 из 6 ›», рекомендация отдыха.
 * Без React — чтобы шаги и подходы проверялись node-тестом
 * (scripts/test-exercise-card.mjs). Что хранится — не меняется: те же
 * sets / reps / weight строками и technique («warmup2 dropset rest90»).
 */

const plain = (v) => String(v ?? '').trim().replace(',', '.');

/** Число из поля: «12», «12,5»; «8–12», «+5», «макс» — не число (NaN) */
export function numOf(v) {
  const s = plain(v);
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const text = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Шаг веса (владелец, 17.11.2026): 2,5 кг; лёгкие гантели до 10 кг — 1 кг.
 * Вверх от 9 — 10, от 10 — 12,5; вниз от 10 — 9. Пусто и «+» — 1 кг.
 * Текст («+5», «макс», «по ощущениям») кнопками не правится — null.
 */
export function stepWeight(value, dir) {
  const s = plain(value);
  if (!s) return dir > 0 ? '1' : null;
  const n = numOf(s);
  if (Number.isNaN(n)) return null;
  const step = (dir > 0 ? n < 10 : n <= 10) ? 1 : 2.5;
  let next = n + dir * step;
  // С неровного веса (11 кг) шаг 2,5 приводит к ровной сетке: 11 → 12,5 / 10
  if (step === 2.5 && Math.abs(n / 2.5 - Math.round(n / 2.5)) > 1e-9) {
    next = dir > 0 ? Math.ceil(n / 2.5) * 2.5 : Math.floor(n / 2.5) * 2.5;
  }
  return next <= 0 ? '' : text(next);
}

/**
 * Повторы: целое ±1 (не меньше 1); диапазон «8–12» сдвигается целиком;
 * время у статики — шагом 5 с. Пусто — предложение (12 повторов, 60 с).
 * Списки «12, 15, 20» и текст — только клавиатурой (null).
 */
export function stepReps(value, dir, timed = false) {
  const s = String(value ?? '').trim();
  const step = timed ? 5 : 1;
  if (!s) return timed ? '60' : '12';
  if (/^\d{1,3}$/.test(s)) return String(Math.max(step, Number(s) + dir * step));
  const range = s.match(/^(\d{1,3})\s*([-–—])\s*(\d{1,3})$/);
  if (range) {
    const a = Number(range[1]) + dir * step;
    const b = Number(range[3]) + dir * step;
    return a >= 1 ? `${a}${range[2]}${b}` : null;
  }
  return null;
}

export const MAX_SETS = 20;
export const MAX_WARMUP = 5;

/** Рабочих подходов: поле «sets»; пусто или мусор — 3, как раньше */
export function workOf(ex) {
  const n = parseInt(String((ex && ex.sets) || ''), 10);
  return n > 0 ? Math.min(MAX_SETS, n) : 3;
}

/** Столбики подходов по порядку: разминочные, рабочие, дропсет — последним */
export function barsOf(ex) {
  const tech = techniqueOf(ex && ex.technique);
  const work = workOf(ex);
  return [
    ...Array.from({ length: tech.warmup }, () => 'warmup'),
    ...Array.from({ length: work }, (_, k) => (k === work - 1 && tech.dropset ? 'drop' : 'work')),
  ];
}

/** «2 разм. + 4 рабочих» — подпись под столбиками */
export function barsText(ex) {
  const tech = techniqueOf(ex && ex.technique);
  const work = workOf(ex);
  const w = work % 10 === 1 && work % 100 !== 11 ? 'рабочий' : 'рабочих';
  return (tech.warmup ? tech.warmup + ' разм. + ' : '') + work + ' ' + w + (tech.dropset ? ', последний — дропсет' : '');
}

/** Значения для patchPlanExercise: разминка, дропсет, подходы */
export function withWarmup(ex, n) {
  const tech = techniqueOf(ex.technique);
  return { technique: techniqueText({ ...tech, warmup: Math.max(0, Math.min(MAX_WARMUP, n)) }) };
}
export function withDrop(ex, on) {
  return { technique: techniqueText({ ...techniqueOf(ex.technique), dropset: !!on }) };
}
export function withSets(ex, n) {
  return { sets: String(Math.max(1, Math.min(MAX_SETS, n))) };
}
export function withRest(ex, seconds) {
  return { technique: techniqueText({ ...techniqueOf(ex.technique), rest: seconds }) };
}
export function withSide(ex, one) {
  return { technique: techniqueText({ ...techniqueOf(ex.technique), side: one ? 'one' : 'two' }) };
}

/** Разминка и дропсет — у силовых; у статики и кардио их нет */
export function canWarmup(ex) {
  const k = trackOf(ex).kind;
  return k === 'strength' || k === 'bodyweight';
}
export function canDrop(ex) {
  return trackOf(ex).kind === 'strength';
}

/** «‹ 2 из 6 ›» — без перехода по кругу: на краях стрелка выключена */
export function navOf(i, n) {
  return { text: `${i + 1} из ${n}`, prev: i > 0 ? i - 1 : -1, next: i < n - 1 ? i + 1 : -1 };
}

/**
 * Рекомендованный отдых — точкой у чипа (как подсказка RestChips): базовым
 * 2–3 минуты, изолирующим — минута-полторы. Изолирующие — по названию
 * (те же слова, что шаг веса в effort.js)
 */
const ISOLATION = ['разгибан', 'сгибан', 'отведен', 'приведен', 'мах', 'разводк', 'сведени', 'бицепс', 'трицепс', 'икр', 'носк', 'пуловер', 'гиперэкст', 'шраг', 'кроссовер', 'скручиван', 'планк', 'пресс'];
export function restAdvice(ex) {
  const k = trackOf(ex).kind;
  if (k === 'cardio') return [];
  const name = String((ex && ex.name) || '').toLowerCase().replace(/ё/g, 'е');
  if (k === 'timed' || ISOLATION.some((w) => name.includes(w))) return [60, 90];
  return [120, 150, 180];
}
