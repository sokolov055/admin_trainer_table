// Снимки редактора упражнений (этап 5, 17.11.2026) — для глазной проверки:
// список тренировки, карточка упражнения, «Об упражнении», суперсет, кардио —
// в программе клиента, в шаблоне программы и в шаблоне тренировки.
// node scripts/shot-exercise-card.mjs [префикс] (DARK=1 — тёмная, NO_BUILD=1 — без сборки)
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
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const sheet = page.locator('.exc-sheet .sheet__panel');
const closeSheet = async () => { await sheet.getByRole('button', { name: 'Готово', exact: true }).click(); await page.waitForTimeout(500); };
try {
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const main = page.locator('#root main:not([hidden])');

  if (want('client')) {
    // Программа клиента: «Мои тренировки» → «Править»
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('button', { name: /Мои тренировки/ }).click();
    const first = main.locator('.plan-card').first();
    await first.getByRole('button', { name: 'Править' }).click();
    await first.locator('.exr').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(700);
    await first.locator('.plan-inline').scrollIntoViewIfNeeded();
    await shot('1-list');
    await first.locator('.exr').nth(1).click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('2-card');
    await sheet.getByRole('button', { name: 'Вес, кг: больше' }).click().catch(() => {});
    await sheet.getByRole('button', { name: 'Разминка: больше' }).click().catch(() => {});
    await sheet.getByRole('button', { name: /Дропсет в конце/ }).click().catch(() => {});
    await page.waitForTimeout(500);
    await shot('3-card-edit');
    await sheet.getByRole('button', { name: /Об упражнении/ }).click();
    await page.waitForTimeout(400);
    await page.locator('.exc-acc').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot('4-about');
    await closeSheet();
    // Суперсет — второй блок
    const second = main.locator('.plan-card').nth(1);
    await second.getByRole('button', { name: 'Править' }).click();
    const ss = second.locator('.plan-inline__unit--superset').first();
    await ss.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot('5-superset-list');
    await ss.locator('.exr').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('6-superset-card');
    await closeSheet();
    // Кардио
    await second.getByRole('button', { name: 'Кардио', exact: true }).click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('7-cardio');
    await sheet.getByRole('button', { name: 'Удалить упражнение' }).click();
    await page.waitForTimeout(600);
  }

  if (want('program')) {
    // Шаблон программы: «Библиотека» → программа → «Изменить» → тренировка
    await page.goto(origin + '/?mockRole=trainer');
    if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await main.locator('.plib-card').filter({ hasText: 'Похудение, 3 раза в неделю' }).first().click();
    await page.getByRole('button', { name: 'Изменить' }).click();
    await main.locator('.plib-ewk').first().waitFor({ timeout: 10000 });
    await main.locator('.plib-ewk__head').first().click();
    await main.locator('.plib-ewk.is-open .exr').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(600);
    await shot('8-program');
    await main.locator('.plib-ewk.is-open .exr').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('9-program-card');
    await closeSheet();
  }

  if (want('workout')) {
    // Шаблон тренировки: «Библиотека» → «Тренировки» → шаблон → «Изменить»
    await page.goto(origin + '/?mockRole=trainer');
    if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await page.getByRole('tab', { name: 'Тренировки', exact: true }).click();
    await main.locator('.item').first().click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Изменить' }).first().click();
    await main.locator('.exr').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    await main.locator('.plan-inline').first().scrollIntoViewIfNeeded();
    await shot('10-workout');
    await main.locator('.exr').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('11-workout-card');
    await closeSheet();
  }
} finally {
  if (errors.length) console.log('ОШИБКИ:', errors.join('\n'));
  await browser.close();
  server.close();
}
