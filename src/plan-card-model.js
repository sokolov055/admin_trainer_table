/**
 * Карточка тренировки в списке (FT-791, макет workout-card-mockup.html):
 * чистые расчёты без React — сколько подходов, примерное время, метка дня,
 * вес прошлого раза и итог проведённого занятия.
 */
import { trackOf, techniqueOf } from './exercise-track.js';
import { isRoundList, topWeight } from './round-plan.js';
import { supersets } from './plan-model.js';
import { addDays, dateKey, WEEKDAY_SHORT } from './program-timeline.js';

// Работа в подходе силового — около 40 с; отдых без отметки в программе —
// 90 с, как общий отдых занятия (restBase в Workout.jsx); переход к
// следующему упражнению (снаряд, тренажёр) — минута
const WORK = 40;
const REST = 90;
const SWITCH = 60;

/** «3», «3-4» → 3; пусто — 3 подхода у силового, 1 отрезок у кардио */
function setsOf(ex) {
  const n = parseInt(ex && ex.sets, 10);
  if (n > 0) return Math.min(20, n);
  return trackOf(ex).kind === 'cardio' ? 1 : 3;
}

/** Подходов в тренировке по плану: суперсет — круги у каждого упражнения */
export function planSets(exercises) {
  return supersets(exercises || []).reduce((sum, g) => {
    if (!g.superset) return sum + setsOf(g.items[0]);
    return sum + setsOf(g.items[0]) * g.items.length;
  }, 0);
}

/** «20», «20:00», «1:30» → минуты кардио; не разобрали — 0 */
function cardioMinutes(ex) {
  const t = (ex.cardio && ex.cardio.targets && ex.cardio.targets.time) || ex.reps || '';
  const s = String(t).trim();
  const clock = s.match(/^(\d{1,3}):(\d{2})$/);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  const n = parseFloat(s.replace(',', '.'));
  return n > 0 && n < 300 ? n : 0;
}

/** Секунд работы в одном подходе: «60» у упражнения на время — 60 с */
function workOf(ex) {
  const track = trackOf(ex);
  if (track.kind === 'timed') {
    const n = parseInt(ex.reps, 10);
    if (n > 0 && n <= 600) return n * (track.unilateral ? 2 : 1);
  }
  return WORK * (track.unilateral ? 2 : 1);
}

function restOf(ex) {
  return techniqueOf(ex.technique).rest || REST;
}

/**
 * Примерная длительность, минуты, кратно 5 (решение владельца 14.11.2026 —
 * показывать, но с «~»): подходы × (работа + отдых упражнения), суперсет —
 * круг подряд и один отдых, кардио — по минутам плана
 */
export function planMinutes(exercises) {
  const groups = supersets(exercises || []);
  if (!groups.length) return 0;
  let seconds = 0;
  groups.forEach((g) => {
    seconds += SWITCH;
    if (!g.superset) {
      const ex = g.items[0];
      if (trackOf(ex).kind === 'cardio') { seconds += (cardioMinutes(ex) || 10) * 60 * setsOf(ex); return; }
      seconds += setsOf(ex) * (workOf(ex) + restOf(ex));
      return;
    }
    const rounds = setsOf(g.items[0]);
    const round = g.items.reduce((s, ex) => s + workOf(ex) + 15, 0);
    seconds += rounds * (round + restOf(g.items[g.items.length - 1]));
  });
  return Math.max(5, Math.round(seconds / 300) * 5);
}

const MONTH_SHORT = ['янв', 'февр', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сент', 'окт', 'нояб', 'дек'];

/**
 * Метка дня над названием: «Сегодня · чт» или «Пт · 15 нояб» — день из
 * недели программы (FT-788). Нет дня — '' (метки нет)
 */
export function dayLabel(weekStart, day, today = dateKey()) {
  if (!weekStart || !(day >= 1 && day <= 7)) return null;
  const date = addDays(weekStart, day - 1);
  const wd = WEEKDAY_SHORT[day];
  if (date === today) return { today: true, text: 'Сегодня · ' + wd.toLowerCase() };
  return { today: false, past: date < today, text: wd + ' · ' + Number(date.slice(8)) + ' ' + MONTH_SHORT[Number(date.slice(5, 7)) - 1] };
}

/** «8.5» → 8.5; «+5», «8 кг» → число; не число — NaN */
function weightNum(v) {
  const m = String(v == null ? '' : v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

/** 8.5 → «8,5»; 4900 → «4 900» */
export function kg(n) {
  const r = Math.round(n * 10) / 10;
  const [int, frac] = String(Math.abs(r)).split('.');
  return (r < 0 ? '−' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac ? ',' + frac : '');
}

/**
 * Вес прошлого раза в строке упражнения (решение владельца 14.11.2026 —
 * клиенту и тренеру): last — «8 кг» из журнала клиента (lastWeight с
 * сервера), up — «+2,5», если тренер поставил в плане больше. Кардио и
 * упражнения на время — без веса
 */
export function lastWeightOf(ex) {
  const track = trackOf(ex);
  if (track.kind === 'cardio' || track.kind === 'timed') return null;
  const last = weightNum(ex.lastWeight);
  if (!(last > 0)) return null;
  // Лесенка по кругам «6, 8, 10» (17.11.2026) — сравниваем с наибольшим
  const plan = isRoundList(ex.weight, 'weight') ? topWeight(ex.weight) : weightNum(ex.weight);
  const up = plan > last ? '+' + kg(plan - last) : '';
  return { last: kg(last) + ' кг', up };
}

/** Короткая подпись в ленте картинок: первое слово названия */
export function shortName(name) {
  const word = String(name || '').trim().split(/\s+/)[0] || '';
  return word.replace(/[,.;:«»"]+$/g, '');
}

/** Объём занятия, кг: вес × повторы отмеченных рабочих подходов */
export function sessionVolume(session) {
  const list = Array.isArray(session && session.exercises) ? session.exercises : [];
  let sum = 0;
  list.forEach((ex) => (ex.sets || []).forEach((s) => {
    const w = weightNum(s.weight);
    const r = parseInt(s.reps, 10);
    if (w > 0 && r > 0) sum += w * r;
  }));
  return Math.round(sum);
}

/** Доля сделанного от плана для кольца: 0…1; плана нет — 1 */
export function doneShare(done, planned) {
  if (!(planned > 0)) return done > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, (done || 0) / planned));
}
