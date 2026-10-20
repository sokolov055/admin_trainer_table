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
  ui: `import React from 'react'; export const Section=({children})=><section>{children}</section>;export const Panel=({children})=><div>{children}</div>;export const Note=({children})=><aside>{children}</aside>;export const Loading=()=> <div>Загрузка</div>;export const formatNumber=n=>String(n);`,
  icons: `import React from 'react';const I=()=> <i/>; export const IconPlus=I,IconClose=I,IconHeart=I,IconCopy=I,IconTrash=I,IconChevron=I,IconNutrition=I;`,
};
const bundle = await build({ entryPoints: ['src/nutrition/Diary.jsx'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], logLevel: 'silent', plugins: [{ name: 'diary-stubs', setup(b) {
  b.onResolve({ filter: /\/(api|gestures|ui|icons|offline-writes|offline-account)\.(js|jsx)$/ }, a => ({ path: ({ 'offline-writes': 'offline', 'offline-account': 'account' })[a.path.split('/').at(-1).split('.')[0]] || a.path.split('/').at(-1).split('.')[0], namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'jsx' }));
  b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
} }] });
const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + bundle.outputFiles[0].text + '\n})')(createRequire(import.meta.url), module, module.exports);
const { useDiaryResource, DiaryEntryForm } = module.exports;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
globalThis.__diary = { queued: [] };
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
