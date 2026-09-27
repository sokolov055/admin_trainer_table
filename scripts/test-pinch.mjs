import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';

/** Щипок (pinch.js): свели — свернуть, развели — развернуть, мелочь — ничего */
const listeners = {};
globalThis.window = { innerWidth: 400 };
globalThis.document = { addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener: () => {} };
let now = 0;
globalThis.performance = { now: () => now };

const out = await build({ entryPoints: ['src/pinch.js'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /telegram\.js$/ }, () => ({ path: 't', namespace: 's' })); b.onLoad({ filter: /.*/, namespace: 's' }, () => ({ contents: 'export const haptic=()=>{};' })); } }] });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + out.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { usePinch } = mod.exports;

const touches = (d) => [{ clientX: 200 - d / 2, clientY: 300 }, { clientX: 200 + d / 2, clientY: 300 }];
const gesture = (from, to, ms = 400) => {
  now = 0; listeners.touchstart({ touches: touches(from) });
  now = ms; listeners.touchmove({ touches: touches(to) });
  listeners.touchend({ touches: [] });
};

test('свели на 28% ширины или взмахом — свёрнуто, развели — развёрнуто, мелочь — ничего', async () => {
  const calls = [];
  const Probe = () => { usePinch({ onIn: () => calls.push('in'), onOut: () => calls.push('out') }); return null; };
  await act(async () => { renderer.create(React.createElement(Probe)); });
  gesture(200, 80, 2000);  // −120 px из 400: больше 28% (112) — свернуть
  gesture(80, 200, 2000);  // обратно — развернуть
  gesture(200, 130, 2000); // −70 px медленно: меньше 28% и без взмаха — ничего
  gesture(200, 170, 100);  // −30 px быстро (300 px/с): взмах — свернуть
  assert.deepEqual(calls, ['in', 'out', 'in']);
});
