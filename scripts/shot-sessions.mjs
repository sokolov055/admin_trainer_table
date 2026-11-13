// Снимки занятий «силовая + кардио» и ритма (FT-788, 13.11.2026) — для
// глазной проверки: предложение прицепить кардио, рамки занятий, ритм в
// «Назначить». node scripts/shot-sessions.mjs [префикс]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot');
if (!process.env.NO_BUILD) execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
  const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
  res.end(readFileSync(target));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (name, opts = {}) => page.screenshot({ path: `${DEST}-${name}.png`, ...opts });
try {
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  const main = page.locator('#root main:not([hidden])');
  await page.getByRole('button', { name: /Библиотека/ }).first().click();
  await main.getByText('Сила + кардио').first().click();
  await main.getByRole('button', { name: /Изменить|Править/ }).first().click();
  await main.locator('.wk-loose').waitFor({ timeout: 10000 });
  await main.locator('.wk-loose').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot('1-loose');
  await main.getByRole('button', { name: 'Прицепить' }).click();
  await page.waitForTimeout(300);
  await main.locator('.wk-sess').first().scrollIntoViewIfNeeded();
  await shot('2-sessions');
  await main.locator('.wk-join').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot('3-join');
  await page.locator('.plan-edit__float').getByRole('button', { name: 'Свернуть', exact: true }).click();
  await page.waitForTimeout(400);
  await shot('4-order');
  // Сохранить и назначить: ритм 3 · 1, предпросмотр по занятиям
  await page.locator('.plan-edit__float').getByRole('button', { name: 'Сохранить шаблон' }).click();
  await page.waitForTimeout(800);
  await shot('4b-saved');
  await main.getByRole('button', { name: 'Назначить клиенту' }).first().click();
  await main.locator('button.item').nth(1).click();
  await main.getByRole('radiogroup', { name: 'Занятий в неделю' }).waitFor({ timeout: 10000 });
  await main.getByRole('radiogroup', { name: 'Занятий в неделю' }).scrollIntoViewIfNeeded();
  await main.getByRole('group', { name: 'Дни занятий' }).first().getByRole('button', { name: 'Пн' }).click();
  await main.getByRole('group', { name: 'Дни занятий' }).first().getByRole('button', { name: 'Ср' }).click();
  await main.getByRole('group', { name: 'Дни занятий' }).first().getByRole('button', { name: 'Пт' }).click();
  await page.waitForTimeout(200);
  await main.locator('.wk-prev').scrollIntoViewIfNeeded();
  await shot('5-assign-days');
  await main.getByRole('button', { name: 'Чередовать недели' }).click();
  await page.waitForTimeout(200);
  await main.locator('.wk-beat').first().scrollIntoViewIfNeeded();
  await shot('6-rhythm');
  await main.locator('.wk-prev').scrollIntoViewIfNeeded();
  await shot('7-rhythm-preview');
  console.log('errors', errors);
} catch (e) {
  await shot('fail');
  console.log('FAIL', e.message, errors);
}
await browser.close();
server.close();
