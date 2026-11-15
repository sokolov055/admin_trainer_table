// Лист упражнения (TechSheet, 15.11.2026, макет exercise-sheet-mockup.html)
// в настоящем браузере по демо-сборке: из карточки тренировки и из «Техники»
// в занятии, обе вкладки, «Как настроить», тёмная тема, 375 и 390 px.
// Кроме снимков — геометрия: плитки на одной высоте, подложка вкладки ровно
// под выбранной, крестик и кнопки ролика внутри картинки, номера шагов на
// уровне первой строки, без прокрутки вбок.
// node scripts/shot-tech-sheet.mjs [префикс]   (NO_BUILD=1 — без сборки)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot', 'tech-sheet');
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

/** Ровность листа: возвращает список нарушений */
function geometry() {
  const bad = [];
  const sheet = document.querySelector('.tech-sheet .sheet__panel');
  if (!sheet) return ['нет листа'];
  const r = (el) => el.getBoundingClientRect();
  const body = sheet.querySelector('.sheet__body');
  if (body.scrollWidth > body.clientWidth + 1) bad.push(`прокрутка вбок ${body.scrollWidth}>${body.clientWidth}`);
  const hero = sheet.querySelector('.ts-hero');
  const close = sheet.querySelector('.sheet__close');
  // Крестик закреплён на листе; проверяем угол, пока лист не прокручен
  if (hero && close && body.scrollTop < 4) {
    const h = r(hero), c = r(close);
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    if (!(cx > h.left && cx < h.right - 18 && cy > h.top + 18 && cy < h.top + 50)) bad.push(`крестик не в углу картинки (${Math.round(cx - h.right)}, ${Math.round(cy - h.top)})`);
  }
  for (const b of sheet.querySelectorAll('.ts-hero__ctl .ts-pill')) {
    const h = r(hero), p = r(b);
    if (p.left < h.left + 6 || p.bottom > h.bottom - 6) bad.push('кнопка ролика у края');
  }
  const tiles = [...sheet.querySelectorAll('.ts-stat')].map(r);
  if (tiles.length > 1) {
    if (Math.max(...tiles.map((t) => t.top)) - Math.min(...tiles.map((t) => t.top)) > 0.5) bad.push('плитки на разной высоте');
    if (Math.max(...tiles.map((t) => t.height)) - Math.min(...tiles.map((t) => t.height)) > 0.5) bad.push('плитки разной высоты');
    const row = r(sheet.querySelector('.ts-stats'));
    if (Math.abs(tiles[0].left - row.left) > 0.5 || Math.abs(tiles[tiles.length - 1].right - row.right) > 0.5) bad.push('плитки не по краям ряда');
  }
  for (const v of sheet.querySelectorAll('.ts-stat__v')) if (v.scrollWidth > v.clientWidth + 1) bad.push('цифры не влезли: ' + v.textContent);
  const pill = sheet.querySelector('.ts-seg__pill');
  const on = sheet.querySelector('.ts-seg button.is-on');
  if (pill && on) {
    const p = r(pill), o = r(on);
    if (Math.abs(p.left - o.left) > 1 || Math.abs(p.width - o.width) > 1) bad.push(`подложка вкладки мимо (${Math.round(p.left - o.left)}, ${Math.round(p.width - o.width)})`);
  }
  for (const li of sheet.querySelectorAll('.ts-steps li')) {
    const n = r(li.querySelector('.ts-steps__n'));
    // Первая строка текста, а не рамка блока
    const range = document.createRange();
    range.selectNodeContents(li.querySelector('b'));
    const line = range.getClientRects()[0];
    const mid = line.top + line.height / 2;
    if (Math.abs(mid - (n.top + n.height / 2)) > 3) bad.push(`номер шага не по первой строке (${Math.round(mid - n.top - n.height / 2)})`);
  }
  // Строки «что — как»: текст всех строк с одного края, и у строк без подписи
  for (const list of sheet.querySelectorAll('.ts-rows:not(.ts-rows--plain)')) {
    const lefts = [...list.querySelectorAll('li > span')].map((x) => Math.round(r(x).left));
    if (new Set(lefts).size > 1) bad.push('строки настройки не выровнены: ' + lefts.join(','));
  }
  const head = sheet.querySelector('.ts-name');
  if (hero && head && r(head).top < r(hero).bottom) bad.push('название наезжает на картинку');
  // Левый край один: картинка, название, плитки, вкладки, содержимое
  const edge = hero ? Math.round(r(hero).left) : null;
  for (const sel of ['.ts-name h3', '.ts-stats', '.ts-muscles__in', '.ts-seg', '.ts-steps', '.ts-mach__name', '.ts-mach__photos', '.ts-setup h5', '.ts-rows', '.ts-avoid h4', '.ts-swap h4']) {
    const el = sheet.querySelector(sel);
    if (edge !== null && el && Math.abs(Math.round(r(el).left) - edge) > 1) bad.push(`${sel} не по левому краю (${Math.round(r(el).left) - edge})`);
  }
  return bad;
}

async function open(page, query, dark) {
  await page.goto(origin + '/' + query);
  await page.evaluate((d) => { localStorage.clear(); localStorage.setItem('auth_token_v1', 'demo-session'); if (d) localStorage.setItem('app_theme_v1', 'dark'); }, dark);
  await page.goto(origin + '/' + query);
}

async function run(label, width, dark) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true, colorScheme: dark ? 'dark' : 'light' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const shot = (name) => page.screenshot({ path: `${DEST}-${label}-${name}.png` });
  try {
    await open(page, '', dark);
    await page.getByRole('button', { name: 'Тренировки', exact: true }).click();
    const keep = page.getByRole('button', { name: /Оставить в прошлой неделе/ });
    if (await keep.waitFor({ timeout: 2500 }).then(() => true, () => false)) { await keep.click(); await page.waitForTimeout(500); }
    const main = page.locator('#root main:not([hidden])');
    const card = main.locator('.plan-card', { has: page.getByRole('heading', { name: 'Тренировка 1 — верх' }) }).first();
    await card.waitFor({ timeout: 15000 });
    // Из ленты: картинка с подписью «Жим гантелей сидя»
    await card.locator('button.pc-tile').first().click();
    const sheet = page.locator('.tech-sheet');
    await sheet.locator('.ts-steps').waitFor({ timeout: 5000 });
    await page.waitForTimeout(250);
    await shot('0-opening');
    await page.waitForTimeout(900);
    await shot('1-how');
    const g1 = await page.evaluate(geometry);
    check(label + ': «Как делать» ровно', !g1.length, g1.join('; '));
    check(label + ': «Коротко» заголовком', (await sheet.locator('.ts-name h3').innerText()) === 'Жим гантелей сидя');
    check(label + ': ошибки метками', await sheet.locator('.ts-nos span').count() === 3, String(await sheet.locator('.ts-nos span').count()));
    // Мышцы: плитка раскрывает фигуру и полный список (без «+4»)
    const mus = sheet.locator('.ts-stat--mus');
    check(label + ': в плитке мышц нет «+N»', !/\+\d/.test(await mus.innerText()), await mus.innerText());
    await mus.click();
    await page.waitForTimeout(650);
    await shot('1b-muscles');
    check(label + ': мышцы раскрылись', await sheet.locator('.ts-muscles.is-open .ts-mchip').count() > 0);
    const gm = await page.evaluate(geometry);
    check(label + ': раскрытые мышцы ровно', !gm.length, gm.join('; '));
    await mus.click();
    await page.waitForTimeout(500);
    await sheet.getByRole('button', { name: '0,5×' }).click();
    check(label + ': 0,5× нажата', (await sheet.getByRole('button', { name: '0,5×' }).getAttribute('aria-pressed')) === 'true');
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached', timeout: 5000 });

    // Присед: тренажёр и «Как настроить»
    const low = main.locator('.plan-card', { has: page.getByRole('heading', { name: 'Тренировка 2 — низ' }) }).first();
    await low.locator('.pc-more').click();
    await page.waitForTimeout(500);
    await low.locator('.pc-ex--tap').first().click();
    await sheet.locator('.ts-seg').waitFor({ timeout: 5000 });
    await page.waitForTimeout(900);
    await shot('2-squat');
    await sheet.getByRole('tab', { name: 'Тренажёр' }).click();
    await page.waitForTimeout(650);
    await shot('3-machine');
    const g2 = await page.evaluate(geometry);
    check(label + ': «Тренажёр» ровно', !g2.length, g2.join('; '));
    // Тренажёр открыт сразу: фото и «Как настроить» без раскрывашки
    check(label + ': фото тренажёра сразу', await sheet.locator('.ts-mach__photos img').count() > 0);
    check(label + ': настройка открыта', await sheet.locator('.ts-setup .ts-rows li').count() > 0);
    await sheet.locator('.ts-setup').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot('4-setup');
    await sheet.getByRole('tab', { name: 'Как делать' }).click();
    await page.waitForTimeout(650);
    const g3 = await page.evaluate(geometry);
    check(label + ': назад на «Как делать» ровно', !g3.length, g3.join('; '));
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'detached', timeout: 5000 });

    // Внутри занятия: «Техника» у приседа — тот же лист и «Сейчас»
    await low.getByRole('button', { name: 'Начать тренировку' }).click();
    await page.getByRole('heading', { name: 'Тренировка 2 — низ' }).first().waitFor({ timeout: 20000 });
    const squat = page.locator('.workout__exercise').filter({ hasText: 'Присед со штангой' });
    await squat.locator('.workout__about').first().click();
    await sheet.locator('.ts-now').waitFor({ timeout: 5000 });
    await page.waitForTimeout(900);
    await shot('5-workout');
    const g4 = await page.evaluate(geometry);
    check(label + ': в занятии ровно', !g4.length, g4.join('; '));
    check(label + ': кнопки «Тренажёр» в занятии нет', await squat.locator('.workout__machine-btn').count() === 0);
    // Замена из листа: кнопка меняет упражнение и закрывает лист
    const swapBtn = sheet.locator('.ts-swap__btn').first();
    check(label + ': замена — кнопкой', await swapBtn.count() === 1);
    await swapBtn.scrollIntoViewIfNeeded();
    await shot('6-swap');
    await swapBtn.click();
    await sheet.waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('.workout__exercise').filter({ hasText: 'Жим ногами' }).first().waitFor({ timeout: 5000 });
    check(label + ': замена сработала', await page.locator('.workout__exercise').filter({ hasText: 'Присед со штангой' }).count() === 0);
    check(label + ': без ошибок', errors.length === 0, errors.join(' | '));
  } catch (e) {
    check(label + ': сценарий', false, String(e).split('\n')[0]);
  } finally {
    await page.close();
  }
}

await run('390', 390, false);
await run('375', 375, false);
await run('390-dark', 390, true);
await browser.close();
server.close();
console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
