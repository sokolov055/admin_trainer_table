import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

/**
 * Переходы без мерцания: каждый раздел нижнего меню и каждый подраздел
 * (вкладки и переключатели над экраном) у клиента и у тренера.
 *
 * 24.10.2026 на iPhone при смене подраздела экран на кадр-два пустел и
 * проступали призраки и тыквы темы: секции появлялись из прозрачности
 * (лесенка .enter). Глазом в браузере компьютера это почти не видно —
 * проверка смотрит на сами анимации: после касания, кадр за кадром, не
 * должно быть крупного блока, который проявляется из прозрачности.
 *
 * Демо-сборка (VITE_MOCK=1), как в test-e2e.mjs: живых данных не трогает.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-transitions');
const VIEWPORT = { width: 390, height: 844 };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

let server;
let browser;
let origin;

before(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-transitions'], {
    cwd: ROOT,
    env: { ...process.env, VITE_MOCK: '1' },
    stdio: 'ignore',
  });
  server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
    const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
}, { timeout: 180000 });

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(OUT, { recursive: true, force: true });
});

/**
 * Нажать и 30 кадров смотреть на анимации: крупный (≥ 8% экрана) видимый
 * блок, у которого прозрачность в анимации опускается ниже 0,9, — мерцание.
 * Возвращает описания таких блоков.
 */
const clickAndWatch = (page, locator) => locator.evaluate((el) => new Promise((resolve) => {
  const found = new Map();
  const screen = innerWidth * innerHeight;
  const describe = (node) => {
    const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return node.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const look = () => {
    for (const a of document.getAnimations()) {
      const target = a.effect && a.effect.target;
      // Заглушка загрузки дышит прозрачностью нарочно — это не переход
      if (!target || !target.isConnected || target.closest('[hidden]') || target.classList.contains('skeleton')) continue;
      const frames = a.effect.getKeyframes();
      const lowest = Math.min(...frames.map((f) => (f.opacity == null || f.opacity === '' ? 1 : Number(f.opacity))));
      if (!(lowest < 0.9)) continue;
      const r = target.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      if (visible < screen * 0.08) continue;
      const name = (a.animationName || a.transitionProperty || 'animation') + ' → ' + describe(target);
      found.set(name, true);
    }
  };
  el.click();
  let n = 0;
  const tick = () => {
    look();
    if (++n < 30) requestAnimationFrame(tick); else resolve([...found.keys()]);
  };
  requestAnimationFrame(tick);
}));

/** Видимые элементы по селектору — подписи, чтобы потом найти их снова */
const labels = (page, selector) => page.evaluate((sel) => [...document.querySelectorAll(sel)]
  .filter((b) => !b.closest('[hidden]') && b.offsetParent !== null && !b.disabled)
  .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim())
  .filter(Boolean), selector);

const visibleNamed = (page, selector, label) => page.locator(selector)
  .filter({ hasText: label })
  .filter({ visible: true })
  .first();

/** Каждый вариант по селектору, потом снова первый — и туда, и обратно */
async function each(page, selector, visit) {
  const subs = await labels(page, selector);
  for (const sub of [...subs.slice(1), subs[0]].filter(Boolean)) {
    const target = visibleNamed(page, selector, sub);
    if (!(await target.count())) continue;
    await visit(sub, target);
  }
}

/**
 * Подразделы открытого экрана: вкладки, а в каждой — её переключатели
 * («Сводка → Процессы → Месяц/Год»).
 */
async function subsections(page, where, note) {
  const radios = (here) => each(page, '#root [role=radiogroup] [role=radio]', async (sub, target) => {
    note(`${here} → «${sub}»`, await clickAndWatch(page, target));
    await page.waitForTimeout(300);
  });
  await each(page, '#root [role=tab]', async (sub, target) => {
    note(`${where} → «${sub}»`, await clickAndWatch(page, target));
    await page.waitForTimeout(300);
    await radios(`${where} → «${sub}»`);
  });
  await radios(where);
}

/**
 * Обойти все разделы меню и в каждом — все подразделы.
 * Возвращает список «переход: что мигнуло».
 */
function walker(t) {
  const problems = [];
  const checked = [];
  const note = (where, list) => {
    checked.push(where);
    list.forEach((what) => problems.push(where + ': ' + what));
  };
  const report = () => {
    t.diagnostic(`переходов: ${checked.length} — ${checked.join('; ')}`);
    return problems;
  };
  return { note, report };
}

async function walk(page, note) {
  const tabs = await labels(page, '.tabbar__item');
  assert.ok(tabs.length >= 3, 'нижнее меню на месте: ' + tabs.join(', '));
  // Дважды по кругу: первый показ раздела и возврат в уже открытый
  for (const round of [1, 2]) {
    for (const tab of tabs) {
      note(`меню «${tab}» (${round})`, await clickAndWatch(page, visibleNamed(page, '.tabbar__item', tab)));
      await page.waitForTimeout(400);
      if (round === 1) await subsections(page, `«${tab}»`, note);
    }
  }
}

const open = async (path) => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const page = await context.newPage();
  await page.goto(origin + path);
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + path);
  await page.locator('.tabbar__item').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  return { context, page };
};

test('клиент: разделы и подразделы без мерцания', async (t) => {
  const { context, page } = await open('/');
  const { note, report } = walker(t);
  try {
    await walk(page, note);
    assert.deepEqual(report(), []);
  } finally { await context.close(); }
}, { timeout: 600000 });

test('тренер: разделы, подразделы и карточка клиента без мерцания', async (t) => {
  const { context, page } = await open('/?mockRole=trainer');
  const { note, report } = walker(t);
  try {
    await walk(page, note);
    await page.locator('.tabbar__item', { hasText: 'Клиенты' }).first().click();
    await page.getByRole('tab', { name: /^Все · / }).click();
    await page.locator('#root main:not([hidden]) .item').first().click();
    await page.getByRole('button', { name: 'Глазами клиента' }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await subsections(page, 'карточка клиента', note);
    assert.deepEqual(report(), []);
  } finally { await context.close(); }
}, { timeout: 600000 });

/**
 * Листание пальцем с рисунком темы: соседний раздел в сцене — снимок
 * страницы, и снимок, сделанный в конце прошлого жеста, уносил с собой
 * рисунок (.live-art). В сцене, у которой он свой, рисунок ложился дважды —
 * раздел ехал ярче и темнел, когда жест кончался (владелец, 24.10.2026).
 */
test('тренер, «Хэллоуин»: листание пальцем — рисунок темы в сцене один раз', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await page.goto(origin + '/?mockRole=trainer');
    await page.evaluate(() => {
      localStorage.setItem('auth_token_v1', 'demo-session');
      localStorage.setItem('app_palette_v1', 'halloween');
    });
    await page.goto(origin + '/?mockRole=trainer');
    await page.locator('.tabbar__item').first().waitFor({ timeout: 60000 });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'halloween');
    const cdp = await context.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const active = () => page.locator('.tabbar__item--active').innerText();
    const y = 760;
    // Библиотека → Сводка пальцем: в конце жеста снимается снимок библиотеки
    await page.locator('.tabbar__item', { hasText: 'Библиотека' }).tap();
    await page.waitForTimeout(800);
    await touch('touchStart', 330, y);
    for (let x = 310; x >= 60; x -= 25) await touch('touchMove', x, y);
    await touch('touchEnd', 60, y);
    await page.waitForTimeout(1200);
    assert.match(await active(), /Сводка/);
    // Обратно пальцем: сосед — тот снимок; посреди жеста смотрим на сцену
    await touch('touchStart', 60, y);
    for (let x = 80; x <= 220; x += 25) await touch('touchMove', x, y);
    const inScene = await page.evaluate(() => {
      const scene = document.querySelector('.swipeback');
      return scene ? scene.querySelectorAll('.live-art').length : -1;
    });
    for (let x = 245; x <= 340; x += 25) await touch('touchMove', x, y);
    await touch('touchEnd', 340, y);
    await page.waitForTimeout(1200);
    assert.ok(inScene >= 0, 'жест начался, сцена с соседом есть');
    assert.equal(inScene, 0, 'в копии соседа нет своего рисунка темы');
    assert.match(await active(), /Библиотека/);
  } finally { await context.close(); }
}, { timeout: 120000 });
