import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { FOOD, RECIPES } from '../src/nutrition/recipes.js';
import { similarFoods, swapDistance, sameKcalGrams, foodRole, foodUsage, snackIdeas, snackPortion, FREE, freeSnapshot, swapQuestion, SWAP_LIMIT } from '../src/nutrition/diary-extras.js';
import { DIARY_LESSONS } from '../src/nutrition/diary-lessons.js';
import { diaryMock } from '../src/nutrition/diary-mock.js';

// «Конструктор рационов» (FT-709): замены с похожим КБЖУ, «Что влезет»,
// «без ограничений», уроки. Справочник — встроенный (recipes.js, 56
// продуктов); полный серверный (101) проверен так же при разработке.
const usage = foodUsage(RECIPES);
const names = (name, opts = {}) => similarFoods(name, FOOD, { usage, ...opts }).map(s => s.name);

test('замены: рис ↔ гречка, куриная грудка ↔ индейка — в первых трёх', () => {
  assert.ok(names('рис').includes('гречка'), names('рис').join(', '));
  assert.ok(names('гречка').includes('рис'), names('гречка').join(', '));
  assert.ok(names('куриная грудка').includes('индейка филе'), names('куриная грудка').join(', '));
  assert.ok(names('индейка филе').includes('куриная грудка'), names('индейка филе').join(', '));
  for (const n of ['рис', 'гречка', 'куриная грудка', 'творог 5%', 'масло растительное']) assert.ok(names(n).length >= 1 && names(n).length <= 3, n);
});

test('замены: только той же роли — рис не меняется на муку, хлеб или сухари; масла — между собой', () => {
  for (const n of Object.keys(FOOD)) {
    const role = foodRole(n, FOOD[n].group);
    for (const s of similarFoods(n, FOOD, { usage, limit: 10 })) {
      assert.equal(foodRole(s.name, FOOD[s.name].group), role, n + ' → ' + s.name);
      assert.ok(s.distance <= SWAP_LIMIT, n + ' → ' + s.name);
    }
  }
  assert.ok(!names('рис', { limit: 10 }).some(n => /мука|хлеб|сухари|хлопья/.test(n)));
  assert.equal(foodRole('печень куриная', 'meat'), 'group:meat', 'печень — не печенье');
  assert.equal(foodRole('масло сливочное', 'dairy'), foodRole('масло растительное', 'other'));
  assert.ok(names('масло сливочное').includes('масло растительное'));
  assert.deepEqual(similarFoods('нет такого', FOOD), []);
  assert.deepEqual(similarFoods('рис', {}), []);
});

test('замены: граммы — на те же калории, мера симметрична, без привычности — по близости', () => {
  const rice = FOOD['рис'], buckwheat = FOOD['гречка'];
  assert.equal(swapDistance(rice, rice), 0);
  assert.equal(swapDistance(rice, buckwheat), swapDistance(buckwheat, rice));
  assert.equal(swapDistance(rice, { kcal: 0, protein: 0, fat: 0, carbs: 0 }), Infinity);
  // 70 г риса = 241 ккал = 76,9 г гречки → до 5 г: 75
  assert.equal(sameKcalGrams(rice, buckwheat, 70), 75);
  assert.equal(sameKcalGrams(FOOD['масло растительное'], FOOD['масло сливочное'], 10), 12);
  const row = similarFoods('рис', FOOD, { grams: 70, usage }).find(s => s.name === 'гречка');
  assert.equal(row.grams, 75);
  assert.ok(row.proteinDelta > 4, 'в гречке на те же калории больше белка');
  const plain = similarFoods('рис', FOOD);
  assert.deepEqual(plain.map(s => s.distance), [...plain.map(s => s.distance)].sort((a, b) => a - b));
  // Привычность — блюда, где продукт основной (от 20 г на порцию)
  assert.deepEqual(foodUsage([{ portions: 2, items: [{ food: 'рис', grams: 140 }, { food: 'соль', grams: 10 }] }]), { рис: 1 });
});

test('«Что влезет»: всё в остатке, сначала белок, сладкое не спрятано, сырое мясо и крупы — нет', () => {
  const dishes = [
    { id: 'a', name: 'Творог с ягодами', meal: 'перекус', status: 'published', per: { kcal: 200, protein: 30, fat: 5, carbs: 15 }, items: [] },
    { id: 'b', name: 'Финики с орехами', meal: 'перекус', status: 'published', per: { kcal: 180, protein: 3, fat: 9, carbs: 25 }, items: [{ food: 'финики', grams: 30 }] },
    { id: 'c', name: 'Черновик', meal: 'перекус', status: 'draft', per: { kcal: 100, protein: 40, fat: 1, carbs: 1 }, items: [] },
    { id: 'd', name: 'Обед', meal: 'обед', status: 'published', per: { kcal: 150, protein: 50, fat: 1, carbs: 1 }, items: [] },
  ];
  assert.deepEqual(snackIdeas({ remaining: 0, foods: FOOD, dishes }), []);
  const list = snackIdeas({ remaining: 250, foods: FOOD, dishes });
  assert.ok(list.length > 3 && list.length <= 8);
  assert.ok(list.every(r => r.kcal <= 250 && r.kcal > 0));
  assert.ok(list.some(r => r.sweet), 'сладкое в списке');
  assert.ok(!list.some(r => ['c', 'd'].includes(r.product.id)), 'черновик и обед — не перекус');
  assert.ok(!list.some(r => /грудка|гречка|рис|мука/.test(r.product.name)));
  const ordered = list.filter(r => !r.sweet);
  assert.deepEqual(ordered.map(r => r.protein), [...ordered.map(r => r.protein)].sort((a, b) => b - a));
  assert.equal(list[0].product.id, 'a');
  // Продукт — запись дневника в граммах, блюдо — одна порция
  const curd = list.find(r => r.product.kind === 'ingredient');
  assert.equal(curd.product.unit, 'g'); assert.equal(curd.amount, snackPortion(curd.product.name));
  assert.equal(list.find(r => r.product.id === 'a').amount, 1);
  // Маленький остаток — только то, что помещается
  assert.ok(snackIdeas({ remaining: 60, foods: FOOD, dishes }).every(r => r.kcal <= 60));
});

test('«Без ограничений»: 0 ккал, неизвестная отметка — нет; демо записывает и считает 0', () => {
  assert.deepEqual(Object.keys(FREE), ['tea', 'coffee', 'spices', 'greens', 'sweetener']);
  const tea = freeSnapshot('tea');
  assert.equal(tea.kind, 'free'); assert.equal(tea.kcal, 0); assert.equal(tea.unit, 'portion');
  assert.equal(freeSnapshot('cake'), null); assert.equal(freeSnapshot('constructor'), null);
  globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); } };
  const entry = diaryMock('diary.entry.save', { clientRow: 77, day: '2026-10-22', meal: 'breakfast', amount: 1, product: { kind: 'free', id: 'coffee' }, requestId: 'free-1' });
  assert.equal(entry.product.name, 'Кофе без сахара и молока');
  assert.equal(diaryMock('diary.get', { clientRow: 77, day: '2026-10-22' }).totals.kcal, 0);
  assert.throws(() => diaryMock('diary.entry.save', { clientRow: 77, day: '2026-10-22', meal: 'snack', amount: 1, product: { kind: 'free', id: 'cake' }, requestId: 'free-2' }));
});

test('вопрос тренеру о замене и три урока', () => {
  assert.equal(swapQuestion({ dish: 'Плов', food: 'рис', grams: 70, to: { name: 'гречка', grams: 75 } }), 'Питание: можно в блюде «Плов» заменить «рис» (70 г) на «гречка» (75 г)?');
  assert.equal(swapQuestion({ food: 'рис' }), 'Питание: чем можно заменить «рис»?');
  const ids = DIARY_LESSONS.map(l => l.id);
  for (const id of ['oil', 'cafe', 'family']) assert.ok(ids.includes(id), id);
  const oil = DIARY_LESSONS.find(l => l.id === 'oil').paragraphs.join(' ');
  assert.ok(/5 мл/.test(oil) && /45 ккал/.test(oil));
  assert.ok(new Set(ids).size === ids.length);
});

// Экраны: состав в «Рецептах», вопрос тренеру, отметка «без ограничений»
const stubs = {
  api: `export const apiPublic=(a,p)=>globalThis.__x.read(a,p); export const apiStale=(a,p)=>({data:null,promise:globalThis.__x.read(a,p)}); export const apiMutate=(a,p)=>globalThis.__x.mutate(a,p);`,
  offline: `export const queueWrite=async(k,p)=>{globalThis.__x.queued.push({kind:k,params:p})}; export const isOffline=e=>e?.code===0; export const localWrites=async()=>[]; export const onWritesChange=()=>()=>{}; export const dropWrite=async()=>{};`,
  ui: `import React from 'react'; export const Section=({children})=><section>{children}</section>;export const Panel=({children})=><div>{children}</div>;export const Note=({children})=><aside>{children}</aside>;export const Loading=()=> <div>Загрузка</div>;export const Sheet=({title,children})=><section role="dialog"><h2>{title}</h2>{children}</section>;export const formatNumber=n=>String(n);export const useEdgeFade=()=>'';export const plural=(n,a,b,c)=>n%10===1&&n%100!==11?a:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?b:c;export const Qty=({value,unit})=><span>{value}{unit?' '+unit:''}</span>;`,
  icons: `import React from 'react';const I=()=> <i/>; export const IconPlus=I,IconCheck=I,IconSliders=I;`,
};
const bundle = await build({ stdin: { contents: "export * from './src/nutrition/DiaryExtras.jsx'; export { Recipes } from './src/nutrition/Recipes.jsx'; export { CATALOG } from './src/nutrition/catalog.js';", resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], logLevel: 'silent', plugins: [{ name: 'extras-stubs', setup(b) {
  b.onResolve({ filter: /\/(api|ui|icons|offline-writes)\.(js|jsx)$/ }, a => ({ path: ({ 'offline-writes': 'offline' })[a.path.split('/').at(-1).split('.')[0]] || a.path.split('/').at(-1).split('.')[0], namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'jsx' }));
  b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
} }] });
const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + bundle.outputFiles[0].text + '\n})')(createRequire(import.meta.url), module, module.exports);
const { Recipes, FreeMarks, SnackIdeas } = module.exports;
globalThis.window ||= { addEventListener() {}, removeEventListener() {} };
globalThis.document ||= { activeElement: null, addEventListener() {}, removeEventListener() {} };
globalThis.__x = { queued: [], read: async () => ({}), mutate: async () => ({}) };
const text = tree => JSON.stringify(tree.toJSON());
const button = (tree, label) => tree.root.findAll(n => n.type === 'button' && (n.props['aria-label'] === label || [].concat(n.props.children).join('') === label))[0];

test('«Рецепты»: касание блюда раскрывает состав с заменами; вопрос тренеру уходит пожеланием', async () => {
  const pilaf = RECIPES.find(r => r.items.some(i => i.food === 'рис' && i.grams / r.portions >= 20));
  assert.ok(pilaf, 'в наборе есть блюдо с рисом');
  const sent = [];
  __x.read = async () => { throw new Error('нет сервера'); };
  __x.mutate = async (a, p) => { sent.push([a, p]); return { id: 1 }; };
  const row = { kind: 'dish', id: pilaf.id, name: pilaf.name, ...pilaf.per, unit: 'portion', meal: pilaf.meal };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Recipes, { rows: [row], remaining: 0, canAsk: true, onAdd() {}, onEdit() {}, onNew() {} })); });
  assert.ok(!text(tree).includes('Можно заменить'));
  const open = tree.root.findAll(n => n.type === 'button' && n.props['aria-expanded'] === false)[0];
  await act(async () => open.props.onClick());
  assert.ok(text(tree).includes('Можно заменить'));
  assert.ok(text(tree).includes('гречка'));
  await act(async () => button(tree, 'Спросить тренера о замене').props.onClick());
  const area = tree.root.findByType('textarea');
  assert.ok(area.props.value.startsWith('Питание:'));
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(sent[0][0], 'wish.create');
  assert.ok(sent[0][1].text.includes(pilaf.name));
  assert.ok(text(tree).includes('Отправлено'));
  tree.unmount();
  // Тренер и «Мои тренировки» — состав виден, спросить некого
  await act(async () => { tree = renderer.create(React.createElement(Recipes, { rows: [row], remaining: 0, readOnly: true, canAsk: false, onAdd() {}, onEdit() {}, onNew() {} })); });
  await act(async () => tree.root.findAll(n => n.type === 'button' && n.props['aria-expanded'] === false)[0].props.onClick());
  assert.ok(text(tree).includes('Можно заменить'));
  assert.equal(button(tree, 'Спросить тренера о замене'), undefined);
  tree.unmount();
});

test('AI-сканер (FT-746): кадр снимается, когда в рамке еда, светло и телефон замер', async () => {
  const { scanStep, frameGray, STEADY_MS } = await import('../src/nutrition/plate-scan.js');
  const plate = (shift = 0) => Uint8Array.from({ length: 576 }, (_, i) => 60 + ((i + shift) % 24) * 6);
  assert.equal(scanStep({}, new Uint8Array(576).fill(15), 0).phase, 'dark');
  assert.equal(scanStep({}, new Uint8Array(576).fill(160), 0).phase, 'empty', 'стена без деталей');
  let s = scanStep({}, plate(), 0);
  assert.equal(s.phase, 'moving', 'первый кадр — не с чем сравнить');
  s = scanStep(s, plate(), 100); assert.equal(s.phase, 'steady');
  s = scanStep(s, plate(7), 300); assert.equal(s.phase, 'moving', 'сдвинули — отсчёт заново'); assert.equal(s.since, null);
  s = scanStep(s, plate(7), 400); s = scanStep(s, plate(7), 400 + STEADY_MS - 1); assert.equal(s.phase, 'steady'); assert.ok(s.progress > 0.9);
  s = scanStep(s, plate(7), 400 + STEADY_MS); assert.equal(s.phase, 'ready');
  // Дрожащая рука (FT-748): рывок туда-обратно отсчёт не сбрасывает, третий — сбрасывает
  const jitter = k => Uint8Array.from(plate(), (v, i) => v + (i % 2 ? k : -k));
  let h = scanStep(scanStep({}, plate(), 0), plate(), 100);
  h = scanStep(h, jitter(25), 200); h = scanStep(h, plate(), 300);
  assert.equal(h.phase, 'steady', 'рывок туда-обратно — держим'); assert.equal(h.since, 100);
  h = scanStep(h, jitter(25), 400); assert.equal(h.phase, 'moving', 'третий рывок — заново');
  assert.deepEqual([...frameGray([255, 255, 255, 255, 0, 0, 0, 255])], [255, 0]);
});

test('«Без ограничений»: одно нажатие — запись 0 ккал; без связи — в очередь телефона', async () => {
  const calls = [], saved = [];
  __x.mutate = async (a, p) => { calls.push([a, p]); return {}; };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(FreeMarks, { day: '2026-10-22', meal: 'breakfast', onSaved: t => saved.push(t), onError: e => { throw e; } })); });
  await act(async () => button(tree, 'Чай без сахара: записать, 0 ккал').props.onClick());
  assert.equal(calls[0][0], 'diary.entry.save');
  assert.deepEqual(calls[0][1].product, { kind: 'free', id: 'tea' });
  assert.equal(calls[0][1].preview.kcal, 0); assert.equal(calls[0][1].meal, 'breakfast');
  assert.ok(saved[0].includes('0 ккал'));
  __x.mutate = async () => { throw Object.assign(new Error('Нет связи'), { code: 0 }); };
  __x.queued = [];
  await act(async () => button(tree, 'Кофе без сахара и молока: записать, 0 ккал').props.onClick());
  assert.equal(__x.queued[0].params.product.id, 'coffee');
  assert.ok(saved[1].includes('телефоне'));
  tree.unmount();
});

test('«Что влезет»: выбор отдаёт продукт и порцию в форму записи', async () => {
  let picked = null, tree;
  await act(async () => { tree = renderer.create(React.createElement(SnackIdeas, { remaining: 300, onClose() {}, onPick: (p, amount) => { picked = { p, amount }; } })); });
  assert.ok(text(tree).includes('Что влезет в 300 ккал'));
  const first = tree.root.findAll(n => n.type === 'button' && [].concat(n.props.children).join('') === 'Записать')[0];
  await act(async () => first.props.onClick());
  assert.ok(picked && picked.amount > 0);
  assert.ok(['ingredient', 'dish'].includes(picked.p.kind));
  tree.unmount();
});

test('карточка «Рациона»: «Чем заменить» — только основные продукты с заменами', async () => {
  const { CardSwaps } = module.exports;
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(CardSwaps, { recipe: { portions: 2, items: [{ food: 'рис', grams: 140 }, { food: 'соль', grams: 5 }, { food: 'зелень', grams: 10 }] } })); });
  const out = text(tree);
  assert.ok(out.includes('Чем заменить') && out.includes('гречка'));
  assert.ok(!out.includes('зелень'), 'приправа — не основной продукт');
  await act(async () => tree.update(React.createElement(CardSwaps, { recipe: { portions: 1, items: [{ food: 'соль', grams: 5 }] } })));
  assert.equal(tree.toJSON(), null);
  tree.unmount();
});

// Еда по фото (FT-749): блюдо — заголовок с суммой, под ним продукты; название и граммы
// правятся в строке, продукт меняется на карточку справочника; каждый — своя запись с пометкой блюда
const plateStubs = {
  ...stubs,
  icons: `import React from 'react';const I=()=> <i/>; export const IconTrash=I;`,
  telegram: `export const haptic=()=>{};`,
  ScanGuide: `export default ()=>null;`,
  'plate-photo-io': `export const shrink=async()=>'';`,
  PlateScanner: `export const PlateScanner=()=>null;`,
};
const plateBundle = await build({ stdin: { contents: "export { PlatePhoto } from './src/nutrition/PlatePhoto.jsx';", resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], logLevel: 'silent', plugins: [{ name: 'plate-stubs', setup(b) {
  b.onResolve({ filter: /\/(api|ui|icons|offline-writes|telegram|ScanGuide|plate-photo-io|PlateScanner)\.(js|jsx)$/ }, a => ({ path: ({ 'offline-writes': 'offline' })[a.path.split('/').at(-1).split('.')[0]] || a.path.split('/').at(-1).split('.')[0], namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: plateStubs[a.path], loader: 'jsx' }));
  b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
} }] });
const plateModule = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + plateBundle.outputFiles[0].text + '\n})')(createRequire(import.meta.url), plateModule, plateModule.exports);
const { PlatePhoto } = plateModule.exports;

test('еда по фото (FT-749): блюдо разложено на продукты, правка названия и граммов, замена из справочника, запись по продуктам', async () => {
  const image = 'data:image/jpeg;base64,AAAA';
  const data = diaryMock('diary.photo', { clientRow: 78, image });
  const butter = { id: 901, kind: 'food', name: 'Масло сливочное 82,5%', brand: '', kcal: 748, protein: 0.5, fat: 82.5, carbs: 0.8, unit: 'g' };
  const searched = [], sent = [];
  __x.read = async (a, p) => { searched.push([a, p]); return { foods: [butter, { id: 902, name: 'Масло в штуках', kcal: 700, unit: 'piece' }] }; };
  __x.mutate = async (a, p) => { sent.push([a, p]); return { id: 1 }; };
  let tree, saved = '';
  await act(async () => { tree = renderer.create(React.createElement(PlatePhoto, { day: '2026-10-25', meal: 'lunch', preset: { image, data }, onClose() {}, onSaved: t => { saved = t; } })); });
  const inputs = label => tree.root.findAll(n => n.type === 'input' && n.props['aria-label'] === label);
  const dishNames = () => inputs('Название блюда').map(i => i.props.value);
  assert.deepEqual(dishNames(), ['Гречка с маслом', 'Котлета куриная'], 'блюда из нескольких продуктов — заголовками');
  assert.deepEqual(inputs('Продукт').map(i => i.props.value), ['Гречка варёная', 'Масло сливочное', 'Фарш куриный жареный', 'Хлеб белый', 'Масло растительное', 'Огурец свежий'], 'огурец — один продукт, без заголовка');
  const out = () => text(tree);
  assert.ok(out().includes('Примерно, оценка по фото'));
  // 170 г гречки × 110 + 10 г масла × 748 = 187 + 74,8 ≈ 262 ккал
  assert.ok(out().includes('262') && out().includes('ккал'), 'сумма блюда');

  await act(async () => inputs('Название блюда')[1].props.onChange({ target: { value: 'Котлета из индейки' } }));
  assert.equal(dishNames()[1], 'Котлета из индейки', 'название блюда правится в строке');
  await act(async () => inputs('Граммы: Хлеб белый')[0].props.onChange({ target: { value: '0' } }));

  // Название продукта правится — справочник ищется по нему, штучные карточки не предлагаются
  await act(async () => inputs('Продукт')[1].props.onChange({ target: { value: 'масло сливочное' } }));
  await act(() => new Promise(r => setTimeout(r, 350)));
  assert.deepEqual(searched.at(-1), ['food.search', { q: 'масло сливочное', separateBrand: true }]);
  assert.ok(!out().includes('Масло в штуках'));
  await act(async () => button(tree, 'Масло сливочное 82,5%').props.onClick());
  assert.equal(inputs('Продукт')[1].props.value, 'Масло сливочное 82,5%');
  assert.ok(out().includes('Из справочника · 748 ккал / 100 г'));

  // + продукт к блюду: без калорий не записывается, со своими — «примерно»
  await act(async () => button(tree, '+ продукт').props.onClick());
  const extra = inputs('Продукт').find(i => i.props.value === '');
  assert.ok(extra, 'пустая строка нового продукта');
  await act(async () => extra.props.onChange({ target: { value: 'Сыр' } }));
  await act(async () => inputs('Граммы: Сыр')[0].props.onChange({ target: { value: '20' } }));
  await act(async () => inputs('Калории на 100 г: Сыр')[0].props.onChange({ target: { value: '350' } }));
  await act(() => new Promise(r => setTimeout(r, 350)));

  const add = tree.root.findAll(n => n.type === 'button' && String([].concat(n.props.children).join('')).startsWith('Добавить '))[0];
  await act(async () => add.props.onClick());
  const entries = sent.filter(([a]) => a === 'diary.entry.save').map(([, p]) => p);
  assert.equal(entries.length, 6, 'хлеб с 0 г не записан, остальные — каждый своей записью');
  const butterEntry = entries.find(p => p.product.kind === 'food');
  assert.deepEqual([butterEntry.product.id, butterEntry.amount, butterEntry.dish], [901, 10, 'Гречка с маслом']);
  const cheese = entries.find(p => /^Сыр/.test(p.product.name));
  assert.deepEqual([cheese.product.name, cheese.product.kcal, cheese.product.protein, cheese.dish], ['Сыр, ~20 г', 70, null, 'Гречка с маслом'], 'свои калории без БЖУ — БЖУ «не знаю»');
  assert.equal(entries.find(p => /Фарш/.test(p.product.name)).dish, 'Котлета из индейки', 'в запись — исправленное название блюда');
  assert.equal(entries.find(p => /Огурец/.test(p.product.name)).dish, undefined, 'один продукт — без пометки блюда');
  const confirm = sent.find(([a]) => a === 'diary.photo.confirm')[1];
  assert.equal(confirm.items.length, 6);
  assert.match(saved, /6 продуктов/);
  tree.unmount();
});
