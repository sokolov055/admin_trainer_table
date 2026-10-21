// Только VITE_MOCK: персистентный стенд без данных настоящих клиентов.
import { FOOD, RECIPES } from './recipes.js';
import { today, shiftDay, totalEntries } from './diary-model.js';
import { PALM, palmSnapshot } from './palm-model.js';
const copy = x => JSON.parse(JSON.stringify(x));
const fail = (code, text) => { throw Object.assign(new Error(text), { code }); };
export function diaryMock(action, p = {}) {
  const key = 'nutrition_demo_server:' + (p.clientRow || 3);
  let s;
  try { s = JSON.parse(localStorage.getItem(key)); } catch { /* пустой стенд */ }
  s ||= { days: {}, targets: { kcal: 2000, protein: 130, fat: 65, carbs: 224 }, recipes: [], foods: [{ id: 551, kind: 'food', name: 'Йогурт 2%', kcal: 70, protein: 8, fat: 2, carbs: 5, unit: 'g', source: 'Демо: данные с этикетки' }], likes: ['food:551', 'dish:' + RECIPES[0].id], operations: {} };
  const dayOf = d => { s.days[d] ||= { day: d, entries: [], complete: false, waterMl: 0, comment: '', revision: 0 }; return s.days[d]; };
  const present = d => ({ ...copy(dayOf(d)), totals: totalEntries(dayOf(d).entries), targets: s.targets, settings: s.settings || { mode: 'count', meals: null, chosen: false } });
  const catalog = () => [
    ...s.recipes, ...s.foods,
    ...Object.entries(FOOD).map(([name, f]) => ({ kind: 'ingredient', id: name, name, ...f, unit: 'g', source: 'Справочник · вес до приготовления' })),
    ...RECIPES.map(r => ({ kind: 'dish', id: r.id, name: r.name, ...r.per, unit: 'portion', source: 'Рецепт тренера · одна порция', ingredients: r.items, steps: r.steps, meal: r.meal, minutes: r.minutes, tags: r.minutes && r.minutes <= 20 ? ['быстро'] : [] })),
  ].map(f => ({ ...f, liked: s.likes.includes(f.kind + ':' + f.id) }));
  // «Только калории» и «Ладонь» — как на сервере (diary-handlers.js resolveProduct)
  const quick = ref => { const kcal = Number(ref.kcal); if (!(kcal >= 1 && kcal <= 5000)) fail(400, 'Калории: от 1 до 5000.'); const m = k => ref[k] === '' || ref[k] == null ? null : Number(ref[k]); const name = String(ref.name || '').trim() || 'Примерно'; return { kind: 'quick', id: 'q-' + name.toLowerCase() + '-' + kcal, name, kcal, protein: m('protein'), fat: m('fat'), carbs: m('carbs'), unit: 'portion', approx: true, source: 'Примерно · без продукта' }; };
  const resolve = ref => ref?.kind === 'quick' ? quick(ref) : ref?.kind === 'palm' ? (PALM[ref.id] ? palmSnapshot(ref.id) : fail(400, 'Выберите группу.')) : catalog().find(f => f.kind === ref.kind && String(f.id) === String(ref.id)) || fail(404, 'Продукт не найден.');
  const day = p.day || today();
  if (p.requestId && s.operations[p.requestId]) return copy(s.operations[p.requestId]);
  let result;
  if (action === 'diary.get') result = present(day);
  else if (action === 'diary.settings.save') {
    const old = s.settings || { mode: 'count', meals: null };
    if (p.meals && Object.values(p.meals).reduce((a, b) => a + Number(b), 0) !== 100) fail(400, 'Доли приёмов в сумме должны давать 100 %.');
    s.settings = { mode: p.mode ?? old.mode, meals: p.meals === undefined ? old.meals : p.meals, chosen: true }; result = copy(s.settings);
  } else if (action === 'diary.catalog') {
    let all = catalog().filter(f => (f.name + ' ' + (f.brand || '') + ' ' + (f.barcode || '')).toLowerCase().includes(String(p.q || '').toLowerCase()));
    if (p.scope === 'favorites') all = all.filter(f => f.liked);
    if (p.scope === 'recent') { const ids = new Set(Object.values(s.days).flatMap(d => d.entries.filter(e => !['quick', 'palm'].includes(e.product.kind)).map(e => e.product.kind + ':' + e.product.id))); all = all.filter(f => ids.has(f.kind + ':' + f.id)); }
    result = { products: all, ownRecipes: s.recipes };
  } else if (action === 'diary.entry.save') {
    const old = p.id ? Object.values(s.days).flatMap(d => d.entries).find(e => e.id === p.id) : null;
    if (old && old.revision !== p.revision) fail(409, 'Запись изменена на другом устройстве.');
    if (p.id && !old) fail(404, 'Запись не найдена.');
    if (old) { dayOf(old.day).entries = dayOf(old.day).entries.filter(e => e.id !== old.id); dayOf(old.day).complete = false; }
    const e = { id: old?.id || p.requestId, day, meal: p.meal, amount: Number(p.amount), product: copy(old?.product || resolve(p.product)), revision: (old?.revision || 0) + 1, requestId: old?.requestId || p.requestId };
    dayOf(day).entries.push(e); dayOf(day).revision++; dayOf(day).complete = false; result = e;
  } else if (action === 'diary.entry.remove') {
    const d = Object.values(s.days).find(d => d.entries.some(e => e.id === p.id));
    if (!d) fail(404, 'Запись не найдена.');
    d.entries = d.entries.filter(e => e.id !== p.id); d.revision++; d.complete = false; result = { removed: p.id };
  } else if (action === 'diary.day.save') {
    const d = dayOf(day); if (d.revision !== p.revision) fail(409, 'День изменился. Обновите дневник.');
    if (p.complete !== undefined) d.complete = p.complete;
    if (p.waterDelta !== undefined) d.waterMl += p.waterDelta;
    if (p.comment !== undefined) d.comment = p.comment;
    d.revision++; result = present(day);
  } else if (action === 'diary.like') {
    const id = p.kind + ':' + p.id; s.likes = s.likes.filter(l => l !== id); if (p.liked) s.likes.push(id); result = { liked: p.liked };
  } else if (action === 'diary.copy') {
    const source = copy(dayOf(p.fromDay).entries.filter(e => !p.fromMeal || e.meal === p.fromMeal));
    if (!source.length) fail(400, 'В выбранном дне нет записей.');
    dayOf(day).entries.push(...source.map((e, i) => ({ ...e, day, meal: p.toMeal || e.meal, id: p.requestId + '-' + i, requestId: p.requestId + '-' + i, revision: 1 })));
    dayOf(day).complete = false; dayOf(day).revision++; result = { copied: source.length };
  } else if (action === 'diary.week') {
    const days = Array.from({ length: 7 }, (_, i) => present(shiftDay(day, i - 6))), full = days.filter(d => d.complete);
    result = { days, fullDays: full.length, average: full.length ? Object.fromEntries(['kcal', 'protein', 'fat', 'carbs'].map(k => [k, full.reduce((sum, d) => sum + d.totals[k], 0) / full.length])) : null };
  } else if (action === 'diary.target.save') { s.targets = Object.fromEntries(Object.entries(p.targets).map(([k, v]) => [k, Number(v)])); result = { targets: s.targets }; }
  else if (action === 'diary.recipe.save') {
    const ingredients = p.ingredients.map(i => ({ product: resolve(i.product), amount: Number(i.amount) })), total = totalEntries(ingredients), id = p.id || 'recipe-' + p.requestId;
    const old = s.recipes.find(r => r.id === p.id);
    if (p.id && (!old || old.revision !== p.revision)) fail(409, 'Рецепт изменился. Обновите список.');
    const recipe = { kind: 'recipe', id, name: p.name, ingredients, outputGrams: Number(p.outputGrams), revision: (old?.revision || 0) + 1, unit: 'g', source: 'Ваш рецепт · готовый вес', ...Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v * 100 / Number(p.outputGrams)])) };
    s.recipes = s.recipes.filter(r => r.id !== id); s.recipes.push(recipe); s.likes.push('recipe:' + id); result = recipe;
  } else if (action === 'food.search') {
    result = { foods: s.foods.filter(f => (!p.reviewStatus || (f.reviewStatus || 'unverified') === p.reviewStatus) && (f.name + ' ' + (f.brand || '') + ' ' + (f.barcode || '')).toLowerCase().includes(String(p.q || '').toLowerCase())) };
  } else if (action === 'food.review') {
    const old = s.foods.find(f => f.id === p.id);
    if (!old) fail(404, 'Продукт не найден.');
    Object.assign(old, p, { source: 'Этикетка проверена тренером', revision: (old.revision || 1) + 1, reviewStatus: 'verified' });
    result = { food: old };
  } else if (action === 'food.hide') {
    s.foods = s.foods.filter(f => f.id !== p.id); result = { hidden: p.id };
  } else if (action === 'food.add') {
    const old = s.foods.find(f => f.name.toLowerCase() === p.name.toLowerCase() && (f.brand || '') === (p.brand || ''));
    const product = old || { id: Date.now(), kind: 'food', name: p.name, brand: p.brand || '', barcode: p.barcode || '', preparation: p.preparation || 'as_sold', revision: 1, reviewStatus: 'unverified', unit: p.unit === 'ml' ? 'ml' : 'g', source: 'Демо: данные с этикетки', ...Object.fromEntries(['kcal', 'protein', 'fat', 'carbs'].map(k => [k, Number(p[k])])) };
    if (!old) s.foods.push(product); result = { food: product, existed: !!old };
  } else fail(404, 'Нет демо-данных для ' + action);
  if (p.requestId) s.operations[p.requestId] = copy(result);
  localStorage.setItem(key, JSON.stringify(s));
  return copy(result);
}
