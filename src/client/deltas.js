/**
 * Изменения показателей с прошлого замера: для каждого показателя — два
 * последних замера, где он записан. Талию меряют не каждый раз, и «прошлый
 * замер» у неё — последний, где она есть, а не соседняя строка с одним весом.
 *
 * Итог за всё время считает сервер (`deltas` у серии); этот — на месте,
 * из тех же строк.
 */
export function recentDeltas(rows, fields) {
  const out = {};
  const sorted = (rows || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  fields.forEach((f) => {
    const has = sorted.filter((r) => r[f] !== null && r[f] !== undefined && r[f] !== '');
    if (has.length < 2) return;
    const prev = has[has.length - 2];
    const last = has[has.length - 1];
    out[f] = {
      first: prev[f],
      last: last[f],
      delta: Math.round((last[f] - prev[f]) * 10) / 10,
      from: prev.date,
    };
  });
  return out;
}

const KEY = 'progress_period_v1';

/** Выбранный период — удобство одного телефона, не данные */
export function savedPeriod() {
  try { return localStorage.getItem(KEY) === 'last' ? 'last' : 'all'; } catch (_) { return 'all'; }
}

export function savePeriod(value) {
  try { localStorage.setItem(KEY, value); } catch (_) { /* не запомнили — не беда */ }
}

/*
 * Вкладки «Прогресса» (владелец, 11.11.2026): лента из ~12 экранов разбита
 * на «Тело / Сила / Активность». Выбранная — тоже удобство одного телефона.
 */
const TAB_KEY = 'progress_tab_v1';
export const PROGRESS_TABS = [
  { value: 'body', label: 'Тело' },
  { value: 'strength', label: 'Сила' },
  { value: 'activity', label: 'Активность' },
];

export function savedProgressTab() {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return PROGRESS_TABS.some((t) => t.value === v) ? v : 'body';
  } catch (_) { return 'body'; }
}

export function saveProgressTab(value) {
  try { localStorage.setItem(TAB_KEY, value); } catch (_) { /* не запомнили — не беда */ }
}
