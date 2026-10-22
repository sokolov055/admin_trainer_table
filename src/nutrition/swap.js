import { CATALOG } from './catalog.js';
import { dayTotals } from './match.js';
import { carbLevel } from './carbs.js';

/**
 * Замена блюда в собранном дне на похожее (FT-709). Без React —
 * проверяется scripts/test-carbs.mjs.
 *
 * «Другой вариант» меняет весь день; здесь человек меняет одно блюдо, а
 * остальное оставляет. Чтобы день не развалился, замена — того же приёма
 * пищи, того же уровня углеводов и с калорийностью порции ±15 %. Сначала
 * понравившиеся (их человек уже готов готовить), потом ближайшие по
 * калориям. Блюда, которые уже стоят в дне, не предлагаются.
 */

export const SWAP_TOLERANCE = 0.15;

export function similarDishes(recipe, { liked = [], exclude = [], recipes = CATALOG.RECIPES } = {}) {
  if (!recipe || !recipe.per) return [];
  const level = carbLevel(recipe.per), kcal = Number(recipe.per.kcal) || 0;
  const likedSet = new Set(liked), skip = new Set([recipe.id, ...exclude]);
  return recipes
    .filter((r) => !skip.has(r.id) && r.meal === recipe.meal && r.per
      && carbLevel(r.per) === level && Math.abs(r.per.kcal - kcal) <= kcal * SWAP_TOLERANCE)
    .sort((a, b) => (likedSet.has(b.id) - likedSet.has(a.id))
      || Math.abs(a.per.kcal - kcal) - Math.abs(b.per.kcal - kcal)
      || a.name.localeCompare(b.name, 'ru'));
}

/**
 * Следующая замена для блюда на месте index: по кругу среди похожих на
 * ИСХОДНОЕ блюдо (original), чтобы повторное «Заменить» не уводило всё
 * дальше от него. null — заменить не на что.
 */
export function nextSwap(original, current, { liked = [], exclude = [], recipes } = {}) {
  const list = similarDishes(original, { liked, exclude: exclude.filter((id) => id !== current.id), recipes });
  if (!list.length) return null;
  const options = [original, ...list];
  const at = options.findIndex((r) => r.id === current.id);
  const next = options[(at + 1) % options.length];
  return next.id === current.id ? null : next;
}

/** День с заменами: swaps — { номер блюда: блюдо }. Итоги пересчитываются */
export function applySwaps(plan, swaps) {
  if (!plan || !swaps || !Object.keys(swaps).length) return plan;
  const dishes = plan.dishes.map((dish, i) => (swaps[i] ? { ...dish, recipe: swaps[i] } : dish));
  return { ...plan, dishes, totals: dayTotals(dishes) };
}
