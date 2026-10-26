import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * Пробный «Плюс» сам (FT-768): подарок после анкеты, «Пробный закончился»,
 * строка в «Моих данных» и переключатель рассылки.
 *
 * Главное правило — App Store 3.1.1/3.1.3: на iPhone (sellDigital=false) ни
 * цены, ни «купить», ни ссылки на оплату. Галочка рекламы не стоит заранее
 * и уходит на сервер только отмеченной; экраны — по одному разу.
 */

const calls = [];
const output = await build({
  // plus.jsx и тот же rights.js, что внутри него: права ставим настоящим setRights
  stdin: { contents: "export * from './src/plus.jsx'; export * as __rights from './src/rights.js';", resolveDir: process.cwd(), loader: 'jsx' },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'plus-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /\/api\.js$/ }, () => ({ path: 'api', namespace: 'stub' }));
      bundle.onResolve({ filter: /telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'stub' }));
      bundle.onResolve({ filter: /\/ui\.jsx$/ }, () => ({ path: 'ui', namespace: 'stub' }));
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
        if (args.path === 'api') return {
          contents: `export const apiMutate = async (action, params) => { globalThis.__calls.push([action, params]); return { rights: { ...globalThis.__nextRights } }; };`,
        };
        if (args.path === 'telegram') return { contents: `export const haptic = () => {};` };
        return {
          loader: 'jsx',
          contents: `import React from 'react';
            export const Sheet = ({ title, onClose, children }) => <div data-sheet={title}><button onClick={onClose}>Закрыть</button>{children}</div>;
            export const Note = ({ children }) => <p>{children}</p>;
            export const Switch = ({ checked, onChange, children }) => <label><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}</label>;`,
        };
      });
    },
  }],
});

globalThis.__calls = calls;
const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);
const { PlusMoments, PlusStatus, MarketingSwitch } = module.exports;
// rights.js настоящий — тот же модуль внутри сборки
const rights = module.exports.__rights;

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const whole = (tree) => (tree.toJSON() ? tree.root.children.map(text).join(' ') : '');
const button = (tree, label) => tree.root.findAllByType('button').find((node) => text(node) === label);
const render = async (el) => {
  let tree;
  await act(async () => { tree = renderer.create(el); });
  return tree;
};
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const NO_SALE = /₽|купить|оплат|подписк|продлить|fitness100/i;

test('подарок: один раз, без цены; галочка рекламы не стоит и уходит только отмеченной', async () => {
  const base = { on: true, plus: true, plusSource: 'trial', plusUntil: '2026-11-15', trialDays: 14, trialGift: true, marketing: false, sellDigital: false, plusPrice: 490 };
  rights.setRights(base);
  globalThis.__nextRights = { ...base, trialGift: false };
  calls.length = 0;
  const tree = await render(React.createElement(PlusMoments, { enabled: true }));
  const shown = whole(tree);
  assert.match(shown, /Вам открыт «Плюс» на 14 дней/);
  assert.match(shown, /15 ноября/);
  assert.ok(!NO_SALE.test(shown.replace(/о «Плюсе» и предложениях/, '')), 'на iPhone — без цены и оплаты');
  const box = tree.root.findAllByType('input')[0];
  assert.equal(box.props.checked, false, 'согласие на рекламу не отмечено заранее');
  await act(async () => button(tree, 'Начать').props.onClick());
  await flush();
  assert.deepEqual(calls.map((c) => c[0]), ['client.plus.seen'], 'без галочки — только отметка «увидел»');
  assert.equal(whole(tree), '', 'второй раз не показывается');
  tree.unmount();

  // С галочкой — сначала согласие, потом отметка
  rights.setRights(base);
  calls.length = 0;
  const again = await render(React.createElement(PlusMoments, { enabled: true }));
  await act(async () => again.root.findAllByType('input')[0].props.onChange({ target: { checked: true } }));
  await act(async () => button(again, 'Начать').props.onClick());
  await flush();
  assert.deepEqual(calls.map((c) => c[0]), ['client.marketing.set', 'client.plus.seen']);
  assert.deepEqual(calls[0][1], { on: true });
  again.unmount();

  // Чужой кабинет или анкета на экране — подарка нет
  rights.setRights(base);
  const off = await render(React.createElement(PlusMoments, { enabled: false }));
  assert.equal(whole(off), '');
  off.unmount();
});

test('«Пробный закончился»: на iPhone справка без цены, на сайте — цена и лист', async () => {
  const ended = { on: true, plus: false, trialEnded: true, trialDays: 14, plusPrice: 490, sellDigital: false };
  rights.setRights(ended);
  globalThis.__nextRights = { ...ended, trialEnded: false };
  const ios = await render(React.createElement(PlusMoments, { enabled: true }));
  assert.match(whole(ios), /Пробный период «Плюса» закончился/);
  assert.ok(!NO_SALE.test(whole(ios)));
  assert.equal(button(ios, 'Подробнее о «Плюсе»'), undefined);
  ios.unmount();

  rights.setRights({ ...ended, sellDigital: true });
  const web = await render(React.createElement(PlusMoments, { enabled: true }));
  assert.match(whole(web), /490 ₽/);
  assert.ok(button(web, 'Подробнее о «Плюсе»'));
  web.unmount();
});

test('«Плюс» в «Моих данных»: срок пробного; на iPhone без цены; без тарифов — ничего', async () => {
  rights.setRights({ on: true, plus: true, plusSource: 'trial', plusUntil: '2026-11-15', sellDigital: false });
  const trial = await render(React.createElement(PlusStatus));
  assert.match(whole(trial), /пробный, до 15 ноября/);
  trial.unmount();

  rights.setRights({ on: true, plus: false, plusPrice: 490, sellDigital: false });
  const ios = await render(React.createElement(PlusStatus));
  assert.match(whole(ios), /не подключён/);
  assert.ok(!NO_SALE.test(whole(ios)));
  assert.equal(ios.root.findAllByType('button').length, 0, 'на iPhone строка не ведёт к покупке');
  ios.unmount();

  rights.setRights({ on: true, plus: false, plusPrice: 490, sellDigital: true });
  const web = await render(React.createElement(PlusStatus));
  assert.match(whole(web), /490 ₽ в месяц/);
  web.unmount();

  rights.setRights({ on: false, plus: true });
  const off = await render(React.createElement(PlusStatus));
  assert.equal(whole(off), '');
  off.unmount();
});

test('переключатель рассылки: отозвать так же, как дать', async () => {
  rights.setRights({ on: true, marketing: true });
  globalThis.__nextRights = { on: true, marketing: false };
  calls.length = 0;
  const tree = await render(React.createElement(MarketingSwitch));
  const input = tree.root.findAllByType('input')[0];
  assert.equal(input.props.checked, true);
  await act(async () => input.props.onChange({ target: { checked: false } }));
  assert.deepEqual(calls[0], ['client.marketing.set', { on: false }]);
  assert.equal(tree.root.findAllByType('input')[0].props.checked, false);
  tree.unmount();
  rights.setRights(null);
});
