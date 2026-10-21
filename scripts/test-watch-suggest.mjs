/**
 * «Записать подходы?» на «Обзоре» (пункт 12 плана трёх разборов, 21.10.2026).
 *
 * Показывать ли карточку, решает сервер (health.workouts.suggest) — его
 * условия проверены в server/test/watch-suggest.test.js. Здесь — экран:
 * вчерашний ответ из кэша не показывается, «Не сейчас» прячет карточку для
 * этой тренировки часов, «Записать подходы» открывает «Тренировки», и те
 * начинают ту же тренировку программы с началом по часам.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const output = await build({
  stdin: {
    contents: `export { default as WatchSuggest } from '../src/client/WatchSuggest.jsx';
      export { requestWatchLaunch, useWatchLaunch } from '../src/client/watch-launch.js';`,
    resolveDir: 'scripts',
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  jsx: 'transform',
  loader: { '.jsx': 'jsx' },
  plugins: [{
    name: 'watch-suggest-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /useData\.js$/ }, () => ({ path: 'data', namespace: 'ws-test' }));
      bundle.onResolve({ filter: /[\\/]ui\.jsx$/ }, () => ({ path: 'ui', namespace: 'ws-test' }));
      bundle.onResolve({ filter: /workout-outbox\.js$/ }, () => ({ path: 'outbox', namespace: 'ws-test' }));
      bundle.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'ws-test' }));
      bundle.onLoad({ filter: /.*/, namespace: 'ws-test' }, (args) => {
        if (args.path === 'styles') return { contents: '' };
        if (args.path === 'data') return { contents: 'export const useData = (action, params) => globalThis.__ws.useData(action, params);' };
        if (args.path === 'ui') return {
          contents: `export const formatNumber = (n) => Number(n).toLocaleString('ru-RU');
            export const formatTime = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });`,
        };
        if (args.path === 'outbox') return {
          contents: `export const localWorkouts = async () => [];
            export const withLocalWeights = (block) => ({ ...block, withLocal: true });`,
        };
        return null;
      });
    },
  }],
});

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);
const { WatchSuggest, requestWatchLaunch, useWatchLaunch } = module.exports;

// Браузерное окружение, которого у node нет: события страницы и хранилище
globalThis.window = new EventTarget();
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node.children !== undefined) return textOf(node.children);
  return '';
}
const screen = (tree) => textOf(tree.toJSON()).replace(/\s+/g, ' ');
const buttons = (tree) => tree.root.findAllByType('button');
const button = (tree, re) => buttons(tree).find((b) => re.test(textOf(b.props.children)));

const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const suggestion = (extra = {}) => ({
  suggestion: {
    workout: { id: 'hk-1', type: 'strengthTraining', startedAt: at(8, 30), endedAt: at(9, 30), duration: 3600, kcal: 410.4 },
    block: { id: 'b-legs', title: 'Ноги и ягодицы' },
    month: 'Октябрь 2026',
    ...extra,
  },
});

function draw(answer, props = {}) {
  let current = answer;
  globalThis.__ws = { useData: () => current };
  const opened = [];
  let tree;
  act(() => { tree = renderer.create(React.createElement(WatchSuggest, { onOpen: (id) => opened.push(id), ...props })); });
  const update = (next) => { current = next; act(() => tree.update(React.createElement(WatchSuggest, { onOpen: (id) => opened.push(id), ...props }))); };
  return { tree, opened, update };
}

test('сервер ничего не предложил — карточки нет', () => {
  store.clear();
  const { tree } = draw({ data: { suggestion: null }, stale: false });
  assert.equal(tree.toJSON(), null);
  act(() => tree.unmount());
});

test('вчерашний ответ из кэша не показываем; свежий — карточка по макету', () => {
  store.clear();
  const { tree, update } = draw({ data: suggestion(), stale: true });
  assert.equal(tree.toJSON(), null, 'из кэша при запуске — ещё не знаем, актуально ли');
  update({ data: suggestion(), stale: false });
  const text = screen(tree);
  assert.match(text, /С часов · сегодня · в приложении не отмечено/);
  assert.match(text, /Силовая тренировка 08:30–09:30/);
  assert.match(text, /1 ч · 410 ккал/);
  assert.match(text, /Следующая по программе — «Ноги и ягодицы»\. Запишите подходы — тренер увидит, что вы делали, а веса на следующий раз подстроятся\./);
  assert.ok(button(tree, /Записать подходы к «Ноги и ягодицы»/));
  // Перечитывание после записи не мигает карточкой
  update({ data: suggestion(), stale: true });
  assert.match(screen(tree), /Ноги и ягодицы/);
  // Записали подходы — сервер больше не предлагает
  update({ data: { suggestion: null }, stale: false });
  assert.equal(tree.toJSON(), null);
  act(() => tree.unmount());
});

test('без тренера — без «тренер увидит»; функциональная — своим словом', () => {
  store.clear();
  const answer = suggestion();
  answer.suggestion.workout = { ...answer.suggestion.workout, type: 'functionalStrengthTraining', duration: 2880, kcal: null };
  const { tree } = draw({ data: answer, stale: false }, { trainer: false });
  const text = screen(tree);
  assert.match(text, /Функциональная тренировка 08:30–09:30/);
  assert.match(text, /48 мин/);
  assert.doesNotMatch(text, /ккал|тренер увидит/);
  assert.match(text, /Запишите подходы — веса на следующий раз подстроятся\./);
  act(() => tree.unmount());
});

test('«Не сейчас» прячет карточку этой тренировки часов — и после перезапуска', () => {
  store.clear();
  const first = draw({ data: suggestion(), stale: false });
  act(() => button(first.tree, /Не сейчас/).props.onClick());
  assert.equal(first.tree.toJSON(), null);
  act(() => first.tree.unmount());

  const again = draw({ data: suggestion(), stale: false });
  assert.equal(again.tree.toJSON(), null, 'та же тренировка часов — скрыта на устройстве');
  act(() => again.tree.unmount());

  const next = suggestion();
  next.suggestion.workout = { ...next.suggestion.workout, id: 'hk-2' };
  const other = draw({ data: next, stale: false });
  assert.match(screen(other.tree), /Записать подходы/, 'другая тренировка часов — снова спрашиваем');
  act(() => other.tree.unmount());
});

/** «Тренировки» глазами useWatchLaunch: программа, месяц и переход в журнал */
function plan({ data, month = '' }) {
  const opened = [];
  const months = [];
  function Plan(props) {
    useWatchLaunch({ enabled: true, data: props.data, month: props.month, setMonth: (m) => months.push(m), open: (v) => opened.push(v) });
    return null;
  }
  let tree;
  act(() => { tree = renderer.create(React.createElement(Plan, { data, month })); });
  return { tree, opened, months, Plan };
}
const program = {
  month: 'Октябрь 2026', members: [],
  blocks: [{ id: 'b-legs', title: 'Ноги и ягодицы', exercises: [] }, { id: 'b-back', title: 'Спина', exercises: [] }],
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

test('«Записать подходы» открывает «Тренировки», те — тренировку программы с началом по часам', async () => {
  store.clear();
  const card = draw({ data: suggestion(), stale: false });
  // «Тренировки» уже открыты и спрятаны — заберут просьбу по событию
  const p = plan({ data: program });
  act(() => button(card.tree, /Записать подходы/).props.onClick());
  await settle();
  assert.deepEqual(card.opened, ['plan']);
  assert.equal(p.opened.length, 1);
  assert.equal(p.opened[0].block.id, 'b-legs');
  assert.equal(p.opened[0].block.withLocal, true, '«Было» — с неотправленными занятиями, как у «Начать тренировку»');
  assert.equal(p.opened[0].month, 'Октябрь 2026');
  assert.equal(p.opened[0].startedAt, at(8, 30));
  // Просьба одна: второй раз не откроется
  act(() => p.tree.update(React.createElement(p.Plan, { data: { ...program }, month: '' })));
  await settle();
  assert.equal(p.opened.length, 1);
  act(() => { p.tree.unmount(); card.tree.unmount(); });
});

test('«Тренировки» ещё не открывались — забирают, когда загрузят программу; другой месяц — возврат к текущему', async () => {
  requestWatchLaunch({ blockId: 'b-back', title: 'Спина', startedAt: at(18, 0) });
  const p = plan({ data: { month: 'Сентябрь 2026', members: [], blocks: [{ id: 'old', title: 'Старая', exercises: [] }] }, month: 'Сентябрь 2026' });
  await settle();
  assert.deepEqual(p.months, [''], 'открыт сентябрь — вернуться к текущему');
  assert.equal(p.opened.length, 0);
  act(() => p.tree.update(React.createElement(p.Plan, { data: program, month: '' })));
  await settle();
  assert.equal(p.opened.length, 1);
  assert.equal(p.opened[0].block.id, 'b-back');
  act(() => p.tree.unmount());
});

test('просьба старше минуты не открывает занятие сама', async () => {
  const realNow = Date.now;
  requestWatchLaunch({ blockId: 'b-legs', title: 'Ноги и ягодицы', startedAt: at(8, 30) });
  Date.now = () => realNow() + 61000;
  try {
    const p = plan({ data: program });
    await settle();
    assert.equal(p.opened.length, 0);
    act(() => p.tree.unmount());
  } finally { Date.now = realNow; }
});

test('«Не сейчас» пишет id тренировки часов на устройство — новые впереди, не больше двадцати', () => {
  store.clear();
  store.set('fittrack.watchSuggest.hidden', JSON.stringify(Array.from({ length: 20 }, (_, i) => 'old-' + i)));
  const { tree } = draw({ data: suggestion(), stale: false });
  act(() => button(tree, /Не сейчас/).props.onClick());
  const saved = JSON.parse(store.get('fittrack.watchSuggest.hidden'));
  assert.equal(saved[0], 'hk-1');
  assert.equal(saved.length, 20);
  assert.equal(saved.includes('old-19'), false, 'самая старая вытеснена');
  act(() => tree.unmount());
  // Испорченное хранилище — как пустое
  store.set('fittrack.watchSuggest.hidden', '{oops');
  const again = draw({ data: suggestion(), stale: false });
  assert.match(screen(again.tree), /Записать подходы/);
  act(() => again.tree.unmount());
});

test('у старой тренировки id нет — блок по названию; нет и его при текущем месяце — просьба забыта', async () => {
  requestWatchLaunch({ blockId: '', title: 'Спина', startedAt: at(18, 0) });
  const p = plan({ data: program });
  await settle();
  assert.equal(p.opened.length, 1);
  assert.equal(p.opened[0].block.id, 'b-back');
  assert.deepEqual(p.months, []);
  act(() => p.tree.unmount());

  // Такой тренировки нет, а месяц открыт текущий — возвращаться некуда: просьба снимается, не висит
  requestWatchLaunch({ blockId: 'b-nope', title: 'Нет такой', startedAt: at(18, 0) });
  const q = plan({ data: program, month: '' });
  await settle();
  assert.equal(q.opened.length, 0);
  assert.deepEqual(q.months, []);
  act(() => q.tree.update(React.createElement(q.Plan, { data: { ...program, blocks: [...program.blocks, { id: 'b-nope', title: 'Нет такой', exercises: [] }] }, month: '' })));
  await settle();
  assert.equal(q.opened.length, 0, 'появившаяся позже тренировка занятие сама не откроет');
  act(() => q.tree.unmount());
});
