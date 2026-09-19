import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, FOOD, MAIN_GRAMS } from '../src/nutrition/recipes.js';
import {
  rankRecipes, planVariants, shoppingList, dayTotals, splitItems, defaultPantry,
} from '../src/nutrition/match.js';

/**
 * Подбор рациона: проверяется счёт, а не экран.
 *
 * Тест здесь стоит дороже обычного: ошибка в подборе не падает и не рисует
 * ничего странного — она просто предлагает человеку съесть не то. Заметить
 * это глазами нельзя, сколько ни открывай демо.
 *
 * Модуль чистый и без React, поэтому импортируется напрямую: ни esbuild, ни
 * поддельного DOM, ни localStorage. Запуск: npm run test:ration.
 */

const norm = { kcal: 2000, protein: 140, fat: 65, carbs: 210 };

test('данные блюд сходятся: per пересчитывается из состава', () => {
  for (const recipe of RECIPES) {
    const sum = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    for (const item of recipe.items) {
      const food = FOOD[item.food];
      assert.ok(food, 'нет в справочнике: ' + item.food + ' (' + recipe.name + ')');
      for (const key of Object.keys(sum)) sum[key] += food[key] * item.grams / 100;
    }
    // Сравниваем с тем, что записано на порцию. Расхождение больше процента
    // означает, что состав или числа правили руками и забыли пересчитать —
    // а именно так справочники калорий и начинают врать.
    const perKcal = sum.kcal / recipe.portions;
    assert.ok(
      Math.abs(perKcal - recipe.per.kcal) / recipe.per.kcal < 0.01,
      recipe.name + ': по составу ' + Math.round(perKcal) + ', записано ' + recipe.per.kcal
    );
  }
});

test('у каждого блюда есть id, приём пищи и хотя бы один основной продукт', () => {
  const ids = new Set();
  for (const recipe of RECIPES) {
    assert.ok(recipe.id && !ids.has(recipe.id), 'повтор id: ' + recipe.id);
    ids.add(recipe.id);
    assert.ok(['завтрак', 'обед', 'ужин', 'перекус'].includes(recipe.meal), recipe.name);
    assert.ok(recipe.portions >= 1);
    assert.ok(splitItems(recipe).main.length > 0, recipe.name + ': одни мелочи');
  }
  assert.equal(RECIPES.length, 31);
});

test('наверху то, что готовится целиком из наличного', () => {
  const pantry = ['овсяные хлопья', 'молоко 2.5%', 'банан'];
  const ranked = rankRecipes(pantry);
  assert.equal(ranked[0].recipe.id, 'ovsyanka-na-moloke-s-bananom');
  assert.deepEqual(ranked[0].missing, []);
  // Мёда дома нет, но он мелочь: на подбор не влияет, в покупки попадает.
  assert.deepEqual(ranked[0].minorMissing, ['мёд']);
  // А наличное перечисляется по всему составу: карточка показывает его
  // целиком, и продукт, который дома есть, не должен там светиться как
  // недостающий только потому, что его в блюде десять граммов.
  assert.deepEqual(ranked[0].have, ['овсяные хлопья', 'молоко 2.5%', 'банан']);
});

test('список отсортирован по числу покупок, а не по проценту', () => {
  const ranked = rankRecipes(['гречка', 'куриная грудка', 'лук репчатый', 'морковь']);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(
      ranked[i].missing.length >= ranked[i - 1].missing.length,
      'порядок нарушен на ' + ranked[i].recipe.name
    );
  }
});

test('пустой холодильник не даёт пустую колоду', () => {
  const ranked = rankRecipes([]);
  // Колода короче двадцати — и это правильно: когда дома нет ничего, отбор
  // вырождается в «что проще всего купить», и наверху оказываются блюда из
  // трёх продуктов. Важно лишь, что листать есть что.
  assert.ok(ranked.length >= 8, 'в колоде ' + ranked.length);
  assert.ok(ranked[0].missing.length > 0);
});

test('день собирается из понравившегося и не пропускает основные приёмы', () => {
  const liked = [
    'ovsyanka-na-moloke-s-bananom',
    'grechka-s-kurinoy-grudkoy-i-ovoschami',
    'treska-zapechennaya-s-kartofelem',
    'tvorog-s-kefirom-i-otrubyami',
  ];
  const variants = planVariants(liked, norm);
  assert.ok(variants.length >= 2, 'вариантов должно быть несколько');

  const best = variants[0];
  const meals = best.dishes.map((d) => d.recipe.meal);
  for (const required of ['завтрак', 'обед', 'ужин']) {
    assert.ok(meals.includes(required), 'пропущен ' + required);
  }
  assert.deepEqual(best.totals, dayTotals(best.dishes));

  // Варианты идут от лучшего к худшему — на этом держится «другой вариант».
  for (let i = 1; i < variants.length; i++) {
    assert.ok(variants[i].score >= variants[i - 1].score);
  }
  // Перекус необязателен: он есть в лучшем варианте только потому, что с ним
  // ближе к норме, и где-то ниже обязан найтись день без него.
  assert.ok(variants.some((v) => v.dishes.length === 3));
});

test('без понравившихся блюд вариантов нет', () => {
  assert.deepEqual(planVariants([], norm), []);
  assert.deepEqual(planVariants(['ovsyanka-na-moloke-s-bananom'], norm), []);
});

test('из всех блюд собирается день, попадающий в норму', () => {
  const variants = planVariants(RECIPES.map((r) => r.id), norm);
  const best = variants[0].totals;
  assert.ok(Math.abs(best.kcal - norm.kcal) < 150, 'калории: ' + best.kcal);
  assert.ok(best.protein > norm.protein * 0.9, 'белок: ' + best.protein);
});

test('когда понравившегося мало, день собирается из того, что есть', () => {
  // Отмечены только завтрак и обед. Ужин выдумывать неоткуда, и функция не
  // должна подставлять на его место непонравившееся блюдо.
  const variants = planVariants(
    ['ovsyanka-na-moloke-s-bananom', 'grechka-s-kurinoy-grudkoy-i-ovoschami'], norm
  );
  assert.equal(variants.length, 1, 'набор блюд один, вариантов больше быть не может');
  assert.equal(variants[0].dishes.length, 2);
  assert.ok(!variants[0].dishes.some((d) => d.recipe.meal === 'ужин'));
});

test('недостижимая норма не прячется: недобор виден', () => {
  // Даже если нравится всё и с добавками, больше 3300 ккал из этого набора
  // не собрать. Экран обязан показать недобор, а не подогнать цифры.
  const variants = planVariants(
    RECIPES.map((r) => r.id), { kcal: 3800, protein: 200, fat: 100, carbs: 400 }
  );
  assert.ok(variants.length > 0, 'вариант всё равно должен быть');
  assert.ok(variants[0].diff.kcal < -400, 'недобор: ' + variants[0].diff.kcal);
});

test('при большой норме появляется добавка, при маленькой её нет', () => {
  const all = RECIPES.map((r) => r.id);

  // Мужская норма: из обычных порций набора столько не собрать при всём
  // желании — максимум дня 1743 ккал. Без добавки раздел показывал бы
  // недобор в шестьсот калорий и выглядел бы сломанным.
  const big = planVariants(all, { kcal: 2400, protein: 150, fat: 75, carbs: 260 });
  assert.ok(big[0].dishes.some((d) => d.servings > 1), 'добавка не предложена');
  assert.ok(big[0].totals.kcal > 2200, 'калории: ' + big[0].totals.kcal);

  // Женская норма собирается обычными порциями, и полторы порции борща ради
  // двадцати калорий здесь были бы навязчивостью.
  const small = planVariants(all, { kcal: 1500, protein: 110, fat: 50, carbs: 150 });
  assert.ok(small[0].dishes.every((d) => d.servings === 1), 'добавка там, где не нужна');
});

test('варианты предлагают разные блюда, а не тот же день в другом объёме', () => {
  const variants = planVariants(RECIPES.map((r) => r.id), { kcal: 2400, protein: 150, fat: 75, carbs: 260 });
  const sets = variants.map((v) => v.dishes.map((d) => d.recipe.id).sort().join('|'));
  assert.equal(new Set(sets).size, sets.length, 'наборы блюд повторяются');
});

test('две порции блюда, которое готовится на одну, — это две готовки', () => {
  const omelette = RECIPES.find((r) => r.id === 'omlet-s-pomidorami-i-zelenyu');
  assert.equal(omelette.portions, 1);
  const eggs = omelette.items.find((i) => i.food === 'яйцо').grams;

  const single = shoppingList([{ recipe: omelette, servings: 1 }], []);
  const double = shoppingList([{ recipe: omelette, servings: 2 }], []);
  assert.equal(single.buy.find((r) => r.food === 'яйцо').grams, eggs);
  assert.equal(double.buy.find((r) => r.food === 'яйцо').grams, eggs * 2);

  // А кастрюли борща хватает и на полторы порции: докупать нечего.
  const borsch = RECIPES.find((r) => r.id === 'borsch-s-govyadinoy');
  const beet = borsch.items.find((i) => i.food === 'свёкла').grams;
  const one = shoppingList([{ recipe: borsch, servings: 1.5 }], []);
  assert.equal(one.buy.find((r) => r.food === 'свёкла').grams, beet);
});

test('список покупок берёт полный объём блюда и не вычитает домашнее', () => {
  const borsch = RECIPES.find((r) => r.id === 'borsch-s-govyadinoy');
  const { buy, athome } = shoppingList([{ recipe: borsch, servings: 1 }], ['лук репчатый']);

  const svekla = buy.find((r) => r.food === 'свёкла');
  const inRecipe = borsch.items.find((i) => i.food === 'свёкла');
  assert.equal(svekla.grams, inRecipe.grams, 'куплено должно хватить на всю кастрюлю');

  assert.ok(!buy.some((r) => r.food === 'лук репчатый'), 'лук дома, покупать не надо');
  assert.ok(athome.some((r) => r.food === 'лук репчатый'));
});

test('одинаковые продукты из разных блюд складываются', () => {
  const first = RECIPES.find((r) => r.id === 'ovsyanka-na-moloke-s-bananom');
  const second = RECIPES.find((r) => r.id === 'lenivaya-ovsyanka-na-kefire');
  const { buy } = shoppingList(
    [{ recipe: first, servings: 1 }, { recipe: second, servings: 1 }], []
  );
  const flakes = buy.filter((r) => r.food === 'овсяные хлопья');
  assert.equal(flakes.length, 1, 'продукт должен быть одной строкой');
  assert.equal(
    flakes[0].grams,
    first.items.find((i) => i.food === 'овсяные хлопья').grams
      + second.items.find((i) => i.food === 'овсяные хлопья').grams
  );
});

test('мелочи помечены и не спрашиваются как основные', () => {
  const oat = RECIPES.find((r) => r.id === 'ovsyanka-na-moloke-s-bananom');
  const { buy } = shoppingList([{ recipe: oat, servings: 1 }], []);
  const honey = buy.find((r) => r.food === 'мёд');
  assert.equal(honey.minor, true);
  assert.ok(honey.grams < MAIN_GRAMS);
});

test('холодильник начинается с того, что есть у всех', () => {
  const start = defaultPantry();
  assert.ok(start.includes('масло растительное'));
  for (const name of start) assert.ok(FOOD[name], 'нет в справочнике: ' + name);
});
