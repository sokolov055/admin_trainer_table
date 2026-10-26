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
      bundle.onResolve({ filter: /\/Diary\.jsx$/ }, () => ({ path: 'diary', namespace: 'stub' }));
      bundle.onResolve({ filter: /RationSummary\.jsx$/ }, () => ({ path: 'ration-summary', namespace: 'stub' }));
      // Права по тарифу — из globalThis.__rights; правила hasPlus/isPro
      // проверяются отдельно, на настоящем rights.js (внизу)
      bundle.onResolve({ filter: /\/rights\.js$/ }, () => ({ path: 'rights', namespace: 'stub' }));
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
        if (args.path === 'useData') return {
          contents: `export const useData = () => globalThis.__nutritionData;`,
        };
        if (args.path === 'api') return {
          contents: `export const apiMutate = async () => ({}); export const apiWait=()=>new Promise(()=>{}); export const apiPublic = apiMutate; export const apiFresh = async () => ({ data: {}, offline: false, at: 0 }); export const apiStoredAt = () => 0; export const apiPrimary = apiMutate; export const api = apiMutate; export const apiBatch = apiMutate; export const logout = () => {}; export const apiStale = () => ({ data: null, promise: Promise.resolve() }); export const onMutated = () => () => {};`,
        };
        if (args.path === 'telegram') return { contents: `export const haptic = () => {}; export const environmentInfo = () => ({}); export const getInitData = () => ''; export const diagnoseMissingInitData = () => '';` };
        if (args.path === 'charts') return {
          loader: 'jsx',
          contents: `import React from 'react'; const C = () => <div />; export const LineChart = C; export const Sparkline = C; export const BarChart = C; export default C;`,
        };
        if (args.path === 'ration-summary') return {
          loader: 'jsx',
          contents: `import React from 'react'; export default () => <div>ration-summary</div>;`,
        };
        if (args.path === 'rights') return {
          contents: `export const useRights = () => globalThis.__rights || null;
            export const hasPlus = (r) => !r || r.plus !== false;
            export const isPro = (r) => !r || r.pro !== false;
            export const can = (k, r = globalThis.__rights) => !r || (r.features && k in r.features ? r.features[k] !== false : r.plus !== false && r.pro !== false);
            export const gate = (k, r = globalThis.__rights) => can(k, r) ? 'open' : r && r.sellDigital ? 'plus' : 'hidden';
            export const setRights = (r) => { globalThis.__rights = r; };`,
        };
        if (args.path === 'workout') return {
          loader: 'jsx',
          contents: `import React from 'react'; export default () => <div>workout</div>;`,
        };
        if (args.path === 'diary') return { loader: 'jsx', contents: `import React from 'react'; export default (p) => <div>diary-screen<button onClick={() => p.onTabChange?.('settings')}>Норма и анкета</button><button onClick={() => p.onTabChange?.('learn')}>Подсказки</button>{p.onPlan && <button onClick={() => p.onPlan({ targets:p.targets, day:'2026-10-18', totals:{} })}>План меню</button>}</div>;` };
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
  assert.ok(!whole(tree).includes('Что приготовить из того, что дома'));
  assert.ok(button(tree, 'План меню'), 'кнопки нет');

  await act(async () => button(tree, 'План меню').props.onClick());
  assert.ok(whole(tree).includes('ration-screen'), 'экран не открылся');
  tree.unmount();
});

test('в карточке клиента у тренера — не рацион клиента, а проба', async () => {
  const tree = await render({ clientRow: 17 });
  await act(async () => button(tree, 'Норма и анкета').props.onClick());
  assert.ok(!whole(tree).includes('Что приготовить из того, что дома'));
  assert.equal(button(tree, 'Собрать рацион'), undefined, 'рацион клиента с устройства тренера');
  assert.ok(button(tree, 'Попробовать — пробный режим'), 'пробы нет');
  tree.unmount();
});

test('в режиме «глазами клиента» раздел виден, открывается только проба', async () => {
  const tree = await render({ clientRow: 17, clientView: true });
  await act(async () => button(tree, 'Норма и анкета').props.onClick());
  const shown = whole(tree);

  // Виден: тренер должен знать, что у клиента здесь есть раздел.
  assert.ok(!shown.includes('Что приготовить из того, что дома'));
  // Клиентская кнопка не открывается у тренера: за ней стояли бы продукты
  // с устройства тренера под именем клиента. Вместо неё — проба.
  assert.equal(button(tree, 'Собрать рацион'), undefined, 'кнопка вернулась');
  assert.ok(!shown.includes('ration-screen'));

  await act(async () => button(tree, 'Попробовать — пробный режим').props.onClick());
  assert.ok(whole(tree).includes('ration-screen'), 'проба не открылась');
  tree.unmount();
});

/* --------------------------------------------------------------------------
 * Тарифы (FT-545): рацион — в «Плюсе» клиента и на платной ступени тренера.
 * Сервер отказывает сам; экран не должен вести к отказу.
 * -------------------------------------------------------------------------- */

test('FT-768: без «Плюса» на iPhone раздела рациона нет совсем, на сайте — отметка «Плюс»', async () => {
  // iPhone: ни замка, ни кнопки пробного — пробный включается сам
  globalThis.__rights = { on: true, plus: false, canTrial: true, trialDays: 14, sellDigital: false };
  const tree = await render({});
  const shown = whole(tree);
  assert.equal(button(tree, 'Собрать рацион'), undefined, 'кнопка ведёт к отказу API');
  assert.ok(!shown.includes('Что приготовить из того, что дома'), 'закрытое на iPhone не показываем');
  assert.equal(tree.root.findAllByType('button').filter((b) => /Попробовать|Плюс/.test(text(b))).length, 0);
  assert.ok(!/₽|(^|[^а-яё])купить|оплат|подписк/i.test(shown), 'на iPhone цена и оплата запрещены (3.1.1)');
  tree.unmount();

  // Сайт и Android: раздел виден с отметкой, касание — лист «Плюса»
  globalThis.__rights = { on: true, plus: false, canTrial: false, trialDays: 14, sellDigital: true };
  const web = await render({});
  assert.ok(whole(web).includes('Что приготовить из того, что дома'));
  assert.equal(button(web, 'Собрать рацион'), undefined);
  assert.ok(web.root.findAllByType('button').some((b) => /Подбор рациона — в «Плюсе»/.test(text(b))));
  web.unmount();
  globalThis.__rights = null;
});

test('FT-767: без «Плюса» базовый дневник открыт, рациона из холодильника нет', async () => {
  globalThis.__rights = { on: true, plus: false, canTrial: true, trialDays: 14, features: { diary: true, ration: false } };
  const tree = await render({});
  assert.ok(whole(tree).includes('diary-screen'), 'базовый дневник бесплатный');
  assert.equal(button(tree, 'План меню'), undefined, 'рацион — в «Плюсе»');
  assert.equal(button(tree, 'Собрать рацион'), undefined, 'кнопка ведёт к отказу API');
  tree.unmount();

  globalThis.__rights = { on: true, plus: true, features: { diary: true, ration: true } };
  const plus = await render({});
  assert.ok(button(plus, 'План меню'));
  plus.unmount();
  globalThis.__rights = null;
});

test('с «Плюсом» и без прав от сервера — как было', async () => {
  for (const rights of [{ on: true, plus: true }, null]) {
    globalThis.__rights = rights;
    const tree = await render({});
    assert.ok(button(tree, 'План меню'), JSON.stringify(rights));
    tree.unmount();
  }
});

test('тренер на «Старте» не видит рацион клиента, проба остаётся', async () => {
  globalThis.__rights = { on: true, pro: false };
  const tree = await render({ clientRow: 17 });
  assert.ok(!whole(tree).includes('diary-screen'), 'сводка ведёт к отказу API');
  assert.ok(button(tree, 'Попробовать — пробный режим'));
  tree.unmount();

  globalThis.__rights = { on: true, pro: true };
  const paid = await render({ clientRow: 17 });
  assert.ok(whole(paid).includes('diary-screen'));
  paid.unmount();
  globalThis.__rights = null;
});

test('rights.js: нет прав — открыто; платформа для сервера', async () => {
  const r = await import('../src/rights.js');
  assert.equal(r.hasPlus(null), true);
  assert.equal(r.hasPlus({ plus: false }), false);
  assert.equal(r.isPro({ pro: false }), false);
  assert.equal(r.isPro({}), true);
  assert.equal(r.appPlatform(null), 'web');
  assert.equal(r.appPlatform({ isNativeApp: () => false, iosApp: () => false }), 'web');
  assert.equal(r.appPlatform({ isNativeApp: () => true, iosApp: () => true }), 'ios');
  assert.equal(r.appPlatform({ isNativeApp: () => true, iosApp: () => false }), 'android');
  // FT-767: функции по ключам; закрытое на iPhone не показывается совсем
  assert.equal(r.can('foodPhoto', null), true);
  assert.equal(r.can('foodPhoto', { plus: true, features: { foodPhoto: false } }), false);
  assert.equal(r.can('diary', { plus: false }), false, 'старый сервер без списка — по «Плюсу»');
  assert.equal(r.gate('foodPhoto', { features: { foodPhoto: true } }), 'open');
  assert.equal(r.gate('foodPhoto', { features: { foodPhoto: false }, sellDigital: true }), 'plus');
  assert.equal(r.gate('foodPhoto', { features: { foodPhoto: false }, sellDigital: false }), 'hidden');
});


test('подсказки не содержат норму, анкету и подбор; анкета доступна отдельно', async () => {
  globalThis.__rights = { on: true, plus: true };
  const tree = await render({});
  await act(async () => button(tree, 'Подсказки').props.onClick());
  assert.ok(!whole(tree).includes('Расчёт по анкете'));
  assert.equal(button(tree, 'Заполнить заново'), undefined);
  assert.equal(button(tree, 'Собрать рацион'), undefined);
  await act(async () => button(tree, 'Норма и анкета').props.onClick());
  assert.ok(whole(tree).includes('Расчёт по анкете'));
  assert.ok(button(tree, 'Заполнить заново'));
  tree.unmount();
  globalThis.__rights = null;
});
