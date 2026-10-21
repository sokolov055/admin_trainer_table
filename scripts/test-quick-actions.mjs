/**
 * Быстрая запись из «+» нижнего меню (пункт 13 плана, 21.10.2026;
 * src/quick-actions.js).
 *
 * Лист «Что записать» переключает вкладку и оставляет ей запрос. Вкладки
 * ленивые: экран, где человек ещё не был, собирается уже после события, —
 * запрос должен дождаться его и прийти ровно один раз. Иначе «Начать
 * занятие» либо теряется, либо начинает второе занятие при следующем
 * показе вкладки.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { createQuickBus, requestQuick, useQuickRequest } from '../src/quick-actions.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Лист «Что записать» — настоящий QuickAdd.jsx; общий лист и загрузка
// данных подменены: здесь важно, какие плитки и что начнётся
const output = await build({
  // Права — из той же сборки, что и лист: setRights меняет то, что он читает
  stdin: {
    contents: "export { default } from './src/client/QuickAdd.jsx'; export { setRights } from './src/rights.js';",
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'quick-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /[\\/]ui\.jsx$/ }, () => ({ path: 'ui', namespace: 'quick-test' }));
      bundle.onResolve({ filter: /[\\/]useData\.js$/ }, () => ({ path: 'data', namespace: 'quick-test' }));
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'quick-test' }, (args) => (args.path === 'ui'
        ? { loader: 'jsx', contents: `import React from 'react'; export const Sheet = ({ title, children }) => <section aria-label={title}>{children}</section>;` }
        : { contents: 'export const useData = (action) => ({ data: globalThis.__quick[action] || null });' }));
    },
  }],
});
const bundled = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), bundled, bundled.exports,
);
const { default: QuickAdd, setRights } = bundled.exports;

// Подпись плитки без пояснения под ней («+250 мл», приём по часам)
const labelOf = (node) => {
  if (!node || typeof node !== 'object') return null;
  if (node.props && node.props.className === 'quick-tile__label') return textOf(node);
  for (const child of node.children || []) { const found = labelOf(child); if (found != null) return found; }
  return null;
};
const textOf = (node) => (typeof node === 'string' ? node : ((node && node.children) || []).map(textOf).join(''));
const buttonsOf = (node, out = []) => {
  if (node && typeof node === 'object') {
    if (node.type === 'button') out.push(node);
    (node.children || []).forEach((child) => buttonsOf(child, out));
  }
  return out;
};

const BLOCKS = [{ id: 'b1', title: 'Ноги и ягодицы', exercises: [] }, { id: 'b2', title: 'Спина', exercises: [] }];
const done = (id) => ({ id: 'done-' + id, status: 'completed', sourceBlockId: id, month: 'Октябрь 2026', updatedAt: '2026-10-20' });

async function sheet({ me = { name: 'Клиент' }, clientRow, preview = false, tab, sessions = [], blocks = BLOCKS } = {}) {
  globalThis.__quick = {
    'client.plan': { month: 'Октябрь 2026', blocks },
    'workout.list': { sessions },
  };
  const picks = [];
  let root;
  await act(async () => {
    root = renderer.create(React.createElement(QuickAdd, { me, clientRow, preview, tab, onClose: () => {}, onPick: (...a) => picks.push(a) }));
  });
  const shown = buttonsOf(root.toJSON());
  return {
    main: textOf(shown[0]),
    tiles: shown.slice(1).map(labelOf),
    off: shown.slice(1).filter((b) => b.props.disabled).map(labelOf),
    press: async (i) => {
      const button = root.root.findAllByType('button')[i];
      await act(async () => { button.props.onClick(); });
      return picks.at(-1);
    },
    close: () => act(async () => { root.unmount(); }),
  };
}

test('лист: сверху занятие по программе, ниже — только существующие действия', async () => {
  setRights(null);
  const s = await sheet();
  assert.match(s.main, /^Начать занятие/);
  assert.match(s.main, /Ноги и ягодицы · следующая по плану$/);
  assert.deepEqual(s.tiles, ['Еда', 'Вода', 'Вес', 'Замеры', 'Тренеру']);
  assert.deepEqual(s.off, []);
  assert.equal(s.tiles.includes('Самочувствие'), false, 'чего нет в приложении — нет и в листе');

  assert.deepEqual(await s.press(0), ['plan', 'workout', { title: 'Ноги и ягодицы' }]);
  assert.deepEqual(await s.press(1), ['nutrition', 'food']);
  assert.deepEqual(await s.press(2), ['nutrition', 'water']);
  assert.deepEqual(await s.press(3), ['progress', 'weight']);
  assert.deepEqual(await s.press(4), ['progress', 'measure']);
  assert.deepEqual(await s.press(5), ['plan', 'wish']);
  await s.close();
});

test('на «Питании» главное — еда, занятие встаёт на её место, остальные плитки где были', async () => {
  setRights(null);
  let s = await sheet({ tab: 'nutrition' });
  assert.match(s.main, /^Добавить еду/);
  assert.deepEqual(s.tiles, ['Занятие', 'Вода', 'Вес', 'Замеры', 'Тренеру']);
  assert.deepEqual(await s.press(0), ['nutrition', 'food']);
  assert.deepEqual(await s.press(1), ['plan', 'workout', { title: 'Ноги и ягодицы' }]);
  await s.close();

  // Идёт занятие — плитка зовёт вернуться к нему
  s = await sheet({ tab: 'nutrition', sessions: [{ id: 's1', status: 'active', title: 'Спина' }] });
  assert.equal(s.tiles[0], 'К занятию');
  assert.deepEqual(await s.press(1), ['plan', 'workout', { session: 's1' }]);
  await s.close();

  // Без «Плюса» еды нет — и на «Питании» главным остаётся занятие
  setRights({ plus: false });
  s = await sheet({ tab: 'nutrition' });
  assert.match(s.main, /^Начать занятие/);
  assert.deepEqual(s.tiles, ['Вес', 'Замеры', 'Тренеру']);
  await s.close();
  setRights(null);
});

test('без «Плюса» нет еды и воды, без тренера — плитки «Тренеру»', async () => {
  setRights({ plus: false });
  let s = await sheet();
  assert.deepEqual(s.tiles, ['Вес', 'Замеры', 'Тренеру']);
  await s.close();

  setRights(null);
  s = await sheet({ me: { name: 'Клиент', unlinked: true } });
  assert.deepEqual(s.tiles, ['Еда', 'Вода', 'Вес', 'Замеры']);
  await s.close();
});

test('тренер «глазами клиента»: набор как у клиента, но еда, вода и «Тренеру» не нажимаются', async () => {
  setRights(null);
  const s = await sheet({ clientRow: 7, preview: true, tab: 'nutrition' });
  assert.match(s.main, /^Начать занятие/, 'дневник в просмотре только для чтения — главной еда не становится');
  assert.deepEqual(s.tiles, ['Еда', 'Вода', 'Вес', 'Замеры', 'Тренеру']);
  assert.deepEqual(s.off, ['Еда', 'Вода', 'Тренеру']);
  await s.close();

  // Тренер в карточке клиента (не «глазами клиента») — без дневника и пожелания
  const card = await sheet({ clientRow: 7 });
  assert.deepEqual(card.tiles, ['Вес', 'Замеры']);
  await card.close();
});

test('главная кнопка решает, как «Тренировки»: идущее занятие, следующая, свободная', async () => {
  let s = await sheet({ sessions: [{ id: 's1', status: 'paused', title: 'Спина' }] });
  assert.match(s.main, /^Вернуться к занятию/);
  assert.match(s.main, /Спина · на паузе$/);
  assert.deepEqual(await s.press(0), ['plan', 'workout', { session: 's1' }]);
  await s.close();

  s = await sheet({ sessions: [done('b1')] });
  assert.match(s.main, /Спина · следующая по плану$/, 'проведённая уходит из очереди');
  await s.close();

  s = await sheet({ sessions: [done('b1'), done('b2')] });
  assert.match(s.main, /^Свободная тренировка/);
  assert.deepEqual(await s.press(0), ['plan', 'workout', { free: true }]);
  await s.close();
});

test('программы нет — сразу «Свободная тренировка»; идущее занятие — «идёт», а не «на паузе»', async () => {
  setRights(null);
  let s = await sheet({ blocks: [] });
  assert.match(s.main, /^Свободная тренировка/);
  assert.match(s.main, /Без программы: что сделаете, то и запишется$/);
  assert.deepEqual(await s.press(0), ['plan', 'workout', { free: true }]);
  await s.close();

  s = await sheet({ sessions: [{ id: 's2', status: 'active', title: 'Ноги и ягодицы' }] });
  assert.match(s.main, /^Вернуться к занятию/);
  assert.match(s.main, /Ноги и ягодицы · идёт$/);
  assert.deepEqual(await s.press(0), ['plan', 'workout', { session: 's2' }]);
  await s.close();

  // Программа ещё не загрузилась — без названия, что начать, решат «Тренировки»
  globalThis.__quick = { 'client.plan': null, 'workout.list': null };
  let root;
  await act(async () => { root = renderer.create(React.createElement(QuickAdd, { me: { name: 'Клиент' }, onClose: () => {}, onPick: () => {} })); });
  assert.equal(textOf(buttonsOf(root.toJSON())[0]), 'Начать занятие');
  await act(async () => { root.unmount(); });
});

function Screen({ kind = 'weight', onRequest, enabled = true }) {
  useQuickRequest(kind, onRequest, enabled);
  return null;
}

const mount = async (props) => {
  let root;
  await act(async () => { root = renderer.create(React.createElement(Screen, props)); });
  return root;
};

test('запрос до монтирования доходит до экрана один раз', async () => {
  requestQuick('weight', { from: 'plus' });
  const got = [];
  const onRequest = (payload) => { got.push(payload); };
  const root = await mount({ onRequest });
  assert.deepEqual(got, [{ from: 'plus' }]);

  // Перерисовки и повторный показ раздела действие не повторяют
  await act(async () => { root.update(React.createElement(Screen, { onRequest })); });
  await act(async () => { root.update(React.createElement(Screen, { onRequest })); });
  assert.equal(got.length, 1);
  await act(async () => { root.unmount(); });
});

test('экран ещё грузится — запрос ждёт и приходит после загрузки, один раз', async () => {
  requestQuick('workout', { title: 'Ноги' });
  const got = [];
  let ready = false;
  const onRequest = (payload) => {
    if (!ready) return false;
    got.push(payload);
    return true;
  };
  const root = await mount({ kind: 'workout', onRequest });
  assert.equal(got.length, 0, 'программа не загрузилась — занятие не начинаем');

  ready = true;
  await act(async () => { root.update(React.createElement(Screen, { kind: 'workout', onRequest })); });
  assert.deepEqual(got, [{ title: 'Ноги' }]);
  await act(async () => { root.update(React.createElement(Screen, { kind: 'workout', onRequest })); });
  assert.equal(got.length, 1);
  await act(async () => { root.unmount(); });
});

test('открытый экран получает запрос событием, сразу', async () => {
  const got = [];
  const root = await mount({ kind: 'measure', onRequest: (p) => { got.push(p); } });
  assert.equal(got.length, 0);
  await act(async () => { requestQuick('measure'); });
  assert.deepEqual(got, [{}]);
  await act(async () => { requestQuick('measure', { again: true }); });
  assert.deepEqual(got, [{}, { again: true }], 'второе нажатие — второй запрос');
  await act(async () => { root.unmount(); });
});

test('выключенный экран (семья, карточка у тренера) запрос не забирает', async () => {
  const family = [];
  const own = [];
  const off = await mount({ kind: 'food', enabled: false, onRequest: (p) => { family.push(p); } });
  await act(async () => { requestQuick('food'); });
  assert.equal(family.length, 0);

  const root = await mount({ kind: 'food', onRequest: (p) => { own.push(p); } });
  assert.equal(own.length, 1, 'запрос дождался своего экрана');
  assert.equal(family.length, 0);
  await act(async () => { off.unmount(); root.unmount(); });
});

test('виды не путаются: «Вода» не открывает «Еду»', () => {
  const bus = createQuickBus({ target: new EventTarget() });
  bus.request('water', { ml: 250 });
  const food = [];
  assert.equal(bus.deliver('food', (p) => food.push(p)), false);
  assert.equal(food.length, 0);
  const water = [];
  assert.equal(bus.deliver('water', (p) => water.push(p)), true);
  assert.deepEqual(water, [{ ml: 250 }]);
});

test('запрос старше минуты не исполняется', () => {
  let now = 1000;
  const bus = createQuickBus({ target: new EventTarget(), now: () => now });
  bus.request('workout', {});
  now += 61000;
  const got = [];
  assert.equal(bus.deliver('workout', () => got.push(1)), false);
  assert.equal(got.length, 0, 'вкладку открыли через полчаса — занятие само не начинается');
  assert.equal(bus.has('workout'), false);
});

test('пока экран не готов, новый запрос заменяет прежний, а не наоборот', () => {
  const bus = createQuickBus({ target: new EventTarget() });
  bus.request('workout', { title: 'Спина' });
  // Обработчик не готов, а за это время человек выбрал другое
  bus.deliver('workout', () => { bus.request('workout', { free: true }); return false; });
  const got = [];
  bus.deliver('workout', (p) => { got.push(p); });
  assert.deepEqual(got, [{ free: true }]);
});

test('событие будит только подписанных на свой вид', () => {
  const bus = createQuickBus({ target: new EventTarget() });
  const woke = [];
  const stop = bus.listen('weight', () => woke.push('weight'));
  bus.listen('food', () => woke.push('food'));
  bus.request('weight');
  stop();
  bus.request('weight');
  assert.deepEqual(woke, ['weight']);
});
