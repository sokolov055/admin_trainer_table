import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

/**
 * Первые шаги (FT-561/FT-510) в настоящем браузере по демо-сборке:
 * подсказка подсвечивает «Начать тренировку», касания мимо не проходят,
 * «Пропустить» закрывает навсегда, после действия — «1 день в режиме».
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-first-steps-test');
const SHOTS = join(ROOT, '../reports/ft-561');
let server, browser, origin;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
before(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT],
    { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
  server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(OUT, path === '/' ? 'index.html' : path);
    const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }); res.end(readFileSync(target));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  mkdirSync(SHOTS, { recursive: true });
}, { timeout: 120000 });
after(async () => { await browser?.close(); if (server) await new Promise((r) => server.close(r)); rmSync(OUT, { recursive: true, force: true }); });

// Демо-сервер отвечает с задержкой: перезагрузка раньше ответа потеряла бы запись
const saved = (page, what) => page.waitForFunction((w) => (localStorage.getItem('fittrack_demo_first_steps') || '').includes(w), what);

async function open(width = 390) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ru-RU' });
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-first-steps-token'));
  await page.goto(origin + '?mockFirstSteps=1');
  return page;
}

test('подсказка ведёт к «Начать тренировку», после занятия — первый день в режиме', async () => {
  const page = await open(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const card = page.getByRole('dialog', { name: 'Начните первое занятие' });
  await card.waitFor();
  await page.screenshot({ path: join(SHOTS, 'hint-390.png') });
  // Касание мимо подсвеченной кнопки не проходит: вкладка не меняется
  await page.mouse.click(20, 830);
  assert.equal(await page.locator('.tabbar [data-tab="plan"]').getAttribute('aria-current'), 'page');
  await page.locator('main.app__body:not([hidden]) [data-first-action="workout"]').first().click();
  await card.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.first-hint').count(), 0, 'затемнение не остаётся');
  await saved(page, '"hint":"workout"');
  await page.reload();
  const regime = page.getByRole('heading', { name: '1 день в режиме' });
  await regime.waitFor();
  assert.equal(await page.getByRole('dialog', { name: 'Начните первое занятие' }).count(), 0, 'подсказка не повторяется');
  // В браузере уведомлений телефона нет — и вопроса о них тоже
  assert.equal(await page.getByRole('heading', { name: 'Сигнал конца отдыха' }).count(), 0);
  await page.screenshot({ path: join(SHOTS, 'regime-390.png') });
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await regime.waitFor({ state: 'detached' });
  await saved(page, '"regime":true');
  await page.reload(); await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '1 день в режиме' }).count(), 0, 'показан один раз');
  assert.deepEqual(errors, []); await page.close();
});

test('«Пропустить» закрывает подсказку навсегда; без флага демо подсказки нет', async () => {
  const page = await open(1280);
  await page.getByRole('dialog', { name: 'Начните первое занятие' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Пропустить' }).click();
  assert.equal(await page.locator('.first-hint').count(), 0);
  await saved(page, '"hint":"skipped"');
  await page.reload(); await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.first-hint').count(), 0);
  await page.close();
  const plain = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await plain.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-first-steps-token'));
  await plain.goto(origin);
  await plain.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  await plain.waitForTimeout(500);
  assert.equal(await plain.locator('.first-hint').count(), 0);
  await plain.close();
});
