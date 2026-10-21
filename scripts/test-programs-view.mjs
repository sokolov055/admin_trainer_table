import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * «Программы тренера» на экране (FT-497): группы по цели, метки карточки,
 * пилюли с «×» сужают список сразу, «Хочу эту программу» — заявка тренеру;
 * тренеру «глазами клиента» кнопки нет. Сервер подменён.
 */

const calls = [];
let list = null;
const programs = [
  { id: 1, title: 'Первый месяц в зале', goal: 'Похудение', level: 'Новичок', place: 'gym', days: 2, minutes: 45, minutesAuto: false, workouts: 2, requested: false },
  { id: 2, title: 'Круги дома', goal: 'Похудение', level: 'Средний', place: 'home', days: 3, minutes: 40, minutesAuto: true, workouts: 3, requested: false },
  { id: 3, title: 'UL [4]', goal: 'Сила', level: 'Опытный', place: 'gym', days: 4, minutes: 60, minutesAuto: false, workouts: 2, requested: true },
];
globalThis.__api = async (action, params) => { calls.push([action, params]); return { requested: true, already: false }; };
globalThis.__data = (action, params) => {
  if (action === 'showcase.list') return { data: list, loading: false, error: null, reload() {} };
  if (action === 'showcase.get') {
    const p = programs.find((x) => x.id === params.id);
    return { data: { ...p, description: 'Для старта', repeats: false, sessions: [{ title: 'Верх', exercises: [{ name: 'Жим гантелей лёжа', volume: '3 × 12', superset: false }] }] }, loading: false, error: null, reload() {} };
  }
  return { data: null, loading: true, error: null, reload() {} };
};

const output = await build({ entryPoints: ['src/client/Programs.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\.?\/(api|telegram|useData|ui|Onboarding)\.jsx?$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
    b.onLoad({ filter: /\/api\.js$/, namespace: 'stub' }, () => ({ contents: 'export const apiMutate=(...a)=>globalThis.__api(...a);' }));
    b.onLoad({ filter: /\/telegram\.js$/, namespace: 'stub' }, () => ({ contents: 'export const haptic=()=>{};' }));
    b.onLoad({ filter: /\/useData\.js$/, namespace: 'stub' }, () => ({ contents: 'export const useData=(...a)=>globalThis.__data(...a);' }));
    // tidyTitle — та же строка, что в Onboarding.jsx; сам экран анкеты здесь не нужен
    b.onLoad({ filter: /\/Onboarding\.jsx$/, namespace: 'stub' }, () => ({ contents: "export const tidyTitle=(t)=>String(t||'').replace(/\\s*\\/\\s*/g,' · ').replace(/,(?=\\S)/g,', ');" }));
    b.onLoad({ filter: /\/ui\.jsx$/, namespace: 'stub' }, () => ({ loader: 'js', contents: `import React from 'react';
const el = (tag, cls) => ({ children, ...rest }) => React.createElement(tag, { className: cls, 'data-props': rest }, children);
export const Section = ({ title, note, action, children }) => React.createElement('section', null, React.createElement('h2', null, title), note, action, children);
export const Loading = () => null; export const ErrorState = () => null;
export const Empty = ({ title, text, action }) => React.createElement('div', { className: 'state' }, title, text, action);
export const Note = el('div', 'note');
export const Sheet = ({ title, children }) => React.createElement('div', { className: 'sheet' }, React.createElement('h2', null, title), children);
export function plural(n, one, few, many) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many; }` }));
  } }] });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { ProgramsShowcase, ProgramsSection } = mod.exports;

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const cards = (tree) => tree.root.findAll((n) => n.type === 'button' && n.props.className === 'pcard');

test('витрина: группы по цели, на карточке уровень, минуты, место и раз в неделю', async () => {
  list = { available: true, trainer: 'Константин', programs };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(ProgramsShowcase, { onClose() {} })); });
  assert.deepEqual(tree.root.findAllByType('h3').map(text), ['Похудение', 'Сила']);
  const first = text(cards(tree)[0]);
  assert.match(first, /Новичок/);
  assert.match(first, /45 мин · зал/);
  assert.match(first, /2 раза в неделю/);
  assert.match(text(cards(tree)[1]), /≈ 40 мин · дома/, 'посчитанные минуты — с «≈»');
  assert.match(text(cards(tree)[2]), /UL — верх и низ тела по очереди/, 'сокращение расшифровано рядом (на карточке — первое, все — в окне)');
  assert.match(text(cards(tree)[2]), /Заявка у тренера/);
  assert.match(text(tree.root), /подготовил Константин/);
  tree.unmount();
});

test('пилюля сужает список сразу, подсвечена с «×», повторное нажатие снимает', async () => {
  list = { available: true, trainer: 'Константин', programs };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(ProgramsShowcase, { onClose() {} })); });
  const pill = (label) => tree.root.findAll((n) => n.type === 'button' && /chip/.test(n.props.className || '') && text(n) === label)[0];
  await act(async () => { pill('Дома').props.onClick(); });
  assert.equal(cards(tree).length, 1);
  assert.equal(pill('Дома').props['aria-pressed'], true);
  assert.match(pill('Дома').props.className, /chip--active/);
  assert.equal(pill('Дома').findAllByType('svg').length, 1, 'у выбранной — «×»');
  await act(async () => { pill('Опытный').props.onClick(); });
  assert.equal(cards(tree).length, 0);
  assert.match(text(tree.root), /Под эти условия программ нет/);
  await act(async () => { pill('Дома').props.onClick(); });
  assert.equal(cards(tree).length, 1, 'сняли «Дома» — осталось «Опытный»');
  await act(async () => { pill('Опытный').props.onClick(); });
  assert.equal(cards(tree).length, 3, 'всё снято — весь список');
  tree.unmount();
});

test('«Хочу эту программу» — заявка тренеру, после неё — что дальше', async () => {
  list = { available: true, trainer: 'Константин', programs };
  calls.length = 0;
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(ProgramsShowcase, { onClose() {} })); });
  await act(async () => { cards(tree)[0].props.onClick(); });
  const sheet = tree.root.findByProps({ className: 'sheet' });
  assert.match(text(sheet), /Жим гантелей лёжа3 × 12/, 'состав программы в нижнем окне');
  const ask = sheet.findAll((n) => n.type === 'button' && text(n) === 'Хочу эту программу')[0];
  await act(async () => { await ask.props.onClick(); });
  assert.deepEqual(calls, [['showcase.request', { id: 1 }]]);
  assert.match(text(tree.root.findByProps({ className: 'sheet' })), /Заявка у тренера/);
  tree.unmount();
});

test('тренер «глазами клиента» видит витрину без кнопки заявки; без программ раздела нет', async () => {
  list = { available: true, trainer: 'Константин', programs };
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(ProgramsSection, { clientRow: 10, clientView: true, onOpenAll() {} })); });
  assert.equal(cards(tree).length, 3);
  await act(async () => { cards(tree)[0].props.onClick(); });
  const sheet = tree.root.findByProps({ className: 'sheet' });
  assert.equal(sheet.findAll((n) => n.type === 'button' && text(n) === 'Хочу эту программу').length, 0);
  assert.match(text(sheet), /видит клиент/);
  tree.unmount();

  list = { available: false, programs: [] };
  await act(async () => { tree = renderer.create(React.createElement(ProgramsSection, { onOpenAll() {} })); });
  assert.equal(tree.toJSON(), null);
  tree.unmount();
});
