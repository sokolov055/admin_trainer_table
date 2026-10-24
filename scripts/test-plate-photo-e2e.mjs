import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Еда по фото (FT-736) в демо-сборке: плитка → подсказка → снимок → список
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
  browser = await chromium.launch();
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
  await page.getByRole('button', { name: 'Добавить в обед', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Фото блюда', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: /Еда по фото/ });
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
  await sheet.getByLabel('Снять тарелку').setInputFiles({ name: 'plate.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  const list = sheet.getByRole('list', { name: 'Распознанные блюда' });
  await list.waitFor();
  assert.equal(await list.getByRole('listitem').count(), 3);
  await sheet.getByLabel('Граммы: Котлета куриная').fill('150');
  await sheet.getByRole('button', { name: 'Убрать Огурец свежий' }).click();
  assert.equal(await list.getByRole('listitem').count(), 2);
  await page.screenshot({ path: join(shots, 'ft736-result.png'), fullPage: false });
  await sheet.getByRole('button', { name: /^Добавить \d+ ккал$/ }).click();
  await page.getByText(/По фото записано: \d+ ккал, 2 блюда/).waitFor();
  await page.getByText('Котлета куриная, ~150 г').first().waitFor();
  assert.deepEqual(pageErrors, []);
  void sent;
});
