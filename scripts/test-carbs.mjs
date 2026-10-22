import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES } from '../src/nutrition/recipes.js';
import { planVariants, dayTotals } from '../src/nutrition/match.js';
import {
  carbLevel, carbShare, cycleTargets, preferredLevel, aroundTraining, carbDayLine, carbTargetLine, CARB_LOW, CARB_HIGH,
} from '../src/nutrition/carbs.js';
import { similarDishes, nextSwap, applySwaps, SWAP_TOLERANCE } from '../src/nutrition/swap.js';

/**
 * Углеводы блюда и дня (FT-709): уровень из КБЖУ порции, цель дня
 * тренировки и отдыха, подсказка, подбор и замена блюда в «Рационе».
 * Чистые модули — без React. Запуск: node --test scripts/test-carbs.mjs.
 */

const norm = { kcal: 2000, protein: 140, fat: 65, carbs: 210 };

test('уровень углеводов — по доле калорий, порция на него не влияет', () => {
  assert.equal(carbLevel({ kcal: 400, carbs: 50 }), 'high'); // 50 %
  assert.equal(carbLevel({ kcal: 400, carbs: 45 }), 'high'); // 45 % — граница «много»
  assert.equal(carbLevel({ kcal: 400, carbs: 40 }), 'mid'); // 40 %
  assert.equal(carbLevel({ kcal: 400, carbs: 30 }), 'mid'); // 30 % — граница «мало» не включена
  assert.equal(carbLevel({ kcal: 400, carbs: 29 }), 'low');
  assert.equal(carbLevel({ kcal: 800, carbs: 58 }), carbLevel({ kcal: 400, carbs: 29 }), 'две порции — тот же уровень');
  assert.equal(carbLevel({ kcal: 0, carbs: 10 }), null);
  assert.equal(carbLevel(null), null);
  assert.ok(CARB_LOW < CARB_HIGH);
  assert.equal(Math.round(carbShare({ kcal: 400, carbs: 50 }) * 100), 50);
});

test('встроенные блюда: все три уровня есть, уровень есть у каждого блюда', () => {
  const levels = new Map();
  for (const r of RECIPES) {
    const level = carbLevel(r.per);
    assert.ok(level, 'нет уровня: ' + r.name);
    levels.set(level, (levels.get(level) || 0) + 1);
  }
  for (const level of ['high', 'mid', 'low']) assert.ok(levels.get(level) > 0, 'пусто: ' + level);
});

test('цель дня: калории и белок те же, углеводы ±, жиры компенсируют', () => {
  const up = cycleTargets(norm, 'train', 20), down = cycleTargets(norm, 'rest', 20);
  assert.equal(up.kcal, 2000); assert.equal(down.kcal, 2000);
  assert.equal(up.protein, 140); assert.equal(down.protein, 140);
  assert.equal(up.carbs, 252); assert.equal(down.carbs, 168);
  assert.ok(up.fat < 65 && down.fat > 65);
  for (const t of [up, down]) assert.ok(Math.abs(t.carbs * 4 + t.fat * 9 - (210 * 4 + 65 * 9)) <= 5);
  assert.deepEqual(cycleTargets(norm, 'train', 0), norm);
  assert.deepEqual(cycleTargets(norm, null, 20), norm);
});

test('подсказка: день тренировки, отдыха и без расписания', () => {
  assert.equal(preferredLevel({ kind: 'train' }), 'high');
  assert.equal(preferredLevel({ kind: 'rest' }), 'low');
  assert.equal(preferredLevel({ kind: null, percent: 20 }), null);
  assert.equal(preferredLevel(null), null);
  assert.deepEqual(aroundTraining('18:00'), { before: 'snack', after: 'dinner' });
  assert.deepEqual(aroundTraining('07:00'), { before: null, after: 'breakfast' });
  assert.equal(aroundTraining(''), null);
  assert.equal(carbDayLine({ kind: 'train', at: '18:00' }), 'Сегодня тренировка в 18:00 — больше углеводов, особенно в перекус до неё и в ужин после.');
  assert.match(carbDayLine({ kind: 'rest' }, { today: false }), /^В этот день отдых/);
  assert.equal(carbDayLine(null), '');
  assert.equal(carbDayLine({ kind: null, percent: 20 }), '');
  assert.match(carbTargetLine({ kind: 'train', percent: 20 }), /на 20 % больше/);
  assert.match(carbTargetLine({ kind: null, percent: 20 }), /цель обычная/);
  assert.equal(carbTargetLine({ kind: 'train', percent: 0 }), '');
});

test('в день тренировки день собирается с углеводами, в день отдыха — без', () => {
  const all = RECIPES.map((r) => r.id);
  const share = (variant) => variant.dishes.reduce((sum, d) => sum + d.recipe.per.carbs * d.servings, 0) * 4 / variant.totals.kcal;
  const plain = planVariants(all, norm)[0], train = planVariants(all, norm, { prefer: 'high' })[0], rest = planVariants(all, norm, { prefer: 'low' })[0];
  assert.ok(share(train) >= share(plain) - 1e-9, 'тренировка не беднее углеводами обычного дня');
  assert.ok(share(rest) <= share(plain) + 1e-9, 'отдых не богаче углеводами обычного дня');
  assert.ok(share(train) > share(rest));
  // День всё равно в норме по калориям
  for (const v of [train, rest]) assert.ok(Math.abs(v.totals.kcal - norm.kcal) / norm.kcal < 0.12);
  // Без prefer — как раньше
  assert.deepEqual(planVariants(all, norm, { prefer: null }), planVariants(all, norm));
});

test('замена блюда: тот же приём, те же углеводы, калории ±15 %, сначала понравившиеся', () => {
  for (const r of RECIPES) {
    for (const s of similarDishes(r)) {
      assert.equal(s.meal, r.meal);
      assert.equal(carbLevel(s.per), carbLevel(r.per));
      assert.ok(Math.abs(s.per.kcal - r.per.kcal) <= r.per.kcal * SWAP_TOLERANCE);
      assert.notEqual(s.id, r.id);
    }
  }
  const withSwaps = RECIPES.find((r) => similarDishes(r).length >= 2);
  assert.ok(withSwaps, 'хоть у одного блюда должно быть две замены');
  const list = similarDishes(withSwaps), last = list[list.length - 1];
  assert.equal(similarDishes(withSwaps, { liked: [last.id] })[0].id, last.id, 'понравившееся — первым');
  assert.ok(!similarDishes(withSwaps, { exclude: [list[0].id] }).some((r) => r.id === list[0].id), 'то, что уже в дне, не предлагается');
});

test('«Заменить» идёт по кругу и возвращается к исходному; итоги дня пересчитываются', () => {
  const original = RECIPES.find((r) => similarDishes(r).length >= 1);
  const options = similarDishes(original);
  let current = original;
  const seen = [];
  for (let i = 0; i <= options.length; i++) {
    current = nextSwap(original, current);
    seen.push(current.id);
  }
  assert.equal(seen[seen.length - 1], original.id, 'после всех замен — снова исходное');
  assert.equal(new Set(seen).size, options.length + 1);
  const lonely = RECIPES.find((r) => similarDishes(r).length === 0);
  if (lonely) assert.equal(nextSwap(lonely, lonely), null, 'заменить не на что — кнопки нет');

  const plan = { dishes: [{ recipe: original, servings: 1.5 }, { recipe: RECIPES.find((r) => r.meal !== original.meal), servings: 1 }] };
  plan.totals = dayTotals(plan.dishes);
  const swapped = applySwaps(plan, { 0: options[0] });
  assert.equal(swapped.dishes[0].recipe.id, options[0].id);
  assert.equal(swapped.dishes[0].servings, 1.5, 'число порций остаётся');
  assert.deepEqual(swapped.totals, dayTotals(swapped.dishes));
  assert.ok(Math.abs(swapped.totals.kcal - plan.totals.kcal) <= original.per.kcal * 1.5 * SWAP_TOLERANCE + 1, 'день не разваливается');
  assert.equal(applySwaps(plan, {}), plan);
});

/* ------------------------------------------------------------------
 * Экран «Рациона»: подсказка дня, метка углеводов и «Заменить на похожее».
 * Ration.jsx собирается esbuild с заглушками соседних модулей.
 * ------------------------------------------------------------------ */
const { build } = await import('esbuild');
const React = (await import('react')).default;
const { default: renderer, act } = await import('react-test-renderer');
const vm = await import('node:vm');
const { createRequire } = await import('node:module');

const stubs = {
  api: `export const apiPublic=(a,p)=>globalThis.__ration.read(a,p);export const apiMutate=async()=>({});export const apiStale=()=>null;`,
  gestures: `export const useTabLock=()=>{}; export const useBackGesture=()=>{};`,
  telegram: `export const haptic=()=>{};`,
  ui: `import React from 'react'; export const Section=({title,children})=><section>{title&&<h3>{title}</h3>}{children}</section>;export const Panel=({children})=><div>{children}</div>;export const Note=({children})=><aside>{children}</aside>;export const Search=()=>null;export const formatNumber=n=>String(n);export const plural=(n,a,b,c)=>a;export const Sheet=({title,children})=><section role="dialog"><h2>{title}</h2>{children}</section>;`,
  icons: `import React from 'react';const I=()=> <i/>; export const IconCheck=I,IconClose=I,IconBack=I,IconNutrition=I,IconShare=I;`,
  Extras: `export default ()=>null;`,
  Diary: `export const DiaryEntryForm=()=>null;`,
};
const bundle = await build({
  stdin: { contents: "export { default } from './src/nutrition/Ration.jsx';", resolveDir: process.cwd(), loader: 'js' },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], logLevel: 'silent',
  plugins: [{ name: 'ration-stubs', setup(b) {
    b.onResolve({ filter: /\/(api|gestures|telegram|ui|icons|Extras|Diary)\.(js|jsx)$/ }, (a) => ({ path: a.path.split('/').at(-1).split('.')[0], namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'jsx' }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + bundle.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const Ration = mod.exports.default;
const textOf = (node) => node == null || typeof node === 'boolean' ? '' : typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(textOf).join(' ') : textOf(node.children || node.props?.children);

test('«Рацион» в день тренировки: строка почему, метка углеводов, замена блюда пересчитывает день', async () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
  globalThis.window = { matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {} };
  // Все встроенные блюда «нравятся» — экран сразу открывается на собранном дне
  storage.set('ration_v1', JSON.stringify({ pantry: [], liked: RECIPES.map((r) => r.id), seen: RECIPES.map((r) => r.id) }));
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  globalThis.__ration = { read: async (a) => a === 'diary.get'
    ? { totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 }, targets: norm, carbDay: { kind: 'train', at: '18:00', percent: 0 } }
    : a === 'ration.get' ? { saved: false } : Promise.reject(new Error('нет')) };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Ration, { targets: norm, diaryDay: today, onClose() {} })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  const text = () => textOf(tree.toJSON()).replace(/\s+/g, ' ');
  assert.match(text(), /Сегодня тренировка в 18:00 — больше углеводов/);
  assert.match(text(), /углеводов (много|средне|мало)/);
  const swaps = tree.root.findAll((n) => n.type === 'button' && n.props.className?.includes('day__swap'));
  assert.ok(swaps.length > 0, 'есть блюдо с похожей заменой');
  const names = () => tree.root.findAll((n) => n.type === 'h4' && n.props.className === 'day__name').map((n) => textOf(n.props.children));
  const before = names();
  await act(async () => swaps[0].props.onClick());
  const after = names();
  assert.equal(after.length, before.length);
  assert.equal(after.filter((name, i) => name !== before[i]).length, 1, 'заменено ровно одно блюдо');
  tree.unmount();
});
