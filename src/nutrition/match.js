import { STAPLES, MAIN_GRAMS, MEALS, GROUPS } from './recipes.js';
import { CATALOG } from './catalog.js';

/**
 * ==========================================================================
 * Подбор рациона из того, что есть дома
 *
 * Здесь нет ни разметки, ни запросов — только счёт. Вынесено отдельно не
 * ради чистоты: это единственная часть раздела, которую можно проверить
 * тестом, не поднимая браузер. Экран проверяется глазами, подбор — числами.
 *
 * Три шага, и каждый отвечает на свой вопрос человека:
 *   что я могу приготовить      → rankRecipes
 *   что из этого съесть сегодня → planVariants
 *   что докупить                → shoppingList
 * ==========================================================================
 */

/** Приёмы пищи, которые пропускать нельзя. Перекус — можно. */
const REQUIRED_MEALS = ['завтрак', 'обед', 'ужин'];

const asSet = (pantry) => (pantry instanceof Set ? pantry : new Set(pantry || []));

/**
 * Продукты блюда, разделённые на основные и мелочи.
 *
 * Мелочи — всё легче двадцати граммов: масло, мёд, томатная паста, зелень.
 * Они не участвуют в подборе, но попадают в список покупок. Считать их
 * наравне с основными нельзя: тогда отсутствие пяти граммов зелени весит
 * столько же, сколько отсутствие двухсот граммов курицы, и наверх всплывает
 * блюдо, готовить которое не из чего.
 */
export function splitItems(recipe) {
  const main = [];
  const minor = [];
  for (const item of recipe.items) {
    (item.grams >= MAIN_GRAMS ? main : minor).push(item);
  }
  return { main, minor };
}

/**
 * Вес одной порции — в том виде, в каком продукты кладут на весы.
 *
 * Это сырой вес: крупы и макароны сухие, мясо и рыба сырые, так собран
 * весь справочник. Варёная порция тяжелее на впитанную воду, и выдавать
 * одно за другое нельзя — на упаковке крупы написано то же самое, и
 * человек сравнивает именно с ним.
 */
export function portionWeight(recipe) {
  const total = recipe.items.reduce((sum, item) => sum + item.grams, 0);
  return Math.round(total / (recipe.portions || 1));
}

/**
 * КБЖУ на сто граммов.
 *
 * Нужно для сравнения: «447 ккал» ничего не говорит о том, тяжёлое блюдо
 * или лёгкое, пока не известно, сколько это граммов. На сто граммов —
 * единственная величина, которой человек уже умеет пользоваться: она же
 * написана на каждой упаковке.
 */
export function per100(recipe) {
  const weight = portionWeight(recipe);
  if (!weight) return null;

  const share = 100 / weight;
  const round = (value, digits) => Math.round(value * share * 10 ** digits) / 10 ** digits;

  return {
    kcal: Math.round(recipe.per.kcal * share),
    protein: round(recipe.per.protein, 1),
    fat: round(recipe.per.fat, 1),
    carbs: round(recipe.per.carbs, 1),
  };
}

/**
 * Блюда, отсортированные по тому, насколько они собираются из наличного.
 *
 * Сортировка идёт по ЧИСЛУ недостающих продуктов, а не по проценту
 * совпадения. Человек думает именно так: «не хватает помидоров» — это одна
 * покупка, а «совпадение 71 %» не означает ничего и не подсказывает, идти
 * ли в магазин. Процент используется только для разрешения ничьих: при
 * равном числе покупок выше то блюдо, где наличного больше.
 *
 * `maxMissing` отсекает блюда, до которых далеко: раздел обещает готовку из
 * того, что дома, и список, где каждое второе блюдо требует похода в
 * магазин, это обещание нарушает. Но если под отсечку попало слишком мало,
 * она снимается: пустая колода бесполезнее честного «вот, но придётся
 * докупить». Именно так выглядит холодильник, в котором три продукта.
 */
export function rankRecipes(pantry, { limit = 20, maxMissing = 3 } = {}) {
  const have = asSet(pantry);

  const scored = CATALOG.RECIPES.map((recipe) => {
    const { main, minor } = splitItems(recipe);
    const missing = main.filter((i) => !have.has(i.food)).map((i) => i.food);
    return {
      recipe,
      // Наличное считаем по ВСЕМУ составу, включая мелочи. Подбор их не
      // учитывает, но карточка показывает состав целиком, и масло, которое
      // дома есть, не должно светиться как недостающее.
      have: recipe.items.filter((i) => have.has(i.food)).map((i) => i.food),
      missing,
      // Мелочи, которых нет дома: в карточке о них говорить незачем, но в
      // списке покупок они обязаны появиться — иначе человек встанет у
      // плиты без масла.
      minorMissing: minor.filter((i) => !have.has(i.food)).map((i) => i.food),
      coverage: main.length ? (main.length - missing.length) / main.length : 1,
    };
  });

  const order = (a, b) => (
    a.missing.length - b.missing.length
    || b.coverage - a.coverage
    || a.recipe.name.localeCompare(b.recipe.name, 'ru')
  );

  const close = scored.filter((s) => s.missing.length <= maxMissing).sort(order);
  if (close.length >= 8) return close.slice(0, limit);
  return scored.sort(order).slice(0, limit);
}

/**
 * Сумма КБЖУ за день.
 *
 * `servings` — сколько порций человек СЪЕДАЕТ, и это не то же самое, что
 * `recipe.portions` — сколько порций получается из кастрюли. Борщ варится на
 * шесть, съедается полторы; путать эти два числа нельзя ни в рационе, ни в
 * списке покупок, поэтому они и названы по-разному.
 */
export function dayTotals(dishes) {
  const totals = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const dish of dishes) {
    for (const key of Object.keys(totals)) {
      totals[key] += dish.recipe.per[key] * dish.servings;
    }
  }
  // Складываем десятые доли — без округления вылезает 104.10000000000001.
  for (const key of Object.keys(totals)) totals[key] = Math.round(totals[key] * 10) / 10;
  totals.kcal = Math.round(totals.kcal);
  return totals;
}

/**
 * Насколько день промахивается мимо нормы. Меньше — лучше.
 *
 * Калории весят больше всего: это то число, ради которого человек сюда и
 * пришёл. Белок штрафуется только СНИЗУ — недобор белка портит результат,
 * перебор не портит ничего, и наказывать за него значило бы отбрасывать
 * хорошие дни. Жиры и углеводы участвуют вполсилы: при сошедшихся калориях
 * и белке они почти всегда сходятся сами.
 */
function penalty(sum, target) {
  const share = (value, goal) => (goal > 0 ? Math.abs(value - goal) / goal : 0);
  const short = (value, goal) => (goal > 0 ? Math.max(0, goal - value) / goal : 0);
  return 2 * share(sum.kcal, target.kcal)
    + 1.5 * short(sum.protein, target.protein)
    + 0.5 * share(sum.fat, target.fat)
    + 0.5 * share(sum.carbs, target.carbs);
}

/**
 * Добавка: во сколько порций может идти основной приём пищи.
 *
 * Понадобилась не для красоты. Самое калорийное блюдо набора — 631 ккал, и
 * день из завтрака, обеда, ужина и перекуса упирается в 1743 ккал. Женской
 * норме этого хватает с запасом, мужской — нет: при 2400 ккал раздел
 * предлагал бы недобор в шестьсот калорий каждый день и выглядел бы
 * сломанным. Люди решают это ровно так же — накладывают больше.
 */
const SERVINGS = [1, 1.5, 2];

/** С какого недобора калорий имеет смысл предлагать добавку. */
const NEED_MORE = 0.08;

/** Сколько вариантов держим в уме, чтобы после склейки осталось из чего выбрать. */
const KEEP = 60;

function search(pool, target, servings) {
  const slots = [];
  for (const { id } of MEALS) {
    const options = pool.filter((r) => r.meal === id);
    if (!options.length) continue;
    const required = REQUIRED_MEALS.includes(id);
    // Добавка — только для основных приёмов. Полторы порции творога с
    // кефиром это не перекус, а ещё один ужин.
    const factors = required ? servings : [1];
    const variants = [];
    for (const recipe of options) {
      for (const count of factors) variants.push({ recipe, servings: count });
    }
    slots.push(required ? variants : [...variants, null]);
  }
  if (!slots.length) return [];

  // Держим только лучшие варианты, а не все: с добавками комбинаций выходит
  // под сотню тысяч, и складывать их в массив целиком значит занять десяток
  // мегабайт ради шести строк на экране.
  //
  // По той же причине суммы копятся числами по ходу обхода, а не собираются
  // объектом на каждую комбинацию. Разница не косметическая: с объектами
  // худший случай считался четверть секунды на ноутбуке, то есть секунду с
  // лишним на телефоне — экран замирал бы на нажатие.
  const best = [];
  const chosen = [];

  const consider = (sum) => {
    if (chosen.length < 2) return;
    const score = penalty(sum, target);
    if (best.length === KEEP && score >= best[best.length - 1].score) return;
    let at = best.length;
    while (at > 0 && best[at - 1].score > score) at--;
    best.splice(at, 0, { dishes: [...chosen], score });
    if (best.length > KEEP) best.pop();
  };

  const walk = (depth, sum) => {
    if (depth === slots.length) return consider(sum);
    for (const option of slots[depth]) {
      if (!option) {
        walk(depth + 1, sum);
        continue;
      }
      const per = option.recipe.per;
      const count = option.servings;
      chosen.push(option);
      walk(depth + 1, {
        kcal: sum.kcal + per.kcal * count,
        protein: sum.protein + per.protein * count,
        fat: sum.fat + per.fat * count,
        carbs: sum.carbs + per.carbs * count,
      });
      chosen.pop();
    }
  };

  walk(0, { kcal: 0, protein: 0, fat: 0, carbs: 0 });
  return best;
}

/**
 * Варианты дня из понравившихся блюд, от самого близкого к норме.
 *
 * Перебор полный, без жадности: понравившихся блюд у человека десятки, а не
 * тысячи, и перебрать их точно дешевле, чем собирать день пошагово и
 * объяснять потом, почему получилось хуже возможного.
 *
 * Сначала считаем день из обычных порций. Добавка включается, только если
 * без неё явный недобор: иначе она полезет туда, где не нужна, и человеку с
 * нормой 1500 приложение предложит полторы порции борща ради лишних
 * двадцати калорий.
 *
 * Завтрак, обед и ужин не пропускаются, пока есть из чего их собрать.
 * Формально день без ужина иногда ближе к норме — и это ровно тот совет,
 * которого тренер не давал и который здесь давать нельзя. Перекус,
 * наоборот, необязателен: он и в жизни необязателен.
 */
export function planVariants(likedIds, target, { limit = 6 } = {}) {
  const liked = new Set(likedIds || []);
  const pool = CATALOG.RECIPES.filter((r) => liked.has(r.id));
  if (!target || !target.kcal || !pool.length) return [];

  let found = search(pool, target, [1]);
  if (found.length && dayTotals(found[0].dishes).kcal < target.kcal * (1 - NEED_MORE)) {
    found = search(pool, target, SERVINGS);
  }

  // Склейка по набору блюд. «Другой вариант» должен показывать другую еду, а
  // не ту же самую в другом объёме: шесть вариантов, отличающихся половиной
  // порции гречки, читаются как поломка.
  const seen = new Set();
  const result = [];
  for (const entry of found) {
    const key = entry.dishes.map((d) => d.recipe.id).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const totals = dayTotals(entry.dishes);
    result.push({
      ...entry,
      totals,
      diff: {
        kcal: totals.kcal - Math.round(target.kcal),
        protein: Math.round((totals.protein - target.protein) * 10) / 10,
        fat: Math.round((totals.fat - target.fat) * 10) / 10,
        carbs: Math.round((totals.carbs - target.carbs) * 10) / 10,
      },
    });
    if (result.length === limit) break;
  }
  return result;
}

/**
 * Что купить на выбранный день.
 *
 * Берётся ПОЛНЫЙ объём блюда, а не съедаемая порция: борщ варят кастрюлей,
 * и покупать шестую часть луковицы человек не пойдёт. Остаток достаётся
 * следующим дням — об этом говорит сам экран.
 *
 * Но если съесть нужно больше, чем блюдо даёт, кастрюль становится две.
 * Омлет готовится на одну порцию; когда в рационе стоит две, продуктов надо
 * вдвое больше, и умолчать об этом значит отправить человека к плите с
 * половиной нужного. Борща при полутора порциях хватает одной кастрюли.
 *
 * Из списка НЕ вычитается то, что дома. Приложение знает, что гречка есть,
 * но не знает, сколько её осталось; вычесть предполагаемое так же опасно.
 * Поэтому наличное показывается отдельным списком — как напоминание
 * достать, а не купить.
 */
export function shoppingList(dishes, pantry) {
  const have = asSet(pantry);
  const totals = new Map();

  for (const dish of dishes) {
    const batches = Math.max(1, Math.ceil((dish.servings || 1) / dish.recipe.portions));
    for (const item of dish.recipe.items) {
      totals.set(item.food, (totals.get(item.food) || 0) + item.grams * batches);
    }
  }

  const rows = [...totals.entries()].map(([food, grams]) => ({
    food,
    grams,
    group: (CATALOG.FOOD[food] && CATALOG.FOOD[food].group) || 'other',
    minor: grams < MAIN_GRAMS,
  }));

  const byGroup = (a, b) => (
    GROUPS.findIndex((g) => g.id === a.group) - GROUPS.findIndex((g) => g.id === b.group)
    || b.grams - a.grams
  );

  return {
    buy: rows.filter((r) => !have.has(r.food)).sort(byGroup),
    athome: rows.filter((r) => have.has(r.food)).sort(byGroup),
  };
}

/** Продукты, сгруппированные для экрана холодильника. */
export function foodByGroup() {
  return GROUPS.map((group) => ({
    ...group,
    items: Object.keys(CATALOG.FOOD).filter((name) => CATALOG.FOOD[name].group === group.id),
  })).filter((group) => group.items.length);
}

/** Набор, с которого начинается пустой холодильник. */
export function defaultPantry() {
  return STAPLES.filter((name) => CATALOG.FOOD[name]);
}

/* ==================================================================
 * Своё: продукт, которого нет в наборе блюд
 * ================================================================== */

/**
 * Сникерс, кофе с сиропом, бутерброд на работе — то, что человек съел или
 * собирается съесть помимо подобранного дня. КБЖУ он переписывает с
 * упаковки: там оно всегда на 100 г, поэтому и храним на 100 г. Вес
 * штуки — по желанию: «1 батончик» удобнее, чем «50 г».
 *
 * Своих справочников с цифрами «по памяти» нет намеренно: неверное КБЖУ
 * хуже отсутствующего, а упаковка точнее любой таблицы.
 */

/** КБЖУ съеденного количества граммов продукта (цифры на 100 г) */
export function extraOf(product, grams) {
  const k = (Number(grams) || 0) / 100;
  const at = (key) => Math.round((Number(product[key]) || 0) * k * 10) / 10;
  return { kcal: Math.round((Number(product.kcal) || 0) * k), protein: at('protein'), fat: at('fat'), carbs: at('carbs') };
}

/** Всё своё за день одной суммой */
export function extraTotals(extras) {
  const sum = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const item of extras || []) {
    const part = extraOf(item.product, item.grams);
    for (const key of Object.keys(sum)) sum[key] += part[key];
  }
  for (const key of Object.keys(sum)) sum[key] = Math.round(sum[key] * 10) / 10;
  sum.kcal = Math.round(sum.kcal);
  return sum;
}

/**
 * Что остаётся на подобранные блюда, когда своё уже съедено (или
 * запланировано). День пересобирается под этот остаток: съел сникерс —
 * обед и ужин станут легче, а не норма перевалит на двести калорий.
 * Ниже нуля не уходим: перебор своим — отдельная новость, а не
 * отрицательная норма для перебора блюд.
 */
export function remainingTarget(target, eaten) {
  const left = (key) => Math.max(0, Math.round(((target[key] || 0) - (eaten[key] || 0)) * 10) / 10);
  return { kcal: Math.max(0, Math.round((target.kcal || 0) - (eaten.kcal || 0))), protein: left('protein'), fat: left('fat'), carbs: left('carbs') };
}

/** Сложить итоги дня: блюда плюс своё */
export function addTotals(a, b) {
  const out = {};
  for (const key of ['kcal', 'protein', 'fat', 'carbs']) out[key] = Math.round(((a[key] || 0) + (b[key] || 0)) * 10) / 10;
  out.kcal = Math.round(out.kcal);
  return out;
}

/** Проверить продукт с упаковки: название и калории обязательны, остальное — числа или пусто */
export function cleanProduct(raw) {
  const num = (v, max) => {
    const n = Number(String(v ?? '').replace(',', '.').trim());
    return String(v ?? '').trim() === '' ? 0 : (Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : NaN);
  };
  const name = String(raw.name || '').trim().slice(0, 60);
  const product = {
    id: raw.id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    kcal: num(raw.kcal, 950),
    protein: num(raw.protein, 100),
    fat: num(raw.fat, 100),
    carbs: num(raw.carbs, 100),
    piece: num(raw.piece, 2000),
  };
  const errors = [];
  if (!name) errors.push('Назовите продукт');
  if (!product.kcal) errors.push('Калории на 100 г — с упаковки');
  for (const [key, label] of [['kcal', 'Калории'], ['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы'], ['piece', 'Вес штуки']]) {
    if (Number.isNaN(product[key])) errors.push(label + ': не число или слишком много');
  }
  return { product, errors };
}
