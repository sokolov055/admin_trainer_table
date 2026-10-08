import { formatNumber, plural } from '../ui.jsx';

/**
 * Подписи итогов недели и месяца (FT-493) — общие для блока «Итоги» в
 * «Прогрессе» и личных историй «Моя неделя» / «Итоги месяца»: одно и то
 * же число в двух местах обязано выглядеть одинаково. Считает сервер
 * (server/src/lib/summary.js).
 */

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const parts = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return { y, m, d };
};
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** «21–27 сентября», «29 сентября – 5 октября» */
export function rangeText(from, to) {
  const a = parts(from);
  const b = parts(to);
  return a.m === b.m
    ? a.d + '–' + b.d + ' ' + MONTHS_OF[b.m - 1]
    : a.d + ' ' + MONTHS_OF[a.m - 1] + ' – ' + b.d + ' ' + MONTHS_OF[b.m - 1];
}

export function monthText(from, today) {
  const a = parts(from);
  const name = capital(MONTHS[a.m - 1]);
  return today && parts(today).y !== a.y ? name + ' ' + a.y : name;
}

/** Заголовок периода в блоке: «Эта неделя», «Прошлая неделя», «21–27 сентября», «Октябрь» */
export function periodTitle(s) {
  if (s.period === 'week') {
    if (s.offset === 0) return 'Эта неделя';
    if (s.offset === 1) return 'Прошлая неделя';
    return rangeText(s.from, s.to);
  }
  return monthText(s.from, s.until);
}

/** С чем сравнивается: идущий период — с теми же днями прошлого */
export function compareText(s) {
  if (s.period === 'week') return s.current ? 'к тем же дням прошлой недели' : 'к прошлой неделе';
  return s.current ? 'к тем же дням прошлого месяца' : 'к прошлому месяцу';
}

/** «1 ч 25 мин», «45 мин» */
export function minutesText(min) {
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return rest + ' мин';
  return rest ? h + ' ч ' + rest + ' мин' : h + ' ч';
}

const kg = (n) => formatNumber(Math.round(n)) + ' кг';
const weightText = (n) => formatNumber(n, Number.isInteger(n) ? 0 : 1) + ' кг';

/**
 * Показатели по порядку: тренировки, время, тоннаж, шаги. diff — разница с
 * прошлым периодом: стрелка и число, ноль — «как тогда». Шагов нет вовсе —
 * строки нет: недостижимый ноль не мотивирует.
 */
export function metricRows(s) {
  const rows = [
    {
      id: 'trainings', label: 'Тренировки',
      value: formatNumber(s.now.trainings), unit: '',
      diff: s.now.trainings - s.before.trainings, diffText: (d) => formatNumber(Math.abs(d)),
    },
    {
      id: 'minutes', label: 'Время',
      value: minutesText(s.now.minutes), unit: '',
      diff: s.now.minutes - s.before.minutes, diffText: minutesText,
    },
    {
      id: 'tonnage', label: 'Тоннаж',
      value: kg(s.now.tonnage), unit: '',
      diff: s.now.tonnage - s.before.tonnage, diffText: (d) => kg(Math.abs(d)),
    },
  ];
  if (s.now.steps !== null && s.now.steps !== undefined) {
    rows.push({
      id: 'steps', label: 'Шаги в среднем',
      value: s.now.steps ? formatNumber(s.now.steps) : '—', unit: s.now.steps ? 'в день' : '',
      diff: s.now.steps && s.before.steps ? s.now.steps - s.before.steps : 0,
      diffText: (d) => formatNumber(Math.abs(d)),
      noCompare: !s.now.steps || !s.before.steps,
    });
  }
  return rows;
}

export function recordText(r) {
  return weightText(r.before) + ' → ' + weightText(r.after);
}

/**
 * Итоговая фраза истории: цель периода выполнена — похвала и серия, нет —
 * сколько не хватило. Цель — из «Целей» (FT-490).
 */
export function verdict(story) {
  const g = story.goal;
  const what = story.period === 'week' ? 'неделю' : 'месяц';
  if (g.met) {
    const streak = story.streak > 1
      ? 'Серия — ' + story.streak + ' ' + plural(story.streak, 'неделя', 'недели', 'недель') + ' подряд с выполненной целью.'
      : '';
    return {
      heading: 'Молодец, так держать!',
      body: ['Цель на ' + what + ' выполнена: ' + g.done + ' из ' + g.target + '.', streak].filter(Boolean).join(' '),
    };
  }
  return {
    heading: 'Всё получится — поднажми',
    body: 'До цели на ' + what + ' не хватило ' + g.left + ' '
      + plural(g.left, 'тренировки', 'тренировок', 'тренировок') + ': ' + g.done + ' из ' + g.target + '.',
  };
}
