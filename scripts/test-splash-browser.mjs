import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

/**
 * Заставка при холодном запуске (FT-750, index.html). Настоящий браузер,
 * настоящая страница без бандла: React изображает подмена заглушки #boot.
 *   - в обычном браузере заставки нет;
 *   - в приложении первый кадр — знак 104 × 111 в центре, как нативная
 *     заставка, и нативную снимают только после него;
 *   - уходит, когда доиграла и экран готов; касание пропускает;
 *   - перезагрузка страницы заставку не повторяет.
 */

const html = readFileSync('index.html', 'utf8')
  .replace(/<script src="telegram-web-app.js"[^>]*><\/script>/, '')
  .replace(/<script type="module"[^>]*><\/script>/, '');
const URL_ = 'https://app.test/';

async function open(browser, { native = false, appAt = 300, reduced = false, holdFrames = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.route(URL_ + '**', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(([native, appAt, holdFrames]) => {
    window.__hides = [];
    if (native) {
      window.Capacitor = {
        isNativePlatform: () => true,
        Plugins: { SplashScreen: { hide: (o) => { window.__hides.push({ at: performance.now(), o }); return Promise.resolve(); } } },
      };
    }
    // Кадры по команде теста: посмотреть первый кадр до анимации
    if (holdFrames) {
      const raf = window.requestAnimationFrame.bind(window);
      window.__frames = [];
      window.requestAnimationFrame = (f) => window.__frames.push(f);
      window.__flush = () => { const fs = window.__frames.splice(0); fs.forEach((f) => raf(f)); return fs.length; };
    }
    // «React»: через appAt мс заглушка #boot заменяется экраном
    if (appAt >= 0) {
      addEventListener('DOMContentLoaded', () => setTimeout(() => {
        document.getElementById('root').innerHTML = '<div class="app"><main class="app__body"><h1>Обзор</h1></main></div>';
      }, appAt));
    }
  }, [native, appAt, holdFrames]);
  await page.goto(URL_);
  return { ctx, page, errors };
}

const splashState = (page) => page.evaluate(() => {
  const el = document.getElementById('splash');
  return { present: !!el, cls: el ? el.className : '', on: document.documentElement.classList.contains('splash-on') };
});

test('в обычном браузере заставки нет', async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser);
    const s = await splashState(page);
    assert.equal(s.present, false);
    assert.equal(s.on, false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('в приложении: первый кадр — знак в центре, нативную снимают после него, потом уход', async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser, { native: true, holdFrames: true });
    // Первый кадр: только столбики знака, 104 × 111 по центру экрана 390 × 844
    const first = await page.evaluate(() => {
      const rects = [...document.querySelectorAll('.splash__plate > rect:first-child')].map((r) => r.getBoundingClientRect());
      const box = {
        left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)),
        top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)),
      };
      const shown = [...document.querySelectorAll('.splash rect')].filter((r) => { const b = r.getBoundingClientRect(); return b.width > 0.5 && b.height > 0.5; }).length;
      return { box, shown, hides: window.__hides.length, word: getComputedStyle(document.querySelector('.splash__word')).opacity };
    });
    assert.equal(first.hides, 0, 'нативную заставку не снимают до первого кадра');
    assert.equal(first.shown, 3, 'видны только три столбика знака');
    assert.equal(first.word, '0');
    assert.ok(Math.abs(first.box.right - first.box.left - 104.1) < 0.6, 'ширина знака ' + (first.box.right - first.box.left));
    assert.ok(Math.abs(first.box.bottom - first.box.top - 111.3) < 0.6, 'высота знака ' + (first.box.bottom - first.box.top));
    assert.ok(Math.abs((first.box.left + first.box.right) / 2 - 195) < 0.6, 'знак по центру по горизонтали');
    assert.ok(Math.abs((first.box.top + first.box.bottom) / 2 - 422) < 0.6, 'знак по центру по вертикали');
    // Отпускаем кадры, пока нативную не снимут (кадр в кадре — второй
    // встаёт в очередь только после первого). Опрос по таймеру: свои кадры здесь подменены
    await page.waitForFunction(() => { window.__flush(); return window.__hides.length === 1; }, null, { polling: 50 });
    assert.deepEqual(await page.evaluate(() => window.__hides[0].o), { fadeOutDuration: 0 });
    await page.waitForFunction(() => document.getElementById('splash').classList.contains('splash--go'), null, { polling: 50 });
    // Анимация идёт сама — кадры больше не держим
    await page.evaluate(() => { window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16); window.__flush(); });
    await page.waitForTimeout(1200);
    assert.equal((await splashState(page)).present, true, 'не раньше конца анимации, хотя экран готов');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 2500, polling: 50 });
    assert.equal((await splashState(page)).on, false);
    assert.deepEqual(errors, []);

    // Перезагрузка — заставки нет
    await page.reload();
    assert.equal((await splashState(page)).present, false);
  } finally { await browser.close(); }
});

test('готовая гантель с названием помещается в экран', async () => {
  const browser = await chromium.launch();
  try {
    const { page } = await open(browser, { native: true, appAt: -1 });
    await page.waitForTimeout(1600);
    const box = await page.evaluate(() => {
      // Название — по самому тексту с точкой, а не по строке во всю ширину
      const text = document.createRange(); text.selectNodeContents(document.querySelector('.splash__word'));
      const all = [...document.querySelectorAll('.splash rect')].map((r) => r.getBoundingClientRect()).concat(text.getBoundingClientRect());
      return { left: Math.min(...all.map((r) => r.left)), right: Math.max(...all.map((r) => r.right)), top: Math.min(...all.map((r) => r.top)), bottom: Math.max(...all.map((r) => r.bottom)) };
    });
    assert.ok(box.left > 16 && box.right < 374, 'по ширине ' + JSON.stringify(box));
    // Гантель и название вместе — посередине экрана
    assert.ok(Math.abs((box.top + box.bottom) / 2 - 422) < 8, 'по высоте ' + JSON.stringify(box));
  } finally { await browser.close(); }
});

test('экран не готов — заставка ждёт, но не дольше 4 с; касание пропускает', async () => {
  const browser = await chromium.launch();
  try {
    const { page } = await open(browser, { native: true, appAt: -1 });
    await page.waitForTimeout(2500);
    assert.equal((await splashState(page)).present, true, 'заглушка #boot ещё на месте — ждём');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 2500 });

    const second = await open(browser, { native: true, appAt: -1 });
    await second.page.waitForTimeout(300);
    await second.page.mouse.click(195, 422);
    await second.page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 1000 });
  } finally { await browser.close(); }
});

test('«уменьшить движение»: заставка без анимации и всё равно уходит', async () => {
  const browser = await chromium.launch();
  try {
    const { page, errors } = await open(browser, { native: true, reduced: true });
    await page.waitForTimeout(200);
    const word = await page.evaluate(() => getComputedStyle(document.querySelector('.splash__word')).opacity);
    assert.equal(word, '1', 'название сразу на месте');
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 3000 });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
