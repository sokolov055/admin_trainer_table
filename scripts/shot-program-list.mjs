// Снимки списка программ «Библиотеки» (17.11.2026) — для глазной
// проверки: шапка, цели, карточки, смахивание, листы «Фильтры» и
// «Новая программа». node scripts/shot-program-list.mjs [префикс]
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true, colorScheme: process.env.DARK === '1' ? 'dark' : 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (name, opts = {}) => page.screenshot({ path: `${DEST}-${name}.png`, ...opts });
try {
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const main = page.locator('#root main:not([hidden])');
  await page.getByRole('button', { name: /Библиотека/ }).first().click();
  await main.locator('.plib-card').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);
  await shot('1-list');
  // Смахнуть первую карточку влево — «Назначить» и «Удалить»
  const box = await main.locator('.plib-swipe').first().boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(box.x + box.width - 20 - i * 20, box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await shot('2-swipe');
  await main.locator('.plib-swipe').first().locator('.swipe__extra').click();
  await page.waitForTimeout(500);
  await shot('3-assign');
  await page.goBack().catch(() => {});
  await page.getByRole('button', { name: /Библиотека/ }).first().click();
  await page.waitForTimeout(400);
  await main.getByRole('button', { name: /К шаблону|Назад/ }).first().click().catch(() => {});
  await main.locator('.plib-card').first().waitFor({ timeout: 10000 });
  await main.getByRole('button', { name: /Фильтры/ }).click();
  await page.waitForTimeout(600);
  await shot('4-filters');
  await page.getByRole('radio', { name: 'Видят клиенты' }).click();
  await page.waitForTimeout(200);
  await shot('5-filters-on');
  await page.getByRole('button', { name: /Показать/ }).click();
  await page.waitForTimeout(600);
  await shot('6-filtered');
  await main.getByRole('button', { name: 'Новая программа' }).click();
  await page.waitForTimeout(600);
  await shot('7-new');
  await page.getByRole('button', { name: /Из программы клиента/ }).click();
  await page.waitForTimeout(800);
  await shot('8-from-client');
  console.log('errors', errors);
} finally {
  await browser.close();
  server.close();
}
