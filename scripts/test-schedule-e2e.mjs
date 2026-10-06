import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const REVIEW = join(ROOT, '.impeccable', 'review');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

test('личное событие создаётся и переносится в мобильном расписании', { timeout: 180000 }, async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], {
    cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore',
  });
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
    const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));

  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + '/?mockRole=trainer');
    await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await page.goto(origin + '/?mockRole=trainer');
    await page.getByRole('button', { name: 'Расписание' }).first().click();
    await page.getByRole('button', { name: 'Добавить событие' }).click();
    await page.getByRole('radio', { name: 'Личное событие' }).click();
    await page.getByLabel('Название события').fill('Массаж QA');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();

    const event = page.getByRole('button', { name: /Массаж QA/ }).first();
    await event.waitFor();
    const box = await event.boundingBox();
    assert.ok(box, 'личное событие видно в сетке');
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(10, box.height / 2));
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(10, box.height / 2) + 50, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Массаж QA/ }).first().click();
    assert.equal(await page.getByLabel('Время').inputValue(), '11:00', 'перетаскивание на час вниз сохранилось');
    await page.getByRole('button', { name: 'Расписание' }).first().click();

    mkdirSync(REVIEW, { recursive: true });
    await page.screenshot({ path: join(REVIEW, 'mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.screenshot({ path: join(REVIEW, 'desktop.png'), fullPage: true });
    assert.deepEqual(errors, [], 'в консоли нет ошибок');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(OUT, { recursive: true, force: true });
  }
});
