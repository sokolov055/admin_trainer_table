/**
 * «Неделя» в питании (макет nutrition-redesign-2026-11-20, этап 3,
 * владелец 20.11.2026: «делай всё как в макете»). Чистые функции без React —
 * их проверяет scripts/test-nutrition-week.mjs. Данные — ответ diary.week:
 * семь дней до выбранного включительно, средние за полные дни и замеры веса.
 */

import { WEEKDAYS, NORM_BAND, dayTone, fullStreak } from './today-model.js';

/** Короткий день недели по дате: «пн» … «вс» */
export function weekdayOf(day) {
  return WEEKDAYS[(new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7];
}

/** Норма для коридора — у последнего дня, где она есть (цель могла смениться) */
export function bandTarget(days) {
  for (let i = (days || []).length - 1; i >= 0; i--) {
    const k = Number(days[i]?.targets?.kcal || 0);
    if (k > 0) return k;
  }
  return 0;
}

/** Доли энергии белков, жиров и углеводов, %, в сумме 100; пусто — null */
export function energyShares(t) {
  const p = (Number(t?.protein) || 0) * 4, f = (Number(t?.fat) || 0) * 9, c = (Number(t?.carbs) || 0) * 4;
  const sum = p + f + c;
  if (!(sum > 0)) return null;
  const protein = Math.round(p / sum * 100), fat = Math.round(f / sum * 100);
  return { protein, fat, carbs: Math.max(0, 100 - protein - fat) };
}

/**
 * Всё для экрана недели. waterGoalMl — цель воды человека.
 * bars[].h и band — доли высоты графика (0…1).
 */
export function weekView(data, waterGoalMl = 2000) {
  const days = data?.days || [];
  const aim = bandTarget(days);
  const top = Math.max(1, aim * (1 + NORM_BAND) * 1.12, ...days.map((d) => Number(d.totals?.kcal) || 0));
  const bars = days.map((d) => {
    const kcal = Math.round(Number(d.totals?.kcal) || 0);
    const target = Number(d.targets?.kcal || 0) || aim;
    const has = kcal > 0 || (d.entries || []).length > 0;
    return {
      day: d.day, wd: weekdayOf(d.day), kcal, tone: has ? dayTone(kcal, target) : 'empty',
      part: has && !d.complete, complete: !!d.complete, h: kcal / top,
    };
  });
  const full = days.filter((d) => d.complete && Number(d.totals?.kcal) > 0);
  const judged = full.filter((d) => Number(d.targets?.kcal || aim) > 0);
  const inNorm = judged.filter((d) => dayTone(Number(d.totals.kcal), Number(d.targets?.kcal || aim)) === 'good').length;
  const avg = data?.average || null;
  const weights = (data?.weights || []).filter((w) => Number(w.weight) > 0);
  const weight = weights.length ? {
    first: Number(weights[0].weight), last: Number(weights[weights.length - 1].weight),
    delta: Math.round((weights[weights.length - 1].weight - weights[0].weight) * 10) / 10,
    points: weights.map((w) => Number(w.weight)),
  } : null;
  const goal = waterGoalMl > 0 ? waterGoalMl : 2000;
  return {
    bars,
    band: aim > 0 ? { lo: aim * (1 - NORM_BAND) / top, hi: aim * (1 + NORM_BAND) / top,
      from: Math.round(aim * (1 - NORM_BAND) / 10) * 10, to: Math.round(aim * (1 + NORM_BAND) / 10) * 10 } : null,
    // Неделя без единой записи — график не рисуем пустыми полосами
    empty: !bars.some((b) => b.tone !== 'empty'),
    inNorm: judged.length ? { n: inNorm, of: judged.length } : null,
    fullDays: data?.fullDays ?? full.length,
    // Последний день ещё не завершён (обычно — сегодня) — серию считаем до него
    streak: fullStreak(days, days.length ? (days[days.length - 1].complete || days.length < 2 ? days[days.length - 1].day : days[days.length - 2].day) : ''),
    avg, shares: energyShares(avg), weight,
    water: days.map((d) => ({ day: d.day, wd: weekdayOf(d.day), ml: Number(d.waterMl) || 0, share: Math.min(1, (Number(d.waterMl) || 0) / goal) })),
  };
}

/** Линия веса для SVG шириной w и высотой h: путь «M … L …»; меньше двух точек — '' */
export function sparkPath(points, w = 300, h = 46, pad = 5) {
  if (!points || points.length < 2) return '';
  const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  return points.map((v, i) => {
    const x = pad + i * (w - pad * 2) / (points.length - 1);
    const y = hi === lo ? h / 2 : pad + (hi - v) / span * (h - pad * 2);
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join(' ');
}
