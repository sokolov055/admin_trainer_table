import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

/**
 * Экран — к тому, что появилось после действия (FT-595, запись владельца
 * 16.10.2026). Настоящий браузер, настоящие стили: липкая шапка занятия,
 * зона нижнего меню (--float-bottom), длинная страница вокруг.
 */

const api = `export const apiMutate = (...a) => globalThis.__api(...a); export const apiPublic = apiMutate;
export const haptic = () => {};`;
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HistoryPick } from './src/trainer/HistoryMove.jsx';
import { installActionReveal, reveal } from './src/reveal.js';
window.__reveal = reveal;
globalThis.__api = async (action) => {
  if (action === 'client.exercise.history.list') return { exercises: Array.from({ length: 30 }, (_, i) => ({ exerciseId: 100 + i, name: 'Упражнение ' + (i + 1), date: '2026-10-1' + (i % 10), sessions: 2 })) };
  if (action === 'client.exercise.history.move') return { moveId: 1, sessions: 2, notes: 0 };
  throw new Error('нет ' + action);
};
installActionReveal();
const filler = (n) => Array.from({ length: n }, (_, i) => React.createElement('p', { key: i, style: { height: 60, margin: 0 } }, 'Строка ' + i));
function Screen() {
  return React.createElement('div', { className: 'workout' },
    React.createElement('header', { className: 'workout__header' }, React.createElement('h2', null, 'Шапка')),
    filler(12),
    React.createElement('div', { id: 'pick' }, React.createElement(HistoryPick, { clientRow: 3, to: { id: 1, name: 'Жим' } })),
    filler(40),
    React.createElement('button', { id: 'fail', onClick: () => {
      const p = document.createElement('p'); p.setAttribute('role', 'alert'); p.id = 'alert'; p.textContent = 'Не сохранилось';
      document.getElementById('top').appendChild(p);
    } }, 'Сохранить'),
    filler(4));
}
createRoot(document.getElementById('root')).render(React.createElement(Screen));
`;

async function page(browser) {
  const out = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, write: false, format: 'iife', logLevel: 'silent',
    define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'stub', setup(b) {
      b.onResolve({ filter: /\/(api|telegram)\.js$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: api }));
    } }],
  });
  const css = readFileSync('src/styles.css', 'utf8') + readFileSync('src/workout.css', 'utf8');
  // Без анимации прокрутки: проверяем, куда встал экран, а не как он ехал
  const p = await browser.newPage({ viewport: { width: 390, height: 700 }, reducedMotion: 'reduce' });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.setContent(`<style>${css}</style><div id="top"></div><div id="root"></div>`);
  await p.addScriptTag({ content: out.outputFiles[0].text });
  return { p, errors };
}

const box = (p, sel) => p.locator(sel).evaluate((el) => {
  const r = el.getBoundingClientRect();
  const header = document.querySelector('.workout__header').getBoundingClientRect();
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;height:var(--float-bottom)';
  document.body.appendChild(probe);
  const floor = innerHeight - probe.getBoundingClientRect().height;
  probe.remove();
  return { top: r.top, bottom: r.bottom, headerBottom: header.bottom, floor, scroll: scrollY };
});
const settle = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))));

test('перенос истории: выбрали внизу длинного списка — вопрос сразу на экране', async () => {
  const browser = await chromium.launch();
  try {
    const { p, errors } = await page(browser);
    const link = p.getByRole('button', { name: 'Это упражнение делали под другим названием?' });
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await p.getByRole('button', { name: /Упражнение 30/ }).waitFor();
    await settle(p);
    // Открылся список — начало его под шапкой, на экране
    let b = await box(p, '#pick .history-move');
    assert.ok(b.top >= b.headerBottom - 1 && b.top < b.floor, JSON.stringify(b));

    // Листаем к концу списка и выбираем — список сворачивается в вопрос
    const last = p.getByRole('button', { name: /Упражнение 30/ });
    await last.scrollIntoViewIfNeeded();
    await p.mouse.wheel(0, 200);
    await last.click();
    await p.getByRole('button', { name: 'Да, перенести силовые' }).waitFor();
    await settle(p);
    b = await box(p, '#pick .history-move');
    assert.ok(b.top >= b.headerBottom - 1, 'вопрос не под шапкой: ' + JSON.stringify(b));
    assert.ok(b.bottom <= b.floor + 1, 'вопрос не под нижним меню: ' + JSON.stringify(b));

    // Ответ на месте вопроса, тот уже на экране — экран не дёргается
    const before = b.scroll;
    await p.getByRole('button', { name: 'Да, перенести силовые' }).click();
    await p.getByText(/Перенесено на «Жим»/).waitFor();
    await settle(p);
    assert.equal((await box(p, '#pick .history-move')).scroll, before);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('ошибка после нажатия — на экран; без нажатия и с data-reveal="off" — нет', async () => {
  const browser = await chromium.launch();
  try {
    const { p, errors } = await page(browser);
    // scrollY сравнивать нельзя: вставку выше экрана браузер сам
    // компенсирует (scroll anchoring). Смотрим, видно ли сообщение
    const onScreen = (sel) => p.locator(sel).evaluate((el) => el.getBoundingClientRect().bottom > 0);
    // Без действия: сообщение появилось само (фоновая загрузка) — экран стоит
    await p.evaluate(() => window.scrollTo(0, 1500));
    await p.evaluate(() => { const n = document.createElement('div'); n.id = 'bg'; n.setAttribute('role', 'alert'); n.textContent = 'фон'; document.getElementById('top').appendChild(n); });
    await settle(p);
    assert.equal(await onScreen('#bg'), false);

    // После нажатия, но с отказом — тоже стоит
    await p.locator('#fail').scrollIntoViewIfNeeded();
    await p.evaluate(() => { document.getElementById('top').setAttribute('data-reveal', 'off'); });
    await p.locator('#fail').click();
    await settle(p);
    assert.equal(await onScreen('#alert'), false);
    await p.evaluate(() => { document.getElementById('top').removeAttribute('data-reveal'); document.getElementById('alert').remove(); });

    // Нажали «Сохранить» внизу, ошибка встала наверху — экран к ней
    await p.locator('#fail').click();
    await settle(p);
    const r = await p.locator('#alert').evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(r >= 0 && r < 700, 'ошибка на экране: ' + r);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('видимый блок не двигаем, блок внизу — над нижним меню', async () => {
  const browser = await chromium.launch();
  try {
    const { p } = await page(browser);
    await p.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await p.evaluate(() => window.__reveal(document.querySelector('.workout__header'), { smooth: false })), 0);
    await p.evaluate(() => window.__reveal(document.querySelector('#fail'), { smooth: false }));
    const b = await box(p, '#fail');
    assert.ok(b.bottom <= b.floor + 1 && b.top > b.headerBottom, JSON.stringify(b));
  } finally { await browser.close(); }
});
