import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';
import { mkdirSync } from 'node:fs';

let server, browser, origin;
before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await (process.env.MATCH_BROWSER === 'webkit' ? webkit : chromium).launch();
  mkdirSync('reports/match', { recursive: true }); mkdirSync('.impeccable/review', { recursive: true });
});
after(async () => { await browser?.close(); await server?.close(); });
async function setup(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', ...options });
  t.after(() => context.close());
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.clock.install();
  await page.goto(origin + '/scripts/fixtures/match-game.html');
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.match-primary')?.disabled);
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 500)));
  await page.clock.runFor(300);
  t.after(() => assert.deepEqual(errors, []));
  return page;
}
const read = page => page.evaluate(() => matchFixture.read());
const pair = (page, strategy = 'greedy') => page.evaluate(strategy => matchFixture.move(strategy), strategy);
const move = async (page, strategy = 'greedy', scene = page.locator('.match-game')) => {
  const [a, b] = await pair(page, strategy);
  await scene.locator(`[data-cell="${a}"]`).click();
  await scene.locator(`[data-cell="${b}"]`).click();
  await page.clock.runFor(10000);
};

test('три в ряд: касания, подсказка, неверный обмен и клавиатура', async t => {
  const page = await setup(t);
  await page.screenshot({ path: 'reports/match/ready-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.clock.runFor(400);
  await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
  assert.equal(await page.locator('.is-hint').count(), 2);
  await move(page);
  let state = await read(page); assert.equal(state.game.moves, 11); assert.ok(state.game.score > 0);
  const illegal = await page.evaluate(() => {
    const legal = matchFixture.legal();
    for (let i = 0; i < 35; i++) if (i % 6 !== 5 && !legal.some(([a,b]) => a === i && b === i+1)) return [i,i+1];
  });
  await page.locator(`[data-cell="${illegal[0]}"]`).click(); await page.locator(`[data-cell="${illegal[1]}"]`).click();
  await page.clock.runFor(1000);
  assert.equal((await read(page)).game.moves, 11); assert.match(await page.getByRole('status').innerText(), /Ход сохранён/);
  const [a,b] = await pair(page);
  await page.locator(`[data-cell="${a}"]`).focus(); await page.keyboard.press('Space');
  await page.keyboard.press(b-a === 6 ? 'ArrowDown' : 'ArrowRight'); await page.keyboard.press('Enter');
  await page.clock.runFor(10000); assert.equal((await read(page)).game.moves, 10);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.clock.runFor(300);
  await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true });
});

test('три в ряд: свайп, пауза посреди каскада, выход и сохранённая партия', async t => {
  const page = await setup(t);
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  const [a,b] = await pair(page); const box = await page.locator(`[data-cell="${a}"]`).boundingBox();
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+(b-a === 1 ? box.width : 0), box.y+box.height/2+(b-a === 6 ? box.height : 0)); await page.mouse.up();
  await page.clock.runFor(280); assert.equal((await read(page)).frame.kind, 'clear');
  await page.screenshot({ path: 'reports/match/clear-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const stopped = await read(page); await page.clock.runFor(30000);
  assert.deepEqual((await read(page)).game, stopped.game);
  await page.screenshot({ path: 'reports/match/paused-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click(); await page.clock.runFor(10000);
  const resumed = await read(page); assert.equal(resumed.busy, false); assert.equal(resumed.game.moves, 11);
  await page.getByRole('button', { name: 'Закрыть игру', exact: true }).click();
  await page.locator('.match-game').waitFor({ state: 'detached' });
  await page.evaluate(() => showMatch());
  await page.getByRole('button', { name: 'Продолжить игру', exact: true }).waitFor();
  assert.deepEqual((await read(page)).game, resumed.game);
  await page.evaluate(() => showMatch({ identity: 'another-client' }));
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  assert.equal((await read(page)).game.score, 0);
});

test('три в ряд: отдых имеет приоритет, две сцены делят одну партию, доступ закрыт', async t => {
  const page = await setup(t);
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await move(page); const saved = (await read(page)).game;
  const at = await page.evaluate(() => Date.now());
  await page.evaluate(at => showMatch({ menu: true, rest: true, until: at + 3000, now: at }), at);
  const rest = page.getByRole('dialog', { name: 'Отдых', exact: true });
  await rest.getByRole('button', { name: 'Продолжить три в ряд', exact: true }).click();
  const scene = page.locator('.rest-screen--match .match-game');
  await scene.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
  assert.deepEqual((await read(page)).game, saved);
  await page.screenshot({ path: 'reports/match/rest-390.png', fullPage: true });
  await page.clock.runFor(3100); assert.equal((await read(page)).mode, 'paused');
  await page.evaluate(at => showMatch({ menu: true, rest: true, until: at+3000, now: at+3100 }), at);
  await page.getByRole('dialog', { name: 'Отдых окончен', exact: true }).waitFor();
  assert.match(await page.locator('.rest-screen__game-paused').innerText(), /Игра на паузе/);
  await page.evaluate(() => showMatch({ menu: false, rest: true, until: Date.now()+30000 }));
  await page.getByRole('button', { name: 'Продолжить три в ряд', exact: true }).click();
  await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click();
  await move(page, 'greedy', scene); assert.equal((await read(page)).game.moves, saved.moves-1);
  await page.evaluate(() => showMatch({ menu: false, rest: true, until: Date.now()+30000, allowed: false }));
  await page.locator('.match-game').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.match-game').count(), 0);
  assert.equal(await page.getByRole('button', { name: /Три в ряд|Продолжить три в ряд/ }).count(), 0);
});

test('три в ряд: полный раунд, результат, новый раунд, узкий экран и уменьшение движения', async t => {
  const page = await setup(t, { reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  for (let i = 0; i < 12; i++) await move(page);
  const ended = await read(page); assert.equal(ended.game.moves, 0); assert.equal(ended.mode, 'won');
  assert.equal(ended.busy, false);
  await page.screenshot({ path: 'reports/match/win-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Следующая глава', exact: true }).click();
  assert.equal((await read(page)).game.level, 2); assert.equal((await read(page)).game.moves, 12);
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'reports/match/playing-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Как играть', exact: true }).click();
  assert.equal((await read(page)).mode, 'paused');
  await page.screenshot({ path: 'reports/match/rules-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Понятно', exact: true }).click();
  assert.equal((await read(page)).mode, 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await read(page)).mode, 'paused');
});

test('три в ряд: ошибка рисунков видима и повторная загрузка восстанавливает игру', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); t.after(() => context.close());
  const page = await context.newPage();
  await page.route('**/src/assets/match-pieces.png', route => route.abort());
  await page.goto(origin + '/scripts/fixtures/match-game.html');
  await page.getByRole('button', { name: 'Загрузить ещё раз', exact: true }).waitFor();
  assert.match(await page.getByRole('alert').innerText(), /Не загрузились рисунки/);
  await page.unroute('**/src/assets/match-pieces.png');
  await page.getByRole('button', { name: 'Загрузить ещё раз', exact: true }).click();
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  assert.equal((await read(page)).mode, 'playing');
});

test('три в ряд: проигрыш, фокус внутри результата и повторная попытка', async t => {
  const page = await setup(t);
  await page.evaluate(() => showMatch({ identity: 'loss', seed: 13 }));
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  for (let i = 0; i < 12; i++) await move(page, 'weak');
  assert.equal((await read(page)).mode, 'lost');
  assert.equal((await read(page)).game.score, 720);
  await page.screenshot({ path: 'reports/match/loss-390.png', fullPage: true });
  const dialog = page.getByRole('dialog');
  const last = dialog.getByRole('button').last(); await last.focus(); await page.keyboard.press('Tab');
  assert.equal(await dialog.getByRole('button').first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await last.evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'Повторить главу', exact: true }).click();
  const retried = await read(page);
  assert.equal(retried.mode, 'playing'); assert.equal(retried.game.moves, 12);
  assert.equal(retried.game.score, 0); assert.equal(retried.game.level, 1);
});
