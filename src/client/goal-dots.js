/**
 * Цели точками (план трёх разборов, пункт 4 — из SmartGym, 21.10.2026):
 * каждая тренировка периода — точка. Здесь только счёт, без React, —
 * рисует client/Goals.jsx, проверяет scripts/test-goal-dots.mjs.
 */

// Дальше одна точка — несколько тренировок: 300 точек — это 12 рядов по
// 26, больше уже не пересчитать глазами и не уместить на экране телефона
export const MAX_DOTS = 300;

// До 156 точек (3 в неделю за год) — 13 колонок крупных точек, больше —
// 26 мелких: сетка года не вырастает выше 12 рядов
const WIDE = 156;

/**
 * Раскладка периода. done — сделано, target — план периода, due — сколько
 * по плану должно было набраться к сегодняшнему дню (сервер, awards.js).
 * Пропущено — due − done, не меньше нуля; withMissed: false — пропусков не
 * показывать вовсе (неделя). Сделано больше плана — лишние точки тоже
 * залиты: перевыполнение видно. Числа — в тренировках, dots — в точках:
 * при per > 1 точка залита, только когда сделаны все её тренировки.
 * Цели нет (target 0) — точек нет: мерить сделанное не с чем.
 */
export function goalDots({ done = 0, target = 0, due = 0 } = {}, { max = MAX_DOTS, withMissed = true } = {}) {
  if (!(target > 0)) return { done, target: 0, missed: 0, ahead: 0, per: 1, dots: [], columns: 13 };
  const missed = withMissed ? Math.max(0, Math.min(due, target) - done) : 0;
  const ahead = Math.max(0, target - done - missed);
  const total = done + missed + ahead;
  const per = Math.max(1, Math.ceil(total / max));
  const doneDots = Math.floor(done / per);
  const missedDots = Math.floor((done + missed) / per) - doneDots;
  const aheadDots = Math.ceil(total / per) - doneDots - missedDots;
  return {
    done, target, missed, ahead, per,
    dots: [
      ...Array(doneDots).fill('done'),
      ...Array(missedDots).fill('missed'),
      ...Array(aheadDots).fill('ahead'),
    ],
    columns: Math.ceil(total / per) > WIDE ? 26 : 13,
  };
}

/** Подпись ряда точек для чтения с экрана: «Сделано 6 из 9, пропущено 1» */
export function dotsLabel({ done, target, missed }) {
  return 'Сделано ' + done + ' из ' + target + (missed > 0 ? ', пропущено ' + missed : '');
}

/**
 * Сколько дней недели или месяца осталось, считая сегодня. Сегодня уже
 * была тренировка — без него: вторая за день в цель не идёт.
 */
export function daysLeft(today, period, trainedToday = false) {
  const [y, m, d] = String(today).split('-').map(Number);
  const left = period === 'week'
    ? 7 - ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7)
    : new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
  return Math.max(0, left - (trainedToday ? 1 : 0));
}
