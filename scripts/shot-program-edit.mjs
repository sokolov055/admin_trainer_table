// Снимки редактора программы «Библиотеки» (этап 3, 17.11.2026) — для глазной
// проверки: шапка, паспорт чипами, недели, свёрнутые тренировки, листы.
// node scripts/shot-program-edit.mjs [префикс] (DARK=1 — тёмная)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot');
if (!process.env.NO_BUILD) execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
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
  await main.locator('.plib-card').filter({ hasText: 'UL [4]' }).click();
  await main.locator('.plib-hero').waitFor({ timeout: 10000 });
  await main.getByRole('button', { name: 'Изменить' }).click();
  await main.locator('.plib-etop').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1600);
  await shot('1-top');
  await shot('2-full', { fullPage: true });
  await main.locator('.plib-pchip').first().click();
  await page.waitForTimeout(700);
  await shot('3-passport');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await main.locator('.plib-addw').click();
  await page.waitForTimeout(700);
  await shot('4-add');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await main.locator('.plib-ewk__head').first().click();
  await page.waitForTimeout(700);
  await main.locator('.plib-ewk.is-open').scrollIntoViewIfNeeded();
  await shot('5-open');
  await main.locator('.plib-ename').fill('UL [4] — правка');
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot('6-dirty');
} finally {
  if (errors.length) console.log('Ошибки страницы:', errors);
  await browser.close();
  server.close();
}
