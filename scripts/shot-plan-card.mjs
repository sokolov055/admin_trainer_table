// Карточка тренировки в списке (FT-791, макет workout-card-mockup.html) в
// настоящем браузере по демо-сборке: клиент, «Упражнения и веса», лист
// техники, «Сделано», тренер в «Моих тренировках» и в карточке клиента,
// тёмная тема. node scripts/shot-plan-card.mjs [префикс]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot', 'plan-card');
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
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'OK ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const VIEW = { viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true };

async function open(page, query, dark = false) {
  await page.goto(origin + '/' + query);
  await page.evaluate((d) => { localStorage.clear(); localStorage.setItem('auth_token_v1', 'demo-session'); if (d) localStorage.setItem('app_theme_v1', 'dark'); }, dark);
  await page.goto(origin + '/' + query);
}

async function client(label, query, dark) {
  const page = await browser.newPage({ ...VIEW, colorScheme: dark ? 'dark' : 'light' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (name, full = false) => page.screenshot({ path: `${DEST}-${label}-${name}.png`, fullPage: full });
  try {
    await open(page, query, dark);
    await page.getByRole('button', { name: 'Тренировки', exact: true }).click();
    const main = page.locator('#root main:not([hidden])');
    // Демо по датам спрашивает про прошлую неделю — оставить как есть
    const keep = page.getByRole('button', { name: /Оставить в прошлой неделе/ });
    if (await keep.waitFor({ timeout: 2500 }).then(() => true, () => false)) { await keep.click(); await page.waitForTimeout(500); }
    const card = main.locator('.plan-card').first();
    await card.waitFor({ timeout: 15000 });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await shot('1-card');
    check(label + ': вкладки словами', await main.getByRole('tab', { name: /^(На неделе|В очереди)/ }).count() === 1 && await main.getByRole('tab', { name: /^Вся программа/ }).count() === 1);
    check(label + ': три факта', (await card.locator('.pc-facts span').count()) === 3, await card.locator('.pc-facts').innerText());
    check(label + ': лента картинок', await card.locator('.pc-tile').count() > 0);
    check(label + ': «Начать» внутри карточки', await card.getByRole('button', { name: 'Начать тренировку' }).count() === 1);
    check(label + ': без «Синергисты»', await card.getByText('Синергисты').count() === 0);
    // «Упражнения и веса» — у тренировки с упражнениями из базы и историей
    const low = main.locator('.plan-card', { has: page.getByRole('heading', { name: 'Тренировка 2 — низ' }) });
    const full = (await low.count()) ? low.first() : card;
    await full.locator('.pc-more').click();
    await page.waitForTimeout(700);
    await full.locator('.pc-list').scrollIntoViewIfNeeded();
    await shot('2-list');
    check(label + ': строки с весом прошлого раза', await full.locator('.pc-ex__last').count() > 0, String(await full.locator('.pc-ex__last').count()));
    const tap = full.locator('.pc-ex--tap').first();
    if (await tap.count()) {
      await tap.click();
      await page.locator('.sheet').first().waitFor({ timeout: 5000 });
      await page.waitForTimeout(700);
      await shot('3-sheet');
      check(label + ': лист техники', true);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else check(label + ': лист техники', false, 'нет упражнения из базы');
    await main.getByRole('tab', { name: /^Сделано/ }).click();
    await page.waitForTimeout(500);
    await shot('4-done');
    check(label + ': без ошибок', errors.length === 0, errors.join(' | '));
  } catch (e) {
    await shot('fail');
    check(label + ': сценарий', false, e.message.split('\n')[0]);
  }
  await page.close();
}

async function trainer(label, query, dark, clientCard) {
  const page = await browser.newPage({ ...VIEW, colorScheme: dark ? 'dark' : 'light' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (name, full = false) => page.screenshot({ path: `${DEST}-${label}-${name}.png`, fullPage: full });
  try {
    await open(page, query, dark);
    const main = page.locator('#root main:not([hidden])');
    if (clientCard) {
      await page.getByRole('button', { name: /Клиенты/ }).first().click().catch(() => {});
      await main.locator('button.item').first().click();
      await page.getByRole('tab', { name: 'Тренировки', exact: true }).first().click();
    } else {
      await page.getByRole('button', { name: 'Меню' }).click();
      await page.getByRole('button', { name: /Мои тренировки/ }).click();
    }
    const card = main.locator('.plan-card').first();
    await card.waitFor({ timeout: 15000 });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await shot('1-card');
    check(label + ': «Править»', await card.getByRole('button', { name: 'Править' }).count() === 1);
    if (clientCard) check(label + ': «Провести» вместо «Начать»', await card.getByRole('button', { name: 'Провести' }).count() === 1 && await card.getByRole('button', { name: 'Начать тренировку' }).count() === 0);
    await card.getByRole('button', { name: /^Ещё действия/ }).click();
    await page.getByRole('button', { name: 'Выбрать несколько' }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(500);
    await shot('2-menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await card.getByRole('button', { name: 'Править' }).click();
    await card.locator('.plan-inline__scheme').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    await shot('3-edit');
    check(label + ': правка по кнопке', true);
    check(label + ': без ошибок', errors.length === 0, errors.join(' | '));
  } catch (e) {
    await shot('fail');
    check(label + ': сценарий', false, e.message.split('\n')[0]);
  }
  await page.close();
}

await client('client', '', false);
await client('client-dark', '', true);
await client('client-weeks', '?mockSchedule=1', false);
await trainer('trainer-my', '?mockRole=trainer', false, false);
await trainer('trainer-client', '?mockRole=trainer', true, true);

await browser.close();
server.close();
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
