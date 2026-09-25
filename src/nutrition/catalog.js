import { RECIPES as BUNDLED_RECIPES, FOOD as BUNDLED_FOOD } from './recipes.js';

/**
 * Каталог блюд и продуктов, по которому считает подбор (match.js).
 *
 * Главный — с сервера (dishes.list): там блюда с рецептами, их правит тренер,
 * и клиент видит только опубликованные. Встроенный набор (recipes.js) —
 * запасной: пока ответ сервера не пришёл или сервера нет, раздел работает
 * как раньше.
 */
export const CATALOG = { RECIPES: BUNDLED_RECIPES, FOOD: BUNDLED_FOOD, fromServer: false };

export function setCatalog({ dishes, foods }) {
  if (!Array.isArray(dishes) || !dishes.length || !Array.isArray(foods)) return false;
  const FOOD = {};
  foods.forEach((f) => { FOOD[f.name] = { kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs, group: f.group }; });
  CATALOG.FOOD = FOOD;
  CATALOG.RECIPES = dishes.map((d) => ({
    id: d.id, name: d.name, meal: d.meal, portions: d.portions, per: d.per, items: d.items,
    steps: d.steps || [], minutes: d.minutes || 0, tags: d.tags || [], status: d.status,
  }));
  CATALOG.fromServer = true;
  return true;
}
