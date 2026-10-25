import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Еда по фото (FT-736) в демо-сборке: плитка → подсказка → снимок → список
// (без камеры в браузере) и AI-сканер (FT-746): видоискатель → кадр → список.
// с правкой граммов → записи в дневнике. Ответ модели — заготовка diary-mock.js.
const root = fileURLToPath(new URL('..', import.meta.url)), out = join(root, 'dist-plate'), shots = join(root, '.impeccable/review');
let browser, server, origin;
before(async () => {
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out], { cwd: root, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
  server = createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]), file = join(out, name === '/' ? 'index.html' : name);
    const target = existsSync(file) && extname(file) ? file : join(out, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }); res.end(readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  // Камера-заглушка Chromium: видоискатель сканера получает живое видео
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  mkdirSync(shots, { recursive: true });
}, { timeout: 180000 });
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

test('FT-736: фото тарелки → проверка граммов → записи «по фото» в дневнике', { timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  const pageErrors = [], sent = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  // FT-744: сканер — первым в листе «Добавить еду» и главной кнопкой под итогом дня; FT-746: с «AI»
  await page.getByRole('button', { name: 'Добавить в обед', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Сканер еды AI/ }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, 'ft736-picker.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).first().click();
  await page.waitForTimeout(400);
  // Камеры в браузере нет — запасной лист с подсказкой «как снять» и снимком
  await page.evaluate(() => { const md = navigator.mediaDevices; window.__gum = md.getUserMedia.bind(md); md.getUserMedia = () => Promise.reject(Object.assign(new Error('нет камеры'), { name: 'NotFoundError' })); });
  await page.locator('.diary-add').getByRole('button', { name: /Сканер еды/ }).click();
  const sheet = page.getByRole('dialog', { name: /AI-распознавание/ });
  await sheet.getByText('Положите рядом вилку или ложку').waitFor();
  await page.screenshot({ path: join(shots, 'ft736-guide.png') });

  // Снимок «камерой»: JPEG, нарисованный здесь же
  const jpeg = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
    const x = c.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 1600, 1200);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(700, 600, 450, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#8a5a2b'; x.beginPath(); x.arc(600, 520, 180, 0, Math.PI * 2); x.fill();
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  const plate = { name: 'plate.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') };
  await sheet.getByLabel('Снять тарелку').setInputFiles(plate);
  const list = sheet.getByRole('list', { name: 'Распознанные блюда' });
  await list.waitFor();
  assert.equal(await list.getByRole('listitem').count(), 3);
  await sheet.getByLabel('Граммы: Котлета куриная').fill('150');
  // Приём угадан по часам — меняется до записи
  await sheet.getByRole('group', { name: 'Куда записать' }).getByRole('button', { name: 'Обед' }).click();
  await sheet.getByRole('button', { name: 'Убрать Огурец свежий' }).click();
  assert.equal(await list.getByRole('listitem').count(), 2);
  await page.screenshot({ path: join(shots, 'ft736-result.png'), fullPage: false });
  await sheet.getByRole('button', { name: /^Добавить \d+ ккал$/ }).click();
  await page.getByText(/По фото записано: \d+ ккал, 2 блюда/).waitFor();
  await page.getByText('Котлета куриная, ~150 г').first().waitFor();
  const lunch = await page.locator('.diary-meal').filter({ has: page.getByRole('heading', { name: 'Обед' }) }).innerText();
  assert.match(lunch, /Котлета куриная/, 'записано в выбранный приём');

  // FT-746: камера есть — видоискатель во весь экран, кадр без кнопки «снять»; здесь — «Распознать сейчас»
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.__gum; });
  await page.locator('.diary-add').getByRole('button', { name: /Сканер еды/ }).click();
  const scanner = page.getByRole('dialog', { name: 'AI-сканер еды' });
  await scanner.getByRole('status').filter({ hasNotText: 'Включаем камеру' }).waitFor();
  await page.screenshot({ path: join(shots, 'ft746-scanner.png') });
  await scanner.getByRole('button', { name: 'Распознать сейчас' }).click();
  const again = page.getByRole('dialog', { name: /AI-распознавание/ });
  await again.getByRole('list', { name: 'Распознанные блюда' }).waitFor();
  assert.equal(await page.locator('.plate-scan').count(), 0, 'видоискатель закрыт, камера выключена');
  // «Сканировать снова» — обратно в видоискатель
  await again.getByRole('button', { name: 'Сканировать снова' }).click();
  await scanner.waitFor();
  await scanner.getByRole('button', { name: 'Закрыть сканер' }).click();
  await scanner.waitFor({ state: 'detached' });
  await again.waitFor({ state: 'detached' });

  // Неподвижная тарелка в кадре — снимается сама, без единого нажатия
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const x = c.getContext('2d'); x.fillStyle = '#c9c3b8'; x.fillRect(0, 0, 640, 480);
      x.fillStyle = '#fff'; x.beginPath(); x.arc(320, 240, 190, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#8a5a2b'; x.beginPath(); x.arc(270, 210, 80, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#3c8d2f'; x.fillRect(330, 250, 90, 60);
      const stream = c.captureStream(10);
      setInterval(() => { x.fillStyle = '#c9c3b8'; x.fillRect(0, 0, 1, 1); }, 100);
      return stream;
    };
  });
  await page.locator('.diary-add').getByRole('button', { name: /Сканер еды/ }).click();
  await page.getByRole('dialog', { name: /AI-распознавание/ }).getByRole('list', { name: 'Распознанные блюда' }).waitFor({ timeout: 15000 });
  assert.deepEqual(pageErrors, []);
  void sent;
});
