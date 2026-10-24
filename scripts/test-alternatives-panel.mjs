import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * Замены упражнения прямо в программе (владелец, 16.10.2026): рядом с
 * «Тренажёры и оборудование» в панели упражнения — «Замены упражнения».
 * Тренер выбирает из базы, чем заменить, и убирает лишнее; в занятии они
 * появляются в «Заменить упражнение».
 */

const calls = [];
let alternatives = [{ id: 20, name: 'Тяга гантели одной рукой' }];
const exercises = [
  { id: 10, name: 'Тяга Т-грифа', mine: true, common: false, machines: [], get alternatives() { return alternatives; } },
  { id: 20, name: 'Тяга гантели одной рукой', mine: true, machines: [], alternatives: [] },
  { id: 21, name: 'Тяга верхнего блока', mine: true, machines: [], alternatives: [] },
  { id: 22, name: 'Тяга нижнего блока', mine: false, common: true, machines: [], alternatives: [] },
];
globalThis.__api = async (action, params) => {
  calls.push([action, params]);
  if (action === 'library.exercise.alternatives') {
    alternatives = params.ids.map((id) => ({ id, name: exercises.find((x) => x.id === id).name }));
    return { exercise: exercises[0] };
  }
  throw new Error('нет ' + action);
};
let reloads = 0;
globalThis.__data = () => ({ data: { exercises, owner: false }, error: null, loading: false, reload: () => { reloads += 1; } });

const output = await build({ entryPoints: ['src/trainer/MachinesEditor.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' },
  plugins: [{ name: 'stubs', setup(b) {
    // Подменяем только то, что подключает сам редактор: остальное приложение
    // (ui.jsx тянет за собой полсайта) в проверку не нужно
    b.onResolve({ filter: /^\.\.\/(api|telegram|useData|library|ui)\.jsx?$/ }, (args) => (/MachinesEditor\.jsx$/.test(args.importer) ? { path: args.path, namespace: 'stub' } : undefined));
    b.onLoad({ filter: /\/api\.js$/, namespace: 'stub' }, () => ({ contents: 'export const apiMutate=(...a)=>globalThis.__api(...a); export const apiWait=()=>new Promise(()=>{}); export const apiPublic=apiMutate;' }));
    b.onLoad({ filter: /\/telegram\.js$/, namespace: 'stub' }, () => ({ contents: 'export const haptic=()=>{};' }));
    b.onLoad({ filter: /\/useData\.js$/, namespace: 'stub' }, () => ({ contents: 'export const useData=(...a)=>globalThis.__data(...a);' }));
    b.onLoad({ filter: /\/library\.js$/, namespace: 'stub' }, () => ({ contents: 'export const shrinkPhoto=async(x)=>x; export const uploadMachinePhoto=async()=>{}; export const mediaUrl=(x)=>x;' }));
    b.onLoad({ filter: /\/ui\.jsx$/, namespace: 'stub' }, () => ({ loader: 'js', contents: `import React from 'react';
export const Segmented=()=>null; export const Confirm=()=>null; export const Note=({children})=>React.createElement('div',null,children);
export const Search=({value,onChange,placeholder})=>React.createElement('input',{value,placeholder,onChange:(e)=>onChange(e.target.value)});` }));
  } }] });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { ExerciseMachines, AlternativesEditor } = mod.exports;

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const delay = () => new Promise((r) => setTimeout(r, 10));

test('в панели упражнения есть и тренажёры, и замены', async () => {
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(ExerciseMachines, { exerciseId: 10, name: 'Тяга Т-грифа' })); });
  const headings = tree.root.findAllByType('h3').map(text);
  assert.deepEqual(headings, ['Тренажёры и оборудование', 'Замены упражнения']);
  const chip = tree.root.findAllByType('button').find((b) => /Убрать замену/.test(b.props['aria-label'] || ''));
  assert.match(chip.props['aria-label'], /Тяга гантели одной рукой/, 'прикреплённая замена видна');
  tree.unmount();
});

test('прикрепить замену из базы и убрать её', async () => {
  calls.length = 0;
  let tree;
  let changed = null;
  await act(async () => { tree = renderer.create(React.createElement(ExerciseMachines, { exerciseId: 10, name: 'Тяга Т-грифа', onChanged: (s) => { changed = s; } })); });
  const button = (label) => tree.root.findAllByType('button').find((b) => text(b) === label);

  await act(async () => { button('+ Замена').props.onClick(); });
  await act(async () => { tree.root.findByType('input').props.onChange({ target: { value: 'тяга' } }); });
  const names = tree.root.findAllByProps({ className: 'button button--ghost library__alt-pick' }).map(text);
  assert.deepEqual(names, ['Тяга верхнего блока', 'Тяга нижнего блока'], 'уже прикреплённое и само упражнение не предлагаем');

  await act(async () => { button('Тяга верхнего блока').props.onClick(); await delay(); });
  assert.deepEqual(calls[0], ['library.exercise.alternatives', { exerciseId: 10, ids: [20, 21] }]);
  assert.ok(changed, 'программа узнала об изменении');
  assert.ok(reloads > 0, 'база перечитана');

  await act(async () => {
    tree.root.findAllByType('button').find((b) => /Убрать замену «Тяга гантели/.test(b.props['aria-label'] || '')).props.onClick();
    await delay();
  });
  assert.deepEqual(calls[1], ['library.exercise.alternatives', { exerciseId: 10, ids: [21] }]);
  tree.unmount();
});

test('в базе касание названия замены открывает её карточку, не убирает', async () => {
  calls.length = 0;
  alternatives = [{ id: 20, name: 'Тяга гантели одной рукой' }];
  const opened = [];
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(AlternativesEditor, { exercise: exercises[0], owner: false, all: exercises, onChanged() {}, onOpen: (id) => opened.push(id) })); });
  const name = tree.root.findAllByType('button').find((b) => text(b) === 'Тяга гантели одной рукой');
  await act(async () => { name.props.onClick(); await delay(); });
  assert.deepEqual(opened, [20], 'перешли к карточке замены');
  assert.equal(calls.length, 0, 'замена не убрана');
  tree.unmount();
});
