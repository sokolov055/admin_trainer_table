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
