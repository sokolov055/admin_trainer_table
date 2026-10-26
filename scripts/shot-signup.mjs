// Скриншоты регистрации по номеру (FT-769) по демо-сборке: вкладки,
// код из СМС, почта, «Нашли ваш кабинет», выбор «тренер / сам», имя и
// согласия, вход «Номер или почта». node scripts/shot-signup.mjs <префикс>
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
const fresh = async (scheme = 'light') => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(origin + '/?mockSignup=1');
  return page;
};
const shot = (page, name) => page.screenshot({ path: `${DEST}-${name}.png` });
const code = async (page, label, value) => {
  await page.getByLabel(label).pressSequentially(value, { delay: 40 });
  await page.waitForTimeout(2600);
};

// Новый: номер → код → почта (найден кабинет) → «Нет, завести новый» → сам → имя
let page = await fresh();
await page.getByLabel('Номер телефона').waitFor({ timeout: 15000 });
await page.getByLabel('Номер телефона').fill('9164821507');
await page.waitForTimeout(900);
await shot(page, '1-signup');
await page.getByRole('button', { name: 'Получить код' }).click();
await page.waitForTimeout(500);
await shot(page, '2-sms');
await code(page, 'Код из СМС', '123456');
await shot(page, '3-email');
await page.getByLabel('Почта').fill('anna@mail.ru');
await page.getByRole('button', { name: 'Получить код' }).click();
await page.waitForTimeout(500);
await code(page, 'Код из письма', '123456');
await shot(page, '4-found');
await page.getByRole('button', { name: 'Нет, завести новый' }).click();
await page.waitForTimeout(300);
await shot(page, '5-start');
await page.getByRole('button', { name: /У меня есть тренер/ }).click();
await page.getByLabel('Ссылка или код').fill('https://app.fitness100.ru/?trainer=AbCdEf123456');
await page.getByRole('button', { name: 'Проверить' }).click();
await page.waitForTimeout(400);
await shot(page, '6-trainer');
await page.getByRole('button', { name: 'Подключиться' }).click();
await page.getByLabel('Имя').fill('Анна');
await page.waitForTimeout(700);
await shot(page, '7-name');
await page.close();

// Вход: «Номер или почта» — почтой
page = await fresh('dark');
await page.getByRole('radio', { name: 'Вход' }).click({ timeout: 15000 });
await page.getByLabel('Номер или почта').fill('back@mail.ru');
await page.waitForTimeout(900);
await shot(page, '8-signin-dark');
await page.getByRole('button', { name: 'Получить код' }).click();
await page.waitForTimeout(800);
await shot(page, '9-signin-mailcode');
await page.close();

// Без СМС у сервера — прежний экран
page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
await page.goto(origin + '/');
await page.getByRole('heading', { name: 'Войти или создать кабинет' }).waitFor({ timeout: 15000 });
await shot(page, '10-old');

await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
