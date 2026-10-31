import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const initial = { enabled: true, emergencyOff: false,
  templates: [{ id: 1, title: 'Стартовая программа' }],
  catalog: [{ id: 1, goal: 'muscle', experience: 'regular', place: 'gym', days: 3 }] };
globalThis.__onboardingSetting = { data: initial, saved: null };
const output = await build({
  entryPoints: ['src/trainer/OnboardingSetting.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'],
  plugins: [{ name: 'settings-network', setup(bundle) {
    bundle.onResolve({ filter: /\/api\.js$/ }, () => ({ path: 'api', namespace: 'stub' }));
    bundle.onResolve({ filter: /\/ui\.jsx$/ }, () => ({ path: 'ui', namespace: 'stub' }));
    bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
    bundle.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ loader: 'jsx', contents: path === 'api'
      ? `export const apiPublic = async () => globalThis.__onboardingSetting.data;
         export const apiMutate = async (action, params) => { globalThis.__onboardingSetting.saved = params; return { ...globalThis.__onboardingSetting.data, ...params }; };`
      : `import React from 'react'; export const Section = ({children}) => <section>{children}</section>; export const Panel = ({children}) => <div>{children}</div>;` }));
  } }],
});
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const Settings = mod.exports.default;

test('настройки владельца открывают заполненный каталог и сохраняют все четыре условия', async () => {
  let tree;
  try {
    await act(async () => { tree = renderer.create(React.createElement(Settings)); });
    const fields = tree.root.findAllByType('select');
    assert.deepEqual(fields.map(f => f.props.value), ['muscle', 'regular', 'gym', 3]);
    assert.deepEqual(fields.map(f => f.parent.children[0]), ['Цель', 'Опыт', 'Место', 'График']);
    assert.ok(fields[0].findAllByType('option').some(o => o.props.value === 'any'));
    assert.ok(fields[0].findAllByType('option').some(o => o.props.value === 'muscle'));
    await act(async () => fields[3].props.onChange({ target: { value: '4' } }));
    const save = tree.root.findAllByType('button').find(b => b.children.includes('Сохранить стартовые программы'));
    await act(async () => save.props.onClick());
    assert.deepEqual(globalThis.__onboardingSetting.saved.catalog, [{ ...initial.catalog[0], days: 4 }]);
  } finally { if (tree) await act(async () => tree.unmount()); }
});
