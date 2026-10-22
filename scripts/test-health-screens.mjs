/**
 * Экраны «Здоровья» (FT-708): экран при входе — галочка согласия не
 * отмечена заранее, без неё «Подключить» спрашивает только шаги и
 * тренировки, «Не сейчас» записывает отказ; на старой сборке галочки нет.
 * Блок в «Прогрессе» — пустых показателей нет, данных нет — блока нет.
 * «Потрачено» в «Питании» — только когда есть.
 *
 * Настоящие HealthConnect.jsx, HealthDaily.jsx и health-model.js; подменены
 * телефон (native-steps), сеть, ui и useData.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = { addEventListener() {}, removeEventListener() {}, location: { search: '' } };
globalThis.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
globalThis.__hs = { calls: [], saved: [], data: null, iphone: true };

const stubs = {
  ui: `import React from 'react';
    export const Panel = ({ children }) => <div>{children}</div>;
    export const Section = ({ title, children }) => <section><h2>{title}</h2>{children}</section>;
    export const Sheet = ({ title, children }) => <section role="dialog"><h2>{title}</h2>{children}</section>;
    export const formatNumber = (n, d) => (d ? Number(n).toFixed(d).replace('.', ',') : String(Math.round(n)));`,
  steps: `export const connectHealth = async (o) => { globalThis.__hs.calls.push(o); return { ok: true, steps: 'ok', workouts: 'ok', daily: o.consent ? 'ok' : 'off', scope: o.consent ? 'full' : 'basic' }; };
    export const deviceHealthScope = async () => 'full'; export const healthAskNeeded = async () => 'full';
    export const saveHealthAccess = async (...a) => { globalThis.__hs.saved.push(a); return {}; };
    export const markHealthFullAsked = () => {}; export const healthDailyOn = () => false; export const disconnectHealth = () => {};
    export const openHealthSettings = async () => {}; export const healthHub = () => '«Здоровье»'; export const onIphone = () => globalThis.__hs.iphone;
    export const onHuawei = () => false; export const reportDevice = () => {}; export const HEALTH_SENT = 'x';`,
  sync: 'export const ensureBackgroundSync = async () => {};',
  bridge: 'export const isNativeApp = () => true;',
  api: 'export const apiPublic = async () => ({}); export const apiMutate = async () => ({});',
  useData: 'export const useData = () => ({ data: globalThis.__hs.data, loading: false, error: null, reload() {} });',
};
const output = await build({
  stdin: { contents: "export * from './src/client/HealthConnect.jsx'; export { default as HealthDaily, SpentKcal } from './src/client/HealthDaily.jsx';", resolveDir: process.cwd(), loader: 'js' },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], logLevel: 'silent',
  plugins: [{
    name: 'health-stubs',
    setup(b) {
      const map = { 'ui.jsx': 'ui', 'native-steps.js': 'steps', 'native-sync.js': 'sync', 'native-bridge.js': 'bridge', 'api.js': 'api', 'useData.js': 'useData' };
      b.onResolve({ filter: /[\\/](ui\.jsx|native-steps\.js|native-sync\.js|native-bridge\.js|api\.js|useData\.js)$/ }, (a) => ({ path: map[a.path.split(/[\\/]/).at(-1)], namespace: 'hs' }));
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      b.onLoad({ filter: /.*/, namespace: 'hs' }, (a) => ({ contents: stubs[a.path], loader: 'jsx' }));
    },
  }],
});
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { HealthConnectScreen, HealthDaily, SpentKcal } = mod.exports;

const textOf = (n) => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join(' ') : ((n && n.children) || []).map(textOf).join(' '));
const screen = (tree) => textOf(tree.toJSON()).replace(/\s+/g, ' ').trim();
async function draw(el) {
  let tree;
  await act(async () => { tree = renderer.create(el); });
  return tree;
}
const button = (tree, text) => tree.root.findAll((n) => n.type === 'button' && textOf(n.children).includes(text))[0];
const localKey = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

test('экран при входе: галочка не отмечена, без неё — только шаги и тренировки; с ней — всё', async () => {
  __hs.calls = [];
  let done = 0;
  const tree = await draw(React.createElement(HealthConnectScreen, { scope: 'full', onDone: () => { done += 1; } }));
  const box = tree.root.find((n) => n.type === 'input' && n.props.type === 'checkbox');
  assert.equal(box.props.checked, false, 'согласие не отмечено заранее');
  assert.match(screen(tree), /Сон.*Пульс покоя и ВСР.*Вес и % жира/);
  assert.ok(tree.root.find((n) => n.type === 'a').props.href.endsWith('/health-consent.html'));
  assert.ok(button(tree, 'Подключить шаги и тренировки'), 'без галочки кнопка говорит, что подключит');
  await act(async () => { await button(tree, 'Подключить шаги и тренировки').props.onClick(); });
  assert.deepEqual(__hs.calls.at(-1), { consent: false });
  assert.match(screen(tree), /Готово/);
  await act(async () => { button(tree, 'Продолжить').props.onClick(); });
  assert.equal(done, 1);

  const again = await draw(React.createElement(HealthConnectScreen, { scope: 'full', onDone() {} }));
  await act(async () => { again.root.find((n) => n.type === 'input').props.onChange({ target: { checked: true } }); });
  await act(async () => { await button(again, 'Подключить').props.onClick(); });
  assert.deepEqual(__hs.calls.at(-1), { consent: true });
  assert.match(screen(again), /Сон, пульс и вес/);
});

test('«Не сейчас» (Android) — отказ на сервер, больше не спрашиваем; на старой сборке галочки нет', async () => {
  __hs.saved = [];
  __hs.iphone = false;
  let done = 0;
  const tree = await draw(React.createElement(HealthConnectScreen, { scope: 'basic', onDone: () => { done += 1; } }));
  assert.equal(tree.root.findAll((n) => n.type === 'input').length, 0, 'шаги и тренировки покрывает общее согласие');
  assert.doesNotMatch(screen(tree), /Пульс покоя/);
  await act(async () => { await button(tree, 'Не сейчас').props.onClick(); });
  assert.deepEqual(__hs.saved, [['declined', 'basic']]);
  assert.equal(done, 1);
  __hs.iphone = true;
});

test('iPhone: экран без «Не сейчас» (5.1.1(iv)) — одна кнопка, отказ в окне «Здоровья»', async () => {
  const tree = await draw(React.createElement(HealthConnectScreen, { scope: 'full', onDone: () => {} }));
  assert.doesNotMatch(screen(tree), /Не сейчас/);
});

test('блок «Здоровье»: показываем только то, что есть; данных нет — блока нет', async () => {
  __hs.data = { days: [
    { member: '', date: localKey(0), sleepMin: 445, sleepDeepMin: 70, sleepRemMin: 95, sleepLightMin: 280, sleepAwakeMin: 15, restingHr: 57, activeKcal: 380 },
    { member: '', date: localKey(2), restingHr: 61 },
    { member: 'Пара', date: localKey(0), restingHr: 90 },
  ], latest: { weightKg: 76.8, weightDate: localKey(1) } };
  const tree = await draw(React.createElement(HealthDaily, {}));
  const text = screen(tree);
  assert.match(text, /Сон прошлой ночью/);
  assert.match(text, /7 ч 25 мин/);
  assert.match(text, /Пульс покоя 57/);
  assert.match(text, /на 4 уд ниже обычного/);
  assert.match(text, /Вес с весов 76,8/);
  assert.match(text, /Сегодня потрачено 380/);
  assert.doesNotMatch(text, /ВСР|VO2max|Жир/, 'пустых показателей нет');
  assert.doesNotMatch(text, /90/, 'у сплит-пары — свои строки');

  __hs.data = { days: [], latest: {} };
  const empty = await draw(React.createElement(HealthDaily, {}));
  assert.equal(empty.toJSON(), null);
  __hs.data = null;
  const none = await draw(React.createElement(HealthDaily, { clientRow: 7 }));
  assert.equal(none.toJSON(), null, 'старый сервер — блока нет');
});

test('«Потрачено» в «Питании» — за выбранный день, только когда есть', async () => {
  __hs.data = { days: [{ member: '', date: '2026-10-21', activeKcal: 420, totalKcal: 2310 }] };
  assert.match(screen(await draw(React.createElement(SpentKcal, { day: '2026-10-21' }))), /Потрачено: 2310 ккал \(с часов\)/);
  assert.equal((await draw(React.createElement(SpentKcal, { day: '2026-10-20' }))).toJSON(), null);
});
