// Скриншоты итогов недели и месяца (FT-493) — для глазной проверки: блок
// «Итоги» в «Прогрессе» (неделя, месяц, прошлый период) и личные истории
// «Моя неделя» на обзоре
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: scheme, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/');

  // Истории: ряд кружков и три кадра «Моей недели»
  const week = page.getByRole('button', { name: /Моя неделя/ });
  await week.waitFor({ timeout: 10000 });
  await page.screenshot({ path: `${DEST}-row-${scheme}.png` });
  await week.click();
  await page.waitForTimeout(400);
  for (let i = 1; i <= 3; i += 1) {
    await page.screenshot({ path: `${DEST}-story${i}-${scheme}.png` });
    await page.mouse.click(330, 500);
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Блок «Итоги»
  await page.getByRole('button', { name: 'Прогресс' }).last().click({ timeout: 10000 });
  const box = page.locator('.summary').first();
  await box.waitFor({ timeout: 10000 });
  await box.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DEST}-week-${scheme}.png` });
  await page.getByRole('button', { name: 'Неделей раньше' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DEST}-lastweek-${scheme}.png` });
  await page.getByRole('radio', { name: 'Месяц' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DEST}-month-${scheme}.png` });
  await page.close();
}
await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
