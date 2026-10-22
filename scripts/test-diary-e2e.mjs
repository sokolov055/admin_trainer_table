import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { buildSync } from 'esbuild';
import { parseLabel } from '../src/nutrition/label-model.js';
import { RECIPES } from '../src/nutrition/recipes.js';
const root = fileURLToPath(new URL('..', import.meta.url)), out = join(root, 'dist-diary'), shots = join(root, '.impeccable/review');
let browser, server, origin;
const errors = [];
before(async () => {
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out], { cwd: root, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
  buildSync({ entryPoints: [join(root, 'src/nutrition/food-recognition.js')], outfile: join(out, 'recognition-test.js'), bundle: true, platform: 'browser', format: 'esm', logLevel: 'silent' });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
  server = createServer((req, res) => { const name = decodeURIComponent(req.url.split('?')[0]); const file = join(out, name === '/' ? 'index.html' : name); const target = existsSync(file) && extname(file) ? file : join(out, 'index.html'); res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' }); res.end(readFileSync(target)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = 'http://127.0.0.1:' + server.address().port;
  browser = await (process.env.DIARY_BROWSER === 'webkit' ? webkit : chromium).launch();
  mkdirSync(shots, { recursive: true });
}, { timeout: 180000 });
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

test('FT-551: реальное локальное OCR и штрихкод, черновик без автосохранения', { timeout: 180000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  const pageErrors = [], external = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(origin + '/')) { external.push(url); return route.abort(); }
    return route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  const scanner = page.getByRole('region', { name: 'Сканер продукта' });
  // П. 9 плана: способы — плитками под поиском, сканер открывается сразу в нужном режиме
  await page.getByRole('dialog').getByRole('button', { name: 'Фото этикетки', exact: true }).click();
  const labelPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 650;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1200, 650);
    ctx.fillStyle = '#000'; ctx.font = '52px Arial';
    ['Пищевая ценность на 100 г', 'Белки 8,5 г', 'Жиры 2 г', 'Углеводы 12 г', 'Энергия 420 кДж / 100 ккал'].forEach((line, i) => ctx.fillText(line, 50, 100 + i * 105));
    return canvas.toDataURL('image/png').split(',')[1];
  });
  // Тот же путь, что для нестандартной схемы WKWebView: worker/core из Blob,
  // языковые модели байтами; внутри worker нет запросов к capacitor:// или CDN.
  const localText = await page.evaluate(async ({ base, png }) => {
    const { createRecognition } = await import(base + '/recognition-test.js');
    const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return createRecognition({ base: base + '/', useBlobWorker: true }).recognize(canvas);
  }, { base: origin, png: labelPng });
  assert.deepEqual(parseLabel(localText).fields, { protein: '8.5', fat: '2', carbs: '12', kcal: '100' });
  // FT-701: холодец снят боком — сканер сам находит сторону, где читается «100г продукта»
  const sideways = await page.evaluate(async ({ base }) => {
    const { createRecognition } = await import(base + '/recognition-test.js');
    const text = document.createElement('canvas'); text.width = 1200; text.height = 420;
    let ctx = text.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1200, 420); ctx.fillStyle = '#000'; ctx.font = '40px Arial';
    ['Пищевая ценность 100г продукта (средние', 'значения): белки-10г, жиры-10г, энергетическая', 'ценность (калорийность): 540 кДж (130 ккал)'].forEach((line, i) => ctx.fillText(line, 30, 90 + i * 110));
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 1200;
    ctx = canvas.getContext('2d'); ctx.translate(420, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(text, 0, 0);
    let turned = null;
    const texts = await createRecognition({ base: base + '/', useBlobWorker: true }).readLabel(canvas, () => {}, (angle, photo) => { turned = { angle, width: photo.width }; });
    return { texts, turned };
  }, { base: origin });
  assert.deepEqual(sideways.turned, { angle: 270, width: 1200 });
  assert.deepEqual(parseLabel(sideways.texts).fields, { protein: '10', fat: '10', kcal: '130' });
  await scanner.getByLabel('Выбрать фото продукта').setInputFiles({ name: 'synthetic-label.png', mimeType: 'image/png', buffer: Buffer.from(labelPng, 'base64') });
  await scanner.getByRole('button', { name: 'Прочитать этикетку', exact: true }).click();
  await scanner.getByRole('button', { name: 'Отменить распознавание', exact: true }).click();
  assert.equal(await scanner.getByRole('button', { name: 'Заполнить черновик', exact: true }).count(), 0);
  await scanner.getByRole('button', { name: 'Прочитать этикетку', exact: true }).click();
  await scanner.getByRole('button', { name: 'Заполнить черновик', exact: true }).waitFor({ timeout: 100000 });
  assert.ok((await scanner.innerText()).includes('8.5'));
  await page.screenshot({ path: join(shots, 'food-scan-label-390.png') });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: join(shots, 'food-scan-label-1024.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  // Ещё ни продукта, ни записи в дневнике нет: только результат OCR на устройстве.
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nutrition_demo_server:3')).foods.length), 1);
  await scanner.getByRole('button', { name: 'Заполнить черновик', exact: true }).click();
  assert.equal(await page.getByLabel('Ккал', { exact: true }).inputValue(), '100');
  assert.equal(await page.getByLabel('Белки, г', { exact: true }).inputValue(), '8.5');
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.evaluate(() => { const key = 'nutrition_demo_server:3', state = JSON.parse(localStorage.getItem(key)); state.foods[0].barcode = '4006381333931'; localStorage.setItem(key, JSON.stringify(state)); });
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Штрихкод', exact: true }).click();
  // Синтетический EAN-13: стандартные таблицы модулей, декодирует настоящий ZXing.
  const barcodePng = await page.evaluate(() => {
    const code = '4006381333931', odd = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
    const even = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
    const parity = 'LGLLGG';
    const bits = '101' + [...code.slice(1,7)].map((n,i) => (parity[i] === 'L' ? odd : even)[Number(n)]).join('') + '01010' + [...code.slice(7)].map(n => odd[Number(n)].replace(/[01]/g, b => b === '0' ? '1' : '0')).join('') + '101';
    const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 300;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,700,300); ctx.fillStyle = '#000';
    [...bits].forEach((b,i) => { if (b === '1') ctx.fillRect(100+i*5,40,5,200); });
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await scanner.getByLabel('Выбрать фото продукта').setInputFiles({ name: 'synthetic-ean.png', mimeType: 'image/png', buffer: Buffer.from(barcodePng, 'base64') });
  await scanner.getByRole('button', { name: 'Прочитать штрихкод', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === '4006381333931'));
  await scanner.getByRole('button', { name: 'Найти по штрихкоду', exact: true }).click();
  await scanner.getByRole('button', { name: 'Использовать продукт', exact: true }).click();
  await page.getByRole('button', { name: 'Записать в дневник', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).flatMap(d => d.entries).length), 0);
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Штрихкод', exact: true }).click();
  await scanner.getByLabel('Цифры штрихкода').fill('4006381333932');
  await scanner.getByRole('button', { name: 'Найти по штрихкоду', exact: true }).click();
  await scanner.getByText(/контрольная цифра не совпадает/).waitFor();
  await scanner.getByLabel('Цифры штрихкода').fill('4601234567893');
  await scanner.getByRole('button', { name: 'Найти по штрихкоду', exact: true }).click();
  await scanner.getByRole('button', { name: 'Добавить с этикетки', exact: true }).click();
  assert.equal(await page.getByLabel('Штрихкод (необязательно)', { exact: true }).inputValue(), '4601234567893');
  assert.deepEqual(external, []); assert.deepEqual(pageErrors, []);
  await page.close();
});

test('FT-551: любимые, приёмы, порции, история, рецепты и очередь без дублей', { timeout: 180000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary');
  await diary.getByRole('button', { name: 'Добавить еду', exact: true }).waitFor();
  await diary.getByRole('button', { name: 'Добавить в ужин', exact: true }).click();
  const dialog = () => page.getByRole('dialog');
  await dialog().getByRole('button', { name: 'Добавить Йогурт 2%', exact: true }).click();
  // Дата и приём свёрнуты в строку «Сегодня · Ужин · изменить» (FT-643)
  await dialog().getByRole('button', { name: /^Сегодня · Ужин/ }).click();
  assert.equal(await dialog().getByLabel('Приём пищи').inputValue(), 'dinner');
  await dialog().getByLabel('Количество, г', { exact: true }).fill('150');
  await dialog().getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days[Object.keys(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).at(-1)].entries.length > 0);
  await diary.getByRole('button', { name: 'Изменить: Йогурт 2%', exact: true }).waitFor();
  assert.ok((await diary.innerText()).includes('105'));
  await diary.getByRole('button', { name: 'Изменить: Йогурт 2%', exact: true }).click();
  await dialog().getByLabel('Количество, г', { exact: true }).fill('200');
  await dialog().getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await diary.getByText('200 г', { exact: true }).waitFor();
  await diary.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await dialog().getByRole('button', { name: 'Убрать из любимых: Йогурт 2%', exact: true }).click();
  await dialog().getByRole('button', { name: 'Все', exact: true }).click();
  await dialog().getByLabel('Поиск продуктов и блюд').fill('Йогурт 2%');
  await dialog().getByRole('button', { name: 'В любимые: Йогурт 2%', exact: true }).click();
  await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  await diary.getByRole('button', { name: '+ 250 мл', exact: true }).click();
  await diary.getByText('0,25 л выпито', { exact: true }).waitFor();
  // FT-646: завершение дня — итог листом, потом подтверждение
  await diary.getByRole('button', { name: 'Завершить день', exact: true }).click();
  await dialog().getByText('Записей', { exact: true }).waitFor();
  await dialog().getByRole('button', { name: 'Завершить день', exact: true }).click();
  await diary.getByText('День завершён', { exact: true }).waitFor();
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).some(d => d.complete));
  await diary.getByRole('tab', { name: 'Неделя', exact: true }).click();
  await diary.getByText('Среднее за полные дни: 140 ккал', { exact: true }).waitFor();
  await diary.getByRole('tab', { name: 'Рецепты', exact: true }).click();
  await diary.getByRole('button', { name: 'Свой рецепт', exact: true }).click();
  await dialog().getByLabel('Название блюда').fill('Мой тестовый десерт');
  await dialog().getByRole('button', { name: 'Добавить ингредиент', exact: true }).click();
  await dialog().getByRole('button', { name: 'Добавить Йогурт 2%', exact: true }).click();
  await dialog().getByLabel('Вес всего готового блюда, г').fill('200');
  await dialog().getByRole('button', { name: 'Сохранить в мои блюда', exact: true }).click();
  await diary.getByText('Мой тестовый десерт', { exact: true }).waitFor();
  await diary.getByRole('button', { name: 'Изменить рецепт: Мой тестовый десерт', exact: true }).click();
  await dialog().getByLabel('Вес всего готового блюда, г').fill('100');
  await dialog().getByRole('button', { name: 'Сохранить в мои блюда', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('nutrition_demo_server:3')).recipes[0].revision === 2);
  await diary.getByRole('tab', { name: 'Дневник', exact: true }).click();
  await diary.getByRole('button', { name: 'Добавить в завтрак', exact: true }).click();
  // FT-646: список открывается на «Недавних» — рецепта там ещё нет
  await dialog().getByRole('button', { name: 'Все', exact: true }).click();
  await dialog().getByRole('button', { name: 'Добавить Мой тестовый десерт', exact: true }).click();
  await dialog().getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await diary.getByRole('button', { name: 'Изменить: Мой тестовый десерт', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  await diary.getByRole('button', { name: 'Изменить: Мой тестовый десерт', exact: true }).waitFor();
  // Готовим форму при связи, затем теряем ответ сервера. Очередь хранит тот же id.
  await diary.getByRole('button', { name: 'Добавить в обед', exact: true }).click();
  await dialog().getByRole('button', { name: 'Добавить Йогурт 2%', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('demo_offline', '1'));
  await dialog().getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await diary.getByText(/на телефоне, ждёт отправки/).waitFor();
  const before = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).reduce((s, d) => s + d.entries.length, 0));
  await page.evaluate(() => { localStorage.removeItem('demo_offline'); window.dispatchEvent(new Event('online')); });
  await page.waitForFunction(n => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).reduce((s, d) => s + d.entries.length, 0) === n + 1, before, { timeout: 30000 });
  await page.reload();
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  await diary.getByRole('button', { name: 'Изменить: Мой тестовый десерт', exact: true }).waitFor();
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).reduce((s, d) => s + d.entries.length, 0)), before + 1);
  await page.screenshot({ path: join(shots, 'mobile.png'), fullPage: true });
  await diary.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await dialog().getByRole('button', { name: 'Добавить Йогурт 2%', exact: true }).waitFor();
  await page.screenshot({ path: join(shots, 'mobile-favorites.png'), fullPage: true });
  await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: join(shots, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert.deepEqual(errors, []);
  await page.close();
});


test('FT-642: удаление записи — «Удалено · Вернуть», на сервер после паузы; четыре вкладки', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary'), dialog = () => page.getByRole('dialog');
  const entries = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).reduce((s, d) => s + d.entries.length, 0));
  await diary.getByRole('button', { name: 'Добавить еду', exact: true }).waitFor();
  assert.deepEqual(await diary.getByRole('tab').allInnerTexts(), ['Дневник', 'Неделя', 'Рецепты', 'Ещё']);
  await diary.getByRole('button', { name: 'Добавить в обед', exact: true }).click();
  await dialog().getByRole('button', { name: 'Добавить Йогурт 2%', exact: true }).click();
  await dialog().getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await diary.getByRole('button', { name: 'Изменить: Йогурт 2%', exact: true }).waitFor();
  assert.equal(await entries(), 1);
  // В форме «Удалить запись» стоит отдельно от «Записать в дневник», удаление отложенное.
  await diary.getByRole('button', { name: 'Изменить: Йогурт 2%', exact: true }).click();
  await dialog().getByRole('button', { name: 'Удалить запись', exact: true }).click();
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click();
  await diary.getByRole('button', { name: 'Изменить: Йогурт 2%', exact: true }).waitFor();
  assert.equal(await entries(), 1);
  await page.screenshot({ path: join(shots, 'diary-tabs-390.png') });
  // Смахивание: корзина под строкой (до жеста скрыта — шлём событие), затем пауза и сервер.
  await diary.locator('button.swipe__trash[aria-label="Удалить: Йогурт 2%"]').dispatchEvent('click');
  await page.getByText('Запись удалена', { exact: true }).waitFor();
  assert.equal(await diary.getByRole('button', { name: 'Изменить: Йогурт 2%', exact: true }).count(), 0);
  assert.equal(await entries(), 1);
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).reduce((s, d) => s + d.entries.length, 0) === 0, null, { timeout: 30000 });
  await diary.getByRole('tab', { name: 'Ещё', exact: true }).click();
  await diary.getByRole('button', { name: 'Норма и анкета', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Разобраться за пару минут' }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('FT-551: план меню становится фактом только после подтверждения порции', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  const ids = [RECIPES[0].id, RECIPES.find(r => r.meal !== RECIPES[0].meal).id];
  await page.addInitScript(ids => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.setItem('ration_v1', JSON.stringify({ liked: ids, seen: [], pantry: [] })); }, ids);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary');
  await diary.getByText('Осталось 2 000 ккал', { exact: true }).waitFor();
  await diary.getByRole('button', { name: 'Что приготовить на остаток', exact: true }).click();
  const eat = page.getByRole('button', { name: 'Съедено — записать', exact: true }).first();
  await eat.waitFor();
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).reduce((s,d) => s+d.entries.length,0)), 0);
  await eat.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Количество порций', { exact: true }).fill('0,5');
  await dialog.getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).some(d => d.entries.length === 1));
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).flatMap(d => d.entries)[0].amount), 0.5);
  await page.close();
});


test('FT-551: собственный каталог, бренд, этикетка и проверка тренером', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  await page.getByTestId('nutrition-diary').getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Свой продукт', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Название продукта', { exact: true }).fill('Творог 5%');
  await form.getByLabel('Бренд (необязательно)').fill('Тестовая этикетка');
  await form.getByLabel('В каком виде взвешиваете').selectOption('as_sold');
  await form.getByLabel('Штрихкод (необязательно)').fill('4601234567893');
  for (const [label, value] of [['Ккал', '120'], ['Белки, г', '16'], ['Жиры, г', '5'], ['Углеводы, г', '3']]) await form.getByLabel(label, { exact: true }).fill(value);
  await form.screenshot({ path: join(shots, 'food-label-390.png') });
  assert.ok(await form.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await form.getByRole('button', { name: 'Создать продукт', exact: true }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Творог 5% · Тестовая этикетка' }).waitFor();
  await page.getByLabel('Количество, г', { exact: true }).fill('150');
  await page.getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await page.getByTestId('nutrition-diary').getByText('180 ккал', { exact: true }).first().waitFor();
  await page.getByRole('tab', { name: 'Ещё', exact: true }).click();
  assert.equal(await page.getByText('Расчёт по анкете', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Собрать рацион', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('Дата дневника').count(), 0);
  await page.getByRole('heading', { name: 'Разобраться за пару минут' }).waitFor();
  await page.screenshot({ path: join(shots, 'nutrition-tips-390.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Норма и анкета', exact: true }).click();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Дневник', exact: true }).click();

  await page.goto(origin + '/?mockRole=trainer');
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('tab', { name: 'Продукты', exact: true }).click();
  await page.getByLabel('Найти продукт, бренд или штрихкод').fill('4601234567893');
  await page.getByRole('button').filter({ hasText: 'Творог 5% · Тестовая этикетка' }).click();
  await page.getByLabel('Источник: производитель или проверенная этикетка').fill('Этикетка, тест 18.10.2026');
  await page.getByLabel('Ккал', { exact: true }).fill('125');
  await page.getByRole('button', { name: 'Сохранить проверенную карточку', exact: true }).click();
  await page.getByLabel('Карточки', { exact: true }).selectOption('');
  await page.getByText(/125 ккал \/ 100 г/).waitFor();
  await page.screenshot({ path: join(shots, 'food-catalog-390.png') });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: join(shots, 'food-catalog-1024.png') });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  await page.getByTestId('nutrition-diary').getByText('180 ккал', { exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('напиток с этикетки на 100 мл: единица хранится, порция и подписи в миллилитрах', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  await page.getByTestId('nutrition-diary').getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Свой продукт', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Название продукта', { exact: true }).fill('Крюшон');
  await form.getByRole('radio', { name: 'на 100 мл', exact: true }).click();
  assert.equal(await form.getByRole('radio', { name: 'на 100 мл', exact: true }).getAttribute('aria-checked'), 'true');
  for (const [label, value] of [['Ккал', '42'], ['Белки, г', '0'], ['Жиры, г', '0'], ['Углеводы, г', '10,5']]) await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole('button', { name: 'Создать продукт', exact: true }).click();
  // Количество — в миллилитрах, быстрые порции — стакан и банка
  await page.getByRole('dialog').getByRole('heading', { name: 'Крюшон' }).waitFor();
  await page.getByLabel('Количество, мл', { exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: '250 мл', exact: true }).click();
  await page.getByRole('dialog').getByText('105 ккал', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await page.getByTestId('nutrition-diary').getByRole('button', { name: 'Изменить: Крюшон', exact: true }).waitFor();
  await page.getByTestId('nutrition-diary').getByText('250 мл', { exact: true }).waitFor();
  // В каталоге напиток подписан «на 100 мл»
  await page.getByTestId('nutrition-diary').getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Поиск продуктов и блюд').fill('Крюшон');
  await page.getByRole('dialog').getByRole('button', { name: 'Все', exact: true }).click();
  await page.getByRole('dialog').getByText(/42 ккал \/ 100 мл/).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.locator('.sheet').waitFor({ state: 'detached' });
  await page.goto(origin + '/?mockRole=trainer');
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('tab', { name: 'Продукты', exact: true }).click();
  await page.getByLabel('Найти продукт, бренд или штрихкод').fill('Крюшон');
  await page.getByText(/42 ккал \/ 100 мл/).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test('FT-551: тренер назначает цель и оставляет комментарий, клиент видит результат', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin + '/?mockRole=trainer');
  await page.getByRole('tab', { name: /^Все ·/ }).click();
  await page.getByRole('button').filter({ hasText: 'Анна Морозова' }).first().click();
  await page.getByRole('tab', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary');
  assert.equal(await diary.getByRole('button', { name: 'Добавить еду', exact: true }).count(), 0);
  await diary.getByRole('button', { name: 'Назначить цель', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Калории', { exact: true }).fill('1900');
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить цель', exact: true }).click();
  await diary.getByText('Осталось 1 900 ккал', { exact: true }).waitFor();
  await diary.getByLabel('Комментарий к выбранному дню').fill('Уточните вес готового блюда.');
  await diary.getByRole('button', { name: 'Сохранить комментарий', exact: true }).click();
  await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('nutrition_demo_server:3')).days).some(d => d.comment === 'Уточните вес готового блюда.'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  await page.getByTestId('nutrition-diary').getByText('Уточните вес готового блюда.', { exact: true }).waitFor();
  await page.getByTestId('nutrition-diary').getByText('Осталось 1 900 ккал', { exact: true }).waitFor();
  await page.close();
});

test('FT-643: диалоги дневника на общем листе — стопка, запертая прокрутка, фокус в количестве, ошибка у поля', { timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary'), dialog = () => page.getByRole('dialog');
  const sheets = () => page.evaluate(() => document.querySelectorAll('.sheet').length);
  const noSheets = () => page.waitForFunction(() => !document.querySelector('.sheet'));
  await diary.getByRole('button', { name: 'Добавить еду', exact: true }).waitFor();
  await diary.getByRole('button', { name: 'Добавить в обед', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Добавить еду · Обед' }).waitFor();
  // Лист живёт в body, страница под ним заперта
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.ok(await page.evaluate(() => document.querySelector('.sheet').parentElement === document.body));
  await dialog().getByLabel('Поиск продуктов и блюд').fill('Йог');
  await dialog().getByRole('button', { name: 'Свой продукт', exact: true }).click();
  // Стопка: два листа в DOM, для читалки и кликов — только верхний
  await dialog().getByRole('heading', { name: 'Продукт с этикетки' }).waitFor();
  assert.equal(await sheets(), 2);
  assert.equal(await dialog().count(), 1);
  await dialog().getByLabel('Название продукта', { exact: true }).fill('Пробный');
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.screenshot({ path: join(shots, 'diary-sheet-stack-390.png') });
  // Касание мимо листа с набранной формой ничего не теряет
  await page.locator('.sheet').last().locator('.sheet__scrim').click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(50);
  assert.equal(await dialog().getByLabel('Название продукта', { exact: true }).inputValue(), 'Пробный');
  await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  // Назад — на список, поиск в нём на месте
  await dialog().getByRole('heading', { name: 'Добавить еду · Обед' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.sheet').length === 1);
  assert.equal(await dialog().getByLabel('Поиск продуктов и блюд').inputValue(), 'Йог');
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await dialog().getByRole('button', { name: 'Все', exact: true }).click();
  await dialog().getByRole('button', { name: 'Добавить Йогурт 2%', exact: true }).click();
  // Фокус сразу в количестве, число выделено; дата и приём — одной строкой
  await dialog().getByRole('heading', { name: 'Записать съеденное' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'diary-amount');
  assert.deepEqual(await page.evaluate(() => { const a = document.activeElement; return [a.selectionStart, a.selectionEnd, a.value]; }), [0, 3, '100']);
  await dialog().getByRole('button', { name: /^Сегодня · Обед/ }).waitFor();
  assert.equal(await dialog().getByLabel('Приём пищи').count(), 0);
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.screenshot({ path: join(shots, 'diary-sheet-entry-390.png') });
  // Ошибка — под полем и без «обновите данные»
  await dialog().getByLabel('Количество, г', { exact: true }).fill('0');
  await dialog().getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  assert.match(await dialog().locator('.field__error').innerText(), /Проверьте количество/);
  assert.doesNotMatch(await dialog().innerText(), /Обновите данные/);
  await dialog().getByLabel('Количество, г', { exact: true }).fill('150');
  await dialog().getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  // Зелёный успех; лист ушёл, прокрутка отперта
  await diary.locator('.note--good', { hasText: 'Порция записана' }).waitFor();
  await noSheets();
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  await diary.getByRole('button', { name: 'Изменить: Йогурт 2%', exact: true }).waitFor();
  await diary.getByRole('button', { name: '+ 250 мл', exact: true }).click();
  await diary.locator('.note--good', { hasText: 'Сохранено.' }).waitFor();
  // Рецепт → ингредиент: Escape закрывает верхний лист, название рецепта остаётся
  await diary.getByRole('tab', { name: 'Рецепты', exact: true }).click();
  await diary.getByRole('button', { name: 'Свой рецепт', exact: true }).click();
  await dialog().getByLabel('Название блюда').fill('Стопка');
  await dialog().getByRole('button', { name: 'Добавить ингредиент', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Ингредиент рецепта' }).waitFor();
  await page.keyboard.press('Escape');
  await dialog().getByRole('heading', { name: 'Свой рецепт' }).waitFor();
  assert.equal(await dialog().getByLabel('Название блюда').inputValue(), 'Стопка');
  await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  await noSheets();
  // Урок — тоже лист
  await diary.getByRole('tab', { name: 'Ещё', exact: true }).click();
  await diary.locator('.diary-lesson').first().click();
  await dialog().waitFor();
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.screenshot({ path: join(shots, 'diary-sheet-lesson-390.png') });
  await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  await noSheets();
  assert.deepEqual(errors, []);
  await page.close();
});

// Плашка «Норма ещё не посчитана» — только у клиента без анкеты и без нормы от тренера
test('плашка анкеты показывается без нормы и ведёт в «Норма и анкета»', { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.setItem('nutrition_demo_server:3', JSON.stringify({ days: {}, targets: {}, recipes: [], foods: [], settings: { mode: 'count', meals: null, chosen: true } })); });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary');
  await diary.getByRole('heading', { name: 'Норма ещё не посчитана' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).count(), 0);
  await diary.getByRole('button', { name: 'Заполнить анкету', exact: true }).click();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Норма ещё не посчитана' }).count(), 0);
  await page.close();
});

test('FT-644: плашка вместо анкеты, день словом, числа целыми, «набран» при нулевом остатке', { timeout: 120000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  const ids = [RECIPES[0].id, RECIPES.find(r => r.meal !== RECIPES[0].meal).id];
  await page.addInitScript(ids => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.setItem('ration_v1', JSON.stringify({ liked: ids, seen: [], pantry: [] })); }, ids);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary');
  // Клиент без анкеты, но с нормой от тренера: ни анкеты под дневником, ни плашки «не посчитана» рядом с нормой
  await diary.getByText('Осталось 2 000 ккал', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).count(), 0);
  assert.equal(await diary.getByRole('heading', { name: 'Норма ещё не посчитана' }).count(), 0);
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.screenshot({ path: join(shots, 'diary-notice-390.png'), fullPage: true, animations: 'disabled' });
  // День словами, без «2026-10-20» и «20.10.2026»
  assert.equal(await diary.locator('.diary-date__text').innerText(), 'Сегодня');
  await diary.getByRole('button', { name: 'Повторить еду', exact: true }).click();
  const copy = page.getByRole('dialog');
  await copy.getByText('Записи добавятся к дню «Сегодня».', { exact: false }).waitFor();
  assert.ok(!/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/.test(await copy.innerText()));
  await copy.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.locator('.sheet').waitFor({ state: 'detached' });
  // Анкета живёт в «Ещё → Норма и анкета», на дневнике её нет
  await page.getByRole('tab', { name: 'Ещё', exact: true }).click();
  await diary.getByRole('button', { name: 'Норма и анкета', exact: true }).click();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Дневник', exact: true }).click();
  await diary.getByText('Осталось 2 000 ккал', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Анкета', exact: true }).count(), 0);
  // Продукт с белком выше нормы: название со счётчиком, потом «набран»
  await diary.getByRole('button', { name: 'Добавить еду', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Свой продукт', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Название продукта', { exact: true }).fill('Протеин');
  assert.equal(await form.locator('.field__counter').innerText(), '7 / 120');
  assert.equal(await form.getByLabel('Название продукта', { exact: true }).getAttribute('maxlength'), '120');
  for (const [label, value] of [['Ккал', '400'], ['Белки, г', '100'], ['Жиры, г', '0'], ['Углеводы, г', '0']]) await form.getByLabel(label, { exact: true }).fill(value);
  await form.getByRole('button', { name: 'Создать продукт', exact: true }).click();
  await page.getByLabel('Количество, г', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Записать в дневник', exact: true }).click();
  await diary.getByRole('button', { name: 'Изменить: Протеин', exact: true }).waitFor();
  await diary.getByRole('button', { name: 'Что приготовить на остаток', exact: true }).click();
  await page.getByText('белок на сегодня набран', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Съел — записать порцию', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Съедено — записать', exact: true }).first().waitFor();
  const kcal = await page.locator('.day__kcal').innerText();
  assert.ok(/^[\d\s  ]+$/.test(kcal), 'ккал целым числом: ' + kcal);
  for (const text of await page.locator('.day__bar-head').allInnerTexts()) assert.ok(!/\d,\d/.test(text), 'граммы целыми: ' + text);
  await page.screenshot({ path: join(shots, 'diary-plan-done-390.png'), animations: 'disabled' });
  assert.deepEqual(errors, []);
  await page.close();
});

test('план трёх разборов, п. 1: «Только калории» — примерная запись без продукта', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('auth_token_v1', 'demo-session'));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary'), dialog = () => page.getByRole('dialog');
  await diary.getByRole('button', { name: 'Добавить в обед', exact: true }).click();
  await dialog().getByRole('button', { name: 'Только калории', exact: true }).click();
  await dialog().getByRole('heading', { name: 'Только калории' }).waitFor();
  // Без калорий не сохраняется
  await dialog().getByRole('button', { name: 'Добавить', exact: true }).click();
  await dialog().getByText('Калории: от 1 до 5000.').waitFor();
  await dialog().getByLabel('Калории, ккал').fill('450');
  await dialog().getByLabel('Что это было').fill('Бизнес-ланч');
  await dialog().getByRole('button', { name: 'Добавить 450 ккал', exact: true }).click();
  const row = diary.getByRole('button', { name: 'Изменить: Бизнес-ланч', exact: true });
  await row.waitFor();
  assert.match(await row.innerText(), /примерно/);
  // innerText сохраняет неразрывный пробел Qty между числом и «ккал» (getByText его нормализует сам)
  assert.match(await diary.innerText(), /≈ 450[\s ]ккал/);
  assert.ok((await diary.innerText()).includes('из съеденного примерно 450 ккал'));
  await page.screenshot({ path: join(shots, 'diary-quick-390.png') });
  // П. 3: карточка продукта — проверка и источник видны до записи
  await diary.getByRole('button', { name: 'Добавить в ужин', exact: true }).click();
  await dialog().getByRole('button', { name: 'Все', exact: true }).click();
  await dialog().getByLabel('Поиск продуктов и блюд').fill('Йогурт 2%');
  await dialog().getByRole('button', { name: 'Добавить Йогурт 2%', exact: true }).click();
  await dialog().getByText('Не проверено — сверьте с упаковкой').waitFor();
  await dialog().getByText(/^Источник:/).waitFor();
  await page.screenshot({ path: join(shots, 'diary-product-390.png') });
  await page.close();
});

test('план трёх разборов, п. 8: «Как вы считаете еду?» → режим «Ладонь», порции за несколько касаний', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.removeItem('nutrition_demo_server:3'); });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary'), dialog = () => page.getByRole('dialog');
  await diary.getByRole('heading', { name: 'Как вы считаете еду?' }).waitFor();
  await diary.getByRole('radio', { name: /Никогда не считал/ }).click();
  await diary.getByText('Точность: примерная').waitFor();
  await diary.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await diary.getByText(/Норма в порциях посчитана/).waitFor();
  assert.equal(await diary.getByRole('heading', { name: 'Как вы считаете еду?' }).count(), 0);
  await diary.getByRole('button', { name: 'Отметить порции', exact: true }).click();
  await dialog().getByRole('button', { name: 'Белок: 2 ладони', exact: true }).click();
  await dialog().getByRole('button', { name: 'Ещё половина: Овощи', exact: true }).click();
  await dialog().getByText('2 ладони', { exact: true }).waitFor();
  await page.screenshot({ path: join(shots, 'diary-palm-sheet-390.png') });
  await dialog().getByRole('button', { name: /^Сохранить · ≈ 283 ккал$/ }).click();
  const row = diary.getByRole('button', { name: 'Изменить: Белок · ладонь', exact: true });
  await row.waitFor();
  assert.match(await row.innerText(), /2 ладони · примерно/);
  await diary.getByRole('button', { name: 'Изменить: Овощи · кулак', exact: true }).waitFor();
  assert.match(await diary.innerText(), /2[\s ]из 5/);
  await page.screenshot({ path: join(shots, 'diary-palm-390.png') });
  await page.close();
});

test('план трёх разборов, пп. 10–11: норма по приёмам и рецепты под остаток', { timeout: 90000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('auth_token_v1', 'demo-session'); localStorage.setItem('diary_approach_later_v1', String(Date.now())); });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Питание', exact: true }).click();
  const diary = page.getByTestId('nutrition-diary'), dialog = () => page.getByRole('dialog');
  await diary.getByRole('tab', { name: 'Ещё', exact: true }).click();
  await diary.getByRole('button', { name: /^Норма по приёмам/ }).click();
  await dialog().getByText('Сумма: 100 %').waitFor();
  await dialog().getByRole('button', { name: 'Больше: Завтрак', exact: true }).click();
  await dialog().getByText(/Сумма: 105 % — уберите 5 %/).waitFor();
  assert.equal(await dialog().getByRole('button', { name: 'Сохранить', exact: true }).isDisabled(), true);
  await dialog().getByRole('button', { name: 'Меньше: Перекус', exact: true }).click();
  await page.screenshot({ path: join(shots, 'diary-meal-shares-390.png') });
  await dialog().getByRole('button', { name: 'Сохранить', exact: true }).click();
  await diary.getByRole('tab', { name: 'Дневник', exact: true }).click();
  // Мок: 2000 ккал в день; завтрак 30 % → 600, перекус 5 % → 100
  await diary.getByText(/из 600 ккал/).first().waitFor();
  await diary.getByText(/можно ещё 600/).first().waitFor();
  await diary.getByRole('tab', { name: 'Рецепты', exact: true }).click();
  await diary.getByRole('button', { name: /под остаток$/ }).waitFor();
  assert.equal(await diary.getByRole('button', { name: /под остаток$/ }).getAttribute('aria-pressed'), 'true');
  await diary.getByRole('button', { name: 'Ужин', exact: true }).click();
  await diary.getByText('Влезает в остаток', { exact: false }).first().waitFor();
  await page.screenshot({ path: join(shots, 'diary-recipes-390.png') });
  await page.close();
});
