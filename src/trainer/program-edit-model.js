/**
 * Редактор программы «Библиотеки» (этап 3 макета templates-programs-2026-11-17,
 * согласован владельцем 17.11.2026): черновик тренировок, «авто» раз в
 * неделю и минуты, недели вкладками, перестановка внутри недели, копия и
 * кардио к занятию. Чистые функции без React — scripts/test-program-edit.mjs.
 *
 * Правила недель и занятий — plan-weeks.js (те же, что у программы клиента).
 */
import { weekOf, weekSessions, reorderedBlocks, removedBlocks, joinedSession, isCardioBlock, PROGRAM_LENGTHS } from '../plan-weeks.js';
import { sessionsOf } from '../program-timeline.js';

let seq = 0;
/** Ключ строки на экране: тренировки переставляют, индекс для ключа не годится */
export const newKey = () => 'k' + (seq += 1);

/** Пустое упражнение — как blankExercise (PlanInline.jsx), без React */
export const blankRow = () => ({ name: '', sets: '', reps: '', weight: '', note: '', supersetGroup: '' });

/** Черновик из шаблона: те же поля, что берёт PlanEditor, плюс ключ строки */
export function draftOf(blocks, blank = blankRow) {
  if (!blocks || !blocks.length) return [{ _k: newKey(), title: 'Тренировка № 1', exercises: [] }];
  return blocks.map((b) => ({
    _k: newKey(), id: b.id || '', title: b.title || '', sourceId: b.sourceId || null,
    ...(b.week ? { week: b.week } : {}), ...(b.load ? { load: b.load } : {}),
    ...(b.with ? { with: true } : {}),
    exercises: (b.exercises || []).map((e) => ({ ...blank(), ...e })),
  }));
}

/** В сохранение: без ключей экрана, без пустых строк упражнений */
export function cleanBlocks(draft) {
  return (draft || []).map((b) => ({
    title: b.title,
    ...(b.id ? { id: b.id } : {}),
    ...(b.sourceId ? { sourceId: b.sourceId } : {}),
    ...(b.week ? { week: b.week } : {}),
    ...(b.load ? { load: b.load } : {}),
    ...(b.with ? { with: true } : {}),
    exercises: (b.exercises || []).filter((e) => String(e.name || '').trim()),
  }));
}

/** Сравнение «есть ли несохранённое»: без ключей строк */
export const draftSnapshot = (draft) => JSON.stringify(cleanBlocks(draft));

/* --------------------------------------------------------------------------
 * «Авто»: раз в неделю — занятий в неделе 1 (как weekSessionsOf на сервере),
 * минуты — как estimateMinutes (server/src/lib/program-card.js)
 * -------------------------------------------------------------------------- */

export function autoDays(draft, length) {
  const list = draft || [];
  if (!list.length) return 0;
  return length ? weekSessions(list, 1).length : sessionsOf(list).length;
}

const firstNumber = (v) => {
  const m = String(v || '').replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
};
function clockSeconds(v, plainUnit) {
  const s = String(v || '').trim();
  if (!s) return 0;
  if (s.includes(':')) {
    const parts = s.split(':').map(Number);
    return parts.some((n) => !Number.isFinite(n)) ? 0 : parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  return firstNumber(s) * plainUnit;
}
function cardioSeconds(cardio) {
  const iv = cardio.intervals;
  if (iv && Array.isArray(iv.phases) && iv.phases.length) {
    const round = iv.phases.reduce((s, p) => s + clockSeconds(p.time, 1), 0);
    if (round > 0) return round * (Number(iv.rounds) || 1);
  }
  const time = clockSeconds(cardio.targets && cardio.targets.time, 60);
  return time > 0 ? time : 600;
}
/** Секунды тренировки — те же константы, что у сервера */
export function blockSeconds(block) {
  const list = ((block && block.exercises) || []).filter((e) => String(e.name || '').trim());
  return list.reduce((sum, e, i) => {
    if (e.cardio) return sum + 60 + cardioSeconds(e.cardio);
    const technique = String(e.technique || '');
    const sets = Math.min(10, Math.max(1, Math.floor(firstNumber(e.sets)) || 3));
    const warmup = Number((technique.match(/warmup(\d)/) || [])[1] || 0);
    const rest = Number((technique.match(/(^|\s)rest(\d{2,3})(\s|$)/) || [])[2] || 0) || 90;
    const next = list[i + 1];
    const inRound = e.supersetGroup && next && next.supersetGroup === e.supersetGroup;
    return sum + 60 + (sets + warmup) * (40 + (inRound ? 15 : rest));
  }, 0);
}

/** Минуты одной тренировки для подписи строки: «≈ 55 мин» (0 — пустая) */
export function blockMinutes(block) {
  const s = blockSeconds(block);
  return s ? Math.max(5, Math.round((s / 60) / 5) * 5) : 0;
}

/** Средняя тренировка программы с разминкой, до 5 минут; null — упражнений нет */
export function autoMinutes(draft) {
  const seen = new Set();
  const sessions = (draft || []).filter((b) => {
    const named = (b.exercises || []).filter((e) => String(e.name || '').trim());
    if (!named.length) return false;
    const key = b.title + '|' + named.map((e) => e.name).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!sessions.length) return null;
  const avg = sessions.reduce((s, b) => s + blockSeconds(b), 0) / sessions.length / 60 + 5;
  return Math.min(180, Math.max(10, Math.round(avg / 5) * 5));
}

/* --------------------------------------------------------------------------
 * Недели вкладками
 * -------------------------------------------------------------------------- */

export const MAX_WEEKS = PROGRAM_LENGTHS[PROGRAM_LENGTHS.length - 1];

/** Тренировки вкладки: [{ block, index }] — index в черновике; 0 — программа без недель */
export function weekItems(draft, week) {
  return (draft || []).map((block, index) => ({ block, index })).filter(({ block }) => !week || weekOf(block) === week);
}

/** Нагрузка недели одной меткой: у всех тренировок одна — она, иначе «база» */
export function loadOfWeek(draft, week) {
  const loads = new Set(weekItems(draft, week).map(({ block }) => block.load || ''));
  return loads.size === 1 ? [...loads][0] : '';
}

/**
 * Убрать неделю n: её тренировки уходят, следующие недели сдвигаются на
 * одну назад. Последняя неделя не убирается — для этого «Без недель»
 */
export function removedWeek(draft, n) {
  return (draft || [])
    .filter((b) => weekOf(b) !== n)
    .map((b) => (weekOf(b) > n ? { ...b, week: weekOf(b) - 1 } : b));
}

/**
 * Перестановка внутри вкладки: from и to — места в неделе, черновик — весь.
 * Занятия — по правилу reorderedBlocks: брошенная внутрь чужого занятия
 * тренировка входит в него, ушедшая голова отдаёт место следующей
 */
export function movedInWeek(draft, week, from, to) {
  const items = weekItems(draft, week);
  if (from === to || !items[from] || !items[to]) return draft;
  return reorderedBlocks(draft, items[from].index, items[to].index);
}

/** Удалить тренировку: занятие не рвётся (removedBlocks) */
export const removedAt = (draft, index) => removedBlocks(draft, [index]);

/** Перестановка суперсетов в копии — свои метки, чтобы не слиться с оригиналом */
function freshGroups(exercises, stamp) {
  const map = new Map();
  return (exercises || []).map((e) => {
    if (!e.supersetGroup) return { ...e };
    if (!map.has(e.supersetGroup)) map.set(e.supersetGroup, e.supersetGroup + '-c' + stamp + '-' + map.size);
    return { ...e, supersetGroup: map.get(e.supersetGroup) };
  });
}

/**
 * «Копия тренировки этой программы» — в конец недели week (0 — в конец
 * программы) отдельным занятием, без id; нагрузка — недели, куда легла
 */
export function copiedTo(draft, index, week, stamp = Date.now()) {
  const src = (draft || [])[index];
  if (!src) return draft;
  const { id: _id, with: _with, load: _load, week: _week, ...rest } = src;
  const load = week ? loadOfWeek(draft, week) : '';
  const copy = { ...rest, _k: newKey(), exercises: freshGroups(src.exercises, stamp), ...(week ? { week } : {}), ...(load ? { load } : {}) };
  return [...draft, copy];
}

/** Новая тренировка в конец недели (или программы) */
export function addedBlock(draft, week, made = null) {
  const list = draft || [];
  const load = week ? loadOfWeek(list, week) : '';
  const block = { ...(made || { title: 'Тренировка № ' + (list.length + 1), exercises: [] }), _k: newKey(), ...(week ? { week } : {}), ...(load ? { load } : {}) };
  delete block.with;
  return [...list, block];
}

/** Занятия вкладки, к которым можно добавить кардио: [{ head, last, title }] (индексы черновика) */
export function sessionsForCardio(draft, week) {
  const items = weekItems(draft, week);
  const at = new Map(items.map(({ block, index }) => [block, index]));
  return sessionsOf(items.map(({ block }) => block)).map((g) => ({
    head: at.get(g[0]), last: at.get(g[g.length - 1]), title: g.map((b) => b.title || 'Без названия').join(' + '),
    hasCardio: g.some(isCardioBlock),
  }));
}

/** «Кардио к занятию»: кардио-тренировка встаёт сразу после занятия и входит в него */
export function cardioAdded(draft, lastIndex, cardioBlock) {
  const list = [...(draft || [])];
  const after = list[lastIndex];
  if (!after) return list;
  const block = { ...cardioBlock, _k: newKey(), with: true, ...(after.week ? { week: after.week } : {}), ...(after.load ? { load: after.load } : {}) };
  list.splice(lastIndex + 1, 0, block);
  return list;
}

/** «В одно занятие с предыдущей» / «Отдельным занятием» — у тренировки index */
export function toggledJoin(draft, index) {
  const b = (draft || [])[index];
  if (!b) return draft;
  if (b.with) return draft.map((x, i) => (i === index ? (({ with: _w, ...rest }) => rest)(x) : x));
  return joinedSession(draft, b);
}

/** Можно ли прицепить к предыдущей: есть предыдущая в той же неделе */
export function canJoin(draft, index, length) {
  const items = weekItems(draft, length ? weekOf(draft[index]) : 0);
  return items.findIndex((x) => x.index === index) > 0;
}
