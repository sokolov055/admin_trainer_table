import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

// Редактор тренировки «Библиотеки» (этап 3, 25.11.2026) — в демо-сборке с моком:
// ✎ с экрана тренировки, выход с несохранённым, лист «Обновить в N программах»,
// сохранение и повторное открытие.
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = '/tmp/workout-editor-demo';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

test('редактор тренировки: выход с правкой спрашивает, сохранение спрашивает про программы, после сохранения данные на месте', async () => {
  execFileSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', OUT], { cwd: ROOT, env: { ...process.env, VITE_MOCK: '1' }, stdio: 'ignore' });
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(origin + '/?mockRole=trainer');
    await page.evaluate(() => localStorage.setItem('auth_token_v1', 'demo-session'));
    await page.goto(origin + '/?mockRole=trainer');
    const main = page.locator('#root main:not([hidden])');
    await page.getByRole('button', { name: /Библиотека/ }).first().click();
    await page.locator('button:visible', { hasText: /^Тренировки$/ }).first().click();
    await main.locator('.plib-card').filter({ hasText: 'Ноги и ягодицы' }).click();
    await main.locator('.plib-hero').waitFor({ timeout: 10000 });

    await main.getByRole('button', { name: 'Изменить' }).click();
    const name = main.getByRole('textbox', { name: 'Название тренировки' });
    await name.waitFor({ timeout: 10000 });
    assert.equal(await name.inputValue(), 'Ноги и ягодицы');
    assert.ok((await main.locator('.plib-sect').first().textContent()).includes('Упражнения'));

    // Правка и «Отмена» — спрашивает; «Остаться» возвращает к правке
    await name.fill('Ноги и ягодицы — правка');
    await main.locator('.plib-etop__c').click();
    await page.getByText('Выйти без сохранения?').waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Остаться' }).click();
    assert.equal(await name.inputValue(), 'Ноги и ягодицы — правка', 'правка не потеряна');

    // Суперсет по кругам: связать два упражнения ⛓, переключить «По кругам»
    await main.locator('button.ss-link__b').first().click();
    await main.locator('.ss-head').first().waitFor({ timeout: 5000 });
    await main.locator('.ss-head').first().click();
    const rounds = page.getByRole('radio', { name: 'По кругам' });
    await rounds.waitFor({ timeout: 5000 });
    await rounds.click();
    assert.equal(await rounds.getAttribute('aria-checked'), 'true');
    await page.getByRole('button', { name: 'Готово' }).click();
    await page.waitForTimeout(600);

    // Сохранить: тренировка стоит в двух программах — лист решает
    await main.getByRole('button', { name: /Сохранить/ }).click();
    await page.getByText('Обновить в 2 программах').waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: 'Обновить в программах' }).click();
    await main.locator('.plib-hero').waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('.plib-hero__title')?.textContent.includes('правка'), null, { timeout: 5000 }).catch(() => {});
    const shownTitle = await main.locator('.plib-hero__title').textContent();
    assert.ok(shownTitle.includes('Ноги и ягодицы — правка'), 'после сохранения открыта та же тренировка с новым названием: ' + shownTitle);

    // Заново: правка и суперсет на месте, упражнения читаются
    await main.getByRole('button', { name: 'Изменить' }).click();
    assert.equal(await main.getByRole('textbox', { name: 'Название тренировки' }).inputValue(), 'Ноги и ягодицы — правка');
    await main.locator('.ss-head').first().waitFor({ timeout: 5000 });
    assert.equal(await main.locator('.ss-head').count(), 1, 'два упражнения стали одним суперсетом');
    assert.deepEqual(errors, [], 'ошибок страницы нет');
  } finally {
    await browser.close();
    server.close();
  }
});
