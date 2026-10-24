import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { fromPlan } from '../src/workout-model.js';

test('FT-565: предложенное время статики принимается без ввода и сохраняется после reload', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const phone = await context.newPage();
  phone.on('pageerror', error => consoleErrors.push(String(error)));
  const session = fromPlan({ title: 'Статика без ввода', exercises: ['Планка на локтях', 'Стульчик'].map(name => ({ name, sets: '2', track: { kind: 'timed' }, supersetGroup: 'g' })) }, 'Октябрь 2026');
  session.revision = 1;
  try {
    await phone.goto(origin);
    await phone.evaluate(s => {
      localStorage.setItem('auth_token_v1', 'demo-session');
      localStorage.setItem('workout_demo_server:3', JSON.stringify([s]));
    }, session);
    await phone.reload();
    await phone.getByRole('button', { name: 'Тренировки', exact: true }).click();
    await phone.getByRole('button', { name: /Вернуться к тренировке/ }).click();
    const times = phone.getByRole('textbox', { name: /подход [12], время, с$/ });
    await times.first().waitFor();
    assert.equal(await times.count(), 4);
    for (let i = 0; i < 4; i++) assert.equal(await times.nth(i).inputValue(), '60');
    // После первого круга суперсета встаёт штатный экран отдыха — закрываем его
    for (let i = 0; i < 4; i++) {
      await phone.getByRole('button', { name: 'Норм', exact: true }).first().click();
      if (i === 1) await phone.getByRole('button', { name: 'Закончить отдых', exact: true }).click();
    }
    await phone.getByRole('button', { name: 'Завершить', exact: true }).click();
    await phone.getByRole('button', { name: 'Исправить результат', exact: true }).waitFor();
    // Сохранение уходит запросом — перезагрузка раньше него проверяла бы гонку теста
    await phone.waitForFunction(() => JSON.parse(localStorage.getItem('workout_demo_server:3'))[0].status === 'completed');
    await phone.reload();
    const saved = await phone.evaluate(() => JSON.parse(localStorage.getItem('workout_demo_server:3'))[0]);
    assert.equal(saved.status, 'completed');
    assert.ok(saved.exercises.every(e => e.sets.every(s => s.time === '60' && s.state === 'done')));
    assert.equal(consoleErrors.length, 0);
  } finally { await context.close(); }
});

/**
 * Проход по экранам настоящим браузером.
 *
 * Остальные проверки смотрят на функции и данные, и этого не хватило:
 * пропавшее первое упражнение тренировки, вес в программе, который никто
 * не обновляет, таймер отдыха, уехавший за край экрана, — всё это нашёл
 * человек с телефоном, а не тесты. Ошибка такого рода живёт не в разборе
 * листа, а на экране, и увидеть её можно только открыв экран.
 *
 * Идём по демо-сборке (VITE_MOCK=1), а не по живому приложению. Причин
 * две: данные в ней те же самые при каждом запуске, поэтому проверка не
 * мигает, и ни одного настоящего клиента она не трогает — проходить весь
 * путь, вплоть до завершения тренировки и записи замера, можно смело.
 *
 * Живое приложение проверяется отдельно, после выкладки: там вопрос не
 * «работает ли кнопка», а «доехало ли то, что выложили».
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
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
let page;
let origin;

/** Ошибки в консоли — такой же провал, как непрошедший сценарий */
const consoleErrors = [];

before(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], {
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
  page = await browser.newPage({ viewport: VIEWPORT, locale: 'ru-RU' });

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
}, { timeout: 180000 });

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  rmSync(OUT, { recursive: true, force: true });
});

/** Открыть вкладку нижней панели */
const openTab = async (label) => {
  await page.getByRole('button', { name: label, exact: true }).click();
};

const section = (title) => page.locator('.section', { has: page.getByRole('heading', { name: title }) });

test('вход в кабинет доходит до программы', async () => {
  await page.goto(origin);

  // Вход по почте — главный путь с 27.09.2026 (Telegram убран): адрес,
  // код из письма, имя и две отдельные отметки согласия (156-ФЗ). Ссылку
  // тренера в демо взять неоткуда, а пройти вход целиком надо.
  await page.fill('input[type=email]', 'demo@example.com');
  await page.getByRole('button', { name: 'Прислать код' }).click();
  await page.locator('input[autocomplete=one-time-code]').fill('123456');
  await page.fill('input[autocomplete=name]', 'Анна Морозова');
  await page.getByRole('button', { name: 'Далее' }).click();
  const checks = page.locator('.consent input[type=checkbox]');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByRole('button', { name: 'Создать кабинет' }).click();

  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 60000 });

  await openTab('Тренировки');
  await page.getByRole('heading', { name: /Тренировка 1/ }).waitFor({ timeout: 20000 });
});

/**
 * FT-574: вход клиента и вход тренера — две страницы. Каждый сценарий —
 * в своём окне: основной `page` уже вошёл клиентом.
 */
const loginWindow = async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const p = await context.newPage();
  p.on('pageerror', (error) => consoleErrors.push(String(error)));
  return { context, p };
};

test('вернувшийся клиент: почта → код → сразу кабинет; «назад» между шагами — на этой же странице', async () => {
  const { context, p } = await loginWindow();
  try {
    await p.goto(origin);
    await p.getByRole('heading', { name: 'Войти или создать кабинет' }).waitFor({ timeout: 30000 });
    assert.equal(await p.locator('.signin__steps li').count(), 2, 'шаги входа видны сразу: почта и код');
    await p.fill('input[type=email]', 'back@example.com');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    await p.getByText('Код отправлен на').waitFor();
    // Back браузера — к почте, а не со страницы
    await p.goBack();
    await p.locator('input[type=email]').waitFor({ timeout: 5000 });
    assert.equal(new URL(p.url()).pathname, '/', 'остались на странице клиента');
    assert.equal(await p.locator('input[type=email]').inputValue(), 'back@example.com', 'почта не стёрлась');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    await p.locator('input[autocomplete=one-time-code]').fill('123456');
    await p.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await p.locator('input[autocomplete=name]').count(), 0, 'имя у вернувшегося не спрашивали');
  } finally { await context.close(); }
});

test('код — только цифры; «Вставить код» берёт код из фразы и сразу проверяет', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await context.newPage();
  p.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await p.goto(origin);
    await p.fill('input[type=email]', 'back@example.com');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    const cells = p.locator('input[autocomplete=one-time-code]');
    await cells.pressSequentially('AB12');
    assert.equal(await cells.inputValue(), '12', 'буквы в код не попадают');
    await p.evaluate(() => navigator.clipboard.writeText('Ваш код для входа: 123456'));
    await p.getByRole('button', { name: 'Вставить код' }).click();
    await p.locator('.otp--checking').waitFor({ timeout: 2000 });
    await p.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 60000 });
  } finally { await context.close(); }
});
test('неверный код: круг краснеет, крестик, затем пустой ряд для новой попытки', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const p = await context.newPage();
  p.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await p.goto(origin);
    await p.fill('input[type=email]', 'back@example.com');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    const cells = p.locator('input[autocomplete=one-time-code]');
    await cells.fill('000000');
    await p.locator('.otp--checking').waitFor({ timeout: 2000 });
    await p.locator('.otp--failed').waitFor({ timeout: 8000 });
    await p.getByText('Код не подошёл.').waitFor();
    await p.locator('.otp--input').waitFor({ timeout: 5000 });
    assert.equal(await cells.inputValue(), '', 'ряд снова пустой');
  } finally { await context.close(); }
});
test('клавиатура iPhone не закрывает ячейки кода: страница сдвигается, ячейки по центру видимой части', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU', reducedMotion: 'reduce' });
  const p = await context.newPage();
  p.on('pageerror', (error) => consoleErrors.push(String(error)));
  // Как в Safari: окно той же высоты, а видимая часть над клавиатурой — меньше
  await p.addInitScript(() => {
    const listeners = new Set();
    const vv = { height: 844, offsetTop: 0, offsetLeft: 0, width: 390, scale: 1,
      addEventListener: (type, fn) => listeners.add(fn), removeEventListener: (type, fn) => listeners.delete(fn) };
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
    window.__keyboard = (h) => { vv.height = 844 - h; listeners.forEach((fn) => fn()); };
    window.__pan = (y) => { vv.offsetTop = y; listeners.forEach((fn) => fn()); };
  });
  try {
    await p.goto(origin);
    await p.fill('input[type=email]', 'back@example.com');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    const cells = p.locator('input[autocomplete=one-time-code]');
    await cells.waitFor();
    await p.evaluate(() => window.__keyboard(336));
    // Касание ячеек — фокус в неподвижное поле вверху экрана (в body)
    await p.locator('.signin__otp .otp').click();
    assert.equal(await p.evaluate(() => document.activeElement.autocomplete), 'one-time-code');
    assert.equal(await p.evaluate(() => document.activeElement.parentElement === document.body), true, 'поле не двигают сдвиги страницы');
    const visible = () => p.waitForFunction(() => {
      const vv = window.visualViewport;
      const r = document.querySelector('.signin__otp .otp').getBoundingClientRect();
      return r.top - vv.offsetTop >= 0 && r.bottom - vv.offsetTop <= vv.height;
    }, null, { timeout: 3000 });
    await visible();
    assert.equal(await p.evaluate(() => window.scrollY), 0, 'без прокрутки — только сдвиг экрана');
    // Повторные касания при открытой клавиатуре — экран стоит (запись владельца 15.10.2026)
    const shifted = await p.evaluate(() => document.querySelector('main').style.transform);
    assert.ok(shifted, 'экран поднят над клавиатурой');
    for (let t = 0; t < 3; t += 1) {
      await p.locator('.signin__otp .otp').click();
      assert.equal(await p.evaluate(() => document.querySelector('main').style.transform), shifted, 'касание не сдвигает экран');
      assert.equal(await p.evaluate(() => document.activeElement.autocomplete), 'one-time-code', 'фокус остаётся в поле');
    }
    // Safari сдвинул видимую часть — ячейки всё равно на виду
    await p.evaluate(() => window.__pan(120));
    await visible();
    await cells.blur();
    await p.waitForFunction(() => !document.querySelector('main').style.transform, null, { timeout: 3000 });
  } finally { await context.close(); }
});
test('почта тренера на странице клиента ведёт на вход тренера с той же почтой; Back — обратно', async () => {
  const { context, p } = await loginWindow();
  try {
    await p.goto(origin);
    await p.fill('input[type=email]', 'owner@example.com');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    await p.getByText('Это почта тренера.').waitFor();
    assert.equal(await p.getByRole('button', { name: 'Прислать код' }).count(), 0, 'главное действие — вход тренера');
    await p.getByRole('button', { name: 'Войти как тренер' }).click();
    await p.getByRole('heading', { name: 'Кабинет тренера' }).waitFor();
    assert.equal(new URL(p.url()).pathname, '/trainer');
    assert.equal(await p.locator('input[type=email]').inputValue(), 'owner@example.com');
    await p.goBack();
    await p.getByRole('heading', { name: 'Войти или создать кабинет' }).waitFor({ timeout: 5000 });
    assert.equal(new URL(p.url()).pathname, '/');
  } finally { await context.close(); }
});

test('тренер входит на /trainer; после выхода устройство открывает вход тренера', async () => {
  const { context, p } = await loginWindow();
  try {
    await p.goto(origin + '/trainer');
    await p.getByRole('heading', { name: 'Кабинет тренера' }).waitFor({ timeout: 30000 });
    assert.equal(await p.getByRole('button', { name: /Вход для клиентов/ }).count(), 1, 'путь к входу клиента есть');
    await p.fill('input[type=email]', 'owner@example.com');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    await p.locator('input[autocomplete=one-time-code]').fill('123456');
    await p.getByRole('tab', { name: /^Все · / }).waitFor({ timeout: 60000 });
    assert.equal(new URL(p.url()).pathname, '/', 'кабинет — с адреса приложения');
    // Вход кончился — на корне снова вход тренера
    await p.evaluate(() => localStorage.removeItem('auth_token_v1'));
    await p.goto(origin);
    await p.getByRole('heading', { name: 'Кабинет тренера' }).waitFor({ timeout: 30000 });
    assert.equal(new URL(p.url()).pathname, '/trainer');
    await p.getByRole('button', { name: /Вход для клиентов/ }).click();
    await p.getByRole('heading', { name: 'Войти или создать кабинет' }).waitFor();
    assert.equal(new URL(p.url()).pathname, '/');
  } finally { await context.close(); }
});

test('не тренер на /trainer: после кода — заявка с условиями для тренеров', async () => {
  const { context, p } = await loginWindow();
  try {
    await p.goto(origin + '/trainer');
    await p.fill('input[type=email]', 'new@example.com');
    await p.getByRole('button', { name: 'Прислать код' }).click();
    await p.getByText(/только если адрес открывает кабинет тренера/).waitFor();
    await p.locator('input[autocomplete=one-time-code]').fill('123456');
    await p.fill('input[autocomplete=name]', 'Ольга');
    await p.getByRole('button', { name: 'Далее' }).click();
    await p.getByText('Шаг 2 из 2 · Условия').waitFor();
    const checks = p.locator('.consent input[type=checkbox]');
    await checks.nth(0).check();
    await checks.nth(1).check();
    assert.equal(await p.getByRole('link', { name: 'условия для тренеров' }).count(), 1);
    await p.getByRole('button', { name: 'Отправить заявку' }).click();
    await p.getByText('Заявка на кабинет тренера отправлена.', { exact: false }).waitFor();
  } finally { await context.close(); }
});

test('три игры доступны тестовому клиенту и скрыты без серверного разрешения', async () => {
  try {
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /Тренер в планке/ }).click();
  await page.getByRole('button', { name: 'Поставить тренера в планку' }).waitFor();
  await page.getByRole('button', { name: 'Свернуть игру', exact: true }).click();
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /На самокате до зала/ }).click();
  await page.locator('.menu__item').first().waitFor({ state: 'hidden' });
  const shell = await page.locator('.game-shell--scooter').evaluate(el => {
    const box = el.getBoundingClientRect();
    const header = document.querySelector('.app__header');
    return { position: getComputedStyle(el).position, width: box.width, height: box.height, locked: document.documentElement.classList.contains('game-is-open'), backgroundInert: header?.inert, backgroundHidden: header?.getAttribute('aria-hidden') };
  });
  assert.deepEqual(shell, { position: 'fixed', width: VIEWPORT.width, height: VIEWPORT.height, locked: true, backgroundInert: true, backgroundHidden: 'true' });
  mkdirSync(join(ROOT, 'reports/scooter'), { recursive: true });
  await page.screenshot({ path: join(ROOT, 'reports/scooter/app-ready.png'), fullPage: true });
  await page.getByRole('button', { name: 'В путь', exact: true }).click();
    if (await page.getByRole('button', { name: 'Поехали', exact: true }).isVisible()) await page.getByRole('button', { name: 'Поехали', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-scooter=viewport]')?.dataset.phase === 'playing');
  await page.locator('[data-scooter=scene]').click({ position: { x: 40, y: 420 } });
  await page.waitForFunction(() => document.querySelector('[data-scooter=viewport]')?.dataset.lane === '0', null, { timeout: 3000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-scooter=distance]').textContent.replace(/\s/g, '')) > 30);
  await page.screenshot({ path: join(ROOT, 'reports/scooter/app-playing.png'), fullPage: true });
  await page.getByRole('button', { name: 'Меню игры', exact: true }).click();
  await page.getByRole('button', { name: 'Свернуть игру', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('game-is-open') || document.querySelector('.app__header').inert), false);
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /Три в ряд/ }).click();
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.match-tile.is-hint').length === 2);
  const cells = await page.locator('.match-tile.is-hint').evaluateAll(els => els.map(el => el.dataset.cell));
  for (const at of cells) await page.locator(`[data-cell="${at}"]`).click();
  await page.waitForFunction(() => document.querySelector('.match-game')?.dataset.busy === 'false');
  assert.equal(await page.locator('[data-match=moves]').innerText(), '19');
  mkdirSync(join(ROOT, 'reports/match'), { recursive: true });
  await page.screenshot({ path: join(ROOT, 'reports/match/app-playing-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Закрыть игру', exact: true }).click();
  const normalContext = await browser.newContext({ storageState: await page.context().storageState(), viewport: VIEWPORT });
  const normal = await normalContext.newPage();
  try {
    await normal.goto(origin + '?mockPlank=0');
    await normal.getByRole('button', { name: 'Меню', exact: true }).click();
    await normal.waitForFunction(() => !Array.from(document.querySelectorAll('.menu__item')).some(el => el.textContent.includes('Тренер в планке')));
    assert.equal(await normal.getByRole('button', { name: /Тренер в планке/ }).count(), 0);
    assert.equal(await normal.getByRole('button', { name: /На самокате до зала/ }).count(), 0);
    assert.equal(await normal.getByRole('button', { name: /Три в ряд/ }).count(), 0);
    assert.equal(await normal.getByRole('button', { name: /Карьера в фитнесе/ }).count(), 0);
  } finally { await normalContext.close(); }
  } catch (error) {
    console.error('Game QA:', error, await page.locator('[data-scooter=viewport]').evaluateAll(els => els.map(el => ({ phase: el.dataset.phase, lane: el.dataset.lane }))));
    throw error;
  }
});

test('карьера в фитнесе: ступень, задание в игре с целью и возврат в карьеру', async () => {
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /Карьера в фитнесе/ }).click();
  await page.getByText('Ступень 1 из 10').waitFor();
  await page.getByRole('heading', { name: 'Тренировки на улице' }).waitFor();
  assert.equal(await page.locator('.career-ladder li').count(), 10);
  // Без зарплаты бонусы не купить
  assert.equal(await page.getByRole('button', { name: /^Купить Протеин/ }).isDisabled(), true);
  await page.locator('.career-mission', { hasText: 'Три в ряд' }).getByRole('button', { name: 'Играть' }).click();
  await page.locator('.career-note', { hasText: 'Глава 1: 24 хода' }).waitFor();
  assert.equal(await page.locator('[data-match=moves]').innerText(), '24', 'ходы из задания первой ступени');
  await page.getByRole('button', { name: 'Выйти из игры', exact: true }).click();
  await page.getByText('Ступень 1 из 10').waitFor();
  await page.locator('.career-mission', { hasText: 'На самокате до зала' }).getByRole('button', { name: 'Играть' }).click();
  await page.locator('.career-note', { hasText: 'Проехать 200 м' }).waitFor();
  assert.equal(await page.locator('.difficulty-picker').isVisible(), false, 'режим задан заданием');
  await page.getByRole('button', { name: 'К карьере', exact: true }).click();
  await page.getByRole('button', { name: 'Свернуть карьеру', exact: true }).click();
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  // Обычная игра из меню — снова без задания
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /Три в ряд/ }).click();
  assert.equal(await page.locator('.career-note').count(), 0);
  assert.equal(await page.locator('[data-match=moves]').innerText(), '20');
  await page.getByRole('button', { name: 'Выйти из игры', exact: true }).click();
});

test('карьера: бонус в задании, пауза ведёт в карьеру, после финала бонусы не продаются', async () => {
  const context = await browser.newContext({ storageState: await page.context().storageState(), viewport: VIEWPORT, locale: 'ru-RU' });
  const p = await context.newPage();
  const errors = []; p.on('pageerror', error => errors.push(String(error)));
  const open = async state => {
    await p.goto(origin);
    // Ключ карьеры строится из кабинета так же, как в App.jsx
    await p.evaluate(state => {
      const me = JSON.parse(localStorage.getItem('api_cache_v1:me|{}')).data;
      localStorage.setItem('ft.career.v1:' + [me.identityType, me.chatId || me.email || '', me.member || ''].join(':'), JSON.stringify({ version: 1, rank: 3, done: { scooter: false, plank: false, match: false }, coins: 5000, items: { energy: 0, cheat: 0, protein: 1 }, finished: false, earned: 0, ...state }));
    }, state);
    await p.reload();
    await p.getByRole('button', { name: 'Меню', exact: true }).click({ timeout: 60000 });
    await p.getByRole('button', { name: /Карьера в фитнесе/ }).click();
    await p.locator('.career-step').first().waitFor();
  };
  try {
    await open({});
    const card = p.locator('.career-mission', { hasText: 'Три в ряд' });
    assert.match(await card.locator('.career-boost').innerText(), /Протеин \(1\): \+3 хода в задании «Три в ряд»/, 'название игры не теряет заглавную');
    assert.equal(await card.locator('small').innerText(), 'Зарплата +300 монет', '«монет» не отрывается от суммы на узком экране');
    assert.equal(await card.getByRole('button', { name: 'Играть' }).evaluate(el => getComputedStyle(el).fontWeight), '850', 'сброс шрифта не перебивает кнопку');
    await card.locator('input[type=checkbox]').check();
    await card.getByRole('button', { name: 'Играть' }).click();
    await p.locator('.career-note', { hasText: 'Протеин: +3 хода в задании «Три в ряд»' }).waitFor();
    await p.waitForFunction(() => !document.querySelector('.match-primary')?.disabled);
    await p.locator('.match-primary').click();
    assert.equal(await p.locator('[data-match=moves]').innerText(), '21', '18 ходов ступени и 3 от протеина');
    await p.getByRole('button', { name: 'Пауза', exact: true }).click();
    await p.getByRole('button', { name: 'Вернуться в карьеру', exact: true }).click();
    await p.getByText('Ступень 4 из 10').waitFor();
    assert.equal(await p.locator('.career-boost').count(), 0, 'протеин списан при запуске');
    // Пройденная карьера: заданий нет — и бонусы взять некуда
    await open({ rank: 9, done: { scooter: true, plank: true, match: true }, finished: true });
    await p.getByRole('heading', { name: 'Собственник сети' }).waitFor();
    assert.equal(await p.getByRole('heading', { name: 'Бонусы' }).count(), 0);
    assert.equal(await p.locator('.career-next').innerText(), 'Карьера пройдена');
    assert.equal(await p.getByRole('button', { name: 'Начать карьеру заново' }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

/**
 * Первое упражнение блока терялось: строка с заголовком «Тренировка»
 * пропускалась целиком, а у части тренеров в ней же стоит первое
 * упражнение. Снаружи это выглядело так, что тренировка начинается со
 * второго.
 */
test('в блоке видны все упражнения, включая первое', async () => {
  const block = section('Тренировка 1 — верх');

  // Тренировка свёрнута: упражнения — по нажатию на «Упражнения»
  assert.equal(await block.locator('.exercise').count(), 0, 'по умолчанию свёрнута');
  await block.locator('.plan__toggle').click();
  await assert.doesNotReject(block.getByText('Жим лёжа', { exact: true }).waitFor({ timeout: 5000 }));
  assert.equal(await block.locator('.exercise').count(), 4, 'ни одно упражнение не потерялось');
});

/**
 * Вес со строк программы убран намеренно: в листе месяца это план
 * тренера, занятие его не переписывает, и число рядом с упражнением
 * читалось как «твой рабочий вес».
 */
test('в программе нет весов — только подходы и повторы', async () => {
  const block = section('Тренировка 1 — верх');

  assert.equal(await block.locator('.exercise__weight').count(), 0);
  await assert.doesNotReject(block.getByText('4 × 8').waitFor({ timeout: 5000 }));
});

/** Суперсет в таблице не подписан словом — он должен собраться в группу */
test('суперсет показан одной группой с числом кругов', async () => {
  await section('Тренировка 2 — низ').locator('.plan__toggle').click();
  const group = section('Тренировка 2 — низ').locator('.superset');

  assert.equal(await group.count(), 1);
  // Число кругов — у скобки справа, один раз на группу
  const count = group.locator('.superset__count');
  await assert.doesNotReject(count.waitFor({ timeout: 5000 }));
  assert.equal((await count.innerText()).replace(/\s+/g, ' ').trim(), '3 круга');
  assert.equal(await group.locator('.exercise').count(), 2, 'в группе оба упражнения');
});

/**
 * FT-570: один раздел «Тренажёр и техника» — свёрнут; внутри по порядку
 * настройка тренажёра (один источник), техника с ошибкой один раз, мышцы.
 * Своя настройка клиента — на виду и при свёрнутом разделе.
 */
test('в активной тренировке один раздел: настройка, техника, мышцы', async () => {
  await section('Тренировка 2 — низ').getByRole('button', { name: 'Начать тренировку' }).click();
  await page.getByRole('heading', { name: 'Тренировка 2 — низ' }).first().waitFor({ timeout: 20000 });

  const squat = page.locator('.workout__exercise').filter({ hasText: 'Присед со штангой' });
  const about = squat.locator('details.workout__about');
  await about.first().waitFor({ timeout: 10000 });
  assert.equal(await about.count(), 1, 'справка — одним разделом');
  assert.equal(await about.evaluate((d) => d.open), false, 'по умолчанию свёрнут');
  await squat.getByText('Крюки на 4-й, упоры на 2-й').waitFor({ timeout: 5000 });
  await about.locator('summary').first().click();
  await about.getByRole('heading', { name: 'Подготовка', exact: true }).waitFor({ timeout: 5000 });
  assert.equal(await about.locator('.guide__avoid').count(), 1, 'ошибки — одним блоком');
  const text = await about.evaluate((d) => d.textContent);
  assert.ok(text.indexOf('Подготовка') < text.indexOf('Движение'), 'сначала подготовка, потом движение');
  assert.ok(text.indexOf('Движение') < text.indexOf('Чего избегать'), 'ошибки — после шагов');
  assert.ok(text.indexOf('Чего избегать') < text.indexOf('Мышцы'), 'мышцы — в конце');
  assert.equal(await squat.getByText('Крюки на 4-й, упоры на 2-й').isVisible(), true, 'своя настройка на виду');

  await page.getByRole('button', { name: 'Ещё', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Отменить занятие' }).click();
  await page.locator('.workout__confirm').getByRole('button', { name: 'Отменить', exact: true }).click();
  await swipe(page, { x: 4, y: 420 }, { x: 340, y: 420 });
});

/**
 * Полный круг: провести тренировку и вернуться к программе. Проверяем
 * то, ради чего экран и сделан, — что проведённый блок помечен и ведёт к
 * настоящим весам.
 */
test('тренировку можно провести, и блок становится проведённым', async () => {
  await section('Тренировка 1 — верх').getByRole('button', { name: 'Начать тренировку' }).click();
  await page.getByRole('heading', { name: 'Тренировка 1 — верх' }).first().waitFor({ timeout: 20000 });

  // Отмечаем первый подход первого упражнения оценкой (галочки нет с 03.10.2026)
  await page.getByLabel('Таймер отдыха').selectOption('60');
  // Отдых, оставшийся от прошлых шагов, — закрыть: экран отдыха на весь экран
  const left = page.getByRole('button', { name: 'Закончить отдых' });
  if (await left.isVisible().catch(() => false)) await left.click();
  const first = page.locator('.workout__set').first();
  await first.getByRole('textbox').nth(1).fill('8');
  await page.locator('.workout__effort-btn--ok').first().click();

  // Отдых — на весь экран; закрыть можно только кнопкой
  const rest = page.locator('.rest-screen');
  await rest.waitFor({ timeout: 5000 });
  assert.ok(await rest.isVisible(), 'отдых на весь экран');
  await page.getByRole('button', { name: 'Закончить отдых' }).click();
  await rest.waitFor({ state: 'detached', timeout: 5000 });

  // Прошлый вес — подсказка рядом с планом: по ней в зале решают,
  // добавлять ли сегодня.
  // «Было» на всё упражнение убрано (03.10.2026): прошлый раз — у каждого
  // подхода своей строкой, и только когда есть история клиента
  assert.equal(await page.locator('.workout__exercise').first().getByText('было 70').count(), 0);


  // Клиент название и вид упражнения не меняет (владелец, 09.10.2026) —
  // название текстом, не кнопкой; меняет это тренер
  const firstExercise = page.locator('.workout__exercise').first();
  assert.equal(await firstExercise.locator('.workout__name-tap').count(), 0);

  // FT-565: повторы могут стереть уже после отметки подхода. Завершение
  // должно назвать проблемную строку и оставить занятие доступным для правки.
  await first.getByRole('textbox').nth(1).fill('');
  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.locator('.workout__confirm').getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Жим лёжа, подход 1: Введите число повторов.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Продолжить тренировку', exact: true }).count(), 0);
  await first.getByRole('textbox').nth(1).fill('8');

  await page.getByRole('button', { name: 'Завершить', exact: true }).click();
  await page.locator('.workout__confirm').getByRole('button', { name: 'Завершить', exact: true }).click();

  // Журнал открыт ВНУТРИ экрана программы, поэтому назад ведёт «К
  // программе», а не вкладка внизу: вкладка уже выбрана, и нажатие на неё
  // ничего не закрывает.
  // «К программе» убрано (09.10.2026): назад — смахнуть вправо
  await swipe(page, { x: 4, y: 420 }, { x: 340, y: 420 });

  // Проведённая тренировка уезжает во вторую вкладку: наверху очереди
  // должна оставаться та, которую делать следующей.
  await page.getByRole('tab', { name: /^Выполненные/ }).click({ timeout: 20000 });

  const done = section('Тренировка 1 — верх').locator('.plan__done');
  await done.waitFor({ timeout: 20000 });
  await assert.doesNotReject(done.getByText('Тренировка проведена').waitFor({ timeout: 5000 }));

  const block = section('Тренировка 1 — верх');
  // Свёрнута и во «Выполненных»: «Что сделано» разворачивает
  await block.locator('.plan__toggle').click();
  await assert.doesNotReject(block.getByText('Жим лёжа').first().waitFor({ timeout: 5000 }),
    'во «Выполненных» — упражнение занятия');
  await assert.doesNotReject(block.getByText('1 × 8').waitFor({ timeout: 5000 }), 'и сколько сделано');

  await done.getByRole('button', { name: 'Посмотреть веса' }).click();
  await page.getByRole('heading', { name: 'Тренировка 1 — верх' }).first().waitFor({ timeout: 20000 });
});

/**
 * Замер вносят с телефона сразу после весов. Проверяем и отказ: пустая
 * форма должна объяснять, чего от человека ждут, а не молчать погасшей
 * кнопкой.
 */
/**
 * Наверху очереди — следующая невыполненная. К середине месяца
 * проведённых больше, чем оставшихся, и они отодвигали бы её вниз.
 */
test('проведённая тренировка уходит из очереди', async () => {
  // «К программе» убрано (09.10.2026): назад — смахнуть вправо
  await swipe(page, { x: 4, y: 420 }, { x: 340, y: 420 });
  await page.getByRole('tab', { name: /^Очередь/ }).click({ timeout: 20000 });

  // Только видимый раздел: посещённые остаются в разметке спрятанными
  const titles = await page.locator('#root main:not([hidden]) .section__title').allInnerTexts();

  assert.equal(titles.includes('Тренировка 1 — верх'), false, 'проведённой в очереди нет');
  assert.equal(titles[0], 'Тренировка 2 — низ', 'наверху следующая невыполненная');
});

test('замер записывается, а пустая форма объясняет отказ', async () => {
  await openTab('Прогресс');
  await page.getByRole('button', { name: 'Записать замер' }).click({ timeout: 20000 });

  await page.getByRole('button', { name: 'Записать' }).click();
  await assert.doesNotReject(
    page.getByText('Введите хотя бы один показатель.').waitFor({ timeout: 5000 }),
  );

  await page.getByRole('textbox', { name: 'Вес, кг' }).fill('75,4');
  await page.getByRole('button', { name: 'Записать' }).click();

  await assert.doesNotReject(page.getByText(/Замер за .* записан/).waitFor({ timeout: 20000 }));
});

/**
 * Профиль — пункт бокового меню, открывается отдельным экраном. Заполняют его между делом, поэтому проверяем
 * не «форма есть», а то, что незаполненное не мешает сохранить, а мусор
 * объясняет себя.
 */
test('профиль сохраняется и объясняет опечатку', async () => {
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /Мои данные/ }).click();
  await page.getByRole('textbox', { name: 'Рост, см' }).waitFor({ timeout: 10000 });

  await page.getByRole('textbox', { name: 'Рост, см' }).fill('17');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await assert.doesNotReject(
    page.getByText(/от 100 до 250/).waitFor({ timeout: 10000 }),
    'опечатку в росте не записываем молча',
  );

  await page.getByRole('textbox', { name: 'Рост, см' }).fill('168');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await assert.doesNotReject(page.getByText('Сохранено.').waitFor({ timeout: 10000 }));

  // Telegram с экрана убран (15.10.2026); почта — просто «Почта»
  assert.equal(await page.getByRole('textbox', { name: 'Имя пользователя' }).count(), 0);
  assert.equal(await page.getByRole('textbox', { name: 'Почта', exact: true }).count(), 1);
});

/**
 * Правка программы — тренерская работа, и у клиента её быть не должно.
 *
 * Сам редактор живёт в тренерской оболочке, которую этот проход не
 * открывает: вход туда — отдельный сценарий, и покрывать его надо
 * отдельно. А вот то, что клиенту он не достаётся, проверяется здесь и
 * стоит одной строки: права — это не то, о чём узнают из отчёта.
 */
test('клиенту правка программы не предлагается', async () => {
  const forbidden = ['Изменить программу', 'Новый месяц', 'Сохранить программу'];

  for (const label of forbidden) {
    assert.equal(await page.getByRole('button', { name: label }).count(), 0, label);
  }
});

/**
 * У клиента журнала в меню нет (01.10.2026): всё проведённое — во вкладке
 * «Тренировки» → «Выполненные», свободная тренировка — кнопкой там же.
 */
test('клиент: журнала в меню нет, свободная тренировка — во вкладке', async () => {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 30000 });
  await openTab('Тренировки');
  const free = page.getByRole('button', { name: 'Свободная тренировка' });
  await free.waitFor({ timeout: 20000 });

  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /Мои данные/ }).waitFor({ timeout: 10000 });
  assert.equal(await page.getByRole('button', { name: /Журнал тренировок/ }).count(), 0, 'в меню журнала нет');

  await page.goto(origin);
  await openTab('Тренировки');
  await free.click();
  // Из вкладки — экран занятия; первое упражнение заготовки
  await page.getByText('Свободная тренировка').first().waitFor({ timeout: 10000 });
  if (process.env.SHOT_CLIENT_FREE) await page.screenshot({ path: process.env.SHOT_CLIENT_FREE });
  await swipe(page, { x: 4, y: 420 }, { x: 340, y: 420 });
  await page.getByRole('button', { name: 'Свободная тренировка' }).waitFor({ timeout: 10000 });
});

/**
 * «Как пользоваться» (FT-495): инструкция открывается из меню, а не только
 * кружком на «Обзоре»; закрывается крестиком.
 */
test('клиент: «Как пользоваться» открывается из меню', async () => {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.locator('.menu__item').filter({ hasText: 'Как пользоваться' }).click();
  // План трёх разборов, п. 5: меню открывает экран с турами и инструкцией,
  // строка инструкции — историю с этого кадра
  await assert.doesNotReject(page.getByText('Короткие туры', { exact: true }).waitFor({ timeout: 10000 }));
  await page.locator('.help-row--plain').first().click();
  const viewer = page.locator('.story');
  await assert.doesNotReject(viewer.getByRole('heading', { name: 'Вход' }).waitFor({ timeout: 5000 }), 'первый кадр — «Вход»');
  await viewer.getByRole('button', { name: 'Закрыть' }).click();
  await viewer.waitFor({ state: 'detached', timeout: 5000 });
});

/**
 * Вход по персональной ссылке — так клиенты попадают в кабинет.
 *
 * Здесь жили две поломки, которые видел только человек с телефоном.
 * Во встроенном браузере Telegram вместо входа стояла стена «Откройте в
 * Safari», и клиенты считали, что ссылка не грузится. А после входа
 * кабинет висел скелетом до ручной перезагрузки: загрузку, запущенную
 * сохранённым ключом, затирал сброс состояния на «Готово». Демо-сервер
 * отвечает мгновенно, поэтому гонка воспроизводится здесь каждый раз.
 *
 * Отдельный контекст с агентом iPhone-Telegram: свой localStorage, чтобы
 * не зависеть от входа по коду в первом сценарии.
 */
test('ссылка тренера из Telegram на iPhone открывает кабинет без перезагрузки', async () => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'ru-RU',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await phone.goto(origin + '/?access=' + 'A'.repeat(44));

    await phone.getByRole('heading', { name: 'Анна Морозова' }).waitFor({ timeout: 10000 });
    await assert.doesNotReject(
      phone.getByText(/открыть в Safari/i).first().waitFor({ timeout: 5000 }),
      'совет про Safari остаётся, но под входом',
    );

    await phone.getByRole('button', { name: 'Войти в кабинет' }).click();

    await assert.doesNotReject(
      phone.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 10000 }),
      'кабинет открывается сам, без перезагрузки',
    );
    assert.equal(new URL(phone.url()).searchParams.has('access'), false, 'ключ ссылки убран из адреса');
  } finally {
    await context.close();
  }
});

/**
 * Жесты пальцем: смахнуть вправо — назад, потянуть вниз — обновить.
 *
 * Палец ведём настоящими событиями касания по кадрам, а не вызовом
 * функции: проверить надо ровно то, что делает человек, — с выбором
 * направления после первых пикселей и с решением на отпускании.
 */
async function swipe(page, from, to, { steps = 12, frameMs = 16 } = {}) {
  await page.evaluate(async ({ from, to, steps, frameMs }) => {
    const target = document.elementFromPoint(from.x, from.y) || document.body;
    const touch = (x, y) => new Touch({ identifier: 1, target, clientX: x, clientY: y });
    const fire = (type, x, y) => {
      const t = touch(x, y);
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
      }));
    };
    const wait = () => new Promise((r) => setTimeout(r, frameMs));

    fire('touchstart', from.x, from.y);
    for (let i = 1; i <= steps; i += 1) {
      await wait();
      fire('touchmove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    }
    await wait();
    fire('touchend', to.x, to.y);
  }, { from, to, steps, frameMs });
}

test('смахнуть вправо возвращает из «Моих данных», вниз — обновляет', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    hasTouch: true,
    isMobile: true,
  });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await phone.goto(origin + '/?access=' + 'A'.repeat(44));
    await phone.getByRole('button', { name: 'Войти в кабинет' }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Обзор' }).waitFor({ timeout: 10000 });

    // Назад: из экрана меню пальцем вправо — на вкладку, откуда пришли
    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Мои данные/ }).click();
    await phone.locator('#root .app__title', { hasText: 'Мои данные' }).waitFor({ timeout: 5000 });
    // Меню закрывается с анимацией — пока оно в DOM, жесты выключены
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });

    // Прямо по полям анкеты: над полем, где не печатают, «назад» работает
    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });

    await assert.doesNotReject(
      phone.locator('#root .app__subtitle', { hasText: 'Обзор' }).waitFor({ timeout: 5000 }),
      'смахнули вправо — вернулись на обзор',
    );
    // Пока едет сцена, на ней копии экранов — дожидаемся настоящего
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });

    // Возвращённый экран встаёт без лесенки появления: снимок уже показал
    // его целиком, и повторное проявление мигало
    assert.equal(
      await phone.evaluate(() => getComputedStyle(document.querySelector('#root .enter')).animationName),
      'none',
      'после жеста экран не проявляется заново',
    );
    // И не проявляется позже: снятие класса «после жеста» раньше
    // перезапускало анимацию на уже видимых блоках — они «мигали»
    await phone.waitForTimeout(900);
    assert.equal(
      await phone.evaluate(() => getComputedStyle(document.querySelector('#root .enter')).animationName),
      'none',
      'через секунду блоки не проявляются заново',
    );

    // Лента одна: разделы нижнего меню, а за последним — боковое меню.
    // Влево — следующий раздел; «вперёд» на прежний экран больше нет.
    await phone.waitForTimeout(700);
    await swipe(phone, { x: 330, y: 420 }, { x: 60, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });
    assert.equal(await phone.locator('#root .app__subtitle').textContent(), 'Тренировки', 'влево — следующий раздел');

    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });
    assert.equal(await phone.locator('#root .app__subtitle').textContent(), 'Обзор', 'вправо — предыдущий');

    // Раздел, где уже были, не пересобирается: тот же экран и то же
    // место прокрутки — переход без задержки загрузки
    await phone.getByRole('button', { name: 'Тренировки', exact: true }).click();
    const scrolled = await phone.evaluate(() => {
      window.__kept = document.querySelector('#root main:not([hidden])');
      window.scrollTo(0, 300);
      return Math.round(window.scrollY);
    });
    assert.ok(scrolled > 0, 'раздел длинный — есть что прокрутить');
    await phone.getByRole('button', { name: 'Прогресс', exact: true }).click();
    await phone.evaluate(() => window.scrollTo(0, 0));
    await phone.getByRole('button', { name: 'Тренировки', exact: true }).click();
    assert.equal(await phone.evaluate(() => document.querySelector('#root main:not([hidden])') === window.__kept), true, 'тот же экран, не собран заново');
    assert.equal(await phone.evaluate(() => Math.round(window.scrollY)), scrolled, 'прокрутка на своём месте');
    await phone.getByRole('button', { name: 'Обзор', exact: true }).click();
    await phone.evaluate(() => window.scrollTo(0, 0));

    // Первый раздел — дальше вправо некуда: резина и возврат на место
    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 3000 });
    assert.equal(await phone.locator('#root .app__subtitle').textContent(), 'Обзор', 'с первого раздела вправо некуда');

    // С последнего раздела влево — боковое меню тянется за пальцем, а
    // страница стоит на месте. Чуть потянули и медленно отпустили — меню
    // уезжает обратно.
    await phone.getByRole('button', { name: 'Питание', exact: true }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Питание' }).waitFor({ timeout: 5000 });
    await phone.waitForTimeout(300);
    await swipe(phone, { x: 330, y: 420 }, { x: 290, y: 422 }, { steps: 20, frameMs: 30 });
    assert.equal(await phone.locator('.swipeback').count(), 0, 'страница не съезжает');
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });
    assert.equal(await phone.getByRole('button', { name: 'Закрыть меню' }).count(), 0, 'короткий жест меню не оставляет');
    await swipe(phone, { x: 330, y: 420 }, { x: 150, y: 430 });
    await assert.doesNotReject(
      phone.getByRole('button', { name: 'Закрыть меню' }).waitFor({ timeout: 3000 }),
      'за последним разделом — боковое меню',
    );
    await phone.getByRole('button', { name: 'Закрыть меню' }).click();
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });

    // Короткое движение без скорости «назад» не делает: экран пружиной
    // возвращается на место
    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Настройки/ }).click();
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });
    // На экране бокового меню нижнее меню уезжает, а не висит пустым
    assert.equal(await phone.locator('.tabbar').getAttribute('aria-hidden'), 'true', 'нижнее меню спрятано');
    await swipe(phone, { x: 60, y: 60 }, { x: 110, y: 62 }, { steps: 20, frameMs: 30 });
    await phone.waitForTimeout(700);
    assert.equal(await phone.locator('#root .app__title').textContent(), 'Настройки', 'короткий жест не уводит');

    // Потянули чуть-чуть и сразу коснулись экрана, пока страница пружиной
    // возвращалась (23.10.2026): касание останавливало пружину, и страница
    // оставалась сдвинутой — над шапкой занятия была видна прокрученная страница
    await swipe(phone, { x: 195, y: 160 }, { x: 195, y: 260 }, { steps: 8 });
    await phone.evaluate(() => {
      const target = document.elementFromPoint(195, 400) || document.body;
      const t = new Touch({ identifier: 2, target, clientX: 195, clientY: 400 });
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
      target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
    });
    await assert.doesNotReject(
      phone.waitForFunction(() => [...document.querySelector('#root .app').children].every((el) => !el.style.transform), null, { timeout: 3000 }),
      'касание посреди пружины — страница всё равно вернулась на место',
    );

    // Потянуть вниз: индикатор докручивается до конца обновления и уходит
    await swipe(phone, { x: 195, y: 160 }, { x: 195, y: 520 }, { steps: 16 });
    await assert.doesNotReject(
      phone.locator('.pull--spinning').waitFor({ timeout: 3000 }),
      'потянули за порог — пошло обновление',
    );
    await assert.doesNotReject(
      phone.waitForFunction(() => !document.querySelector('.pull--spinning'), null, { timeout: 8000 }),
      'обновилось — индикатор ушёл',
    );
  } finally {
    await context.close();
  }
});

/**
 * Просмотр глазами клиента — из карточки клиента (01.10.2026: кнопка
 * «Глазами клиента» вместо пункта меню). Смахнули вправо с первого
 * раздела или «К карточке» — снова карточка этого клиента.
 */
test('игра на отдыхе у тестового клиента глазами тренера (FT-572)', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', error => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.getByRole('tab', { name: /^Все · / }).click();
    await phone.locator('#root main:not([hidden]) .item').first().click();
    await phone.getByRole('button', { name: 'Глазами клиента' }).click();
    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    assert.equal(await phone.getByRole('button', { name: /Тренер в планке/ }).count(), 0);
    await phone.getByRole('button', { name: 'Закрыть меню', exact: true }).click();
    await phone.getByRole('button', { name: 'К карточке', exact: true }).click();
    await phone.getByRole('button', { name: /Изменить карточку/ }).click();
    await phone.getByLabel('Тестовый клиент', { exact: true }).check();
    await phone.waitForFunction(() => !document.querySelector('.client-test input').disabled);
    await phone.getByRole('button', { name: 'Глазами клиента' }).click();
    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Тренер в планке/ }).click();
    await phone.getByRole('button', { name: 'Поставить тренера в планку' }).waitFor();
    await phone.getByRole('button', { name: 'Свернуть игру', exact: true }).click();
    await phone.getByRole('button', { name: 'Тренировки', exact: true }).click();
    await phone.getByRole('button', { name: 'Начать тренировку', exact: true }).first().click();
    await phone.getByLabel('Таймер отдыха').selectOption('60');
    if (process.env.SHOT_PREVIEW_GAME) await phone.screenshot({ path: process.env.SHOT_PREVIEW_GAME });
    await phone.getByRole('button', { name: 'Тренер в планке', exact: true }).click();
    await phone.getByRole('button', { name: 'Поставить тренера в планку' }).waitFor();
    await phone.getByRole('button', { name: 'К отдыху', exact: true }).click();
    await phone.getByRole('button', { name: 'Закончить отдых', exact: true }).click();
    await phone.getByRole('button', { name: 'Ещё', exact: true }).click();
    await phone.getByRole('menuitem', { name: 'Отменить занятие' }).click();
    await phone.locator('.workout__confirm').getByRole('button', { name: 'Отменить', exact: true }).click();
    await phone.locator('.workout__header').getByText(/Отменена/).waitFor();
  } finally { await context.close(); }
});

test('глазами клиента — из карточки, и обратно в неё', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');

    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    assert.equal(await phone.getByRole('button', { name: /Клиентская версия/ }).count(), 0, 'в меню пункта нет');
    await phone.goto(origin + '/?mockRole=trainer');

    await phone.getByRole('tab', { name: /^Все · / }).click({ timeout: 10000 });
    await phone.locator('#root main:not([hidden]) .item').first().click();
    await phone.getByText('Карточка клиента · Обзор').waitFor({ timeout: 10000 });
    await phone.getByRole('button', { name: 'Глазами клиента' }).click();
    await phone.getByText('Вы смотрите как клиент').waitFor({ timeout: 10000 });
    assert.equal(await phone.getByRole('button', { name: 'Сменить' }).count(), 0, 'из карточки менять некого');
    await phone.waitForTimeout(500);

    await swipe(phone, { x: 60, y: 420 }, { x: 330, y: 430 });
    await phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 4000 });
    await assert.doesNotReject(
      phone.getByText('Карточка клиента · Обзор').waitFor({ timeout: 5000 }),
      'вернулись в карточку клиента',
    );

    await phone.getByRole('button', { name: 'Глазами клиента' }).click();
    await phone.getByRole('button', { name: 'К карточке' }).click();
    await phone.getByText('Карточка клиента · Обзор').waitFor({ timeout: 5000 });
  } finally {
    await context.close();
  }
});

/**
 * Журнал тренировок — в боковом меню тренера (28.09.2026): выбрал клиента
 * по имени — открылся его журнал.
 */
/**
 * Видимые возвраты (FT-567): на экранах меню, в занятии и в рационе есть
 * кнопка «назад», и она, жест, системный Back и Back браузера ведут в одно
 * место. Раньше из «Настроек» уйти можно было только жестом, а Back
 * браузера уводил со страницы целиком.
 */
test('FT-567: видимый «назад» и Back браузера на экранах меню, в занятии и в рационе', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU' });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  const title = () => phone.locator('#root .app__title').first().textContent();
  const subtitle = () => phone.locator('#root .app__subtitle').first().textContent();
  const menu = async (item) => {
    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: item }).click();
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });
  };
  try {
    await phone.goto(origin + '/?access=' + 'A'.repeat(44));
    await phone.getByRole('button', { name: 'Войти в кабинет' }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Обзор' }).waitFor({ timeout: 10000 });
    const home = phone.url();

    // Клиент: экран меню — крупно, где человек, и кнопка туда, откуда пришёл
    await openTabOn(phone, 'Прогресс');
    await menu(/Настройки/);
    assert.equal(await title(), 'Настройки');
    await phone.getByRole('button', { name: 'Назад: Прогресс' }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Прогресс' }).waitFor({ timeout: 5000 });

    // Back браузера закрывает экран меню, а не уводит со страницы
    await menu(/Мои данные/);
    await phone.waitForTimeout(100);
    await phone.goBack();
    await phone.locator('#root .app__subtitle', { hasText: 'Прогресс' }).waitFor({ timeout: 5000 });
    assert.equal(phone.url(), home, 'страница та же');
    // Закрыли кнопкой — лишней записи в истории не осталось
    await menu(/Настройки/);
    await phone.getByRole('button', { name: 'Назад: Прогресс' }).click();
    await phone.waitForTimeout(200);
    assert.equal(await phone.evaluate(() => !!(history.state && history.state.ftBack)), false, 'страховочная запись снята');

    // Занятие: «Программа» выходит, не завершая; «Вернуться к занятию» — обратно
    await openTabOn(phone, 'Тренировки');
    await phone.getByRole('button', { name: 'Начать тренировку' }).first().click();
    await phone.locator('.workout__header').waitFor({ timeout: 20000 });
    await phone.getByRole('button', { name: 'Назад: Программа' }).click();
    await phone.getByRole('button', { name: /Вернуться к тренировке/ }).click();
    await phone.locator('.workout__header').waitFor({ timeout: 10000 });
    // Back браузера из занятия — тоже к программе, занятие идёт
    await phone.waitForTimeout(100);
    await phone.goBack();
    await phone.getByRole('button', { name: /Вернуться к тренировке/ }).waitFor({ timeout: 5000 });
    assert.equal(phone.url(), home);

    // Рацион: Back браузера (как жест и системный Back) — на шаг, как кнопка
    await openTabOn(phone, 'Питание');
    // Рацион открывается после нормы — в демо её сначала посчитать
    await phone.getByPlaceholder('лет').fill('31');
    await phone.getByPlaceholder('кг').first().fill('64');
    await phone.getByPlaceholder('см').fill('168');
    await phone.getByText('Женский', { exact: true }).first().click();
    await phone.getByText(/^Подвижный/).first().click();
    await phone.locator('text=Тренировок в неделю').locator('xpath=..').getByText('3', { exact: true }).first().click();
    await phone.getByText('Похудение', { exact: true }).first().click();
    await phone.getByRole('button', { name: 'Посчитать норму' }).click();
    const build = phone.getByRole('button', { name: 'План меню', exact: true });
    await build.waitFor({ timeout: 10000 });
    {
      await build.click();
      await phone.getByRole('heading', { name: 'Что есть дома' }).waitFor({ timeout: 10000 });
      // Блюда подбираются от трёх продуктов
      const items = phone.locator('.pantry__item:not(.pantry__item--on)');
      while (await phone.getByRole('button', { name: 'Подобрать блюда' }).isDisabled()) await items.first().click();
      await phone.getByRole('button', { name: 'Подобрать блюда' }).click();
      await phone.getByRole('heading', { name: 'Что приготовить' }).waitFor({ timeout: 5000 });
      await phone.waitForTimeout(100);
      await phone.goBack();
      await phone.getByRole('heading', { name: 'Что есть дома' }).waitFor({ timeout: 5000 });
      await phone.getByRole('button', { name: 'К норме' }).click();
      await build.waitFor({ timeout: 5000 });
    }

    // Тренер: из «Расходов» — к разделу, откуда пришёл
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');
    await openTabOn(phone, 'Расписание');
    await menu(/Расходы/);
    assert.equal(await title(), 'Расходы');
    await phone.getByRole('button', { name: 'Назад: Расписание' }).click();
    // У расписания своей шапки нет (19.10.2026): строка месяца и сетка на весь экран
    await phone.locator('.cal-screen .cal-top__title').waitFor({ timeout: 5000 });
    assert.equal(await phone.locator('#root .app__header').first().isVisible(), false, 'шапка приложения над календарём не стоит');

    // Расписание → занятие → сразу программа этого клиента
    await openTabOn(phone, 'Расписание');
    // Сетка держит соседние дни за краем экрана — берём занятие, что видно
    const lessons = phone.locator('.cal-event:not(.cal-event--personal):not(.cal-event--cancelled)', { hasText: 'Анна' });
    await lessons.first().waitFor({ state: 'attached', timeout: 10000 });
    let lesson = null;
    for (let i = 0; i < await lessons.count() && !lesson; i++) {
      const box = await lessons.nth(i).boundingBox();
      if (box && box.x >= 0 && box.x + box.width <= VIEWPORT.width) lesson = lessons.nth(i);
    }
    assert.ok(lesson, 'на экране есть занятие Анны');
    await lesson.click();
    await phone.getByRole('button', { name: 'Программа клиента' }).click();
    await phone.locator('#root .app__subtitle', { hasText: 'Карточка клиента · Тренировки' }).waitFor({ timeout: 10000 });
    assert.equal(await phone.locator('#root .app__title').first().textContent(), 'Анна Морозова');
    await phone.getByRole('button', { name: 'К занятию' }).waitFor({ timeout: 3000 });
    // Back браузера с не первого раздела карточки — к тому, откуда пришли
    await phone.getByRole('tab', { name: 'Оплаты' }).click();
    await phone.waitForTimeout(150);
    await phone.goBack();
    await phone.getByRole('button', { name: 'Программа клиента' }).waitFor({ timeout: 5000 });
    // И из записи — к сетке расписания, со страницы не уходя
    await phone.waitForTimeout(150);
    await phone.goBack();
    await phone.getByRole('button', { name: 'Программа клиента' }).waitFor({ state: 'detached', timeout: 5000 });
    assert.match(phone.url(), /mockRole=trainer/);
  } finally {
    await context.close();
  }
});

const openTabOn = (p, label) => p.getByRole('button', { name: label, exact: true }).click();

test('журнал тренировок открывается из меню по имени клиента', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');

    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Журнал тренировок/ }).click();
    await phone.getByText('Выберите клиента — откроются все его занятия').waitFor({ timeout: 10000 });
    await phone.waitForFunction(() => document.body.style.overflow !== 'hidden', null, { timeout: 5000 });

    const first = phone.locator('#root main:not([hidden]) .item').first();
    const name = (await first.locator('.item__name').textContent()).trim();
    await first.click();
    await phone.getByRole('button', { name: 'Начать свободную тренировку' }).waitFor({ timeout: 10000 });
    await assert.doesNotReject(phone.locator('#root').getByRole('heading', { name: 'Журнал · ' + name }).waitFor({ timeout: 5000 }), 'журнал этого клиента');
    await phone.getByRole('button', { name: 'К списку клиентов' }).click();
    await phone.getByText('Выберите клиента — откроются все его занятия').waitFor({ timeout: 5000 });
    if (process.env.SHOT_JOURNAL) await phone.screenshot({ path: process.env.SHOT_JOURNAL });
  } finally {
    await context.close();
  }
});

/**
 * «Мои тренировки» (28.09.2026): тренер — сам себе клиент; разделы
 * программы, прогресса и питания, свой журнал — первым в «Журнале».
 */
test('мои тренировки: программа, прогресс, питание и свой журнал', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');

    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Мои тренировки/ }).click();
    // Правка программы — прямо в тренировках (03.10.2026): «+» нового месяца
    await phone.getByRole('button', { name: 'Новый месяц' }).waitFor({ timeout: 10000 });
    if (process.env.SHOT_MY) await phone.screenshot({ path: process.env.SHOT_MY });

    // Развернуть первую тренировку: тап по схеме — подходы; «Разминочный в
    // начало» — схема становится «1 разм. + …»
    const firstBlock = phone.locator('#root main:not([hidden]) .section', { has: phone.locator('.plan__toggle') }).first();
    await firstBlock.locator('.plan__toggle').click();
    const scheme = firstBlock.locator('.plan-inline__scheme').first();
    await scheme.waitFor({ timeout: 10000 });
    await scheme.click();
    await firstBlock.getByRole('button', { name: 'Разминочный в начало' }).click();
    await assert.doesNotReject(firstBlock.locator('.plan-inline__scheme strong', { hasText: '1 разм. +' }).first().waitFor({ timeout: 5000 }), 'разминка в схеме');
    await firstBlock.locator('.plan-inline__set').first().click();
    await firstBlock.getByRole('button', { name: 'Удалить выбранный подход' }).waitFor({ timeout: 5000 });
    if (process.env.SHOT_INLINE) await phone.screenshot({ path: process.env.SHOT_INLINE });
    await firstBlock.getByRole('button', { name: 'Готово' }).click();

    // Суперсет (07.10.2026): обычный вид — схемы и число кругов; тап по
    // любой схеме — правка всего суперсета: поля у каждого упражнения и
    // общая колонка кругов. Добавленный круг — у всех сразу
    const secondBlock = phone.locator('#root main:not([hidden]) .section', { has: phone.locator('.plan__toggle') }).nth(1);
    await secondBlock.locator('.plan__toggle').click();
    const superset = secondBlock.locator('.plan-inline__unit--superset').first();
    await superset.locator('.plan-inline__scheme').first().click();
    assert.equal(await superset.locator('.plan-inline__field--reps').count(), await superset.locator('.plan-inline__row').count(), 'поля у каждого упражнения суперсета');
    const rounds = superset.locator('.plan-inline__rounds-col--edit .plan-inline__set');
    const before = await rounds.count();
    await superset.getByRole('button', { name: 'Круг', exact: true }).click();
    assert.equal(await rounds.count(), before + 1, 'круг добавился');
    // Выйти из суперсета — у каждого упражнения (FT-473, FT-486)
    assert.equal(await superset.getByRole('button', { name: 'Выйти из суперсета' }).count(), await superset.locator('.plan-inline__row').count(), 'выход из суперсета у каждого упражнения');
    if (process.env.SHOT_SUPERSET) await phone.screenshot({ path: process.env.SHOT_SUPERSET, fullPage: true });
    await superset.getByRole('button', { name: 'Готово' }).click();
    assert.equal(await superset.locator('.plan-inline__rounds-sum strong').innerText(), String(before + 1), 'число кругов в обычном виде');

    // Тап по названию — вид упражнения, как в занятии; уходит в базу
    await superset.locator('.plan-inline__name').first().click();
    await secondBlock.getByRole('radio', { name: 'Собственный вес' }).click();
    await secondBlock.getByRole('radio', { name: 'Собственный вес', checked: true }).waitFor({ timeout: 5000 });
    if (process.env.SHOT_KIND) await phone.screenshot({ path: process.env.SHOT_KIND, fullPage: true });
    await secondBlock.getByRole('button', { name: 'Готово' }).click();
    for (const tab of ['Прогресс', 'Питание']) {
      await phone.getByRole('tab', { name: tab, exact: true }).click();
      await phone.locator(`.card-section[data-view]:not([hidden])`).waitFor({ timeout: 5000 });
      if (tab === 'Прогресс') {
        // Тренировки с часов — рядом с шагами; совпавшая с занятием совмещена
        await phone.getByText('Тренировки с часов').waitFor({ timeout: 5000 });
        await phone.getByText('Совмещено с «Верх»').waitFor({ timeout: 5000 });
        if (process.env.SHOT_HW) { await phone.getByText('Тренировки с часов').scrollIntoViewIfNeeded(); await phone.screenshot({ path: process.env.SHOT_HW }); }
      }
    }

    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Журнал тренировок/ }).click();
    await phone.getByText('Я · Константин').click();
    await phone.getByRole('button', { name: 'К списку клиентов' }).waitFor({ timeout: 10000 });
  } finally {
    await context.close();
  }
});

/**
 * Карта мышц (FT-491): у тренировки — основная группа и синергисты, у всей
 * программы — карта с пробелами, в итогах — мышцы периода. Тренер правит
 * мышцы упражнения тапами: основная → синергист → снять, правка — в базу.
 */
test('карта мышц: тренировка, программа, итоги и правка тренером', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Мои тренировки/ }).click();

    const firstBlock = phone.locator('#root main:not([hidden]) .plan__block').first();
    await firstBlock.locator('.muscles--block').waitFor({ timeout: 10000 });
    await assert.doesNotReject(firstBlock.getByText('Основная группа').waitFor({ timeout: 5000 }));
    await assert.doesNotReject(firstBlock.getByText('Синергисты').waitFor({ timeout: 5000 }));

    await phone.getByRole('tab', { name: /^Вся программа/ }).click();
    await assert.doesNotReject(phone.getByRole('heading', { name: 'Мышцы программы' }).waitFor({ timeout: 5000 }));
    await assert.doesNotReject(phone.getByText('Без основной нагрузки:').first().waitFor({ timeout: 5000 }));

    // Правка: «Жим лёжа» — грудь основная, трицепс синергист; тап по
    // трицепсу дважды — снят
    const block = phone.locator('#root main:not([hidden]) .plan__block').first();
    await block.locator('.plan__toggle').click();
    await block.locator('.plan-inline__name').first().click();
    const edit = block.locator('.muscle-edit').first();
    await edit.getByRole('button', { name: 'Изменить' }).click();
    const triceps = () => edit.getByRole('button', { name: /^Трицепс:/ });
    assert.match(await triceps().getAttribute('aria-label'), /синергист/);
    await triceps().click();
    assert.match(await triceps().getAttribute('aria-label'), /не задействована/);
    await triceps().click();
    assert.match(await triceps().getAttribute('aria-label'), /основная/);
    await assert.doesNotReject(edit.getByRole('button', { name: 'Как было' }).waitFor({ timeout: 5000 }));
    await edit.getByRole('button', { name: 'Готово' }).click();
    await assert.doesNotReject(edit.getByText(/Грудь, трицепс/).waitFor({ timeout: 5000 }), 'в свёрнутой строке — новая основная группа');

    await phone.getByRole('tab', { name: 'Прогресс', exact: true }).click();
    await assert.doesNotReject(phone.locator('.summary__muscles').waitFor({ timeout: 10000 }));
  } finally {
    await context.close();
  }
});

/**
 * Похожие упражнения (28.09.2026): группа копий — оставить одно, остальные
 * влить; после объединения группа пропадает.
 */
test('похожие упражнения объединяются в одно', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');

    await phone.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await phone.getByRole('tab', { name: 'Упражнения', exact: true }).click();
    await phone.getByRole('button', { name: 'Похожие', exact: true }).click();
    await phone.getByText('жим лежа со штангой').waitFor({ timeout: 10000 });
    if (process.env.SHOT_SIMILAR) await phone.screenshot({ path: process.env.SHOT_SIMILAR, fullPage: true });

    await phone.getByRole('button', { name: 'Объединить в «Жим лёжа»' }).click();
    // Отменить нельзя — второе нажатие подтверждает
    await phone.getByText('Отменить нельзя.', { exact: false }).waitFor({ timeout: 5000 });
    if (process.env.SHOT_SIMILAR_CONFIRM) await phone.screenshot({ path: process.env.SHOT_SIMILAR_CONFIRM, fullPage: true });
    await phone.getByRole('button', { name: 'Объединить', exact: true }).click();
    await phone.getByText('Объединено в «Жим лёжа»').waitFor({ timeout: 5000 });

    await phone.getByRole('button', { name: 'Назад' }).click();
    await phone.getByRole('button', { name: 'Похожие', exact: true }).click();
    await phone.getByText('Копий не найдено').waitFor({ timeout: 5000 });
  } finally {
    await context.close();
  }
});

/**
 * Разделы карточки клиента листаются пальцем, как нижнее меню, а с
 * первого раздела смахивание вправо возвращает к списку клиентов.
 */
test('разделы карточки клиента листаются смахиванием', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  const subtitle = () => phone.locator('#root .app__subtitle').first().textContent();
  const settled = () => phone.waitForFunction(() => !document.querySelector('.swipeback'), null, { timeout: 4000 });

  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');

    // «Сегодня» по умолчанию — только занятия сегодня, в демо их может не
    // быть: берём клиента из «Все»
    await phone.getByRole('tab', { name: /^Все · / }).click({ timeout: 10000 });
    await phone.locator('#root main:not([hidden]) .item').first().click({ timeout: 10000 });
    await phone.getByText('Карточка клиента · Обзор').waitFor({ timeout: 10000 });
    await phone.waitForTimeout(400);

    await swipe(phone, { x: 330, y: 600 }, { x: 60, y: 610 });
    await settled();
    assert.equal(await subtitle(), 'Карточка клиента · Оплаты', 'влево — следующий раздел');

    await swipe(phone, { x: 60, y: 600 }, { x: 330, y: 610 });
    await settled();
    assert.equal(await subtitle(), 'Карточка клиента · Обзор', 'вправо — предыдущий');

    await swipe(phone, { x: 60, y: 600 }, { x: 330, y: 610 });
    await settled();
    await assert.doesNotReject(
      phone.locator('#root .app__title', { hasText: 'Клиенты' }).waitFor({ timeout: 5000 }),
      'с первого раздела — назад к списку',
    );
  } finally {
    await context.close();
  }
});

/**
 * «Новый шаблон тренировки» (владелец, 16.10.2026): форма не как у программы —
 * без «Уровня» и без пояснений про частоту и прогрессию.
 */
test('новый шаблон тренировки — без уровня, у программы он есть', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const tab = await context.newPage();
  tab.on('pageerror', (error) => consoleErrors.push(String(error)));
  const level = () => tab.locator('#root main:not([hidden]) .field__label', { hasText: /^Уровень$/ }).count();
  try {
    await tab.goto(origin + '/?mockRole=trainer');
    await tab.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await tab.goto(origin + '/?mockRole=trainer');
    await tab.getByRole('button', { name: 'Библиотека', exact: true }).click();

    await tab.getByRole('tab', { name: 'Тренировки', exact: true }).click();
    await tab.getByRole('button', { name: 'Новый шаблон тренировки' }).click();
    await tab.getByRole('heading', { name: 'Упражнения' }).waitFor({ timeout: 5000 });
    assert.equal(await level(), 0, 'у шаблона тренировки уровня нет');
    assert.equal(await tab.getByPlaceholder('На что обратить внимание в этой тренировке').count(), 1, 'подсказка про тренировку');
    // Выход из редактора — стрелкой «К шаблонам»: «Отмены» в нём с 20.10.2026 нет
    await tab.getByRole('button', { name: 'К шаблонам' }).first().click();

    await tab.getByRole('tab', { name: 'Программы', exact: true }).click();
    await tab.getByRole('button', { name: 'Новый шаблон программы' }).click();
    await tab.getByRole('heading', { name: 'Тренировки' }).waitFor({ timeout: 5000 });
    assert.equal(await level(), 1, 'у программы уровень есть');
  } finally { await context.close(); }
});

/**
 * Библиотека — ради скорости: шаблон программы назначается клиенту за
 * пару нажатий. Чужой общий шаблон копируется к себе, общее упражнение —
 * своей версией.
 */
test('шаблон назначается клиенту, общий копируется, упражнение — своей версией', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const tab = await context.newPage();
  tab.on('pageerror', (error) => consoleErrors.push(String(error)));
  // Удаление спрашивает подтверждение — соглашаемся
  tab.on('dialog', (dialog) => dialog.accept());
  const visible = (sel) => tab.locator('#root main:not([hidden]) ' + sel);

  try {
    await tab.goto(origin + '/?mockRole=trainer');
    await tab.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await tab.goto(origin + '/?mockRole=trainer');

    await tab.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await visible('.item', { hasText: 'Похудение, 3 раза в неделю' }).first().waitFor({ timeout: 10000 });
    await visible('.item').filter({ hasText: 'Похудение, 3 раза в неделю' }).click();

    await tab.getByRole('button', { name: 'Назначить клиенту' }).click();
    await visible('.item').first().click();
    await tab.getByRole('button', { name: 'Назначить', exact: true }).click();
    await assert.doesNotReject(tab.getByText('Назначено').waitFor({ timeout: 5000 }), 'шаблон назначен');

    // Общий шаблон другого тренера — к себе
    await tab.getByRole('button', { name: 'К шаблону' }).click();
    await tab.getByRole('button', { name: 'Назад' }).click();
    await tab.getByRole('radio', { name: 'Общие' }).click();
    await visible('.item').filter({ hasText: 'Сила: база 5×5' }).click();
    await tab.getByText('автор: Мария').waitFor({ timeout: 5000 });
    await tab.getByRole('button', { name: 'Скопировать к себе' }).click();
    await assert.doesNotReject(tab.getByRole('button', { name: 'Изменить' }).waitFor({ timeout: 5000 }), 'копия своя — её можно править');

    // Тренировку из программы — отдельным шаблоном в «Тренировки»
    await tab.getByRole('button', { name: 'В «Тренировки»' }).first().click();
    await tab.getByText('В «Тренировках»').first().waitFor({ timeout: 5000 });
    await tab.getByRole('button', { name: 'Назад' }).click();
    await tab.getByRole('tab', { name: 'Тренировки', exact: true }).click();
    await assert.doesNotReject(
      visible('.item').filter({ hasText: 'Тренировка 1 — верх' }).first().waitFor({ timeout: 5000 }),
      'тренировка из программы появилась в «Тренировках»',
    );

    // Удаление из списка: режим «Править»
    await visible('.item').first().waitFor();
    const before = await visible('.item').count();
    await tab.getByRole('button', { name: 'Править' }).click();
    await visible('.library__remove').first().click();
    await tab.waitForFunction((n) => document.querySelectorAll('#root main:not([hidden]) .item').length === n - 1, before, { timeout: 5000 });
    await tab.getByRole('button', { name: 'Готово' }).click();

    // Упражнение: анимация, своя версия общего
    await tab.getByRole('tab', { name: 'Упражнения', exact: true }).click();
    await visible('.item').filter({ hasText: 'Планка' }).click();
    const frame = tab.locator('.library__anim img').first();
    await frame.waitFor({ timeout: 5000 });
    assert.ok(await frame.evaluate((img) => img.complete && img.naturalWidth > 0), 'кадр анимации загрузился');
    // Правка касанием по полю (18.10.2026): у общего сохранение создаёт свою версию
    await tab.getByRole('button', { name: 'Изменить: Техника выполнения' }).click();
    await tab.getByLabel('Техника выполнения').fill('Корпус — одна линия.');
    await tab.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await assert.doesNotReject(tab.locator('.library__meta', { hasText: 'своё' }).waitFor({ timeout: 5000 }), 'своя версия сохранена');
    await assert.doesNotReject(tab.getByText('Корпус — одна линия.').waitFor({ timeout: 5000 }), 'техника на месте');
    await assert.doesNotReject(tab.locator('.library__anim').waitFor({ timeout: 5000 }), 'у своей версии та же анимация');

    // Общее убирается у себя и возвращается
    await tab.getByRole('button', { name: 'Назад' }).click();
    await tab.getByRole('button', { name: 'Править' }).click();
    await visible('.library__row').filter({ hasText: 'Бёрпи' }).getByRole('button', { name: /Убрать/ }).click();
    await tab.getByRole('button', { name: 'Убранные · 1' }).click();
    await tab.getByRole('button', { name: 'Вернуть', exact: true }).click();
    await assert.doesNotReject(tab.getByText('Все упражнения на месте').waitFor({ timeout: 5000 }), 'упражнение вернулось');
  } finally {
    await context.close();
  }
});

/**
 * FT-569: оборудование заводится само по себе, а затем одной карточкой
 * связывается с несколькими упражнениями.
 */
test('оборудование создаётся без упражнения и привязывается к нескольким', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');

    await phone.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await phone.getByRole('tab', { name: 'Тренажёры', exact: true }).click();
    await phone.getByRole('button', { name: 'Новый тренажёр', exact: true }).click();
    await phone.getByRole('radio', { name: 'Оборудование', exact: true }).click();
    await phone.getByLabel('Клиентское название').fill('Разборные гантели');
    await phone.getByLabel('Настройка').fill('Стойка у окна.');
    await phone.getByRole('button', { name: 'Сохранить', exact: true }).click();

    const card = phone.locator('#root main:not([hidden]) .item').filter({ hasText: 'Разборные гантели' });
    await card.waitFor({ timeout: 5000 });
    await assert.doesNotReject(card.getByText('пока без упражнений').waitFor({ timeout: 3000 }), 'карточка сохранена отдельно');
    await card.click();

    const bench = phone.getByRole('button', { name: /Жим гантелей лёжа/ });
    await bench.click();
    await phone.waitForFunction(() => {
      const row = [...document.querySelectorAll('#root main:not([hidden]) .item')]
        .find((item) => item.textContent.includes('Жим гантелей лёжа'));
      return row && row.getAttribute('aria-pressed') === 'true';
    });

    const squat = phone.getByRole('button', { name: /Приседания со штангой/ });
    await squat.click();
    await phone.waitForFunction(() => {
      const row = [...document.querySelectorAll('#root main:not([hidden]) .item')]
        .find((item) => item.textContent.includes('Приседания со штангой'));
      return row && row.getAttribute('aria-pressed') === 'true';
    });

    // «Назад» к списку — общий BackButton (аудит 24.10.2026): для диктора «Назад: Тренажёры»
    await phone.getByRole('button', { name: 'Назад: Тренажёры', exact: true }).click();
    const linked = phone.locator('#root main:not([hidden]) .item').filter({ hasText: 'Разборные гантели' });
    await assert.doesNotReject(linked.getByText(/Жим гантелей лёжа/).waitFor({ timeout: 3000 }));
    await assert.doesNotReject(linked.getByText(/Приседания со штангой/).waitFor({ timeout: 3000 }));
  } finally {
    await context.close();
  }
});

/**
 * Порядок тренировок в редакторе — перетаскиванием в свёрнутом списке:
 * развёрнутая тренировка выше экрана, тащить её целиком нельзя.
 */
test('тренировки программы переставляются перетаскиванием', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const tab = await context.newPage();
  tab.on('pageerror', (error) => consoleErrors.push(String(error)));
  const visible = (sel) => tab.locator('#root main:not([hidden]) ' + sel);

  try {
    await tab.goto(origin + '/?mockRole=trainer');
    await tab.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await tab.goto(origin + '/?mockRole=trainer');

    await tab.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await visible('.item').filter({ hasText: 'Похудение, 3 раза в неделю' }).first().click();
    await tab.getByRole('button', { name: 'Изменить' }).click();
    await tab.getByRole('button', { name: 'Свернуть тренировки' }).click();
    // Свёрнутый список плавно подъезжает к экрану — ждём, пока встанет
    await tab.waitForTimeout(700);

    const rows = tab.locator('.block-order__row');
    await rows.first().waitFor({ timeout: 5000 });
    // Тащат за ручку справа — остальная строка листает страницу
    const a = await rows.nth(0).locator('.block-order__handle').boundingBox();
    const b = await rows.nth(1).boundingBox();
    const r0 = await rows.nth(0).boundingBox();
    await tab.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await tab.mouse.down();
    for (let i = 1; i <= 8; i += 1) {
      await tab.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + ((b.y - r0.y + 10) * i) / 8);
    }
    await tab.mouse.up();

    await assert.doesNotReject(
      tab.waitForFunction(() => {
        const first = document.querySelector('.block-order__title');
        return first && first.textContent === 'Тренировка 2 — низ';
      }, null, { timeout: 5000 }),
      'первой стала вторая тренировка',
    );

    // Смахнуть влево — выезжает корзина; удаление без подтверждения, но с «Вернуть»
    const before = await rows.count();
    const r = await rows.nth(1).boundingBox();
    await tab.mouse.move(r.x + r.width - 30, r.y + r.height / 2);
    await tab.mouse.down();
    for (let i = 1; i <= 6; i += 1) await tab.mouse.move(r.x + r.width - 30 - i * 25, r.y + r.height / 2 + 1);
    await tab.mouse.up();
    const trash = rows.nth(1).locator('.block-order__trash');
    await tab.waitForFunction(() => {
      const s = document.querySelectorAll('.block-order__swipe')[1];
      return s && Number(getComputedStyle(s).opacity) > 0.9;
    }, null, { timeout: 3000 });
    await trash.click();
    await tab.waitForFunction((n) => document.querySelectorAll('.block-order__row').length === n - 1, before, { timeout: 3000 });
    await tab.getByRole('button', { name: 'Вернуть' }).click();
    assert.equal(await rows.count(), before, 'удалённое вернулось');

    // Выбрать две тренировки и скопировать разом
    await tab.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await rows.nth(0).click();
    await rows.nth(1).click();
    await assert.doesNotReject(tab.getByText('Выбрано 2').waitFor({ timeout: 3000 }));
    const originalTitles = await rows.locator('.block-order__title').evaluateAll((titles) => titles.map((title) => title.textContent));
    const selectedTitles = originalTitles.slice(0, 2);
    await tab.locator('.block-order__actions').getByRole('button', { name: 'Копировать' }).click();
    assert.equal(await rows.count(), before + 2, 'скопированы обе');
    assert.deepEqual(
      await rows.locator('.block-order__title').evaluateAll((titles) => titles.map((title) => title.textContent)),
      originalTitles.concat(selectedTitles),
      'копии без подписи идут после всех оригиналов в их порядке',
    );

    await tab.locator('.plan-edit__order-bar').getByRole('button', { name: 'Развернуть' }).click();
    const firstTitle = await tab.locator('.plan-edit__title').first().inputValue();
    assert.equal(firstTitle, 'Тренировка 2 — низ', 'порядок сохранился и в развёрнутом редакторе');

    // Панель «Сохранить шаблон» — только на вкладке шаблонов: она вынесена
    // в body и раньше ездила по всем разделам (09.10.2026)
    await tab.locator('.plan-edit__float').waitFor({ timeout: 3000 });
    await tab.getByRole('button', { name: 'Клиенты', exact: true }).click();
    await assert.doesNotReject(tab.waitForFunction(() => !document.querySelector('.plan-edit__float'), null, { timeout: 3000 }), 'в «Клиентах» панели шаблона нет');
    await tab.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await assert.doesNotReject(tab.locator('.plan-edit__float').waitFor({ timeout: 3000 }), 'вернулись — панель снова на месте');
  } finally {
    await context.close();
  }
});

/**
 * Корзина после смахивания — настоящими касаниями, а не мышью. На телефоне
 * «нажатие» по только что выдвинутой кнопке браузер не присылает, и
 * удаление молчало, хотя мышью всё работало. Ловим именно это.
 */
test('смахнуть подход и нажать корзину пальцем — подход удаляется', async () => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const c = await context.newPage();
  c.on('pageerror', (error) => consoleErrors.push(String(error)));
  const cdp = await context.newCDPSession(c);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  try {
    // Вход сам по себе проверен первым тестом — здесь готовый демо-ключ
    await c.goto(origin);
    await c.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await c.goto(origin);
    await c.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 60000 });
    await c.getByRole('button', { name: 'Тренировки', exact: true }).tap();
    const sec = c.locator('.section', { has: c.getByRole('heading', { name: 'Тренировка 2 — низ' }) });
    await sec.getByRole('button', { name: 'Начать тренировку' }).tap();
    const rows = c.locator('.workout__exercise').nth(1).locator('.workout__set');
    await rows.nth(1).waitFor({ timeout: 20000 });
    // FT-570: инструкции упражнений раскрыты и приходят после открытия — ждём их, иначе подходы съезжают
    await c.locator('.workout__about').first().waitFor({ timeout: 10000 });
    await rows.nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await c.waitForTimeout(300);
    const before = await rows.count();
    const b = await rows.nth(1).boundingBox();
    const x0 = b.x + b.width - 60;
    const y = b.y + 10;
    await touch('touchStart', x0, y);
    for (let i = 1; i <= 10; i += 1) { await touch('touchMove', x0 - i * 18, y); await c.waitForTimeout(16); }
    await touch('touchEnd', 0, 0);
    await c.waitForTimeout(400);
    const trash = await rows.nth(1).locator('.swipe__trash').boundingBox();
    await touch('touchStart', trash.x + trash.width / 2, trash.y + trash.height / 2);
    await c.waitForTimeout(60);
    await touch('touchEnd', 0, 0);
    await c.waitForFunction((n) => document.querySelectorAll('.workout__exercise')[1].querySelectorAll('.workout__set').length === n - 1, before, { timeout: 5000 });
  } finally {
    await context.close();
  }
});

/**
 * Полное смахивание, как на iPhone: протянуть подход далеко влево и
 * отпустить — то же, что нажать «Удалить». Настоящими касаниями.
 */
test('протянуть подход далеко влево и отпустить — подход удаляется', async () => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const c = await context.newPage();
  c.on('pageerror', (error) => consoleErrors.push(String(error)));
  const cdp = await context.newCDPSession(c);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  try {
    // Вход сам по себе проверен первым тестом — здесь готовый демо-ключ
    await c.goto(origin);
    await c.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await c.goto(origin);
    await c.getByRole('button', { name: 'Тренировки', exact: true }).waitFor({ timeout: 60000 });
    await c.getByRole('button', { name: 'Тренировки', exact: true }).tap();
    const sec = c.locator('.section', { has: c.getByRole('heading', { name: 'Тренировка 2 — низ' }) });
    await sec.getByRole('button', { name: 'Начать тренировку' }).tap();
    const rows = c.locator('.workout__exercise').nth(1).locator('.workout__set');
    await rows.nth(1).waitFor({ timeout: 20000 });
    // FT-570: инструкции упражнений раскрыты и приходят после открытия — ждём их, иначе подходы съезжают
    await c.locator('.workout__about').first().waitFor({ timeout: 10000 });
    await rows.nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await c.waitForTimeout(300);
    // Вес на одну сторону (07.10.2026): отметка в первом подходе — у всех,
    // в другом — только у него
    const sides = c.locator('.workout__exercise').nth(1).locator('.workout__side input');
    if (await sides.count()) {
      await sides.first().tap();
      for (let k = 0; k < await sides.count(); k += 1) assert.equal(await sides.nth(k).isChecked(), true, 'первый подход — отметка у всех');
      await sides.nth(1).tap();
      assert.equal(await sides.nth(1).isChecked(), false, 'второй сняли');
      assert.equal(await sides.nth(2).isChecked(), true, 'третий не тронут');
      if (process.env.SHOT_SIDE) await c.screenshot({ path: process.env.SHOT_SIDE });
    }
    const before = await rows.count();
    const b = await rows.nth(1).boundingBox();
    const x0 = b.x + b.width - 20;
    const y = b.y + 10;
    await touch('touchStart', x0, y);
    for (let i = 1; i <= 16; i += 1) { await touch('touchMove', x0 - i * 18, y); await c.waitForTimeout(16); }
    // За порогом подпись «Удалить» переехала к пальцу
    const shift = await rows.nth(1).locator('.swipe__label').evaluate((el) => el.style.transform);
    assert.match(shift, /translate3d\(-/, 'за порогом подпись едет к пальцу');
    if (process.env.SHOT_FULL) await c.screenshot({ path: process.env.SHOT_FULL });
    await touch('touchEnd', 0, 0);
    await c.waitForFunction((n) => document.querySelectorAll('.workout__exercise')[1].querySelectorAll('.workout__set').length === n - 1, before, { timeout: 5000 });
  } finally {
    await context.close();
  }
});

test('за весь проход в консоли не было ошибок', () => {
  assert.deepEqual(consoleErrors, []);
});

/**
 * Отдых у тренера (03.10.2026): запустил в «Моих тренировках», свернул,
 * ушёл в другой раздел — экран с тренировкой закрылся, а отдых нет:
 * внизу плашка с отсчётом, в конце — «Отдых окончен». Закрыл там —
 * вернулся к тренировке, второй раз не всплывает.
 */
test('отдых, свёрнутый у тренера, доживает до конца в другом разделе', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  await phone.clock.install();
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.getByRole('button', { name: 'Меню', exact: true }).click({ timeout: 20000 });
    await phone.getByRole('button', { name: /Мои тренировки/ }).click();
    const sec = phone.locator('#root main:not([hidden]) .section', { has: phone.getByRole('heading', { name: 'Тренировка 1 — верх' }) });
    await sec.getByRole('button', { name: 'Начать тренировку' }).click({ timeout: 20000 });
    const set = phone.locator('.workout__set').first();
    await set.waitFor({ timeout: 20000 });
    const reps = set.getByRole('textbox').nth(1);
    if (!(await reps.inputValue())) await reps.fill('8');
    await phone.locator('.workout__effort-btn--ok').first().click();
    const restScreen = phone.locator('.rest-screen');
    const restBox = await restScreen.boundingBox();
    assert.ok(restBox, 'полноэкранный таймер виден');
    await swipe(phone,
      { x: restBox.x + restBox.width / 2, y: restBox.y + restBox.height * 0.3 },
      { x: restBox.x + restBox.width / 2, y: restBox.y + restBox.height * 0.55 });
    await phone.locator('.rest-pill').waitFor({ timeout: 5000 });
    // Кнопка остаётся вторым способом свернуть таймер.
    await phone.locator('.rest-pill').click();
    await phone.getByRole('button', { name: 'Свернуть таймер' }).click({ timeout: 5000 });
    // Из «Моих тренировок» — в другой раздел бокового меню: экран тренировки закрывается.
    // Шапка приложения с «Меню» на экране занятия под стеклом его шапки (24.10.2026) —
    // сначала «назад» к программе
    await phone.getByRole('button', { name: /^Назад/ }).first().click();
    await phone.getByRole('button', { name: 'Меню', exact: true }).click();
    await phone.getByRole('button', { name: /Журнал тренировок/ }).click();
    await phone.locator('.rest-pill').waitFor({ timeout: 5000 });
    if (process.env.SHOT_REST_PILL) await phone.screenshot({ path: process.env.SHOT_REST_PILL });
    await phone.clock.fastForward(200000);
    const over = phone.locator('.rest-screen--over');
    await over.waitFor({ timeout: 5000 });
    if (process.env.SHOT_REST_OVER) await phone.screenshot({ path: process.env.SHOT_REST_OVER });
    await over.getByRole('button', { name: 'Закрыть' }).click();
    await over.waitFor({ state: 'detached', timeout: 5000 });
  } finally {
    await context.close();
  }
});

/** Тренировку программы — удержанием вниз (03.10.2026): порядок меняется и сохраняется */
test('тренировка в программе переносится удержанием', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.getByRole('button', { name: 'Меню', exact: true }).click({ timeout: 20000 });
    await phone.getByRole('button', { name: /Мои тренировки/ }).click();
    const titles = () => phone.locator('#root main:not([hidden]) .plan__block .section__title').allInnerTexts();
    const blocks = phone.locator('#root main:not([hidden]) .plan__block');
    await blocks.nth(1).waitFor({ timeout: 10000 });
    const before = await titles();
    const head = phone.locator('#root main:not([hidden]) .plan__block .section__head').first();
    const first = await blocks.first().boundingBox();
    const second = await blocks.nth(1).boundingBox();
    assert.ok(second.y - first.y - first.height >= 28, 'тренировки разделены межблочным интервалом');
    const b = await head.boundingBox();
    await phone.mouse.move(b.x + 20, b.y + b.height / 2);
    await phone.mouse.down();
    await phone.waitForTimeout(600);
    await phone.mouse.move(b.x + 20, second.y + second.height * 0.8, { steps: 12 });
    await phone.mouse.up();
    await phone.waitForTimeout(400);
    const after = await titles();
    assert.equal(after[0], before[1], 'вторая стала первой');
    assert.equal(after[1], before[0], 'первая — второй');
  } finally {
    await context.close();
  }
});

test('FT-568: список и карточка показывают один баланс даже со старым кешем обзора', async () => {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'ru-RU', isMobile: true, hasTouch: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => {
      localStorage.setItem('auth_token_v1', 'demo-session');
      localStorage.setItem('api_cache_v1:client.overview|{"clientRow":3}', JSON.stringify({
        at: Date.now() - 86400000, data: { row: 3, balance: 58500, price: 2250,
          trainingsLeft: 26, trainingsThisMonth: 4, nextTrainingDate: '2026-10-11T18:00:00' },
      }));
    });
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.getByRole('tab', { name: /^Все · / }).click({ timeout: 10000 });
    const row = phone.locator('#root main:not([hidden]) .item').filter({ hasText: 'Анна Морозова' }).first();
    await row.waitFor({ timeout: 20000 });
    assert.match(await row.innerText(), /12\s*000/);
    await phone.evaluate(() => {
      window.__balanceHints = [];
      new MutationObserver(() => {
        const hint = document.querySelector('.card-section[data-view="overview"] .lead__hint');
        if (hint) window.__balanceHints.push(hint.textContent);
      }).observe(document.getElementById('root'), { childList: true, subtree: true, characterData: true });
    });
    await row.click();
    const overview = phone.locator('.card-section[data-view="overview"]');
    await overview.locator('.lead__hint').waitFor({ timeout: 10000 });
    assert.match(await overview.locator('.lead__hint').innerText(), /12\s*000 ₽ на балансе/);
    // Число и единица — через неразрывный пробел (Qty, FT-665)
    assert.match(await overview.locator('.lead__value').innerText(), /4.тренировки/);
    await phone.waitForTimeout(700);
    assert.ok((await phone.evaluate(() => window.__balanceHints)).every((hint) => !hint.includes('58')),
      'устаревший кеш не мелькает даже до ответа сервера');
    await phone.getByRole('button', { name: 'К списку' }).click();
    await phone.locator('.item').filter({ hasText: 'Анна Морозова' }).first().click();
    assert.match(await phone.locator('.card-section[data-view="overview"] .lead__hint').innerText(), /12\s*000/);
  } finally {
    await context.close();
  }
});

test('в карточке клиента тренировки выбираются, копируются, удаляются и переименовываются', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const phone = await context.newPage();
  phone.on('pageerror', (error) => consoleErrors.push(String(error)));
  try {
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.evaluate(() => {
      localStorage.setItem('auth_token_v1', 'demo-session');
      localStorage.setItem('workout_demo_server:99', JSON.stringify([{
        id: 'completed-for-rename',
        title: 'Завершённая тренировка',
        sourceBlock: 'Тренировка 1 — верх',
        month: 'Сентябрь 2026',
        status: 'completed',
        revision: 0,
        requestId: '',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        exercises: [{ id: 'exercise-1', name: 'Жим лёжа', sets: [{ id: 'set-1', state: 'done', kind: 'work', weight: '70', reps: '8', rpe: '' }] }],
      }]));
    });
    await phone.goto(origin + '/?mockRole=trainer');
    await phone.getByRole('button', { name: 'Меню', exact: true }).click({ timeout: 20000 });
    await phone.getByRole('button', { name: /Мои тренировки/ }).click();

    const blocks = phone.locator('#root main:not([hidden]) .plan__block');
    await blocks.nth(1).waitFor({ timeout: 10000 });
    const before = await blocks.count();
    await phone.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await blocks.nth(0).click();
    await blocks.nth(1).click();
    if (process.env.SHOT_PLAN_ACTIONS) await phone.screenshot({ path: process.env.SHOT_PLAN_ACTIONS, fullPage: true });
    await phone.getByRole('button', { name: 'Копировать', exact: true }).click();
    await phone.waitForFunction((count) => document.querySelectorAll('#root main:not([hidden]) .plan__block').length === count + 2, before);

    // Полное смахивание одной копии удаляет её и оставляет восстановление.
    const copy = blocks.nth(1);
    const box = await copy.boundingBox();
    await phone.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await phone.mouse.down();
    await phone.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 8 });
    await phone.mouse.up();
    await phone.getByRole('button', { name: 'Вернуть', exact: true }).waitFor({ timeout: 5000 });

    await phone.getByRole('tab', { name: /^Выполненные/ }).click();
    const rename = phone.getByRole('button', { name: /^Переименовать:/ }).first();
    await rename.waitFor({ timeout: 10000 });
    const original = (await rename.innerText()).trim();
    await rename.click();
    const input = phone.getByRole('textbox', { name: 'Название тренировки' });
    await input.fill(original + ' · исправлено');
    await input.press('Enter');
    await phone.getByRole('button', { name: 'Переименовать: ' + original + ' · исправлено' }).waitFor({ timeout: 5000 });
  } finally {
    await context.close();
  }
});
