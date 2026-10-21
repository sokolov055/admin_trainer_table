import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { totalEntries, withPending } from '../src/nutrition/diary-model.js';

const food = { kind: 'food', id: 1, name: 'Йогурт', kcal: 70, protein: 8, fat: 2, carbs: 5, unit: 'g' };
test('КБЖУ: граммы и порции используют разные базы расчёта', () => {
  const t = totalEntries([{ product: food, amount: 150 }, { product: { ...food, unit: 'portion', kcal: 400 }, amount: .5 }]);
  assert.equal(t.kcal, 305);
});
test('очередь не удваивает подтверждённое; чужой день не подмешивается', () => {
  const day = { day: '2026-10-17', entries: [{ requestId: 'one', product: food, amount: 100 }], complete: true };
  const writes = [
    { kind: 'diaryEntry', params: { requestId: 'one', day: day.day, preview: food, amount: 100 } },
    { kind: 'diaryEntry', params: { requestId: 'two', day: day.day, preview: food, amount: 50 }, error: 'Проверьте продукт' },
    { kind: 'diaryEntry', params: { requestId: 'other', day: '2026-10-18', preview: food, amount: 200 } },
  ];
  const result = withPending(day, writes);
  assert.equal(result.entries.length, 2);
  assert.equal(result.totals.kcal, 105);
  assert.equal(result.complete, false);
  assert.equal(result.entries[1].error, 'Проверьте продукт');
});

const stubs = {
  api: `export const apiPublic=(a,p)=>globalThis.__diary.read(a,p); export const apiStale=(a,p)=>({data:null,promise:globalThis.__diary.read(a,p)}); export const apiMutate=(a,p)=>globalThis.__diary.mutate(a,p);`,
  gestures: `export const useBackGesture=()=>{};`,
  offline: `export const localWrites=async()=>[]; export const onWritesChange=()=>()=>{}; export const queueWrite=async(k,p)=>{globalThis.__diary.queued.push({kind:k,params:p})}; export const isOffline=e=>e?.code===0; export const dropWrite=async()=>{};`,
  account: `export const offlineAccount=()=> 'unit-account';`,
  ui: `import React from 'react'; export const Section=({children})=><section>{children}</section>;export const Panel=({children})=><div>{children}</div>;export const Note=({children})=><aside>{children}</aside>;export const Loading=()=> <div>Загрузка</div>;export const Sheet=({title,children})=><section role="dialog"><h2>{title}</h2>{children}</section>;export const formatNumber=n=>String(n);export const Chips=({items,value,onChange,label})=><div role="tablist" aria-label={label}>{items.map(i=><button key={i.value} role="tab" aria-selected={i.value===value} onClick={()=>onChange(i.value)}>{i.label}</button>)}</div>;`,
  icons: `import React from 'react';const I=()=> <i/>; export const IconPlus=I,IconClose=I,IconHeart=I,IconCopy=I,IconTrash=I,IconChevron=I,IconNutrition=I,IconCheck=I;`,
  // Смахивание и «Вернуть» — свои модули с проверками; здесь удаление уходит сразу, чтобы видеть вызов сервера.
  SwipeRow: `import React from 'react'; export default ({children,onDelete,label,disabled})=><div data-swipe={label} data-disabled={disabled?'1':''}><button aria-label={label} onClick={onDelete}>x</button>{children}</div>;`,
  pendingDelete: `export const usePendingDelete=(commit,{onDone,onError}={})=>({remove:(id,payload)=>{globalThis.__diary.removed.push(id);Promise.resolve(commit(payload)).then(()=>onDone&&onDone(payload),e=>onError&&onError(e));},hidden:()=>false,bar:null,flush(){}});`,
};
const bundle = await build({ entryPoints: ['src/nutrition/Diary.jsx'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], logLevel: 'silent', plugins: [{ name: 'diary-stubs', setup(b) {
  b.onResolve({ filter: /\/(api|gestures|ui|icons|offline-writes|offline-account|SwipeRow|pendingDelete)\.(js|jsx)$/ }, a => ({ path: ({ 'offline-writes': 'offline', 'offline-account': 'account' })[a.path.split('/').at(-1).split('.')[0]] || a.path.split('/').at(-1).split('.')[0], namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'jsx' }));
  b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
} }] });
const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + bundle.outputFiles[0].text + '\n})')(createRequire(import.meta.url), module, module.exports);
const { useDiaryResource, DiaryEntryForm, default: NutritionDiary } = module.exports;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
globalThis.__diary = { queued: [], removed: [] };
test('поздний ответ прошлого дня не заменяет открытый день', async () => {
  const pending = new Map();
  __diary.read = (_a, p) => new Promise(resolve => pending.set(p.day, resolve));
  const Probe = ({ day }) => { const r = useDiaryResource('diary.get', { day }); return React.createElement('span', null, r.data?.day || 'loading'); };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Probe, { day: '2026-10-16' })); });
  await act(async () => tree.update(React.createElement(Probe, { day: '2026-10-17' })));
  await act(async () => pending.get('2026-10-17')({ day: '2026-10-17' }));
  await act(async () => pending.get('2026-10-16')({ day: '2026-10-16' }));
  assert.equal(tree.toJSON().children[0], '2026-10-17');
  tree.unmount();
});
test('новая еда при потере ответа сохраняется в очереди с тем же requestId', async () => {
  let sent, saved;
  __diary.mutate = async (a, p) => { sent = { action: a, params: p }; throw Object.assign(new Error('Нет связи'), { code: 0 }); };
  __diary.queued = [];
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(DiaryEntryForm, { product: food, day: '2026-10-17', meal: 'dinner', onClose() {}, onSaved: text => { saved = text; } })); });
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(__diary.queued[0].params.requestId, sent.params.requestId);
  assert.equal(__diary.queued[0].params.meal, 'dinner');
  assert.equal(__diary.queued[0].params.preview.name, 'Йогурт');
  assert.ok(saved.includes('телефоне'));
  tree.unmount();
});
test('отказ сервера не маскируется как сохранение без сети', async () => {
  let saved = false;
  __diary.mutate = async () => { throw Object.assign(new Error('Конфликт записи'), { code: 409 }); };
  __diary.queued = [];
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(DiaryEntryForm, { product: food, onClose() {}, onSaved() { saved = true; } })); });
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(saved, false); assert.equal(__diary.queued.length, 0);
  assert.ok(JSON.stringify(tree.toJSON()).includes('Конфликт записи'));
  tree.unmount();
});
test('«Удалить запись» в форме не трогает сервер сам — отдаёт запись родителю (FT-642)', async () => {
  let removed = null, mutated = 0;
  __diary.mutate = async () => { mutated++; };
  const entry = { id: 7, revision: 2, day: '2026-10-17', meal: 'lunch', amount: 120, product: food };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(DiaryEntryForm, { entry, onClose() {}, onSaved() {}, onRemove: e => { removed = e; } })); });
  const buttons = tree.root.findAllByType('button').filter(b => Array.isArray(b.props.children) && b.props.children.includes(' Удалить запись'));
  assert.equal(buttons.length, 1);
  await act(async () => buttons[0].props.onClick());
  assert.equal(removed.id, 7); assert.equal(mutated, 0);
  tree.unmount();
});
test('дневник: четыре вкладки, смахивание строки удаляет запись с revision, «План меню» — кнопка в итоге', async () => {
  const calls = [];
  __diary.read = async (a, p) => a === 'diary.get' ? { day: p.day, entries: [{ id: 7, revision: 2, day: p.day, meal: 'lunch', amount: 120, product: food }], totals: totalEntries([{ product: food, amount: 120 }]), targets: { kcal: 2000, protein: 100, fat: 60, carbs: 250 }, complete: false, waterMl: 0, comment: '', revision: 1 } : { products: [] };
  __diary.mutate = async (a, p) => { calls.push([a, p]); return {}; };
  __diary.removed = [];
  let planned = null, tree;
  await act(async () => { tree = renderer.create(React.createElement(NutritionDiary, { onPlan: p => { planned = p; } })); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const tabs = tree.root.findAllByProps({ role: 'tab' }).map(t => t.props.children);
  assert.deepEqual(tabs, ['Дневник', 'Неделя', 'Рецепты', 'Ещё']);
  const plan = tree.root.findAllByType('button').find(b => b.props.children === 'Что приготовить на остаток');
  assert.ok(plan && !plan.props.disabled);
  await act(async () => plan.props.onClick());
  assert.equal(planned.targets.kcal, 2000); assert.equal(planned.totals.kcal, 84);
  const swipe = tree.root.findAllByProps({ 'aria-label': 'Удалить: Йогурт' }).find(n => n.type === 'button');
  await act(async () => swipe.props.onClick());
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  assert.deepEqual(__diary.removed, [7]);
  assert.equal(calls[0][0], 'diary.entry.remove'); assert.equal(calls[0][1].id, 7); assert.equal(calls[0][1].revision, 2);
  tree.unmount();
});

// План трёх разборов: «Ладонь» и итог дня
test('«Ладонь»: норма в порциях из нормы КБЖУ, подписи порций, счёт по группам', async () => {
  const { palmNorm, palmCount, palmUnit, PALM } = await import('../src/nutrition/palm-model.js');
  assert.equal(palmNorm(null), null);
  assert.equal(palmNorm({ kcal: 0 }), null);
  // 1800 ккал, Б 120 / Ж 60 / У 200: 5 ладоней, 8 горстей, (60 − 20) / 9 ≈ 4 пальца, овощей 5
  assert.deepEqual(palmNorm({ kcal: 1800, protein: 120, fat: 60, carbs: 200 }), { protein: 5, carbs: 8, fat: 4, veg: 5 });
  assert.deepEqual(palmNorm({ kcal: 1200, protein: 20, fat: 10, carbs: 10 }), { protein: 2, carbs: 1, fat: 1, veg: 4 });
  assert.equal(palmUnit('protein', 1), 'ладонь');
  assert.equal(palmUnit('protein', 1.5), 'ладони');
  assert.equal(palmUnit('carbs', 5), 'горстей');
  assert.equal(palmUnit('fat', 2), 'больших пальца');
  const entries = [{ amount: 1.5, product: { kind: 'palm', id: 'protein' } }, { amount: 1, product: { kind: 'palm', id: 'protein' } }, { amount: 100, product: food }];
  assert.deepEqual(palmCount(entries), { protein: 2.5, carbs: 0, fat: 0, veg: 0 });
  assert.equal(totalEntries([{ amount: 2, product: { ...PALM.protein, unit: 'portion' } }]).kcal, 270);
});
test('итог дня: в пределах 10 % — норма, меньше и больше — со словами', async () => {
  const { dayVerdict, mealNow } = await import('../src/nutrition/diary-model.js');
  assert.equal(dayVerdict(1700, 1800).tone, 'good');
  assert.equal(dayVerdict(1000, 1800).tone, 'under');
  assert.match(dayVerdict(2200, 1800).text, /на 400 ккал/);
  assert.equal(dayVerdict(500, 0).tone, 'neutral');
  assert.equal(mealNow(8), 'breakfast'); assert.equal(mealNow(13), 'lunch'); assert.equal(mealNow(19), 'dinner'); assert.equal(mealNow(23), 'snack');
});
