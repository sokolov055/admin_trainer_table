import { addDays, dateKey, scheduledPlan, sessionQueue, WEEKDAY_SHORT } from './program-timeline.js';

/**
 * Правки недель (FT-788, этап 3, макет week-editor-mockup.html) — чистые
 * функции без React: что лежит в неделе, перенос по дням и неделям,
 * «Убрать без долга», «+ занятие», «Вернуть неделю как в программе».
 *
 * Правка недели — её список занятий: weekEdits[понедельник] = [{ id первой
 * тренировки занятия, day 0–7 (0 — без дня), from — понедельник недели,
 * откуда перенесено }]. Неделя без правки идёт по программе
 * (program-timeline.js, weekEditOf). Сервер проверяет то же
 * (server/src/lib/plan-weeks.js, saveWeekEdits).
 */

const plural = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
export const sessionsText = (n) => n + ' ' + plural(n, 'занятие', 'занятия', 'занятий');

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/** «16–22 ноя», на стыке — «30 ноя – 6 дек» */
export function spanShort(start) {
  const end = addDays(start, 6);
  const mon = (d) => MONTHS_SHORT[Number(d.slice(5, 7)) - 1];
  return start.slice(5, 7) === end.slice(5, 7)
    ? `${Number(start.slice(8))}–${Number(end.slice(8))} ${mon(end)}`
    : `${Number(start.slice(8))} ${mon(start)} – ${Number(end.slice(8))} ${mon(end)}`;
}
/** «16–22» — коротко, для подписи «из 16–22» */
export const spanTiny = (start) => `${Number(start.slice(8))}–${Number(addDays(start, 6).slice(8))}`;

/**
 * Занятия недели по раскладке: [{ idx, id, day, from, rows, title, done }].
 * rows — строки недели этого занятия (силовая, кардио…); done — сделано
 * (занятие засчитано по первой тренировке; при двух одинаковых занятиях
 * сделанным считается раннее по дню)
 */
export function weekItems(week) {
  if (!week || !Array.isArray(week.layout)) return [];
  const rows = week.rows || [];
  // Строки занятия: первая тренировка и следующие за ней extra
  const groupOf = new Map();
  rows.forEach((r, i) => {
    if (r.extra || !r.block.id || groupOf.has(r.block.id)) return;
    const g = [r];
    for (let k = i + 1; k < rows.length && rows[k].extra; k += 1) g.push(rows[k]);
    groupOf.set(r.block.id, g);
  });
  const items = week.layout.map((it, idx) => {
    const g = groupOf.get(it.id) || [];
    return { idx, id: it.id, day: it.day || 0, from: it.from || '', rows: g, title: g.map((r) => r.block.title).join(' + ') || 'Занятие', done: false };
  }).filter((it) => it.rows.length);
  const byId = new Map();
  items.forEach((it) => { if (!byId.has(it.id)) byId.set(it.id, []); byId.get(it.id).push(it); });
  byId.forEach((list) => {
    const head = list[0].rows[0];
    const doneCount = Math.min(list.length, head.done || 0);
    [...list].sort((a, b) => (a.day || 8) - (b.day || 8) || a.idx - b.idx).slice(0, doneCount).forEach((it) => { it.done = true; });
  });
  return items;
}

/** Расчёт недель с правками; until — досчитать до этой недели */
export function timelineWith({ blocks, sessions, month, cfg, weekEdits, until = '', today = new Date() }) {
  const edits = weekEdits && Object.keys(weekEdits).length ? weekEdits : undefined;
  return scheduledPlan({ blocks, sessions, month, cfg: { ...cfg, weekEdits: edits }, today, until });
}

/** Неделя расчёта по понедельнику */
export const weekAt = (timeline, start) => (timeline ? timeline.weeks.find((w) => w.start === start) || null : null);

/** Список занятий недели для правки: своя правка или раскладка программы */
const listOf = (edits, timeline, start) => (edits[start] || (weekAt(timeline, start) || { layout: [] }).layout).map((it) => ({ ...it }));

/** Первый свободный день недели с from-дня (дни уже заняты — 0, без дня) */
export function freeDay(list, minDay = 1) {
  const busy = new Set(list.map((it) => it.day).filter(Boolean));
  for (let d = Math.max(1, minDay); d <= 7; d += 1) if (!busy.has(d)) return d;
  return 0;
}

/** С какого дня недели можно класть: прошедшие дни текущей недели — нельзя */
export function firstOpenDay(start, today = dateKey()) {
  if (addDays(start, 6) < today) return 8;
  if (start >= today) return 1;
  for (let d = 1; d <= 7; d += 1) if (addDays(start, d - 1) >= today) return d;
  return 8;
}

/** Перенести занятие на другой день этой же недели (0 — без дня) */
export function movedToDay(edits, timeline, start, idx, day) {
  const list = listOf(edits, timeline, start);
  if (!list[idx]) return edits;
  list[idx].day = day;
  return { ...edits, [start]: list };
}

/**
 * Перенести занятие на другую неделю: там оно добавляется (а не сдвигает
 * очередь), в ближайший свободный день или на день, куда его бросили.
 * Подпись «из 16–22» — от недели, где занятие стояло по программе;
 * вернули туда — подписи нет
 */
export function movedToWeek(edits, timeline, start, idx, to, day = null, today = dateKey()) {
  if (to === start) return day === null ? edits : movedToDay(edits, timeline, start, idx, day);
  const src = listOf(edits, timeline, start);
  const item = src[idx];
  if (!item) return edits;
  src.splice(idx, 1);
  const dst = listOf(edits, timeline, to);
  const origin = item.from || start;
  const placed = day === null ? freeDay(dst, firstOpenDay(to, today)) : day;
  dst.push({ id: item.id, day: placed, ...(origin !== to ? { from: origin } : {}) });
  return { ...edits, [start]: src, [to]: dst };
}

/** «Убрать без долга» — договорились, что этого занятия не будет */
export function removedFromWeek(edits, timeline, start, idx) {
  const list = listOf(edits, timeline, start);
  if (!list[idx]) return edits;
  list.splice(idx, 1);
  return { ...edits, [start]: list };
}

/** «+ занятие» — любое занятие программы на эту неделю */
export function addedToWeek(edits, timeline, start, id, day = 0) {
  const list = listOf(edits, timeline, start);
  if (list.length >= 21) return edits;
  list.push({ id, day });
  return { ...edits, [start]: list };
}

/**
 * «Вернуть неделю как в программе». Занятия, перенесённые отсюда в другие
 * недели, оттуда уходят (они снова здесь по программе); перенесённые сюда
 * из других — возвращаются туда, на день по программе. Прошедшие недели
 * не трогаются: перенесённое из них остаётся здесь
 */
export function revertedWeek(edits, base, start, today = dateKey()) {
  const past = (key) => addDays(key, 6) < today;
  const next = { ...edits };
  const own = next[start] || [];
  delete next[start];
  const keep = own.filter((it) => it.from && past(it.from));
  if (keep.length) next[start] = [...(weekAt(base, start) || { layout: [] }).layout.map((it) => ({ ...it })), ...keep];
  // Отсюда унесли — там убрать
  Object.keys(next).forEach((key) => {
    if (key === start || past(key)) return;
    if (next[key].some((it) => it.from === start)) next[key] = next[key].filter((it) => it.from !== start);
  });
  // Сюда принесли из другой недели — вернуть туда
  own.filter((it) => it.from && !past(it.from)).forEach((it) => {
    if (!next[it.from]) return; // та неделя без правки — занятие там и так есть
    const planned = (weekAt(base, it.from) || { layout: [] }).layout.find((x) => x.id === it.id);
    next[it.from] = [...next[it.from], { id: it.id, day: planned ? planned.day : 0 }];
  });
  return clean(next, base);
}

/** Правка, совпавшая с программой, — не правка */
export function clean(edits, base) {
  const out = {};
  Object.keys(edits).forEach((key) => {
    const w = weekAt(base, key);
    const same = w && JSON.stringify(edits[key]) === JSON.stringify(w.layout);
    if (!same) out[key] = edits[key];
  });
  return out;
}

/** Занятия программы для «+ занятие»: [{ id, title }] */
export function programSessions(blocks) {
  const seen = new Set();
  return sessionQueue(blocks || []).filter((g) => g[0] && g[0].id && !seen.has(g[0].id) && seen.add(g[0].id))
    .map((g) => ({ id: g[0].id, title: g.map((b) => b.title).join(' + ') }));
}

/** Дни, где больше одного занятия: «Пт 27» */
export function crowdedDays(items, start) {
  const count = new Map();
  items.forEach((it) => { if (it.day) count.set(it.day, (count.get(it.day) || 0) + 1); });
  return [...count].filter(([, n]) => n > 1).map(([d]) => `${WEEKDAY_SHORT[d]} ${Number(addDays(start, d - 1).slice(8))}`);
}

/** Недели, где правки разошлись с сохранёнными: для «Изменения» и уведомления */
export function changedWeeks(before, after) {
  return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter((k) => JSON.stringify((before || {})[k] || null) !== JSON.stringify((after || {})[k] || null)).sort();
}
