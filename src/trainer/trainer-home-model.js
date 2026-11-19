/*
 * Расчёты первой страницы тренера — «Клиенты» (макет home-redesign-2026-11-19,
 * согласован владельцем 19.11.2026): шапка дня с лентой клиентов, плитки
 * «Сделать», строка темпа месяца. Без React — проверяются в
 * scripts/test-trainer-home.mjs.
 */

import { initials as letters, avatarTone } from './program-list-model.js';

export { avatarTone };

/** «Мария Кузнецова» → «МК»; пара «Олег + Светлана» → «ОС» (знаки — не слова) */
export const initials = (name = '') => letters(String(name).split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).join(' '));

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

/** Занятие уже идёт: началось не раньше часа назад и не проведено */
const LIVE_MS = 60 * 60000;

/**
 * Лента дня: занятия по времени, проведённые — с галочкой, «сейчас» —
 * идущее (началось меньше часа назад, не проведено) или ближайшее впереди.
 * items — summary.today.items с сервера.
 */
export function dayLine(items, now = new Date()) {
  const list = (Array.isArray(items) ? items : [])
    .filter((t) => t && t.at)
    .slice()
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const t = now.getTime();
  const live = list.find((x) => !x.done && Date.parse(x.at) <= t && Date.parse(x.at) > t - LIVE_MS);
  const ahead = list.find((x) => !x.done && Date.parse(x.at) > t);
  const current = live || ahead || null;
  return {
    total: list.length,
    done: list.filter((x) => x.done).length,
    live: !!live,
    next: ahead || null,
    slots: list.map((x) => ({ ...x, now: x === current })),
  };
}

/** «через 40 мин», «через 2 ч 10 мин», «через 3 ч» */
export function inWords(at, now = new Date()) {
  const min = Math.max(1, Math.round((Date.parse(at) - now.getTime()) / 60000));
  if (min < 60) return 'через ' + min + ' мин';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return 'через ' + h + ' ч' + (m ? ' ' + m + ' мин' : '');
}

/** «9:00» по часам телефона */
export const timeOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
};

/**
 * Подпись под «2 из 5»: что проведено и что дальше. nextAny — ближайшее
 * занятие вообще (summary.today.next, может быть завтра); whenText —
 * formatWhen из ui.jsx, чтобы не тянуть React сюда.
 */
export function dayHint(line, nextAny, now = new Date(), whenText = (iso) => iso) {
  if (!line.total) {
    return nextAny ? 'сегодня занятий нет · следующее — ' + whenText(nextAny.at) : 'сегодня занятий нет';
  }
  const word = plural(line.total, 'занятия', 'занятий', 'занятий');
  const head = word + ' проведено';
  if (line.live) return head + ' · сейчас идёт';
  if (line.next) return head + ' · следующее ' + inWords(line.next.at, now);
  if (line.done === line.total) return 'все занятия проведены' + (nextAny ? ' · дальше ' + whenText(nextAny.at) : '');
  return head;
}

/* ==================================================================
 * Плитки «Сделать»
 * ================================================================== */

/**
 * Плитки «Сделать»: сигналы — те же, что в «Сводке» (server lib/metrics.js),
 * плюс «не приглашены» и «просят паузу» из списка. rows — номера карточек;
 * у сплита сигнал приходит на карточку пары, а в списке — её участники
 * (splitOf), поэтому совпадение и по паре.
 */
export const TODO = [
  { id: 'packages', icon: '💸', label: 'долг, пакет', tone: 'crit' },
  { id: 'silent', icon: '📞', label: 'молчат месяц', tone: 'warn' },
  { id: 'noPlan', icon: '📋', label: 'нет программы', tone: 'violet' },
  { id: 'measureDue', icon: '📏', label: 'пора замер', tone: 'teal' },
  { id: 'uninvited', icon: '✉️', label: 'не приглашены', tone: 'blue' },
  { id: 'asking', icon: '❄️', label: 'просят паузу', tone: 'ice' },
];

export const isUninvited = (c) => !c.chatId && !c.invited && !c.joined;
export const isAsking = (c) => !!c.pause && c.pause.state === 'requested';

/**
 * День рождения: месяц и число. Дата из старой синхронизации с таблицей —
 * полночь по Москве, записанная по UTC («…-13T21:00:00» — это 14-е): время
 * после полудня — следующий день. Не разобрали — null.
 */
export function birthDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}))?/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (m[4] && Number(m[4]) >= 12 ? 1 : 0)));
  return { month: d.getUTCMonth(), day: d.getUTCDate() };
}

/** Через сколько дней ближайший день рождения (0 — сегодня); нет даты — null */
export function daysToBirthday(iso, now = new Date()) {
  const b = birthDay(iso);
  if (!b) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 29 февраля в невисокосный год — 1 марта (Date переносит сам)
  let next = new Date(now.getFullYear(), b.month, b.day);
  if (next < today) next = new Date(now.getFullYear() + 1, b.month, b.day);
  return Math.round((next - today) / 86400000);
}

/** ДР на неделе: сегодня и шесть дней вперёд (решение владельца 19.11.2026 — «возможно», последним) */
export const BIRTHDAY_DAYS = 7;
export const birthdaySoon = (c, now = new Date()) => {
  const n = daysToBirthday(c.birthDate, now);
  return n !== null && n < BIRTHDAY_DAYS;
};

export function todoTiles(clients, signals, now = new Date()) {
  const list = Array.isArray(clients) ? clients : [];
  const sig = signals || {};
  // «🎂 ДР на неделе» — плиткой, только когда есть у кого
  const birthdays = list.filter((c) => birthdaySoon(c, now));
  const extra = birthdays.length
    ? [{ id: 'birthday', icon: '🎂', label: 'ДР на неделе', tone: 'pink', rows: new Set(birthdays.map((c) => c.row)), count: birthdays.length }]
    : [];
  return TODO.map((t) => {
    let rows;
    let count;
    if (t.id === 'uninvited' || t.id === 'asking') {
      const pick = t.id === 'uninvited' ? isUninvited : isAsking;
      const hit = list.filter(pick);
      rows = new Set(hit.map((c) => c.row));
      count = hit.length;
    } else {
      const hit = Array.isArray(sig[t.id]) ? sig[t.id] : [];
      rows = new Set(hit.map((c) => c.row));
      count = hit.length;
    }
    return { ...t, rows, count };
  }).concat(extra);
}

/** Клиент из списка подходит под плитку: сам или его пара сплита */
export const inTile = (tile, c) => !!tile && (tile.rows.has(c.row) || (!!c.splitOf && tile.rows.has(c.splitOf)));

/* ==================================================================
 * Темп месяца
 * ================================================================== */

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** 340000 → «340к», 1250000 → «1,25 млн» */
export function shortMoney(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 1e6) return String(Math.round(v / 1e4) / 100).replace('.', ',') + ' млн';
  if (v >= 1e4) return Math.round(v / 1000) + 'к';
  return v.toLocaleString('ru-RU');
}

const pct = (v, of) => (of > 0 ? Math.max(0, Math.min(100, Math.round((v / of) * 100))) : 0);

/**
 * Строка темпа из trainer.metrics.overview: выручка месяца, % к тому же числу
 * прошлого месяца, полоска к цели и черта «где был прошлый месяц к этому дню».
 * Цель — месячная (targets.revenue), иначе годовая / 12; цели нет — шкала
 * по выручке всего прошлого месяца. Данных нет — null.
 */
export function paceLine(data) {
  if (!data || !data.finance || !data.finance.now) return null;
  const revenue = Number(data.finance.now.revenue) || 0;
  const pace = data.pace || {};
  const was = Number(pace.revenue) || 0;
  const targets = data.targets || {};
  const monthGoal = Number(targets.revenue) || (Number(targets.revenueYear) ? Math.round(Number(targets.revenueYear) / 12) : 0);
  const fullBefore = Number(data.finance.before && data.finance.before.revenue) || 0;
  const scale = monthGoal || Math.max(fullBefore, revenue, was);
  const m = Number(String(data.month || '').slice(5, 7));
  const pm = Number(String(pace.month || '').slice(5, 7));
  const diff = was ? Math.round(((revenue - was) / was) * 100) : null;
  return {
    revenue,
    month: MONTHS_NOM[m - 1] || '',
    diff,
    against: pace.day && MONTHS_SHORT[pm - 1] ? 'к ' + pace.day + ' ' + MONTHS_SHORT[pm - 1] : '',
    bar: pct(revenue, scale),
    was: was ? pct(was, scale) : null,
    goal: monthGoal ? 'цель ' + shortMoney(monthGoal) : fullBefore ? 'весь ' + (MONTHS_NOM[pm - 1] || 'прошлый').toLowerCase() + ' ' + shortMoney(fullBefore) : '',
  };
}

/* ==================================================================
 * Строка списка клиентов (этап 4)
 * ================================================================== */

/**
 * Сегодняшние ещё не проведённые занятия по карточке: row → занятие. У
 * сплита занятие записано на карточку пары — участники находят его по splitOf.
 */
export function todayByRow(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((t) => {
    if (t && !t.done && t.at && !map.has(t.row)) map.set(t.row, t);
  });
  return map;
}

export const todayOf = (map, c) => map.get(c.row) || (c.splitOf ? map.get(c.splitOf) : null) || null;

/**
 * Обводка аватара — одно состояние, важное первым: долг (красная), нет
 * программы (фиолетовая), пауза (голубая), занятие сегодня (синяя).
 */
export function ringOf(c, { money, noPlan, today }) {
  if (money < 0) return 'debt';
  if (noPlan) return 'plan';
  if (c.pause && c.pause.state !== 'requested') return 'pause';
  if (today) return 'today';
  return '';
}

/**
 * Пакет билетиками: сколько занятий оплачено вперёд из размера пакета. У
 * участника сплита — остаток пары. Онлайн, без цены и больше 12 — null
 * (ticketRow из главной клиента решает, помещается ли).
 */
export function packOf(c, ticketRow) {
  if (c.online) return null;
  let left = null;
  if (c.splitOf) left = Number.isFinite(Number(c.splitTrainingsLeft)) ? Number(c.splitTrainingsLeft) : null;
  else if (Number(c.price) > 0) left = Math.floor(Number(c.balance) / Number(c.price));
  if (left === null) return null;
  return ticketRow(Math.max(0, left), c.count);
}
