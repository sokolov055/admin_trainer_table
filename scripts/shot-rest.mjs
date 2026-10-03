// Скриншоты экрана тренировки после правок 03.10.2026 — для глазной
// проверки: шапка с «Завершить», отдых со «Свернуть» и «Дальше»,
// суперсет на экране отдыха, плашка свёрнутого отдыха, выбор суперсета
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: 'dark' });
const shot = (name) => page.screenshot({ path: `${DEST}-${name}.png` });
await page.goto(origin);
await page.fill('input[type=email]', 'demo@example.com');
await page.getByRole('button', { name: 'Прислать код' }).click();
await page.locator('input[autocomplete=one-time-code]').fill('ABC123');
await page.getByRole('button', { name: 'Войти', exact: true }).click();
await page.fill('input[autocomplete=name]', 'Анна Морозова');
const checks = page.locator('.consent input[type=checkbox]');
await checks.nth(0).check();
await checks.nth(1).check();
await page.getByRole('button', { name: 'Завести кабинет' }).click();
await page.getByRole('button', { name: 'Тренировки', exact: true }).click({ timeout: 60000 });
const section = (title) => page.locator('.section', { has: page.getByRole('heading', { name: title }) });
await section('Тренировка 2 — низ').getByRole('button', { name: 'Начать тренировку' }).click({ timeout: 20000 });
await page.getByRole('heading', { name: 'Тренировка 2 — низ' }).first().waitFor({ timeout: 20000 });
await page.waitForTimeout(600);
await shot('1-head');
// Первое упражнение: подход «Норм» → отдых; дальше — следующий подход
const fill = async () => {
  const set = page.locator('.workout__set').first();
  const boxes = set.getByRole('textbox');
  if (!(await boxes.nth(1).inputValue())) await boxes.nth(1).fill('8');
};
await fill();
await page.locator('.workout__effort-btn--ok').first().click();
await page.locator('.rest-screen').waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
await shot('2-rest');
await page.getByRole('button', { name: 'Свернуть таймер' }).click();
await page.waitForTimeout(400);
await shot('3-pill');
await page.locator('.rest-pill').click();
await page.getByRole('button', { name: 'Закончить отдых' }).click();
// Убрать всё до суперсета — и отметить первый круг
await page.getByRole('button', { name: 'Выбрать' }).click();
await page.waitForTimeout(400);
for (const n of [1, 2, 3]) await page.locator('.workout__exercise--compact').nth(n - 1).locator('.workout__ex-head').click();
await page.getByRole('button', { name: 'Удалить' }).click();
await page.waitForTimeout(900);
for (let k = 0; k < 2; k += 1) {
  const item = page.locator('.workout__round-item').nth(k);
  const reps = item.getByRole('textbox').nth(1);
  if (!(await reps.inputValue())) await reps.fill('10');
  await item.locator('.workout__effort-btn--ok').first().click();
  await page.waitForTimeout(300);
}
await page.locator('.rest-screen').waitFor({ timeout: 5000 });
await shot('4-rest-superset');
await page.getByRole('button', { name: 'Закончить отдых' }).click();
for (let i = 0; i < 0; i += 1) {
  const first = page.locator('.workout__exercise').first();
  const btn = first.locator('.workout__effort-btn--ok');
  if (!(await btn.count())) break;
  const set = first.locator('.workout__set').filter({ has: page.locator('input') });
  const pending = first.locator('.workout__set:not(.workout__set--done)').first();
  const reps = pending.getByRole('textbox').nth(1);
  if (await reps.count() && !(await reps.inputValue())) await reps.fill('8');
  await btn.first().click();
  await page.waitForTimeout(300);
  const stop = page.getByRole('button', { name: 'Закончить отдых' });
  const shown = await stop.isVisible().catch(() => false);
  if (shown) {
    const name = await page.locator('.rest-screen__next-name').innerText().catch(() => '');
    if (/Суперсет/.test(name)) { await shot('4-rest-superset'); }
    await stop.click();
  }
}
await page.getByRole('button', { name: 'Выбрать' }).click();
await page.waitForTimeout(500);
const sup = page.locator('.workout__exercise--compact', { hasText: 'Суперсет' }).first();
if (await sup.count()) { await sup.locator('.workout__rounds-head').click(); }
await page.waitForTimeout(300);
await shot('5-pick');
await page.getByRole('button', { name: 'Готово' }).click();
await page.getByRole('button', { name: 'Завершить', exact: true }).click();
await page.waitForTimeout(300);
await shot('6-confirm');
await browser.close();
server.close();
console.log('ok');
