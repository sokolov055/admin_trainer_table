/**
 * Данные о здоровье одним разрешением (FT-708, решение владельца 22.10.2026)
 * — чистые функции без телефона и React: что спрашивать на этом устройстве,
 * спрашивать ли вообще, как разложить сон, пульс, вес и калории по дням и
 * что показать на экране. Телефон читает их в native-steps.js, экраны —
 * client/HealthConnect.jsx и client/HealthDaily.jsx.
 *
 * scope:
 *   'full'  — устройство умеет все типы: iPhone со сборкой 26+, Android
 *             (Health Connect) с versionCode 11+;
 *   'basic' — только шаги и тренировки: старая сборка или Huawei Health.
 * Новые типы прописаны в Info.plist и манифесте только новых сборок —
 * старая на просьбу прочитать сон молча ничего не выдала бы.
 */

/** Редакция отдельного согласия на данные о здоровье (/health-consent.html) */
export const HEALTH_CONSENT_VERSION = '2026-10-22';
export const IOS_FULL_BUILD = 26;
export const ANDROID_FULL_BUILD = 11;

/** Что умеет устройство: 'full', 'basic' или '' — «Здоровья» здесь нет */
export function healthScope({ platform, build, huawei = false, available = true }) {
  if (!available || (platform !== 'ios' && platform !== 'android')) return '';
  if (huawei) return 'basic';
  const b = Number(build) || 0;
  return b >= (platform === 'ios' ? IOS_FULL_BUILD : ANDROID_FULL_BUILD) ? 'full' : 'basic';
}

/**
 * Показать ли экран «Здоровье» при входе. Один раз: 'declined' — никогда;
 * не спрашивали — да; дали только шаги и тренировки ('basic'), а телефон
 * теперь умеет больше — ещё раз, тоже один раз (fullAsked — уже показали
 * на полном устройстве и человек снова выбрал без согласия). Дали всё, а
 * согласие сервер больше не считает действующим (сменилась редакция) — тоже
 * спрашиваем.
 */
export function shouldAskHealth({ access, deviceScope, fullAsked = false }) {
  if (!access || !deviceScope) return false;
  const decision = access.decision || '';
  if (decision === 'declined') return false;
  if (!decision) return true;
  if (decision !== 'granted' || deviceScope !== 'full') return false;
  // Дали всё, но согласие устарело (новая редакция документа) — как впервые
  if (access.scope === 'full') return !access.consent;
  return !fullAsked;
}

/** Только шаги и тренировки — как до FT-708 (на Android с калориями и дистанцией тренировок) */
const BASIC = {
  ios: ['steps', 'workouts'],
  android: ['steps', 'workouts', 'calories', 'totalCalories', 'distance'],
};
/**
 * Новые типы. totalCalories на iPhone плагин читает как активные — там его
 * не просим, а общий расход складываем из активных и базового обмена
 * (basalCalories, решение владельца 22.10.2026). На Android общий расход
 * Health Connect даёт сам — базовый обмен там не нужен
 */
const EXTRA = ['calories', 'totalCalories', 'basalCalories', 'sleep', 'restingHeartRate', 'heartRateVariability', 'heartRate', 'weight', 'bodyFat', 'height', 'vo2Max'];
const IOS_SKIP = new Set(['totalCalories']);
const ANDROID_SKIP = new Set(['basalCalories']);
/** То, что приходит раз в день, — без шагов, тренировок и пульса на тренировке */
export const DAILY_TYPES = ['sleep', 'restingHeartRate', 'heartRateVariability', 'calories', 'totalCalories', 'basalCalories', 'weight', 'bodyFat', 'vo2Max', 'height'];

/** Список на одно системное окно */
export function healthReads(platform, scope, withWorkouts = true) {
  let list = [...BASIC[platform === 'ios' ? 'ios' : 'android']];
  if (!withWorkouts) list = ['steps'];
  const skip = platform === 'ios' ? IOS_SKIP : ANDROID_SKIP;
  if (scope === 'full') list.push(...EXTRA.filter((t) => !skip.has(t)));
  return [...new Set(list)];
}

export function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayOf = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : localDate(d);
};
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Сон по дням. Ночь относится к дню пробуждения (дата конца): «прошлая
 * ночь» — сон, который закончился сегодня.
 *
 * iPhone отдаёт отрезки по одному на фазу (asleep/light/deep/rem/awake и
 * inBed от телефона), Android — сессию целиком со списком фаз. Часы и
 * телефон пишут одну ночь каждый по-своему; сложить их — удвоить сон,
 * поэтому за ночь берём один источник: с фазами, а из них — где сна больше.
 * «В кровати» (inBed) — только когда сна от часов нет совсем.
 */
export function sleepByDay(samples) {
  const nights = new Map(); // date → Map(source → суммы)
  for (const s of samples || []) {
    const date = dayOf(s.endDate);
    if (!date) continue;
    const source = s.sourceId || s.sourceName || '';
    const parts = Array.isArray(s.stages) && s.stages.length
      ? s.stages
      : [{ stage: s.sleepState || 'asleep', durationMinutes: s.value }];
    if (!nights.has(date)) nights.set(date, new Map());
    const bySource = nights.get(date);
    const acc = bySource.get(source) || { deep: 0, rem: 0, light: 0, asleep: 0, awake: 0, inBed: 0 };
    for (const p of parts) {
      const min = num(p.durationMinutes);
      if (!min || min < 0) continue;
      const key = p.stage in acc ? p.stage : 'asleep';
      acc[key] += min;
    }
    bySource.set(source, acc);
  }
  const out = {};
  for (const [date, bySource] of nights) {
    let best = null;
    for (const acc of bySource.values()) {
      const phases = acc.deep + acc.rem + acc.light;
      const total = phases + acc.asleep;
      const score = [phases > 0 ? 1 : 0, total, acc.inBed];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && (score[1] > best.score[1] || (score[1] === best.score[1] && score[2] > best.score[2])))) {
        best = { acc, score };
      }
    }
    const a = best.acc;
    const phases = a.deep + a.rem + a.light;
    const sleep = phases + a.asleep || a.inBed;
    if (!sleep) continue;
    out[date] = {
      sleepMin: Math.round(sleep),
      sleepDeepMin: phases ? Math.round(a.deep) : null,
      sleepRemMin: phases ? Math.round(a.rem) : null,
      sleepLightMin: phases ? Math.round(a.light) : null,
      sleepAwakeMin: phases || a.awake ? Math.round(a.awake) : null,
    };
  }
  return out;
}

/** Последнее значение за день (вес, % жира, VO2max): по времени замера */
export function lastByDay(samples, map = (v) => v) {
  const out = {};
  const at = {};
  for (const s of samples || []) {
    const date = dayOf(s.startDate);
    const value = num(s.value);
    if (!date || value === null) continue;
    const t = Date.parse(s.startDate);
    if (at[date] === undefined || t >= at[date]) { at[date] = t; out[date] = map(value); }
  }
  return out;
}

/** Среднее за день (ВСР: часы меряют её несколько раз в сутки) */
export function avgByDay(samples) {
  const sum = {};
  const count = {};
  for (const s of samples || []) {
    const date = dayOf(s.startDate);
    const value = num(s.value);
    if (!date || value === null) continue;
    sum[date] = (sum[date] || 0) + value;
    count[date] = (count[date] || 0) + 1;
  }
  return Object.fromEntries(Object.keys(sum).map((d) => [d, sum[d] / count[d]]));
}

/** Суммы queryAggregated по дням: значение нужной агрегации, иначе основное */
export function aggregatedByDay(samples, key) {
  const out = {};
  for (const s of samples || []) {
    const date = dayOf(s.startDate);
    const value = num(s.values && s.values[key] !== undefined ? s.values[key] : s.value);
    if (date && value !== null) out[date] = value;
  }
  return out;
}

/**
 * Общий расход за день из сырых записей Health Connect. Его пишут и
 * часы, и телефон, а сумма всех записей посчитала бы день дважды —
 * берём источник, у которого за день больше всего
 */
export function totalKcalByDay(samples) {
  const days = {};
  for (const s of samples || []) {
    const date = dayOf(s.startDate);
    const value = num(s.value);
    if (!date || value === null) continue;
    const source = s.sourceId || s.sourceName || '';
    days[date] = days[date] || {};
    days[date][source] = (days[date][source] || 0) + value;
  }
  return Object.fromEntries(Object.entries(days).map(([d, bySource]) => [d, Math.max(...Object.values(bySource))]));
}

/** iPhone: общий расход дня = активные + базовый обмен, только если есть оба */
export function iphoneTotalKcal(active, basal) {
  const out = {};
  for (const [date, a] of Object.entries(active || {})) {
    const b = (basal || {})[date];
    if (a > 0 && b > 0) out[date] = a + b;
  }
  return out;
}

/** % жира: iPhone отдаёт долю (0,22), Android — проценты (22) */
export function fatPercent(v) {
  return v > 0 && v <= 1 ? v * 100 : v;
}

const FIELDS = {
  restingHr: (v) => Math.round(v),
  hrvMs: (v) => Math.round(v),
  activeKcal: (v) => Math.round(v),
  totalKcal: (v) => Math.round(v),
  vo2max: round1,
  weightKg: round1,
  bodyFatPct: round1,
};

/**
 * Собрать дни для health.daily.sync: { sleep: {date: {...}}, restingHr:
 * {date: n}, … } → [{ date, sleepMin, …, weightKg }], только дни, где
 * что-то есть; пустое поле не шлём — сервер не затрёт сохранённое
 */
export function mergeHealthDays(parts) {
  const days = new Map();
  const put = (date, key, value) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    if (!days.has(date)) days.set(date, { date });
    days.get(date)[key] = value;
  };
  for (const [date, s] of Object.entries(parts.sleep || {})) {
    for (const [k, v] of Object.entries(s)) put(date, k, v);
  }
  for (const [key, round] of Object.entries(FIELDS)) {
    for (const [date, v] of Object.entries(parts[key] || {})) put(date, key, round(v));
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Пульс за тренировку из queryAggregated (средний, максимальный); корзин бывает две — через полночь */
export function hrFromAggregated(samples) {
  const avgs = [];
  let max = null;
  for (const s of samples || []) {
    const v = s.values || {};
    const a = num(v.average !== undefined ? v.average : s.value);
    const m = num(v.max);
    if (a !== null && a >= 25 && a <= 250) avgs.push(a);
    if (m !== null && m >= 25 && m <= 250) max = max === null ? m : Math.max(max, m);
  }
  if (!avgs.length) return { hrAvg: null, hrMax: null };
  const hrAvg = Math.round(avgs.reduce((s, x) => s + x, 0) / avgs.length);
  return { hrAvg, hrMax: max === null ? null : Math.max(Math.round(max), hrAvg) };
}

/* ==========================================================================
 * Что показать: блок «Здоровье» в «Прогрессе», «Потрачено» в «Питании»
 * ========================================================================== */

const shiftDate = (date, n) => {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
};
const has = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const mean = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);

/** Последнее значение и сдвиг к среднему прошлой недели (без него самого) */
function lastAndTrend(rows, key, today) {
  const withValue = rows.filter((r) => has(r[key]));
  if (!withValue.length) return null;
  const last = withValue[withValue.length - 1];
  const from = shiftDate(last.date, -7);
  const before = withValue.filter((r) => r.date < last.date && r.date >= from).map((r) => Number(r[key]));
  const avg = mean(before);
  return {
    value: Number(last[key]),
    date: last.date,
    today: last.date === today,
    avg: avg === null ? null : Math.round(avg),
    delta: avg === null ? null : Math.round(Number(last[key]) - avg),
  };
}

/**
 * Сводка для блока «Здоровье»: null у показателя — его не показываем,
 * null целиком — блока нет. today — 'ГГГГ-ММ-ДД' (для проверок).
 */
export function healthSummary(data, today = localDate(new Date())) {
  if (!data) return null;
  const rows = [...(data.days || [])].filter((r) => r && r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = data.latest || {};
  // Сон: последний за двое суток — старше это уже не «прошлая ночь»
  const sleepRows = rows.filter((r) => has(r.sleepMin) && r.sleepMin > 0);
  const lastSleep = sleepRows.length ? sleepRows[sleepRows.length - 1] : null;
  const weekFrom = shiftDate(today, -6);
  const week = sleepRows.filter((r) => r.date >= weekFrom).map((r) => Number(r.sleepMin));
  const sleep = lastSleep && lastSleep.date >= shiftDate(today, -1) ? {
    date: lastSleep.date,
    lastNight: lastSleep.date === today,
    min: Number(lastSleep.sleepMin),
    deep: has(lastSleep.sleepDeepMin) ? Number(lastSleep.sleepDeepMin) : null,
    rem: has(lastSleep.sleepRemMin) ? Number(lastSleep.sleepRemMin) : null,
    light: has(lastSleep.sleepLightMin) ? Number(lastSleep.sleepLightMin) : null,
    awake: has(lastSleep.sleepAwakeMin) ? Number(lastSleep.sleepAwakeMin) : null,
    avg7: week.length >= 2 ? Math.round(mean(week)) : null,
  } : null;
  const todayRow = rows.find((r) => r.date === today) || {};
  const kcal = has(todayRow.activeKcal) || has(todayRow.totalKcal) ? {
    active: has(todayRow.activeKcal) ? Number(todayRow.activeKcal) : null,
    total: has(todayRow.totalKcal) ? Number(todayRow.totalKcal) : null,
  } : null;
  const fromLatest = (value, date) => (has(value) ? { value: Number(value), date: date || '' } : null);
  const lastOf = (key) => {
    const r = [...rows].reverse().find((x) => has(x[key]));
    return r ? { value: Number(r[key]), date: r.date } : null;
  };
  const out = {
    sleep,
    restingHr: lastAndTrend(rows, 'restingHr', today),
    hrv: lastAndTrend(rows, 'hrvMs', today),
    kcal,
    weight: fromLatest(latest.weightKg, latest.weightDate) || lastOf('weightKg'),
    bodyFat: fromLatest(latest.bodyFatPct, latest.bodyFatDate) || lastOf('bodyFatPct'),
    vo2max: fromLatest(latest.vo2max, latest.vo2maxDate) || lastOf('vo2max'),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

/** «Потрачено» за выбранный день в «Питании»: общий расход, иначе активные */
export function spentForDay(data, date) {
  const row = ((data && data.days) || []).find((r) => r.date === date);
  if (!row) return null;
  if (has(row.totalKcal) && row.totalKcal > 0) return { kcal: Math.round(row.totalKcal), kind: 'total' };
  if (has(row.activeKcal) && row.activeKcal > 0) return { kcal: Math.round(row.activeKcal), kind: 'active' };
  return null;
}

/** «7 ч 25 мин» */
export function formatMinutes(min) {
  const m = Math.round(Number(min) || 0);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return rest + ' мин';
  return rest ? h + ' ч ' + rest + ' мин' : h + ' ч';
}
