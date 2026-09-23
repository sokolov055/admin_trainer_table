import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { workoutMock } from '../src/workout-mock.js';

const data = new Map();
// В Node 18 глобального crypto нет, с Node 19 он есть и только для чтения:
// присваивание в строгом режиме модуля падает с TypeError, и тест валится
// целиком ещё до первой проверки. Локально это не воспроизводится, если
// стоит Node 18, а в CI стоит Node 20 — ровно так тест и сломался.
if (!globalThis.crypto) globalThis.crypto = webcrypto;
globalThis.localStorage = { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
// document умеет подписку: экран занятия перечитывает чужие правки при
// возврате к приложению, и проверить это можно только настоящим событием.
const docListeners = new Map();
globalThis.document = {
  hidden: false,
  addEventListener(event, fn) { docListeners.set(event, [...(docListeners.get(event) || []), fn]); },
  removeEventListener(event, fn) { docListeners.set(event, (docListeners.get(event) || []).filter(x => x !== fn)); },
};
const wake = async () => { for (const fn of docListeners.get('visibilitychange') || []) await fn(); };
let offline = false;
let holdSave = null;
globalThis.__workoutApi = async (action, params) => {
  if (offline) throw new Error('Связи нет');
  if (action === 'workout.save' && holdSave) { const gate = holdSave; holdSave = null; await gate; }
  try { return workoutMock(action, { ...params, __role: 'client' }); }
  catch (error) { error.code = 400; throw error; }
};
const output = await build({ entryPoints: ['src/Workout.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], define: { 'import.meta.env.VITE_MOCK': '"1"' },
  plugins: [{ name: 'test-api', setup(b) {
    b.onResolve({ filter: /\/(api|telegram|session)\.js$/ }, args => ({ path: args.path, namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const apiPublic=(...a)=>globalThis.__workoutApi(...a); export const apiMutate=apiPublic; export const getInitData=()=>""; export const getToken=()=>"demo";' }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }] });
const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), module, module.exports);
const Workout = module.exports.default;
let tree;
const block = { title: 'Тренировка тест', exercises: [{ name: 'Присед', sets: 2, reps: '8', weight: '40' }] };
const delay = () => new Promise(resolve => setTimeout(resolve, 30));
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const button = label => tree.root.findAllByType('button').find(b => text(b) === label);
async function click(label) { const b = button(label); assert.ok(b, label); assert.ok(!b.props.disabled, 'Кнопка доступна: ' + label); await act(async () => { await b.props.onClick(); await delay(); }); }
// Прошлый экран размонтируем: у занятия свой секундный таймер, и
// оставленный в живых экземпляр не даёт процессу тестов завершиться.
async function mount(launch = true) { if (tree) tree.unmount(); await act(async () => { tree = renderer.create(React.createElement(Workout, { launch: launch ? { block, month: 'Сентябрь 2026' } : null, onClose() {} })); await delay(); }); }
after(() => { if (tree) tree.unmount(); });

test('интерфейс: запись подхода, пауза, продолжение, завершение и история', async () => {
  data.clear(); await mount();
  await click('Сохранить сейчас');
  const weight = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => weight.props.onChange({ target: { value: '45,5' } }));
  const done = tree.root.findAllByType('button').find(n => /подход 1: выполнен/.test(n.props['aria-label'] || ''));
  await act(async () => done.props.onClick());
  await click('Пауза'); await click('Продолжить');
  await click('Завершить тренировку'); await click('Подтвердить');
  const saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  assert.equal(saved.status, 'completed');
  assert.equal(saved.exercises[0].sets[0].weight, '45,5');
  assert.equal(saved.exercises[0].sets[1].state, 'skipped');
  await click('К журналу');
  assert.ok(tree.root.findAllByType('button').some(b => text(b).includes('Тренировка тест')));
  await act(async () => tree.unmount()); tree = null;
});
test('черновик восстанавливается после отключения сети и размонтирования', async () => {
  data.clear(); offline = true; await mount();
  const weight = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => weight.props.onChange({ target: { value: '77.5' } }));
  await act(async () => tree.unmount());
  await mount(false);
  assert.equal(tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || '')).props.value, '77.5');
  offline = false; await click('Сохранить сейчас');
  assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].exercises[0].sets[0].weight, '77.5');
  await act(async () => tree.unmount()); tree = null;
});
test('после отказа валидации исправленный снимок действительно сохраняется', async () => {
  data.clear(); await mount();
  const findWeight = () => tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => findWeight().props.onChange({ target: { value: '-7' } }));
  await click('Сохранить сейчас');
  assert.ok(tree.root.findAll(n => n.props.role === 'alert').length);
  await act(async () => findWeight().props.onChange({ target: { value: '70' } }));
  await click('Сохранить сейчас');
  assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].exercises[0].sets[0].weight, '70');
  await act(async () => tree.unmount()); tree = null;
});
test('интерфейс конфликта сохраняет чужую версию и резервную копию своей', async () => {
  data.clear(); await mount(); await click('Сохранить сейчас');
  const saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  saved.title = 'Изменено тренером'; saved.revision++;
  data.set('workout_demo_server:3', JSON.stringify([saved]));
  const input = tree.root.findAllByType('input')[0];
  await act(async () => input.props.onChange({ target: { value: 'Локальная правка' } }));
  await click('Сохранить сейчас');
  assert.ok(button('Открыть актуальное занятие'));
  await click('Открыть актуальное занятие');
  assert.equal(tree.root.findAllByType('input')[0].props.value, 'Изменено тренером');
  assert.ok([...data.keys()].some(k => k.includes(':backup:')));
  await act(async () => tree.unmount()); tree = null;
});
test('ответ старого экрана не затирает новый ввод после возвращения', async () => {
  data.clear(); await mount();
  let release;
  holdSave = new Promise(resolve => { release = resolve; });
  let pending;
  await act(async () => { pending = button('Сохранить сейчас').props.onClick(); await delay(); });
  await act(async () => tree.unmount());
  await mount(false);
  const input = tree.root.findAllByType('input')[0];
  await act(async () => input.props.onChange({ target: { value: 'Правка после возвращения' } }));
  await act(async () => { release(); await pending; await delay(); });
  const draftKey = [...data.keys()].find(k => k.startsWith('workout_draft_v1:'));
  assert.equal(JSON.parse(data.get(draftKey)).session.title, 'Правка после возвращения');
  await click('Сохранить сейчас');
  // Сначала подтверждается исходный снимок, затем отправляется новый.
  if (!button('Сохранить сейчас').props.disabled) await click('Сохранить сейчас');
  assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].title, 'Правка после возвращения');
  await act(async () => tree.unmount()); tree = null;
});

/**
 * Суперсет доезжает из плана до занятия.
 *
 * В таблице он обозначен не словом, а объединённой ячейкой «Подходы», и по
 * дороге к экрану проходит через три руки: чтение листа, снимок программы и
 * разметку упражнения. Потеряется в любой — человек в зале увидит два
 * обычных упражнения и отдохнёт между ними, хотя не должен.
 */
test('суперсет из программы виден в занятии', async () => {
  const superset = { title: 'Тренировка с суперсетом', exercises: [
    { name: 'Подтягивания', sets: '3', reps: '10', weight: '', supersetGroup: 'superset-4-5' },
    { name: 'Тяга блока', sets: '3', reps: '12', weight: '35', supersetGroup: 'superset-4-5' },
    { name: 'Планка', sets: '3', reps: '60', weight: '' },
  ] };

  // Предыдущие тесты оставили черновик, а экран открывает незакрытое
  // занятие вместо нового — иначе человек потерял бы начатое.
  data.clear();

  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block: superset, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });

    const marks = local.root.findAllByProps({ className: 'workout__superset' }).map(text);

    assert.deepEqual(marks, [
      'Суперсет · 1 из 2, без отдыха между упражнениями',
      'Суперсет · 2 из 2, без отдыха между упражнениями',
    ], 'подпись стоит у обоих упражнений группы и ни у кого больше');
  } finally {
    if (local) local.unmount();
  }
});

/**
 * Занятие одно на двоих: клиент отмечает подходы, тренер смотрит в то же
 * занятие со своего телефона. Телефон при этом лежит в кармане, а в
 * свёрнутой вкладке опрос не идёт — поэтому возврат к приложению обязан
 * перечитывать чужую версию сам, а не ждать очередного тика таймера.
 */
test('чужие правки занятия подхватываются при возврате к приложению', async () => {
  data.clear();
  await mount();
  await click('Сохранить сейчас');

  const key = 'workout_demo_server:3';
  const stored = JSON.parse(data.get(key));
  const session = stored[stored.length - 1];

  // Так это выглядит со стороны тренера: он вписал рабочий вес и сохранил.
  session.exercises[0].sets[0].weight = '99';
  session.revision += 1;
  session.updatedAt = new Date(Date.now() + 1000).toISOString();
  data.set(key, JSON.stringify(stored));

  const weightInput = () => tree.root.findAll(n => n.type === 'input'
    && typeof n.props['aria-label'] === 'string'
    && n.props['aria-label'].includes('подход 1, вес в кг'))[0];

  assert.equal(weightInput().props.value, '40', 'до возврата на экране свой снимок');

  await act(async () => { await wake(); await delay(); });

  assert.equal(weightInput().props.value, '99', 'после возврата — то, что записал второй');
});

/**
 * Отдых начинается там, где человек нажал.
 *
 * Раньше запустить его можно было только из шапки занятия, и после
 * каждого подхода приходилось листать список вверх. Выбранная длительность
 * запоминается в занятии, и дальше отметка подхода запускает отдых сама.
 */
test('отмеченный подход запускает отдых, если длительность выбрана', async () => {
  data.clear();
  await mount();

  const rest = () => tree.root.findAll(n => n.props && n.props.className === 'workout__rest workout__rest--float');
  assert.equal(rest().length, 0, 'до выбора длительности полосы нет');

  const select = tree.root.findAll(n => n.type === 'select' && n.props['aria-label'] === 'Таймер отдыха')[0];
  await act(async () => { await select.props.onChange({ target: { value: '90' } }); await delay(); });

  await act(async () => {
    const stop = tree.root.findAll(n => n.type === 'button' && /Сбросить/.test(text(n)))[0];
    await stop.props.onClick();
    await delay();
  });
  assert.equal(rest().length, 0, 'сбросили — полосы снова нет');

  const set = tree.root.findAll(n => n.type === 'input'
    && typeof n.props['aria-label'] === 'string'
    && n.props['aria-label'].includes('подход 1, повторы'))[0];

  await act(async () => { await set.props.onChange({ target: { value: '10' } }); await delay(); });

  const check = tree.root.findAll(n => n.type === 'button'
    && typeof n.props['aria-label'] === 'string'
    && n.props['aria-label'].includes('подход 1: выполнен'))[0];

  await act(async () => { await check.props.onClick(); await delay(); });

  assert.equal(rest().length, 1, 'отдых пошёл сам, без похода в шапку');
});
