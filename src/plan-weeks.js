import { blockSessions } from './plan-model.js';

/**
 * Программа по неделям, раскладка по циклам месяца (IDEA-7, решения
 * владельца 27–28.10.2026).
 *
 * Тренер пишет программу на 1, 2 или 4 недели: у тренировки — неделя
 * программы (week) и пометка «лёгкая» / «тяжёлая» (load, только подпись).
 * Месяц делится на циклы — календарные недели с понедельника, неполные тоже
 * («1 ноября» — цикл из одного дня). Цикл n получает неделю программы по
 * кругу: 1, 2, 1, 2… — так программы хватает до конца месяца.
 *
 * За цикл — оценка: выполнен (сделано не меньше нужного) или нет. В полном
 * цикле нужно всё, что в его неделе программы; в неполном — столько, сколько
 * приходится на его дни (3 тренировки на 1 день — одна), остальное по
 * желанию. Все циклы месяца выполнены — молодец.
 *
 * Не сделанная за прошедший полный цикл — «не выполнена»; дальше решают
 * (сервер, lib/plan-weeks.js хранит): 'redo' — первой в следующем цикле,
 * 'skip' — остаётся пропуском. Правило тренера (rule 'redo' / 'skip')
 * решает за клиента; 'client' — ждём выбора, а пока его нет, долг не
 * переносится.
 *
 * Недель у тренировок нет — null: экран показывает месячную очередь.
 * Здесь нет React: правила проверяются напрямую (scripts/test-plan-weeks.mjs).
 */

const NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const pad = (n) => String(n).padStart(2, '0');
/** Дата по местному времени: «2026-11-09» */
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** «Ноябрь 2026» → { year, month 0–11 }; не разобрали — null */
export function parseMonth(label) {
  const m = /^(\S+)\s+(\d{4})$/.exec(String(label || '').trim());
  const k = m ? NAMES.indexOf(m[1].toLowerCase()) : -1;
  return k < 0 ? null : { year: Number(m[2]), month: k };
}

/** Циклы календарного месяца: [{ n, start, end, from, to, days }] — даты «ГГГГ-ММ-ДД» */
export function monthWeeks(label) {
  const p = parseMonth(label);
  if (!p) return null;
  const last = new Date(p.year, p.month + 1, 0).getDate();
  const weeks = [];
  let day = 1;
  while (day <= last) {
    const wd = (new Date(p.year, p.month, day).getDay() + 6) % 7; // пн = 0
    const end = Math.min(last, day + 6 - wd);
    weeks.push({
      n: weeks.length + 1,
      start: dayKey(new Date(p.year, p.month, day)),
      end: dayKey(new Date(p.year, p.month, end)),
      from: day, to: end, monthGen: GEN[p.month],
      days: end - day + 1,
    });
    day = end + 1;
  }
  return weeks;
}

/** «2–8 ноября», «1 ноября» */
export function weekDates(w) {
  return (w.from === w.to ? w.from : w.from + '–' + w.to) + ' ' + w.monthGen;
}

export const LOAD_LABEL = { light: 'Лёгкая', heavy: 'Тяжёлая' };
export const PROGRAM_LENGTHS = [1, 2, 3, 4];

/** На сколько недель программа: самая большая неделя у тренировок; 0 — без недель */
export function programLength(blocks) {
  return (blocks || []).reduce((m, b) => Math.max(m, Number(b.week) || 0), 0);
}

/** Неделя программы тренировки; без недели в программе по неделям — первая */
export const weekOf = (block) => Number(block.week) || 1;

/** Что решено о невыполненной тренировке цикла n: 'redo' | 'skip' | null (ждём клиента) */
export function decisionOf(cfg, n, block) {
  if (cfg.rule === 'redo' || cfg.rule === 'skip') return cfg.rule;
  return (cfg.choices || {})[n + ':' + (block.id || '')] || null;
}

/** Пометка недели программы: у всех её тренировок одна — она, иначе '' */
export function weekLoad(blocks, week) {
  const list = (blocks || []).filter((b) => weekOf(b) === week);
  const loads = new Set(list.map((b) => b.load || ''));
  return list.length && loads.size === 1 ? [...loads][0] : '';
}

/**
 * Месяц по циклам: что в каждом нужно, сделано, не выполнено, и оценка.
 * cfg — weeks из client.plan ({ rule, choices }). Без недель у тренировок
 * или месяц не разобрать — null (месячная очередь).
 */
export function weekPlan({ blocks, sessions, month, cfg, today = new Date() }) {
  const length = programLength(blocks);
  if (!length) return null;
  const cycles = monthWeeks(month);
  if (!cycles) return null;
  const rules = cfg || { rule: 'client', choices: {} };
  const now = dayKey(today);
  const pastOf = new Map((blocks || []).map((b) => [b, blockSessions(sessions, b, month)]));

  const out = [];
  cycles.forEach((c, i) => {
    const week = (i % length) + 1;
    const full = c.days === 7;
    const ended = now > c.end;
    const prev = out[i - 1];
    const inRange = (b) => pastOf.get(b).filter((s) => {
      const d = dayKey(s.startedAt || s.updatedAt);
      return d >= c.start && d <= c.end;
    });
    // Долги прошлого полного цикла, которые решили доделать
    const debts = full && prev && prev.full
      ? prev.rows.filter((r) => r.missed > 0 && decisionOf(rules, prev.n, r.block) === 'redo').map((r) => r.block)
      : [];
    const own = (blocks || []).filter((b) => weekOf(b) === week);
    const list = [...own, ...debts.filter((b) => !own.includes(b))];
    const rows = list.map((block) => {
      const here = inRange(block);
      const carried = debts.includes(block);
      const required = full ? (own.includes(block) ? 1 : 0) + (carried ? 1 : 0) : 0;
      const done = here.length;
      return {
        block, sessions: here, done, carried, required,
        // Ещё сделать в этом цикле; в неполном — несделанное можно
        left: full ? Math.max(0, required - done) : (done ? 0 : 1),
        missed: full && ended ? Math.max(0, required - done) : 0,
      };
    });
    // В неполном цикле — сколько приходится на его дни
    const need = full
      ? rows.reduce((s, r) => s + r.required, 0)
      : (own.length ? Math.max(1, Math.ceil(own.length * c.days / 7)) : 0);
    const done = full
      ? rows.reduce((s, r) => s + Math.min(r.done, r.required), 0)
      : Math.min(need, rows.filter((r) => r.done > 0).length);
    out.push({
      ...c, week, full, ended,
      current: now >= c.start && now <= c.end,
      load: weekLoad(blocks, week),
      rows, need, done,
      missed: ended ? Math.max(0, need - done) : 0,
      status: !need ? 'empty' : done >= need ? 'done' : ended ? 'missed' : 'open',
    });
  });

  const currentIndex = out.findIndex((w) => w.current);
  // Прошлый полный цикл с пропусками без решения — лист выбора в начале этого
  const prev = currentIndex > 0 ? out[currentIndex - 1] : null;
  const pending = rules.rule === 'client' && prev && prev.full
    ? prev.rows.filter((r) => r.missed > 0 && !decisionOf(rules, prev.n, r.block))
    : [];
  const graded = out.filter((w) => w.status === 'done' || w.status === 'missed');
  return {
    weeks: out, length, currentIndex, pending, pendingWeek: prev, cfg: rules,
    // Оценка месяца: сколько циклов выполнено из оценённых; все — молодец
    score: {
      done: graded.filter((w) => w.status === 'done').length,
      graded: graded.length,
      total: out.filter((w) => w.need > 0).length,
      allDone: out.every((w) => w.status === 'done' || w.status === 'empty'),
    },
  };
}

/** Очередь цикла: долги прошлого — первыми, дальше как в программе */
export function weekQueue(cycle) {
  if (!cycle) return [];
  const open = cycle.rows.filter((r) => r.left > 0);
  return [...open.filter((r) => r.carried && r.done === 0), ...open.filter((r) => !(r.carried && r.done === 0))];
}

/**
 * Программа на n недель: у каждой тренировки неделя от 1 до n (была больше —
 * по кругу, не было — первая); 0 — снять недели, программа на месяц.
 */
export function withLength(blocks, n) {
  return (blocks || []).map((b) => {
    if (!n) {
      const { week: _drop, ...rest } = b;
      return rest;
    }
    return { ...b, week: ((weekOf(b) - 1) % n) + 1 };
  });
}
