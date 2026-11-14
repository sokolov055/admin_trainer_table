/** Недельная программа действует по датам; месяц остаётся группировкой истории. */
const DAY = 86400000;
export const dateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (key, n) => dateKey(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + n, 12));
export const monday = (key) => addDays(key, -((new Date(key + 'T12:00:00').getDay() + 6) % 7));
export const nextMonday = (key = dateKey()) => addDays(monday(key), 7);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
const maxWeek = (blocks) => Math.max(0, ...(blocks || []).map((b) => Number(b.week) || 0));
export const programSize = (blocks, cfg) => Math.max(maxWeek(blocks), Number(cfg && cfg.length) || 0);
export const inPause = (day, cfg) => (cfg.pauses || []).some((p) => day >= p.from && (!p.to || day <= p.to));

/** Дни занятий клиента: 1 — понедельник … 7 — воскресенье, по порядку, без повторов */
export const cleanDays = (days) => [...new Set((Array.isArray(days) ? days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
/** Что делать с неделей, если программа начинается не с понедельника */
export const FIRST_WEEK = ['days', 'order', 'all'];
export const WEEKDAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Занятие (FT-788, решение владельца 13.11.2026) — одна или несколько
 * тренировок за один приход: силовая + кардио. У тренировки with: true —
 * она в одном занятии с предыдущей тренировкой той же недели. Старые
 * программы без with: каждая тренировка — своё занятие. Дни, старт среди
 * недели и ритм считают занятия, а клиент отмечает каждую тренировку
 */
export const sessionsOf = (blocks) => (blocks || []).reduce((list, b) => {
  if (b && b.with && list.length) list[list.length - 1].push(b);
  else list.push([b]);
  return list;
}, []);

/** Ритм — занятий в неделю по кругу: [3] или чередование [3, 1]; до 4 недель ритма */
export const MAX_RHYTHM = 4;
export const cleanRhythm = (rhythm) => (Array.isArray(rhythm) ? rhythm : [])
  .map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).slice(0, MAX_RHYTHM);

/** Очередь занятий программы для ритма: неделя 1, потом 2…; занятие не переходит через неделю */
export function sessionQueue(blocks) {
  const weeks = [...new Set((blocks || []).map((b) => Number(b.week) || 1))].sort((a, b) => a - b);
  return weeks.flatMap((w) => sessionsOf(blocks.filter((b) => (Number(b.week) || 1) === w)));
}

/**
 * Первая неделя версии, начатой среди недели (решение владельца 13.11.2026):
 * 'days' — по дням программы, занятия прошедших дней пропускаются без
 * долга; 'order' — по порядку на оставшиеся дни, не поместившиеся уходят
 * в следующую неделю; 'all' — все занятия недели за оставшиеся дни.
 * Занятия недели раскладываются по дням клиента по порядку; лишние — без дня.
 * На вход — тренировки недели или уже занятия (массив массивов).
 * Возвращает { own, deferred, dayOf } — тренировки
 */
export function laidWeek(blocks, { days = [], from, startDay = '', mode = 'all', activeCount = 7 }) {
  const list = cleanDays(days);
  const groups = Array.isArray((blocks || [])[0]) ? blocks : sessionsOf(blocks);
  const date = (d) => addDays(from, d - 1);
  const mid = !!startDay && startDay > from;
  const daysOf = (gs, ds) => {
    const map = new Map();
    gs.forEach((g, i) => g.forEach((b) => { if (!map.has(b)) map.set(b, ds[i] || 0); }));
    return map;
  };
  const dayOf = daysOf(groups, list);
  const all = groups.flat();
  // slots — занятия недели с днём (0 — без дня): из них редактор недель
  // берёт раскладку, которую тренер или клиент потом двигает
  const slots = (gs, ds) => gs.map((g, i) => ({ g, day: ds[i] || 0 }));
  if (!mid || mode === 'all' || (mode === 'days' && !list.length)) return { own: all, deferred: [], dayOf, slots: slots(groups, list) };
  if (mode === 'days') {
    const kept = groups.map((g, i) => ({ g, day: list[i] || 0 })).filter((x) => !x.day || date(x.day) >= startDay);
    return { own: kept.flatMap((x) => x.g), deferred: [], dayOf, slots: kept };
  }
  const left = list.length ? list.filter((d) => date(d) >= startDay) : [];
  const fits = list.length ? left.length : Math.max(1, Math.round(groups.length * activeCount / 7));
  const own = groups.slice(0, fits);
  return { own: own.flat(), deferred: groups.slice(fits).flat(), dayOf: daysOf(own, left), slots: slots(own, left) };
}

/**
 * Правки недель (FT-788, этап 3, макет week-editor-mockup.html): у
 * поправленной недели — свой список занятий: [{ id первой тренировки
 * занятия, day 0–7 (0 — без дня), from — понедельник недели, откуда
 * перенесено }]. Ключ — понедельник недели. Неделя без правки идёт по
 * программе; сама программа (шаблон, очередь, ритм) от правок не меняется
 */
export const weekEditOf = (cfg, start) => {
  const list = cfg && cfg.weekEdits && cfg.weekEdits[start];
  return Array.isArray(list) ? list : null;
};

/**
 * Ритм на неделю k версии (k — сколько недель прошло без полных пауз):
 * сколько занятий, какие (очередь по кругу с места queueAt) и какие дни.
 * «Всегда одно» (oneSession — id первой тренировки занятия): в неделю
 * с одним занятием — оно, очередь не двигается, в остальные его нет
 */
export function rhythmWeek(blocks, settings, k) {
  const rhythm = cleanRhythm(settings.rhythm);
  const all = sessionQueue(blocks);
  const fixed = settings.oneSession ? all.find((g) => g[0].id === settings.oneSession) : null;
  const queue = fixed ? all.filter((g) => g !== fixed) : all;
  const phase0 = Math.max(0, Math.floor(Number(settings.rhythmAt) || 0));
  let pos = Math.max(0, Math.floor(Number(settings.queueAt) || 0));
  for (let i = 0; i < k; i += 1) {
    const c = rhythm[(phase0 + i) % rhythm.length];
    if (!(fixed && c === 1)) pos += c;
  }
  const phase = (phase0 + k) % rhythm.length;
  const count = rhythm[phase];
  const groups = fixed && count === 1 ? [fixed]
    : queue.length ? Array.from({ length: count }, (_, j) => queue[(pos + j) % queue.length]) : [];
  const own = cleanDays((settings.rhythmDays || [])[phase]);
  return { groups, phase, count, queueAt: queue.length ? pos % queue.length : 0, days: own.length ? own : cleanDays(settings.days) };
}

export function versionAt(blocks, cfg, day) {
  const versions = [...(cfg.history || []), { from: cfg.effectiveOn || cfg.startsOn || '', blocks, settings: cfg }];
  return versions.filter((v) => v.from <= day).sort((a, b) => b.from.localeCompare(a.from))[0] || versions[0];
}

/** Все даты считаются календарными, без сдвига при переходе летнего времени. */
export function scheduledPlan({ blocks = [], sessions = [], month, cfg, today = new Date(), until = '' }) {
  const now = dateKey(today);
  const first = cfg.startsOn;
  const start = monday(first);
  // until — досчитать недели до этой даты (редактор недель листает вперёд без ограничения)
  const last = addDays(monday([now, first, String(until || '')].sort().pop()), 28);
  // Занятие по id первой тренировки — в версии недели, потом в программе и прошлых версиях
  const index = new Map();
  const sessionsById = (list) => {
    if (!index.has(list)) {
      const map = new Map();
      sessionQueue(list || []).forEach((g) => { const id = g[0] && g[0].id; if (id && !map.has(id)) map.set(id, g); });
      index.set(list, map);
    }
    return index.get(list);
  };
  const findSession = (id, list) => sessionsById(list).get(id) || sessionsById(blocks).get(id)
    || (cfg.history || []).map((h) => sessionsById(h.blocks).get(id)).find(Boolean) || null;
  const weeks = [];
  let n = 0;
  for (let from = start; from <= last && n < 2600; from = addDays(from, 7)) {
    n += 1;
    const end = addDays(from, 6);
    const v = versionAt(blocks, cfg, now >= from && now <= end ? now : end);
    const settings = v.settings;
    const length = programSize(v.blocks, settings) || 1;
    const anchor = monday(v.from || first);
    let elapsed = Math.max(0, Math.floor(daysBetween(anchor, from) / 7));
    for (let p = anchor; p < from; p = addDays(p, 7)) {
      if (Array.from({ length: 7 }, (_, i) => addDays(p, i)).every((d) => inPause(d, settings))) elapsed -= 1;
    }
    const rhythm = cleanRhythm(settings.rhythm);
    const beat = rhythm.length ? rhythmWeek(v.blocks, settings, Math.max(0, elapsed)) : null;
    const week = beat ? beat.phase + 1 : (((Number(settings.startWeek) || 1) - 1 + Math.max(0, elapsed)) % length) + 1;
    const endsOn = cfg.stopOn && (!settings.endsOn || cfg.stopOn < settings.endsOn) ? cfg.stopOn : settings.endsOn;
    const activeDays = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => d >= first && d >= (v.from || first) && (!endsOn || d <= endsOn) && !inPause(d, settings));
    const ended = now > end;
    const paused = activeDays.length === 0 && end >= first && (!endsOn || from <= endsOn);
    const expired = !!endsOn && (from > endsOn || (now >= from && now <= end && now > endsOn));
    const previous = [...weeks].reverse().find((w) => w.status !== 'paused' && w.status !== 'expired');
    const rule = settings.rule || 'client';
    const decide = (r) => previous.rule === 'client' ? (cfg.choices || {})[`${previous.n}:${r.block.id}`] : previous.rule;
    const debts = !paused && !expired && previous && previous.status !== 'paused'
      ? previous.rows.filter((r) => r.missed && decide(r) === 'redo') : [];
    const startDay = v.from || first;
    const weekBlocks = !activeDays.length ? [] : beat ? beat.groups : v.blocks.filter((b) => (Number(b.week) || 1) === week);
    const laid = laidWeek(weekBlocks, {
      days: beat ? beat.days : settings.days, from, startDay: startDay > from && startDay <= end ? startDay : '',
      mode: FIRST_WEEK.includes(settings.firstWeek) ? settings.firstWeek : 'all', activeCount: activeDays.length,
    });
    // Правка недели — её список занятий вместо раскладки программы
    const edit = activeDays.length && !expired && !settings.legacyList ? weekEditOf(cfg, from) : null;
    const slots = edit
      ? edit.map((it) => ({ g: findSession(it.id, v.blocks), day: Number(it.day) || 0, from: it.from || '' })).filter((x) => x.g)
      : laid.slots;
    const own = slots.flatMap((x) => x.g);
    const daysOfBlock = new Map();
    const movedFrom = new Map();
    slots.forEach((x) => x.g.forEach((b) => {
      if (!daysOfBlock.has(b)) daysOfBlock.set(b, []);
      daysOfBlock.get(b).push(x.day);
      if (x.from && !movedFrom.has(b)) movedFrom.set(b, x.from);
    }));
    // Не поместились в первую неделю «по порядку» — в следующую, без долга
    const moved = !paused && !expired && previous ? previous.deferred || [] : [];
    const same = (a, b) => a === b || (!!a.id && a.id === b.id);
    const ownOnce = own.filter((b, i) => own.findIndex((x) => same(x, b)) === i);
    const rowBlocks = [...ownOnce, ...[...debts.map((r) => r.block), ...moved].filter((b, i, all) => !own.some((x) => same(x, b)) && all.findIndex((x) => same(x, b)) === i)];
    // Первая тренировка занятия — по программе версии: занятие засчитано по ней
    const headOf = new Map();
    sessionQueue(v.blocks).forEach((g) => g.forEach((b) => headOf.set(b.id || b, g[0].id || g[0])));
    const rows = rowBlocks.map((block) => {
      const debt = debts.find((r) => r.block.id === block.id);
      const shifted = moved.some((b) => same(b, block));
      const carried = !!debt || shifted;
      // Одно занятие может стоять в неделе дважды — день строки самый ранний
      const days = daysOfBlock.get(block) || [];
      const day = days.filter(Boolean).sort((a, b) => a - b)[0] || 0;
      const required = own.filter((b) => same(b, block)).length + (debt ? debt.missed : 0) + Number(shifted);
      const here = sessions.filter((s) => s.status === 'completed' && s.month === month
        && (s.sourceBlockId ? s.sourceBlockId === block.id : s.sourceBlock === block.title)
        && (settings.legacyList ? dateKey(s.startedAt || s.updatedAt) <= end : activeDays.includes(dateKey(s.startedAt || s.updatedAt))));
      const done = here.length;
      return { block, day, days, date: day ? addDays(from, day - 1) : '', shifted, ...(movedFrom.has(block) ? { movedFrom: movedFrom.get(block) } : {}),
        sessions: here, carried, required, done, left: Math.max(0, required - done), missed: ended && activeDays.length === 7 && !settings.legacyList ? Math.max(0, required - done) : 0 };
    });
    // Вторая и дальше тренировка занятия (кардио после силовой) — extra:
    // неделю и ритм считают занятия; сделана силовая — недоделанное кардио
    // видно строкой «кардио 1 из 2», но в долг не идёт
    rows.forEach((r) => {
      const head = headOf.get(r.block.id || r.block);
      const main = head !== undefined && head !== (r.block.id || r.block) ? rows.find((x) => (x.block.id || x.block) === head) : null;
      r.extra = !!main;
      if (main && main.left === 0) r.missed = 0;
    });
    const mains = rows.filter((r) => !r.extra);
    const extras = rows.filter((r) => r.extra);
    const need = mains.reduce((sum, r) => sum + r.required, 0);
    const done = mains.reduce((sum, r) => sum + Math.min(r.done, r.required), 0);
    const extraNeed = extras.reduce((sum, r) => sum + r.required, 0);
    const extraDone = extras.reduce((sum, r) => sum + Math.min(r.done, r.required), 0);
    const full = activeDays.length === 7;
    const loads = new Set(own.map((b) => b.load || ''));
    weeks.push({ n, start: from, end, from: Number(from.slice(8)), to: Number(end.slice(8)),
      fromGen: new Date(from + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, ''),
      monthGen: new Date(end + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(/^\d+\s*/, ''),
      week, length: beat ? rhythm.length : length, rule, ended, full, current: now >= from && now <= end, rows, need, done, extra: 0,
      days: beat ? beat.days : cleanDays(settings.days), deferred: laid.deferred, extraNeed, extraDone,
      layout: slots.map((x) => ({ id: x.g[0].id || '', day: x.day, ...(x.from ? { from: x.from } : {}) })), edited: !!edit, sent: [],
      editable: activeDays.length > 0 && !expired && !settings.legacyList,
      ...(beat ? { rhythm: beat.count, phase: beat.phase, queueAt: beat.queueAt } : {}),
      load: loads.size === 1 ? [...loads][0] : '', missed: ended ? Math.max(0, need - done) : 0,
      status: now < first ? 'scheduled' : expired ? 'expired' : paused ? 'paused' : settings.legacyList ? 'legacy' : !need ? 'empty' : done >= need ? 'done' : ended && full ? 'missed' : ended ? 'partial' : 'open',
    });
  }
  // Куда ушли перенесённые занятия: «C · Грудь → 23–29» в неделе-источнике
  weeks.forEach((w) => w.layout.forEach((it) => {
    const src = it.from && weeks.find((x) => x.start === it.from);
    if (src) src.sent.push({ id: it.id, to: w.start });
  }));
  const currentIndex = weeks.findIndex((w) => w.current);
  const current = weeks[currentIndex];
  const previous = weeks.slice(0, Math.max(0, currentIndex)).reverse().find((w) => w.status !== 'paused' && w.status !== 'expired');
  const rule = previous ? previous.rule : 'client';
  const pending = previous && current && !['paused', 'expired'].includes(current.status) && rule === 'client'
    ? previous.rows.filter((r) => r.missed && !(cfg.choices || {})[`${previous.n}:${r.block.id}`]) : [];
  const monthKey = now.slice(0, 7);
  const graded = weeks.filter((w) => w.start.slice(0, 7) === monthKey && ['done', 'missed'].includes(w.status));
  return { scheduled: true, weeks, length: programSize(blocks, cfg), own: weeks.length, currentIndex, cfg, pending, pendingWeek: previous,
    pendingMonth: month, score: { done: graded.filter((w) => w.status === 'done').length, graded: graded.length, total: graded.length, allDone: false } };
}
