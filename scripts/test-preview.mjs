import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const output = await build({
  entryPoints: ['src/client/ClientApp.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'client-preview-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /screens\.jsx$/ }, (args) => (
        /client[\\/]ClientApp\.jsx$/.test(args.importer)
          ? { path: 'screens', namespace: 'preview-test' }
          : undefined
      ));
      bundle.onResolve({ filter: /stories\.jsx$/ }, () => ({ path: 'stories', namespace: 'preview-test' }));
      bundle.onResolve({ filter: /AuthTransfer\.jsx$/ }, () => ({ path: 'transfer', namespace: 'preview-test' }));
      bundle.onResolve({ filter: /telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'preview-test' }));
      bundle.onResolve({ filter: /icons\.jsx$/ }, () => ({ path: 'icons', namespace: 'preview-test' }));
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'preview-test' }, (args) => {
        if (args.path === 'screens') return {
          loader: 'jsx',
          contents: `import React from 'react';
            const Screen = ({ clientRow }) => <div data-screen-row={String(clientRow ?? 'self')}>row:{clientRow ?? 'self'}</div>;
            export const Overview = Screen; export const Plan = Screen;
            export const Progress = Screen; export const Nutrition = Screen;`,
        };
        if (args.path === 'stories') return { loader: 'jsx', contents: `import React from 'react'; export const Stories=()=> <div>stories</div>;` };
        if (args.path === 'transfer') return { loader: 'jsx', contents: `import React from 'react'; export const TelegramTransferCard=()=> <div>transfer-card</div>;` };
        if (args.path === 'telegram') return { contents: `export const haptic=()=>{};` };
        return {
          loader: 'jsx',
          contents: `import React from 'react'; const I=()=> <i />;
            export const IconHome=I; export const IconPlan=I; export const IconProgress=I;
            export const IconNutrition=I; export const IconBack=I; export const IconUsers=I;`,
        };
      });
    },
  }],
});

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);
const ClientApp = module.exports.default;

const text = (node) => typeof node === 'string' ? node : (node.children || []).map(text).join('');

test('режим тренера передаёт выбранного клиента во все клиентские вкладки и возвращается назад', async () => {
  let changed = 0;
  let exited = 0;
  let tree;

  await act(async () => {
    tree = renderer.create(React.createElement(ClientApp, {
      me: { name: 'Тестовый клиент' },
      clientRow: 17,
      preview: { onChange: () => { changed += 1; }, onExit: () => { exited += 1; } },
    }));
  });

  assert.equal(text(tree.root.findByProps({ 'data-screen-row': '17' })), 'row:17');
  assert.equal(tree.root.findAll((node) => text(node) === 'transfer-card').length, 0);

  for (const label of ['Тренировки', 'Прогресс', 'Питание']) {
    const button = tree.root.findAllByType('button').find((node) => text(node) === label);
    await act(async () => button.props.onClick());
    assert.equal(text(tree.root.findByProps({ 'data-screen-row': '17' })), 'row:17');
  }

  await act(async () => tree.root.findAllByType('button').find((node) => text(node) === 'Сменить').props.onClick());
  await act(async () => tree.root.findAllByType('button').find((node) => text(node) === 'К тренеру').props.onClick());
  assert.equal(changed, 1);
  assert.equal(exited, 1);
  tree.unmount();
});

test('обычный клиент остаётся на собственных данных и видит карточку переноса входа', async () => {
  let tree;
  await act(async () => {
    tree = renderer.create(React.createElement(ClientApp, { me: { name: 'Клиент' } }));
  });
  assert.equal(text(tree.root.findByProps({ 'data-screen-row': 'self' })), 'row:self');
  assert.equal(tree.root.findAll((node) => text(node) === 'transfer-card').length > 0, true);
  tree.unmount();
});
