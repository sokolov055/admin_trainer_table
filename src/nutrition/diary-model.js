export const DIARY_MEALS = [{ id: 'breakfast', label: 'Завтрак' }, { id: 'lunch', label: 'Обед' }, { id: 'dinner', label: 'Ужин' }, { id: 'snack', label: 'Перекус' }];
export const NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs'];
export const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
export const shiftDay = (day, count) => new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
export const requestId = () => globalThis.crypto?.randomUUID?.() || 'diary-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
export const totalEntries = entries => entries.reduce((sum, e) => {
  const factor = e.amount / (e.product.unit === 'portion' ? 1 : 100);
  NUTRIENTS.forEach(k => { sum[k] += Number(e.product[k] || 0) * factor; });
  return sum;
}, { kcal: 0, protein: 0, fat: 0, carbs: 0 });
export function withPending(day, writes = []) {
  const extra = writes.filter(w => w.kind === 'diaryEntry' && w.params.day === day.day && !day.entries.some(e => e.requestId === w.params.requestId)).map(w => ({ id: 'pending-' + w.params.requestId, day: w.params.day, meal: w.params.meal, amount: w.params.amount, product: w.params.preview, pending: true, error: w.error || '', params: w.params }));
  const entries = [...day.entries, ...extra];
  return { ...day, entries, totals: totalEntries(entries), complete: extra.length ? false : day.complete };
}
export function productKey(p) { return p.kind + ':' + p.id; }
export function mealFromRecipe(value) { return ({ 'завтрак': 'breakfast', 'обед': 'lunch', 'ужин': 'dinner', 'перекус': 'snack' })[value] || 'snack'; }
