// Скриншот списка клиентов со сплитом (скобка «сплит») — для глазной проверки
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
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: scheme });
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  await page.getByRole('tab', { name: /^Сплиты · / }).click({ timeout: 10000 });
  await page.waitForTimeout(500);
  const group = page.locator('.split-group').first();
  await group.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DEST}-${scheme}.png` });
  await group.locator('.item').nth(1).click();
  await page.waitForTimeout(600);
  const more = page.getByRole('button', { name: 'Подробнее' });
  if (await more.count()) await more.first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DEST}-card-${scheme}.png`, fullPage: false });
  const block = page.locator('.client-split').first();
  if (await block.count()) {
    await block.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DEST}-payer-${scheme}.png`, fullPage: false });
  }
  await page.close();
}
await browser.close();
server.close();
console.log('ok');
