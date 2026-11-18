/**
 * Суперсет в редакторе тренировки: перенос и смахивание (18.11.2026, макет
 * superset-drag-2026-11-18.html) — без React, проверяется node-тестом.
 *
 * - держать упражнение — едет только оно: внутри рамки меняется порядок,
 *   за рамку — выходит из суперсета, в рамку — вступает (А3);
 * - держать шапку — едет весь суперсет (это делает BlockEdit, как раньше);
 * - смахнуть упражнение в рамке — «Из суперсета» (встаёт под рамкой) или
 *   «Удалить»; смахнуть шапку — «Разобрать» или «Удалить оба».
 *
 * Отдых после круга хранится у первого упражнения суперсета (шапка и
 * карточка читают его там): поменялся первый — отдых переезжает к новому.
 */
import { techniqueOf, techniqueText } from '../exercise-track.js';
import { resizeRounds } from '../round-plan.js';
import { groupMembers } from './exercise-card-model.js';

const copy = (list) => list.map((e) => ({ ...e }));
const indexesOf = (list, g) => list.reduce((out, e, k) => (g && e.supersetGroup === g ? [...out, k] : out), []);

/**
 * После переноса: суперсет из одного — уже не суперсет; отдых круга —
 * у нового первого, каким он был у прежнего первого
 */
export function tidyGroups(before, next) {
  const groups = new Set(before.map((e) => e.supersetGroup).filter(Boolean));
  for (const g of groups) {
    const idx = indexesOf(next, g);
    if (idx.length < 2) { idx.forEach((k) => { next[k].supersetGroup = ''; }); continue; }
    const was = before[indexesOf(before, g)[0]];
    const rest = techniqueOf(was.technique).rest;
    const first = next[idx[0]];
    const own = techniqueOf(first.technique);
    if (rest && own.rest !== rest) first.technique = techniqueText({ ...own, rest });
  }
  return next;
}

/**
 * Перенести одно упражнение: from — где было, to — место в списке без
 * него, group — суперсет, в котором оно окажется ('' — отдельно). Вступило
 * в суперсет — подходов столько же, сколько кругов
 */
export function moveExercise(list, from, to, group = '') {
  const next = copy(list);
  const [ex] = next.splice(from, 1);
  if (!ex) return copy(list);
  const joined = group && ex.supersetGroup !== group;
  ex.supersetGroup = group || '';
  if (joined) {
    const mate = next.find((e) => e.supersetGroup === group);
    const n = mate ? parseInt(mate.sets, 10) : 0;
    if (n > 0) Object.assign(ex, { sets: String(n) }, resizeRounds({ ...ex, sets: String(n) }, n));
  }
  next.splice(Math.max(0, Math.min(to, next.length)), 0, ex);
  return tidyGroups(list, next);
}

/** Смахнули «Из суперсета»: упражнение встаёт отдельным сразу под рамкой */
export function leaveBelow(list, i) {
  const g = list[i] && list[i].supersetGroup;
  if (!g) return copy(list);
  const idx = groupMembers(list, i);
  const last = idx[idx.length - 1];
  // Место в списке без него: после последнего из рамки
  return moveExercise(list, i, last, '');
}

/** Смахнули шапку → «Разобрать»: все упражнения суперсета — отдельные */
export function ungroup(list, i) {
  const next = copy(list);
  groupMembers(list, i).forEach((k) => { next[k].supersetGroup = ''; });
  return next;
}

/** Смахнули шапку → «Удалить оба»: что ушло — для «Вернуть» */
export function removeGroup(list, i) {
  const idx = groupMembers(list, i);
  const gone = idx.map((k) => ({ i: k, ex: { ...list[k] } }));
  return { next: list.filter((_, k) => !idx.includes(k)).map((e) => ({ ...e })), gone };
}

/** «Вернуть»: ушедшие — на свои места (по возрастанию номеров) */
export function putBack(list, gone) {
  const next = copy(list);
  [...gone].sort((a, b) => a.i - b.i).forEach(({ i, ex }) => next.splice(Math.min(i, next.length), 0, { ...ex }));
  return next;
}

/**
 * Куда упадёт упражнение, которое ведут пальцем. rows — прямоугольники
 * строк до начала переноса (top/bottom) и их суперсет, по номеру в
 * списке; frames — рамки суперсетов { group: { top, bottom } }; y — где
 * сейчас середина строки под пальцем.
 *
 * Ответ: { to, group, at } — место в списке без него, суперсет ('' —
 * отдельно) и где рисовать черту вставки (y между строками).
 */
export function dropTarget(rows, frames, from, y) {
  const others = rows.map((r, k) => ({ ...r, k })).filter((r) => r.k !== from);
  const mid = (r) => (r.top + r.bottom) / 2;
  let to = others.filter((r) => mid(r) < y).length;
  const inside = Object.keys(frames).find((g) => y >= frames[g].top && y <= frames[g].bottom
    // Рамка, где кроме него никого, — не суперсет, в неё не вступают
    && others.some((r) => r.group === g));
  let group = '';
  if (inside) {
    const pos = others.reduce((out, r, p) => (r.group === inside ? [...out, p] : out), []);
    to = Math.max(pos[0], Math.min(pos[pos.length - 1] + 1, to));
    group = inside;
  } else {
    // Снаружи — не между двумя упражнениями одного суперсета: к ближнему краю рамки
    const a = others[to - 1];
    const b = others[to];
    if (a && b && a.group && a.group === b.group) {
      const pos = others.reduce((out, r, p) => (r.group === a.group ? [...out, p] : out), []);
      const f = frames[a.group];
      to = f && y < (f.top + f.bottom) / 2 ? pos[0] : pos[pos.length - 1] + 1;
    }
  }
  const above = others[to - 1];
  const below = others[to];
  let at = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + 4 : below ? below.top - 4 : 0;
  // В суперсет первым или последним — черта внутри рамки, у строки, а не на её краю
  if (group && !(above && above.group === group)) at = below.top - 2;
  else if (group && !(below && below.group === group)) at = above.bottom + 2;
  // Встанет отдельно рядом с суперсетом — черта за краем рамки, не внутри
  if (!group && above && above.group && frames[above.group]) at = Math.max(at, frames[above.group].bottom + 4);
  if (!group && below && below.group && frames[below.group]) at = Math.min(at, frames[below.group].top - 4);
  return { to, group, at };
}
