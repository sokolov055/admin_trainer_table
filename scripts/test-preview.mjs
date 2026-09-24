import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
      // Иконки больше не подменяем: через боковое меню подтягивается
      // настоящий ui.jsx, а он импортирует их десятками. Держать здесь
      // список, который надо пополнять при каждой новой иконке, — способ
      // ломать эту проверку правками, к ней не относящимися.
      // Модуль чистый, без побочных действий, грузить его безопасно.
      bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      bundle.onLoad({ filter: /.*/, namespace: 'preview-test' }, (args) => {
        if (args.path === 'screens') return {
          loader: 'jsx',
          contents: `import React from 'react';
            const Screen = ({ clientRow, clientView }) => <div data-screen-row={String(clientRow ?? 'self')} data-client-view={clientView ? 'yes' : 'no'}>row:{clientRow ?? 'self'}</div>;
            export const Overview = Screen; export const Plan = Screen;
            export const Progress = Screen; export const Nutrition = Screen;`,
        };
        if (args.path === 'stories') return { loader: 'jsx', contents: `import React from 'react'; export const Stories=()=> <div>stories</div>;` };
        if (args.path === 'transfer') return { loader: 'jsx', contents: `import React from 'react'; export const TelegramTransferCard=()=> <div>transfer-card</div>;` };
        // Заглушка собирается из имён настоящего модуля, а не из списка
        // руками: ui.jsx импортирует оттуда то одно, то другое, и список
        // ломал бы эту проверку правками, к ней не относящимися.
        if (args.path === 'telegram') {
          const source = readFileSync(new URL('../src/telegram.js', import.meta.url), 'utf8');
          const names = [...source.matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]);

          return {
            contents: names
              .map((name) => `export const ${name} = () => ({});`)
              .join(String.fromCharCode(10)),
          };
        }
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
  assert.equal(tree.root.findByProps({ 'data-screen-row': '17' }).props['data-client-view'], 'yes');
  assert.equal(tree.root.findAll((node) => text(node) === 'transfer-card').length, 0);

  for (const label of ['Тренировки', 'Прогресс', 'Питание']) {
    const button = tree.root.findAllByType('button').find((node) => text(node) === label);
    await act(async () => button.props.onClick());
    // Посещённые разделы остаются в разметке спрятанными (keptTabs.js) —
    // проверяем каждый: все получают выбранного клиента
    const screens = tree.root.findAllByProps({ 'data-screen-row': '17' });
    assert.ok(screens.length >= 1);
    screens.forEach((screen) => {
      assert.equal(text(screen), 'row:17');
      assert.equal(screen.props['data-client-view'], 'yes');
    });
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
  assert.equal(tree.root.findByProps({ 'data-screen-row': 'self' }).props['data-client-view'], 'no');
  assert.equal(tree.root.findAll((node) => text(node) === 'transfer-card').length > 0, true);
  tree.unmount();
});
