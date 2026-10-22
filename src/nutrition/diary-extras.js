/**
 * «Конструктор рационов» (FT-709, 22.10.2026): три подсказки к дневнику без
 * React — их проверяет scripts/test-diary-extras.mjs.
 *
 * 1. Замена продукта с похожим КБЖУ (similarFoods): «рис ↔ гречка»,
 *    «куриная грудка ↔ индейка». Только из нашего справочника (dish_foods).
 * 2. «Что влезет» в остаток дня (snackIdeas): перекусы и продукты, чья
 *    обычная порция помещается в остаток, сначала с большим белком; сладкое
 *    не запрещено — если влезает, оно в списке.
 * 3. Отметки «без ограничений» (FREE): чай, кофе, специи — 0 ккал одним
 *    нажатием. Снимок совпадает с server/src/lib/diary-approx.js freeSnapshot.
 */

const KEYS = ['kcal', 'protein', 'fat', 'carbs'];

/**
 * Роль продукта на кухне. Группы справочника слишком широкие: в «крупах»
 * лежат мука и сухари, в «овощах» — фрукты и сухофрукты, и по одним цифрам
 * рис оказался бы ближе к муке, чем к гречке. Роль — по названию, порядок
 * важен (первое совпадение); продукт без роли сравнивается внутри своей
 * группы, как раньше.
 */
const ROLES = [
  ['fat', /^масло|сметан|сливки/],
  ['sweet', /^сахар|мёд|сироп|варенье|джем|шоколад|конфет|печенье|зефир|пастил|мармелад/],
  ['dried', /финик|изюм|кураг|чернослив|сухофрукт/],
  ['milk', /молок|кефир|ряженк|йогурт|простокваш|айран/],
  ['cheese', /сыр|моцарел|фета|брынз|пармезан/],
  ['cottage', /творог/],
  ['egg', /яйц|яичн/],
  ['bread', /хлеб|хлебц|тортиль|лаваш|батон|лепёшк|тост/],
  ['baking', /мука|сухари|крахмал/],
  ['porridge', /хлопья|манка|отруби|мюсли|гранол/],
  ['fruit', /банан|яблок|груш|апельсин|мандарин|киви|ягод|лимон|грейпфрут|виноград|персик|абрикос|клубник|малин|черник|ананас|манго|хурм|гранат/],
  ['sauce', /соус|паста томат|томатная паста|кетчуп|горчиц/],
];
export function foodRole(name, group = '') {
  const text = String(name || '').toLocaleLowerCase('ru');
  const hit = ROLES.find(([, re]) => re.test(text));
  return hit ? hit[0] : group ? 'group:' + group : '';
}

// Доли калорий из белков, жиров и углеводов (4/9/4)
function shares(f) {
  const p = Number(f.protein || 0) * 4, fat = Number(f.fat || 0) * 9, c = Number(f.carbs || 0) * 4, sum = p + fat + c;
  return sum > 0 ? [p / sum, fat / sum, c / sum] : null;
}

/**
 * Мера близости двух продуктов на 100 г — сумма двух понятных частей:
 * 1) насколько по-разному набираются калории (половина суммы разниц долей
 *    белков, жиров и углеводов: 0 — одинаково, 1 — совсем иначе);
 * 2) насколько отличается калорийность (разница, делённая на большую).
 * 0 — одно и то же; больше LIMIT — уже не замена.
 */
export const SWAP_LIMIT = 0.35;
export function swapDistance(a, b) {
  const sa = shares(a), sb = shares(b), ka = Number(a.kcal || 0), kb = Number(b.kcal || 0);
  if (!sa || !sb || !(ka > 0) || !(kb > 0)) return Infinity;
  const mix = (Math.abs(sa[0] - sb[0]) + Math.abs(sa[1] - sb[1]) + Math.abs(sa[2] - sb[2])) / 2;
  return mix + Math.abs(ka - kb) / Math.max(ka, kb);
}

// Граммы замены той же калорийности: крупно — до 5 г, мелко — до грамма
export function sameKcalGrams(from, to, grams) {
  const raw = Number(grams) * Number(from.kcal) / Number(to.kcal);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw >= 30 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
}

/**
 * Сколько блюд каталога держится на продукте (основной, от 20 г на порцию,
 * как MAIN_GRAMS в recipes.js) — мера «привычности».
 */
export function foodUsage(dishes = []) {
  const count = {};
  dishes.forEach(d => (d?.items || []).forEach(i => { if (Number(i.grams) / (d.portions || 1) >= 20) count[i.food] = (count[i.food] || 0) + 1; }));
  return count;
}

/**
 * 2–3 продукта той же роли с близким КБЖУ на 100 г.
 * foods — справочник { name: { kcal, protein, fat, carbs, group } } (CATALOG.FOOD).
 * grams — сколько продукта в порции: тогда у замены — граммы той же
 * калорийности и разница в белке при этих калориях.
 * usage — foodUsage(блюда): из близких (до SWAP_LIMIT) первыми идут
 * привычные, их проще купить и они уже есть в наших рецептах. По одним
 * цифрам рис ближе к макаронам и кус-кусу, чем к гречке, а человек
 * спрашивает именно про гречку. Без usage — просто по близости.
 */
export function similarFoods(name, foods, { grams = 100, limit = 3, usage = {} } = {}) {
  const from = foods?.[name];
  if (!from) return [];
  const role = foodRole(name, from.group);
  if (!role) return [];
  return Object.entries(foods)
    .filter(([other, f]) => other !== name && foodRole(other, f.group) === role)
    .map(([other, f]) => ({ name: other, food: f, distance: swapDistance(from, f) }))
    .filter(x => x.distance <= SWAP_LIMIT)
    .sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0) || a.distance - b.distance || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit)
    .map(({ name: other, food: f, distance }) => {
      const g = sameKcalGrams(from, f, grams);
      return { name: other, grams: g, distance: Math.round(distance * 100) / 100, proteinDelta: Math.round((Number(f.protein || 0) * g - Number(from.protein || 0) * grams) / 10) / 10 };
    });
}

/**
 * Обычная порция перекуса для продукта справочника. Сырое мясо, крупы и
 * мука — не перекус: у них порции нет, и в «Что влезет» они не попадают.
 */
const SNACK_PORTIONS = [
  [/творожный сыр/, 30], [/творог/, 150], [/йогурт/, 150], [/кефир|ряженк|^молоко \d/, 200],
  [/сыр|моцарел|фета/, 30], [/тунец/, 80], [/^яйцо$/, 110], [/хумус/, 50],
  [/хлебц/, 20], [/^хлеб/, 40],
  [/банан|яблок|груш|апельсин|мандарин|киви/, 150], [/ягод/, 100],
  [/финик|изюм|кураг|чернослив/, 30], [/паста арахис/, 20], [/^миндаль|орех|семечки|кешью|фундук/, 30],
  [/мёд/, 20], [/шоколад/, 25],
  [/огур|морковь|помидор|сельдер|перец болг/, 150],
];
export function snackPortion(name) {
  const text = String(name || '').toLocaleLowerCase('ru');
  return SNACK_PORTIONS.find(([re]) => re.test(text))?.[1] || 0;
}
const SWEET = /мёд|сахар|финик|изюм|кураг|шоколад|какао|варенье|джем|сироп/;
const isSweet = (name, items = []) => SWEET.test(String(name).toLocaleLowerCase('ru')) || items.some(i => SWEET.test(String(i.food || '').toLocaleLowerCase('ru')));
const round1 = v => Math.round(Number(v || 0) * 10) / 10;

/**
 * Что влезет в остаток: перекусы тренера (одна порция) и продукты с обычной
 * порцией, у которых калорий не больше остатка. Сначала — больше белка.
 * Сладкое не прячем: если в первые limit оно не попало, а влезает, —
 * последнее место отдаём лучшему сладкому (подход без запретов).
 * Возвращает готовые продукты дневника: { product, amount, kcal, protein, sweet }.
 */
export function snackIdeas({ remaining, foods = {}, dishes = [], limit = 8 }) {
  if (!(remaining > 0)) return [];
  const rows = [];
  dishes.filter(d => d && d.meal === 'перекус' && (!d.status || d.status === 'published') && d.per).forEach(d => {
    const per = d.per;
    rows.push({ product: { kind: 'dish', id: d.id, name: d.name, ...Object.fromEntries(KEYS.map(k => [k, per[k]])), unit: 'portion', source: 'Рецепт тренера · одна порция', meal: d.meal }, amount: 1, kcal: Number(per.kcal || 0), protein: Number(per.protein || 0), sweet: isSweet(d.name, d.items || []) });
  });
  Object.entries(foods).forEach(([name, f]) => {
    const grams = snackPortion(name);
    if (!grams) return;
    const k = grams / 100;
    rows.push({ product: { kind: 'ingredient', id: name, name, ...Object.fromEntries(KEYS.map(key => [key, f[key]])), unit: 'g', source: 'Справочник ингредиентов · вес до приготовления' }, amount: grams, kcal: Math.round(Number(f.kcal || 0) * k), protein: round1(Number(f.protein || 0) * k), sweet: isSweet(name) });
  });
  const fit = rows.filter(r => r.kcal > 0 && r.kcal <= remaining)
    .sort((a, b) => b.protein - a.protein || a.kcal - b.kcal || a.product.name.localeCompare(b.product.name, 'ru'));
  const top = fit.slice(0, limit);
  if (!top.some(r => r.sweet)) {
    const sweet = fit.find(r => r.sweet);
    if (sweet && top.length) top[top.length - 1] = sweet;
  }
  return top;
}

/**
 * «Без ограничений»: 0 ккал, одним нажатием, без поиска. Вода — своей
 * кнопкой «+ 250 мл» рядом (в литрах за день, не записью). Названия и
 * снимок — как на сервере (diary-approx.js FREE / freeSnapshot).
 */
export const FREE = {
  tea: { name: 'Чай без сахара', short: 'Чай' },
  coffee: { name: 'Кофе без сахара и молока', short: 'Кофе' },
  spices: { name: 'Специи', short: 'Специи' },
  greens: { name: 'Зелень', short: 'Зелень' },
  sweetener: { name: 'Подсластитель', short: 'Подсластитель' },
};
export function freeSnapshot(id) {
  const f = Object.hasOwn(FREE, id) ? FREE[id] : null;
  if (!f) return null;
  return { kind: 'free', id, name: f.name, kcal: 0, protein: 0, fat: 0, carbs: 0, unit: 'portion', source: 'Без ограничений · 0 ккал' };
}

/** Текст вопроса тренеру о замене — его можно поправить перед отправкой */
export function swapQuestion({ dish, food, grams, to }) {
  const what = '«' + food + '»' + (grams ? ' (' + grams + ' г)' : '');
  const where = dish ? ' в блюде «' + dish + '»' : '';
  return to
    ? 'Питание: можно' + where + ' заменить ' + what + ' на «' + to.name + '»' + (to.grams ? ' (' + to.grams + ' г)' : '') + '?'
    : 'Питание: чем можно заменить ' + what + where + '?';
}
