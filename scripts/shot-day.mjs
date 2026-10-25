// Скриншоты «Разбора дня» (FT-738) для глазной проверки: карточка «Мой день»
// на «Обзоре», лист разбора сегодня и вчера; светлая и тёмная тема.
// node scripts/shot-day.mjs <путь-без-расширения>
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot');
execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
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
const errors = [];
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: scheme, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/?mockDay=1');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockDay=1');
  // Тему приложение выбирает само («Оформление»), системная схема браузера ему не указ
  if (scheme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const card = page.locator('.day-card').first();
  await card.waitFor({ timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DEST}-card-${scheme}.png` });
  await page.locator('.day-card__body').click();
  await page.locator('.day-sheet__rows').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DEST}-sheet-${scheme}.png` });
  await page.locator('.sheet__body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DEST}-sheet-bottom-${scheme}.png` });
  await page.getByRole('button', { name: 'Предыдущий день' }).click();
  await page.waitForTimeout(1200);
  await page.locator('.sheet__body').evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: `${DEST}-yesterday-${scheme}.png` });
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
