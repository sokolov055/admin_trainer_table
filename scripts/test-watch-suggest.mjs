/**
 * «Записать подходы?» на «Обзоре» (пункт 12 плана трёх разборов, 21.10.2026).
 *
 * Показывать ли карточку, решает сервер (health.workouts.suggest) — его
 * условия проверены в server/test/watch-suggest.test.js. Здесь — экран:
 * вчерашний ответ из кэша не показывается, «Не сейчас» прячет карточку для
 * этой тренировки часов, «Записать подходы» открывает «Тренировки» и
 * оставляет им ту же просьбу 'workout', что «+» нижнего меню
 * (quick-actions.js), — с началом по часам; какую тренировку программы
 * открыть, решает pickBlock (plan-model.js).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { pickBlock } from '../src/plan-model.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const output = await build({
  // Шина запросов — из той же сборки, что и карточка: одна очередь
  stdin: {
    contents: `export { default as WatchSuggest } from '../src/client/WatchSuggest.jsx';
      export { requestQuick, useQuickRequest } from '../src/quick-actions.js';`,
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
      bundle.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'ws-test' }));
      bundle.onLoad({ filter: /.*/, namespace: 'ws-test' }, (args) => {
        if (args.path === 'styles') return { contents: '' };
        if (args.path === 'data') return { contents: 'export const useData = (action, params) => globalThis.__ws.useData(action, params);' };
        if (args.path === 'ui') return {
          contents: `export const formatNumber = (n) => Number(n).toLocaleString('ru-RU');
            export const formatTime = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });`,
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
const { WatchSuggest, requestQuick, useQuickRequest } = module.exports;

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

/**
 * «Тренировки» глазами шины: обработчик 'workout', как в Plan (screens.jsx),
 * получает просьбу один раз, когда готов. Выбор тренировки — pickBlock.
 */
function plan({ data, month = '' }) {
  const got = [];
  const months = [];
  function Plan(props) {
    useQuickRequest('workout', (want) => {
      // Открыт другой месяц — вернуться к текущему и дождаться его программы
      if (props.month) { months.push(''); return false; }
      if (!props.data) return false;
      got.push(want);
      return true;
    });
    return null;
  }
  let tree;
  act(() => { tree = renderer.create(React.createElement(Plan, { data, month })); });
  const update = (next) => act(() => { tree.update(React.createElement(Plan, next)); });
  return { tree, got, months, update };
}
const program = {
  month: 'Октябрь 2026', members: [],
  blocks: [{ id: 'b-legs', title: 'Ноги и ягодицы', exercises: [] }, { id: 'b-back', title: 'Спина', exercises: [] }],
};

test('«Записать подходы» открывает «Тренировки», те — тренировку программы с началом по часам', () => {
  store.clear();
  const card = draw({ data: suggestion(), stale: false });
  // «Тренировки» уже открыты и спрятаны — заберут просьбу по событию
  const p = plan({ data: program });
  act(() => button(card.tree, /Записать подходы/).props.onClick());
  assert.deepEqual(card.opened, ['plan']);
  assert.deepEqual(p.got, [{ blockId: 'b-legs', title: 'Ноги и ягодицы', startedAt: at(8, 30) }]);
  // По просьбе с часов — та самая тренировка, даже проведённая (не в очереди)
  assert.equal(pickBlock(program.blocks, [], p.got[0]).id, 'b-legs');
  // Просьба одна: второй раз не откроется
  p.update({ data: { ...program }, month: '' });
  assert.equal(p.got.length, 1);
  act(() => { p.tree.unmount(); card.tree.unmount(); });
});

test('«Тренировки» ещё не открывались — забирают, когда загрузят программу; другой месяц — возврат к текущему', () => {
  act(() => { requestQuick('workout', { blockId: 'b-back', title: 'Спина', startedAt: at(18, 0) }); });
  const p = plan({ data: null, month: 'Сентябрь 2026' });
  assert.deepEqual(p.months, [''], 'открыт сентябрь — вернуться к текущему');
  assert.equal(p.got.length, 0);
  p.update({ data: null, month: '' });
  assert.equal(p.got.length, 0, 'программа ещё грузится — просьба ждёт');
  p.update({ data: program, month: '' });
  assert.equal(p.got.length, 1);
  assert.equal(pickBlock(program.blocks, [], p.got[0]).id, 'b-back');
  p.update({ data: program, month: '' });
  assert.equal(p.got.length, 1);
  act(() => p.tree.unmount());
});

test('просьба старше минуты не открывает занятие сама', () => {
  const realNow = Date.now;
  act(() => { requestQuick('workout', { blockId: 'b-legs', title: 'Ноги и ягодицы', startedAt: at(8, 30) }); });
  Date.now = () => realNow() + 61000;
  try {
    const p = plan({ data: program });
    assert.equal(p.got.length, 0);
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

test('pickBlock: с часов — по id среди всех, у старой — по названию; из «+» — из очереди', () => {
  const queue = [program.blocks[1]]; // «Ноги» уже проведены
  assert.equal(pickBlock(program.blocks, queue, { blockId: 'b-legs', title: 'Ноги и ягодицы', startedAt: at(8, 30) }).id, 'b-legs', 'проведённая — тоже: подходы дописывают');
  assert.equal(pickBlock(program.blocks, queue, { blockId: '', title: 'Спина', startedAt: at(18, 0) }).id, 'b-back', 'у старой тренировки id нет — по названию');
  // Такой тренировки нет — просьба снимается, а не берётся первая попавшаяся
  assert.equal(pickBlock(program.blocks, queue, { blockId: 'b-nope', title: 'Нет такой', startedAt: at(18, 0) }), null);
  assert.equal(pickBlock(program.blocks, queue, { blockId: '', title: 'Нет такой', startedAt: at(18, 0) }), null);
  // «Начать занятие» из «+» — как было: названная из очереди, иначе первая в ней, без программы — свободная
  assert.equal(pickBlock(program.blocks, queue, { title: 'Спина' }).id, 'b-back');
  assert.equal(pickBlock(program.blocks, queue, { title: 'Ноги и ягодицы' }).id, 'b-back', 'проведённая не начинается заново — первая в очереди');
  assert.equal(pickBlock(program.blocks, queue, {}).id, 'b-back');
  assert.equal(pickBlock(program.blocks, [], { title: 'Спина' }), null);
  assert.equal(pickBlock(program.blocks, queue, { free: true }), null);
  assert.equal(pickBlock(undefined, undefined, { blockId: 'b-legs' }), null);
});
