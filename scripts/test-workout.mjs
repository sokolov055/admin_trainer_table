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
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const apiPublic=(...a)=>globalThis.__workoutApi(...a); export const apiMutate=apiPublic; export const getInitData=()=>""; export const getToken=()=>"demo"; export const haptic=()=>{};' }));
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

    // В зале суперсет делают кругами: круг — оба упражнения подряд,
    // у каждого свой вес и повторы, потом следующий круг
    const heads = () => local.root.findAllByType('h3').map(text);
    const rounds = () => local.root.findAllByProps({ className: 'workout__round' }).map(r =>
      r.findAllByProps({ className: 'workout__round-name' }).map(n => text(n).split(' · ')[0]));
    assert.deepEqual(heads(), ['Суперсет · 3 круга', '3 Планка']);
    assert.deepEqual(rounds(), [['Подтягивания', 'Тяга блока'], ['Подтягивания', 'Тяга блока'], ['Подтягивания', 'Тяга блока']]);
    assert.equal(local.root.findAllByProps({ className: 'workout__round-title' }).map(text).join(), 'Круг 1,Круг 2,Круг 3');
    // Поля в круге без заголовков колонок — единицы стоят у названия
    assert.equal(text(local.root.findAllByProps({ className: 'workout__round-units' })[0]), ' · кг · повт.');
    const press = async label => {
      const b = local.root.findAllByType('button').find(x => text(x) === label);
      assert.ok(b, label);
      await act(async () => { b.props.onClick(); await delay(); });
    };

    // Настройки — одни на круг, а не у каждого упражнения
    const summaries = () => local.root.findAllByType('summary').map(text);
    const setMenus = local.root.findAllByType('button').filter(b => /подход \d+: настройки$/.test(b.props['aria-label'] || ''));
    assert.equal(setMenus.length, 3, 'настройки подхода — только у планки, в кругах их нет');
    assert.equal(summaries().filter(t => t === 'Настройки круга').length, 3);
    await press('Пропустить круг');
    assert.equal(summaries().filter(t => t === 'Круг пропущен · изменить').length, 1);
    await press('Вернуть круг');

    // Разъединили — два отдельных упражнения, подходов у каждого столько,
    // сколько было кругов
    await press('Разъединить');
    assert.deepEqual(heads(), ['1 Подтягивания', '2 Тяга блока', '3 Планка']);
    assert.equal(local.root.findAll(n => n.type === 'div' && String(n.props.className || '').split(' ')[0] === 'workout__set').length, 9);
    assert.equal(rounds().length, 0);

    // И обратно — кнопкой между карточками
    await press('Соединить в суперсет');
    assert.deepEqual(heads(), ['Суперсет · 3 круга', '3 Планка']);
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

/**
 * Завершённое занятие не должно перехватывать запуск следующего.
 *
 * Черновик остаётся в хранилище, если экран закрыли, не нажав «К
 * журналу». Человек жал «Начать тренировку» у второй тренировки, а
 * открывалась первая — уже проведённая, с чужими весами внутри.
 */
test('после завершённой тренировки запускается новая, а не открывается прежняя', async () => {
  data.clear();
  await mount();

  // Проводим занятие до конца и уходим с экрана, не нажимая «К журналу»
  const set = tree.root.findAll(n => n.type === 'input'
    && typeof n.props['aria-label'] === 'string'
    && n.props['aria-label'].includes('подход 1, повторы'))[0];

  await act(async () => { await set.props.onChange({ target: { value: '10' } }); await delay(); });

  const check = tree.root.findAll(n => n.type === 'button'
    && typeof n.props['aria-label'] === 'string'
    && n.props['aria-label'].includes('подход 1: выполнен'))[0];

  await act(async () => { await check.props.onClick(); await delay(); });

  await click('Завершить тренировку');
  await click('Подтвердить');

  assert.ok(JSON.parse(data.get([...data.keys()].find(k => k.startsWith('workout_draft'))) || '{}').session,
    'черновик завершённого занятия остался на устройстве');

  // Человек возвращается к программе и жмёт «Начать» у другого блока
  const second = { title: 'Тренировка 2 — низ', exercises: [{ name: 'Присед', sets: 2, reps: '5', weight: '80' }] };

  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block: second, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });

    const title = local.root.findAllByType('input').find(n => n.props.value === 'Тренировка 2 — низ');
    assert.ok(title, 'открылась именно та тренировка, которую запускали');
  } finally {
    if (local) local.unmount();
  }
});

test('сплит: подходы кругами по людям, у каждого свой вес и «было»', async () => {
  const { fromPlan, setLabel } = await import('../src/workout-model.js');
  const members = ['Евгений', 'Екатерина'];
  const s = fromPlan({ title: 'Ноги', exercises: [
    { name: 'Румынская тяга', sets: '3', reps: '12', splitWeights: { Евгений: '30', Екатерина: '20' }, splitPrev: { Евгений: '27,5' } },
    { name: 'Жим с высокой постановкой', sets: '4', reps: '12', performers: ['Екатерина'], splitWeights: { Екатерина: '40' } },
  ] }, 'Июль 2026', members);

  const [both, hers] = s.exercises;
  assert.deepEqual(both.sets.map((x) => x.who), ['Евгений', 'Екатерина', 'Евгений', 'Екатерина', 'Евгений', 'Екатерина']);
  assert.deepEqual(both.sets.slice(0, 2).map((x) => x.weight), ['30', '20']);
  assert.equal(both.prevWeight, 'Евгений 27,5');
  assert.equal(setLabel(both.sets, 3), 'Екатерина · 2');
  assert.equal(hers.sets.length, 4);
  assert.ok(hers.sets.every((x) => x.who === 'Екатерина' && x.weight === '40'));

  const solo = fromPlan({ title: 'X', exercises: [{ name: 'Жим', sets: '2', reps: '8', weight: '50' }] }, '', []);
  assert.equal(solo.exercises[0].sets.length, 2);
  assert.equal(solo.exercises[0].sets[0].who, undefined);
  assert.equal(setLabel(solo.exercises[0].sets, 1), '2');
});

/**
 * Кардио: поля режима и выбранных метрик подписаны, недостающую метрику
 * можно добавить, интервалы — с таймером, отрезок отмечается по итогу.
 */
test('кардио в занятии: режим, метрики, «+ метрика», интервалы', async () => {
  data.clear();
  const block = { title: 'Кардио', exercises: [{ name: 'Беговая дорожка', cardio: {
    machine: 'treadmill', metrics: ['distance'], targets: { distance: '5' }, settings: { speed: '8', incline: '3' },
    intervals: { rounds: 3, fast: { time: '1:00', speed: '12' }, slow: { time: '2:00', speed: '6' } } } }] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const labels = () => local.root.findAllByType('input').map(n => n.props['aria-label'] || '').filter(l => /отрезок 1/.test(l));
    assert.deepEqual(labels(), [
      'Беговая дорожка, отрезок 1, скорость, км/ч',
      'Беговая дорожка, отрезок 1, наклон, %',
      'Беговая дорожка, отрезок 1, расстояние, км',
    ]);
    const button = label => local.root.findAllByType('button').find(b => text(b) === label);
    assert.ok(button('Запустить интервалы'), 'таймер интервалов на месте');

    // Отметить без итога нельзя: скорость — не результат
    const check = () => local.root.findAllByType('button').find(n => /отрезок 1: выполнен/.test(n.props['aria-label'] || ''));
    await act(async () => { check().props.onClick(); await delay(); });
    assert.ok(local.root.findAllByType('p').some(p => /время, расстояние или калории/.test(text(p))));

    await act(async () => { button('+ Калории').props.onClick(); await delay(); });
    assert.ok(labels().includes('Беговая дорожка, отрезок 1, калории'));
    const kcal = local.root.findAllByType('input').find(n => n.props['aria-label'] === 'Беговая дорожка, отрезок 1, калории');
    await act(async () => { kcal.props.onChange({ target: { value: '280' } }); await delay(); });
    await act(async () => { check().props.onClick(); await delay(); });
    assert.ok(local.root.findAllByType('button').some(n => /отрезок 1: снять отметку/.test(n.props['aria-label'] || '')));
  } finally {
    if (local) local.unmount();
  }
});
