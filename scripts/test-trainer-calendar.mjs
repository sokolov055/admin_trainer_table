import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const output = await build({
  entryPoints: ['src/trainer/TrainerApp.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'trainer-calendar-stubs',
    setup(bundle) {
      const stub = (filter, path) => bundle.onResolve({ filter }, () => ({ path, namespace: 'calendar-test' }));

      stub(/^\.\/screens\.jsx$/, 'trainer-screens');
      stub(/Metrics\.jsx$/, 'metrics');
      stub(/Expenses\.jsx$/, 'expenses');
      stub(/client[\\/]ClientApp\.jsx$/, 'client-app');
      stub(/client[\\/]screens\.jsx$/, 'client-screens');
      stub(/Payments\.jsx$/, 'payments');
      stub(/Library\.jsx$/, 'library');
      stub(/stories\.jsx$/, 'stories');
      stub(/AuthTransfer\.jsx$/, 'transfer');
      stub(/Invites\.jsx$/, 'invites');
      stub(/version\.js$/, 'version');
      stub(/ui\.jsx$/, 'ui');
      stub(/useData\.js$/, 'data');
      stub(/telegram\.js$/, 'telegram');
      stub(/icons\.jsx$/, 'icons');
      stub(/api\.js$/, 'api');

      bundle.onLoad({ filter: /.*/, namespace: 'calendar-test' }, (args) => {
        if (args.path === 'trainer-screens') return {
          loader: 'jsx',
          contents: `import React from 'react';
            export const Clients = ({ refresh, onRefresh, refreshRevision }) => <div data-clients data-busy={refresh.busy ? 'yes' : 'no'} data-revision={String(refreshRevision)}><span>Список клиентов</span><button onClick={onRefresh}>Обновить вручную</button></div>;
            export const Lost=()=>null;
            export const Logs=()=>null; export const Sheets=()=>null; export const Settings=()=>null; export const ClientCard=()=>null;`,
        };
        // apiPublic нужен не этой проверке, а настройке уведомлений,
        // которая приехала в меню тренера. Заглушка отдаёт пустоту: пуши
        // здесь не проверяются, но и ломать сборку они не должны.
        if (args.path === 'api') return {
          contents: 'export const apiMutate=(action, params)=>globalThis.__calendarRefreshHarness.apiMutate(action, params);'
            + ' export const apiPublic=async()=>({});',
        };
        if (args.path === 'ui') return {
          loader: 'jsx',
          contents: `import React from 'react';
            export const Chips=()=>null; export const Empty=()=>null; export const ErrorState=()=>null; export const Loading=()=>null; export const Search=()=>null;
            export const Drawer=({children})=><div>{children}</div>; export const Section=({children})=><section>{children}</section>;`,
        };
        if (args.path === 'icons') return {
          loader: 'jsx',
          contents: `import React from 'react'; const I=()=> <i />;
            export const IconUsers=I; export const IconChart=I; export const IconLog=I; export const IconSheet=I;
            export const IconSliders=I; export const IconMenu=I; export const IconClose=I; export const IconBack=I;
            export const IconPhone=I; export const IconSearch=I; export const IconMoney=I; export const IconRefresh=I; export const IconPlan=I;`,
        };
        if (args.path === 'library') return { loader: 'jsx', contents: `export default () => null; export const LIBRARY_PANES = [];` };
        if (args.path === 'metrics') return { loader: 'jsx', contents: `export const Finance=()=>null; export const Processes=()=>null;` };
        if (args.path === 'expenses') return { loader: 'jsx', contents: `export const Expenses=()=>null;` };
        if (args.path === 'client-screens') return { contents: `export const Overview=()=>null; export const Plan=()=>null; export const Progress=()=>null; export const Nutrition=()=>null;` };
        if (args.path === 'client-app') return { loader: 'jsx', contents: `export default function ClientApp(){ return null; }` };
        if (args.path === 'payments') return { loader: 'jsx', contents: `export const Payments=()=>null;` };
        if (args.path === 'stories') return { loader: 'jsx', contents: `export const Stories=()=>null;` };
        if (args.path === 'transfer') return { loader: 'jsx', contents: `export const TelegramTransferCard=()=>null;` };
        if (args.path === 'invites') return { loader: 'jsx', contents: `export const Invites=()=>null;` };
        if (args.path === 'version') return { contents: `export const APP_VERSION='test';` };
        if (args.path === 'data') return { contents: `export const useData=()=>({loading:false,data:{clients:[]},error:null,reload(){}});` };
        if (args.path === 'telegram') return { contents: `export const haptic=()=>{};` };
        return null;
      });
    },
  }],
});

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);
const TrainerApp = module.exports.default;

test('календарь обновляется в фоне при входе и повторный запуск не дублируется', async () => {
  let calls = 0;
  let finish;
  globalThis.__calendarRefreshHarness = {
    apiMutate(action, params) {
      calls += 1;
      assert.equal(action, 'calendar.refresh');
      assert.deepEqual(params, {});
      return new Promise((resolve) => { finish = resolve; });
    },
  };

  let tree;
  await act(async () => {
    tree = renderer.create(React.createElement(TrainerApp, { me: { name: 'Тренер' } }));
  });

  const clients = () => tree.root.findByProps({ 'data-clients': true });
  assert.equal(calls, 1, 'автоматический запуск происходит один раз');
  assert.equal(clients().props['data-busy'], 'yes');
  assert.equal(clients().props['data-revision'], '0');
  assert.equal(clients().findByType('span').children.join(''), 'Список клиентов', 'панель не заблокирована запросом');

  await act(async () => {
    clients().findByType('button').props.onClick();
    clients().findByType('button').props.onClick();
  });
  assert.equal(calls, 1, 'ручные нажатия присоединяются к уже идущему запросу');

  await act(async () => {
    finish({ trainings: 12, clients: 4, mirrorUpdated: true });
    await Promise.resolve();
  });

  assert.equal(clients().props['data-busy'], 'no');
  assert.equal(clients().props['data-revision'], '1', 'после пересчёта список перечитывается');

  tree.unmount();
  delete globalThis.__calendarRefreshHarness;
});
