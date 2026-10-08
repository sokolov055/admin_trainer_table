// Скриншоты блока «Цели» в «Прогрессе» (FT-490) — для глазной проверки:
// клиент, раскрытые награды, правка цели; тренер у клиента с прерванной серией
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/');
  await page.getByRole('button', { name: 'Прогресс' }).last().click({ timeout: 10000 });
  const goals = page.locator('.goals').first();
  await goals.waitFor({ timeout: 10000 });
  await goals.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DEST}-client-${scheme}.png` });
  await page.locator('.goals__toggle').click();
  await page.waitForTimeout(300);
  await page.locator('.awards').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DEST}-awards-${scheme}.png`, fullPage: false });
  // С 08.10.2026 цели ставит только тренер: у клиента «Изменить» нет
  if (await page.getByRole('button', { name: 'Изменить' }).count() === 0) { await page.close(); continue; }
  await page.getByRole('button', { name: 'Изменить' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('.goal-form').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DEST}-edit-${scheme}.png` });
  await page.getByRole('radio', { name: '3' }).click();
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.locator('.goals__rings').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.locator('.goals').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DEST}-saved-${scheme}.png` });
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
