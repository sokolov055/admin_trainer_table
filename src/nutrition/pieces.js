// Своё склонение, без ui.jsx: модуль проверяется тестом вне браузера
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/**
 * Яйца — штуками, а не граммами: «2 яйца» понятнее, чем «110 г».
 *
 * В рецептах вес без скорлупы, и он же уходит в КБЖУ; штуки — только для
 * показа. Штука зависит от размера, а размер у всех свой — поэтому его
 * выбирает человек (российская маркировка С2, С1, С0). Рецепты написаны под
 * крупные: 55 г на яйцо. Белок — около 60 % яйца без скорлупы.
 */
export const EGG_SIZES = [
  { id: 'small', label: 'мелкие', mark: 'С2', egg: 40, white: 24 },
  { id: 'medium', label: 'средние', mark: 'С1', egg: 47, white: 28 },
  { id: 'large', label: 'крупные', mark: 'С0', egg: 55, white: 33 },
];

const KEY = 'egg_size_v1';

export function getEggSize() {
  try {
    const saved = localStorage.getItem(KEY);
    return EGG_SIZES.find((s) => s.id === saved) || EGG_SIZES[2];
  } catch (_) {
    return EGG_SIZES[2];
  }
}

export function saveEggSize(id) {
  try { localStorage.setItem(KEY, id); } catch (_) { /* не запомнили — не беда */ }
}

const nouns = {
  'яйцо': (n) => plural(n, 'яйцо', 'яйца', 'яиц'),
  'белок яичный': (n) => plural(n, 'белок', 'белка', 'белков'),
};

/**
 * «2 яйца» — если выходит почти ровно; «2–3 яйца» — если между: полтора
 * яйца не бывает, а «2,3 яйца» не прочтёт никто. null — продукт не штучный.
 */
export function pieceLabel(food, grams, size = getEggSize()) {
  const per = food === 'яйцо' ? size.egg : food === 'белок яичный' ? size.white : 0;
  if (!per || !grams) return null;
  const n = grams / per;
  const round = Math.round(n);
  if (round >= 1 && Math.abs(n - round) <= 0.25) return round + ' ' + nouns[food](round);
  const lo = Math.max(1, Math.floor(n));
  const hi = Math.max(lo + 1, Math.ceil(n));
  return lo + '–' + hi + ' ' + nouns[food](hi);
}

/**
 * Жидкости — в миллилитрах, граммы в скобках: молоко наливают мерным
 * стаканом, а не взвешивают. В рецепте вес (он уходит в КБЖУ); миллилитры
 * — по плотности, округлённые до 5 мл.
 */
export const LIQUIDS = {
  'молоко 2.5%': 1.03,
  'кефир 1%': 1.03,
  'молоко миндальное': 1.01,
  'масло растительное': 0.92,
  'масло оливковое': 0.92,
  'соевый соус': 1.15,
};

export function mlLabel(food, grams) {
  const density = LIQUIDS[food];
  if (!density || !grams) return null;
  const ml = Math.max(5, Math.round(grams / density / 5) * 5);
  return ml + ' мл';
}
