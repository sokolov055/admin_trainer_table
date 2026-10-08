// Скриншоты пожеланий к программе (FT-498): клиент внизу «Тренировок»,
// тренер — вверху программы клиента
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(origin + '/');
await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
await page.goto(origin + '/');
await page.getByRole('button', { name: 'Тренировки' }).last().click({ timeout: 10000 });
const box = page.locator('.wishes').first();
await box.waitFor({ timeout: 10000 });
await box.scrollIntoViewIfNeeded();
await page.getByLabel('Пожелание к программе').fill('Хочу больше упражнений на спину');
await page.getByRole('button', { name: 'Отправить тренеру' }).click();
await page.waitForTimeout(500);
await box.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${DEST}-client.png` });

await page.goto(origin + '/?mockRole=trainer');
await page.locator('.item').first().click({ timeout: 10000 });
await page.waitForTimeout(600);
const tab = page.getByRole('tab', { name: 'Тренировки' });
if (await tab.count()) await tab.first().click();
await page.locator('.wishes').first().waitFor({ timeout: 10000 });
await page.screenshot({ path: `${DEST}-trainer.png` });
await page.getByRole('button', { name: 'Ответить' }).first().click();
await page.getByLabel('Ответ клиенту').fill('Добавил тягу гантели в наклоне');
await page.screenshot({ path: `${DEST}-trainer-reply.png` });
await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
