// Снимки FT-802 (18.11.2026) — для глазной проверки: «Об упражнении» плитками
// в карточке редактора программы, лист упражнения по нажатию на название в
// идущем занятии тренера, упражнение и суперсет в занятии.
// node scripts/shot-workout-redesign.mjs [префикс] (NO_BUILD=1 — без сборки, ONLY=about,name)
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
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 390), height: Number(process.env.H || 844) }, locale: 'ru-RU', hasTouch: true, isMobile: true, colorScheme: process.env.DARK === '1' ? 'dark' : 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name, opts = {}) => page.screenshot({ path: `${DEST}-${name}.png`, ...opts });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
/** Всё ли внутри панели по ширине: элемент правее/левее своего листа — ошибка вёрстки */
const overflow = (sel) => page.evaluate((s) => {
  const root = document.querySelector(s);
  if (!root) return ['нет ' + s];
  const box = root.getBoundingClientRect();
  const bad = [];
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).position === 'fixed') continue;
    if (el.closest('.ab-eqs, .exc-strip, .exc-rest, .chips, .rt-wrap')) continue; // ленты прокручиваются сами
    if (r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push((el.className || el.tagName) + ' ' + Math.round(r.left) + '…' + Math.round(r.right));
  }
  return bad.slice(0, 8);
}, sel);
try {
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  const main = page.locator('#root main:not([hidden])');

  if (want('about')) {
    const sheet = page.locator('.exc-sheet .sheet__panel');
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('button', { name: /Мои тренировки/ }).click();
    const first = main.locator('.plan-card').first();
    await first.getByRole('button', { name: 'Править' }).click();
    await first.locator('.exr').first().waitFor({ timeout: 10000 });
    // Упражнение из базы — с тренажёром и заменами: «Заменить» → «Жим ногами»
    await first.locator('.exr').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(700);
    await sheet.getByRole('button', { name: 'Заменить' }).click();
    await sheet.locator('.picker input').fill('Жим ногами');
    await page.waitForTimeout(400);
    await sheet.locator('.picker__list [aria-selected], .picker__list button').filter({ hasText: 'Жим ногами' }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (!(await sheet.locator('.exc-acc.is-open').count())) await sheet.getByRole('button', { name: /Об упражнении/ }).click();
    await sheet.locator('.ab-eqs').first().waitFor({ timeout: 8000 });
    await page.waitForTimeout(500);
    await page.locator('.exc-acc').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(500);
    await shot('1-about');
    console.log('about overflow', JSON.stringify(await overflow('.exc-sheet .sheet__body')));
    await sheet.locator('.ab-lab__q').first().click();
    await sheet.locator('.ab-add').first().click();
    await page.waitForTimeout(400);
    await page.locator('.exc-acc__body .ab-sec').nth(2).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot('2-about-help');
    await sheet.locator('.ab-tile').first().click();
    await page.waitForTimeout(400);
    await shot('3-about-muscles-open');
    await page.goto(origin + '/?mockRole=trainer');
  }

  if (want('name')) {
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('button', { name: /Мои тренировки/ }).click();
    const first = main.locator('.plan-card').first();
    await first.getByRole('button', { name: /Начать/ }).first().click();
    await page.locator('.workout__exercise').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1200);
    await shot('4-workout');
    await page.locator('.workout__name-tap').first().click();
    const sh = page.locator('.wk-name-sheet .sheet__panel');
    await sh.waitFor({ timeout: 5000 });
    await page.waitForTimeout(900);
    await shot('5-name-sheet');
    console.log('name overflow', JSON.stringify(await overflow('.wk-name-sheet .sheet__body')));
    await sh.locator('.sheet__body').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(400);
    await shot('6-name-sheet-end');
    await sh.getByRole('button', { name: 'Другое упражнение' }).click();
    await page.waitForTimeout(500);
    await shot('7-name-pick');
    await sh.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.waitForTimeout(700);
    await shot('8-after-close');
  }

  if (want('ex')) {
    // Клиент: «Тренировка 1 — верх» → текущее упражнение полосой
    await page.goto(origin + '/');
    const cur = page.locator('.workout__exercise--current').first();
    await page.getByRole('button', { name: 'Тренировки', exact: true }).click();
    await page.locator('.section', { has: page.getByRole('heading', { name: 'Тренировка 1 — верх' }) }).getByRole('button', { name: 'Начать тренировку' }).click();
    await cur.waitFor({ timeout: 15000 });
    await page.waitForTimeout(1200);
    await shot('9-ex');
    console.log('ex overflow', JSON.stringify(await overflow('.workout__exercise--current')));
    const geo = await cur.evaluate((c) => {
      const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.height)]; };
      return { vals: [...c.querySelectorAll('.wk-set.is-shown .wk-val')].map(r), bars: [...c.querySelectorAll('.wk-bar')].map(r) };
    });
    console.log('geo', JSON.stringify(geo));
    await cur.getByRole('button', { name: /: больше$/ }).first().click();
    await cur.getByRole('button', { name: /: больше$/ }).first().click();
    await page.waitForTimeout(200);
    await shot('10-ex-plus');
    const top0 = await page.evaluate(() => document.querySelector('.workout__exercise--current').getBoundingClientRect().height);
    await cur.getByRole('button', { name: 'Норм', exact: true }).click();
    await page.waitForTimeout(150);
    await shot('11-ex-rated-anim');
    await page.waitForTimeout(900);
    const top1 = await page.evaluate(() => document.querySelector('.workout__exercise--current') && document.querySelector('.workout__exercise--current').getBoundingClientRect().height);
    console.log('card height before/after rating', top0, top1);
    await shot('12-ex-rated');
    await page.getByRole('button', { name: 'Закончить отдых' }).click().catch(() => {});
    await page.waitForTimeout(700);
    await shot('12b-ex-after-rest');
    // Нажать первый, сделанный столбик — он на виду
    const card = page.locator('.workout__exercise').filter({ has: page.locator('.wk-bar.is-done') }).first();
    await card.locator('.wk-bar.is-done').first().click();
    await page.waitForTimeout(500);
    await shot('13-ex-done-bar');
    await card.getByRole('button', { name: 'Добавить подход или разминку' }).click();
    await page.waitForTimeout(400);
    await shot('14-ex-add');
    await card.getByRole('button', { name: /: ещё$/ }).click();
    await page.waitForTimeout(300);
    await shot('15-ex-menu');
    await page.getByRole('menuitem', { name: 'Заметка' }).click().catch(() => {});
    await page.waitForTimeout(400);
    await shot('16-ex-note');
  }
} catch (e) {
  errors.push('СЦЕНАРИЙ: ' + e.message.split('\n').slice(0, 12).join(' | '));
  await shot('error');
} finally {
  console.log('errors', JSON.stringify(errors));
  await browser.close();
  server.close();
}
