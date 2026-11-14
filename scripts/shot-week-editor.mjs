// Редактор по неделям (FT-788, этап 3) в настоящем браузере по демо-сборке:
// меню переноса, перетаскивание пальцем (удержание, край), сохранение,
// сетка на компьютере, вид клиента. node scripts/shot-week-editor.mjs [префикс]
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
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'OK ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

async function open(page, role) {
  await page.goto(origin + `/?mockRole=${role}&mockSchedule=1`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('auth_token_v1', 'demo-session'); });
  await page.goto(origin + `/?mockRole=${role}&mockSchedule=1`);
}
const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

// ---------------- Телефон, тренер ----------------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (name) => page.screenshot({ path: `${DEST}-${name}.png` });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  try {
    await open(page, 'trainer');
    await page.getByRole('button', { name: 'Меню' }).click();
    await page.getByRole('button', { name: /Мои тренировки/ }).click();
    const main = page.locator('#root main:not([hidden])');
    const editBtn = main.getByRole('button', { name: 'Изменить неделю' });
    await editBtn.waitFor({ timeout: 10000 });
    await editBtn.scrollIntoViewIfNeeded();
    await shot('1-strip');
    await editBtn.click();
    const sheet = page.locator('.we-sheet');
    await sheet.locator('.we-days').waitFor();
    await page.waitForTimeout(450);
    await shot('2-editor');
    const items = () => sheet.locator('.we-days [data-we-item]');
    check('неделя: 3 занятия', (await items().count()) === 3);

    // Меню: последнее занятие (Пт) — на следующую неделю
    await sheet.locator('.we-days button[data-we-item]').last().click();
    const menu = page.locator('.sheet').filter({ hasText: 'куда перенести' });
    await menu.waitFor();
    await page.waitForTimeout(400);
    await shot('3-menu');
    await menu.getByRole('button', { name: /След\. неделя/ }).click();
    await page.waitForTimeout(400);
    check('после переноса в неделе 2 занятия', (await items().count()) === 2);
    check('строка «Перенесено: … →»', await sheet.locator('.we-sent').filter({ hasText: 'Перенесено' }).count() === 1);
    await shot('4-after-menu');
    await sheet.getByRole('button', { name: 'Неделя позже' }).click();
    await page.waitForTimeout(450);
    const n2 = await items().count();
    check('следующая неделя: 4 занятия', n2 === 4, String(n2));
    check('подпись «из …» у перенесённого', await sheet.locator('.we-item.is-moved').count() === 1);
    await shot('5-next-week');

    // Перетаскивание пальцем: удержание 0,35 с → на воскресенье
    const src = sheet.locator('.we-days button[data-we-item]').first();
    const srcTitle = (await src.locator('.we-item__title').textContent()).trim();
    const from = await center(src);
    const sun = sheet.locator('[data-we-day="7"]');
    await sun.scrollIntoViewIfNeeded();
    const to = await center(sun);
    const p0 = await center(src);
    await touch('touchStart', p0);
    await page.waitForTimeout(450);
    check('занятие поднято', await page.locator('.we-ghost').count() === 1);
    for (let i = 1; i <= 10; i += 1) { await touch('touchMove', { x: p0.x + (to.x - p0.x) * i / 10, y: p0.y + (to.y - p0.y) * i / 10 }); await page.waitForTimeout(30); }
    check('день под пальцем подсвечен', await sheet.locator('.we-day.is-over').count() === 1);
    await shot('6-dragging');
    await touch('touchEnd');
    await page.waitForTimeout(300);
    const sunTitles = await sun.locator('.we-item__title').allTextContents();
    check('перетащили на Вс', sunTitles.includes(srcTitle), sunTitles.join(','));
    check('после отпускания ghost убран', await page.locator('.we-ghost').count() === 0);

    // Короткое касание и прокрутка не поднимают занятие
    const q = await center(sheet.locator('.we-days button[data-we-item]').first());
    await touch('touchStart', q);
    await touch('touchMove', { x: q.x, y: q.y - 40 });
    await page.waitForTimeout(450);
    check('прокрутка не поднимает занятие', await page.locator('.we-ghost').count() === 0);
    await touch('touchEnd');

    // К правому краю — неделя перелистывается, кладём на Вт
    const title0 = await sheet.locator('.we-nav__title strong').textContent();
    const e0 = await center(sheet.locator('.we-days button[data-we-item]').first());
    await touch('touchStart', e0);
    await page.waitForTimeout(450);
    await touch('touchMove', { x: 300, y: e0.y });
    await touch('touchMove', { x: 386, y: e0.y });
    await page.waitForTimeout(250);
    check('кольцо у края', await page.locator('.we-edge').count() === 1);
    await shot('7-edge');
    await page.waitForTimeout(500);
    const title1 = await sheet.locator('.we-nav__title strong').textContent();
    check('у края 0,5 с — неделя перелистнулась', title1 !== title0, `${title0} → ${title1}`);
    await page.waitForTimeout(600);
    const title2 = await sheet.locator('.we-nav__title strong').textContent();
    check('сразу дальше не листает (блок 1,2 с)', title2 === title1);
    const tue = await center(sheet.locator('[data-we-day="2"]'));
    for (let i = 1; i <= 6; i += 1) { await touch('touchMove', { x: 386 + (tue.x - 386) * i / 6, y: e0.y + (tue.y - e0.y) * i / 6 }); await page.waitForTimeout(30); }
    await touch('touchEnd');
    await page.waitForTimeout(400);
    check('положили на Вт другой недели', await sheet.locator('[data-we-day="2"] .we-item.is-moved').count() >= 1);
    await shot('8-dropped-other-week');

    // Сохранить с «Уведомить клиента»
    await sheet.getByRole('button', { name: 'Сохранить' }).scrollIntoViewIfNeeded();
    check('есть «Уведомить клиента»', await sheet.getByText('Уведомить клиента').count() === 1);
    await shot('9-changes');
    await sheet.getByRole('button', { name: 'Сохранить' }).click();
    await page.locator('.we-sheet').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(600);
    const strip = main.locator('.plan-weeks__card');
    await strip.scrollIntoViewIfNeeded();
    await shot('10-saved');
    const line = await strip.textContent();
    check('после сохранения в неделе 2 занятия', /из 2/.test(line), line.slice(0, 120));
    check('без ошибок в консоли', errors.length === 0, errors.join(' | '));
  } catch (e) {
    await shot('fail-phone');
    check('телефон: сценарий', false, e.message.split('\n')[0] + ' ' + errors.join(' | '));
  }
  await page.close();
}

// ---------------- Компьютер, тренер: неделя сеткой, мышь ----------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: 'ru-RU' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await open(page, 'trainer');
    await page.getByRole('button', { name: 'Меню' }).click();
    await page.getByRole('button', { name: /Мои тренировки/ }).click();
    const main = page.locator('#root main:not([hidden])');
    await main.getByRole('button', { name: 'Изменить неделю' }).click();
    const sheet = page.locator('.we-sheet');
    await sheet.locator('.we-days').waitFor();
    await page.waitForTimeout(450);
    await sheet.getByRole('button', { name: 'Неделя позже' }).click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${DEST}-11-desktop.png` });
    const cols = await sheet.locator('.we-days').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    check('компьютер: 7 колонок', cols === 7, String(cols));
    const src = sheet.locator('.we-days button[data-we-item]').first();
    const a = await center(src);
    const b = await center(sheet.locator('[data-we-day="4"]'));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) { await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await page.waitForTimeout(20); }
    await page.mouse.up();
    await page.waitForTimeout(300);
    check('мышь: перенесли на Чт', await sheet.locator('[data-we-day="4"] .we-item').count() === 1);
    check('мышь: меню не открылось после переноса', await page.locator('.sheet').filter({ hasText: 'куда перенести' }).count() === 0);
    await page.screenshot({ path: `${DEST}-12-desktop-moved.png` });
    check('компьютер: без ошибок', errors.length === 0, errors.join(' | '));
  } catch (e) {
    await page.screenshot({ path: `${DEST}-fail-desktop.png` });
    check('компьютер: сценарий', false, e.message.split('\n')[0]);
  }
  await page.close();
}

// ---------------- Телефон, клиент ----------------
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await open(page, 'client');
    const main = page.locator('#root main:not([hidden])');
    await page.getByRole('button', { name: /Тренировки/ }).first().click();
    // Лист «Прошлая неделя завершилась» — оставить как есть
    const choice = page.getByRole('button', { name: /Оставить в прошлой неделе/ });
    await choice.waitFor({ timeout: 8000 }).then(() => choice.click()).catch(() => {});
    await page.waitForTimeout(500);
    const editBtn = main.getByRole('button', { name: 'Изменить неделю' });
    await editBtn.waitFor({ timeout: 10000 });
    await editBtn.click();
    const sheet = page.locator('.we-sheet');
    await sheet.locator('.we-days').waitFor();
    await page.waitForTimeout(450);
    check('клиент: вместо галочки — «Тренер получит уведомление»', await sheet.getByText('Тренер получит уведомление').count() === 1 && await sheet.getByText('Уведомить клиента').count() === 0);
    await page.screenshot({ path: `${DEST}-13-client.png` });
    check('клиент: без ошибок', errors.length === 0, errors.join(' | '));
  } catch (e) {
    await page.screenshot({ path: `${DEST}-fail-client.png` });
    check('клиент: сценарий', false, e.message.split('\n')[0]);
  }
  await page.close();
}

console.log(results.join('\n'));
await browser.close();
server.close();
