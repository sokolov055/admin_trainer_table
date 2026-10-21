export const DIARY_MEALS = [{ id: 'breakfast', label: 'Завтрак' }, { id: 'lunch', label: 'Обед' }, { id: 'dinner', label: 'Ужин' }, { id: 'snack', label: 'Перекус' }];
export const NUTRIENTS = ['kcal', 'protein', 'fat', 'carbs'];
export const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
export const shiftDay = (day, count) => new Date(Date.parse(day + 'T12:00:00Z') + count * 86400000).toISOString().slice(0, 10);
// День словами: «Сегодня», «Вчера», «Завтра», иначе «20 октября, вт» (год — только если не текущий).
// Сырые «2026-10-20» и «20.10.2026» человеку не показываем.
export function dayLabel(iso) {
  const now = today();
  if (iso === now) return 'Сегодня';
  if (iso === shiftDay(now, -1)) return 'Вчера';
  if (iso === shiftDay(now, 1)) return 'Завтра';
  const d = new Date(iso + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return String(iso || '');
  const opts = { timeZone: 'UTC' };
  const date = d.toLocaleDateString('ru-RU', { ...opts, day: 'numeric', month: 'long', ...(iso.slice(0, 4) === now.slice(0, 4) ? {} : { year: 'numeric' }) }).replace(/\s?г\.$/, '');
  return date + ', ' + d.toLocaleDateString('ru-RU', { ...opts, weekday: 'short' });
}
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
// Приём по часам телефона: кнопка внизу экрана сразу открывает тот, что сейчас
export function mealNow(hour = new Date().getHours()) { return hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'snack'; }
// Итог дня одной фразой: в пределах 10 % нормы — «в норме»
export function dayVerdict(eaten, target) {
  if (!(target > 0)) return { tone: 'neutral', text: 'Норма не назначена — итог без сравнения.' };
  const diff = Math.round(eaten - target), fmt = v => Math.abs(v).toLocaleString('ru-RU');
  if (Math.abs(diff) <= target * 0.1) return { tone: 'good', text: 'В пределах нормы — так держать.' };
  if (diff < 0) return { tone: 'under', text: 'Меньше нормы на ' + fmt(diff) + ' ккал. Если записано не всё — допишите до завершения.' };
  return { tone: 'over', text: 'Больше нормы на ' + fmt(diff) + ' ккал. Смотрите на неделю: один день результат не меняет.' };
}
export function mealFromRecipe(value) { return ({ 'завтрак': 'breakfast', 'обед': 'lunch', 'ужин': 'dinner', 'перекус': 'snack' })[value] || 'snack'; }
// Подписи и разбор ввода дневника (перенесены из Diary.jsx 21.10.2026): без React
export const label = id => DIARY_MEALS.find(m => m.id === id)?.label || id;
export const paramsOf = clientRow => clientRow ? { clientRow } : {};
export const decimal = value => Number(String(value).replace(',', '.'));
