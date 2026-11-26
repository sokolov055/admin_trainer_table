import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * Блюда — в языке «Программ» (26.11.2026): статусы во всю ширину со
 * счётчиками, чипы приёмов пищи с точками, карточка — обложка приёма
 * пищи + факты значками + метки значками. Смахивание влево меняет статус
 * (публикация черновика, скрытие, возврат); «Удалить» нет — сервер блюда
 * не удаляет. Сервер подменён.
 */

const calls = [];
let list = null;
let reloaded = false;
const dishes = [
  { id: 1, name: 'Гречка с курицей', status: 'draft', meal: 'обед', minutes: 20, portions: 2, budget: true, per: { kcal: 420, protein: 34, fat: 8, carbs: 45 }, tags: ['быстро', 'бюджетно'], items: [], steps: [] },
  { id: 2, name: 'Овсяноблин с творогом', status: 'draft', meal: 'завтрак', minutes: 15, portions: 2, per: { kcal: 310, protein: 20, fat: 11, carbs: 20 }, tags: ['без молочного'], items: [], steps: [] },
  { id: 3, name: 'Запечённая рыба с овощами', status: 'published', meal: 'ужин', minutes: 35, portions: 2, per: { kcal: 380, protein: 38, fat: 12, carbs: 60 }, tags: ['высокобелковое'], items: [], steps: [] },
  { id: 4, name: 'Творожная запеканка', status: 'hidden', meal: 'перекус', minutes: 45, portions: 4, per: { kcal: 520, protein: 40, fat: 14, carbs: 60 }, tags: [], items: [], steps: [] },
];
globalThis.__api = async (action, params) => { calls.push([action, params]); return { id: params.id, status: params.status }; };
globalThis.__data = (action) => {
  if (action === 'dishes.list') return { data: list, loading: false, error: null, reload() { reloaded = true; } };
  return { data: null, loading: true, error: null, reload() {} };
};

const output = await build({ entryPoints: ['src/trainer/Dishes.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\.?\/(api|telegram|useData|ui|scroll)\.jsx?$|^\.\.?\/(SwipeRow)\.jsx$/ },
      (args) => ({ path: args.path, namespace: 'stub' }));
    b.onLoad({ filter: /\/api\.js$/, namespace: 'stub' }, () => ({ contents: 'export const apiMutate=(...a)=>globalThis.__api(...a);' }));
    b.onLoad({ filter: /\/telegram\.js$/, namespace: 'stub' }, () => ({ contents: 'export const haptic=()=>{};' }));
    b.onLoad({ filter: /\/useData\.js$/, namespace: 'stub' }, () => ({ contents: 'export const useData=(...a)=>globalThis.__data(...a);' }));
    b.onLoad({ filter: /\/scroll\.js$/, namespace: 'stub' }, () => ({ contents: 'export const useReturnScroll=()=>{};' }));
    /* SwipeRow — DOM-хардкор (swipe.js, remove.js), покрыт своими тестами;
       здесь важна передача extra в кнопку действия */
    b.onLoad({ filter: /\/SwipeRow\.jsx$/, namespace: 'stub' }, () => ({ loader: 'js', contents: `import React from 'react';
export default function SwipeRow({ className, extra, children }) {
  return React.createElement('div', { className }, children,
    extra ? React.createElement('button', { 'aria-label': extra.label, onClick: () => extra.onClick() }, extra.text) : null);
}` }));
    b.onLoad({ filter: /\/ui\.jsx$/, namespace: 'stub' }, () => ({ loader: 'js', contents: `import React from 'react';
export const Panel = ({ children }) => React.createElement('div', null, children);
export const Loading = () => null;
export const ErrorState = () => null;
export const Empty = ({ title, text }) => React.createElement('div', { className: 'state' }, title, text);
export const Note = ({ children }) => React.createElement('div', { className: 'note' }, children);
export const Tag = ({ children }) => React.createElement('span', null, children);
export const Field = ({ label }) => React.createElement('label', null, label);
export const BackButton = ({ label }) => React.createElement('button', null, label);
export const Chips = ({ items, value, onChange }) => React.createElement('div', { className: 'chips' },
  items.map((it) => React.createElement('button', { key: it.value, className: 'chip' + (it.value === value ? ' chip--active' : ''), onClick: () => onChange(it.value) }, it.label)));
export const Segmented = ({ items, value, onChange, label }) => React.createElement('div', { role: 'radiogroup', 'aria-label': label },
  items.map((it) => React.createElement('button', { key: String(it.value), role: 'radio', 'aria-checked': value === it.value, className: 'chip' + (value === it.value ? ' chip--active' : ''), onClick: () => onChange(it.value) }, it.label)));
export const Search = ({ value, onChange, placeholder }) => React.createElement('input', { value, placeholder, onChange: (e) => onChange(e.target.value) });
export function formatNumber(n) { return String(n); }
export function plural(n, one, few, many) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many; }` }));
  } }] });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const Dishes = mod.exports.default;

const text = (node) => (typeof node === 'string' || typeof node === 'number'
  ? String(node)
  : (node && node.children ? node.children.map(text).join('') : ''));
const cards = (tree) => tree.root.findAll((n) => String(n.props && n.props.className || '').includes('plib-card'));
const byAria = (tree, label) => tree.root.findAll((n) => n.props && n.props['aria-label'] === label);
const statuses = (tree) => tree.root.findAll((n) => n.props && n.props.role === 'radio');

async function render() {
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Dishes)); });
  return tree;
}

async function toStatus(tree, label) {
  const btn = statuses(tree).find((n) => text(n).includes(label));
  await act(async () => { btn.props.onClick(); });
}

test('шапка: три статуса во всю ширину со счётчиками, поиск и «+» иконками', async () => {
  list = { dishes, foods: [] };
  const tree = await render();
  const t = text(tree.root);
  assert.match(t, /Черновики2/);
  assert.match(t, /У клиентов1/);
  assert.match(t, /Скрытые1/);
  assert.match(t, /Черновики клиенты не видят\./);
  assert.equal(byAria(tree, 'Поиск').length, 1);
  assert.equal(byAria(tree, 'Новое блюдо').length, 1);
  assert.ok(!t.includes('Своё блюдо'), 'кнопка «Своё блюдо» заменена на «+»');
});

test('чипы приёмов пищи — с цветными точками приёма', async () => {
  list = { dishes, foods: [] };
  const tree = await render();
  const dots = tree.root.findAll((n) => {
    const c = String(n.props && n.props.className || '');
    return c.includes('plib-dot') && c.includes('plib-meal--');
  }).map((n) => String(n.props.className));
  for (const key of ['zav', 'ob', 'uz', 'per']) assert.ok(dots.some((c) => c.includes('plib-meal--' + key)), key);
});

test('карточка: обложка приёма пищи, факты значками, статус черновика', async () => {
  list = { dishes, foods: [] };
  const tree = await render();
  const t = text(tree.root);
  assert.match(t, /Гречка с курицей/);
  assert.match(t, /обед/);
  assert.match(t, /20420×2/);
  assert.match(t, /черновик/);
  const obCover = coversOf(tree).find((c) => c.includes('plib-meal--ob'));
  assert.ok(obCover, 'обложка обеда на карточке черновика');
  // фильтр «обед» оставляет одну карточку
  const chip = tree.root.findAll((n) => String(n.props && n.props.className || '').includes('chip') && text(n) === 'обед');
  assert.equal(chip.length, 1);
  await act(async () => { chip[0].props.onClick(); });
  const shown = cards(tree).map((c) => text(c));
  assert.deepEqual(shown, ['Гречка с курицейобед20420×2черновик']);
});

const coversOf = (tree) => tree.root.findAll((n) => String(n.props && n.props.className || '').includes('plib-cover'))
  .map((n) => String(n.props.className));

test('метки-значки: метки сервера и уровень углеводов', async () => {
  list = { dishes, foods: [] };
  const tree = await render();
  // карбс черновика: 45*4/420 = 0.43 — «средне», стрелки нет; у овсяноблина 0.26 — «мало»
  const itags = () => tree.root.findAll((n) => String(n.props && n.props.className || '').includes('dish-itag'))
    .map((n) => String(n.props.title || ''));
  assert.ok(itags().includes('Быстро'));
  assert.ok(itags().includes('Бюджетное'));
  assert.ok(itags().includes('Без молочного'));
  assert.ok(!itags().includes('Углеводов много'), 'средний уровень углеводов значком не показываем');
  await toStatus(tree, 'У клиентов');
  assert.ok(itags().includes('Высокобелковое'), 'метка опубликованного ужина');
  assert.ok(itags().includes('Углеводов много'), '60*4/380 = 0.63 — выше порога 0.45');
});

test('смахнуть влево: черновик — «Опубликовать» через dish.status, затем reload', async () => {
  list = { dishes, foods: [] };
  const tree = await render();
  const btn = byAria(tree, 'Опубликовать «Гречка с курицей»');
  assert.equal(btn.length, 1);
  await act(async () => { btn[0].props.onClick(); });
  assert.deepEqual(calls.at(-1), ['dish.status', { id: 1, status: 'published' }]);
  assert.equal(reloaded, true);
});

test('смахнуть влево: опубликованное — «Скрыть», скрытое — «В черновики»', async () => {
  list = { dishes, foods: [] };
  const tree = await render();
  await toStatus(tree, 'У клиентов');
  assert.equal(byAria(tree, 'Скрыть «Запечённая рыба с овощами»').length, 1);
  assert.equal(cards(tree).length, 1, 'на виду только опубликованные');
  await toStatus(tree, 'Скрытые');
  assert.equal(byAria(tree, 'Вернуть «Творожная запеканка» в черновики').length, 1);
  assert.ok(byAria(tree, 'Опубликовать «Гречка с курицей»').length === 0, 'под скрытым статусом чужие свайпы не видны');
});

test('поиск открывается в строке чипов и сужает список', async () => {
  list = { dishes, foods: [] };
  const tree = await render();
  await act(async () => { byAria(tree, 'Поиск')[0].props.onClick(); });
  const input = tree.root.findAll((n) => n.type === 'input');
  assert.equal(input.length, 1);
  assert.equal(input[0].props.placeholder, 'Поиск блюда');
  await act(async () => { input[0].props.onChange({ target: { value: 'овсян' } }); });
  assert.equal(cards(tree).length, 1);
});
