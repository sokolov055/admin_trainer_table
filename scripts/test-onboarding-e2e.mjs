import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-onboarding-test');
let server, browser, origin;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
before(async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT],
    { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
  server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(OUT, path === '/' ? 'index.html' : path);
    const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }); res.end(readFileSync(target));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
}, { timeout: 120000 });
after(async () => { await browser?.close(); if (server) await new Promise((r) => server.close(r)); rmSync(OUT, { recursive: true, force: true }); });
async function open(width = 390, enabled = true) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'ru-RU' });
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-onboarding-token'));
  await page.goto(origin + '?mockUnlinked=1' + (enabled ? '&mockOnboarding=1' : ''));
  return page;
}
const next = (page) => page.locator('.ob__next');
const radio = (page, name) => page.getByRole('radio', { name: new RegExp('^' + name) });
const sheetDone = (page) => page.locator('.sheet__done');
test('анкета 2.0: согласие, данные барабанами, обмен, цель и темп, назад, прерывание, план и программа', async () => {
  const page = await open(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const go = page.getByRole('button', { name: 'Поехали' });
  await go.waitFor(); assert.equal(await go.isDisabled(), true);
  await page.getByRole('checkbox').check(); await go.click();
  await page.getByRole('heading', { name: /Приятно познакомиться|Расскажите о себе/ }).waitFor();
  assert.equal(await next(page).isDisabled(), true);
  // Пол открывает барабаны даты рождения; «Далее» в окне ведёт к следующему пустому полю
  await radio(page, 'Мужской').click();
  await page.getByRole('dialog', { name: 'Дата рождения' }).waitFor();
  await page.getByRole('spinbutton', { name: 'Месяц' }).press('ArrowDown');
  await page.waitForTimeout(500);
  await sheetDone(page).click(); await page.getByRole('dialog', { name: 'Рост' }).waitFor();
  await sheetDone(page).click(); await page.getByRole('dialog', { name: 'Вес' }).waitFor();
  await sheetDone(page).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.match(await page.locator('.ob-tile').first().textContent(), /1 февраля \d{4}/);
  await next(page).click();
  await page.getByRole('heading', { name: /Базовый обмен рассчитан/ }).waitFor();
  await next(page).click();
  await radio(page, 'Подвижный').click();
  await radio(page, 'Похудеть').click();
  await page.getByRole('dialog', { name: 'Темп похудения' }).waitFor();
  assert.equal(await radio(page, 'Ровный').getAttribute('aria-checked'), 'true', 'по умолчанию — средний темп');
  await sheetDone(page).click();
  await radio(page, 'Только начинаю').click();
  await page.getByRole('heading', { name: 'Где будете заниматься?' }).waitFor();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  assert.equal(await radio(page, 'Только начинаю').getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: 'Позже' }).click();
  await page.getByRole('button', { name: 'Продолжить подбор программы' }).click();
  await page.getByRole('heading', { name: 'Как давно вы занимаетесь?' }).waitFor();
  await page.reload(); await page.getByRole('heading', { name: 'Как давно вы занимаетесь?' }).waitFor();
  assert.equal(await radio(page, 'Только начинаю').getAttribute('aria-checked'), 'true');
  await next(page).click(); await radio(page, 'В зале').click(); await radio(page, 'Два раза').click();
  await page.getByRole('heading', { name: /Ваш план готов/ }).waitFor();
  await page.locator('.ob-macro').first().waitFor();
  mkdirSync(join(ROOT, '../reports/ft-577'), { recursive: true });
  await page.screenshot({ path: join(ROOT, '../reports/ft-577/plan-390.png'), fullPage: true });
  await next(page).click();
  await page.getByRole('heading', { name: 'Программа под вашу цель' }).waitFor();
  assert.equal(await page.locator('.ob__error').count(), 0, 'ответы сохранились без ошибки');
  await page.locator('.ob-program').first().waitFor();
  assert.equal(await page.locator('.ob-program').count(), 3);
  assert.equal(await next(page).isDisabled(), true);
  // Занятия без повторов; все упражнения — в нижнем окне, выбор оттуда же
  assert.equal(await page.locator('.ob-program').first().locator('.ob-session').count(), 2);
  await page.locator('.ob-session').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Выбрать эту программу' }).click();
  // Уходящий лист уже скрыт от читалки (FT-643) — ждём, пока он уйдёт из DOM
  await page.locator('.sheet').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.ob-program__pick').first().getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: 'Начать по этой программе' }).click();
  await page.getByRole('heading', { name: /Всё готово/ }).waitFor();
  await page.screenshot({ path: join(ROOT, '../reports/ft-577/done-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  // Плашка цели — только в «Прогрессе» (21.10.2026)
  await page.getByRole('button', { name: 'Прогресс', exact: true }).last().click();
  await page.getByRole('region', { name: 'Ваша цель' }).first().waitFor();
  assert.deepEqual(errors, []); await page.close();
});
test('без данных о теле: обмен, активность, темп и план пропускаются — сразу программы', async () => {
  const page = await open();
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Поехали' }).click();
  await page.getByRole('button', { name: /Пропустить/ }).click();
  await radio(page, 'Похудеть').click();
  await radio(page, 'Только начинаю').click();
  assert.equal(await page.getByRole('dialog').count(), 0, 'без данных о теле темп не спрашиваем');
  await radio(page, 'Дома').click(); await radio(page, 'Три раза').click();
  await page.getByRole('heading', { name: 'Программа под вашу цель' }).waitFor();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('heading', { name: 'Сколько раз в неделю?' }).waitFor();
  await page.close();
});
test('выключение на проде закрывает открытую анкету при возврате; без флага прежний кабинет', async () => {
  const page = await open(); await page.getByRole('button', { name: 'Поехали' }).waitFor();
  await page.evaluate(() => { localStorage.setItem('fittrack_demo_onboarding_off', '1'); window.dispatchEvent(new Event('focus')); });
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  assert.equal(await page.locator('.onboarding').count(), 0); await page.close();
  const old = await open(390, false); await old.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  assert.equal(await old.locator('.onboarding').count(), 0); await old.close();
});
test('мобильный и широкий экран: без переполнения, крупный текст и уменьшение движения', async () => {
  const shots = join(ROOT, '../reports/ft-577'); mkdirSync(shots, { recursive: true });
  for (const width of [390, 1280]) {
    const page = await open(width); await page.getByRole('checkbox').waitFor();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Поехали' }).click();
    await page.getByRole('radio', { name: /Мужской/ }).waitFor();
    await page.screenshot({ path: join(shots, `question-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.close();
  }
});

test('выключатель владельца доступен в настройках; обычному тренеру не показывается', async () => {
  const page = await open();
  await page.goto(origin + '?mockRole=trainer&mockOnboarding=1');
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /^Настройки/ }).click();
  const off = page.getByRole('button', { name: 'Выключить анкету для всех' });
  await off.waitFor();
  await page.screenshot({ path: join(ROOT, '../reports/ft-577/owner-390.png'), fullPage: true });
  await off.click(); await page.getByText('Анкета выключена', { exact: true }).waitFor();
  await page.goto(origin + '?mockRole=trainer&mockCoach=1');
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /^Настройки/ }).click();
  assert.equal(await page.getByRole('button', { name: 'Выключить анкету для всех' }).count(), 0);
  await page.close();
});

test('«Мои данные»: цель и график меняются, программа заменяется только по нажатию (FT-582)', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('auth_token_v1', 'demo-onboarding-token');
    localStorage.setItem('fittrack_demo_onboarding', JSON.stringify({ step: 8, revision: 3, consentNeeded: false, completed: true,
      selectedTitle: 'Старт в зале', answers: { goal: 'fitness', experience: 'beginner', place: 'gym', days: 2 } }));
  });
  await page.goto(origin + '?mockUnlinked=1&mockOnboarding=1');
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /Мои данные/ }).click();
  const goal = page.getByRole('radiogroup', { name: 'Цель' });
  await goal.waitFor();
  assert.equal(await goal.getByRole('radio', { name: 'Быть в форме' }).getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('.goal-choice .ob-program').count(), 0, 'программа подходит — подбирать нечего');
  await goal.getByRole('radio', { name: 'Набрать мышцы' }).click();
  await page.getByRole('radiogroup', { name: 'Сколько раз в неделю?' }).getByRole('radio', { name: 'Три раза' }).click();
  await page.locator('.goal-choice').getByRole('button', { name: 'Сохранить' }).click();
  await page.getByText(/ниже варианты под новые/).waitFor();
  const replace = page.getByRole('button', { name: 'Выберите программу' });
  assert.equal(await replace.isDisabled(), true, 'без выбора ничего не заменяется');
  await page.locator('.goal-choice .ob-program__pick').first().click();
  mkdirSync(join(ROOT, '../reports/ft-582'), { recursive: true });
  await page.screenshot({ path: join(ROOT, '../reports/ft-582/profile-390.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Заменить программу' }).click();
  await page.getByText(/в разделе «Тренировки»/).waitFor();
  assert.equal(await page.locator('.goal-choice .ob-program').count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});
