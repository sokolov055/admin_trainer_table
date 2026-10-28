import { blockSessions } from './plan-model.js';

/**
 * Программа по неделям, раскладка по циклам месяца (IDEA-7, решения
 * владельца 27–28.10.2026).
 *
 * Тренер пишет программу на 1, 2 или 4 недели: у тренировки — неделя
 * программы (week) и пометка «лёгкая» / «тяжёлая» (load, только подпись).
 * Месяц делится на циклы — целые недели с понедельника по воскресенье.
 * Неделя со стыком месяцев отходит тому месяцу, где её четверг (как
 * нумеруют недели года): «Ноябрь 2026» — 2–29 ноября, 1 ноября — ещё
 * октябрь, 30 ноября — уже декабрь. Коротких циклов нет. Цикл n получает
 * неделю программы по кругу от «начать с недели» (cfg.startWeek): та же
 * программа, что в прошлом месяце, продолжается, а не начинается заново.
 *
 * За цикл — оценка: выполнен (сделано всё, что в его неделе программы)
 * или нет. Все циклы месяца выполнены — молодец.
 *
 * Не сделанная за прошедший цикл — «не выполнена»; дальше решают (сервер,
 * lib/plan-weeks.js хранит): 'redo' — первой в следующем цикле, 'skip' —
 * остаётся пропуском. Правило тренера (rule 'redo' / 'skip') решает за
 * клиента; 'client' — ждём выбора, а пока его нет, долг не переносится.
 * Долг последнего цикла прошлого месяца переходит в первый цикл этого
 * (prev — прошлая программа по неделям из client.plan).
 *
 * Следующий месяц не назначен — прошлая программа крутится дальше: циклы
 * продолжаются за край месяца с пометкой (beyond), в оценку месяца они не
 * идут. Назначили позже — сделанное по прошлой программе в том же цикле
 * засчитывается (extra).
 *
 * Недель у тренировок нет — null: экран показывает месячную очередь.
 * Здесь нет React: правила проверяются напрямую (scripts/test-plan-weeks.mjs).
 */

const NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAY = 24 * 60 * 60 * 1000;

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

/** { year, month } → «Декабрь 2026»; месяц может выходить за год */
export function monthLabelOf(year, month) {
  const d = new Date(year, month, 1);
  const name = NAMES[d.getMonth()];
  return name[0].toUpperCase() + name.slice(1) + ' ' + d.getFullYear();
}

/** Полночь понедельника недели, в которую попал день (местное время) */
function mondayOf(d) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - (day.getDay() + 6) % 7);
}
const plusDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Чей цикл день: «Ноябрь 2026» — месяц, где четверг его недели */
export function cycleMonthOf(date = new Date()) {
  const thu = plusDays(mondayOf(date), 3);
  return monthLabelOf(thu.getFullYear(), thu.getMonth());
}

function cycleOf(n, monday) {
  const sunday = plusDays(monday, 6);
  return {
    n,
    start: dayKey(monday), end: dayKey(sunday),
    from: monday.getDate(), to: sunday.getDate(),
    monthGen: GEN[sunday.getMonth()], fromGen: GEN[monday.getMonth()],
    days: 7,
  };
}

/**
 * Циклы месяца: целые недели пн–вс по правилу четверга — первая та, где
 * 4-е число, последняя та, где (последний день − 3). [{ n, start, end,
 * from, to, days: 7 }], даты «ГГГГ-ММ-ДД»; не месяц — null
 */
export function monthWeeks(label) {
  const p = parseMonth(label);
  if (!p) return null;
  const last = new Date(p.year, p.month + 1, 0);
  let monday = mondayOf(new Date(p.year, p.month, 4));
  const end = plusDays(mondayOf(plusDays(last, -3)), 6);
  const weeks = [];
  while (monday <= end) {
    weeks.push(cycleOf(weeks.length + 1, monday));
    monday = plusDays(monday, 7);
  }
  return weeks;
}

/** «2–8 ноября», «30 ноября – 6 декабря» */
export function weekDates(w) {
  if (w.fromGen && w.fromGen !== w.monthGen) return w.from + ' ' + w.fromGen + ' – ' + w.to + ' ' + w.monthGen;
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

/** С какой недели программы начинается месяц (cfg.startWeek), в пределах длины */
export function startWeekOf(cfg, length) {
  const s = Math.floor(Number(cfg && cfg.startWeek)) || 1;
  return ((Math.max(1, s) - 1) % Math.max(1, length)) + 1;
}

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

const inRange = (s, c) => {
  const d = dayKey(s.startedAt || s.updatedAt);
  return d >= c.start && d <= c.end;
};

/**
 * Месяц по циклам: что в каждом нужно, сделано, не выполнено, и оценка.
 * cfg — weeks из client.plan ({ rule, startWeek, choices }); prev — прошлый
 * месяц ({ month, blocks, weeks }) для долга на стыке; latest — это
 * последний лист клиента: пока следующий не назначен, циклы идут дальше.
 * Без недель у тренировок или месяц не разобрать — null (месячная очередь).
 */
export function weekPlan({ blocks, sessions, month, cfg, prev = null, latest = false, today = new Date() }) {
  const length = programLength(blocks);
  if (!length) return null;
  const cycles = monthWeeks(month);
  if (!cycles) return null;
  const rules = cfg || { rule: 'client', startWeek: 1, choices: {} };
  const now = dayKey(today);
  const startWeek = startWeekOf(rules, length);

  // Следующая программа не назначена — эта крутится дальше, цикл за циклом
  // (полгода: дальше программу явно бросили)
  const own = cycles.length;
  if (latest && now > cycles[own - 1].end) {
    let monday = plusDays(mondayOf(new Date(cycles[own - 1].end + 'T12:00:00')), 7);
    while (dayKey(monday) <= now && cycles.length < own + 26) {
      cycles.push({ ...cycleOf(cycles.length + 1, monday), beyond: cycleMonthOf(monday) });
      monday = plusDays(monday, 7);
    }
  }

  const list = blocks || [];
  const ids = new Set(list.map((b) => b.id).filter(Boolean));
  const pastOf = new Map(list.map((b) => [b, blockSessions(sessions, b, month)]));
  const foreign = (s) => s.status === 'completed' && s.sourceBlockId && !ids.has(s.sourceBlockId) && s.month && s.month !== month;

  // Долг последнего цикла прошлого месяца — в первый цикл этого
  const prevPlan = prev && prev.month && programLength(prev.blocks)
    ? weekPlan({ blocks: prev.blocks, sessions, month: prev.month, cfg: prev.weeks, today })
    : null;
  const prevLast = prevPlan ? prevPlan.weeks[prevPlan.own - 1] : null;
  const prevRules = prevPlan ? prevPlan.cfg : null;
  const prevBlocks = new Map();
  const carriedFromPrev = prevLast
    ? prevLast.rows.filter((r) => r.missed > 0 && decisionOf(prevRules, prevLast.n, r.block) === 'redo')
      .map((r) => {
        const b = { ...r.block, month: prev.month, foreign: true };
        prevBlocks.set(b, r.block);
        return b;
      })
    : [];

  const out = [];
  cycles.forEach((c, i) => {
    const week = ((startWeek - 1 + i) % length) + 1;
    const ended = now > c.end;
    const prevCycle = out[i - 1];
    // Долги прошлого цикла, которые решили доделать; в первом — прошлого месяца
    const debts = prevCycle
      ? prevCycle.rows.filter((r) => r.missed > 0 && decisionOf(rules, prevCycle.n, r.block) === 'redo').map((r) => r.block)
      : carriedFromPrev;
    const ownBlocks = list.filter((b) => weekOf(b) === week);
    const rowsOf = [...ownBlocks, ...debts.filter((b) => !ownBlocks.includes(b))];
    const rows = rowsOf.map((block) => {
      const here = (block.foreign
        ? blockSessions(sessions, prevBlocks.get(block) || block, block.month)
        : pastOf.get(block)).filter((s) => inRange(s, c));
      const carried = debts.includes(block);
      const required = (ownBlocks.includes(block) ? 1 : 0) + (carried ? 1 : 0);
      const done = here.length;
      return {
        block, sessions: here, done, carried, required,
        left: Math.max(0, required - done),
        missed: ended ? Math.max(0, required - done) : 0,
      };
    });
    const need = rows.reduce((s, r) => s + r.required, 0);
    // Сделанное по прошлой программе в этом же цикле (назначили среди
    // недели) — кроме занятий, уже учтённых долгом
    const seen = new Set(rows.flatMap((r) => r.sessions.map((s) => s.id)));
    const extra = (sessions || []).filter((s) => foreign(s) && inRange(s, c) && !seen.has(s.id)).length;
    const done = Math.min(need, rows.reduce((s, r) => s + Math.min(r.done, r.required), 0) + extra);
    out.push({
      ...c, week, full: true, ended,
      current: now >= c.start && now <= c.end,
      load: weekLoad(list, week),
      rows, need, done, extra,
      missed: ended ? Math.max(0, need - done) : 0,
      status: !need ? 'empty' : done >= need ? 'done' : ended ? 'missed' : 'open',
    });
  });

  const currentIndex = out.findIndex((w) => w.current);
  // Прошлый цикл с пропусками без решения — лист выбора в начале этого;
  // в первом цикле — последний цикл прошлого месяца
  const prevOut = currentIndex > 0 ? out[currentIndex - 1] : null;
  const askPrev = currentIndex === 0 && prevLast && prevRules.rule === 'client';
  const pending = prevOut && rules.rule === 'client'
    ? prevOut.rows.filter((r) => r.missed > 0 && !decisionOf(rules, prevOut.n, r.block))
    : askPrev
      ? prevLast.rows.filter((r) => r.missed > 0 && !decisionOf(prevRules, prevLast.n, r.block))
      : [];
  const graded = out.slice(0, own).filter((w) => w.status === 'done' || w.status === 'missed');
  return {
    weeks: out, length, own, currentIndex, cfg: rules,
    pending,
    pendingWeek: prevOut || (askPrev ? prevLast : null),
    pendingMonth: prevOut ? month : (askPrev ? prev.month : month),
    // Оценка месяца — по его циклам; продолжение за краем в неё не идёт
    score: {
      done: graded.filter((w) => w.status === 'done').length,
      graded: graded.length,
      total: out.slice(0, own).filter((w) => w.need > 0).length,
      allDone: out.slice(0, own).every((w) => w.status === 'done' || w.status === 'empty'),
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
 * Программа на n недель: 0 — снять недели, программа на месяц. Длиннее, чем
 * сейчас, — тренировки по порядку поровну на n недель (12 на 4 — по 3), иначе
 * длина не вырастет: она — самая большая неделя. Короче — по кругу.
 * «Разложить по неделям» (FT-775) и «Назначить» делают именно это
 */
export function withLength(blocks, n) {
  const list = blocks || [];
  if (!n) return list.map(({ week: _drop, ...rest }) => rest);
  if (n > programLength(list) && list.length) {
    const order = list.map((b, i) => [b, i]).sort((x, y) => weekOf(x[0]) - weekOf(y[0]) || x[1] - y[1]);
    const week = new Map(order.map(([b], i) => [b, Math.min(n, Math.ceil((i + 1) * n / list.length))]));
    return list.map((b) => ({ ...b, week: week.get(b) }));
  }
  return list.map((b) => ({ ...b, week: ((weekOf(b) - 1) % n) + 1 }));
}

/**
 * Неделя — раздел (FT-775, решение владельца 28.10.2026): тренировки лежат
 * под заголовками недель, а не носят номер недели полем. Правила ниже —
 * для редактора шаблона и программы клиента.
 */

/**
 * Длина программы в редакторе: выбранная тренером (lengthPick) может быть
 * больше той, что у тренировок, — новые недели пустые, тренировки не двигаются
 * (так тренер добавляет неделю, не ломая первые). Сохраняется только то, что
 * у тренировок: пустая последняя неделя при сохранении исчезает
 */
export function shownLength(blocks, lengthPick) {
  return Math.max(programLength(blocks), Math.floor(Number(lengthPick)) || 0);
}

/**
 * Сменить длину с экрана: больше — новые недели пустые (тренировки не
 * двигаются, нужен lengthPick); из списка — разложить по порядку поровну;
 * меньше — лишние недели сливаются в первые по кругу; 0 — список
 */
export function resized(blocks, n) {
  const length = programLength(blocks);
  if (!n || !length) return withLength(blocks, n);
  if (n >= length) return blocks;
  return withLength(blocks, n);
}

/** Тренировки по неделям: [{ week, blocks }] на все недели 1..length, порядок — как в программе */
export function byWeek(blocks, length) {
  const list = blocks || [];
  return Array.from({ length }, (_, i) => ({ week: i + 1, blocks: list.filter((b) => weekOf(b) === i + 1) }));
}

/** Порядок экрана: по неделям, внутри недели — как в программе */
export function weekOrder(blocks, length) {
  return length ? byWeek(blocks, length).flatMap((w) => w.blocks) : (blocks || []);
}

/** Пометка недели целиком (решение 28.10.2026: нагрузка — у недели, не у тренировки) */
export function withWeekLoad(blocks, week, load) {
  return (blocks || []).map((b) => {
    if (weekOf(b) !== week) return b;
    const { load: _drop, ...rest } = b;
    return load ? { ...rest, load } : rest;
  });
}

/** Перенести тренировку в другую неделю: пометка — новой недели */
export function movedToWeek(blocks, block, week) {
  const load = weekLoad(blocks, week);
  return (blocks || []).map((b) => {
    if (b !== block) return b;
    const { load: _drop, ...rest } = b;
    return { ...rest, week, ...(load ? { load } : {}) };
  });
}

/**
 * Скопировать неделю from в пустую неделю to: те же тренировки новыми
 * (без id и занятий), пометка — недели to. Названия те же — тренер поправит
 */
export function copiedWeek(blocks, from, to) {
  const list = blocks || [];
  const load = weekLoad(list, to);
  const copies = list.filter((b) => weekOf(b) === from).map(({ id: _id, load: _load, ...b }) => ({
    ...b, week: to, ...(load ? { load } : {}),
    exercises: (b.exercises || []).map((e) => ({ ...e })),
  }));
  return [...list, ...copies];
}

/** Одной фразой, что получит клиент при такой длине (редактор, лист «Настроить», форма «Назначить») */
export function lengthHint(length, { cycles = 0, count = 0 } = {}) {
  if (!length) return 'Тренировки идут списком, по очереди на месяц: без циклов и оценок, как раньше.';
  if (length === 1) return (count ? `Все ${workoutsOf(count)} — ` : 'Все тренировки — ') + 'каждую неделю, до конца месяца. За каждую неделю клиенту оценка «выполнена».';
  const n = ['', 'Одна', 'Две', 'Три', 'Четыре', 'Пять', 'Шесть', 'Семь', 'Восемь'][length] || String(length);
  const loop = length === 2 ? 'неделю 1, потом неделю 2, потом снова 1' : `неделю 1, потом 2… до ${length}-й и снова 1`;
  const tail = cycles ? (cycles === length ? ` В этом месяце ${cycles} цикла — каждую неделю по разу.` : ` В этом месяце ${cycles} ${cyclesOf(cycles)}.`) : '';
  return `${n} разные недели. Клиент делает ${loop} — до конца месяца. За каждую неделю — оценка «выполнена».${tail}`;
}

const pluralOf = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
export const workoutsOf = (n) => n + ' ' + pluralOf(n, 'тренировка', 'тренировки', 'тренировок');
const cyclesOf = (n) => pluralOf(n, 'цикл', 'цикла', 'циклов');

/** Как клиент пойдёт по шаблону без недель (форма «Назначить», FT-775) */
export const ASSIGN_HOWS = ['cycle', 'split', 'list'];

/**
 * Умолчание при назначении списка (решение владельца 28.10.2026): 2–4
 * тренировки — это обычная неделя, по кругу; иначе — списком
 */
export function defaultHow(blocks) {
  const n = (blocks || []).length;
  return n >= 2 && n <= 4 ? 'cycle' : 'list';
}

/**
 * Предпросмотр назначения: что клиент получит в каждом цикле месяца.
 * [{ n, from, to, monthGen, week, titles }]; без недель (списком) — []
 */
export function assignPreview({ blocks, month, how = '', length = 0, startWeek = 1 }) {
  const cycles = monthWeeks(month);
  if (!cycles) return [];
  const list = how === 'cycle' ? withLength(blocks, 1) : how === 'split' ? withLength(blocks, length) : how === 'list' ? [] : (blocks || []);
  const n = programLength(list);
  if (!n) return [];
  const start = startWeekOf({ startWeek }, n);
  return cycles.map((c, i) => {
    const week = ((start - 1 + i) % n) + 1;
    return { ...c, week, titles: list.filter((b) => weekOf(b) === week).map((b) => b.title) };
  });
}
