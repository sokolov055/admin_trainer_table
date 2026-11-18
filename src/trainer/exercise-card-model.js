import { techniqueOf, techniqueText, trackOf, metricField } from '../exercise-track.js';
import {
  roundList, roundValue, listText, perRoundOf, cardioBase, withCardioBase, MAX_ROUNDS,
} from '../round-plan.js';

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

/* ==========================================================================
 * Суперсет звеньями и круги «по кругам» (этап 5, шаг 2, 17.11.2026)
 * ========================================================================== */

/** Буква суперсета в тренировке: первый — А, второй — Б… */
const LETTERS = 'АБВГДЕЖЗИКЛМН';
export function groupLetter(list, group) {
  const groups = [];
  list.forEach((e, k) => {
    const g = e.supersetGroup;
    if (!g || groups.includes(g)) return;
    const next = list[k + 1];
    const prev = list[k - 1];
    if ((next && next.supersetGroup === g) || (prev && prev.supersetGroup === g)) groups.push(g);
  });
  const i = groups.indexOf(group);
  return LETTERS[i < 0 ? 0 : i % LETTERS.length];
}

/** Номера упражнений суперсета (подряд, как в списке) */
export function groupMembers(list, index) {
  const g = list[index] && list[index].supersetGroup;
  if (!g) return [index];
  let a = index;
  let b = index;
  while (a > 0 && list[a - 1].supersetGroup === g) a -= 1;
  while (b < list.length - 1 && list[b + 1].supersetGroup === g) b += 1;
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}

/**
 * Разобрать суперсет нажатием на звено между i и i + 1: верх и низ — два
 * суперсета, часть из одного упражнения — уже не суперсет
 */
export function splitGroupAt(list, i, stamp = Date.now()) {
  const next = list.map((e) => ({ ...e }));
  const g = next[i] && next[i].supersetGroup;
  if (!g || !next[i + 1] || next[i + 1].supersetGroup !== g) return next;
  const idx = groupMembers(next, i);
  const top = idx.filter((k) => k <= i);
  const bottom = idx.filter((k) => k > i);
  const fresh = g + '-' + stamp.toString(36);
  bottom.forEach((k) => { next[k].supersetGroup = bottom.length > 1 ? fresh : ''; });
  if (top.length < 2) top.forEach((k) => { next[k].supersetGroup = ''; });
  return next;
}

/** Что у упражнения может меняться по кругам: силовые — повторы и вес, кардио — цель и нагрузка */
export function roundFields(ex) {
  return trackOf(ex).kind === 'cardio' ? ['goal', 'load'] : ['reps', 'weight'];
}

const KIND = { reps: 'reps', weight: 'weight', goal: 'cardio', load: 'cardio' };
const isCardioField = (f) => f === 'goal' || f === 'load';

/** Сырой текст поля: «12, 15, 20» или «12»; у кардио — perRound.goals / loads */
function rawOf(ex, field) {
  if (isCardioField(field)) return perRoundOf(ex.cardio)[field + 's'];
  return String((ex && ex[field]) ?? '').trim();
}

/** Меняется ли поле по кругам */
export function varies(ex, field) {
  return !!roundList(rawOf(ex, field), KIND[field]);
}

/** Значение «как на всех кругах» */
export function baseOf(ex, field) {
  if (isCardioField(field)) {
    const pr = perRoundOf(ex.cardio);
    return cardioBase(ex.cardio, field, pr[field]);
  }
  return roundValue(rawOf(ex, field), 0, KIND[field]);
}

/** Значения по кругам — ровно n штук */
export function roundValues(ex, field, n) {
  const raw = rawOf(ex, field);
  const list = roundList(raw, KIND[field]);
  if (!list) {
    const base = isCardioField(field) && raw ? raw : baseOf(ex, field);
    return Array.from({ length: n }, () => base);
  }
  return Array.from({ length: n }, (_, k) => roundValue(raw, k, KIND[field]));
}

/** Записать значения по кругам — что передать в patchPlanExercise */
export function withRoundValues(ex, field, values) {
  if (!isCardioField(field)) return { [field]: listText(values) };
  const pr = perRoundOf(ex.cardio);
  return { cardio: { ...(ex.cardio || {}), perRound: { ...pr, [field + 's']: listText(values) } } };
}

/** Перестать менять поле по кругам: всем кругам — значение первого */
export function flatField(ex, field, n) {
  const first = roundValues(ex, field, Math.max(1, n))[0];
  if (!isCardioField(field)) return { [field]: first };
  const pr = perRoundOf(ex.cardio);
  const cardio = withCardioBase(ex.cardio, field, pr[field], first);
  const rest = { ...pr, [field + 's']: '' };
  cardio.perRound = rest.goals || rest.loads ? rest : null;
  return { cardio };
}

/** Включить или выключить «меняется по кругам» */
export function toggleField(ex, field, n, on) {
  if (!on) return flatField(ex, field, n);
  return withRoundValues(ex, field, roundValues(ex, field, Math.max(2, n)).slice(0, Math.max(2, n)));
}

/** Сменить, что именно у кардио меняется: цель (ускорения, ккал…) или нагрузка (скорость, уровень) */
export function withCardioKey(ex, field, key, n) {
  const pr = perRoundOf(ex.cardio);
  const was = pr[field + 's'];
  const next = { ...pr, [field]: key };
  if (was) {
    const base = cardioBase(ex.cardio, field, key);
    next[field + 's'] = listText(Array.from({ length: Math.max(2, n) }, () => base));
  }
  return { cardio: { ...(ex.cardio || {}), perRound: next } };
}

/** Подпись и единица значения в клетке */
export function fieldMeta(ex, field) {
  const track = trackOf(ex);
  const pr = perRoundOf(ex.cardio);
  if (field === 'reps') return track.kind === 'timed' ? { label: 'Время', unit: 'с', short: 'с' } : { label: 'Повторы', unit: 'повт', short: 'повт' };
  if (field === 'weight') return { label: track.kind === 'strength' ? 'Вес' : 'Доп. вес', unit: 'кг', short: 'кг' };
  if (field === 'goal') {
    if (pr.goal === 'intervals') return { label: 'Ускорения', unit: 'ускор.', short: 'ускор.' };
    const f = metricField(pr.goal, track);
    return { label: f.short, unit: f.unit, short: f.unit };
  }
  if (pr.load === 'level') return { label: 'Уровень', unit: 'ур.', short: 'ур' };
  return { label: 'Скорость', unit: track.speedUnit === 'rpm' ? 'об/мин' : 'км/ч', short: 'ск' };
}

/** Цели и нагрузки кардио, которые можно менять по кругам */
export const CARDIO_GOALS = [['intervals', 'ускорения'], ['kcal', 'ккал'], ['time', 'время'], ['distance', 'дистанция']];
export const CARDIO_LOADS = [['speed', 'скорость'], ['level', 'уровень']];

/** Шаг кнопок «− / +» у кардио по кругам */
function cardioUnit(ex, field, value) {
  const pr = perRoundOf(ex.cardio);
  if (field === 'load') return pr.load === 'speed' && trackOf(ex).speedUnit === 'rpm' ? 5 : pr.load === 'speed' ? 0.5 : 1;
  if (pr.goal === 'kcal') return 5;
  if (pr.goal === 'distance') return metricField('distance', trackOf(ex)).unit === 'м' ? 50 : (numOf(value) < 2 ? 0.1 : 0.5);
  return 1;
}

/** Значение клетки «− / +»: повторы, вес (шаг 2,5 / 1), цель и нагрузка кардио; не число — null */
export function stepCell(ex, field, value, dir) {
  if (field === 'reps') return stepReps(value, dir, trackOf(ex).kind === 'timed');
  if (field === 'weight') return stepWeight(value, dir);
  const unit = cardioUnit(ex, field, value);
  const s = plain(value);
  if (!s) return dir > 0 ? text(unit) : null;
  const n = numOf(s);
  if (Number.isNaN(n)) return null;
  const next = Math.round((n + dir * unit) * 100) / 100;
  return next <= 0 ? null : text(next);
}

/** Шаг лесенки: разница первых двух кругов (не лесенка — 0) */
export function ladderStep(values) {
  if (values.length < 2) return 0;
  const a = numOf(values[0]);
  const b = numOf(values[1]);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.round((b - a) * 100) / 100;
}

/** Единица шага лесенки: повторы 1, вес 2,5 (лёгкий, до 10 кг, — 1), кардио — как «− / +» */
function ladderUnit(ex, field, first) {
  if (field === 'reps') return trackOf(ex).kind === 'timed' ? 5 : 1;
  if (field === 'weight') return numOf(first) < 10 ? 1 : 2.5;
  return cardioUnit(ex, field, first);
}

/**
 * «шаг − / +»: «+3» превращает 12 в 12 → 15 → 18, «−» — лесенка вниз.
 * От первого круга; меньше нуля (повторы — меньше 1) не опускается
 */
export function withLadder(ex, field, n, dir) {
  const values = roundValues(ex, field, Math.max(2, n));
  const first = numOf(values[0]);
  if (Number.isNaN(first)) return null;
  const step = Math.round((ladderStep(values) + dir * ladderUnit(ex, field, values[0])) * 100) / 100;
  const min = field === 'reps' ? 1 : 0;
  const next = values.map((_, c) => {
    const v = Math.round((first + step * c) * 100) / 100;
    return v < min ? text(min) : text(v);
  });
  return withRoundValues(ex, field, next);
}

/**
 * Одно значение круга — без разделителей списка, иначе круг делится на два:
 * у повторов не бывает и запятой, у веса и кардио «7,5» — дробь, а «7, 5»
 * и запятая в конце — разделители (18.11.2026)
 */
export function oneValue(field, value) {
  const v = String(value ?? '');
  return (field === 'reps' ? v.replace(/[,;/→]/g, ' ') : v.replace(/[;/→]/g, ' ').replace(/,(?=\s|$)/g, ' ').replace(/,\s+/g, ','))
    .replace(/\s+/g, ' ').trim();
}

/** Поменять значение круга k (кнопкой или клавиатурой); поле само становится «по кругам» */
export function withCell(ex, field, n, k, value) {
  const values = roundValues(ex, field, Math.max(2, n));
  values[k] = oneValue(field, value);
  return withRoundValues(ex, field, values);
}

/** Есть ли в суперсете что-то «по кругам» */
export function groupVaries(list, idx) {
  return idx.some((k) => roundFields(list[k]).some((f) => varies(list[k], f)));
}

export { MAX_ROUNDS };
