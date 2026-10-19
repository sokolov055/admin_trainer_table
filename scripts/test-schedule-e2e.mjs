// Расписание в настоящем браузере на демо-сборке: экран без прокрутки
// страницы, виды через меню, листание пальцем ровно на экран с той же
// прокруткой по часам, перенос удержанием (касаниями, а не мышью) — личного
// события сразу, занятия — с вопросом «чей перенос». Скриншоты для глаз — в
// .impeccable/review.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const REVIEW = join(ROOT, '.impeccable', 'review');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

/** Касания через CDP: тот же путь, что у пальца, — с touch-action и прокруткой */
function finger(cdp) {
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    async drag(from, to, { hold = 0, steps = 12, pause = 16 } = {}) {
      await send('touchStart', from.x, from.y);
      if (hold) await wait(hold);
      for (let i = 1; i <= steps; i += 1) {
        await send('touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
        await wait(pause);
      }
      await wait(60);
      await send('touchEnd');
    },
  };
}

test('расписание: экран, виды, листание и перенос касанием', { timeout: 240000 }, async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], {
    cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore',
  });
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
    const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const touch = finger(cdp);
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));
  mkdirSync(REVIEW, { recursive: true });

  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + '/?mockRole=trainer');
    await page.evaluate(() => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.removeItem('schedule_view_v1'); });
    await page.goto(origin + '/?mockRole=trainer');
    await page.getByRole('button', { name: 'Расписание' }).first().click();
    await page.locator('.cal-grid__scroll').waitFor();
    await page.waitForTimeout(600);

    // Экран: сетка сразу под строкой месяца, прокручивать страницу нечего
    const gridTop = await page.locator('.cal-grid').evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(gridTop < 70, 'сетка начинается сразу под строкой месяца, а не ниже: ' + gridTop);
    const pageScroll = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
    assert.ok(pageScroll <= 1, 'страница не прокручивается: ' + pageScroll);
    const gridBottom = await page.locator('.cal-grid').evaluate((el) => el.getBoundingClientRect().bottom);
    assert.ok(gridBottom > 700, 'сетка тянется до нижнего меню: ' + gridBottom);
    await page.screenshot({ path: join(REVIEW, 'schedule-3day.png') });

    // Листание пальцем: «3 дня» — ровно на три дня, прокрутка по часам на месте
    const firstDay = () => page.locator('.cal-grid__head .cal-grid__day').nth(3).getAttribute('aria-label');
    const before = await firstDay();
    await page.locator('.cal-grid__scroll').evaluate((el) => { el.scrollTop = 400; });
    const box = await page.locator('.cal-grid__scroll').boundingBox();
    const mid = { x: box.x + box.width / 2 + 60, y: box.y + box.height / 2 };
    await touch.drag(mid, { x: mid.x - 220, y: mid.y + 6 });
    await page.waitForTimeout(500);
    const after = await firstDay();
    assert.notEqual(after, before);
    const dayNum = (s) => Number(s.match(/(\d+)/)[1]);
    const diff = (dayNum(after) - dayNum(before) + 31) % 31;
    assert.ok(diff === 3 || diff === 3 - 31 + 30, `лист сдвинулся на три дня: ${before} → ${after}`);
    assert.equal(await page.locator('.cal-grid__scroll').evaluate((el) => el.scrollTop), 400, 'прокрутка по часам осталась');
    // и обратно
    await touch.drag({ x: mid.x - 120, y: mid.y }, { x: mid.x + 120, y: mid.y - 4 });
    await page.waitForTimeout(500);
    assert.equal(await firstDay(), before, 'вернулись на исходные три дня');

    // Новое личное событие: заготовка по первому нажатию, форма — по второму
    await page.locator('.cal-grid__scroll').evaluate((el) => { el.scrollTop = 48 * 9; });
    // Свободное место в среднем дне: середина часа, где нет занятий
    const spot = await page.locator('.cal-grid__col').nth(3).evaluate((col, h) => {
      const r = col.getBoundingClientRect();
      const busy = [...col.querySelectorAll('.cal-event')].map((e) => [e.offsetTop, e.offsetTop + e.offsetHeight]);
      for (let m = 9 * 60; m < 18 * 60; m += 30) {
        const y = (m / 60) * h + h / 4;
        if (!busy.some(([a, b]) => y >= a - 4 && y <= b + 4)) return { x: r.left + r.width / 2, y: r.top + y };
      }
      return null;
    }, 48);
    assert.ok(spot, 'есть свободное место');
    await page.locator('.cal-grid__scroll').evaluate((el, y) => { el.scrollTop += y - el.getBoundingClientRect().top - 200; }, spot.y);
    await page.waitForTimeout(100);
    const spot2 = { x: spot.x, y: 0 };
    spot2.y = await page.locator('.cal-grid__scroll').evaluate((el) => el.getBoundingClientRect().top + 200);
    await page.touchscreen.tap(spot2.x, spot2.y);
    const draft = page.locator('.cal-draft');
    await draft.waitFor();
    await draft.click();
    await page.getByRole('radio', { name: 'Личное событие' }).click();
    await page.getByLabel('Название события').fill('Массаж QA');
    await page.getByLabel('Время').fill('11:00');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    const event = page.getByRole('button', { name: /Массаж QA/ }).first();
    await event.waitFor();
    await page.waitForTimeout(400);

    // Перенос удержанием: палец стоит 450 мс, потом ведёт на час вниз
    const eb = await event.boundingBox();
    const hour = await page.locator('.cal-grid__scroll > .cal-grid__row').evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--hour')));
    const grab = { x: eb.x + eb.width / 2, y: eb.y + 8 };
    const scrollBefore = await page.locator('.cal-grid__scroll').evaluate((el) => el.scrollTop);
    await touch.drag(grab, { x: grab.x, y: grab.y + hour }, { hold: 450, steps: 10 });
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.cal-grid__scroll').evaluate((el) => el.scrollTop), scrollBefore, 'при переносе сетка не прокручивалась');
    await page.getByRole('status').filter({ hasText: 'Перенесено' }).waitFor();
    assert.ok(await page.getByRole('button', { name: /^12:00–13:00 Массаж QA/ }).count(), 'личное событие на 12:00');
    await page.screenshot({ path: join(REVIEW, 'schedule-moved.png') });

    // «Вернуть» — обратно на 11:00
    await page.getByRole('button', { name: 'Вернуть' }).click();
    await page.getByRole('button', { name: /^11:00–12:00 Массаж QA/ }).waitFor();

    // Без удержания то же движение — прокрутка, событие на месте
    const eb2 = await page.getByRole('button', { name: /Массаж QA/ }).first().boundingBox();
    await touch.drag({ x: eb2.x + eb2.width / 2, y: eb2.y + 8 }, { x: eb2.x + eb2.width / 2, y: eb2.y + 8 - 120 }, { steps: 8 });
    await page.waitForTimeout(500);
    assert.ok(await page.getByRole('button', { name: /^11:00–12:00 Массаж QA/ }).count(), 'быстрое движение не переносит');

    // Занятие с клиентом: после переноса — вопрос, чей он
    // Только видимые три дня (лента — с соседями по бокам), не прошедшее
    const lesson = page.locator('.cal-grid__col:nth-child(n+4):nth-child(-n+6) [data-movable="1"]:not(.cal-event--personal):not(.cal-event--done)').first();
    await lesson.evaluate((el) => {
      const sc = el.closest('.cal-grid__scroll');
      sc.scrollTop = el.offsetTop - 120;
    });
    await page.waitForTimeout(150);
    const lb = await lesson.boundingBox();
    const lessonLabel = await lesson.getAttribute('aria-label');
    await touch.drag({ x: lb.x + lb.width / 2, y: lb.y + 6 }, { x: lb.x + lb.width / 2, y: lb.y + 6 + hour / 2 }, { hold: 450, steps: 6 });
    const sheet = page.getByRole('dialog', { name: 'Перенос занятия' });
    await sheet.waitFor();
    await page.screenshot({ path: join(REVIEW, 'schedule-ask.png') });
    await sheet.getByRole('button', { name: 'Не переносить' }).click();
    await sheet.waitFor({ state: 'detached' });
    assert.equal(await page.locator(`[aria-label="${lessonLabel}"]`).count() > 0, true, '«Не переносить» вернул занятие на место');

    // Виды — через меню; месяц на весь экран
    await page.getByRole('button', { name: /^3 дня/ }).click();
    await page.getByRole('menuitemradio', { name: 'Месяц' }).click();
    await page.locator('.cal-month__page--current').waitFor();
    const monthTitle = await page.locator('.cal-top__title').innerText();
    // Все шесть недель с занятиями: месяц грузится тремя запросами в пределах сервера
    await page.waitForFunction(() => [...document.querySelectorAll('.cal-month__page--current .cal-month__cell')]
      .filter((c) => c.querySelector('.cal-event--chip')).length >= 40, null, { timeout: 8000 });
    await page.screenshot({ path: join(REVIEW, 'schedule-month.png') });
    const vp = await page.locator('.cal-month__viewport').boundingBox();
    await touch.drag({ x: vp.x + vp.width - 40, y: vp.y + 200 }, { x: vp.x + 60, y: vp.y + 210 });
    await page.waitForTimeout(500);
    assert.notEqual(await page.locator('.cal-top__title').innerText(), monthTitle, 'месяц перелистнулся');

    await page.getByRole('button', { name: /^Месяц/ }).click();
    await page.getByRole('menuitemradio', { name: 'Список' }).click();
    await page.locator('.cal-agenda__item').first().waitFor();
    await page.screenshot({ path: join(REVIEW, 'schedule-list.png') });

    // Выбор даты — по названию месяца
    await page.locator('.cal-top__title').click();
    await page.locator('.cal-mini').waitFor();
    await page.screenshot({ path: join(REVIEW, 'schedule-picker.png') });

    assert.deepEqual(errors, [], 'в консоли нет ошибок');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(OUT, { recursive: true, force: true });
  }
});
