// Снимки редактора упражнений (этап 5, 17.11.2026) — для глазной проверки:
// список тренировки, карточка упражнения, «Об упражнении», суперсет, кардио —
// в программе клиента, в шаблоне программы и в шаблоне тренировки.
// node scripts/shot-exercise-card.mjs [префикс] (DARK=1 — тёмная, NO_BUILD=1 — без сборки)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(ROOT, 'dist-demo');
const DEST = process.argv[2] || join(ROOT, 'shot');
if (!process.env.NO_BUILD) execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', 'dist-demo'], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
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
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 390), height: Number(process.env.H || 844) }, locale: 'ru-RU', hasTouch: true, isMobile: true, colorScheme: process.env.DARK === '1' ? 'dark' : 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (name, opts = {}) => page.screenshot({ path: `${DEST}-${name}.png`, ...opts });
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const sheet = page.locator('.exc-sheet .sheet__panel');
const closeSheet = async () => { await sheet.getByRole('button', { name: 'Готово', exact: true }).click(); await page.waitForTimeout(500); };
// «＋ Упражнения» сеткой (шаг 3, 18.11.2026): открыть, отметить три, «＋ Новое», добавить
const addSheet = page.locator('.exa-sheet .sheet__panel');
const addFlow = async (scope, name, full = false) => {
  await scope.getByRole('button', { name: 'Упражнения', exact: true }).first().click();
  await addSheet.waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  await shot(name + '-add');
  if (!full) { await addSheet.getByRole('button', { name: 'Закрыть' }).click(); await page.waitForTimeout(500); return; }
  const tiles = addSheet.locator('.exa-tile');
  for (const k of [2, 0, 4]) await tiles.nth(k).click();
  await page.waitForTimeout(400);
  await shot(name + '-add-picked');
  await addSheet.getByRole('radio', { name: 'Ноги', exact: true }).click();
  await page.waitForTimeout(400);
  await shot(name + '-add-legs');
  await addSheet.getByRole('searchbox').fill('Тяга т-грифа');
  await page.waitForTimeout(400);
  await shot(name + '-add-new');
  await addSheet.getByRole('button', { name: /^Новое:/ }).click();
  await page.waitForTimeout(600);
  await addSheet.getByRole('button', { name: /^Добавить \d/ }).click();
  await page.waitForTimeout(800);
  await scope.locator('.plan-inline').first().evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(300);
  await shot(name + '-add-done');
};
try {
  await page.goto(origin + '/?mockRole=trainer');
  await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const main = page.locator('#root main:not([hidden])');

  if (want('add')) {
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('button', { name: /Мои тренировки/ }).click();
    const first = main.locator('.plan-card').first();
    await first.getByRole('button', { name: 'Править' }).click();
    await first.locator('.exr').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    await addFlow(first, '12-client', true);
    await page.goto(origin + '/?mockRole=trainer');
    if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  }

  if (want('client')) {
    // Программа клиента: «Мои тренировки» → «Править»
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByRole('button', { name: /Мои тренировки/ }).click();
    const first = main.locator('.plan-card').first();
    await first.getByRole('button', { name: 'Править' }).click();
    await first.locator('.exr').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(700);
    await first.locator('.plan-inline').scrollIntoViewIfNeeded();
    await shot('1-list');
    await first.locator('.exr').nth(1).click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('2-card');
    await sheet.getByRole('button', { name: 'Вес, кг: больше' }).click().catch(() => {});
    await sheet.getByRole('button', { name: 'Разминка: больше' }).click().catch(() => {});
    await sheet.getByRole('button', { name: /Дропсет в конце/ }).click().catch(() => {});
    await page.waitForTimeout(500);
    await shot('3-card-edit');
    await sheet.getByRole('button', { name: /Об упражнении/ }).click();
    await page.waitForTimeout(400);
    await page.locator('.exc-acc').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot('4-about');
    await closeSheet();
    // Суперсет — второй блок
    const second = main.locator('.plan-card').nth(1);
    await second.getByRole('button', { name: 'Править' }).click();
    const ss = second.locator('.plan-inline__unit--superset').first();
    await ss.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await shot('5-superset-list');
    await ss.locator('.exr').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('6-superset-card');
    // Разные круги: «По кругам», у первого — повторы и вес лесенкой
    await sheet.getByRole('radio', { name: 'По кругам' }).click();
    await sheet.locator('.rt-tab').waitFor({ timeout: 5000 });
    await sheet.getByRole('button', { name: 'Повторы', exact: true }).click().catch(() => {});
    await sheet.getByRole('button', { name: /^(Вес|Доп\. вес)$/ }).click().catch(() => {});
    for (const k of [1, 2, 3]) await sheet.getByRole('button', { name: 'Повторы: шаг больше' }).click().catch(() => {});
    for (const k of [1, 2]) await sheet.getByRole('button', { name: /вес: шаг больше$/i }).click().catch(() => {});
    await sheet.locator('.rt-tab tr.is-row .rt-cell').nth(1).click();
    await page.waitForTimeout(400);
    await sheet.locator('.exc-ss').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot('6b-rounds');
    await sheet.locator('.rt-kinds').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await shot('6c-rounds-steps');
    await sheet.getByRole('tab').nth(1).click();
    await page.waitForTimeout(500);
    await shot('6d-rounds-a2');
    // Несколько клеток сразу: подержать клетку → ещё две → панель
    const cellA = sheet.locator('.rt-tab tbody tr').nth(0).locator('.rt-cell').nth(0);
    // Удержание — касанием (CDP): мышью в мобильном режиме Chromium глотает клики после него
    const cdp = await page.context().newCDPSession(page);
    const box = await cellA.boundingBox();
    const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(700);
    await sheet.locator('.rt-tab tbody tr').nth(1).locator('.rt-cell').nth(0).click();
    await sheet.locator('.rt-tab tbody tr').nth(1).locator('.rt-cell').nth(1).click();
    await page.waitForTimeout(400);
    await sheet.locator('.rt-head').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot('6i-pick');
    await sheet.getByRole('button', { name: /^Повторы: .+ Вписать во все$/ }).click();
    await sheet.getByRole('textbox', { name: 'Повторы: во все выбранные' }).fill('20');
    await sheet.getByRole('textbox', { name: 'Повторы: во все выбранные' }).blur();
    await sheet.getByRole('button', { name: 'Круг 3: выбрать весь' }).click();
    await page.waitForTimeout(300);
    await shot('6j-pick-set');
    await sheet.getByRole('button', { name: 'Готово', exact: true }).first().click();
    await closeSheet();
    await ss.scrollIntoViewIfNeeded();
    await shot('6e-superset-list-rounds');
    // Кардио в круге: звено «Беговая дорожка ⛓ Присед», у дорожки — цель и нагрузка по кругам
    await second.locator('.ss-link__b').first().click();
    await page.waitForTimeout(400);
    await second.locator('.ss-head').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await sheet.getByRole('radio', { name: 'По кругам' }).click();
    await sheet.getByRole('button', { name: 'Цель', exact: true }).click();
    await sheet.getByRole('button', { name: 'Нагрузка', exact: true }).click();
    await sheet.getByRole('button', { name: /: шаг больше$/ }).first().click();
    await sheet.getByRole('button', { name: /: шаг больше$/ }).nth(1).click();
    await page.waitForTimeout(300);
    await sheet.locator('.rt-tab').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot('6f-cardio-rounds');
    await closeSheet();
    // Кардио
    await second.getByRole('button', { name: 'Кардио', exact: true }).click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('7-cardio');
    await sheet.getByRole('button', { name: 'Удалить упражнение' }).click();
    await page.waitForTimeout(600);
    if (want('live')) {
      // Экран тренировки: подходы суперсета — повторы и вес своего круга
      await page.waitForTimeout(1200);
      await second.getByRole('button', { name: /Начать тренировку/ }).click();
      await page.getByText('Выпады с гантелями').first().waitFor({ timeout: 10000 });
      await page.waitForTimeout(800);
      await page.getByText('Выпады с гантелями').first().scrollIntoViewIfNeeded();
      await shot('6g-live');
      await page.getByText('Круг 2', { exact: true }).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(300);
      await shot('6h-live-round2');
      await page.goto(origin + '/?mockRole=trainer');
    }
  }

  if (want('program')) {
    // Шаблон программы: «Библиотека» → программа → «Изменить» → тренировка
    await page.goto(origin + '/?mockRole=trainer');
    if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await main.locator('.plib-card').filter({ hasText: 'Похудение, 3 раза в неделю' }).first().click();
    await page.getByRole('button', { name: 'Изменить' }).click();
    await main.locator('.plib-ewk').first().waitFor({ timeout: 10000 });
    await main.locator('.plib-ewk__head').first().click();
    await main.locator('.plib-ewk.is-open .exr').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(600);
    await shot('8-program');
    await main.locator('.plib-ewk.is-open .exr').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('9-program-card');
    await closeSheet();
    await addFlow(main.locator('.plib-ewk.is-open'), '13-program');
  }

  if (want('workout')) {
    // Шаблон тренировки: «Библиотека» → «Тренировки» → шаблон → «Изменить»
    await page.goto(origin + '/?mockRole=trainer');
    if (process.env.DARK === '1') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await page.getByRole('tab', { name: 'Тренировки', exact: true }).click();
    await main.locator('.item').first().click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Изменить' }).first().click();
    await main.locator('.exr').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    await main.locator('.plan-inline').first().scrollIntoViewIfNeeded();
    await shot('10-workout');
    await main.locator('.exr').first().click();
    await sheet.waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('11-workout-card');
    await closeSheet();
    await addFlow(main, '14-workout');
  }
} finally {
  if (errors.length) console.log('ОШИБКИ:', errors.join('\n'));
  await browser.close();
  server.close();
}
