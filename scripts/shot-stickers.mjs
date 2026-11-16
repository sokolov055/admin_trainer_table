// Скриншоты «Управление → Контент → Стикеры» (16.11.2026): предпросмотр файла,
// добавление, долгое нажатие — выделение, удаление; консоль без ошибок
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot');
execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
  const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
  res.end(readFileSync(target));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const file = JSON.stringify({ format: 'fittrack-stickers', name: 'Проба', stickers: [
  { id: 'hipBelt', name: 'Пояс на бёдра', group: 'machine', kw: 'пояс ремень', re: '', svg: '<path class="n" d="M6 44h36"/><g class="m"><rect class="a f" x="10" y="22" width="28" height="7" rx="3.5"/></g>', css: '.stk-hipBelt .m{animation-name:stk-k-hipBelt}@keyframes stk-k-hipBelt{0%{transform:translateY(-8px)}60%,100%{transform:none}}' },
  { id: 'seat', name: 'Сиденье', svg: '<rect class="n" x="4" y="4" width="10" height="10"/>' },
] });
const browser = await chromium.launch();
const errors = [];
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  await page.getByRole('button', { name: /меню/i }).first().click({ timeout: 10000 });
  await page.getByRole('button', { name: /Управление/ }).first().click({ timeout: 10000 });
  await page.getByText('Контент', { exact: true }).first().click({ timeout: 10000 });
  await page.getByText('Стикеры', { exact: true }).first().click({ timeout: 10000 });
  await page.locator('.ast-st').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DEST}-tab-${scheme}.png` });
  await page.locator('input[type=file]').setInputFiles({ name: 'stickers.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await page.getByRole('button', { name: /^Добавить 1/ }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DEST}-preview-${scheme}.png` });
  await page.getByRole('button', { name: /^Добавить 1/ }).click();
  await page.getByText('Добавлено: 1').waitFor({ timeout: 5000 });
  try { await page.locator('.ast-pack .ast-st', { hasText: 'Пояс на бёдра' }).waitFor({ timeout: 3000 }); } catch (_) { errors.push(scheme + ': новый не в паке'); }
  // Долгое нажатие на первый — выделение, затем отметить второй
  const tiles = page.locator('.ast-pack .ast-st');
  const total = await tiles.count();
  const box = await tiles.nth(0).boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await tiles.nth(1).click();
  await page.getByRole('button', { name: 'Удалить 2' }).waitFor({ timeout: 3000 });
  await page.screenshot({ path: `${DEST}-select-${scheme}.png` });
  await page.getByRole('button', { name: 'Удалить 2' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DEST}-confirm-${scheme}.png` });
  await page.locator('.confirm').getByRole('button', { name: 'Удалить' }).click();
  await page.getByText(/^Стикерпак · /).waitFor({ timeout: 3000 });
  await page.waitForTimeout(300);
  const after = await page.locator('.ast-pack .ast-st').count();
  if (after !== total - 2) errors.push(`${scheme}: было ${total}, стало ${after}`);
  await page.close();
}
await browser.close();
server.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('ok');
