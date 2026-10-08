// Скриншоты входа по телефону (FT-489): вкладка, звонок, код из СМС — по
// кадрам сцены проверки (ряд → круг → зелёные → точка → галочка)
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (name) => page.screenshot({ path: `${DEST}-${name}.png` });

await page.goto(origin + '/');
await page.getByRole('radio', { name: 'Телефон' }).click({ timeout: 10000 });
await page.getByLabel('Телефон').fill('9255070602');
await shot('1-phone');
await page.getByRole('button', { name: 'Подтвердить звонком' }).click();
await page.waitForTimeout(700);
await shot('2-call-wait');
await page.waitForTimeout(6000);
await shot('3-call-name');

// Код из СМС: с начала
await page.goto(origin + '/');
await page.getByRole('radio', { name: 'Телефон' }).click();
await page.getByLabel('Телефон').fill('9255070602');
await page.getByRole('button', { name: 'Прислать код в СМС' }).click();
await page.waitForTimeout(400);
await page.getByLabel('Код из СМС').pressSequentially('123', { delay: 80 });
await shot('4-code-typing');
await page.getByLabel('Код из СМС').pressSequentially('999', { delay: 80 });
await page.waitForTimeout(250);
await shot('5-code-wrong');
await page.waitForTimeout(900);
await page.getByLabel('Код из СМС').pressSequentially('123456', { delay: 60 });
for (const ms of [120, 260, 420, 650, 900, 1300]) {
  await page.waitForTimeout(ms - (ms > 120 ? [120, 260, 420, 650, 900, 1300][[120, 260, 420, 650, 900, 1300].indexOf(ms) - 1] : 0));
  await shot('6-anim-' + ms);
}
await page.waitForTimeout(900);
await shot('7-after');
// «Мои данные» → «Вход по телефону»
await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
await page.goto(origin + '/');
await page.getByRole('button', { name: 'Меню' }).click({ timeout: 10000 });
await page.getByText('Мои данные').click();
await page.locator('.phone-setting').waitFor({ timeout: 10000 });
await shot('8-profile');
await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
