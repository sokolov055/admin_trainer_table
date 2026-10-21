import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

let server, browser, origin;
before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  mkdirSync('reports/blini', { recursive: true });
});
after(async () => { await browser?.close(); await server?.close(); });

async function setup(t, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, locale: 'ru-RU' });
  t.after(() => context.close());
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.install();
  await page.goto(origin + '/scripts/fixtures/blini-game.html');
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  t.after(() => assert.deepEqual(errors, []));
  return page;
}
const play = async page => { await page.getByRole('button', { name: 'Играть', exact: true }).click(); await page.clock.runFor(3000); };
const game = page => page.evaluate(() => bliniFixture.game());
const read = page => page.evaluate(() => bliniFixture.read());
// Точка поля 360 × 560 → координаты на экране
async function tap(page, x, y) {
  const box = await page.locator('.blini-canvas').boundingBox();
  await page.mouse.click(box.x + x / 360 * box.width, box.y + y / 560 * box.height);
}
const layout = page => page.evaluate(() => {
  const parts = ['.blini-top', '.blini-hud', '.blini-canvas', '.blini-feedback', '.blini-footer'].map(s => document.querySelector(s).getBoundingClientRect());
  const canvas = parts[2], root = document.querySelector('.blini-game');
  return {
    inside: parts.every(r => r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + .5 && r.right <= innerWidth + .5),
    ordered: parts.every((r, i) => i === 0 || r.top >= parts[i - 1].bottom - .5),
    ratio: Math.abs(canvas.width / canvas.height - 360 / 560) < .01,
    scrolls: root.scrollHeight > root.clientHeight + 1 || document.documentElement.scrollWidth > innerWidth,
    width: canvas.width,
  };
});

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
  test(`блины: всё на экране без прокрутки, поле в пропорции ${viewport.width}×${viewport.height}`, async t => {
    const page = await setup(t, viewport);
    await play(page);
    const result = await layout(page);
    assert.deepEqual({ inside: result.inside, ordered: result.ordered, ratio: result.ratio, scrolls: result.scrolls }, { inside: true, ordered: true, ratio: true, scrolls: false }, JSON.stringify(result));
    assert.ok(result.width >= (viewport.height > 700 ? 340 : 230), `поле ${result.width} px`);
    await page.screenshot({ path: `reports/blini/play-${viewport.width}.png` });
  });
}

test('блины: касание бросает блин, касание стойки меняет блин, пауза и продолжение', async t => {
  const page = await setup(t);
  await play(page);
  const before = await game(page);
  assert.ok(before.tick > 200, 'партия идёт по часам');
  const target = before.balls.flat().find(b => b.x > 20 && b.x < 340 && b.y > 20 && b.y < 540);
  await tap(page, target.x, target.y);
  assert.equal((await game(page)).fired, before.fired + 1, 'блин брошен');
  await page.clock.runFor(2000);
  const { shooter, current, next } = await game(page);
  await tap(page, shooter.x, shooter.y);
  const swapped = await game(page);
  assert.deepEqual([swapped.current, swapped.next], [next, current]);
  await page.getByRole('button', { name: 'Пауза' }).click();
  assert.equal((await read(page)).mode, 'paused');
  const stopped = (await game(page)).tick;
  await page.clock.runFor(3000);
  assert.equal((await game(page)).tick, stopped, 'на паузе цепочка стоит');
  await page.getByRole('button', { name: 'Продолжить игру' }).click();
  await page.clock.runFor(500);
  assert.ok((await game(page)).tick > stopped);
});

test('блины: клавиатура — стрелки поворачивают стойку, пробел бросает', async t => {
  const page = await setup(t);
  await play(page);
  await page.locator('.blini-canvas').focus();
  const aim = (await game(page)).aim;
  await page.keyboard.press('ArrowRight');
  assert.ok(Math.abs((await game(page)).aim - aim - .09) < 1e-6);
  const fired = (await game(page)).fired;
  await page.keyboard.press('Space');
  assert.equal((await game(page)).fired, fired + 1);
});

test('блины: правила открываются и ставят партию на паузу', async t => {
  const page = await setup(t);
  await play(page);
  await page.getByRole('button', { name: 'Как играть' }).click();
  await page.getByRole('heading', { name: 'Снимай блины' }).waitFor();
  assert.equal((await read(page)).mode, 'paused');
  await page.screenshot({ path: 'reports/blini/help.png' });
  await page.getByRole('button', { name: 'Понятно' }).click();
  assert.equal((await read(page)).mode, 'playing');
});

test('блины: победа открывает следующий уровень', async t => {
  const page = await setup(t);
  await play(page);
  await page.evaluate(() => bliniFixture.win());
  await page.clock.runFor(300);
  assert.equal((await read(page)).mode, 'won');
  await page.getByRole('heading', { name: /Уровень взят|Уложился в норматив/ }).waitFor();
  await page.screenshot({ path: 'reports/blini/won.png' });
  await page.getByRole('button', { name: 'Следующий уровень' }).click();
  const state = await read(page);
  assert.equal(state.level, 1); assert.equal(state.unlocked, 1); assert.equal(state.mode, 'ready');
  await page.getByRole('heading', { name: '«Змейка»' }).waitFor();
});

test('блины на отдыхе: четвёртая кнопка, а конец отдыха ставит партию на паузу', async t => {
  const page = await setup(t);
  const until = await page.evaluate(() => Date.now() + 20000);
  await page.evaluate(until => showBlini({ menu: false, rest: true, until, now: Date.now() }), until);
  const games = page.getByRole('group', { name: 'Игры на отдыхе' }).or(page.locator('.rest-screen__games'));
  assert.equal(await games.locator('button').count(), 4);
  await page.getByRole('button', { name: 'Блины', exact: true }).click();
  await play(page);
  assert.equal((await read(page)).mode, 'playing');
  await page.clock.runFor(18000);
  const state = await read(page);
  assert.equal(state.mode, 'paused'); assert.equal(state.reason, 'rest');
  await page.getByRole('heading', { name: 'Пора к подходу' }).waitFor();
});
