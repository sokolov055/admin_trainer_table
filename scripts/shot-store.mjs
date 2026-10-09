// Экраны для карточек App Store: демо-сборка, iPhone 6,9" (440×894 pt × 3 —
// без строки состояния 62 pt, её дорисовывает сборщик карточек). Кадры — в
// каталог из первого аргумента, тема — вторым (light/dark), третьим — набор
// сцен через запятую (client,nutrition,trainer; по умолчанию все).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot-store');
const THEME = process.argv[3] || 'light';
const SCENES = (process.argv[4] || 'client,nutrition,trainer').split(',');
mkdirSync(DEST, { recursive: true });
if (!process.env.SKIP_BUILD) execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
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

async function open(query = '') {
  const page = await browser.newPage({
    viewport: { width: 440, height: 894 }, deviceScaleFactor: 3, locale: 'ru-RU',
    colorScheme: THEME, reducedMotion: 'reduce', hasTouch: true, isMobile: true,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin + '/' + query);
  await page.evaluate((theme) => {
    localStorage.setItem('auth_token_v1', 'demo-session');
    localStorage.setItem('app_theme_v1', theme);
  }, THEME);
  await page.goto(origin + '/' + query);
  await page.waitForTimeout(1500);
  return page;
}
const shooter = (page) => async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(DEST, `${name}.png`) });
  console.log('shot', name);
};
const step = async (name, fn) => { try { await fn(); } catch (e) { errors.push(`${name}: ${e.message.split('\n')[0]}`); } };
const tab = (page, name) => page.getByRole('button', { name, exact: true }).last();
const top = (page) => page.evaluate(() => window.scrollTo(0, 0));

if (SCENES.includes('client')) {
  const page = await open();
  const shot = shooter(page);
  await shot('c-home');
  await step('progress', async () => {
    await tab(page, 'Прогресс').click({ timeout: 10000 });
    await page.locator('.goals').first().waitFor({ timeout: 10000 });
    await top(page);
    await shot('c-progress-top');
    await page.locator('.goals').first().scrollIntoViewIfNeeded();
    await shot('c-goals');
    await page.locator('.goals__toggle').click();
    await page.locator('.awards').scrollIntoViewIfNeeded();
    await shot('c-awards');
    await page.locator('.summary').first().scrollIntoViewIfNeeded();
    await shot('c-summary');
    const m = page.locator('.summary__muscles-title').first();
    if (await m.count()) { await m.scrollIntoViewIfNeeded(); await shot('c-summary-muscles'); }
    await page.evaluate(() => window.scrollBy(0, 900));
    await shot('c-weight');
    await page.evaluate(() => window.scrollBy(0, 900));
    await shot('c-measures');
  });
  await step('training', async () => {
    await tab(page, 'Тренировки').click({ timeout: 10000 });
    await page.waitForTimeout(800);
    await top(page);
    await shot('c-trainings');
    await page.getByRole('button', { name: 'Начать тренировку' }).first().click({ timeout: 10000 });
    await page.waitForTimeout(1200);
    await shot('c-workout');
    const set = page.locator('.workout__set').first();
    const boxes = set.getByRole('textbox');
    if (!(await boxes.nth(1).inputValue())) await boxes.nth(1).fill('8');
    await page.locator('.workout__effort-btn--easy').first().click();
    await page.locator('.rest-screen').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot('c-rest');
    await page.getByRole('button', { name: 'Свернуть таймер' }).click();
    await shot('c-workout-after');
  });
  await page.close();
}

if (SCENES.includes('nutrition')) {
  const page = await open();
  const shot = shooter(page);
  await step('nutrition', async () => {
    await page.getByRole('button', { name: /Питание/ }).last().click({ timeout: 5000 });
    await page.waitForTimeout(800);
    const say = (m) => console.log('  nutrition:', m);
    await page.getByPlaceholder('лет').fill('31'); say('age');
    await page.getByPlaceholder('кг').first().fill('64'); say('weight');
    await page.getByPlaceholder('см').fill('168'); say('height');
    await page.getByText('Женский', { exact: true }).first().click(); say('sex');
    await page.getByText(/^Подвижный/).first().click(); say('life');
    await page.locator('text=Тренировок в неделю').locator('xpath=..').getByText('3', { exact: true }).first().click(); say('per week');
    await page.getByText('Похудение', { exact: true }).first().click(); say('goal');
    await page.getByRole('button', { name: 'Посчитать норму' }).click();
    await page.waitForTimeout(1500);
    await top(page);
    await shot('n-norm');
    await page.getByRole('button', { name: 'Собрать рацион' }).click();
    await page.waitForTimeout(1500);
    await top(page);
    await shot('n-ration-1');
    for (const food of ['гречка', 'овсяные хлопья', 'рис', 'куриная грудка', 'яйца', 'творог', 'банан', 'помидоры', 'огурцы', 'молоко', 'сыр', 'яблоко']) {
      const chip = page.getByRole('button', { name: food, exact: true }).first();
      if (await chip.count()) await chip.click().catch(() => {});
    }
    await shot('n-ration-1b');
    await page.getByRole('button', { name: 'Подобрать блюда' }).click();
    await page.waitForTimeout(1500);
    await top(page);
    await shot('n-ration-2');
    for (let i = 0; i < 6; i += 1) {
      const like = page.getByRole('button', { name: 'Буду это готовить' }).first();
      if (!(await like.count())) break;
      await like.click();
      await page.waitForTimeout(600);
      if (i === 1) await shot('n-ration-3');
    }
    const day = page.getByRole('button', { name: 'Собрать день' }).first();
    if (await day.count()) await day.click();
    await page.waitForTimeout(1500);
    await top(page);
    await shot('n-ration-4');
    await page.evaluate(() => window.scrollBy(0, 700));
    await shot('n-ration-5');
  });
  await page.close();
}

if (SCENES.includes('trainer')) {
  const page = await open('?mockRole=trainer');
  const shot = shooter(page);
  await shot('t-home');
  await step('trainer-tabs', async () => {
    const tabs = page.getByRole('tab');
    const n = await tabs.count();
    for (let i = 0; i < Math.min(n, 6); i += 1) {
      const label = (await tabs.nth(i).innerText()).split('\n')[0].replace(/[^А-Яа-яЁё]+/g, '-').slice(0, 20);
      await tabs.nth(i).click();
      await page.waitForTimeout(700);
      await top(page);
      await shot(`t-tab${i}-${label}`);
    }
  });
  await step('trainer-nav', async () => {
    const nav = page.locator('nav button, .tabbar button');
    const n = await nav.count();
    for (let i = 0; i < Math.min(n, 6); i += 1) {
      const label = ((await nav.nth(i).innerText()) || 'x').split('\n')[0].replace(/[^А-Яа-яЁё]+/g, '-').slice(0, 20);
      await nav.nth(i).click();
      await page.waitForTimeout(900);
      await top(page);
      await shot(`t-nav${i}-${label}`);
    }
  });
  await page.close();
  const card = await open('?mockRole=trainer');
  const shotCard = shooter(card);
  await step('trainer-client', async () => {
    await card.locator('.item').first().click({ timeout: 10000 });
    await card.waitForTimeout(900);
    await shotCard('t-client');
    const tabs = card.getByRole('tab');
    const n = await tabs.count();
    for (let i = 0; i < Math.min(n, 6); i += 1) {
      const label = (await tabs.nth(i).innerText()).split('\n')[0].replace(/[^А-Яа-яЁё]+/g, '-').slice(0, 20);
      await tabs.nth(i).click();
      await card.waitForTimeout(800);
      await top(card);
      await shotCard(`t-client-tab${i}-${label}`);
    }
  });
  await step('trainer-program', async () => {
    const tabs = card.getByRole('tab', { name: 'Тренировки' });
    await tabs.first().click();
    await card.waitForTimeout(900);
    const block = card.locator('.section', { hasText: 'Тренировка 1' }).first();
    await block.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await card.evaluate(() => window.scrollBy(0, -40));
    await shotCard('t-program');
    await card.getByRole('button', { name: 'Новый месяц' }).first().click();
    await card.waitForTimeout(1200);
    const fromTpl = card.getByRole('button', { name: 'Из шаблона' }).first();
    await fromTpl.scrollIntoViewIfNeeded();
    await fromTpl.click();
    await card.waitForTimeout(900);
    await card.locator('.plan__tools, .template').first().scrollIntoViewIfNeeded().catch(() => {});
    await shotCard('t-program-template');
    const pick = card.getByText('Похудение, 3 раза в неделю').first();
    if (await pick.count()) { await pick.click(); await card.waitForTimeout(1200); await shotCard('t-program-template2'); }
    const apply = card.getByRole('button', { name: /Применить|Разложить|Взять|Добавить/ }).first();
    if (await apply.count()) { await apply.click(); await card.waitForTimeout(1500); await top(card); await shotCard('t-program-applied'); }
  });
  await card.close();
}

await browser.close();
server.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'ok');
