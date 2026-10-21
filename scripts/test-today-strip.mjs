/**
 * «Сегодня» на «Обзоре» (FT-646, план трёх разборов, 21.10.2026;
 * src/client/TodayStrip.jsx): три числа с подписью словами — тренировки
 * за неделю, шаги, калории. Дневник — только с «Плюсом»: без него запрос
 * diary.get не делается вовсе. Меньше двух плиток — полосы нет: одно
 * число «сегодня» не говорит.
 *
 * Настоящий компонент и права (rights.js); подменены загрузка данных и ui.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const output = await build({
  // Права — из той же сборки, что и полоса: setRights меняет то, что она читает
  stdin: {
    contents: "export { default } from './src/client/TodayStrip.jsx'; export { setRights } from './src/rights.js';",
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'strip-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /[\\/]useData\.js$/ }, () => ({ path: 'data', namespace: 'strip-test' }));
      bundle.onResolve({ filter: /[\\/]ui\.jsx$/ }, () => ({ path: 'ui', namespace: 'strip-test' }));
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'strip-test' }, (args) => (args.path === 'ui'
        ? { contents: "import React from 'react'; export const formatNumber = (n) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 }); export const Qty = ({ value, unit }) => <span>{value}{unit ? ' ' + unit : ''}</span>;", loader: 'jsx' }
        : { contents: 'export const useData = (action, params) => globalThis.__strip.useData(action, params);' }));
    },
  }],
});
const bundled = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), bundled, bundled.exports,
);
const { default: TodayStrip, setRights } = bundled.exports;

const textOf = (node) => (typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join(' ') : ((node && node.children) || []).map(textOf).join(' '));
const buttonsOf = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((n) => buttonsOf(n, out));
  else if (node && typeof node === 'object') {
    if (node.type === 'button') out.push(node);
    (node.children || []).forEach((child) => buttonsOf(child, out));
  }
  return out;
};

/** Полоса с ответами сервера; asked — какие действия спрашивали */
function draw({ awards = null, diary = null } = {}) {
  const asked = [];
  globalThis.__strip = {
    useData: (action, params) => {
      asked.push([action, params]);
      return { data: action === 'client.awards' ? awards : diary, loading: false, error: null, reload() {} };
    },
  };
  const opened = [];
  let tree;
  act(() => { tree = renderer.create(React.createElement(TodayStrip, { onOpen: (id) => opened.push(id) })); });
  const nodes = tree.root.findAllByType('button');
  return {
    tree, asked, opened,
    tiles: buttonsOf(tree.toJSON()).map((b, i) => ({ text: textOf(b).replace(/\s+/g, ' ').trim(), done: /is-done/.test(b.props.className), node: nodes[i] })),
    text: textOf(tree.toJSON()).replace(/\s+/g, ' '),
    close: () => act(() => tree.unmount()),
  };
}

const awards = (patch = {}) => ({ rings: [{ id: 'week', done: 2, target: 3 }, { id: 'month', done: 5, target: 12 }], steps: { today: 8450, goal: 10000 }, ...patch });
const diary = (patch = {}) => ({ day: '2026-10-21', totals: { kcal: 1234.6 }, targets: { kcal: 2000 }, complete: false, ...patch });

test('с «Плюсом» — три плитки: тренировки недели, шаги, ккал против цели; дневник спрошен за сегодня', () => {
  setRights(null);
  const s = draw({ awards: awards(), diary: diary() });
  assert.deepEqual(s.tiles.map((t) => t.text), ['2/3 тренировки за неделю', '8,5 тыс. шагов из 10 тыс.', '1 235 ккал из 2 000']);
  assert.deepEqual(s.tiles.map((t) => t.done), [false, false, false]);
  const diaryAsk = s.asked.find(([a]) => a === 'diary.get');
  assert.ok(diaryAsk, 'дневник спрошен');
  assert.match(diaryAsk[1].day, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(s.text, /^Сегодня /);
  s.close();
});

test('без «Плюса» — дневник не спрашиваем, плиток две', () => {
  setRights({ plus: false });
  const s = draw({ awards: awards(), diary: diary() });
  assert.deepEqual(s.tiles.map((t) => t.text), ['2/3 тренировки за неделю', '8,5 тыс. шагов из 10 тыс.']);
  assert.equal(s.asked.some(([a]) => a === 'diary.get'), false);
  s.close();
  setRights(null);
});

test('выполнено — плитка отмечена: цель недели, шаги по цели, завершённый день', () => {
  setRights(null);
  const s = draw({ awards: awards({ rings: [{ id: 'week', done: 3, target: 3 }], steps: { today: 10200, goal: 10000 } }), diary: diary({ complete: true, totals: { kcal: 1900 } }) });
  assert.deepEqual(s.tiles.map((t) => t.done), [true, true, true]);
  assert.equal(s.tiles[0].text, '3/3 тренировки за неделю');
  s.close();
});

test('без цели — число и подпись без «из»; перевыполнение без цели не «выполнено»', () => {
  setRights(null);
  const s = draw({ awards: awards({ rings: [{ id: 'week', done: 4, target: 0 }], steps: { today: 950, goal: 0 } }), diary: diary({ targets: {}, totals: { kcal: 0 } }) });
  assert.deepEqual(s.tiles.map((t) => t.text), ['4 тренировок за неделю', '950 шагов сегодня', '0 ккал съедено']);
  assert.deepEqual(s.tiles.map((t) => t.done), [false, false, false]);
  s.close();
});

test('меньше двух плиток — полосы нет: только шаги, только дневник, ничего', () => {
  setRights(null);
  let s = draw({ awards: { rings: [], steps: { today: 100, goal: 0 } }, diary: null });
  assert.equal(s.tree.toJSON(), null);
  s.close();
  s = draw({ awards: null, diary: diary() });
  assert.equal(s.tree.toJSON(), null);
  s.close();
  s = draw({ awards: null, diary: null });
  assert.equal(s.tree.toJSON(), null);
  s.close();
  // Шаги и дневник без кольца недели — уже две
  s = draw({ awards: { steps: { today: 100, goal: 0 } }, diary: diary() });
  assert.equal(s.tiles.length, 2);
  s.close();
});

test('касание открывает раздел, где живёт число', () => {
  setRights(null);
  const s = draw({ awards: awards(), diary: diary() });
  act(() => { s.tiles.forEach((t) => t.node.props.onClick()); });
  assert.deepEqual(s.opened, ['plan', 'progress', 'nutrition']);
  s.close();
});
