// Скриншоты правки программы прямо в тренировках (03.10.2026) — для
// глазной проверки: тип подхода, суперсет, «+» тренировки, «Вся программа»,
// новый пустой месяц
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: `${DEST}-${name}.png` });
await page.goto(origin + '/?mockRole=trainer');
await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
await page.goto(origin + '/?mockRole=trainer');
await page.getByRole('button', { name: 'Меню' }).click();
await page.getByRole('button', { name: /Мои тренировки/ }).click();
await page.getByRole('button', { name: 'Новый месяц' }).waitFor({ timeout: 10000 });
const main = page.locator('#root main:not([hidden])');
const block2 = main.locator('.section', { hasText: 'Тренировка 2 — низ' }).first();
await block2.locator('.plan__toggle').click();
await block2.locator('.plan-inline__scheme').nth(1).waitFor({ timeout: 10000 });
await block2.locator('.plan-inline__unit--superset').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await shot('1-superset');
// Подход: тип
await block2.locator('.plan-inline__scheme').nth(1).click();
await block2.locator('.plan-inline__set').last().click();
await block2.getByRole('radio', { name: 'Дропсет' }).click();
await page.waitForTimeout(300);
await block2.locator('.plan-inline__panel').scrollIntoViewIfNeeded();
await shot('2-set-kind');
await block2.getByRole('button', { name: 'Готово' }).click();
// «+» под последней
await main.getByRole('button', { name: 'Добавить тренировку' }).scrollIntoViewIfNeeded();
await main.getByRole('button', { name: 'Добавить тренировку' }).click();
await page.waitForTimeout(200);
await shot('3-add-menu');
await main.getByRole('button', { name: 'Новая тренировка' }).click();
await page.waitForTimeout(600);
await shot('4-new-block');
// Вся программа
await page.evaluate(() => window.scrollTo(0, 0));
await main.getByRole('tab', { name: /^Вся программа/ }).click();
await page.waitForTimeout(400);
await shot('5-all');
// Новый месяц
await main.getByRole('button', { name: 'Новый месяц' }).click();
await page.waitForTimeout(1200);
await shot('6-new-month');
// Переименовать — тап по выбранному
await main.locator('.plan__months .chip--active').click();
await page.waitForTimeout(300);
await shot('7-rename');
console.log(errors.length ? errors.join('\n') : 'ok');
await browser.close();
server.close();
