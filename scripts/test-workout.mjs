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
// «Сохранить сейчас» убран с экрана (03.10.2026): сохраняет уход приложения
// в фон — так и проверяем
const hideOnce = () => { document.hidden = true; const r = (docListeners.get('visibilitychange') || []).map(fn => fn()); document.hidden = false; return Promise.all(r); };
async function saveNow() { await act(async () => { await hideOnce(); await delay(); }); }
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
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const apiPublic=(...a)=>globalThis.__workoutApi(...a); export const apiMutate=apiPublic; export const apiStale=()=>({data:{exercises:[]},stale:false,promise:Promise.resolve({exercises:[]})}); export const onMutated=()=>()=>{}; export const getInitData=()=>""; export const getToken=()=>"demo"; export const haptic=()=>{};' }));
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
  await saveNow();
  const weight = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => weight.props.onChange({ target: { value: '45,5' } }));
  // Галочки нет (03.10.2026): подход отмечает оценка
  const done = tree.root.findAllByType('button').find(n => text(n) === 'Норм');
  await act(async () => done.props.onClick());
  await click('Пауза'); await click('Продолжить');
  await click('Завершить'); await click('Завершить');
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
  offline = false; await saveNow();
  assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].exercises[0].sets[0].weight, '77.5');
  await act(async () => tree.unmount()); tree = null;
});
test('после отказа валидации исправленный снимок действительно сохраняется', async () => {
  data.clear(); await mount();
  const findWeight = () => tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => findWeight().props.onChange({ target: { value: '-7' } }));
  await saveNow();
  assert.ok(tree.root.findAll(n => n.props.role === 'alert').length);
  await act(async () => findWeight().props.onChange({ target: { value: '70' } }));
  await saveNow();
  assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].exercises[0].sets[0].weight, '70');
  await act(async () => tree.unmount()); tree = null;
});
test('интерфейс конфликта сохраняет чужую версию и резервную копию своей', async () => {
  data.clear(); await mount(); await saveNow();
  const saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  saved.title = 'Изменено тренером'; saved.revision++;
  data.set('workout_demo_server:3', JSON.stringify([saved]));
  const input = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => input.props.onChange({ target: { value: '77' } }));
  await saveNow();
  assert.ok(button('Открыть актуальное занятие'));
  await click('Открыть актуальное занятие');
  assert.equal(text(tree.root.findAllByType('h2')[0]), 'Изменено тренером');
  assert.ok([...data.keys()].some(k => k.includes(':backup:')));
  await act(async () => tree.unmount()); tree = null;
});
test('ответ старого экрана не затирает новый ввод после возвращения', async () => {
  data.clear(); await mount();
  let release;
  holdSave = new Promise(resolve => { release = resolve; });
  let pending;
  await act(async () => { pending = hideOnce(); await delay(); });
  await act(async () => tree.unmount());
  await mount(false);
  const input = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => input.props.onChange({ target: { value: '91' } }));
  await act(async () => { release(); await pending; await delay(); });
  const draftKey = [...data.keys()].find(k => k.startsWith('workout_draft_v1:'));
  assert.equal(JSON.parse(data.get(draftKey)).session.exercises[0].sets[0].weight, '91');
  await saveNow();
  // Сначала подтверждается исходный снимок, затем отправляется новый.
  await saveNow();
  assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].exercises[0].sets[0].weight, '91');
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
    { name: 'Подтягивания', sets: '3', reps: '10', weight: '', track: { kind: 'bodyweight', machine: '', unilateral: false, perSide: false }, supersetGroup: 'superset-4-5' },
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

    // Оценка — у каждого упражнения круга (03.10.2026): не последнее —
    // «без отдыха» к следующему, последнее — отдых
    const round1 = () => local.root.findAllByProps({ className: 'workout__round' })[0];
    const norm = () => round1().findAll(n => n.type === 'button' && text(n) === 'Норм');
    assert.equal(norm().length, 2, 'кнопки под каждым упражнением круга');
    assert.ok(round1().findAll(n => n.type === 'p' && /^Без отдыха/.test(text(n))).length === 1, 'первое — без отдыха');
    // Повторов у подтягиваний нет — подсказка под кругом, с названием
    const reps = round1().findAll(n => n.type === 'input' && /Подтягивания, подход 1, повторы/.test(n.props['aria-label'] || ''))[0];
    await act(async () => { reps.props.onChange({ target: { value: '' } }); await delay(); });
    await act(async () => { norm()[0].props.onClick(); await delay(); });
    assert.match(text(round1().findByProps({ className: 'workout__round-lack' })), /Подтягивания: введите число повторов/);
    // Вписали — подсказка ушла, оценки отмечают оба упражнения
    await act(async () => { reps.props.onChange({ target: { value: '10' } }); await delay(); });
    await act(async () => { norm()[0].props.onClick(); await delay(); });
    assert.equal(round1().findAllByProps({ className: 'workout__round-lack' }).length, 0);
    await act(async () => { norm()[0].props.onClick(); await delay(); });
    assert.equal(round1().findAll(n => n.type === 'div' && String(n.props.className || '').split(' ').includes('workout__set--done')).length, 2, 'оба упражнения круга отмечены');
    // Отдых пошёл после последнего упражнения — закрыть его, чтобы не мешал
    const stop = local.root.findAllByType('button').find(b => text(b) === 'Закончить отдых');
    if (stop) await act(async () => { stop.props.onClick(); await delay(); });
    await press('Круг 1 выполнен');
    assert.equal(round1().findAll(n => n.type === 'div' && String(n.props.className || '').split(' ').includes('workout__set--done')).length, 0, 'второе нажатие снимает отметку');

    // Разъединили — два отдельных упражнения, подходов у каждого столько,
    // сколько было кругов
    await press('Разъединить');
    assert.deepEqual(heads(), ['1 Подтягивания', '2 Тяга блока', '3 Планка']);
    assert.equal(local.root.findAll(n => n.type === 'div' && String(n.props.className || '').split(' ').includes('workout__set')).length, 9);
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
  await saveNow();

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

  // Отдых — на весь экран (RestScreen, 03.10.2026)
  const rest = () => tree.root.findAll(n => n.props && n.props.role === 'dialog' && /^rest-screen/.test(n.props.className || ''));
  assert.equal(rest().length, 0, 'до выбора длительности полосы нет');

  const select = tree.root.findAll(n => n.type === 'select' && n.props['aria-label'] === 'Таймер отдыха')[0];
  await act(async () => { await select.props.onChange({ target: { value: '90' } }); await delay(); });

  await act(async () => {
    const stop = tree.root.findAll(n => n.type === 'button' && /Закончить отдых/.test(text(n)))[0];
    await stop.props.onClick();
    await delay();
  });
  assert.equal(rest().length, 0, 'сбросили — полосы снова нет');

  const set = tree.root.findAll(n => n.type === 'input'
    && typeof n.props['aria-label'] === 'string'
    && n.props['aria-label'].includes('подход 1, повторы'))[0];

  await act(async () => { await set.props.onChange({ target: { value: '10' } }); await delay(); });

  // Галочки нет (03.10.2026): подход отмечает оценка — «Норм» под ним
  const check = tree.root.findAll(n => n.type === 'button' && text(n) === 'Норм')[0];

  await act(async () => { await check.props.onClick(); await delay(); });

  assert.equal(rest().length, 1, 'отдых пошёл сам, без похода в шапку');
  const target = { closest: () => null };
  await act(async () => {
    rest()[0].props.onTouchStart({ touches: [{ clientX: 190, clientY: 180 }], target });
    rest()[0].props.onTouchEnd({ changedTouches: [{ clientX: 196, clientY: 280 }] });
    await delay();
  });
  assert.equal(rest().length, 0, 'свайп вниз сворачивает полноэкранный таймер');
  assert.equal(tree.root.findAllByProps({ className: 'rest-pill' }).length, 1, 'отдых продолжает идти в плашке');
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

  // Галочки нет (03.10.2026): подход отмечает оценка — «Норм» под ним
  const check = tree.root.findAll(n => n.type === 'button' && text(n) === 'Норм')[0];

  await act(async () => { await check.props.onClick(); await delay(); });

  await click('Завершить');
  await click('Завершить');

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

    const title = local.root.findAllByType('h2').find(n => text(n) === 'Тренировка 2 — низ');
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
  assert.deepEqual(both.sets.slice(0, 2).map((x) => x.weight), ['27.5', '20'], 'прошлый вес человека, нет — из программы');
  assert.equal(both.prevWeight, 'Евгений 27,5');
  assert.equal(setLabel(both.sets, 3), 'Екатерина · 2');
  assert.equal(hers.sets.length, 4);
  assert.ok(hers.sets.every((x) => x.who === 'Екатерина' && x.weight === '40'));

  const solo = fromPlan({ title: 'X', exercises: [{ name: 'Жим', sets: '2', reps: '8', weight: '50' }] }, '', []);
  assert.equal(solo.exercises[0].sets.length, 2);
  assert.equal(solo.exercises[0].sets[0].weight, '50', 'истории нет — из программы');
  const again = fromPlan({ title: 'X', exercises: [{ name: 'Жим', sets: '2', reps: '8', weight: '50', lastWeight: '55' }] }, '', []);
  assert.deepEqual(again.exercises[0].sets.map((x) => x.weight), ['55', '55'], 'начинаем с прошлого веса');
  assert.equal(solo.exercises[0].sets[0].who, undefined);
  assert.equal(setLabel(solo.exercises[0].sets, 1), '2');
});

test('сплит (FT-488): у каждого свой тренажёр и свой вес на нём', async () => {
  const { fromPlan, withMemberMachine } = await import('../src/workout-model.js');
  const members = ['Евгений', 'Екатерина'];
  const s = fromPlan({ title: 'Ноги', exercises: [
    { name: 'Жим ногами', exerciseId: 7, sets: '2', reps: '10',
      splitMachines: { Евгений: { uid: 'bbbb22', name: 'Technogym' } },
      splitLast: { Евгений: '120' }, splitPrev: { Евгений: '90', Екатерина: '40' } },
  ] }, '', members);
  const ex = s.exercises[0];
  assert.deepEqual(ex.machines, { Евгений: { uid: 'bbbb22', name: 'Technogym' } });
  assert.equal(ex.machine, undefined, 'общего тренажёра у пары нет');
  assert.deepEqual(ex.sets.slice(0, 2).map((x) => x.weight), ['120', '40'], 'журнал на его тренажёре важнее «было» программы');
  assert.equal(ex.prevWeight, 'Евгений 120 · Екатерина 40');

  // Екатерина села на Hammer: меняются только её неотмеченные подходы
  const done = { ...ex, sets: ex.sets.map((x, i) => (i === 1 ? { ...x, state: 'done', reps: '10' } : x)) };
  const hammer = { uid: 'aaaa11', name: 'Hammer' };
  const picked = withMemberMachine(done, 'Екатерина', hammer, { lastWeight: '80' });
  assert.deepEqual(picked.machines['Екатерина'], hammer);
  assert.deepEqual(picked.machines['Евгений'], { uid: 'bbbb22', name: 'Technogym' });
  assert.deepEqual(picked.sets.map((x) => [x.who, x.weight]),
    [['Евгений', '120'], ['Екатерина', '40'], ['Евгений', '120'], ['Екатерина', '80']], 'отмеченное и чужое — как было');
  const off = withMemberMachine(picked, 'Евгений', null);
  assert.deepEqual(Object.keys(off.machines), ['Екатерина']);
});

test('замена упражнения берёт подходы нового из истории и не оставляет старые', async () => {
  const { fromPlan, replaceWorkoutExercise } = await import('../src/workout-model.js');
  const old = fromPlan({ title: 'Ноги', exercises: [{
    name: 'Жим ногами', exerciseId: 10, sets: '3', reps: '10',
    startSets: ['160', '180', '180'].map((weight) => ({ weight, reps: '10', kind: 'work' })),
    lastRun: { date: '2026-09-20', weights: ['160', '180', '180'], reps: ['10', '10', '10'] },
  }] }, '', []).exercises[0];

  const squatHistory = {
    name: 'Присед', exerciseId: 20, lastWeight: '100',
    startSets: ['80', '100', '100'].map((weight) => ({ weight, reps: '10', kind: 'work' })),
    lastRun: { date: '2026-09-28', weights: ['80', '100', '100'], reps: ['10', '10', '10'] },
    track: { kind: 'strength', machine: '', unilateral: false, perSide: false },
  };
  const squat = replaceWorkoutExercise(old, { name: 'Присед', exerciseId: 20, track: squatHistory.track }, squatHistory);
  assert.equal(squat.exerciseId, 20);
  assert.deepEqual(squat.sets.map((s) => s.weight), ['80', '100', '100']);
  assert.deepEqual(squat.lastRun, squatHistory.lastRun);
  assert.ok(squat.sets.every((s) => s.weight !== '160' && s.weight !== '180'));

  const fresh = replaceWorkoutExercise(squat, {
    name: 'Новое упражнение', exerciseId: 30,
    track: { kind: 'strength', machine: '', unilateral: false, perSide: false },
  });
  assert.equal(fresh.exerciseId, 30);
  assert.ok(fresh.sets.every((s) => s.weight === ''), 'нет истории — веса пустые');
  assert.equal(fresh.lastRun, undefined);
  assert.equal(fresh.prevWeight, '');
});

/**
 * Тренажёры (FT-478): занятие берёт тренажёр прошлого раза из программы;
 * другой тренажёр — неотмеченные подходы с весами прошлого раза на нём,
 * отмеченное не трогается; не делали на нём — веса пустые.
 */
test('другой тренажёр: веса неотмеченных — с прошлого раза на нём, отмеченные целы', async () => {
  const { fromPlan, withMachine } = await import('../src/workout-model.js');
  const press = fromPlan({ title: 'Ноги', exercises: [{
    name: 'Жим ногами', exerciseId: 10, sets: '3', reps: '10',
    machine: { uid: 'hammer1', name: 'Hammer' },
    startSets: ['200', '200', '200'].map((weight) => ({ weight, reps: '10', kind: 'work' })),
  }] }, '', []).exercises[0];
  assert.deepEqual(press.machine, { uid: 'hammer1', name: 'Hammer' }, 'тренажёр прошлого раза');

  const first = { ...press, sets: press.sets.map((s, i) => (i === 0 ? { ...s, state: 'done' } : s)) };
  const techno = withMachine(first, { uid: 'tg2', name: 'Technogym' }, {
    lastWeight: '120',
    startSets: ['110', '120', '120'].map((weight) => ({ weight, reps: '10', kind: 'work' })),
    lastRun: { date: '2026-10-01', weights: ['110', '120', '120'], reps: ['10', '10', '10'] },
  });
  assert.deepEqual(techno.machine, { uid: 'tg2', name: 'Technogym' });
  assert.deepEqual(techno.sets.map((s) => s.weight), ['200', '120', '120'], 'первый отмечен — его вес прежний');
  assert.equal(techno.prevWeight, '120');

  const fresh = withMachine(press, { uid: 'new3', name: 'Новый' }, {});
  assert.ok(fresh.sets.every((s) => s.weight === ''), 'на новом не делали — веса пустые');
  assert.equal(fresh.lastRun, undefined);

  const none = withMachine(press, null);
  assert.equal(none.machine, undefined, 'без тренажёра');
  assert.deepEqual(none.sets, press.sets, 'без ответа сервера веса не меняются');
});

/**
 * Кардио: поля режима и выбранных метрик подписаны, недостающую метрику
 * можно добавить, интервалы — с таймером, отрезок отмечается по итогу.
 */
test('кардио в занятии: режим, метрики, «+ метрика»', async () => {
  data.clear();
  const block = { title: 'Кардио', exercises: [{ name: 'Беговая дорожка', cardio: {
    machine: 'treadmill', goal: 'distance', metrics: ['distance'], targets: { distance: '' }, settings: { speed: '8', incline: '3' }, intervals: null } }] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const labels = () => local.root.findAllByType('input').map(n => n.props['aria-label'] || '').filter(l => /отрезок 1/.test(l));
    // Первым — главная цель (FT-475), за ней режим
    assert.deepEqual(labels(), [
      'Беговая дорожка, отрезок 1, расстояние, м',
      'Беговая дорожка, отрезок 1, скорость, км/ч',
      'Беговая дорожка, отрезок 1, наклон, %',
    ]);
    const button = label => local.root.findAllByType('button').find(b => text(b) === label);
    // Отметить без итога нельзя: скорость — не результат
    const check = () => local.root.findAllByType('button').find(n => text(n) === 'Норм');
    await act(async () => { check().props.onClick(); await delay(); });
    assert.ok(local.root.findAllByType('p').some(p => /время, расстояние или калории/.test(text(p))));
    await act(async () => { button('+ Калории').props.onClick(); await delay(); });
    assert.ok(labels().includes('Беговая дорожка, отрезок 1, калории'));
    const kcal = local.root.findAllByType('input').find(n => n.props['aria-label'] === 'Беговая дорожка, отрезок 1, калории');
    await act(async () => { kcal.props.onChange({ target: { value: '280' } }); await delay(); });
    await act(async () => { check().props.onClick(); await delay(); });
    assert.ok(local.root.findAll(n => String(n.props.className || '') === 'workout__cardio-done').length === 1, 'отрезок отмечен');
  } finally {
    if (local) local.unmount();
  }
});

test('функциональное кардио: в отрезке круги и интервалы, свои у каждого (FT-513)', async () => {
  data.clear();
  const block = { title: 'Кардио', exercises: [{ name: 'Беговая дорожка', sets: '2', cardio: {
    machine: 'treadmill', metrics: ['distance'], targets: { distance: '5' }, settings: { speed: '8', incline: '3' },
    intervals: { rounds: 3, fast: { time: '1:00', speed: '12' }, slow: { time: '2:00', speed: '6' } } } }] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const input = label => local.root.findAllByType('input').find(n => n.props['aria-label'] === label);
    const button = label => local.root.findAllByType('button').find(b => text(b) === label);
    // Вместо «Время / Скорость» — круги и каждый интервал со своими целями
    assert.equal(input('Беговая дорожка, отрезок 1, кругов').props.value, '3');
    assert.equal(input('Беговая дорожка, отрезок 1, ускорение, время, с').props.value, '60');
    assert.equal(input('Беговая дорожка, отрезок 1, замедление, скорость, км/ч').props.value, '6');
    assert.equal(input('Беговая дорожка, отрезок 1, скорость, км/ч'), undefined, 'общей скорости нет');
    assert.equal(button('+ Калории'), undefined, 'метрик сверху нет — цели у интервалов');
    assert.equal(button('Запустить интервалы'), undefined, 'таймера нет — интервалы запускают на тренажёре');

    // В первом отрезке 4 круга — второй остаётся с тремя
    await act(async () => { input('Беговая дорожка, отрезок 1, кругов').props.onChange({ target: { value: '4' } }); await delay(); });
    await act(async () => { input('Беговая дорожка, отрезок 1, ускорение, скорость, км/ч').props.onChange({ target: { value: '13' } }); await delay(); });
    assert.equal(input('Беговая дорожка, отрезок 2, кругов').props.value, '3');
    assert.equal(input('Беговая дорожка, отрезок 2, ускорение, скорость, км/ч').props.value, '12');

    // Отметили — в отрезке его интервалы и итог: 4 × (1:00 + 2:00)
    await act(async () => { button('Норм').props.onClick(); await delay(); });
    await saveNow();
    const saved = JSON.parse(data.get('workout_demo_server:3'))[0].exercises[0].sets;
    assert.equal(saved[0].state, 'done');
    assert.equal(saved[0].intervals.rounds, 4);
    assert.equal(saved[0].time, '12:00');
    assert.equal(saved[1].intervals, undefined, 'второй не правили — по плану');
  } finally {
    if (local) local.unmount();
  }
});

/**
 * Удалить подход смахиванием и вернуть; выбрать два упражнения —
 * соединить в суперсет. Жест в тестовом рендере не повторить, поэтому
 * здесь — то, что делает кнопка корзины и панель выбора.
 */
test('корзина подхода удаляет с «Вернуть»; выбор упражнений — суперсет', async () => {
  data.clear();
  const block = { title: 'Выбор', exercises: [
    { name: 'Жим', sets: '3', reps: '10', weight: '40' },
    { name: 'Тяга', sets: '3', reps: '12', weight: '30' },
  ] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const press = async (match) => {
      const b = local.root.findAllByType('button').find(x => (typeof match === 'string' ? text(x) === match : match.test(x.props['aria-label'] || '')));
      assert.ok(b, String(match));
      await act(async () => { b.props.onClick({ stopPropagation() {} }); await delay(); });
    };
    const sets = () => local.root.findAll(n => n.type === 'div' && String(n.props.className || '').split(' ').includes('workout__set')).length;
    assert.equal(sets(), 6);
    await press(/^Удалить подход 2$/);
    assert.equal(sets(), 5);
    assert.ok(local.root.findAllByType('span').some(x => text(x) === 'Подход удалён'));
    await press('Вернуть');
    assert.equal(sets(), 6, 'вернулся');

    await press('Выбрать');
    const heads = local.root.findAll(n => n.props.role === 'checkbox');
    assert.equal(heads.length, 2);
    for (const h of heads) await act(async () => { h.props.onClick(); await delay(); });
    await press('Суперсет');
    assert.equal(local.root.findAllByProps({ className: 'workout__round-title' }).length, 3, 'стали суперсетом из трёх кругов');
  } finally {
    if (local) local.unmount();
  }
});

test('«Вернуться к занятию»: открывается идущее (начатое на часах), а не черновик завершённого', async () => {
  // Провели занятие на телефоне до конца — на устройстве остался черновик завершённого
  data.clear();
  await mount();
  const check = tree.root.findAll(n => n.type === 'button' && text(n) === 'Норм')[0];
  await act(async () => { await check.props.onClick(); await delay(); });
  await click('Завершить');
  await click('Завершить');
  if (tree) { tree.unmount(); tree = null; }
  const draftKey = [...data.keys()].find(k => k.startsWith('workout_draft'));
  assert.ok(draftKey && JSON.parse(data.get(draftKey)).session.status !== 'active', 'черновик завершённого есть');
  // Часы начали новое занятие на сервере
  const { fromPlan } = await import('../src/workout-model.js');
  const watchSession = fromPlan({ title: 'С часов', exercises: [{ name: 'Тяга', sets: 2, reps: '8', weight: '50' }] }, 'Сентябрь 2026');
  workoutMock('workout.save', { revision: 0, requestId: 'watch_test_000001', session: watchSession, __role: 'client' });

  for (const launch of [{ sessionId: watchSession.id }, {}]) {
    let local;
    try {
      await act(async () => {
        local = renderer.create(React.createElement(Workout, { launch, onClose() {} }));
        await delay(); await delay();
      });
      const title = local.root.findAllByType('h2').find(n => text(n) === 'С часов');
      assert.ok(title, 'открыто идущее занятие: ' + JSON.stringify(launch));
    } finally {
      if (local) local.unmount();
    }
  }
});

test('«было» у каждого подхода: тот же подход прошлого раза, повторы поменяли — вес пересчитан; вписали вес — дальше тот же', async () => {
  data.clear();
  const ex = { name: 'Махи гантелей', sets: 3, reps: '5',
    startSets: [{ weight: '6', reps: '5', kind: 'work' }, { weight: '8', reps: '5', kind: 'work' }, { weight: '8', reps: '5', kind: 'work' }],
    lastRun: { date: '2026-10-01', weights: ['6', '8'], reps: ['10', '8'], planReps: '5', effort: 'ok', streak: 0, action: 'scaled', step: 0 } };
  if (tree) tree.unmount();
  await act(async () => { tree = renderer.create(React.createElement(Workout, { launch: { block: { title: 'Было', exercises: [ex] }, month: 'Октябрь 2026' }, onClose() {} })); await delay(); });
  const hints = tree.root.findAll(n => n.props && n.props.className === 'workout__was').map(text);
  assert.deepEqual(hints, ['было 6 кг × 10', 'было 8 кг × 8'], 'у третьего прошлого раза нет');
  const input = (si, what) => tree.root.findAllByType('input').find(n => new RegExp('подход ' + (si + 1) + ', ' + what).test(n.props['aria-label'] || ''));
  // Сегодня в первом подходе 10 повторов, как тогда, — вес тот же, 6
  await act(async () => input(0, 'повторы').props.onChange({ target: { value: '10' } }));
  assert.equal(input(0, 'вес').props.value, '6');
  // Вписали вес во второй — третьему (без прошлого раза) тот же
  await act(async () => input(1, 'вес').props.onChange({ target: { value: '9' } }));
  assert.equal(input(2, 'вес').props.value, '9');
  await act(async () => tree.unmount()); tree = null;
});

test('кардио без интервалов в плане — интервалы задаются в занятии, и в суперсете (FT-511)', async () => {
  data.clear();
  const block = { title: 'Круг', exercises: [
    { name: 'Аэробайк', supersetGroup: 'A', cardio: { machine: 'other', goal: 'time', metrics: ['time'], targets: { time: '10' }, settings: { speed: '', level: '5' } } },
    { name: 'Присед', supersetGroup: 'A', sets: '3', reps: '10', weight: '40' },
  ] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const button = label => local.root.findAllByType('button').find(b => text(b) === label);
    const press = async b => { assert.ok(b); await act(async () => { b.props.onClick(); await delay(); }); };
    // Меню «Упражнения суперсета» нет (FT-513): правка — касанием в круге
    assert.ok(!local.root.findAllByType('summary').some(n => text(n) === 'Упражнения суперсета'));
    // Касание названия — название, вид, у кардио — аэробное или функциональное
    await press(button('Аэробайк'));
    assert.ok(local.root.findAllByType('input').some(n => n.props['aria-label'] === 'Название упражнения'));
    await press(button('Функциональное кардио'));
    assert.ok(local.root.findAllByType('p').some(p => /Аэробайк: интервалы 6 × ускорение 1:00/.test(text(p))), 'план — по интервалам');
    // В круге — круги и интервалы аэробайка вместо времени и скорости
    assert.equal(local.root.findAllByType('input').find(n => n.props['aria-label'] === 'Аэробайк, отрезок 1, кругов').props.value, '6');
    await press(button('Готово'));
    // Касание единиц — настройки: у кардио — интервалы
    await press(local.root.findAllByType('button').find(b => b.props['aria-label'] === 'Аэробайк: настройки'));
    assert.ok(button('+ Интервал'), 'редактор интервалов открыт');
    assert.equal(button('Функциональное кардио'), undefined, 'вид — у названия, не здесь');
    // У силового в круге — вес и повторы сразу всем кругам, и заметка
    await press(local.root.findAllByType('button').find(b => b.props['aria-label'] === 'Присед: настройки'));
    assert.equal(button('+ Интервал'), undefined, 'открыта одна панель');
    const all = local.root.findAllByType('input').find(n => n.props['aria-label'] === 'Присед: вес, кг, всем подходам');
    await act(async () => { all.props.onChange({ target: { value: '45' } }); await delay(); });
    const weights = local.root.findAllByType('input').filter(n => /^Присед, подход \d, вес в кг$/.test(n.props['aria-label'] || '')).map(n => n.props.value);
    assert.deepEqual(weights, ['45', '45', '45']);
    assert.ok(local.root.findAllByType('textarea').length > 0, 'заметка — в настройках упражнения суперсета');
  } finally {
    if (local) local.unmount();
  }
});

test('обычное упражнение: касание плана — подходы и вес всем, касание названия — вид (FT-513)', async () => {
  data.clear();
  const block = { title: 'Ноги', exercises: [{ name: 'Жим ногами', sets: '3', reps: '12', weight: '100' }] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const byLabel = label => local.root.findAllByType('button').find(b => b.props['aria-label'] === label);
    const button = label => local.root.findAllByType('button').find(b => text(b) === label);
    const press = async b => { assert.ok(b); await act(async () => { b.props.onClick(); await delay(); }); };
    const sets = () => local.root.findAllByType('input').filter(n => /^Жим ногами, подход \d, повторы$/.test(n.props['aria-label'] || ''));
    assert.ok(!local.root.findAllByType('summary').some(n => text(n) === 'Изменить упражнение'), 'меню нет');
    await press(byLabel('Жим ногами: настройки'));
    await press(byLabel('Добавить подход'));
    assert.equal(sets().length, 4);
    const reps = local.root.findAllByType('input').find(n => n.props['aria-label'] === 'Жим ногами: повторы, всем подходам');
    await act(async () => { reps.props.onChange({ target: { value: '10' } }); await delay(); });
    assert.deepEqual(sets().map(n => n.props.value), ['10', '10', '10', '10']);
    await press(byLabel('Убрать подход'));
    assert.equal(sets().length, 3);
    // Название — название и вид; панель настроек при этом закрывается
    await press(button('Жим ногами'));
    assert.equal(byLabel('Добавить подход'), undefined);
    await press(button('Кардио'));
    assert.ok(button('Аэробная тренировка'), 'у кардио — аэробное или функциональное');
  } finally {
    if (local) local.unmount();
  }
});

test('цель кардио, поправленная в сделанном круге, попадает в его отрезок (FT-513)', async () => {
  data.clear();
  const block = { title: 'Круг', exercises: [
    { name: 'Аэробайк', supersetGroup: 'A', sets: '2', cardio: { machine: 'other', goal: 'distance', metrics: ['distance'], targets: { distance: '' }, modes: ['level'], settings: { level: '8' } } },
    { name: 'Присед', supersetGroup: 'A', sets: '2', reps: '10', weight: '40' },
  ] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const input = label => local.root.findAllByType('input').find(n => n.props['aria-label'] === label);
    const press = async b => { assert.ok(b); await act(async () => { b.props.onClick(); await delay(); }); };
    // Первый круг сделан: у аэробайка вписали расстояние, оба отмечены
    await act(async () => { input('Аэробайк, отрезок 1, расстояние, м').props.onChange({ target: { value: '100' } }); await delay(); });
    const round1 = () => local.root.findAllByProps({ className: 'workout__round' })[0];
    await press(round1().findAll(n => n.type === 'button' && text(n) === 'Норм')[0]);
    await press(round1().findAll(n => n.type === 'button' && text(n) === 'Норм')[0]);
    assert.ok(local.root.findAllByType('button').some(b => text(b) === 'Круг 1 выполнен'));
    // Во втором круге отрезок ещё пуст; цель 150 м из настроек второго круга
    await press(local.root.findAllByType('button').filter(b => b.props['aria-label'] === 'Аэробайк: настройки')[1]);
    await act(async () => { input('Цель: Расстояние, м').props.onChange({ target: { value: '150' } }); await delay(); });
    assert.equal(input('Аэробайк, отрезок 2, расстояние, м').props.value, '150');
    assert.equal(input('Аэробайк, отрезок 1, расстояние, м').props.value, '100', 'вписанное в сделанном круге не тронуто');
    // Настройки первого (сделанного) круга — цель тоже доходит до отрезка, если там пусто
    await act(async () => { input('Аэробайк, отрезок 1, расстояние, м').props.onChange({ target: { value: '' } }); await delay(); });
    await press(local.root.findAllByType('button').filter(b => b.props['aria-label'] === 'Аэробайк: настройки')[0]);
    await act(async () => { input('Цель: Расстояние, м').props.onChange({ target: { value: '120' } }); await delay(); });
    assert.equal(input('Аэробайк, отрезок 1, расстояние, м').props.value, '120', 'сделанный круг, из которого открыли настройки');
  } finally {
    if (local) local.unmount();
  }
});
