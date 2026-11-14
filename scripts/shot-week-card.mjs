// Карточка недели (макет week-zone-mockup-v2.html, 14.11.2026) в настоящем
// браузере по демо-сборке: кольцо, дни, меню занятия, «без долга», ⚙,
// «+», свайп, вид клиента. node scripts/shot-week-card.mjs [префикс]
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
    const card = main.locator('.wc');
    await card.waitFor({ timeout: 10000 });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    await shot('1-card');
    check('старой полоски и «Программа: …» нет', await main.locator('.plan-weeks__strip, .wk-status').count() === 0);
    check('строки «Скрыть от клиента» нет', await main.getByRole('button', { name: 'Скрыть от клиента' }).count() === 0);
    check('кольцо 0/3', (await card.locator('.wc-ring__num').textContent()).includes('0/3'));
    check('7 дней', await card.locator('.wc-day').count() === 7);
    check('3 значка занятий', await card.locator('.wc-dot').count() === 3);
    check('вкладки короче', await main.getByRole('tab', { name: /^Неделя \d/ }).count() === 1 && await main.getByRole('tab', { name: /^Сделано/ }).count() === 1);
    check('«+» свободная', await main.getByRole('button', { name: 'Свободная тренировка' }).count() === 1);
    // Кольцо не заходит на текст: цифра внутри внутреннего круга
    const geo = await card.locator('.wc-ring').evaluate((ring) => {
      const r = ring.getBoundingClientRect();
      const t = ring.querySelector('.wc-ring__num small').getBoundingClientRect();
      const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
      const far = Math.max(...[[t.left, t.top], [t.right, t.top], [t.left, t.bottom], [t.right, t.bottom]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
      return { far, inner: 38 - 3.5 };
    });
    check('подпись внутри кольца', geo.far < geo.inner, `${geo.far.toFixed(1)} < ${geo.inner}`);

    // Меню занятия
    await card.locator('button.wc-dot').first().click();
    const menu = page.locator('.sheet').filter({ has: page.locator('.wc-menu') });
    await menu.waitFor();
    await page.waitForTimeout(400);
    await shot('2-menu');
    check('меню: начать / перенести / без долга', await menu.getByRole('button', { name: 'Начать тренировку' }).count() === 1
      && await menu.getByRole('button', { name: 'Перенести' }).count() === 1 && await menu.getByRole('button', { name: 'Не будет, без долга' }).count() === 1);
    await menu.getByRole('button', { name: 'Не будет, без долга' }).click();
    await menu.waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(900);
    check('без долга: кольцо 0/2', (await card.locator('.wc-ring__num').textContent()).includes('0/2'));
    check('неделя помечена изменённой', await card.locator('.wc__edited').count() === 1);
    await shot('3-removed');

    // Перенести → редактор недель
    await card.locator('button.wc-dot').first().click();
    await menu.waitFor();
    await menu.getByRole('button', { name: 'Перенести' }).click();
    await page.locator('.we-sheet').waitFor({ timeout: 5000 });
    check('«Перенести» открывает редактор', true);
    await page.locator('.we-sheet').getByRole('button', { name: 'Отменить' }).click();
    await page.locator('.we-sheet').waitFor({ state: 'detached', timeout: 5000 });

    // Свайп по карточке — следующая неделя
    const title0 = await card.locator('.wc__title').textContent();
    const b = await card.locator('.wc__mid').boundingBox();
    const y = b.y + b.height / 2;
    await touch('touchStart', { x: 320, y });
    for (let i = 1; i <= 6; i += 1) { await touch('touchMove', { x: 320 - i * 30, y }); await page.waitForTimeout(16); }
    await touch('touchEnd');
    await page.waitForTimeout(500);
    const title1 = await card.locator('.wc__title').textContent();
    check('свайп листает неделю', title1 !== title0, `${title0} → ${title1}`);
    check('свайп не сменил вкладку карточки', await page.getByRole('tab', { name: 'Тренировки', selected: true }).count() + await main.locator('.wc').count() > 0);
    await shot('4-next');

    // ⚙ — настройки с «видна клиенту» (у «Моих тренировок» видимости нет — проверяем только лист)
    await card.getByRole('button', { name: 'Настроить' }).click();
    await page.getByText('Недель в программе').waitFor({ timeout: 5000 });
    check('⚙ открывает «Настроить программу»', true);
    await page.keyboard.press('Escape');
    check('телефон: без ошибок', errors.length === 0, errors.join(' | '));
  } catch (e) {
    await shot('fail-trainer');
    check('тренер: сценарий', false, e.message.split('\n')[0] + ' ' + errors.join(' | '));
  }
  await page.close();
}

// Тренер в карточке клиента: «видна клиенту» — в ⚙
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await open(page, 'trainer');
    await page.goto(origin + '/?mockRole=trainer&mockSchedule=1&client=3&tab=plan');
    await page.waitForTimeout(1500);
    const main = page.locator('#root main:not([hidden])');
    if (await main.locator('.wc').count() === 0) {
      await page.getByRole('button', { name: /Клиенты/ }).first().click().catch(() => {});
      await page.locator('#root main:not([hidden]) button.item').first().click();
      await page.getByRole('tab', { name: 'Тренировки', exact: true }).first().click();
    }
    const card = main.locator('.wc');
    await card.waitFor({ timeout: 10000 });
    await card.getByRole('button', { name: 'Настроить' }).click();
    await page.getByText('Программа видна клиенту').waitFor({ timeout: 5000 });
    check('карточка клиента: в ⚙ «Программа видна клиенту»', true);
    await page.screenshot({ path: `${DEST}-5-settings.png` });
    check('карточка клиента: без ошибок', errors.length === 0, errors.join(' | '));
  } catch (e) {
    await page.screenshot({ path: `${DEST}-fail-client-card.png` });
    check('карточка клиента: сценарий', false, e.message.split('\n')[0]);
  }
  await page.close();
}

// Клиент: без ⚙
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await open(page, 'client');
    await page.getByRole('button', { name: /Тренировки/ }).first().click();
    const choice = page.getByRole('button', { name: /Оставить в прошлой неделе/ });
    await choice.waitFor({ timeout: 8000 }).then(() => choice.click()).catch(() => {});
    const card = page.locator('#root main:not([hidden]) .wc');
    await card.waitFor({ timeout: 10000 });
    await page.waitForTimeout(1000);
    check('клиент: карточка без ⚙', await card.getByRole('button', { name: 'Настроить' }).count() === 0);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DEST}-6-client.png` });
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
