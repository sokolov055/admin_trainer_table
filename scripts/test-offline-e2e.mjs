import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

/**
 * Тренировки без сети (FT-566) — настоящим браузером, с настоящим IndexedDB.
 *
 * Сценарий владельца: клиент открыл приложение со связью, потом — в зале
 * без интернета — провёл две тренировки подряд, закрыл и снова открыл
 * приложение. Обе тренировки видны сразу и помечены «Сохранено на
 * телефоне». Связь вернулась — на сервер ушло ровно два занятия, без
 * дублей, и пометка сменилась на «Синхронизировано».
 *
 * Демо-сборка (VITE_MOCK=1): «сервер» — заглушка в браузере, её
 * выключает localStorage.demo_offline (mock.js) — так, будто сервер не
 * ответил вовсе.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-offline-e2e');
const VIEWPORT = { width: 390, height: 844 };
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

let server;
let browser;
let origin;
const errors = [];

before(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-offline-e2e'], {
    cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore',
  });
  server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
    const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
}, { timeout: 240000 });

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(OUT, { recursive: true, force: true });
});

async function swipeBack(page) {
  await page.evaluate(async () => {
    const from = { x: 4, y: 420 };
    const to = { x: 340, y: 420 };
    const target = document.elementFromPoint(from.x, from.y) || document.body;
    const fire = (type, x, y) => {
      const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t],
      }));
    };
    const wait = () => new Promise((r) => setTimeout(r, 16));
    fire('touchstart', from.x, from.y);
    for (let i = 1; i <= 12; i += 1) { await wait(); fire('touchmove', from.x + ((to.x - from.x) * i) / 12, from.y); }
    await wait();
    fire('touchend', to.x, to.y);
  });
}

/** Записи хранилища телефона (IndexedDB) */
const stored = (page, store) => page.evaluate((name) => new Promise((resolve) => {
  const req = indexedDB.open('fittrack-offline');
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(name)) { resolve([]); return; }
    const all = db.transaction(name, 'readonly').objectStore(name).getAllKeys();
    all.onsuccess = () => resolve(all.result.map(String));
    all.onerror = () => resolve([]);
  };
  req.onerror = () => resolve([]);
}), store);

const serverSessions = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('workout_demo_server:3') || '[]'));

async function runWorkout(page, title) {
  const section = page.locator('.section', { has: page.getByRole('heading', { name: title }) });
  await section.getByRole('button', { name: 'Начать тренировку' }).click();
  await page.getByRole('heading', { name: title }).first().waitFor({ timeout: 20000 });
  const left = page.getByRole('button', { name: 'Закончить отдых' });
  if (await left.isVisible().catch(() => false)) await left.click();
  await page.locator('.workout__effort-btn--ok').first().click();
  await page.getByRole('button', { name: 'Закончить отдых' }).click();
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.locator('.workout__confirm').getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.getByRole('button', { name: 'Исправить результат', exact: true }).waitFor({ timeout: 10000 });
  await swipeBack(page);
}

test('без сети: две тренировки подряд, перезапуск, затем отправка без дублей', { timeout: 180000 }, async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    // Со связью: вход, программа, и телефон в фоне делает запас
    await page.goto(origin);
    await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await page.goto(origin);
    await page.getByRole('button', { name: 'Тренировки', exact: true }).click({ timeout: 60000 });
    await page.getByRole('heading', { name: 'Тренировка 1 — верх' }).waitFor({ timeout: 20000 });
    for (let i = 0; i < 60 && !(await stored(page, 'meta')).some((k) => k.startsWith('prefetch|')); i += 1) {
      await page.waitForTimeout(500);
    }
    assert.ok((await stored(page, 'meta')).some((k) => k.startsWith('prefetch|')), 'запас сделан');
    const before = (await serverSessions(page)).length;

    // Связь пропала. Приложение закрыли и открыли снова — уже без сети
    await page.evaluate(() => localStorage.setItem('demo_offline', '1'));
    await page.reload();
    await page.getByRole('button', { name: 'Тренировки', exact: true }).click({ timeout: 60000 });
    await page.getByRole('heading', { name: 'Тренировка 2 — низ' }).waitFor({ timeout: 20000 });
    await page.getByText(/Нет связи\. Программа и занятия — сохранённые на телефоне/).waitFor({ timeout: 20000 });

    // Две тренировки подряд: вторая начинается, хотя первая не отправлена
    await runWorkout(page, 'Тренировка 1 — верх');
    await runWorkout(page, 'Тренировка 2 — низ');

    await page.getByRole('tab', { name: /^Выполненные/ }).click({ timeout: 20000 });
    await page.getByText(/Сохранено на телефоне/).nth(1).waitFor({ timeout: 10000 });
    assert.equal((await serverSessions(page)).length, before, 'на «сервер» без связи ничего не ушло');
    assert.equal((await stored(page, 'outbox')).length, 2, 'в очереди телефона — обе');

    // Перезапуск без сети — обе на месте
    await page.reload();
    await page.getByRole('button', { name: 'Тренировки', exact: true }).click({ timeout: 60000 });
    await page.getByRole('tab', { name: /^Выполненные/ }).click({ timeout: 20000 });
    await page.getByText(/Сохранено на телефоне/).nth(1).waitFor({ timeout: 10000 });
    assert.equal(await page.getByText(/Сохранено на телефоне/).count(), 2);

    // Связь вернулась
    await page.evaluate(() => { localStorage.removeItem('demo_offline'); window.dispatchEvent(new Event('online')); });
    for (let i = 0; i < 60 && (await serverSessions(page)).filter((s) => s.status === 'completed').length < before + 2; i += 1) {
      await page.waitForTimeout(500);
    }
    const queue = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('fittrack-offline');
      req.onsuccess = () => {
        const all = req.result.transaction('outbox', 'readonly').objectStore('outbox').getAll();
        all.onsuccess = () => resolve(all.result.map((e) => ({ state: e.state, error: e.error, id: e.record.session.id, title: e.record.session.title, rev: e.record.revision, req: e.record.pending && e.record.pending.requestId })));
      };
    }));
    if (queue.length) console.log('SERVER', JSON.stringify((await serverSessions(page)).map((s) => [s.id, s.title, s.status, s.revision, s.requestId])));
    assert.deepEqual(queue, [], 'очередь ушла на сервер');
    await page.getByText('Синхронизировано').nth(1).waitFor({ timeout: 20000 });

    const after = await serverSessions(page);
    const done = after.filter((s) => ['Тренировка 1 — верх', 'Тренировка 2 — низ'].includes(s.title) && s.status === 'completed');
    assert.equal(done.length, 2, 'ровно два занятия');
    assert.equal(new Set(after.map((s) => s.id)).size, after.length, 'без дублей');
    assert.ok(done.every((s) => s.finishedAt), 'время завершения — с телефона');
    assert.equal((await stored(page, 'outbox')).length, 0, 'очередь пуста');
    assert.equal(await page.getByText(/Сохранено на телефоне/).count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
