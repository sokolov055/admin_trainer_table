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
// Где лежит поле 360 × 640 на экране: сдвиг и масштаб, которые посчитал экран
const field = page => page.evaluate(() => { const c = document.querySelector('.blini-canvas--play'), r = c.getBoundingClientRect(), [ox, oy, s] = c.dataset.field.split(' ').map(Number); return { x: r.left + ox, y: r.top + oy, s }; });
async function tap(page, x, y) {
  const f = await field(page);
  await page.mouse.click(f.x + x * f.s, f.y + y * f.s);
}
// Карта на весь экран, поле во всю ширину между верхней строкой и кнопками, ничего не листается
const layout = page => page.evaluate(() => {
  const box = s => document.querySelector(s).getBoundingClientRect();
  const canvas = box('.blini-canvas--play'), topBar = box('.blini-top'), bottom = box('.blini-bottom'), c = document.querySelector('.blini-canvas--play');
  const [ox, oy, s] = c.dataset.field.split(' ').map(Number);
  const fieldTop = canvas.top + oy, fieldBottom = fieldTop + 640 * s;
  const root = document.querySelector('.blini-game');
  return {
    full: Math.abs(canvas.width - innerWidth) < 1 && Math.abs(canvas.height - innerHeight) < 1,
    inside: [topBar, bottom].every(r => r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + .5 && r.right <= innerWidth + .5),
    clear: fieldTop >= topBar.bottom - .5 && fieldBottom <= bottom.top + .5,
    scrolls: root.scrollHeight > root.clientHeight + 1 || document.documentElement.scrollWidth > innerWidth,
    width: 360 * s, plate: 30 * s,
  };
});

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
  test(`блины: карта на весь экран, поле между строкой и кнопками ${viewport.width}×${viewport.height}`, async t => {
    const page = await setup(t, viewport);
    await play(page);
    const result = await layout(page);
    assert.deepEqual({ full: result.full, inside: result.inside, clear: result.clear, scrolls: result.scrolls }, { full: true, inside: true, clear: true, scrolls: false }, JSON.stringify(result));
    assert.ok(result.width >= (viewport.height > 700 ? viewport.width * .95 : 260), `поле ${result.width} px`);
    assert.ok(result.plate >= (viewport.height > 700 ? 30 : 21), `блин ${result.plate} px`);
    await page.screenshot({ path: `reports/blini/play-${viewport.width}.png` });
  });
}

test('блины: касание бросает блин, касание Михалыча меняет блин, пауза и продолжение', async t => {
  const page = await setup(t);
  await play(page);
  const before = await game(page);
  assert.ok(before.tick > 200, 'партия идёт по часам');
  const target = before.balls.flat().find(b => b.x > 20 && b.x < 340 && b.y > 20 && b.y < 620);
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
  await page.locator('.blini-canvas--play').focus();
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
  await page.getByText('Новая медаль: серебро').waitFor();
  await page.screenshot({ path: 'reports/blini/won.png' });
  await page.getByRole('button', { name: 'Следующий уровень' }).click();
  const state = await read(page);
  assert.equal(state.level, 1); assert.equal(state.unlocked, 1); assert.equal(state.mode, 'ready');
  await page.getByRole('heading', { name: '«Кухня»' }).waitFor();
  await page.getByText('Медалей 2 из 36').waitFor();
  await page.getByText('С 0:40 — пятый цвет и быстрее').waitFor();
  assert.equal(await page.locator('.blini-medals li.is-earned').count(), 0, 'у нового уровня медалей ещё нет');
  await page.getByRole('button', { name: 'Предыдущий уровень' }).click();
  assert.equal(await page.locator('.blini-medals li.is-earned').count(), 2, 'у пройденного — бронза и серебро');
  await page.screenshot({ path: 'reports/blini/medals.png' });
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

test('блины: со второго круга на «Зале» Михалыч идёт по скамье за пальцем', async t => {
  const page = await setup(t);
  await page.evaluate(() => { localStorage.setItem('ft.blini.v1', JSON.stringify({ unlocked: 11 })); showBlini({ identity: 'rail' }); });
  await page.getByRole('button', { name: 'Играть', exact: true }).waitFor();
  await page.evaluate(() => bliniFixture.choose(6));
  await page.getByText('Михалыч ходит по скамье').waitFor();
  await play(page);
  const before = await game(page);
  assert.ok(before.rail, 'скамья включена');
  const f = await field(page);
  await page.mouse.move(f.x + before.shooter.x * f.s, f.y + 200 * f.s);
  await page.mouse.down();
  await page.mouse.move(f.x + 60 * f.s, f.y + 200 * f.s, { steps: 4 });
  await page.clock.runFor(1000);
  const moved = await game(page);
  assert.ok(Math.abs(moved.shooter.x - 60) < 1, `Михалыч под пальцем: ${moved.shooter.x}`);
  assert.equal(moved.fired, before.fired, 'пока палец на поле — не бросает');
  await page.screenshot({ path: 'reports/blini/rail.png' });
  await page.mouse.up();
  assert.equal((await game(page)).fired, before.fired + 1, 'отпустил — бросок');
});
