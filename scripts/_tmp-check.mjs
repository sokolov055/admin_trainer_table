import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
const S = process.env.S;
const OUT = 'dist-demo';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const f = p === '/' ? join(OUT, 'index.html') : join(OUT, p); const t = existsSync(f) && extname(f) ? f : join(OUT, 'index.html'); res.writeHead(200, { 'Content-Type': T[extname(t)] || 'application/octet-stream' }); res.end(readFileSync(t)); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
try {
  const t = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  await t.goto(origin + '/?mockRole=trainer');
  await t.evaluate(() => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.setItem('app_theme_v1', 'dark'); });
  await t.goto(origin + '/?mockRole=trainer');
  await t.locator('#root main:not([hidden]) .item').first().click({ timeout: 10000 });
  await t.getByRole('tab', { name: 'Тренировки' }).first().click();
  await t.getByRole('button', { name: 'Изменить программу' }).click();
  await t.waitForTimeout(800);
  await t.evaluate(() => window.scrollBy(0, 900));
  await t.waitForTimeout(300);
  await t.screenshot({ path: S + '/pe-mid.png' });
  await t.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await t.waitForTimeout(300);
  await t.screenshot({ path: S + '/pe-end.png' });
} catch (e) { console.log('ERR', e.message.slice(0, 300)); }
await browser.close(); server.close();
