// Скриншоты «Управление → Истории» (FT-615) — для глазной проверки: вкладка
// с миниатюрами, редактор, новый текст, наклейка, перетаскивание, просмотр,
// сохранение и новый кадр в кружке у тренера
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
const browser = await chromium.launch();
const errors = [];
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: scheme, hasTouch: false });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  await page.getByRole('button', { name: /меню/i }).first().click({ timeout: 10000 });
  await page.getByRole('button', { name: /Управление/ }).first().click({ timeout: 10000 });
  // С 24.10.2026 подразделы — по группам: «Контент» → «Истории»
  await page.getByText('Контент', { exact: true }).first().click({ timeout: 10000 });
  await page.getByText('Истории', { exact: true }).first().click({ timeout: 10000 });
  await page.locator('.admin-stories__thumb').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DEST}-tab-${scheme}.png` });
  if (await page.getByRole('button', { name: 'Сохранить для всех' }).count()) errors.push(`${scheme}: открытие панели считается правкой`);

  // Редактор с первого кадра «Что нового»
  await page.locator('.admin-stories__thumb').first().click();
  await page.locator('.se-cv').waitFor({ timeout: 10000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DEST}-editor-${scheme}.png` });

  // Новый кадр и текст на нём
  await page.locator('.se-th-add').click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Текст', exact: true }).click();
  await page.locator('.se-ed .sc-tx').waitFor();
  await page.keyboard.type('Дневник питания');
  await page.getByRole('button', { name: 'Крупный' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DEST}-text-${scheme}.png` });
  await page.getByRole('button', { name: 'Готово' }).click();

  // Кнопка раздела
  await page.getByRole('button', { name: 'Наклейки', exact: true }).click();
  await page.getByRole('button', { name: /Кнопка раздела/ }).click();
  await page.getByRole('button', { name: /^Питание/ }).click();
  await page.waitForTimeout(300);

  // Перетащить текст ниже — мышью
  const text = page.locator('.se-cv .sc-text').first();
  const tb = await text.boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2 + 60, { steps: 6 });
  await page.screenshot({ path: `${DEST}-drag-${scheme}.png` });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const tb2 = await text.boundingBox();
  if (Math.abs(tb2.y - tb.y - 60) > 4) errors.push(`${scheme}: текст не сдвинулся (${tb.y} → ${tb2.y})`);
  await page.screenshot({ path: `${DEST}-frame-${scheme}.png` });

  // Отменить и вернуть перетаскивание
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  const tb3 = await text.boundingBox();
  if (Math.abs(tb3.y - tb.y) > 4) errors.push(`${scheme}: «Отменить» не вернул текст`);
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();

  // Просмотр как у клиента
  await page.getByRole('button', { name: /Посмотреть, как увидит/ }).click();
  await page.locator('.story--canvas').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DEST}-preview-${scheme}.png` });
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.waitForTimeout(300);

  // Сохранить из редактора
  await page.locator('.se-save').click();
  await page.getByText(/Сохранено\. Люди увидят/).first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${DEST}-saved-${scheme}.png` });
  await page.getByRole('button', { name: 'Закрыть редактор' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DEST}-after-${scheme}.png`, fullPage: true });

  // Инструкция после сохранения — кадр, переведённый из старого вида
  await page.getByRole('button', { name: 'Посмотреть' }).nth(1).click();
  await page.locator('.story--canvas').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DEST}-guide-${scheme}.png` });
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.waitForTimeout(300);

  // Ширина: без горизонтальной прокрутки страницы
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) errors.push(`${scheme}: горизонтальная прокрутка ${overflow}px`);
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
