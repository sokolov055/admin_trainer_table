/**
 * Тренировки без сети (FT-566): очередь занятий на телефоне.
 *
 * Клиент две недели без связи проводит тренировки одну за другой. Каждая
 * сразу видна в «Выполненных», а когда связь вернулась — уходит на сервер
 * ровно один раз, с тем же номером сохранения при повторе. Конфликт и отказ
 * сервера не решаются молча, чужие записи на том же телефоне не видны.
 *
 * Настоящие модули очереди и аккаунта; подменены хранилище (Map вместо
 * IndexedDB — настоящее проверяет браузерный тест), API и черновик.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const local = new Map();
globalThis.localStorage = {
  getItem: (k) => (local.has(k) ? local.get(k) : null),
  setItem: (k, v) => local.set(k, String(v)),
  removeItem: (k) => local.delete(k),
};

const fake = {};
const reset = () => Object.assign(fake, {
  db: { outbox: new Map(), sessions: new Map(), media: new Map(), meta: new Map() },
  online: true, saved: [], answer: null, list: null, open: false, failWrite: false,
});
reset();
globalThis.__f = fake;

const stubs = {
  'offline-db': `
    const f = () => globalThis.__f;
    const st = (s) => f().db[s];
    const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    export const dbGet = async (s, k) => copy(st(s).get(k));
    export const dbPut = async (s, k, v) => { if (f().failWrite) throw new Error('диск полон'); st(s).set(k, copy(v)); };
    export const dbDelete = async (s, k) => { st(s).delete(k); };
    export const dbList = async (s, p) => [...st(s).entries()].filter(([k]) => k.startsWith(p)).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value: copy(value) }));
    export const dbReplace = async (s, p, entries) => { [...st(s).keys()].filter((k) => k.startsWith(p)).forEach((k) => st(s).delete(k)); entries.forEach(({ key, value }) => st(s).set(key, copy(value))); };
    export const dbClear = (s, p) => dbReplace(s, p, []);
    export const askPersistent = async () => false;`,
  api: `
    const f = () => globalThis.__f;
    const offline = () => Object.assign(new Error('Сервер не отвечает.'), { code: 0 });
    export const apiMutate = async (action, p) => {
      if (!f().online) throw offline();
      f().saved.push(JSON.parse(JSON.stringify(p)));
      const a = f().answer ? f().answer(p) : null;
      if (a instanceof Error) throw a;
      return a || { session: { ...p.session, revision: p.revision + 1, updatedAt: '2026-10-15T10:00:00.000Z' } };
    };
    export const apiWait=()=>new Promise(()=>{}); export const apiPublic = async (action) => {
      if (!f().online) throw offline();
      if (action === 'workout.list') return f().list || { sessions: [] };
      throw Object.assign(new Error('нет'), { code: 404 });
    };
    export const apiFresh = async (action, p) => {
      if (f().online) return { data: action === 'workout.list' ? (f().list || { sessions: [] }) : {}, offline: false, at: 1 };
      if (action === 'workout.list' && f().list) return { data: f().list, offline: true, at: 1 };
      throw offline();
    };`,
  'workout-draft': `export const storageKey = async (row) => 'draft:' + (row || 'self');`,
  'native-activity': `export const isWorkoutOpen = () => globalThis.__f.open;`,
};

const dir = mkdtempSync(join(tmpdir(), 'offline-workouts-'));
const out = join(dir, 'outbox.mjs');
await build({
  stdin: {
    contents: "export * from './src/workout-outbox.js'; export * from './src/offline-account.js';",
    resolveDir: '.', loader: 'js',
  },
  bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(offline-db|api|workout-draft|native-activity)\.js$/ }, (a) => ({ path: a.path.slice(2, -3), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
});
const m = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const ME = { role: 'client', accountId: 'acc-anna', name: 'Анна' };
const OTHER = { role: 'client', accountId: 'acc-boris', name: 'Борис' };

const session = (id, extra = {}) => ({
  id, title: 'Тренировка А', month: 'Октябрь 2026', status: 'completed', sourceBlock: 'Тренировка А', sourceBlockId: 'b1',
  startedAt: '2026-10-01T08:00:00.000Z', finishedAt: '2026-10-01T09:00:00.000Z', elapsedMs: 3600000,
  exercises: [{ id: 'e1', name: 'Присед', exerciseId: 7, sets: [
    { state: 'done', weight: '60', reps: '10' }, { state: 'done', weight: '62.5', reps: '8' }, { state: 'skipped', weight: '62.5', reps: '8' },
  ] }],
  ...extra,
});
const record = (id, extra = {}) => ({ session: session(id, extra), revision: 0, edit: 3, dirty: true, pending: null });

const start = (me = ME) => { reset(); local.clear(); m.setOfflineAccount(me); };

test('без сети: два занятия подряд — оба во «Выполненных», с пометкой телефона', async () => {
  start();
  fake.online = false;
  fake.list = { sessions: [{ id: 'old', title: 'Старое', status: 'completed', month: 'Сентябрь 2026', done: 4 }] };
  await m.enqueueWorkout('', record('w1'));
  await m.enqueueWorkout('', record('w2', { startedAt: '2026-10-02T08:00:00.000Z' }));

  const { sessions, offline } = await m.journalList('');
  assert.equal(offline, true);
  assert.deepEqual(sessions.map((s) => s.id).sort(), ['old', 'w1', 'w2']);
  const w1 = sessions.find((s) => s.id === 'w1');
  assert.equal(w1.local, 'local');
  assert.equal(w1.done, 2, 'подходы посчитаны как на сервере');
  assert.equal(w1.sourceBlockId, 'b1', 'тренировка программы — проведена');
  assert.deepEqual(w1.exercises[0].sets.map((x) => x.weight), ['60', '62.5'], 'в «Что сделано» — только сделанное');
});

test('связь вернулась: каждое уходит один раз; номер сохранения записан до отправки', async () => {
  start();
  fake.online = false;
  await m.enqueueWorkout('', record('w1'));

  // Первая попытка — без связи: номер выдан и сохранён, запись на месте
  let r = await m.flushOutbox();
  assert.deepEqual(r, { sent: 0, left: 1 });
  const first = [...fake.db.outbox.values()][0].record.pending.requestId;
  assert.ok(first, 'номер сохранения уже на телефоне');

  fake.online = true;
  r = await m.flushOutbox();
  assert.deepEqual(r, { sent: 1, left: 0 });
  assert.equal(fake.saved.length, 1);
  assert.equal(fake.saved[0].requestId, first, 'повтор — с тем же номером: сервер не задвоит');
  assert.equal(fake.saved[0].session.finishedAt, '2026-10-01T09:00:00.000Z', 'время завершения — с телефона');
  assert.equal(fake.db.outbox.size, 0);
  assert.equal(m.justSynced('w1'), true, 'пометка «Синхронизировано»');
  assert.ok([...fake.db.sessions.keys()].some((k) => k.endsWith('|self|w1')), 'принятое — в историю телефона');

  await m.flushOutbox();
  assert.equal(fake.saved.length, 1, 'второй раз не отправляется');
});

test('конфликт: не отправляется заново и не теряется, ждёт решения человека', async () => {
  start();
  fake.answer = (p) => ({ conflict: true, session: { ...p.session, revision: 5 } });
  await m.enqueueWorkout('', record('w1'));
  assert.deepEqual(await m.flushOutbox(), { sent: 0, left: 1 });
  assert.equal([...fake.db.outbox.values()][0].state, 'conflict');

  await m.flushOutbox();
  assert.equal(fake.saved.length, 1, 'конфликтное само не повторяется');
  const { sessions } = await m.journalList('');
  assert.equal(sessions[0].local, 'conflict');
});

test('отказ сервера: пометка с причиной, следующий снимок — с новым номером', async () => {
  start();
  fake.answer = () => Object.assign(new Error('Занятие слишком большое'), { code: 400 });
  await m.enqueueWorkout('', record('w1'));
  await m.enqueueWorkout('', record('w2'));
  const r = await m.flushOutbox();
  assert.deepEqual(r, { sent: 0, left: 2 }, 'отказ по одной записи не держит остальные');
  const entry = [...fake.db.outbox.values()][0];
  assert.equal(entry.state, 'error');
  assert.equal(entry.error, 'Занятие слишком большое');
  assert.equal(entry.record.pending, null);
});

test('вход кончился (401): всё остаётся в очереди до повторного входа', async () => {
  start();
  fake.answer = () => Object.assign(new Error('Войдите заново'), { code: 401 });
  await m.enqueueWorkout('', record('w1'));
  await m.enqueueWorkout('', record('w2'));
  assert.deepEqual(await m.flushOutbox(), { sent: 0, left: 2 });
  assert.equal(fake.saved.length, 1, 'после 401 дальше не пробуем');
  assert.ok([...fake.db.outbox.values()].every((e) => e.state === 'local'));

  fake.answer = null;
  assert.deepEqual(await m.flushOutbox(), { sent: 2, left: 0 });
});

test('два человека на одном телефоне: чужая очередь не видна и не отправляется', async () => {
  start(ME);
  fake.online = false;
  await m.enqueueWorkout('', record('anna-1'));

  m.setOfflineAccount(OTHER);
  assert.deepEqual((await m.localWorkouts('')).map((e) => e.sessionId), []);
  assert.equal(await m.pendingWorkouts(), 0);
  fake.online = true;
  await m.flushOutbox();
  assert.equal(fake.saved.length, 0, 'Борис не отправил занятие Анны');

  m.setOfflineAccount(ME);
  assert.equal(await m.pendingWorkouts(), 1);
});

test('без метки человека в очередь не пишем — и честно говорим об этом', async () => {
  start();
  m.setOfflineAccount(null);
  await assert.rejects(m.enqueueWorkout('', record('w1')), /войдите заново/i);
});

test('ошибка записи на телефон — ошибка, а не обещание сохранить', async () => {
  start();
  fake.failWrite = true;
  await assert.rejects(m.enqueueWorkout('', record('w1')), /диск полон/);
});

test('черновик закрытого неотправленного занятия переезжает в очередь, идущее — нет', async () => {
  start();
  local.set('draft:self', JSON.stringify(record('w1')));
  assert.equal(await m.adoptFinishedDraft(''), true);
  assert.equal(local.has('draft:self'), false, 'черновик свободен для следующей тренировки');
  assert.equal(await m.pendingWorkouts(), 1);

  local.set('draft:self', JSON.stringify(record('w2', { status: 'active' })));
  assert.equal(await m.adoptFinishedDraft(''), false, 'идущее занятие — не трогаем');

  local.set('draft:self', JSON.stringify(record('w3')));
  fake.open = true;
  assert.equal(await m.adoptFinishedDraft(''), false, 'экран тренировки открыт — черновик его');
});

test('открыли занятие из очереди: сначала черновик, потом удаление из очереди', async () => {
  start();
  await m.enqueueWorkout('', record('w1'));
  const peeked = await m.peekLocalWorkout('', 'w1');
  assert.equal(peeked.session.id, 'w1');
  assert.equal(peeked.dirty, true);
  assert.equal(await m.pendingWorkouts(), 1, 'просто посмотреть — из очереди не убирает');
  await m.dropLocalWorkout('', 'w1');
  assert.equal(await m.pendingWorkouts(), 0);
});

test('без сети занятие открывается из очереди и из сохранённой истории', async () => {
  start();
  fake.online = false;
  await m.enqueueWorkout('', record('w1'));
  await m.saveRecentWorkouts('', [session('h1', { title: 'Из истории' })]);
  assert.equal((await m.journalGet('', 'w1')).local, true);
  assert.equal((await m.journalGet('', 'h1')).session.title, 'Из истории');
  await assert.rejects(m.journalGet('', 'нет-такого'), (e) => e.code === 0);
});

test('«Было» — по последнему занятию телефона, свежее серверного', () => {
  const block = { title: 'Тренировка А', exercises: [
    { name: 'Присед', exerciseId: 7, lastWeight: '55' },
    { name: 'Жим', lastWeight: '40' },
    { name: 'Тяга', performers: ['Аня'], lastWeight: '30' },
  ] };
  const older = { record: { session: session('a', { finishedAt: '2026-10-01T09:00:00.000Z' }) } };
  const newer = { record: { session: session('b', { finishedAt: '2026-10-03T09:00:00.000Z', exercises: [
    { name: 'присед', exerciseId: 7, sets: [{ state: 'done', weight: '65', reps: '5' }, { state: 'skipped', weight: '70' }] },
  ] }) } };
  const result = m.withLocalWeights(block, [older, newer]);
  assert.equal(result.exercises[0].lastWeight, '65', 'последний сделанный подход последнего занятия');
  assert.equal(result.exercises[1].lastWeight, '40', 'не делали — серверное');
  assert.equal(result.exercises[2].lastWeight, '30', 'сплит не трогаем');
  assert.equal(m.withLocalWeights(block, []), block);
});

test('временная метка (старый ответ без accountId) переезжает на постоянную', async () => {
  start({ role: 'client', name: 'Анна', chatId: '' });
  const fallback = m.offlineAccount();
  assert.match(fallback, /^f/);
  fake.online = false;
  await m.enqueueWorkout('', record('w1'));

  m.setOfflineAccount(ME);
  await m.flushOutbox();
  assert.ok([...fake.db.outbox.keys()].every((k) => k.startsWith(m.offlineAccount() + '|')), 'записи — под постоянной меткой');
  assert.equal(await m.pendingWorkouts(), 1);
});

test('связь пропала посреди тренировки: сначала потерянный снимок, потом завершение — ничего не теряется', async () => {
  start();
  const live = session('w1', { status: 'active', finishedAt: undefined });
  const draft = {
    session: session('w1'), revision: 0, edit: 9, dirty: true,
    // Снимок идущего занятия ушёл и потерялся вместе со связью
    pending: { session: live, revision: 0, requestId: 'lost-request-0001', edit: 4 },
  };
  await m.enqueueWorkout('', draft);
  assert.deepEqual(await m.flushOutbox(), { sent: 1, left: 0 });
  assert.equal(fake.saved.length, 2, 'два шага: потерянный и последний');
  assert.equal(fake.saved[0].requestId, 'lost-request-0001', 'потерянный — тем же номером');
  assert.equal(fake.saved[0].session.status, 'active');
  assert.equal(fake.saved[1].session.status, 'completed', 'завершение не потерялось');
  assert.equal(fake.saved[1].revision, 1, 'последняя версия — от версии сервера');
  assert.notEqual(fake.saved[1].requestId, 'lost-request-0001');
  assert.equal(fake.db.outbox.size, 0);
});
