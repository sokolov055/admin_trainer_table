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
const next = (page) => page.getByRole('button', { name: 'Далее', exact: true });
async function answer(page, label) { await page.getByRole('button', { name: new RegExp('^' + label) }).click(); await next(page).click(); }
test('анкета: согласие, назад, прерывание, выбор программы и продолжение без питания', async () => {
  const page = await open(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const confirm = page.getByRole('button', { name: 'Подтвердить и продолжить' });
  await confirm.waitFor(); assert.equal(await confirm.isDisabled(), true);
  await page.getByRole('checkbox').check(); await confirm.click();
  assert.equal(await next(page).isDisabled(), true);
  await answer(page, 'Быть в форме');
  await page.getByRole('button', { name: 'Начинаю' }).click();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /^Быть в форме/ }).getAttribute('aria-pressed'), 'true');
  await next(page).click();
  assert.equal(await page.getByRole('button', { name: /^Начинаю/ }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Продолжить позже' }).click();
  await page.getByRole('button', { name: 'Продолжить подбор программы' }).click();
  await page.getByRole('heading', { name: 'Как давно вы занимаетесь?' }).waitFor();
  await page.reload(); await page.getByRole('heading', { name: 'Как давно вы занимаетесь?' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Начинаю/ }).getAttribute('aria-pressed'), 'true');
  await next(page).click(); await answer(page, 'В зале'); await answer(page, 'Два раза');
  await page.getByRole('heading', { name: 'Выберите программу', exact: true }).waitFor();
  mkdirSync(join(ROOT, '../reports/ft-552'), { recursive: true });
  await page.screenshot({ path: join(ROOT, '../reports/ft-552/programs-390.png'), fullPage: true });
  assert.equal(await page.getByRole('button', { name: 'Выбрать эту программу' }).count(), 3);
  await page.getByRole('button', { name: 'Выбрать эту программу' }).first().click();
  await page.getByRole('button', { name: 'Начать по этой программе' }).click();
  await page.getByRole('heading', { name: 'Программа готова' }).waitFor();
  await page.screenshot({ path: join(ROOT, '../reports/ft-552/result-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Перейти к занятиям' }).click();
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  assert.deepEqual(errors, []); await page.close();
});
test('выключение на проде закрывает открытую анкету при возврате; без флага прежний кабинет', async () => {
  const page = await open(); await page.getByRole('button', { name: 'Подтвердить и продолжить' }).waitFor();
  await page.evaluate(() => { localStorage.setItem('fittrack_demo_onboarding_off', '1'); window.dispatchEvent(new Event('focus')); });
  await page.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  assert.equal(await page.locator('.onboarding').count(), 0); await page.close();
  const old = await open(390, false); await old.getByRole('button', { name: 'Тренировки', exact: true }).waitFor();
  assert.equal(await old.locator('.onboarding').count(), 0); await old.close();
});
test('мобильный и широкий экран: без переполнения, крупный текст и уменьшение движения', async () => {
  const shots = join(ROOT, '../reports/ft-552'); mkdirSync(shots, { recursive: true });
  for (const width of [390, 1280]) {
    const page = await open(width); await page.getByRole('checkbox').waitFor();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Подтвердить и продолжить' }).click();
    await page.getByRole('button', { name: /^Быть в форме/ }).waitFor();
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
  await page.screenshot({ path: join(ROOT, '../reports/ft-552/owner-390.png'), fullPage: true });
  await off.click(); await page.getByText('Анкета выключена', { exact: true }).waitFor();
  await page.goto(origin + '?mockRole=trainer&mockCoach=1');
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: /^Настройки/ }).click();
  assert.equal(await page.getByRole('button', { name: 'Выключить анкету для всех' }).count(), 0);
  await page.close();
});
