import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * Кому доступен подбор рациона.
 *
 * Три правила, и они не про удобство, а про то, чьи данные человек видит.
 * Продукты и выбранные блюда лежат в хранилище УСТРОЙСТВА, а не в таблице,
 * поэтому открытый не тем человеком раздел показывает чужую еду.
 *
 * Тест написан после того, как это уже сломалось. Режим «глазами клиента»
 * менял общий флаг `byTrainer`, и вместе с ним у тренера включилась кнопка
 * «Собрать рацион»: нажатие открывало день, собранный из блюд, отмеченных
 * на устройстве тренера, и показывало его как рацион клиента. Ни один тест
 * этого не заметил — `test:preview` подменяет экраны заглушками.
 */

const output = await build({
  entryPoints: ['src/client/screens.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'ration-access-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /useData\.js$/ }, () => ({ path: 'useData', namespace: 'stub' }));
      bundle.onResolve({ filter: /\/api\.js$/ }, () => ({ path: 'api', namespace: 'stub' }));
      bundle.onResolve({ filter: /telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'stub' }));
      bundle.onResolve({ filter: /charts\.jsx$/ }, () => ({ path: 'charts', namespace: 'stub' }));
      bundle.onResolve({ filter: /Workout\.jsx$/ }, () => ({ path: 'workout', namespace: 'stub' }));
      // Экран рациона подменён намеренно: проверяется не он, а то, открылся
      // он вообще или нет.
      bundle.onResolve({ filter: /Ration\.jsx$/ }, () => ({ path: 'ration', namespace: 'stub' }));
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
        if (args.path === 'useData') return {
          contents: `export const useData = () => globalThis.__nutritionData;`,
        };
        if (args.path === 'api') return {
          contents: `export const apiMutate = async () => ({}); export const apiPublic = apiMutate; export const api = apiMutate; export const apiBatch = apiMutate; export const logout = () => {}; export const apiStale = () => ({ data: null, promise: Promise.resolve() });`,
        };
        if (args.path === 'telegram') return { contents: `export const haptic = () => {}; export const environmentInfo = () => ({}); export const getInitData = () => ''; export const diagnoseMissingInitData = () => '';` };
        if (args.path === 'charts') return {
          loader: 'jsx',
          contents: `import React from 'react'; const C = () => <div />; export const LineChart = C; export const Sparkline = C; export const BarChart = C; export default C;`,
        };
        if (args.path === 'workout') return {
          loader: 'jsx',
          contents: `import React from 'react'; export default () => <div>workout</div>;`,
        };
        return {
          loader: 'jsx',
          contents: `import React from 'react'; export default () => <div>ration-screen</div>;`,
        };
      });
    },
  }],
});

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);
const { Nutrition } = module.exports;

globalThis.__nutritionData = {
  loading: false,
  error: null,
  reload: () => {},
  data: {
    configured: true,
    pace: 'even',
    plans: [],
    filledAt: '2026-09-20T10:00:00.000Z',
    targets: { kcal: 2000, protein: 140, fat: 65, carbs: 210 },
    survey: {
      age: 34, weight: 76, height: 175, sex: 'f',
      activityLabel: 'Средняя', goalLabel: 'Поддержание формы',
    },
    options: {
      activity: [{ value: 'medium', label: 'Средняя' }],
      goal: [{ value: 'keep', label: 'Поддержание формы' }],
    },
  },
};

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const render = async (props) => {
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Nutrition, props)); });
  return tree;
};
const whole = (tree) => tree.root.children.map(text).join(' ');
const button = (tree, label) => tree.root.findAllByType('button').find((node) => text(node) === label);

test('клиент открывает подбор рациона', async () => {
  const tree = await render({});
  assert.ok(whole(tree).includes('Что приготовить из того, что дома'));
  assert.ok(button(tree, 'Собрать рацион'), 'кнопки нет');

  await act(async () => button(tree, 'Собрать рацион').props.onClick());
  assert.ok(whole(tree).includes('ration-screen'), 'экран не открылся');
  tree.unmount();
});

test('в карточке клиента у тренера — не рацион клиента, а проба', async () => {
  const tree = await render({ clientRow: 17 });
  assert.ok(!whole(tree).includes('Что приготовить из того, что дома'));
  assert.equal(button(tree, 'Собрать рацион'), undefined, 'рацион клиента с устройства тренера');
  assert.ok(button(tree, 'Попробовать — пробный режим'), 'пробы нет');
  tree.unmount();
});

test('в режиме «глазами клиента» раздел виден, открывается только проба', async () => {
  const tree = await render({ clientRow: 17, clientView: true });
  const shown = whole(tree);

  // Виден: тренер должен знать, что у клиента здесь есть раздел.
  assert.ok(shown.includes('Что приготовить из того, что дома'));
  // Клиентская кнопка не открывается у тренера: за ней стояли бы продукты
  // с устройства тренера под именем клиента. Вместо неё — проба.
  assert.equal(button(tree, 'Собрать рацион'), undefined, 'кнопка вернулась');
  assert.ok(!shown.includes('ration-screen'));

  await act(async () => button(tree, 'Попробовать — пробный режим').props.onClick());
  assert.ok(whole(tree).includes('ration-screen'), 'проба не открылась');
  tree.unmount();
});
