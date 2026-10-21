// «Ладонь» — второй способ вести дневник (план трёх разборов, находка из
// ONLYFITS): порции рукой вместо граммов. Белок — ладонь, углеводы — горсть,
// жиры — большой палец, овощи — кулак. КБЖУ порции — средние, запись
// всегда «примерно». Совпадает с PALM в server/src/api/diary-handlers.js.
export const PALM = {
  protein: { name: 'Белок · ладонь', kcal: 135, protein: 25, fat: 4, carbs: 0 },
  carbs: { name: 'Углеводы · горсть', kcal: 120, protein: 3, fat: 1, carbs: 25 },
  fat: { name: 'Жиры · большой палец', kcal: 85, protein: 1, fat: 9, carbs: 1 },
  veg: { name: 'Овощи · кулак', kcal: 25, protein: 1.5, fat: 0, carbs: 5 },
};

export const PALM_GROUPS = [
  { id: 'protein', title: 'Белок', hand: 'ладонь', hint: 'мясо, рыба, творог, яйца' },
  { id: 'carbs', title: 'Углеводы', hand: 'горсть', hint: 'крупы, хлеб, картофель, фрукты' },
  { id: 'fat', title: 'Жиры', hand: 'большой палец', hint: 'масло, орехи, сыр' },
  { id: 'veg', title: 'Овощи', hand: 'кулак', hint: 'салат, овощи, зелень' },
];

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (!Number.isInteger(n)) return few;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// «1,5 ладони», «2 горсти», «1 большой палец»
export function palmUnit(id, n) {
  if (id === 'protein') return plural(n, 'ладонь', 'ладони', 'ладоней');
  if (id === 'carbs') return plural(n, 'горсть', 'горсти', 'горстей');
  if (id === 'fat') return plural(n, 'большой палец', 'больших пальца', 'больших пальцев');
  return plural(n, 'кулак', 'кулака', 'кулаков');
}

/**
 * Норма дня в порциях из нормы КБЖУ тренера или анкеты. Белок и углеводы —
 * по граммам, жиры — за вычетом жира, который приходит с белковой едой;
 * овощей — не меньше четырёх кулаков и не меньше, чем ладоней белка.
 * Нет нормы — null: дневник покажет счёт без цели.
 */
export function palmNorm(targets) {
  if (!targets || !(Number(targets.kcal) > 0)) return null;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const protein = clamp(Math.round(Number(targets.protein || 0) / PALM.protein.protein), 2, 10);
  const carbs = clamp(Math.round(Number(targets.carbs || 0) / PALM.carbs.carbs), 1, 12);
  const fat = clamp(Math.round(Math.max(0, Number(targets.fat || 0) - protein * PALM.protein.fat) / PALM.fat.fat), 1, 10);
  return { protein, carbs, fat, veg: Math.max(4, protein) };
}

// Отмеченные порции по группам за список записей дневника
export function palmCount(entries) {
  const out = { protein: 0, carbs: 0, fat: 0, veg: 0 };
  for (const e of entries) if (e.product?.kind === 'palm' && e.product.id in out) out[e.product.id] += Number(e.amount) || 0;
  return out;
}

export function palmSnapshot(id) {
  return { kind: 'palm', id, ...PALM[id], unit: 'portion', approx: true, source: 'Ладонь · примерно' };
}
