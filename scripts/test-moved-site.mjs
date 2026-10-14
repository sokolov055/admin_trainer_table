/**
 * Страницы-указатели прежнего адреса (scripts/build-moved-site.mjs) в
 * настоящем браузере: документ уходит на новый адрес как есть, вошедший —
 * с одноразовым билетом и без старого ключа, старое Android-приложение
 * видит «Обновите приложение». Сеть подменена: ни GitHub, ни сервер не
 * трогаются.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { movedPage } from './build-moved-site.mjs';

const OLD = 'https://sokolov055.github.io/admin_trainer_table';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { if (browser) await browser.close(); });

async function open(path, { token = '', native = false, standalone = false, ticket = 'T'.repeat(43) } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls = [];
  await context.route('https://sokolov055.github.io/**', (route) => route.fulfill({ contentType: 'text/html', body: movedPage() }));
  await context.route('https://app.fitness100.ru/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>new</p>' }));
  await context.route('https://api.fitness100.ru/**', async (route) => {
    calls.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, data: { ticket } }) });
  });
  await context.addInitScript(({ token, native, standalone }) => {
    if (location.host !== 'sokolov055.github.io') return;
    if (token && !localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('auth_token_v1', token); }
    if (native) window.Capacitor = { isNativePlatform: () => true };
    if (standalone) Object.defineProperty(navigator, 'standalone', { value: true });
  }, { token, native, standalone });
  await page.goto(OLD + path);
  return { context, page, calls };
}

test('документ без входа уходит на тот же путь нового адреса', async () => {
  const { context, page, calls } = await open('/privacy.html?x=1');
  await page.waitForURL('https://app.fitness100.ru/**');
  assert.equal(page.url(), 'https://app.fitness100.ru/privacy.html?x=1');
  assert.equal(calls.length, 0);
  await context.close();
});

test('вошедший переносит вход одноразовым билетом, старый ключ стирается', async () => {
  const { context, page, calls } = await open('/?access=abc', { token: 'old-token' });
  await page.waitForURL('https://app.fitness100.ru/**');
  assert.equal(page.url(), 'https://app.fitness100.ru/?access=abc#loginTicket=' + 'T'.repeat(43));
  assert.deepEqual(calls, [{ action: 'auth.install.create', initData: '', token: 'old-token' }]);
  const back = await context.newPage();
  await back.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<p>old</p>' }));
  await back.goto(OLD + '/support.html');
  assert.equal(await back.evaluate(() => localStorage.getItem('auth_token_v1')), null);
  await context.close();
});

test('сервер не выдал билет — обычный переход без входа', async () => {
  const { context, page } = await open('/', { token: 'old-token', ticket: '' });
  await page.waitForURL('https://app.fitness100.ru/**');
  assert.equal(page.url(), 'https://app.fitness100.ru/');
  await context.close();
});

test('старое Android-приложение видит «Обновите приложение» и ссылку на APK', async () => {
  const { context, page } = await open('/', { native: true, token: 'old-token' });
  await page.getByRole('heading', { name: 'Обновите приложение' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Скачать новую версию' }).getAttribute('href'), 'https://api.fitness100.ru/android/fit-track.apk');
  assert.ok(page.url().startsWith(OLD));
  await context.close();
});

test('старая иконка на экране «Домой»: сначала инструкция, переход — по кнопке', async () => {
  const { context, page, calls } = await open('/', { token: 'old-token', standalone: true });
  await page.getByRole('heading', { name: 'Обновите иконку' }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  assert.ok(page.url().startsWith('https://sokolov055.github.io/'), 'молча не уходит');
  assert.equal(calls.length, 0);
  await page.getByRole('link', { name: 'Открыть Fit Track сейчас' }).click();
  await page.waitForURL('https://app.fitness100.ru/**');
  assert.equal(page.url(), 'https://app.fitness100.ru/#loginTicket=' + 'T'.repeat(43));
  await context.close();
});
