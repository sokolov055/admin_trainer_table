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
let nativeEnabled = false;
let nativeActions = [];
const nativeTakeCalls = [];
const workoutActivity = {
  async takeActions({ sessionId } = {}) {
    nativeTakeCalls.push(sessionId || '');
    const mine = nativeActions.filter(a => !sessionId || a.sessionId === sessionId);
    nativeActions = nativeActions.filter(a => !mine.includes(a));
    return { actions: mine };
  },
  async update() { return { shown: true }; },
  async end() {},
  async restAlarm() { return { ok: true }; },
  async cancelRestAlarm() {},
  async restAlarmState() { return { state: 'scheduled' }; },
  async setRestSignal() {},
  async buzz() {},
  async addListener() { return { remove() {} }; },
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  Capacitor: {
    isNativePlatform: () => nativeEnabled,
    getPlatform: () => 'ios',
    isPluginAvailable: name => nativeEnabled && name === 'WorkoutActivity',
    Plugins: { WorkoutActivity: workoutActivity },
  },
};
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
let holdList = null;
let exerciseSetupResponse = null;
globalThis.__workoutApi = async (action, params) => {
  if (offline) throw new Error('Связи нет');
  if (action === 'exercise.setup' && exerciseSetupResponse) return exerciseSetupResponse;
  if (action === 'workout.list' && holdList) { const gate = holdList; holdList = null; await gate; }
  if (action === 'workout.save' && holdSave) { const gate = holdSave; holdSave = null; await gate; }
  try { return workoutMock(action, { ...params, __role: 'client' }); }
  catch (error) { error.code = 400; throw error; }
};
const output = await build({ entryPoints: ['src/Workout.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], define: { 'import.meta.env.VITE_MOCK': '"1"' },
  loader: { '.png': 'dataurl' },
  plugins: [{ name: 'test-api', setup(b) {
    b.onResolve({ filter: /\/(api|telegram|session)\.js$/ }, args => ({ path: args.path, namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const apiWait=(...a)=>globalThis.__workoutWait?globalThis.__workoutWait(...a):new Promise(()=>{}); export const apiPublic=(...a)=>globalThis.__workoutApi(...a); export const apiMutate=apiPublic; export const apiFresh=async(...a)=>({data:await globalThis.__workoutApi(...a),offline:false,at:0}); export const apiStoredAt=()=>0; export const apiStale=(a,p)=>a==="exercise.setup"?({data:globalThis.__workoutStale?globalThis.__workoutStale(a,p):null,stale:false,promise:globalThis.__workoutApi(a,p)}):({data:{exercises:[]},stale:false,promise:Promise.resolve({exercises:[]})}); export const onMutated=()=>()=>{}; export const getInitData=()=>""; export const getToken=()=>"demo"; export const haptic=(...a)=>{ if (globalThis.__haptic) globalThis.__haptic(...a); }; export const apiPrimary=apiPublic; export const logout=()=>{}; export const environmentInfo=()=>({}); export const hasToken=()=>true; export const describeDevice=()=>"";' }));
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
// Меню ⋯ в шапке (QA 20.10.2026): «Выбрать упражнения», «Отменить занятие»
async function openMore(root = tree.root) { const b = root.findAllByType('button').find(x => x.props['aria-label'] === 'Ещё'); assert.ok(b, 'кнопка ⋯'); await act(async () => { b.props.onClick(); await delay(); }); }
// Прошлый экран размонтируем: у занятия свой секундный таймер, и
// оставленный в живых экземпляр не даёт процессу тестов завершиться.
async function mount(launch = true) { if (tree) tree.unmount(); await act(async () => { tree = renderer.create(React.createElement(Workout, { launch: launch ? { block, month: 'Сентябрь 2026' } : null, onClose() {} })); await delay(); }); }
after(() => { if (tree) tree.unmount(); });

test('FT-565: клиент и тренер принимают заполненное время круга без ввода и могут исправить', async () => {
  const timedBlock = { title: 'Статика', exercises: ['Планка на локтях', 'Стульчик'].map(name => ({ name, sets: '2', track: { kind: 'timed' }, supersetGroup: 'g' })) };
  for (const clientRow of [undefined, 3]) {
    data.clear();
    if (tree) { tree.unmount(); tree = null; }
    nativeEnabled = true;
    try {
      await act(async () => { tree = renderer.create(React.createElement(Workout, { clientRow, launch: { block: timedBlock, month: 'Октябрь 2026' }, onClose() {} })); await delay(); });
      const times = () => tree.root.findAllByType('input').filter(n => /подход [12], время, с$/.test(n.props['aria-label'] || ''));
      assert.deepEqual(times().map(n => n.props.value), ['60', '60', '60', '60']);
      for (let n = 0; n < 4; n++) await click('Норм');
      await click('Завершить');
      if (button('Завершить')) await click('Завершить');
      let saved = JSON.parse(data.get('workout_demo_server:3'))[0];
      assert.equal(saved.status, 'completed');
      assert.ok(saved.exercises.every(e => e.sets.every(s => s.time === '60' && s.state === 'done')));
      await click('Исправить результат');
      await act(async () => { times()[0].props.onChange({ target: { value: '45' } }); await delay(); });
      await saveNow();
      saved = JSON.parse(data.get('workout_demo_server:3'))[0];
      assert.equal(saved.exercises[0].sets[0].time, '45');
      assert.equal(saved.exercises[0].sets[1].time, '60');
    } finally {
      nativeEnabled = false;
      if (tree) { tree.unmount(); tree = null; }
    }
  }
});

test('отмена доступна во время сохранения и отправляется следом за ним (FT-571)', async () => {
  data.clear(); await mount(); await saveNow();
  const weight = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => weight.props.onChange({ target: { value: '42' } }));
  let release;
  holdSave = new Promise(resolve => { release = resolve; });
  let pending;
  await act(async () => { pending = hideOnce(); await delay(); });
  try {
    await openMore();
    await click('Отменить занятие');
    // Кнопка подтверждения — «Отменить занятие», рядом «Не отменять» (аудит 24.10.2026)
    assert.ok(button('Не отменять'));
    await click('Отменить занятие');
    assert.ok(tree.root.findAllByType('p').some(n => text(n).includes('Отменена')));
  } finally {
    await act(async () => { release(); await pending; await delay(); });
  }
  const saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.exercises[0].sets[0].weight, '42');
  assert.ok(saved.exercises[0].sets.every(s => s.state === 'skipped'));
  await mount(false);
  assert.ok(JSON.stringify(tree.toJSON()).includes('Отменена'));
});

test('24.10.2026: отдых уходит на сервер сразу, даже если прежнее сохранение ещё не ответило', async () => {
  data.clear(); await mount(); await saveNow();
  const calls = [];
  const api = globalThis.__workoutApi;
  globalThis.__workoutApi = async (action, params) => { calls.push({ action, params }); return api(action, params); };
  let release;
  let pending;
  try {
    const weight = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
    await act(async () => weight.props.onChange({ target: { value: '42' } }));
    // Сохранение веса ушло и висит — телефон на плохой связи
    holdSave = new Promise(resolve => { release = resolve; });
    await act(async () => { pending = hideOnce(); await delay(); });
    const before = Date.now();
    const done = tree.root.findAllByType('button').find(n => text(n) === 'Норм');
    await act(async () => { done.props.onClick(); await delay(); });
    const rush = calls.filter(c => c.action === 'workout.watch');
    assert.equal(rush.length, 1, 'отдых — отдельным нажатием, не дожидаясь ответа');
    const [a] = rush[0].params.actions;
    assert.equal(a.kind, 'rest');
    assert.equal(a.sessionId, rush[0].params.sessionId);
    assert.ok(a.restUntil > before, 'отдых в будущем');
    // Свернули ещё раз — тот же отдых второй раз не шлём
    await act(async () => { await hideOnce(); await delay(); });
    assert.equal(calls.filter(c => c.action === 'workout.watch').length, 1);
  } finally {
    globalThis.__workoutApi = api;
    await act(async () => { release(); await pending; await delay(); await delay(); });
  }
  // Полный снимок с отметкой и отдыхом всё равно сохранился следом
  const saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  assert.equal(saved.exercises[0].sets[0].state, 'done');
  assert.ok(saved.restUntil > 0);
});

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
  // Ввели с запятой — хранится с точкой, показывается с запятой (аудит 24.10.2026)
  assert.equal(saved.exercises[0].sets[0].weight, '45.5');
  assert.equal(saved.exercises[0].sets[1].state, 'skipped');
  // Главная кнопка после завершения — назад, к программе (QA 20.10.2026)
  await click('К программе');
  assert.ok(tree.root.findAllByType('button').some(b => text(b).includes('Тренировка тест')));
  await act(async () => tree.unmount()); tree = null;
});

test('отдых с Live Activity ждёт загрузки занятия, сохраняется и переживает перезапуск (FT-349)', async () => {
  data.clear(); await mount(); await saveNow();
  const initial = JSON.parse(data.get('workout_demo_server:3'))[0];
  assert.ok(initial && initial.status === 'active');
  if (tree) { tree.unmount(); tree = null; }
  for (const key of [...data.keys()]) if (key.startsWith('workout_draft_v1:')) data.delete(key);

  const until = Date.now() + 120000;
  nativeEnabled = true;
  nativeActions = [
    { kind: 'done', sessionId: initial.id, exerciseId: initial.exercises[0].id, who: '', weight: '40', setIndex: 0 },
    { kind: 'rest', sessionId: initial.id, restUntil: until },
  ];
  nativeTakeCalls.length = 0;
  let releaseList;
  holdList = new Promise(resolve => { releaseList = resolve; });

  try {
    await mount(false);
    await act(async () => { await wake(); await delay(); });
    assert.equal(nativeActions.length, 2, 'до загрузки занятия одноразовая очередь не забрана');
    assert.deepEqual(nativeTakeCalls, []);

    await act(async () => { releaseList(); await delay(); await delay(); await delay(); });
    assert.deepEqual(nativeTakeCalls, [initial.id], 'забрана только очередь открытого занятия');
    assert.equal(nativeActions.length, 0);
    let saved = JSON.parse(data.get('workout_demo_server:3'))[0];
    assert.equal(saved.exercises[0].sets[0].state, 'done');
    assert.equal(saved.restUntil, until);

    await mount(false);
    saved = JSON.parse(data.get('workout_demo_server:3'))[0];
    assert.equal(saved.exercises[0].sets[0].state, 'done', 'подход не откатился после перезапуска');
    assert.equal(saved.restUntil, until, 'таймер не откатился после перезапуска');
  } finally {
    if (releaseList) releaseList();
    holdList = null;
    nativeEnabled = false;
    nativeActions = [];
    nativeTakeCalls.length = 0;
    if (tree) { tree.unmount(); tree = null; }
  }
});
/**
 * Отдых с часов закончился, пока телефон лежал (владелец, 24.10.2026): при
 * входе в занятие «Отдых окончен» от старого таймера не всплывает; идущий —
 * виден как раньше
 */
test('прошедший отдых с часов при входе в занятие не показываем, идущий — показываем', async () => {
  data.clear(); await mount(); await saveNow();
  const initial = JSON.parse(data.get('workout_demo_server:3'))[0];
  const rest = () => tree.root.findAll(n => n.props && n.props.role === 'dialog' && /^rest-screen/.test(n.props.className || ''));
  for (const [until, shown] of [[Date.now() - 60000, 0], [Date.now() + 120000, 1]]) {
    if (tree) { tree.unmount(); tree = null; }
    for (const key of [...data.keys()]) if (key.startsWith('workout_draft_v1:')) data.delete(key);
    nativeEnabled = true;
    nativeActions = [{ kind: 'rest', sessionId: initial.id, restUntil: until }];
    try {
      await mount(false);
      await act(async () => { await wake(); await delay(); await delay(); await delay(); });
      assert.equal(rest().length, shown, shown ? 'идущий отдых с часов виден' : 'прошедший — без «Отдых окончен»');
    } finally {
      nativeEnabled = false;
      nativeActions = [];
      nativeTakeCalls.length = 0;
    }
  }
  if (tree) { tree.unmount(); tree = null; }
});
test('«Завершить» по ошибке: «Продолжить» возвращает занятие с неотмеченного подхода (09.10.2026)', async () => {
  data.clear(); await mount();
  await saveNow();
  await act(async () => tree.root.findAllByType('button').find(n => text(n) === 'Норм').props.onClick());
  await click('Завершить'); await click('Завершить');
  let saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  assert.equal(saved.status, 'completed');
  assert.deepEqual([saved.exercises[0].sets[1].state, saved.exercises[0].sets[1].closed], ['skipped', true]);
  // В шапке завершённого — «Продолжить»; внизу — «Продолжить тренировку»
  assert.ok(button('Продолжить тренировку'));
  await click('Продолжить');
  saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  assert.equal(saved.status, 'active');
  assert.equal(saved.exercises[0].sets[0].state, 'done', 'сделанный остаётся сделанным');
  assert.equal(saved.exercises[0].sets[1].state, 'pending', 'пропущенный при завершении — снова в работе');
  assert.equal(saved.exercises[0].sets[1].closed, undefined);
  assert.ok(button('Завершить'), 'занятие снова можно вести и завершить');
  await act(async () => tree.unmount()); tree = null;
});
test('«Продолжить» не возвращает подходы, пропущенные руками', async () => {
  const { closeSets, reopenSession } = await import('../src/workout-model.js');
  const session = { status: 'active', restUntil: 5, exercises: [{ sets: [
    { state: 'done' }, { state: 'skipped' }, { state: 'pending' }] }] };
  const closed = { ...session, status: 'completed', exercises: closeSets(session.exercises) };
  assert.deepEqual(closed.exercises[0].sets.map(x => x.state + (x.closed ? '*' : '')), ['done', 'skipped', 'skipped*']);
  const back = reopenSession(closed);
  assert.equal(back.status, 'active'); assert.equal(back.restUntil, 0);
  assert.deepEqual(back.exercises[0].sets.map(x => x.state), ['done', 'skipped', 'pending']);
  // Занятие, завершённое до пометки closed, — возвращаются все пропущенные
  const old = { status: 'completed', exercises: [{ sets: [{ state: 'done' }, { state: 'skipped' }] }] };
  assert.deepEqual(reopenSession(old).exercises[0].sets.map(x => x.state), ['done', 'pending']);
});

test('FT-565: выполненный подход без повторов не завершает занятие; исправление сохраняет результат', async () => {
  data.clear(); await mount(); await saveNow();
  await act(async () => tree.root.findAllByType('button').find(n => text(n) === 'Норм').props.onClick());
  await saveNow();
  const reps = tree.root.findAllByType('input').find(n => /подход 1, повторы/.test(n.props['aria-label'] || ''));
  await act(async () => reps.props.onChange({ target: { value: '' } }));
  await saveNow();
  assert.ok(tree.root.findAllByProps({ role: 'alert' }).some(n => text(n).includes('Присед, подход 1: Введите число повторов.')));
  await click('Завершить'); await click('Завершить');
  const draftKey = [...data.keys()].find(k => k.startsWith('workout_draft_v1:'));
  assert.equal(JSON.parse(data.get(draftKey)).session.status, 'active', 'не показываем несохранённое занятие завершённым');
  assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].status, 'active');
  assert.ok(!button('Продолжить тренировку'));

  await act(async () => reps.props.onChange({ target: { value: '12' } }));
  await click('Завершить'); await click('Завершить');
  const saved = JSON.parse(data.get('workout_demo_server:3'))[0];
  assert.equal(saved.status, 'completed');
  assert.equal(saved.exercises[0].sets[0].reps, '12');
  assert.equal(saved.exercises[0].sets[0].state, 'done', 'отметка выполнения сохранена');
  assert.equal(saved.exercises[0].sets[1].state, 'skipped');
  await mount(false);
  assert.ok(button('Продолжить тренировку'), 'после повторного открытия занятие действительно завершено');
  await act(async () => tree.unmount()); tree = null;
});

test('FT-565: проверка результата учитывает тип упражнения и участника пары', async () => {
  const { resultIssue } = await import('../src/workout-model.js');
  const session = (track, set) => ({ exercises: [{ name: 'Упражнение', track, sets: [set] }] });
  assert.equal(resultIssue(session({ kind: 'strength' }, { state: 'done', weight: '', reps: '12' })), '', 'старый подход без веса допустим');
  assert.match(resultIssue(session({ kind: 'bodyweight' }, { state: 'done', reps: '', who: 'Настя' })), /Упражнение, подход Настя · 1/);
  assert.equal(resultIssue(session({ kind: 'bodyweight' }, { state: 'pending', reps: '' })), '', 'при завершении неотмеченное будет пропущено');
  assert.match(resultIssue(session({ kind: 'timed' }, { state: 'done', time: '' })), /Введите время/);
  assert.equal(resultIssue(session({ kind: 'timed' }, { state: 'done', time: '30' })), '');
  assert.match(resultIssue(session({ kind: 'cardio' }, { state: 'done' })), /время, расстояние или калории/);
  assert.equal(resultIssue(session({ kind: 'cardio' }, { state: 'done', distance: '2' })), '');
});
test('черновик восстанавливается после отключения сети и размонтирования', async () => {
  data.clear(); offline = true; await mount();
  const weight = tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || ''));
  await act(async () => weight.props.onChange({ target: { value: '77.5' } }));
  await act(async () => tree.unmount());
  await mount(false);
  assert.equal(tree.root.findAllByType('input').find(n => /подход 1, вес/.test(n.props['aria-label'] || '')).props.value, '77,5', 'в поле — с запятой');
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
      local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block: superset, month: 'Сентябрь 2026' }, onClose() {} }));
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

    // Оценка — по порядку круга (03.10.2026): не последнее — «без отдыха»
    // к следующему, последнее — отдых. Кнопки только у ближайшего, у
    // следующего — подпись «следом» (QA 20.10.2026: шесть кнопок читались
    // как равные)
    const round1 = () => local.root.findAllByProps({ className: 'workout__round' })[0];
    const norm = () => round1().findAll(n => n.type === 'button' && text(n) === 'Норм');
    assert.equal(norm().length, 1, 'кнопки — только под ближайшим упражнением круга');
    assert.ok(round1().findAll(n => n.type === 'p' && /^Без отдыха/.test(text(n))).length === 1, 'первое — без отдыха');
    assert.ok(round1().findAll(n => n.type === 'p' && /^Следом, без отдыха/.test(text(n))).length === 1, 'второе — подпись «следом»');
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
    // «Круг 1 выполнен» — статус, не кнопка (аудит 24.10.2026): случайное
    // касание больше не снимает отметки. Снять — в «Настройках круга», с «Вернуть»
    assert.ok(round1().findAll(n => n.type === 'p' && n.props.role === 'status' && text(n) === 'Круг 1 выполнен').length === 1, 'круг отмечен — строкой-статусом');
    assert.equal(round1().findAll(n => n.type === 'button' && text(n) === 'Круг 1 выполнен').length, 0, 'это не кнопка');
    const isDone = () => round1().findAll(n => n.type === 'div' && String(n.props.className || '').split(' ').includes('workout__set--done')).length;
    await press('Снять отметку круга');
    assert.equal(isDone(), 0, 'отметки круга сняты из настроек круга');
    await press('Вернуть');
    assert.equal(isDone(), 2, '«Вернуть» возвращает отметки круга');
    await press('Снять отметку круга');
    assert.equal(isDone(), 0);

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
  // Жесты приложения экран отдыха не трогают: вправо уводило из занятия,
  // вниз — «потяни, чтобы обновить» под ним (аудит 24.10.2026)
  assert.equal(rest()[0].props['data-no-gestures'], '');
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
 * Сменили длительность отдыха, пока он идёт (владелец, 16.10.2026): отдых не
 * начинается заново — идёт прежний с новой длиной от своего начала; поставили
 * меньше, чем уже прошло, — заканчивается сразу.
 */
test('смена длительности идущего отдыха не перезапускает его', async () => {
  data.clear();
  await mount();
  const realNow = Date.now;
  const t0 = realNow.call(Date);
  let clock = t0;
  Date.now = () => clock;
  try {
    const until = () => {
      const screen = tree.root.findAll(n => n.props && typeof n.props.until === 'number' && typeof n.props.onStop === 'function')[0];
      return screen ? screen.props.until : 0;
    };
    const select = () => tree.root.findAll(n => n.type === 'select' && n.props['aria-label'] === 'Таймер отдыха')[0];
    const pick = async (v) => { await act(async () => { await select().props.onChange({ target: { value: v } }); await delay(); }); };

    await pick('90');
    assert.equal(until(), t0 + 90000, 'отдых не шёл — запустился новый на 1:30');

    // Прошло 20 секунд, поставили 2 минуты — тот же отдых, конец от его начала
    clock = t0 + 20000;
    await pick('120');
    assert.equal(until(), t0 + 120000, 'продолжается: начало прежнее, конец — через 2 минуты от него');

    // Прошло ещё 50 секунд (всего 70), поставили 60 — меньше, чем уже прошло: сразу конец
    clock = t0 + 70000;
    await pick('60');
    assert.ok(until() <= clock, 'отдых закончился сразу, а не пошёл заново: ' + (until() - clock));
  } finally {
    Date.now = realNow;
  }
});

/**
 * Новое упражнение в ходе занятия (владелец, 16.10.2026): у клиента в
 * тренировке по программе его нет, в свободной и у тренера — есть.
 */
test('клиент в тренировке по программе не добавляет упражнения; свободная и тренер — могут', async () => {
  const two = { title: 'Верх', exercises: [{ name: 'Жим лёжа', sets: '2', reps: '8' }, { name: 'Тяга блока', sets: '2', reps: '8' }] };
  const add = () => tree.root.findAllByType('button').filter(n => ['Добавить упражнение', 'Упражнение'].includes(text(n))).map(text);
  const cases = [
    { clientRow: undefined, month: 'Октябрь 2026', want: [], who: 'клиент, по программе' },
    { clientRow: undefined, month: '', want: ['Упражнение', 'Добавить упражнение'], who: 'клиент, свободная' },
    { clientRow: 3, month: 'Октябрь 2026', want: ['Упражнение', 'Добавить упражнение'], who: 'тренер, по программе' },
  ];
  for (const c of cases) {
    data.clear();
    if (tree) { tree.unmount(); tree = null; }
    await act(async () => { tree = renderer.create(React.createElement(Workout, { clientRow: c.clientRow, launch: { block: two, month: c.month }, onClose() {} })); await delay(); });
    assert.deepEqual(add(), c.want, c.who);
  }
  tree.unmount();
  tree = null;
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

test('сплит: добавленное в занятие упражнение — по подходу каждому участнику', async () => {
  const { fromPlan, newExercise } = await import('../src/workout-model.js');
  // Свободная тренировка пары: первое упражнение уже на двоих
  const free = fromPlan({ title: 'Свободная тренировка', exercises: [{ name: 'Первое упражнение', sets: 3 }] }, '', ['Евгений', 'Екатерина']);
  const added = newExercise(free);
  assert.deepEqual(added.sets.map((x) => x.who), ['Евгений', 'Екатерина'], 'второе упражнение не на одного');
  assert.ok(added.sets.every((x) => x.state === 'pending' && x.weight === ''));

  const solo = newExercise(fromPlan({ title: 'X', exercises: [{ name: 'Жим', sets: 2 }] }, '', []));
  assert.equal(solo.sets.length, 1);
  assert.equal(solo.sets[0].who, undefined);
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

test('FT-570, вариант А: шаги одной нумерацией, ошибки одним блоком, повторов нет', async () => {
  data.clear();
  const machine = {
    uid: 'shoulder-press', name: 'Technogym', kind: 'machine', photo: '/machine.jpg',
    setup: 'Рычаг — под сиденьем.\nОшибка: не тяните рычаг под нагрузкой.',
  };
  exerciseSetupResponse = { setups: { 42: {
    name: 'Жим от плеч',
    setup: 'Сиденье — рукоятки на уровне плеч.\nОшибка: не отрывайте спину от спинки.',
    notes: 'Прижмите спину к спинке. Выжимайте рукоятки вверх и плавно опускайте.\nОшибка: Не раскачивайтесь.', mistakes: 'Не раскачивайтесь.',
    machines: [machine], alternatives: [], noteKey: 'e:жим от плеч',
    muscles: { primary: ['front-deltoids'], secondary: ['triceps'] }, media: { kind: 'animation', url: 'Shoulder_Press' },
  } }, notes: {} };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block: {
        title: 'Плечи', exercises: [{ name: 'Жим от плеч', exerciseId: 42, machine, sets: '3', reps: '10', weight: '20' }],
      }, month: 'Октябрь 2026' }, onClose() {} }));
      await delay();
    });

    // Вариант А3 (24.10.2026): «Техника» — анимация, мышцы и техника листом;
    // тренажёр и его настройка — своей кнопкой рядом с настройкой клиента
    const chip = local.root.find(n => n.type === 'button' && String(n.props.className || '').includes('workout__about'));
    assert.equal(text(chip), 'Техника');
    assert.equal(chip.props['aria-label'], 'Техника: 1 шаг · видео', 'закрыто: что внутри — для чтения вслух');
    assert.equal(local.root.findAll(n => n.props && n.props.className === 'guide-sheet').length, 0, 'лист закрыт — медиа не смонтированы');
    const machineBtn = local.root.find(n => n.type === 'button' && String(n.props.className || '').includes('workout__machine-btn'));
    assert.equal(text(machineBtn), 'Тренажёр');
    assert.equal(machineBtn.props['aria-label'], 'Тренажёр: Technogym');
    const weights = () => local.root.findAllByType('input').filter(n => /подход [123], вес в кг/.test(n.props['aria-label'] || ''));
    await act(async () => { weights()[0].props.onChange({ target: { value: '37' } }); await delay(); });
    const before = weights().map(n => n.props.value);
    await act(async () => { chip.props.onClick(); await delay(); });
    const about = local.root.find(n => n.type === 'div' && n.props.className === 'guide-sheet');
    assert.equal(about.findAll(n => n.props.className === 'guide__machine-name').length, 0, 'тренажёра в технике нет');
    assert.deepEqual(about.findAll(n => n.props.className === 'guide__h').map(text), ['Чего избегать']);
    assert.equal(about.findAll(n => String(n.props.className || '').startsWith('muscles__figure')).length, 1, 'схема мышц — сразу, без кнопки');
    assert.equal(about.findAllByType('details').length, 0, 'мышцы — без вложенной раскрывашки');
    assert.ok(!text(about).includes('рукоятки на уровне плеч'), 'резервная инструкция не показана');
    assert.ok(!text(about).includes('Рычаг'), 'подготовка тренажёра — в его листе');
    assert.equal(about.findAll(n => n.props.className === 'guide__steps').length, 1);
    assert.equal(text(about).split('Не раскачивайтесь.').length - 1, 1, 'ошибка не дублируется');
    assert.ok(about.findAllByType('img').length >= 2, 'анимация в технике');
    assert.deepEqual(weights().map(n => n.props.value), before, 'введённые веса сохраняются при открытии');

    await act(async () => { machineBtn.props.onClick(); await delay(); });
    const sheets = local.root.findAll(n => n.type === 'div' && n.props.className === 'guide-sheet');
    // Лист «Тренажёр» — рядом со своей кнопкой, она в сетке раньше «Техники»
    const machineSheet = sheets.find((n) => n !== about);
    assert.deepEqual(machineSheet.findAll(n => n.props.className === 'guide__machine-name').map(text), ['Technogym']);
    assert.deepEqual(machineSheet.findAll(n => n.props.className === 'guide__h').map(text), ['Как настроить', 'Чего избегать']);
    assert.ok(text(machineSheet).includes('Не тяните рычаг под нагрузкой.'), 'ошибка тренажёра — в его листе');
    assert.ok(machineSheet.findAllByType('img').length >= 1, 'фото тренажёра');
  } finally {
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
});

// 19.10.2026: суперсет из упражнений базы падал, как только приходила их
// техника (ReferenceError: aboutView) — весь экран серый, занятие не
// сохранялось, и так при каждом открытии
test('суперсет из упражнений базы с техникой открывается; у каждого — своя «техника выполнения»', async () => {
  data.clear();
  const info = name => ({ name, setup: '', notes: 'Спина прямая.', machines: [], alternatives: [], muscles: { primary: ['lower-back'] } });
  exerciseSetupResponse = { setups: { 51: info('Гиперэкстензия'), 52: info('Отжимания от пола') }, notes: {} };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block: { title: 'Спина', exercises: [
        { name: 'Гиперэкстензия', exerciseId: 51, sets: '4', reps: '15', supersetGroup: 'g-7-8' },
        { name: 'Отжимания от пола', exerciseId: 52, sets: '4', reps: '', supersetGroup: 'g-7-8' },
      ] }, month: 'Октябрь 2026' }, onClose() {} }));
      await delay();
    });
    const about = local.root.findAll(n => n.type === 'details' && n.props.className === 'workout__setup workout__about');
    assert.deepEqual(about.map(n => text(n.findByType('summary').findAllByType('span')[0])),
      ['Гиперэкстензия: техника выполнения', 'Отжимания от пола: техника выполнения']);
    assert.ok(local.root.findAllByType('button').some(b => text(b) === 'Завершить'), 'экран занятия на месте');
  } finally {
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
});

/**
 * Тренажёр закрепляет тренер (решение владельца 16.10.2026): в занятии
 * выбирать нечего — первый подставлен сам с весом на нём, у каждого
 * тренажёра набора (гриф, скамья) своя настройка; старая настройка «по
 * упражнению» видна у первого и при правке переезжает под него.
 */
test('тренажёры закрепил тренер: выбора нет, первый сам, у каждого своя настройка, старая переезжает', async () => {
  data.clear();
  const bar = { uid: 'bar1', name: 'Гриф', kind: 'equipment' };
  const bench = { uid: 'bench1', name: 'Скамья', kind: 'equipment' };
  exerciseSetupResponse = { setups: { 77: {
    name: 'Жим лёжа', setup: '', notes: '', machines: [bar, bench], primaryEquipmentUid: 'bar1', alternatives: [], noteKey: 'e:жим лёжа',
    muscles: { primary: [], secondary: [] }, media: null,
  } }, notes: { 'm:bar1|жим лёжа': { text: 'Хват 81', by: 'client', from: 'e:жим лёжа' } } };
  const calls = [];
  const api = globalThis.__workoutApi;
  globalThis.__workoutApi = async (action, params) => {
    calls.push([action, params]);
    if (action === 'client.machine.note.save') return { note: { text: params.text, by: 'client' } };
    return api(action, params);
  };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block: {
        title: 'Грудь', exercises: [{ name: 'Жим лёжа', exerciseId: 77, sets: '3', reps: '10', weight: '60' }],
      }, month: 'Октябрь 2026' }, onClose() {} }));
      await delay();
    });
    assert.equal(local.root.findAll(n => n.props.role === 'radiogroup').length, 0, 'выбирать тренажёр нечего');
    assert.ok(calls.some(([a, q]) => a === 'workout.exercise.history' && q.machineUid === 'bar1'), 'первый подставлен сам — с весом на нём');
    // Плашками в шапке (вариант А3): у каждого тренажёра своя
    const plaques = () => local.root.findAll(n => n.type === 'button' && String(n.props.className || '').startsWith('workout__plaque'));
    assert.deepEqual(plaques().map(text), ['ГрифХват 81', 'Скамья+ Записать настройку'], 'у скамьи своя — плашкой «+ Записать»');
    const machineBtn = local.root.find(n => n.type === 'button' && String(n.props.className || '').includes('workout__machine-btn'));
    await act(async () => { machineBtn.props.onClick(); await delay(); });
    const sheet = local.root.find(n => n.type === 'div' && n.props.className === 'guide-sheet');
    assert.deepEqual(sheet.findAll(n => n.props.className === 'guide__machine-name').map(text), ['Гриф', 'Скамья'], 'основной первым, скамья под ним');
    assert.deepEqual(sheet.findAll(n => n.props.className === 'machine__note').map(text), ['Ваша настройкаХват 81'], 'настройка клиента — и в листе');

    const edit = plaques()[0];
    await act(async () => { edit.props.onClick(); await delay(); });
    await act(async () => { local.root.find(n => n.type === 'textarea' && /Спинка 3/.test(n.props.placeholder || '')).props.onChange({ target: { value: 'Хват 80' } }); await delay(); });
    await act(async () => { local.root.findAllByType('button').find(b => text(b) === 'Сохранить').props.onClick(); await delay(); });
    const saved = calls.find(([a]) => a === 'client.machine.note.save')[1];
    assert.deepEqual([saved.target, saved.text, saved.legacy], ['m:bar1|жим лёжа', 'Хват 80', 'e:жим лёжа'], 'старая переезжает под гриф — в этом упражнении (FT-759)');
  } finally {
    globalThis.__workoutApi = api;
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
});

// Рама или Смит — выбор, а не комплект (владелец, 24.10.2026): закреплена
// рама — плашка и лист «Тренажёр» только у неё
test('тренажёры на выбор: закреплённый — одной плашкой, чужой стойки нет', async () => {
  data.clear();
  const rack = { uid: 'rack1', name: 'Рама у окна', kind: 'machine' };
  const smith = { uid: 'smith1', name: 'Стойка у зеркала', kind: 'machine' };
  exerciseSetupResponse = { setups: { 79: {
    name: 'Присед', setup: '', notes: '', machines: [rack, smith], alternatives: [], noteKey: 'e:присед',
    muscles: { primary: [], secondary: [] }, media: null,
  // Старая у тренажёра без упражнения, чья — не понять (FT-759): с пометкой
  } }, notes: { 'm:rack1|присед': { text: 'Крюки на 4-й', by: 'trainer', from: 'm:rack1', shared: true } } };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block: {
        title: 'Ноги', exercises: [{ name: 'Присед', exerciseId: 79, machine: { uid: 'rack1', name: 'Рама у окна' }, sets: '3', reps: '5', weight: '60' }],
      }, month: 'Октябрь 2026' }, onClose() {} }));
      await delay();
    });
    const plaques = local.root.findAll(n => n.type === 'button' && String(n.props.className || '').startsWith('workout__plaque'));
    assert.deepEqual(plaques.map(text), ['Моя настройка · для тренажёраКрюки на 4‑й']);
    const machineBtn = local.root.find(n => n.type === 'button' && String(n.props.className || '').includes('workout__machine-btn'));
    assert.equal(machineBtn.props['aria-label'], 'Тренажёр: Рама у окна');
  } finally {
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
});

/**
 * Замена упражнения (владелец, 16.10.2026): кнопкой со списком, вес нового —
 * с прошлого раза; после первого подхода — пояснение, а не пропавшая кнопка.
 */
test('замена упражнения: кнопка, список, новое упражнение с его историей', async () => {
  data.clear();
  exerciseSetupResponse = { setups: {
    77: { name: 'Жим штанги', setup: '', notes: '', machines: [], alternatives: [{ id: 78, name: 'Жим гантелей' }], noteKey: 'e:жим штанги',
      muscles: { primary: [], secondary: [] }, media: null },
    78: { name: 'Жим гантелей', setup: '', notes: '', machines: [], alternatives: [{ id: 77, name: 'Жим штанги' }], noteKey: 'e:жим гантелей',
      muscles: { primary: [], secondary: [] }, media: null },
  }, notes: {} };
  const calls = [];
  const api = globalThis.__workoutApi;
  globalThis.__workoutApi = async (action, params) => { calls.push([action, params]); return api(action, params); };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block: {
        title: 'Грудь', exercises: [{ name: 'Жим штанги', exerciseId: 77, sets: '3', reps: '10', weight: '60' }],
      }, month: 'Октябрь 2026' }, onClose() {} }));
      await delay();
    });
    const button = (label) => local.root.findAllByType('button').find((b) => text(b) === label);
    assert.equal(button('Жим гантелей'), undefined, 'список свёрнут');
    await act(async () => { button('Заменить').props.onClick(); await delay(); });
    assert.ok(local.root.findAllByType('p').some((p) => /выберите, чем заменить/.test(text(p))), 'пояснение');
    await act(async () => { button('Жим гантелей').props.onClick(); await delay(); });
    assert.ok(local.root.findAllByType('h3').some((n) => text(n).includes('Жим гантелей')), 'упражнение заменено');
    assert.ok(calls.some(([a, q]) => a === 'workout.exercise.history' && Number(q.exerciseId) === 78), 'вес — с прошлого раза на новом');
    await act(async () => { button('Заменить').props.onClick(); await delay(); });
    assert.ok(button('Жим штанги'), 'вернуться — тем же списком');
  } finally {
    globalThis.__workoutApi = api;
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
});

test('тренажёр сменился: веса по нулям, подсказка — что было на прежнем (16.10.2026)', async () => {
  const { withMachine } = await import('../src/workout-model.js');
  const { otherMachineText } = await import('../src/effort.js');
  const other = { date: '2026-10-15', machine: 'Тяга с дисками', weights: ['35', '40', '45', '50'], reps: ['15', '15', '15', '15'] };
  const ex = withMachine({ name: 'Вертикальная тяга', sets: [{ weight: '', reps: '15', state: 'pending', kind: 'work' }] },
    { uid: 'tg1', name: 'Technogym' }, { lastWeight: '', otherRun: other });
  assert.deepEqual(ex.otherRun, other);
  assert.equal(ex.sets[0].weight, '', 'вес с другого тренажёра не подставлен');
  assert.equal(otherMachineText(ex.otherRun),
    'Последний раз (15.10) вы делали это упражнение на тренажёре «Тяга с дисками»: 35 · 40 · 45 · 50 кг на 15 повторов. Здесь тренажёр другой — впишите вес заново.');
  assert.equal(withMachine(ex, { uid: 'd1', name: 'Тяга с дисками' }, { lastWeight: '50' }).otherRun, undefined, 'на прежнем — подсказки нет');
});

test('«делал под другим названием?» — только тренеру и только без истории (16.10.2026)', async () => {
  data.clear();
  exerciseSetupResponse = { setups: { 90: { name: 'Подтягивания узким хватом с резиновой петлёй', setup: '', notes: '', machines: [], alternatives: [],
    noteKey: 'e:подтягивания', muscles: { primary: [], secondary: [] }, media: null } }, notes: {} };
  // Вариант А2 (24.10.2026): пункт меню «Ещё» у упражнения
  const has = async (node) => {
    const more = node.root.findAllByType('button').find((b) => b.props['aria-label'] === 'Подтягивания узким хватом с резиновой петлёй: ещё');
    if (!more) return false;
    await act(async () => { more.props.onClick(); await delay(); });
    const item = node.root.findAllByType('button').find((b) => text(b) === 'Делали под другим названием');
    if (!item) return false;
    await act(async () => { item.props.onClick(); await delay(); });
    return node.root.findAll((n) => n.type === 'p' && /Что из журнала/.test(text(n))).length === 1;
  };
  let local;
  try {
    for (const [clientRow, seen] of [[undefined, false], [3, true]]) {
      await act(async () => {
        local = renderer.create(React.createElement(Workout, { clientRow, launch: { block: {
          title: 'Спина', exercises: [{ name: 'Подтягивания узким хватом с резиновой петлёй', exerciseId: 90, sets: '4', reps: '12' }],
        }, month: 'Октябрь 2026' }, onClose() {} }));
        await delay();
      });
      assert.equal(await has(local), seen, clientRow ? 'тренер видит и открывает' : 'клиент не видит');
      local.unmount();
      local = null;
    }
  } finally {
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
});

test('«делал под другим названием?» — и в идущем занятии, когда часть подходов сделана (16.10.2026)', async () => {
  data.clear();
  exerciseSetupResponse = { setups: { 90: { name: 'Жим над головой в тренажёре с дисками', setup: '', notes: '', machines: [], alternatives: [],
    noteKey: 'e:жим', muscles: { primary: [], secondary: [] }, media: null } }, notes: {} };
  const has = (node) => node.root.findAllByType('button').some((b) => text(b) === 'Это упражнение делали под другим названием?');
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block: {
        title: 'Плечи', exercises: [{ name: 'Жим над головой в тренажёре с дисками', exerciseId: 90, sets: '3', reps: '12', weight: '20', prevWeight: '20' }],
      }, month: 'Октябрь 2026' }, onClose() {} }));
      await delay();
    });
    const button = (label) => local.root.findAllByType('button').find((b) => text(b) === label);
    assert.equal(has(local), false, 'есть прошлый вес — под упражнением ссылки нет');
    await act(async () => { button('Норм').props.onClick(); await delay(); });
    assert.equal(has(local), false, 'подход сделан — под упражнением ссылки тоже нет');
    // Название — касанием: в панели ссылка есть, пока занятие идёт
    await act(async () => { local.root.findByProps({ className: 'workout__name-tap' }).props.onClick(); await delay(); });
    assert.equal(has(local), true, 'в панели упражнения — можно перенести и посреди занятия');
    await act(async () => { button('Готово').props.onClick(); await delay(); });
    assert.equal(has(local), false, 'панель закрыта — ссылки нет');
  } finally {
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
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
      local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
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
    // Пока висит «Вернуть», отметили подход — «Вернуть» кладёт на место
    // только удалённый, отметка остаётся (аудит 24.10.2026: раньше
    // возвращался снимок всего занятия, и отметка пропадала)
    await press('Норм');
    const stop = local.root.findAllByType('button').find(x => text(x) === 'Закончить отдых');
    if (stop) await act(async () => { stop.props.onClick(); await delay(); });
    await press('Вернуть');
    assert.equal(sets(), 6, 'вернулся');
    const done = () => local.root.findAll(n => n.type === 'div' && String(n.props.className || '').split(' ').includes('workout__set--done'));
    assert.equal(done().length, 1, 'подход, отмеченный после удаления, остался отмеченным');
    assert.ok(!local.root.findAllByType('span').some(x => text(x) === 'Подход удалён'), 'плашка ушла');

    await openMore(local.root);
    await press('Выбрать упражнения');
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
      local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const button = label => local.root.findAllByType('button').find(b => text(b) === label);
    const press = async b => { assert.ok(b); await act(async () => { b.props.onClick(); await delay(); }); };
    // Меню «Упражнения суперсета» нет (FT-513): правка — касанием в круге
    assert.ok(!local.root.findAllByType('summary').some(n => text(n) === 'Упражнения суперсета'));
    // Касание названия — название, вид, у кардио — аэробное или функциональное
    await press(button('Аэробайк'));
    assert.ok(button('Кардио'), 'вид — в панели названия');
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
      local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const byLabel = label => local.root.findAllByType('button').find(b => b.props['aria-label'] === label);
    const button = label => local.root.findAllByType('button').find(b => text(b) === label);
    const press = async b => { assert.ok(b); await act(async () => { b.props.onClick(); await delay(); }); };
    const sets = () => local.root.findAllByType('input').filter(n => /^Жим ногами, подход \d, повторы$/.test(n.props['aria-label'] || ''));
    assert.ok(!local.root.findAllByType('summary').some(n => text(n) === 'Изменить упражнение'), 'меню нет');
    await press(byLabel('Жим ногами: ещё'));
    await press(button('Подходы, вес и отдых'));
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
      local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    const input = label => local.root.findAllByType('input').find(n => n.props['aria-label'] === label);
    const press = async b => { assert.ok(b); await act(async () => { b.props.onClick(); await delay(); }); };
    // Первый круг сделан: у аэробайка вписали расстояние, оба отмечены
    await act(async () => { input('Аэробайк, отрезок 1, расстояние, м').props.onChange({ target: { value: '100' } }); await delay(); });
    const round1 = () => local.root.findAllByProps({ className: 'workout__round' })[0];
    await press(round1().findAll(n => n.type === 'button' && text(n) === 'Норм')[0]);
    await press(round1().findAll(n => n.type === 'button' && text(n) === 'Норм')[0]);
    assert.ok(local.root.findAll(n => n.type === 'p' && text(n) === 'Круг 1 выполнен').length);
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

test('клиент не меняет ни названия, ни состава занятия — только подходы (09.10.2026, FT-531)', async () => {
  data.clear();
  const block = { title: 'Ноги', exercises: [
    { name: 'Жим ногами', sets: '3', reps: '12', weight: '100' },
    { name: 'Подтягивания', supersetGroup: 'A', sets: '2', reps: '8', weight: '' },
    { name: 'Отжимания', supersetGroup: 'A', sets: '2', reps: '15', weight: '' },
  ] };
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Сентябрь 2026' }, onClose() {} }));
      await delay();
    });
    assert.equal(local.root.findAllByType('button').find(b => text(b) === 'Жим ногами'), undefined, 'название — текстом, не кнопкой');
    const buttons = () => local.root.findAllByType('button');
    assert.deepEqual(buttons().map(b => b.props['aria-label'] || '').filter(l => /^[^,]+: настройки$/.test(l)), [], 'меню настроек под названием — нет, и в суперсете');
    assert.ok(!buttons().some(b => text(b) === 'Выбрать'), '«Выбрать» — нет');
    assert.ok(!buttons().some(b => text(b) === 'Разъединить'), '«Разъединить» — нет');
    assert.ok(buttons().find(b => text(b) === 'Добавить подход'), 'добавить подход — может');
    assert.ok(local.root.findAllByType('input').find(n => n.props['aria-label'] === 'Жим ногами, подход 1, вес в кг'), 'вес в строке подхода — правит');

    // FT-532: разминочный — сверху, перед рабочими, половина веса кратно 2,5
    const weight = (n) => local.root.findAllByType('input').find(x => x.props['aria-label'] === `Жим ногами, подход ${n}, вес в кг`);
    const warm = buttons().find(b => text(b) === '+ Разминка');
    assert.ok(warm, 'кнопка рядом с «Добавить подход» — и у клиента');
    await act(async () => { warm.props.onClick(); await delay(); });
    assert.equal(weight(1).props.value, '50');
    assert.equal(weight(2).props.value, '100', 'рабочие — после разминки');
    assert.equal(weight(4).props.value, '100');
    // Второй разминочный — после первого, всё ещё перед рабочими
    await act(async () => { buttons().find(b => text(b) === '+ Разминка').props.onClick(); await delay(); });
    assert.equal(weight(2).props.value, '50');
    assert.equal(weight(3).props.value, '100');
    assert.equal(local.root.findAll(n => n.type === 'span' && n.props.className === 'workout__set-sub' && text(n) === 'Разминка').length, 2, 'оба помечены «Разминка» (было «1 · Р»)');
  } finally {
    if (local) local.unmount();
  }
});

test('19.10.2026: чужая отметка приходит сама — экран ждёт изменений (workout.wait), не дожидаясь возврата', async () => {
  data.clear();
  const asked = [];
  let release;
  globalThis.__workoutWait = (action, params) => {
    asked.push(params.revision);
    return new Promise(resolve => { release = resolve; });
  };
  try {
    await mount();
    await saveNow();
    await act(async () => { await new Promise(r => setTimeout(r, 1300)); });
    assert.ok(asked.length >= 1, 'экран ждёт изменений');
    assert.equal(asked[asked.length - 1], 1, 'с версией, которая у него есть');

    const key = 'workout_demo_server:3';
    const stored = JSON.parse(data.get(key));
    const remote = JSON.parse(JSON.stringify(stored[stored.length - 1]));
    remote.exercises[0].sets[0].weight = '77';
    remote.exercises[0].sets[0].state = 'done';
    remote.revision += 1;
    await act(async () => { release({ session: remote }); await delay(); });
    const weight = tree.root.findAll(n => n.type === 'input' && typeof n.props['aria-label'] === 'string'
      && n.props['aria-label'].includes('подход 1, вес в кг'))[0];
    assert.equal(weight.props.value, '77', 'отметка с другого устройства на экране');
  } finally {
    globalThis.__workoutWait = null;
    if (release) release({ same: true });
  }
});

test('19.10.2026: сервер влил занятие в идущее (начали без связи, клиент вёл своё) — экран ведёт идущее', async () => {
  data.clear();
  await mount();
  await saveNow();
  const key = 'workout_demo_server:3';
  const stored = JSON.parse(data.get(key));
  const own = stored[stored.length - 1];
  const twin = { ...JSON.parse(JSON.stringify(own)), id: 'twin-session-0001', title: 'Тренировка клиента', revision: 7 };
  twin.exercises[0].sets[0].state = 'done';
  const real = globalThis.__workoutApi;
  globalThis.__workoutApi = async (action, params) => {
    if (action === 'workout.save' && params.session.id === own.id) return { session: twin, absorbed: own.id };
    if (action === 'workout.get' && params.id === twin.id) return { session: twin };
    return real(action, params);
  };
  try {
    const weightInput = () => tree.root.findAll(n => n.type === 'input' && typeof n.props['aria-label'] === 'string'
      && n.props['aria-label'].includes('подход 1, вес в кг'))[0];
    await act(async () => { weightInput().props.onChange({ target: { value: '41' } }); await delay(); });
    await saveNow();
    assert.ok(text(tree.root.findByType('h2')).includes('Тренировка клиента'), 'на экране идущее занятие');
    assert.ok(!tree.root.findAll(n => n.props && n.props.role === 'alert').some(n => text(n).includes('Уже есть текущее занятие')), 'без выбора версии');
    const draft = Object.entries(Object.fromEntries(data)).find(([k, v]) => k.startsWith('workout_draft') && v.includes('twin-session-0001'));
    assert.ok(draft, 'черновик — идущего занятия');
  } finally {
    globalThis.__workoutApi = real;
  }
});

test('19.10.2026: нажали «Легко» вместо «Норм» — оценку можно поменять, прибавленный вес возвращается', async () => {
  data.clear();
  await mount();
  const weightOf = n => tree.root.findAll(x => x.type === 'input' && typeof x.props['aria-label'] === 'string'
    && x.props['aria-label'].includes(`подход ${n}, вес в кг`))[0].props.value;
  // Оценка сделанного — словом под номером подхода, не цветной точкой (аудит 24.10.2026)
  const marks = () => tree.root.findAll(x => x.type === 'span' && x.props && x.props.className === 'workout__set-sub').map(text);

  await click('Легко');
  assert.equal(weightOf(1), '40');
  assert.equal(weightOf(2), '50', '«Легко» прибавило вес следующему подходу (шаг приседа — 10)');
  assert.deepEqual(marks(), ['Легко']);

  // Номер подхода → «Как прошло?»
  const num = () => tree.root.findAll(x => x.type === 'button' && /подход 1: настройки/.test(x.props['aria-label'] || ''))[0];
  await act(async () => { await num().props.onClick(); await delay(); });
  const group = () => tree.root.findAll(x => x.props && x.props['aria-label'] === 'Как прошёл подход')[0];
  assert.ok(group(), 'у отмеченного подхода есть выбор оценки');
  const pressed = group().findAll(x => x.type === 'button').filter(b => b.props['aria-pressed']).map(b => text(b));
  assert.deepEqual(pressed, ['Легко']);
  const norm = group().findAll(x => x.type === 'button' && text(x) === 'Норм')[0];
  await act(async () => { await norm.props.onClick(); await delay(); });

  assert.equal(weightOf(2), '40', 'прибавка ушла вместе с прежней оценкой');
  assert.deepEqual(marks(), ['Норм'], 'оценка стала «Норм»');
  assert.ok(!group(), 'панель закрылась');

  // Обратно «Легко» — прибавка снова есть; «Снять отметку» возвращает вес
  await act(async () => { await num().props.onClick(); await delay(); });
  const easy = group().findAll(x => x.type === 'button' && text(x) === 'Легко')[0];
  await act(async () => { await easy.props.onClick(); await delay(); });
  assert.equal(weightOf(2), '50');
  await act(async () => { await num().props.onClick(); await delay(); });
  const snap = tree.root.findAll(x => x.type === 'button' && text(x) === 'Снять отметку')[0];
  await act(async () => { await snap.props.onClick(); await delay(); });
  assert.equal(weightOf(2), '40');
  assert.deepEqual(marks(), []);
});

/**
 * Отдых по упражнению (20.10.2026): в программе у упражнения свой отдых
 * (technique rest120) — после его подхода таймер идёт две минуты, а не общие
 * полторы; у упражнения без своего — общий отдых занятия
 */
test('отдых упражнения из программы важнее общего отдыха занятия', async () => {
  data.clear();
  let local;
  await act(async () => {
    local = renderer.create(React.createElement(Workout, { launch: { block: { title: 'Ноги', exercises: [
      { name: 'Присед со штангой', sets: '2', reps: '5', weight: '100', technique: 'rest180' },
      { name: 'Разгибания ног', sets: '2', reps: '12', weight: '40' },
    ] }, month: 'Октябрь 2026' }, onClose() {} }));
    await delay();
  });
  const rest = () => local.root.findAll(n => n.props && n.props.role === 'dialog' && /^rest-screen/.test(n.props.className || ''));
  const timer = () => local.root.findAll(n => n.props && n.props.role === 'timer')[0];
  const mark = async (label) => {
    const btn = local.root.findAll(n => n.type === 'button' && text(n) === label)[0];
    await act(async () => { await btn.props.onClick(); await delay(); });
  };
  await mark('Норм');
  assert.equal(rest().length, 1);
  assert.match(text(timer()), /^(3:00|2:59)$/, 'у приседа свой отдых — 3 минуты');
  await act(async () => {
    const stop = local.root.findAll(n => n.type === 'button' && /Закончить отдых/.test(text(n)))[0];
    await stop.props.onClick();
    await delay();
  });
  await mark('Тяжело');
  assert.match(text(timer()), /^(4:00|3:59)$/, '«тяжело» — +60 с к своему отдыху (22.10.2026)');
  await act(async () => {
    const stop = local.root.findAll(n => n.type === 'button' && /Закончить отдых/.test(text(n)))[0];
    await stop.props.onClick();
    await delay();
  });
  await mark('Норм');
  assert.match(text(timer()), /^(1:30|1:29)$/, 'у разгибаний своего отдыха нет — общий 1:30');
  local.unmount();
});

test('отдых упражнения меняется в занятии: панель настроек → чипы → таймер по новому', async () => {
  data.clear();
  let local;
  await act(async () => {
    local = renderer.create(React.createElement(Workout, { clientRow: 3, launch: { block: { title: 'Ноги', exercises: [
      { name: 'Жим ногами', sets: '2', reps: '12', weight: '100' },
    ] }, month: 'Октябрь 2026' }, onClose() {} }));
    await delay();
  });
  const byLabel = label => local.root.findAllByType('button').find(b => b.props['aria-label'] === label);
  const press = async b => { assert.ok(b); await act(async () => { b.props.onClick(); await delay(); }); };
  await press(byLabel('Жим ногами: ещё'));
  await press(local.root.findAllByType('button').find(b => text(b) === 'Подходы, вес и отдых'));
  const chips = local.root.findAll(n => n.props && n.props.role === 'radiogroup' && n.props['aria-label'] === 'Отдых после подхода');
  assert.equal(chips.length, 1, 'в панели настроек — отдых упражнения');
  await press(chips[0].findAll(n => n.type === 'button' && text(n) === '2:00')[0]);
  await press(local.root.findAllByType('button').find(b => text(b) === 'Норм'));
  const timer = local.root.findAll(n => n.props && n.props.role === 'timer')[0];
  assert.match(text(timer), /^(2:00|1:59)$/, 'отдых две минуты — выбранный у упражнения');
  local.unmount();
});

test('время занятия с сервера досчитывается от его updatedAt, а не от открытия (22.10.2026)', async () => {
  const { serverTick } = await import('../src/workout-model.js');
  const now = Date.parse('2026-10-22T18:00:00Z');
  const at = (min) => new Date(now - min * 60000).toISOString();
  // Сохранили 15 минут назад, телефон был заблокирован — эти 15 минут — тренировка
  assert.equal(serverTick({ status: 'active', updatedAt: at(15) }, now), now - 15 * 60000);
  // На паузе и завершённое не идут
  assert.equal(serverTick({ status: 'paused', updatedAt: at(15) }, now), now);
  assert.equal(serverTick({ status: 'completed', updatedAt: at(15) }, now), now);
  // Забытое со вчера — не больше трёх часов; часы сервера впереди — не в будущее
  assert.equal(serverTick({ status: 'active', updatedAt: at(24 * 60) }, now), now - 3 * 3600000);
  assert.equal(serverTick({ status: 'active', updatedAt: at(-2) }, now), now);
  assert.equal(serverTick({ status: 'active' }, now), now);
});

/**
 * Аудит 24.10.2026, «прыжки»: после показа занятия ничего не вставляется в
 * поток над шапкой. Проверка подхода — под самим подходом; ошибки связи —
 * плашкой, которая не пропадает от касания и одна несёт «Повторить».
 */
test('аудит 24.10.2026: «Введите вес» — под подходом, ошибка связи — плашкой с «Повторить», шапка первая', async () => {
  data.clear();
  let local;
  try {
    await act(async () => {
      local = renderer.create(React.createElement(Workout, { launch: { block: { title: 'Без веса', exercises: [{ name: 'Жим', sets: 2, reps: '8', weight: '' }] }, month: 'Октябрь 2026' }, onClose() {} }));
      await delay();
    });
    const screen = local.root.find(n => n.type === 'div' && String(n.props.className || '').split(' ').includes('workout'));
    assert.ok(screen.props.className.includes('workout--session'), 'класс занятия — с первого кадра (шапка приложения не ужимается позже)');
    assert.equal(screen.children[0].type, 'header', 'шапка занятия — первая');
    assert.equal(local.root.findAll(n => n.props && n.props.role === 'status' && /Открываем журнал/.test(text(n))).length, 0, 'строки загрузки под шапкой нет');
    const pick = () => local.root.findAllByType('button').find(b => text(b) === 'Норм');
    await act(async () => { pick().props.onClick(); await delay(); });
    const lack = local.root.findAll(n => n.type === 'p' && n.props.className === 'workout__round-lack');
    assert.equal(lack.length, 1);
    assert.equal(lack[0].props.role, 'alert');
    assert.match(text(lack[0]), /Введите вес/);
    assert.equal(local.root.findAll(n => String(n.props.className || '').includes('workout__alert')).length, 0, 'это не плашка ошибки');
    assert.equal(screen.children[0].type, 'header', 'и шапка по-прежнему первая');
    const weight = () => local.root.findAllByType('input').find(n => /Жим, подход 1, вес/.test(n.props['aria-label'] || ''));
    await act(async () => { weight().props.onChange({ target: { value: '50' } }); await delay(); });
    assert.equal(local.root.findAll(n => n.type === 'p' && n.props.className === 'workout__round-lack').length, 0, 'вписали — подсказка ушла');

    // Нет связи при сохранении — плашка с «Повторить»; следующее касание её не снимает
    offline = true;
    await act(async () => { await hideOnce(); await delay(); });
    const alert = () => local.root.findAll(n => n.type === 'div' && n.props.role === 'alert' && String(n.props.className || '').includes('workout__alert'));
    assert.equal(alert().length, 1);
    assert.match(text(alert()[0]), /Не сохранено в облаке/);
    assert.ok(alert()[0].findAll(n => n.type === 'button' && text(n) === 'Повторить').length === 1);
    await act(async () => { weight().props.onChange({ target: { value: '52' } }); await delay(); });
    assert.equal(alert().length, 1, 'плашка стоит, пока не сохранится');
    assert.equal(screen.children[0].type, 'header');
    offline = false;
    await act(async () => { alert()[0].findAll(n => n.type === 'button' && text(n) === 'Повторить')[0].props.onClick(); await delay(); });
    assert.equal(alert().length, 0, 'сохранилось — плашки нет');
    // «Повторить» досылает тот же снимок (50), вписанное после — следующим сохранением
    await saveNow();
    assert.equal(JSON.parse(data.get('workout_demo_server:3'))[0].exercises[0].sets[0].weight, '52');
  } finally {
    offline = false;
    if (local) local.unmount();
  }
});

test('аудит 24.10.2026: место под настройки упражнения занято заранее, тренажёр подставляется без вибрации', async () => {
  data.clear();
  const bar = { uid: 'bar1', name: 'Гриф', kind: 'equipment' };
  const info = { setups: { 77: {
    name: 'Жим лёжа', setup: '', notes: '', machines: [bar], primaryEquipmentUid: 'bar1', alternatives: [], noteKey: 'e:жим лёжа',
    muscles: { primary: [], secondary: [] }, media: null,
  } }, notes: {} };
  const buzz = [];
  globalThis.__haptic = (...a) => buzz.push(a);
  let release;
  exerciseSetupResponse = new Promise(resolve => { release = resolve; });
  const block = { title: 'Грудь', exercises: [{ name: 'Жим лёжа', exerciseId: 77, sets: '3', reps: '10', weight: '' }, { name: 'Своё', sets: '2', reps: '10', weight: '5' }] };
  let local;
  try {
    await act(async () => { local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Октябрь 2026' }, onClose() {} })); await delay(); });
    const waits = () => local.root.findAll(n => n.type === 'div' && String(n.props.className || '').includes('workout__extras-wait'));
    assert.equal(waits().length, 1, 'скелетон — только у упражнения из базы, пока настройки в пути');
    await act(async () => { release(info); await delay(); });
    assert.equal(waits().length, 0, 'приехали — на месте скелетона настройки');
    assert.ok(local.root.findAll(n => n.type === 'button' && String(n.props.className || '').includes('workout__about')).length === 1);
    assert.ok(local.root.findAll(n => n.type === 'p' && /Здесь ещё не делали/.test(text(n))).length === 1, 'подсказка про вес на месте');
    assert.equal(buzz.length, 0, 'тренажёр подставлен сам — телефон не вибрирует');
    // Подсказка не пропадает на первой цифре — только после отметки подхода
    const weight = () => local.root.findAllByType('input').find(n => /Жим лёжа, подход 1, вес/.test(n.props['aria-label'] || ''));
    await act(async () => { weight().props.onChange({ target: { value: '6' } }); await delay(); });
    assert.ok(local.root.findAll(n => n.type === 'p' && /Здесь ещё не делали/.test(text(n))).length === 1, 'вписали цифру — подсказка стоит');
    await act(async () => { weight().props.onChange({ target: { value: '60' } }); await delay(); });
    await act(async () => { local.root.findAllByType('button').find(b => text(b) === 'Норм').props.onClick(); await delay(); });
    assert.equal(local.root.findAll(n => n.type === 'p' && /Здесь ещё не делали/.test(text(n))).length, 0, 'отметили подход — подсказка ушла');
    local.unmount(); local = null;

    // Сохранённые настройки (offline-prefetch, прошлое открытие) — сразу, без скелетона
    data.clear();
    globalThis.__workoutStale = (action) => (action === 'exercise.setup' ? info : null);
    exerciseSetupResponse = new Promise(() => {});
    await act(async () => { local = renderer.create(React.createElement(Workout, { launch: { block, month: 'Октябрь 2026' }, onClose() {} })); await delay(); });
    assert.equal(waits().length, 0, 'из запаса — без скелетона');
    assert.ok(local.root.findAll(n => n.type === 'button' && String(n.props.className || '').includes('workout__about')).length === 1);
  } finally {
    globalThis.__haptic = null;
    globalThis.__workoutStale = null;
    exerciseSetupResponse = null;
    if (local) local.unmount();
  }
});
