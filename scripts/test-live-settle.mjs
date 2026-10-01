/**
 * Плашка iPhone при запуске приложения (live-settle.js, 01.10.2026):
 * «Завершить» с плашки сохраняется без экрана тренировки, забытая плашка
 * убирается. Настоящие модули, подменены мост Capacitor, API и ключ черновика.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const fake = {};
const reset = () => Object.assign(fake, { calls: [], live: {}, actions: [], server: null, saveFails: false, saved: [] });
reset();
globalThis.__f = fake;

const stubs = {
  'native-bridge': `
    const f = () => globalThis.__f;
    export const isNativeApp = () => true;
    export const bridge = () => ({ isPluginAvailable: () => true });
    export const plugin = () => ({
      live: async () => f().live,
      takeActions: async ({ sessionId } = {}) => { const a = f().actions.filter((x) => !sessionId || x.sessionId === sessionId); f().actions = f().actions.filter((x) => !a.includes(x)); return { actions: a }; },
      end: async () => { f().calls.push('end'); },
      update: async () => ({ shown: true }),
    });`,
  api: `
    const f = () => globalThis.__f;
    export const apiPublic = async (action, p) => { f().calls.push(action + ':' + JSON.stringify(p)); if (!f().server) throw Object.assign(new Error('нет'), { code: 'not_found' }); return { session: f().server }; };
    export const apiMutate = async (action, p) => {
      if (f().saveFails) throw new Error('Нет связи');
      f().saved.push(p);
      return { session: { ...p.session, revision: p.revision + 1 } };
    };`,
  'workout-draft': `export const storageKey = async (row) => 'draft:' + (row || 'self');`,
};

const dir = mkdtempSync(join(tmpdir(), 'live-settle-'));
const out = join(dir, 'live-settle.mjs');
await build({
  stdin: { contents: "export * from './src/live-settle.js'; export { setWorkoutOpen, endWorkoutActivity, showWorkoutActivity } from './src/native-activity.js';", resolveDir: '.', loader: 'js' },
  bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(native-bridge|api|workout-draft)\.js$/ }, (a) => ({ path: a.path.slice(2, -3), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
});
const live = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const session = (extra = {}) => ({
  id: 's1', title: 'Верх', status: 'active', elapsedMs: 600000, restUntil: 0, revision: 4,
  exercises: [{ id: 'e1', name: 'Жим', sets: [
    { state: 'done', weight: '60', reps: '8' }, { state: 'pending', weight: '60', reps: '8' }, { state: 'pending', weight: '60', reps: '8' },
  ] }],
  ...extra,
});

test('«Завершить» на плашке: подход с плашки засчитан, остальное пропущено, сохранено на сервер', async () => {
  reset(); store.clear();
  fake.server = session();
  fake.live = { finished: ['s1'], owner: { sessionId: 's1', clientRow: 7 } };
  fake.actions = [
    { kind: 'done', sessionId: 's1', exerciseId: 'e1', who: '', weight: '62.5', setIndex: 1 },
    { kind: 'finish', sessionId: 's1' },
    { kind: 'weight', sessionId: 'other', exerciseId: 'x', value: '10' },
  ];
  await live.settleLive();
  assert.equal(fake.saved.length, 1);
  const saved = fake.saved[0];
  assert.equal(saved.clientRow, 7);
  assert.equal(saved.revision, 4);
  assert.equal(saved.session.status, 'completed');
  assert.deepEqual(saved.session.exercises[0].sets.map((s) => s.state), ['done', 'done', 'skipped']);
  assert.equal(saved.session.exercises[0].sets[1].weight, '62.5');
  assert.equal(fake.actions.length, 1, 'чужое занятие ждёт свой экран');
  assert.equal(JSON.parse(store.get('draft:7')).dirty, false);
});

test('нет связи — черновик остаётся несохранённым и завершённым: экран тренировки досохранит', async () => {
  reset(); store.clear();
  fake.server = session();
  fake.saveFails = true;
  fake.live = { finished: ['s1'] };
  store.set('fittrack_live_v1', JSON.stringify({ sessionId: 's1', clientRow: 0 }));
  fake.actions = [{ kind: 'finish', sessionId: 's1' }];
  await live.settleLive();
  const draft = JSON.parse(store.get('draft:self'));
  assert.equal(draft.dirty, true);
  assert.equal(draft.session.status, 'completed');
});

test('несохранённый черновик на телефоне свежее сервера — берём его', async () => {
  reset(); store.clear();
  fake.server = session();
  store.set('draft:3', JSON.stringify({ session: session({ revision: 2, exercises: [{ id: 'e1', name: 'Жим', sets: [{ state: 'done', weight: '70', reps: '5' }, { state: 'pending', weight: '70', reps: '5' }] }] }), revision: 2, dirty: true, tick: Date.now() }));
  fake.live = { finished: ['s1'], owner: { sessionId: 's1', clientRow: 3 } };
  fake.actions = [{ kind: 'finish', sessionId: 's1' }];
  await live.settleLive();
  assert.equal(fake.saved[0].revision, 2);
  assert.equal(fake.saved[0].session.exercises[0].sets[0].weight, '70');
  assert.ok(!fake.calls.some((c) => c.startsWith('workout.get')), 'сервер не спрашивали');
});

test('забытая плашка: занятие уже закрыто — убрать; ещё идёт — оставить', async () => {
  reset(); store.clear();
  fake.server = session({ status: 'completed' });
  fake.live = { sessionId: 's1', owner: { sessionId: 's1', clientRow: 5 }, finished: [] };
  await live.settleLive();
  assert.deepEqual(fake.calls.filter((c) => c === 'end'), ['end']);

  reset();
  fake.server = session();
  fake.live = { sessionId: 's1', owner: { sessionId: 's1', clientRow: 5 }, finished: [] };
  await live.settleLive();
  assert.ok(!fake.calls.includes('end'));
});

test('чьё занятие — неизвестно: убрать, только если плашка не менялась больше 4 часов', async () => {
  reset(); store.clear();
  const now = Date.now();
  fake.live = { sessionId: 's9', updatedAt: now - 60 * 60 * 1000, finished: [] };
  await live.settleLive(now);
  assert.ok(!fake.calls.includes('end'));
  fake.live = { sessionId: 's9', updatedAt: now - 5 * 60 * 60 * 1000, finished: [] };
  await live.settleLive(now);
  assert.ok(fake.calls.includes('end'));
});

test('экран тренировки открыт — нажатое забирает он, здесь ничего', async () => {
  reset(); store.clear();
  fake.server = session();
  fake.live = { finished: ['s1'], owner: { sessionId: 's1', clientRow: 7 } };
  fake.actions = [{ kind: 'finish', sessionId: 's1' }];
  live.setWorkoutOpen(true);
  await live.settleLive();
  live.setWorkoutOpen(false);
  assert.equal(fake.saved.length, 0);
  assert.equal(fake.actions.length, 1);
});

test('после перезапуска приложения завершённое занятие убирает свою плашку, чужое — нет', async () => {
  reset(); store.clear();
  store.set('fittrack_live_v1', JSON.stringify({ sessionId: 's1', clientRow: 0 }));
  await live.endWorkoutActivity('s2');
  assert.ok(!fake.calls.includes('end'), 'чужое занятие');
  await live.endWorkoutActivity('s1');
  assert.ok(fake.calls.includes('end'), 'своё — убрали, хотя страница его не показывала');
  assert.equal(store.get('fittrack_live_v1'), undefined);
});
