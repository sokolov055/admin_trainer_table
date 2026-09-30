// Проверка пролистывания расписания пальцем (эмуляция касаний через CDP)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = p === '/' ? join(OUT, 'index.html') : join(OUT, p);
  const t = existsSync(f) && extname(f) ? f : join(OUT, 'index.html');
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }[extname(t)] || 'application/octet-stream' });
  res.end(readFileSync(t));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ru-RU' });
const page = await ctx.newPage();
await page.goto(origin + '/?mockRole=trainer');
await page.evaluate(() => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.setItem('schedule_view_v1', '3day'); });
await page.goto(origin + '/?mockRole=trainer');
await page.getByRole('button', { name: 'Расписание' }).first().click();
await page.waitForSelector('.cal-grid__day');
const days = () => page.$$eval('.cal-grid__day strong', (els) => els.map((e) => e.textContent).join(','));
const before = await days();
const cdp = await ctx.newCDPSession(page);
const box = await page.locator('.cal-grid__scroll').boundingBox();
const y = box.y + 100;
const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', 320);
for (let x = 310; x >= 120; x -= 20) await touch('touchMove', x);
await touch('touchEnd', 120);
await page.waitForTimeout(800);
const after = await days();
// Короткий вертикальный жест не должен листать
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y }] });
for (let d = 10; d <= 120; d += 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 205, y: y + d }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(600);
const vertical = await days();
// Страница не должна уехать на соседнюю вкладку: сетка на месте и видна
const gridX = (await page.locator('.cal-grid').boundingBox()).x;
const title = await page.locator('.cal-bar__title').boundingBox();
console.log(JSON.stringify({ before, after, vertical, gridX: Math.round(gridX), titleX: Math.round(title.x) }));
if (before === after || after !== vertical || gridX < 0 || gridX > 40) { console.error('ПРОВАЛ'); process.exitCode = 1; }
await browser.close();
server.close();
