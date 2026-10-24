/**
 * «Настройки» клиента в браузере (план трёх разборов, пункты 6 и 14,
 * 21.10.2026; src/client/Settings.jsx): без оболочки телефона
 * переключатели напоминаний неактивны и подписаны, почему; «Скопировать
 * данные для поддержки» кладёт в буфер текст, собранный заранее, — Safari
 * пишет в буфер только прямо в нажатии.
 *
 * Настоящие Settings.jsx, native-reminders.js, native-review.js,
 * reminders-model.js и native-bridge.js; подменены ui, иконки, сеть,
 * шаги, буфер обмена и ID аккаунта. window без Capacitor — браузер.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { APP_VERSION } from '../src/version.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Браузер: страница есть, оболочки телефона нет
globalThis.window = { location: { protocol: 'https:' }, addEventListener() {}, removeEventListener() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.__settings = { copies: [], copyFails: false, publicId: 'FT-ABC123', overview: null };

const stubs = {
  ui: `import React from 'react';
    export const Panel = ({ children }) => <div className="panel">{children}</div>;
    export const Segmented = ({ label }) => <div data-segmented={label} />;
    export const Field = ({ label, value }) => <label>{label}<input value={value} readOnly /></label>;
    export const formatNumber = (n) => String(n);
    export const formatWhen = (iso) => 'когда ' + iso;`,
  icons: `import React from 'react'; const I = () => <i />; export const IconCopy = I, IconCheck = I, IconExternal = I;`,
  telegram: 'export const haptic = () => {};',
  useData: 'export const useData = () => ({ data: globalThis.__settings.overview, loading: false, error: null, reload() {} });',
  steps: `export const stepsAvailability = async () => ({ available: false, reason: 'app' });
    export const stepsConnected = async () => false; export const stepsOn = () => false; export const connectSteps = async () => false;
    export const openHealthSettings = async () => {}; export const healthHub = () => ''; export const onIphone = () => false;
    export const workoutsAvailable = () => false; export const workoutsOn = () => false; export const connectWorkouts = async () => false;
    export const reportDevice = () => {};`,
  sync: 'export const ensureBackgroundSync = async () => {};',
  rest: "export const notifyPermission = async () => 'unsupported'; export const askNotifyPermission = async () => 'unsupported';",
  access: `export const copyText = async (text) => { globalThis.__settings.copies.push(text); if (globalThis.__settings.copyFails) throw new Error('NotAllowedError'); return true; };`,
  link: 'export const accountState = async () => ({ publicId: globalThis.__settings.publicId });',
  // Сеть: native-reminders.js спрашивает client.overview лениво; в браузере до этого не доходит
  api: 'export const api = async () => ({}); export const apiMutate = async () => ({}); export const apiPublic = async () => ({}); export const logout = () => {};',
};
const output = await build({
  stdin: { contents: "export { Reminders, Support } from './src/client/Settings.jsx';", resolveDir: process.cwd(), loader: 'js' },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{
    name: 'settings-stubs',
    setup(bundle) {
      const map = { 'ui.jsx': 'ui', 'icons.jsx': 'icons', 'telegram.js': 'telegram', 'useData.js': 'useData', 'native-steps.js': 'steps', 'native-sync.js': 'sync', 'native-rest.js': 'rest', 'access.js': 'access', 'trainer-link.js': 'link', 'api.js': 'api' };
      bundle.onResolve({ filter: /[\\/](ui\.jsx|icons\.jsx|telegram\.js|useData\.js|native-steps\.js|native-sync\.js|native-rest\.js|access\.js|trainer-link\.js|api\.js)$/ }, (args) => ({ path: map[args.path.split(/[\\/]/).at(-1)], namespace: 'settings-test' }));
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'settings-test' }, (args) => ({ contents: stubs[args.path], loader: 'jsx' }));
    },
  }],
});
const bundled = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), bundled, bundled.exports,
);
const { Reminders, Support } = bundled.exports;

const textOf = (node) => (typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join(' ') : ((node && node.children) || []).map(textOf).join(' '));
const screen = (tree) => textOf(tree.toJSON()).replace(/\s+/g, ' ').trim();
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function draw(Component, props = {}) {
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(Component, props)); });
  await settle();
  return tree;
}

test('браузер: четыре переключателя напоминаний неактивны, строки не раскрываются, под ними — почему', async () => {
  const tree = await draw(Reminders);
  const switches = tree.root.findAll((n) => n.type === 'input' && n.props.role === 'switch');
  assert.deepEqual(switches.map((s) => s.props['aria-label']), ['Тренировка по плану', 'Взвешивание', 'Замеры', 'Еда']);
  assert.ok(switches.every((s) => s.props.disabled === true && s.props.checked === false));
  assert.equal(tree.root.findAll((n) => n.type === 'button').length, 0, 'ни раскрыть строку, ни «Открыть настройки телефона»');
  const text = screen(tree);
  assert.match(text, /Напоминания работают в приложении для iPhone и Android\./);
  assert.match(text, /Понедельник, 7:30/);
  assert.match(text, /За 2 часа до начала/);
  assert.doesNotMatch(text, /Ближайш|В расписании|недоступно|Уведомления в системе/, 'ближайшая тренировка и разрешение — только в приложении на телефоне');
  assert.equal(store.size, 0, 'в браузере ничего не сохраняем');
  await act(async () => tree.unmount());
});

test('«Скопировать данные для поддержки»: текст собран заранее и уходит в буфер прямо в нажатии', async () => {
  __settings.copies = [];
  const tree = await draw(Support);
  assert.doesNotMatch(screen(tree), /Оценить Fit Track/, 'в браузере магазина нет');
  const button = tree.root.findAll((n) => n.type === 'button')[0];
  assert.equal(button.props.disabled, false);
  let pending;
  act(() => { pending = button.props.onClick(); });
  assert.equal(__settings.copies.length, 1, 'буфер — синхронно, без ожидания модели и ID');
  await act(async () => { await pending; });
  const copied = __settings.copies[0];
  assert.match(copied, /^Fit Track — данные для поддержки\n/);
  assert.match(copied, new RegExp('\nВерсия: ' + APP_VERSION.replace('.', '\\.') + '(\n|$)'));
  assert.match(copied, /\nУстройство: браузер/);
  assert.match(copied, /\nID: FT-ABC123$/);
  assert.doesNotMatch(copied, /Приложение:/, 'в браузере версии оболочки нет');
  assert.match(screen(tree), /Скопировано: версия, устройство и ID/);
  await act(async () => tree.unmount());
});

test('буфер не дали — говорим об этом; без ID (нет связи) строки ID нет', async () => {
  __settings.copies = [];
  __settings.copyFails = true;
  __settings.publicId = '';
  const tree = await draw(Support);
  await act(async () => { await tree.root.findAll((n) => n.type === 'button')[0].props.onClick(); });
  assert.match(screen(tree), /Не получилось скопировать — телефон не дал доступ к буферу обмена\./);
  assert.doesNotMatch(__settings.copies[0], /ID:/);
  __settings.copyFails = false;
  __settings.publicId = 'FT-ABC123';
  await act(async () => tree.unmount());
});

test('«глазами клиента» (disabled): кнопка не нажимается, подпись объясняет, данные не собираются', async () => {
  __settings.copies = [];
  const tree = await draw(Support, { disabled: true });
  const button = tree.root.findAll((n) => n.type === 'button')[0];
  assert.equal(button.props.disabled, true);
  assert.match(screen(tree), /В режиме просмотра это не нажимается\./);
  assert.equal(__settings.copies.length, 0);
  await act(async () => tree.unmount());
});
