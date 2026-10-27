import { blockSessions } from './plan-model.js';

/**
 * Программа месяца недельными циклами (IDEA-7, 27.10.2026).
 *
 * Тренировки месяца — цикл одной недели: каждую неделю их делают заново.
 * Недели — календарные, с понедельника; первая и последняя бывают неполными
 * («1 ноября» — неделя из одного дня). Неделя короче четырёх дней — короткая:
 * тренироваться можно, но «не выполнена» в ней не ставится — иначе 1 ноября
 * человек получил бы три пропуска за воскресенье.
 *
 * Не сделанная за прошедшую неделю — «не выполнена». Дальше решают (сервер,
 * lib/plan-weeks.js хранит): 'redo' — она первой в очереди следующей недели
 * (неделя длиннее на одну), 'skip' — остаётся пропуском. Правило тренера
 * (rule 'redo' / 'skip') решает за клиента; 'client' — ждём выбора, а пока
 * его нет, долг не переносится.
 *
 * Здесь нет React: это правила, проверяются напрямую (scripts/test-plan-weeks.mjs).
 */

const NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const SHORT_DAYS = 4;

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

/** Недели календарного месяца: [{ n, start, end, days, short }] — даты «ГГГГ-ММ-ДД» */
export function monthWeeks(label) {
  const p = parseMonth(label);
  if (!p) return null;
  const last = new Date(p.year, p.month + 1, 0).getDate();
  const weeks = [];
  let day = 1;
  while (day <= last) {
    const wd = (new Date(p.year, p.month, day).getDay() + 6) % 7; // пн = 0
    const end = Math.min(last, day + 6 - wd);
    const days = end - day + 1;
    weeks.push({
      n: weeks.length + 1,
      start: dayKey(new Date(p.year, p.month, day)),
      end: dayKey(new Date(p.year, p.month, end)),
      from: day, to: end, monthGen: GEN[p.month],
      days, short: days < SHORT_DAYS,
    });
    day = end + 1;
  }
  return weeks;
}

/** «2–8 ноября», «1 ноября» */
export function weekDates(w) {
  return (w.from === w.to ? w.from : w.from + '–' + w.to) + ' ' + w.monthGen;
}

export const KIND_LABEL = { normal: 'Обычная', heavy: 'Тяжёлая', light: 'Лёгкая' };

/** Что решено о невыполненной тренировке недели n: 'redo' | 'skip' | null (ждём клиента) */
export function decisionOf(cfg, n, block) {
  if (cfg.rule === 'redo' || cfg.rule === 'skip') return cfg.rule;
  return (cfg.choices || {})[n + ':' + (block.id || '')] || null;
}

/**
 * Месяц по неделям: что в каждой неделе нужно, сделано, не выполнено.
 * cfg — weeks из client.plan; null или месяц не разобрать — null (месячная очередь).
 */
export function weekPlan({ blocks, sessions, month, cfg, today = new Date() }) {
  if (!cfg || !cfg.on) return null;
  const weeks = monthWeeks(month);
  if (!weeks) return null;
  const now = dayKey(today);
  const all = (blocks || []).map((b) => ({ block: b, past: blockSessions(sessions, b, month) }));

  const out = [];
  weeks.forEach((w, i) => {
    const prev = out[i - 1];
    const ended = now > w.end;
    const rows = all.map(({ block, past }) => {
      const here = past.filter((s) => {
        const d = dayKey(s.startedAt || s.updatedAt);
        return d >= w.start && d <= w.end;
      });
      const before = prev && !prev.short ? prev.rows.find((r) => r.block === block) : null;
      const carried = !!(before && before.missed > 0 && decisionOf(cfg, prev.n, block) === 'redo');
      const required = w.short ? 0 : 1 + (carried ? 1 : 0);
      const done = here.length;
      return {
        block, sessions: here, done, carried, required,
        // Ещё сделать на этой неделе; в короткой — несделанное можно, но не нужно
        left: w.short ? (done ? 0 : 1) : Math.max(0, required - done),
        missed: ended && !w.short ? Math.max(0, required - done) : 0,
      };
    });
    out.push({
      ...w,
      kind: (cfg.kinds && cfg.kinds[i]) || 'normal',
      ended,
      current: now >= w.start && now <= w.end,
      rows,
      required: rows.reduce((s, r) => s + r.required, 0),
      done: rows.reduce((s, r) => s + Math.min(r.done, r.required || r.done), 0),
      missed: rows.reduce((s, r) => s + r.missed, 0),
    });
  });

  const currentIndex = out.findIndex((w) => w.current);
  // Решить за клиента нечего, пока тренер оставил выбор: прошлая неделя с
  // пропусками без решения — лист выбора в начале этой
  const prev = currentIndex > 0 ? out[currentIndex - 1] : null;
  const pending = cfg.rule === 'client' && prev && !prev.short
    ? prev.rows.filter((r) => r.missed > 0 && !decisionOf(cfg, prev.n, r.block))
    : [];
  return { weeks: out, currentIndex, pending, pendingWeek: prev, cfg };
}

/** Очередь недели: долги с прошлой — первыми, дальше как в программе */
export function weekQueue(week) {
  if (!week) return [];
  const open = week.rows.filter((r) => r.left > 0);
  return [...open.filter((r) => r.carried && r.done === 0), ...open.filter((r) => !(r.carried && r.done === 0))];
}

/**
 * Лёгкая неделя: веса программы и «как в прошлый раз» ниже на pct %, с
 * шагом 0,5 кг. «+5» у подтягиваний и «по ощущениям» не трогаем; у пары —
 * у каждого свой вес, их тоже не трогаем (весам пары нужна своя правка).
 */
export function lighten(block, pct) {
  const k = 1 - Math.max(0, Math.min(50, Number(pct) || 0)) / 100;
  const scale = (v) => {
    const s = String(v == null ? '' : v).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s) || Number(s) <= 0) return v;
    return String(Math.max(0.5, Math.round(Number(s) * k * 2) / 2));
  };
  return {
    ...block,
    exercises: (block.exercises || []).map((e) => (e.performers && e.performers.length ? e : {
      ...e,
      weight: scale(e.weight),
      ...(e.lastWeight ? { lastWeight: scale(e.lastWeight) } : {}),
      ...(Array.isArray(e.startSets) ? { startSets: e.startSets.map((s) => (s.kind === 'warmup' ? s : { ...s, weight: scale(s.weight) })) } : {}),
    })),
  };
}
