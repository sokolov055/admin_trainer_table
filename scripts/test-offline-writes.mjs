/**
 * Замеры и настройки тренажёров без сети (FT-566, этап 2).
 *
 * Клиент взвесился в зале без связи — замер сразу в «Прогрессе», изменения
 * пересчитаны, а когда связь вернулась, он уходит на сервер. Второй замер
 * за тот же день дополняет первый (как на сервере), настройка тренажёра —
 * заменяет прежнюю. Отказ сервера — пометка, а не бесконечный повтор.
 *
 * Настоящий модуль; подменены хранилище (Map вместо IndexedDB) и API.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const fake = {};
const reset = () => Object.assign(fake, { db: { writes: new Map() }, online: true, sent: [], answer: null, during: null });
reset();
globalThis.__f = fake;

const stubs = {
  'offline-db': `
    const f = () => globalThis.__f;
    const st = (s) => f().db[s];
    const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    export const dbGet = async (s, k) => copy(st(s).get(k));
    export const dbPut = async (s, k, v) => { st(s).set(k, copy(v)); };
    export const dbDelete = async (s, k) => { st(s).delete(k); };
    export const dbList = async (s, p) => [...st(s).entries()].filter(([k]) => k.startsWith(p)).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value: copy(value) }));`,
  api: `
    const f = () => globalThis.__f;
    export const apiMutate = async (action, p) => {
      if (!f().online) throw Object.assign(new Error('Сервер не отвечает.'), { code: 0 });
      f().sent.push({ action, params: JSON.parse(JSON.stringify(p)) });
      if (f().during) await f().during();
      const a = f().answer ? f().answer(action, p) : null;
      if (a instanceof Error) throw a;
      return a || {};
    };`,
};

const dir = mkdtempSync(join(tmpdir(), 'offline-writes-'));
const out = join(dir, 'writes.mjs');
await build({
  stdin: { contents: "export * from './src/offline-writes.js'; export * from './src/offline-account.js';", resolveDir: '.', loader: 'js' },
  bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\/(offline-db|api)\.js$/ }, (a) => ({ path: a.path.slice(2, -3), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
});
const m = await import(pathToFileURL(out).href);
test.after(() => rmSync(dir, { recursive: true, force: true }));

const ANNA = { role: 'client', accountId: 'acc-anna' };
const start = (me = ANNA) => { reset(); m.setOfflineAccount(me); };

const server = {
  fields: ['Вес', 'Талия'],
  series: [{ label: '', sheetName: 'Показатели', rows: [
    { date: '2026-09-01T00:00:00', 'Вес': 80, 'Талия': 90 },
    { date: '2026-10-01T00:00:00', 'Вес': 78, 'Талия': null },
  ] }],
};

test('замер без сети: второй за тот же день дополняет первый', async () => {
  start();
  await m.queueWrite('measure', { date: '2026-10-14', values: { 'Вес': '77,5' } });
  await m.queueWrite('measure', { date: '2026-10-14', values: { 'Талия': '86' } });
  const list = await m.localWrites('', 'measure');
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].params.values, { 'Вес': '77,5', 'Талия': '86' });
});

test('«Прогресс» без сети: замер телефона в таблице, изменения пересчитаны', async () => {
  start();
  await m.queueWrite('measure', { date: '2026-10-14', values: { 'Вес': '77,5', 'Талия': '86' } });
  const merged = m.withLocalMeasures(server, await m.localWrites('', 'measure'));
  const rows = merged.series[0].rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[2], { date: '2026-10-14T00:00:00', 'Вес': 77.5, 'Талия': 86, local: true });
  assert.equal(merged.series[0].deltas['Вес'].delta, -2.5, 'с первого замера: 80 → 77,5');
  assert.equal(merged.series[0].deltas['Талия'].delta, -4);
  assert.equal(server.series[0].rows.length, 2, 'ответ сервера не испорчен');
});

test('замер за день, который уже есть, дополняет его строку', () => {
  const merged = m.withLocalMeasures(server, [{ params: { date: '2026-10-01', values: { 'Талия': '88' } } }]);
  assert.equal(merged.series[0].rows.length, 2);
  assert.equal(merged.series[0].rows[1]['Вес'], 78);
  assert.equal(merged.series[0].rows[1]['Талия'], 88);
});

test('первый в жизни замер — без сети и без сохранённых замеров', () => {
  const merged = m.withLocalMeasures(null, [{ params: { date: '2026-10-14', values: { 'Вес': '70' } } }]);
  assert.equal(merged.series.length, 1);
  assert.equal(merged.series[0].rows[0]['Вес'], 70);
});

test('сплит: замер ложится в серию своего участника', () => {
  const pair = { fields: ['Вес'], series: [
    { label: 'Аня', sheetName: 'Показатели Аня', rows: [{ date: '2026-10-01T00:00:00', 'Вес': 60 }] },
    { label: 'Боря', sheetName: 'Показатели Боря', rows: [{ date: '2026-10-01T00:00:00', 'Вес': 90 }] },
  ] };
  const merged = m.withLocalMeasures(pair, [{ params: { sheetName: 'Показатели Боря', date: '2026-10-14', values: { 'Вес': '89' } } }]);
  assert.equal(merged.series[0].rows.length, 1);
  assert.equal(merged.series[1].deltas['Вес'].delta, -1);
});

test('связь вернулась: замер и настройка уходят как есть, очередь пуста', async () => {
  start();
  fake.online = false;
  await m.queueWrite('measure', { clientRow: 7, date: '2026-10-14', values: { 'Вес': '77,5' } });
  await m.queueWrite('note', { clientRow: 7, target: 'm:abc', text: 'спинка 3' });
  await m.queueWrite('note', { clientRow: 7, target: 'm:abc', text: 'спинка 4' });
  assert.deepEqual(await m.flushWrites(), { sent: 0, left: 2 });

  fake.online = true;
  assert.deepEqual(await m.flushWrites(), { sent: 2, left: 0 });
  assert.deepEqual(fake.sent.map((x) => x.action).sort(), ['client.machine.note.save', 'measure.create']);
  assert.equal(fake.sent.find((x) => x.action === 'client.machine.note.save').params.text, 'спинка 4', 'последняя настройка');
  assert.equal(fake.sent.find((x) => x.action === 'measure.create').params.clientRow, 7);
  assert.equal(await m.pendingWrites(), 0);
});

test('отказ сервера — пометка и без повтора; остальные уходят', async () => {
  start();
  fake.answer = (action) => (action === 'measure.create' ? Object.assign(new Error('Вес: от 20 до 400 кг'), { code: 400 }) : null);
  await m.queueWrite('measure', { date: '2026-10-14', values: { 'Вес': '7' } });
  await m.queueWrite('note', { target: 'm:abc', text: 'сиденье 5' });
  assert.deepEqual(await m.flushWrites(), { sent: 1, left: 1 });
  const [entry] = await m.localWrites('', 'measure');
  assert.equal(entry.state, 'error');
  assert.equal(entry.error, 'Вес: от 20 до 400 кг');
  await m.flushWrites();
  assert.equal(fake.sent.filter((x) => x.action === 'measure.create').length, 1, 'не повторяется');
  await m.dropWrite('', 'measure', entry.params);
  assert.equal(await m.pendingWrites(), 0);
});

test('вход кончился (401) — всё остаётся до повторного входа', async () => {
  start();
  fake.answer = () => Object.assign(new Error('Войдите заново'), { code: 401 });
  await m.queueWrite('measure', { date: '2026-10-14', values: { 'Вес': '77' } });
  await m.queueWrite('note', { target: 'm:abc', text: 'x' });
  assert.deepEqual(await m.flushWrites(), { sent: 0, left: 2 });
  assert.equal(await m.pendingWrites(), 2);
});

test('дописали, пока отправлялось, — дописанное не теряется', async () => {
  start();
  await m.queueWrite('measure', { date: '2026-10-14', values: { 'Вес': '77' } });
  fake.during = async () => { fake.during = null; await m.queueWrite('measure', { date: '2026-10-14', values: { 'Талия': '85' } }); };
  assert.deepEqual(await m.flushWrites(), { sent: 0, left: 1 });
  await m.flushWrites();
  assert.deepEqual(fake.sent[1].params.values, { 'Вес': '77', 'Талия': '85' });
  assert.equal(await m.pendingWrites(), 0);
});

test('чужие записи на том же телефоне не видны и не отправляются', async () => {
  start();
  fake.online = false;
  await m.queueWrite('measure', { date: '2026-10-14', values: { 'Вес': '77' } });
  m.setOfflineAccount({ role: 'client', accountId: 'acc-boris' });
  assert.deepEqual(await m.localWrites('', 'measure'), []);
  fake.online = true;
  await m.flushWrites();
  assert.equal(fake.sent.length, 0);
});

test('без метки человека записать нельзя — честная ошибка', async () => {
  start();
  m.setOfflineAccount(null);
  await assert.rejects(m.queueWrite('measure', { date: '2026-10-14', values: { 'Вес': '77' } }), /войдите заново/i);
});

test('нет связи — только код 0, отказ сервера — нет', () => {
  assert.equal(m.isOffline(Object.assign(new Error(), { code: 0 })), true);
  assert.equal(m.isOffline(Object.assign(new Error(), { code: 400 })), false);
  assert.equal(m.isOffline(new Error()), false);
});
