import { trackOf, cardioGoal, intervalsTotals, phasesOf, phaseKeys } from './exercise-track.js';

/**
 * Разные круги суперсета (этап 5, шаг 2, 17.11.2026, FT-798; согласовано
 * владельцем в макете exercise-editor-2026-11-17, вкладка «5 · Круги»).
 *
 * Что хранится:
 *   повторы и вес по кругам — тем же полем строкой через запятую:
 *     reps «12, 15, 20», weight «6, 8, 10» (вес с дробью — «7,5, 10, 12,5»);
 *   кардио по кругам — новое поле плана cardio.perRound (старых программ
 *     у него нет — всё как раньше):
 *     { goal: 'intervals' | 'time' | 'distance' | 'kcal', goals: '3, 4, 5',
 *       load: 'speed' | 'level', loads: '35, 38, 40' }
 *     goal 'intervals' — число ускорений (кругов интервалов); нагрузка у
 *     функционального кардио — у первого интервала (ускорения).
 *
 * Круг k (с нуля) берёт k-е значение; список короче кругов — последнее.
 * Занятие (workout-model.js fromPlan), часы (server lib/watch-workout.js) и
 * редактор (ExerciseCard, RoundsTable) читают это только отсюда. Копия —
 * server/src/lib/round-plan.js: правите здесь — перенесите туда.
 */

export const MAX_ROUNDS = 20;
export const ROUND_GOALS = ['intervals', 'kcal', 'time', 'distance'];
export const ROUND_LOADS = ['speed', 'level'];

const clean = (v) => String(v ?? '').trim();

/**
 * Список по кругам: у повторов разделитель — любая запятая, «;», «/», «→»
 * («12,15,20» — тоже список); у веса и кардио запятая без пробела — дробь
 * («12,5» — одно число), список — «, », «;», «/», «→».
 * Одно значение — null; пустой круг — '' (не задано).
 */
export function roundList(value, kind = 'reps') {
  const s = clean(value);
  if (!s) return null;
  const parts = s.split(kind === 'reps' ? /\s*[,;/→]\s*/ : /\s*(?:,\s+|;|\/|→)\s*/).map(clean);
  // Пустой круг («12, , 20» — стёрли число в клетке) — «не задано», а не
  // одно значение: иначе вся строка копировалась в каждый круг и росла
  // при каждой правке (владелец, 18.11.2026)
  if (parts.length < 2 || parts.every((p) => !p)) return null;
  return parts;
}

export const isRoundList = (value, kind = 'reps') => !!roundList(value, kind);

/** Значение круга k: список — k-е (короче — последнее), иначе само значение */
export function roundValue(value, k, kind = 'reps') {
  const list = roundList(value, kind);
  if (!list) return clean(value);
  return list[Math.min(Math.max(0, k), list.length - 1)];
}

/** Список строкой — как хранится: «12, 15, 20» */
export const listText = (values) => values.map(clean).join(', ');

const num = (v) => {
  const s = clean(v).replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};
const text = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Рабочий вес плана одним числом — где нужно одно (прогресс, «+2,5» к
 * прошлому разу): у лесенки «6, 8, 10» — наибольший. Не число — NaN
 */
export function topWeight(value) {
  const list = roundList(value, 'weight') || [clean(value)];
  // Число в начале: «80 кг», «+5», «80-85» → 80 (как parseFloat раньше)
  const lead = (v) => { const m = v.match(/^\+?\s*(\d+(?:[.,]\d+)?)/); return m ? Number(m[1].replace(',', '.')) : NaN; };
  const nums = list.map(lead).filter((n) => !Number.isNaN(n));
  return nums.length ? Math.max(...nums) : NaN;
}

/* ==========================================================================
 * Кардио по кругам
 * ========================================================================== */

/** Цель кардио по кругам по умолчанию — главная цель плана */
export function defaultGoal(cardio) {
  const g = cardioGoal(cardio || {});
  return ROUND_GOALS.includes(g) ? g : 'time';
}

/** Нагрузка по умолчанию: тренер выбрал уровень без скорости — уровень */
export function defaultLoad(cardio) {
  const modes = Array.isArray(cardio && cardio.modes) ? cardio.modes : [];
  return modes.includes('level') && !modes.includes('speed') ? 'level' : 'speed';
}

/** perRound плана с ключами по умолчанию; нет — пустой */
export function perRoundOf(cardio) {
  const pr = (cardio && cardio.perRound) || {};
  return {
    goal: ROUND_GOALS.includes(pr.goal) ? pr.goal : defaultGoal(cardio),
    goals: clean(pr.goals),
    load: ROUND_LOADS.includes(pr.load) ? pr.load : defaultLoad(cardio),
    loads: clean(pr.loads),
  };
}

/** Значение цели или нагрузки кардио «как на всех кругах» — из самого плана */
export function cardioBase(cardio, field, key) {
  const c = cardio || {};
  if (field === 'goal') {
    if (key === 'intervals') return c.intervals && c.intervals.rounds ? String(c.intervals.rounds) : '';
    return clean(c.targets && c.targets[key]);
  }
  if (c.intervals && cardioGoal(c) === 'intervals') {
    const first = phasesOf(c.intervals)[0];
    return clean(first && first[key]);
  }
  return clean(c.settings && c.settings[key]);
}

/**
 * Записать «как на всех кругах» в план кардио: цель — в intervals.rounds
 * или targets, нагрузку — в настройки или в первый интервал
 */
export function withCardioBase(cardio, field, key, value) {
  const c = { ...(cardio || {}) };
  const v = clean(value);
  if (field === 'goal') {
    if (key === 'intervals') {
      const n = Math.floor(num(v));
      if (c.intervals && n >= 1 && n <= 50) c.intervals = { ...c.intervals, rounds: n };
      return c;
    }
    c.targets = { ...(c.targets || {}), [key]: v };
    return c;
  }
  if (c.intervals && cardioGoal(c) === 'intervals') {
    const phases = phasesOf(c.intervals);
    if (phases.length) {
      const first = phases[0];
      const fields = phaseKeys(first);
      const { fast, slow, ...rest } = c.intervals;
      c.intervals = { ...rest, phases: [{ ...first, fields: fields.includes(key) ? fields : [...fields, key], [key]: v }, ...phases.slice(1)] };
    }
    return c;
  }
  c.settings = { ...(c.settings || {}), [key]: v };
  return c;
}

/** Цель и нагрузка кардио на круге k: { goal: [ключ, значение] | null, load: … } */
export function cardioRound(cardio, k) {
  const pr = perRoundOf(cardio);
  return {
    goal: pr.goals ? [pr.goal, roundValue(pr.goals, k, 'cardio')] : null,
    load: pr.loads ? [pr.load, roundValue(pr.loads, k, 'cardio')] : null,
  };
}

/* ==========================================================================
 * Занятие: значение своего круга в подход
 * ========================================================================== */

const plain = (v) => clean(v).replace(/^\+\s*/, '').replace(',', '.');
const isNum = (v) => /^\d+(\.\d+)?$/.test(plain(v));

/**
 * Подходы занятия получают значение своего круга (владелец, 17.11.2026:
 * «на 2-м круге в подход сразу встают 15 повторов и 8 кг, у аэробайка — 4
 * ускорения на скорости 38»). Круг — номер рабочего подхода (у пары — свой
 * у каждого). Значения по кругам — явный план тренера, поэтому вес круга
 * важнее прошлого раза: один «прошлый вес» лесенку не передаёт.
 *   e  — упражнение программы; ex — упражнение занятия с подходами
 *   target у подхода — повторы круга: по ним «не добил» и «перевыполнил»
 *   (effort.js), а не по первому числу списка
 */
export function withRounds(e, ex) {
  const track = trackOf(e);
  const repsList = track.kind !== 'cardio' ? roundList(e.reps, 'reps') : null;
  const weightList = track.kind !== 'cardio' ? roundList(e.weight, 'weight') : null;
  const pr = track.kind === 'cardio' && e.cardio ? perRoundOf(e.cardio) : null;
  const cardio = pr && (pr.goals || pr.loads);
  if (!repsList && !weightList && !cardio) return ex;
  const counter = {};
  const key = track.weightMode === 'assistance' ? 'assist' : 'weight';
  const sets = ex.sets.map((s) => {
    if (s.kind === 'warmup') return s;
    const who = s.who || '';
    const k = counter[who] || 0;
    counter[who] = k + 1;
    const out = { ...s };
    if (repsList) {
      const r = roundValue(e.reps, k, 'reps');
      const lead = r.match(/^(\d{1,3})/);
      if (track.kind === 'timed') {
        const t = r.match(/^(\d{1,3}(:[0-5]\d){0,2})/);
        if (t) out.time = t[1];
      } else if (lead) {
        out.reps = lead[1];
        out.target = lead[1];
      }
    }
    if (weightList && !s.who) {
      const w = roundValue(e.weight, k, 'weight');
      if (isNum(w)) out[key] = plain(w);
    }
    if (cardio) {
      const { goal, load } = cardioRound(e.cardio, k);
      const functional = !!e.cardio.intervals && cardioGoal(e.cardio) === 'intervals';
      let iv = functional ? (s.intervals || e.cardio.intervals) : null;
      if (goal && isNum(goal[1])) {
        const [g, v] = goal;
        if (g === 'intervals') {
          if (iv) iv = { ...iv, rounds: Math.min(50, Math.max(1, Math.floor(Number(plain(v))))) };
        } else if (g === 'time') {
          out.time = plain(v);
        } else {
          out[g] = plain(v);
        }
      }
      if (load && isNum(load[1])) {
        const [l, v] = load;
        if (iv) {
          const phases = phasesOf(iv);
          if (phases.length) {
            const first = phases[0];
            const fields = phaseKeys(first);
            const { fast, slow, ...rest } = iv;
            iv = { ...rest, phases: [{ ...first, fields: fields.includes(l) ? fields : [...fields, l], [l]: String(v).replace(',', '.') }, ...phases.slice(1)] };
          }
        } else {
          out[l] = plain(v);
        }
      }
      if (iv && iv !== (s.intervals || e.cardio.intervals)) {
        out.intervals = iv;
        Object.assign(out, intervalsTotals(iv, track));
      }
    }
    return out;
  });
  return { ...ex, sets };
}

/* ==========================================================================
 * Число кругов изменилось
 * ========================================================================== */

/**
 * «＋» у «Круги» дописывает круг, продолжая шаг (12, 15, 20 → 12, 15, 20, 25);
 * «−» убирает последний. Не список — без изменений
 */
export function resizeList(value, n, kind = 'reps') {
  const list = roundList(value, kind);
  if (!list || n < 1) return value;
  const out = list.slice(0, Math.max(n, 1));
  while (out.length < n) {
    const a = num(out[out.length - 2]);
    const b = num(out[out.length - 1]);
    out.push(Number.isNaN(a) || Number.isNaN(b) ? out[out.length - 1] : text(Math.max(0, b + (b - a))));
  }
  return out.length < 2 ? out[0] : listText(out);
}

/** Что поменять у упражнения программы, когда кругов (подходов) стало n */
export function resizeRounds(e, n) {
  const out = {};
  ['reps', 'weight'].forEach((f) => {
    if (roundList(e[f], f)) out[f] = resizeList(e[f], n, f);
  });
  const pr = e.cardio && e.cardio.perRound;
  if (pr && (pr.goals || pr.loads)) {
    out.cardio = {
      ...e.cardio,
      perRound: {
        ...pr,
        ...(pr.goals ? { goals: resizeList(pr.goals, n, 'cardio') } : {}),
        ...(pr.loads ? { loads: resizeList(pr.loads, n, 'cardio') } : {}),
      },
    };
  }
  return out;
}
