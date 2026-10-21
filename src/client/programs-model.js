import { timesWeek } from './onboarding-model.js';

/**
 * «Программы тренера» (FT-497, образец — каталог SmartGym): карточка
 * программы и фильтры витрины. Чистые функции без React — проверяются
 * node-тестом (scripts/test-programs.mjs).
 *
 * Карточка — всё, что нужно для выбора, не открывая программу: уровень
 * цветной меткой (цвет не единственный носитель — рядом слово), минуты,
 * раз в неделю и место. Поля ставит тренер в шаблоне (сервер:
 * lib/program-card.js); минуты без его цифры посчитаны по упражнениям —
 * такие с «≈».
 */

/** Цели шаблона — те же, что выбор в редакторе (trainer/Library.jsx); в этом порядке и группы витрины */
export const TEMPLATE_GOALS = ['Похудение', 'Набор массы', 'Рельеф', 'Сила', 'Тонус', 'Выносливость', 'Здоровая спина', 'Реабилитация'];

/** Уровни шаблона и тон метки: новичок — зелёная, средний — синяя, опытный — оранжевая */
export const LEVELS = [
  { id: 'Новичок', tone: 'easy' },
  { id: 'Средний', tone: 'mid' },
  { id: 'Опытный', tone: 'hard' },
];
export const levelTone = (level) => (LEVELS.find((l) => l.id === level) || {}).tone || '';
const levelRank = (level) => { const i = LEVELS.findIndex((l) => l.id === level); return i < 0 ? LEVELS.length : i; };

export const PLACES = { gym: 'Зал', home: 'Дома' };

/** «45 мин» — вписал тренер, «≈ 45 мин» — посчитано по упражнениям */
export function minutesText(p) {
  if (!p || !p.minutes) return '';
  return (p.minutesAuto ? '≈ ' : '') + p.minutes + ' мин';
}

/** «2 раза в неделю»; частота не указана — сколько разных тренировок, а не догадка */
export function timesText(p) {
  if (!p) return '';
  if (p.days) return timesWeek(p.days);
  const n = Number(p.workouts) || 0;
  return n ? n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'тренировка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'тренировки' : 'тренировок') : '';
}

export const placeText = (p) => (p && PLACES[p.place] ? PLACES[p.place].toLowerCase() : '');

/* ==========================================================================
 * Фильтры
 * ========================================================================== */

export const FILTER_KEYS = ['days', 'place', 'level'];

/**
 * Пилюли фильтров — только значения, которые есть в программах, и только
 * те, что что-то отсекают: «Зал», когда все программы в зале, ничего не
 * сужает и лишь занимает место. Порядок: раз в неделю, место, опыт —
 * как спрашивают сами люди (разбор Shagulin, 15.10.2026).
 */
export function filterChips(programs = []) {
  const total = programs.length;
  const out = [];
  const add = (key, values, label) => values.forEach((value) => {
    const n = programs.filter((p) => p[key] === value).length;
    if (n && n < total) out.push({ key, value, label: label(value) });
  });
  add('days', [...new Set(programs.map((p) => p.days).filter(Boolean))].sort((a, b) => a - b), timesWeek);
  add('place', Object.keys(PLACES), (v) => PLACES[v]);
  add('level', LEVELS.map((l) => l.id), (v) => v);
  return out;
}

/** Нажали пилюлю: та же — снять, другая того же вида — заменить */
export function toggleFilter(filters, key, value) {
  const next = { ...filters };
  if (next[key] === value) delete next[key];
  else next[key] = value;
  return next;
}

/** Список сужается сразу: программа подходит, если совпала по всем выбранным */
export function applyFilters(programs = [], filters = {}) {
  const active = FILTER_KEYS.filter((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '');
  return programs.filter((p) => active.every((k) => p[k] === filters[k]));
}

/* ==========================================================================
 * Группы по цели
 * ========================================================================== */

/**
 * Группы — по цели шаблона, как её поставил тренер: свои цели после
 * частых, программы без цели — последней группой. Внутри — от новичка к
 * опытному, потом реже к чаще. Если цели не стоят ни у одной программы,
 * группа одна — «Все программы», без выдуманного деления.
 */
export function groupByGoal(programs = []) {
  const byGoal = new Map();
  programs.forEach((p) => {
    const goal = String(p.goal || '').trim();
    if (!byGoal.has(goal)) byGoal.set(goal, []);
    byGoal.get(goal).push(p);
  });
  const rank = (goal) => {
    if (!goal) return [2, ''];
    const i = TEMPLATE_GOALS.indexOf(goal);
    return i >= 0 ? [0, String(i).padStart(3, '0')] : [1, goal.toLowerCase()];
  };
  const onlyUnnamed = byGoal.size === 1 && byGoal.has('');
  return [...byGoal.entries()]
    .sort(([a], [b]) => {
      const [ra, ka] = rank(a);
      const [rb, kb] = rank(b);
      return ra - rb || ka.localeCompare(kb, 'ru');
    })
    .map(([goal, items]) => ({
      goal,
      title: goal || (onlyUnnamed ? 'Все программы' : 'Другие программы'),
      items: items.slice().sort((a, b) => levelRank(a.level) - levelRank(b.level)
        || (a.days || 99) - (b.days || 99)
        || String(a.title).localeCompare(String(b.title), 'ru')),
    }));
}

/* ==========================================================================
 * Сокращения в названиях
 * ========================================================================== */

// Отдельное слово: \b не видит кириллицу, поэтому граница — «не буква и не цифра».
// Без lookbehind: старые iPhone (до iOS 16.4) не разбирают его вовсе
const word = (w) => new RegExp('(^|[^\\p{L}\\d])(' + w + ')(?=$|[^\\p{L}\\d])', 'iu');

const ABBR = [
  [word('PPL'), () => 'PPL — жимы, тяги и ноги в разные дни'],
  [word('UL'), () => 'UL — верх и низ тела по очереди'],
  [/upper\s*[/-]?\s*lower/i, () => 'Upper / Lower — верх и низ тела по очереди'],
  [/full\s*-?\s*body|фулл?\s*-?\s*бади/i, () => 'Full Body — всё тело за одну тренировку'],
  [word('FB'), () => 'FB — всё тело за одну тренировку'],
  [word('HIIT'), () => 'HIIT — интервалы высокой интенсивности'],
  [word('ВБ'), () => 'ВБ — верхний блок (тренажёр)'],
  [word('НБ'), () => 'НБ — нижний блок (тренажёр)'],
  [word('тяж'), () => 'тяж / лёг — тяжёлая и лёгкая тренировка'],
  [word('л[её]г'), () => 'тяж / лёг — тяжёлая и лёгкая тренировка'],
  [/\[(\d)\]/, (m) => `[${m[1]}] — ${timesWeek(Number(m[1]))}`],
  [/(\d{1,2})\s*[×xхXХ]\s*(\d{1,2})(?!\d)/, (m) => `${m[1]}×${m[2]} — ${m[1]} подходов по ${m[2]} повторений`],
];

/**
 * Расшифровка сокращений из названия — рядом с названием, а не вместо:
 * тренер пишет как привык, клиент понимает, что внутри (разбор Shagulin:
 * «Full Body [2] Fast» новичку ничего не говорит).
 */
export function explainTitle(title) {
  const text = String(title || '');
  const out = [];
  ABBR.forEach(([re, say]) => {
    const m = text.match(re);
    if (m) {
      const line = say(m);
      if (!out.includes(line)) out.push(line);
    }
  });
  return out;
}
