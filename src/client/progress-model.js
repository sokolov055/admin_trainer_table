/**
 * «Прогресс» клиента, этап 1 (макет progress-skip-chat-2026-11-19,
 * согласован владельцем 20.11.2026): «Мой путь» над вкладками и прогноз
 * веса по темпу. Чистые функции без React — их проверяет
 * scripts/test-progress-model.mjs.
 *
 * Целевого веса в приложении нет, поэтому прогноз — по темпу: «через месяц
 * около N кг». Направление сверяется с целью анкеты (похудеть / набрать).
 */

const DAY = 86400000;
// Темп — по последним 8 неделям: старые замеры не должны тянуть линию
const TREND_DAYS = 56;
const TREND_MIN_POINTS = 3;
const TREND_MIN_SPAN = 14;
const FORECAST_DAYS = 30;

const dayOf = (x) => Date.parse(String(x).slice(0, 10) + 'T00:00:00Z');
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Темп веса: кг в неделю по прямой через последние 8 недель и вес через
 * месяц. Мало замеров или они в пределах двух недель — null: прогноз по
 * двум близким точкам обманывает.
 * aim — куда должна идти цифра по цели (−1 похудеть, +1 набрать, 0 нет цели).
 */
export function weightTrend(points, aim = 0) {
  const list = (points || []).filter((p) => p && Number.isFinite(Number(p.y)) && Number.isFinite(dayOf(p.x)));
  if (list.length < TREND_MIN_POINTS) return null;
  const lastDay = dayOf(list[list.length - 1].x);
  const recent = list.filter((p) => dayOf(p.x) >= lastDay - TREND_DAYS * DAY);
  if (recent.length < TREND_MIN_POINTS) return null;
  const xs = recent.map((p) => (dayOf(p.x) - lastDay) / DAY);
  if (-xs[0] < TREND_MIN_SPAN) return null;
  const ys = recent.map((p) => Number(p.y));
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (!den) return null;
  const slope = num / den; // кг в день
  const perWeek = round1(slope * 7);
  const lastY = Number(list[list.length - 1].y);
  const flat = Math.abs(perWeek) < 0.1;
  return {
    perWeek: flat ? 0 : perWeek,
    inMonth: round1(lastY + slope * FORECAST_DAYS),
    forecastDays: FORECAST_DAYS,
    // Против цели — фраза вместо прогноза (владелец, 20.11.2026)
    against: !flat && !!aim && perWeek * aim < 0,
    flat,
  };
}

/** «−3,6 кг» / «+0,5 см»: знак всегда, запятая */
export function signed(value, unit) {
  const v = round1(value);
  const text = Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  return (v > 0 ? '+' : v < 0 ? '−' : '') + text + (unit ? ' ' + unit : '');
}

/** Изменение показателя от первого замера к последнему; нет двух — null */
function totalChange(rows, field) {
  const pts = (rows || []).filter((r) => r && r[field] !== null && r[field] !== undefined && r[field] !== '');
  if (pts.length < 2) return null;
  const d = round1(Number(pts[pts.length - 1][field]) - Number(pts[0][field]));
  return Number.isFinite(d) ? d : null;
}

/**
 * Главная фраза «Моего пути»: вес и талия за всё время («−3,6 кг и −5 см в
 * талии»). Нет замеров — про тренировки. Нечего сказать — ''.
 */
export function journeyHeadline(rows, workouts = 0) {
  const parts = [];
  const w = totalChange(rows, 'Вес');
  if (w) parts.push(signed(w, 'кг'));
  const waist = totalChange(rows, 'Талия');
  if (waist) parts.push(signed(waist, 'см') + ' в талии');
  if (parts.length) return parts.join(' и ');
  if (workouts > 0) return workouts + ' ' + plural(workouts, 'тренировка', 'тренировки', 'тренировок') + ' позади';
  return '';
}

/**
 * Сила за месяц: на сколько процентов суммарно тяжелее рабочие веса, чем в
 * прошлом месяце. Нет весов с прошлым — null.
 */
export function strengthPct(lifts) {
  const list = (lifts || []).filter((l) => l && l.prevWeight > 0 && l.weight > 0);
  if (!list.length) return null;
  const now = list.reduce((s, l) => s + l.weight, 0);
  const prev = list.reduce((s, l) => s + l.prevWeight, 0);
  return Math.round((now / prev - 1) * 100);
}

/** Сколько полных недель с даты (не меньше одной) */
export function weeksSince(since, today = new Date()) {
  const from = dayOf(since);
  if (!Number.isFinite(from)) return 0;
  return Math.max(1, Math.floor((dayOf(today.toISOString()) - from) / DAY / 7));
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/**
 * Где замер на фигуре (координаты силуэта 100×190) и цвет — токены групп
 * мышц, как в программах. Порядок — сверху вниз.
 */
export const BODY_SPOTS = {
  'Плечи': { y: 40, x1: 24, x2: 76, tone: 'back' },
  'Грудь': { y: 54, x1: 31, x2: 69, tone: 'chest' },
  'Рука': { y: 66, x1: 16, x2: 27, tone: 'arms' },
  'Талия': { y: 84, x1: 28, x2: 72, tone: 'core' },
  'Ягодицы': { y: 104, x1: 27, x2: 73, tone: 'legs' },
  'Бёдра': { y: 104, x1: 27, x2: 73, tone: 'legs' },
  'Бедро': { y: 128, x1: 31, x2: 47, tone: 'legs' },
};
