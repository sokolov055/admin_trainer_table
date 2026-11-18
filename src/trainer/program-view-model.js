/**
 * Экран программы в «Библиотеке» тренера (этап 2 макета
 * templates-programs-2026-11-17, согласован 17.11.2026): недели вкладками,
 * нагрузка на мышцы за всю программу, схема упражнения плашками. Чистые
 * функции без React — scripts/test-program-view.mjs.
 */

import { planText } from '../exercise-track.js';

/** Тот же подсчёт, что tallyExercises (MuscleMap.jsx): подходы основной и синергистом */
export function tallyOf(exercises) {
  const tally = {};
  (exercises || []).forEach((ex) => {
    const m = ex && ex.muscles;
    if (!m) return;
    const sets = Math.max(1, parseInt(ex.sets, 10) || 1);
    (m.primary || []).forEach((r) => { (tally[r] = tally[r] || { primary: 0, secondary: 0 }).primary += sets; });
    (m.secondary || []).forEach((r) => { (tally[r] = tally[r] || { primary: 0, secondary: 0 }).secondary += sets; });
  });
  return tally;
}

/** Подпись нагрузки недели на вкладке: «база», «+ вес», «легче» */
export const LOAD_WORD = { '': 'база', heavy: '+ вес', light: 'легче' };

const weekOf = (b) => Number(b.week) || 1;

/**
 * Недели программы: [{ n, load, items: [{ block, index }] }]. Без недель —
 * одна «неделя» n = 0 со всеми тренировками (вкладок тогда нет). index —
 * номер тренировки в программе, по нему и ключ раскрытия
 */
export function weeksOf(t) {
  const blocks = (t && t.blocks) || [];
  const length = Math.max(Number(t && t.weekLength) || 0, ...blocks.map((b) => Number(b.week) || 0));
  if (!length) return [{ n: 0, load: '', items: blocks.map((block, index) => ({ block, index })) }];
  return Array.from({ length }, (_, w) => {
    const items = blocks.map((block, index) => ({ block, index })).filter(({ block }) => weekOf(block) === w + 1);
    const loads = new Set(items.map(({ block }) => block.load || ''));
    return { n: w + 1, load: items.length && loads.size === 1 ? [...loads][0] : '', items };
  });
}

/** Крупные группы для полосок «Нагрузка на мышцы» — показываются 4 самые нагруженные */
export const MUSCLE_GROUPS = [
  ['Ноги и ягодицы', ['quadriceps', 'hamstrings', 'adductors', 'abductors', 'calves', 'glutes', 'hip-flexors']],
  ['Спина', ['lats', 'trapezius', 'lower-back']],
  ['Пресс и кор', ['abs', 'obliques']],
  ['Грудь и плечи', ['chest', 'serratus', 'front-deltoids', 'side-deltoids', 'back-deltoids', 'rotator-cuff']],
  ['Руки', ['biceps', 'triceps', 'forearms']],
];

/** Мышцы, отсутствие основной нагрузки на которые стоит заметить тренеру; дельты — одним словом */
const NOTABLE = [
  ['грудь', ['chest']], ['спина', ['lats', 'trapezius']], ['плечи', ['front-deltoids', 'side-deltoids', 'back-deltoids']],
  ['бицепс', ['biceps']], ['трицепс', ['triceps']], ['пресс', ['abs', 'obliques']], ['ягодицы', ['glutes']],
  ['квадрицепс', ['quadriceps']], ['бицепс бедра', ['hamstrings']], ['икры', ['calves']],
];

/**
 * Нагрузка за всю программу (решение владельца 17.11.2026): подходы
 * основной нагрузкой + половина синергистом. bars — до 4 групп с долей от
 * самой нагруженной; gaps — заметные мышцы без основной нагрузки
 */
export function muscleLoad(blocks) {
  const tally = tallyOf((blocks || []).flatMap((b) => b.exercises || []));
  const score = (r) => (tally[r] ? tally[r].primary + tally[r].secondary / 2 : 0);
  const groups = MUSCLE_GROUPS.map(([label, regions]) => ({ label, value: regions.reduce((s, r) => s + score(r), 0) }))
    .filter((g) => g.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  const top = groups.length ? groups[0].value : 0;
  const bars = groups.map((g) => ({ label: g.label, share: top ? Math.max(0.06, g.value / top) : 0 }));
  const any = Object.keys(tally).length > 0;
  const gaps = any ? NOTABLE.filter(([, rs]) => !rs.some((r) => tally[r] && tally[r].primary)).map(([label]) => label) : [];
  return { tally, bars, gaps };
}

/** «Бицепс, икры» / «бицепс, икры, грудь и ещё 2» */
export function gapsLine(gaps, max = 4) {
  if (!gaps.length) return '';
  const shown = gaps.slice(0, max).join(', ');
  const line = gaps.length > max ? shown + ' и ещё ' + (gaps.length - max) : shown;
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Схема упражнения плашками: ['4×10', '40 кг']; кардио — отдельно (cardioLine) */
export function schemeOf(e) {
  const volume = [e.sets, planText(e.reps)].filter(Boolean).join('×');
  const w = planText(e.weight);
  return [volume, w && w + (/\d$/.test(w) ? ' кг' : '')].filter(Boolean);
}

/** «Анна, Мария, Елена · неделя 2–3» */
export function clientsLine(clients = []) {
  if (!clients.length) return '';
  const names = clients.map((c) => String(c.name || '').trim().split(/\s+/)[0]);
  const shown = names.length > 3 ? names.slice(0, 3).join(', ') + ' и ещё ' + (names.length - 3) : names.join(', ');
  const weeks = clients.map((c) => Number(c.week) || 0).filter(Boolean);
  if (!weeks.length) return shown;
  const lo = Math.min(...weeks);
  const hi = Math.max(...weeks);
  return shown + ' · неделя ' + (lo === hi ? lo : lo + '–' + hi);
}
