import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { QUESTIONS } from '../src/plank-game.js';

const buildOptions = { bundle: true, write: false, format: 'iife', loader: { '.css': 'empty', '.png': 'dataurl' }, logLevel: 'silent', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' } };
const styles = () => readFileSync('src/styles.css', 'utf8') + readFileSync('src/plank-game.css', 'utf8').replace(/url\('\.\/assets\/([^']+)'\)/g, (_, file) => `url('data:image/png;base64,${readFileSync('src/assets/' + file).toString('base64')}')`);
const capture = process.env.PLANK_CAPTURE === '1';

test('игра: ответы, таймер, повторная партия, пауза, победа, звук, фото, мобильная и широкая сцена', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  try {
    const game = await build({ ...buildOptions, entryPoints: ['src/plank-preview.jsx'] });
    const css = styles();
    const mount = async () => { await page.goto('about:blank'); await page.setContent(`<style>${css}</style><div id="root"></div>`); await page.addScriptTag({ content: game.outputFiles[0].text }); };
    const choose = async (category, level) => { await page.getByLabel('Категория', { exact: true }).selectOption(category); await page.getByLabel('Сложность', { exact: true }).selectOption(String(level)); };
    const start = () => page.getByRole('button', { name: 'Поставить тренера в планку' }).click();
    const answer = async correct => {
      const text = await page.locator('.plank-game__question-text').innerText();
      const q = QUESTIONS.find(q => q.text === text); assert.ok(q);
      await page.locator('.plank-game__answers button').filter({ hasText: q.answers[correct ? q.correct : (q.correct + 1) % 3] }).click();
      return text;
    };
    await mount(); await page.clock.install(); await choose('muscle', 1); await start();
    const first = await answer(true);
    await page.getByRole('heading', { name: 'Верно! Продолжаем?' }).waitFor();
    await page.getByRole('button', { name: 'Следующий вопрос' }).click(); await answer(false);
    await page.getByRole('heading', { name: 'Игра окончена' }).waitFor();
    assert.equal(await page.locator('.plank-game__coach--standing').count(), 1);
    await page.getByRole('button', { name: 'Сыграть ещё' }).click();
    assert.notEqual(await page.locator('.plank-game__question-text').innerText(), first);
    await page.clock.runFor(2000);
    const remaining = await page.getByRole('timer').innerText();
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await page.clock.runFor(90000);
    await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
    assert.equal(await page.getByRole('timer').innerText(), remaining);
    await page.clock.runFor(10001); assert.match(await page.locator('.plank-game__result').innerText(), /Не успел ответить/);

    await mount(); await choose('gym', 1); await start();
    for (let i = 0; i < 10; i++) { await answer(true); await page.getByRole('button', { name: i === 9 ? 'Забрать победу' : 'Следующий вопрос', exact: true }).click(); }
    await page.getByRole('heading', { name: 'Ты победил!' }).waitFor();
    await page.getByRole('button', { name: 'Выбрать другую категорию' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'coach.png', mimeType: 'image/png', buffer: readFileSync('src/assets/plank-coach-v2.png') });
    assert.equal(await page.locator('.plank-game__avatar').count(), 1);
    await page.getByRole('button', { name: 'Убрать фото' }).click();
    assert.equal(await page.locator('.plank-game__avatar').count(), 0);

    await choose('music', 4);
    await page.evaluate(() => { Math.random = () => .9999; const Original = window.AudioContext; window.audioNodes = 0; window.AudioContext = class extends Original { createOscillator() { window.audioNodes++; return super.createOscillator(); } }; });
    await start(); assert.equal(await page.evaluate(() => window.audioNodes), 0, 'без разрешения звук не запускается');
    await page.getByRole('button', { name: 'Слушать задание' }).click();
    await page.waitForFunction(() => window.audioNodes > 0); await page.clock.runFor(2000);
    await page.getByRole('button', { name: 'Послушать ещё' }).waitFor();
    assert.equal(await page.getByRole('timer').innerText(), '10');
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    const nodesBefore = await page.evaluate(() => window.audioNodes);
    await page.getByRole('button', { name: 'Включить звук', exact: true }).click();
    await page.getByRole('button', { name: 'Выключить звук', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.audioNodes), nodesBefore, 'настройка звука на паузе беззвучна');
    await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
    await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
    await page.getByRole('button', { name: 'Включить звук', exact: true }).click();
    await page.getByRole('button', { name: 'Выключить звук', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Выключить звук', exact: true }).click();
    await page.locator('summary').click();
    await page.getByLabel('Фоновая музыка', { exact: true }).check();
    await page.getByLabel('Фоновая музыка', { exact: true }).uncheck();

    // Одна партия сохраняется и после обычного сворачивания приложения.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('heading', { name: 'Игра на паузе' }).waitFor();
    await page.clock.runFor(20000);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
    assert.equal(await page.getByRole('timer').innerText(), '10');

    // Единый пакет визуального ревью: мобильный, широкий, картинка и пауза.
    mkdirSync('reports/plank-v2', { recursive: true });
    await mount(); await choose('muscle', 0);
    if (capture) await page.screenshot({ path: 'reports/plank-v2/mobile.png', fullPage: true });
    await start(); if (capture) await page.screenshot({ path: 'reports/plank-v2/mobile-playing.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1280, height: 900 });
    if (capture) await page.screenshot({ path: 'reports/plank-v2/desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    if (capture) await page.screenshot({ path: 'reports/plank-v2/paused.png', fullPage: true });
    await mount(); await choose('food', 1); await page.evaluate(() => { Math.random = () => .9999; }); await start();
    if (capture) await page.screenshot({ path: 'reports/plank-v2/mobile-picture.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 640 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.plank-game__coach').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('отдых: конец → подход → новый отдых → та же партия; доступ только разрешённым клиентам', async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  try {
    const fixture = await build({ ...buildOptions, stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {RestScreen} from './src/RestScreen.jsx'; import PlankGame from './src/PlankGame.jsx'; import {PlankSessionProvider} from './src/PlankSession.jsx'; const root=createRoot(document.getElementById('root')); window.renderRest=(until, now, allowGame=true, show=true, menu=false)=>root.render(<PlankSessionProvider><div>{menu && <PlankGame/>}</div>{show && <RestScreen until={until} now={now} total={30000} allowGame={allowGame} onStop={()=>window.renderRest(until,now,allowGame,false,menu)}/>}</PlankSessionProvider>);`, resolveDir: process.cwd(), loader: 'jsx' }, plugins: [{ name: 'alarm-stubs', setup(b) { b.onResolve({ filter: /^(\.\/native-rest\.js|\.\/rest-alarm\.js)$/ }, a => ({ path: a.path, namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const alarmRings=()=>false; export const alarmClosed=async()=>false; export const ringOnce=()=>{}; export const stopVibration=()=>{};' })); } }] });
    await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: fixture.outputFiles[0].text });
    await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-14T12:00:01Z'));
    const at = await page.evaluate(() => Date.now());
    await page.evaluate(at => window.renderRest(at + 3000, at), at);
    await page.getByRole('button', { name: 'Тренер в планке', exact: true }).click();
    await page.getByLabel('Категория', { exact: true }).selectOption('gym');
    await page.getByRole('button', { name: 'Поставить тренера в планку' }).click();
    const question = await page.locator('.plank-game__question-text').innerText();
    const options = await page.locator('.plank-game__answers button').allTextContents();
    await page.clock.runFor(3100);
    await page.evaluate(at => window.renderRest(at + 3000, at + 3100), at);
    await page.getByRole('dialog', { name: 'Отдых окончен' }).waitFor();
    assert.match(await page.getByRole('status').innerText(), /Игра на паузе/);
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await page.clock.runFor(60000);
    await page.evaluate(() => window.renderRest(Date.now() + 30000, Date.now()));
    await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
    await page.getByRole('heading', { name: 'Игра на паузе' }).waitFor();
    await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
    assert.equal(await page.locator('.plank-game__question-text').innerText(), question);
    assert.deepEqual(await page.locator('.plank-game__answers button').allTextContents(), options);
    assert.equal(await page.getByRole('timer').innerText(), '7');
    await page.evaluate(() => window.renderRest(Date.now() + 30000, Date.now(), false));
    assert.equal(await page.locator('.plank-game').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Тренер в планке', exact: true }).count(), 0);
    // Игра из меню остаётся смонтированной под будильником, но её часы стоят.
    const menuAt = await page.evaluate(() => Date.now());
    await page.evaluate(at => window.renderRest(at + 3000, at, true, false, true), menuAt);
    await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
    await page.clock.runFor(3100);
    await page.evaluate(at => window.renderRest(at + 3000, at + 3100, true, true, true), menuAt);
    await page.getByRole('heading', { name: 'Игра на паузе' }).waitFor();
    await page.clock.runFor(20000);
    assert.equal(await page.getByRole('heading', { name: 'Игра окончена' }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
