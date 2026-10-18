// Скриншоты «Управление → Истории» (FT-615) — для глазной проверки: вкладка,
// раскрытый кадр, новый кадр, превью, сохранение и новый кадр у клиента
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot');
execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = path === '/' ? join(OUT, 'index.html') : join(OUT, path);
  const target = existsSync(file) && extname(file) ? file : join(OUT, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
  res.end(readFileSync(target));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
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
  await page.getByText('Истории', { exact: true }).first().click({ timeout: 10000 });
  await page.getByText('Заголовок над кадром').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DEST}-tab-${scheme}.png` });

  // Раскрыть первый кадр «Что нового»
  await page.locator('.admin-stories__frame-title').first().click();
  await page.waitForTimeout(300);
  await page.locator('.admin-stories__frame--open').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DEST}-frame-${scheme}.png`, fullPage: true });

  // Новый кадр: заголовок и текст, превью
  await page.getByRole('button', { name: 'Новый кадр' }).first().click();
  await page.locator('.admin-stories__frame--open input.field__input').first().fill('Дневник питания');
  await page.locator('.admin-stories__frame--open textarea').first().fill('Откройте «Питание» → «Дневник»: запишите, что съели, — приложение посчитает калории и белок.');
  // Своя картинка: широкая, с прозрачным фоном — как нарисует Claude
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d'); g.fillStyle = '#7fd97f'; g.beginPath(); g.arc(320, 180, 140, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a1a1a'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.fillText('Дневник', 320, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('.admin-stories__frame--open input[type=file]').setInputFiles({ name: 'diary.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('radio', { name: 'Своя картинка' }).waitFor({ timeout: 10000 });
  await page.locator('.admin-stories__frame--open').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DEST}-new-${scheme}.png` });
  await page.locator('.admin-stories__frame--open').getByRole('button', { name: 'Посмотреть' }).click();
  await page.locator('.story').waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DEST}-preview-${scheme}.png` });
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'Сохранить для всех' }).click();
  await page.getByText('Сохранено.').waitFor({ timeout: 10000 });
  await page.getByText('Сохранено.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DEST}-saved-${scheme}.png` });

  // Ширина: без горизонтальной прокрутки страницы
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) errors.push(`${scheme}: горизонтальная прокрутка ${overflow}px`);
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
