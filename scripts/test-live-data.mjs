/**
 * Живые данные (useData, options.live; 10.10.2026, владелец): тренер провёл
 * оплату — «Обзор» клиента показывает новый баланс сам, без «потянуть».
 *
 * Пока приложение на экране — перечитывается с шагом; в фоне — молчит;
 * вернулись — сразу свежее. Без live — ни одного лишнего запроса.
 */

import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const output = await build({
  entryPoints: ['src/useData.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'live-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /[\\/]api\.js$/ }, () => ({ path: 'api', namespace: 'live-test' }));
      bundle.onResolve({ filter: /gestures\.jsx$/ }, () => ({ path: 'gestures', namespace: 'live-test' }));
      bundle.onLoad({ filter: /.*/, namespace: 'live-test' }, (args) => ({
        contents: args.path === 'api'
          ? `export const apiStale = (action, params) => globalThis.__live.apiStale(action, params);
             export const onMutated = () => () => {};`
          : 'export const onPullRefresh = () => () => {};',
      }));
    },
  }],
});

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);
const { useData } = module.exports;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
globalThis.window = new EventTarget();

let balance = 0;
let calls = 0;
globalThis.__live = {
  apiStale: () => {
    calls += 1;
    return { data: null, stale: false, promise: Promise.resolve({ balance }) };
  },
};

let shown = null;
function Screen({ live }) {
  const { data } = useData('client.overview', {}, [], live ? { live } : {});
  shown = data;
  return null;
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const tick = async (ms) => { await act(async () => { mock.timers.tick(ms); }); await flush(); };

test('открытый экран перечитывается с шагом, в фоне молчит, при возвращении — сразу', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  calls = 0; balance = 5000;
  let root;
  await act(async () => { root = renderer.create(React.createElement(Screen, { live: 15000 })); });
  await flush();
  assert.equal(calls, 1, 'первая загрузка');
  assert.equal(shown.balance, 5000);

  balance = 30000; // тренер провёл оплату
  await tick(14000);
  assert.equal(calls, 1, 'раньше шага не спрашивает');
  await tick(1000);
  assert.equal(calls, 2);
  assert.equal(shown.balance, 30000, 'новый баланс на экране без действий клиента');

  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await tick(60000);
  assert.equal(calls, 2, 'в фоне сеть не трогается');

  balance = 55000;
  document.visibilityState = 'visible';
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await flush();
  assert.equal(calls, 3, 'вернулись — сразу');
  assert.equal(shown.balance, 55000);

  await act(async () => { root.unmount(); });
  await tick(60000);
  assert.equal(calls, 3, 'закрытый экран не опрашивает');
  mock.timers.reset();
});

test('без live — никакого опроса', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  calls = 0;
  let root;
  await act(async () => { root = renderer.create(React.createElement(Screen, { live: 0 })); });
  await flush();
  await tick(120000);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  assert.equal(calls, 1);
  await act(async () => { root.unmount(); });
  mock.timers.reset();
});
