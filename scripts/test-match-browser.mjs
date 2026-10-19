import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium, webkit } from 'playwright';
import { mkdirSync } from 'node:fs';
import { MATCH_TUNING } from '../src/match-model.js';

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
// Полноэкранная сцена: всё на экране, по порядку сверху вниз, поле квадратное, ничего не листается
const layout = (page, root) => page.evaluate(root => {
  const scope = document.querySelector(root);
  const box = sel => scope.querySelector(sel).getBoundingClientRect();
  const parts = ['.match-top', '.match-hud', '.match-quest', '.match-board-frame', '.match-feedback', '.match-footer'].map(box);
  const frame = box('.match-board-frame'), game = scope.matches('.match-game') ? scope : scope.querySelector('.match-game');
  return {
    inside: parts.every(r => r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + .5 && r.right <= innerWidth + .5),
    ordered: parts.every((r, i) => i === 0 || r.top >= parts[i - 1].bottom - .5),
    square: Math.abs(frame.width - frame.height) < 1,
    scrolls: game.scrollHeight > game.clientHeight + 1 || document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
    cell: box('.match-tile').width, column: box('.match-scene').width,
    rects: parts.map(r => [r.top, r.bottom, r.left, r.right].map(Math.round).join(',')).join(' | '), viewport: [innerWidth, innerHeight].join('×'),
  };
}, root);
const fits = async (page, minCell, root = '.match-game') => {
  const result = await layout(page, root);
  assert.deepEqual({ inside: result.inside, ordered: result.ordered, square: result.square, scrolls: result.scrolls }, { inside: true, ordered: true, square: true, scrolls: false }, JSON.stringify(result));
  assert.ok(result.cell >= minCell, `клетка ${result.cell} px меньше ${minCell}`);
  return result;
};
const listenBuzz = page => page.evaluate(() => {
  window.buzzes = [];
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { buzzes.push(JSON.stringify(pattern)); return true; } });
});
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
  await listenBuzz(page);
  await page.screenshot({ path: 'reports/match/ready-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.clock.runFor(400);
  await page.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true });
  await fits(page, 40);
  assert.equal(await page.getByText('В форме!', { exact: true }).count(), 0, 'во время партии заголовок не занимает место поля');
  const covered = (await read(page)).game.covers[0];
  assert.equal(await page.locator(`[data-cell="${covered}"]`).getAttribute('aria-disabled'), 'true');
  assert.equal((await page.evaluate(() => matchFixture.legal())).some(pair => pair.includes(covered)), false);
  assert.equal((await read(page)).game.moves, MATCH_TUNING.moves);
  await page.getByRole('button', { name: 'Подсказка', exact: true }).click();
  assert.equal(await page.locator('.is-hint').count(), 2);
  await move(page);
  let buzzes = await page.evaluate(() => buzzes.splice(0));
  assert.ok(buzzes.includes('8'), 'выбор и обмен — короткий отклик: ' + buzzes);
  assert.ok(buzzes.some(p => p === '14' || p === '[14,40,22]'), 'совпадение — вибрация: ' + buzzes);
  let state = await read(page); assert.equal(state.game.moves, MATCH_TUNING.moves - 1); assert.ok(state.game.score > 0);
  assert.equal(Number(await page.locator('[data-match=covers-progress]').innerText().then(text => text.split('/')[0].replace(/\D/g, ''))), state.game.uncovered);
  const illegal = await page.evaluate(size => {
    const legal = matchFixture.legal();
    for (let i = 0; i < size ** 2 - 1; i++) if (i % size !== size - 1 && !legal.some(([a,b]) => a === i && b === i+1)) return [i,i+1];
  }, MATCH_TUNING.size);
  await page.locator(`[data-cell="${illegal[0]}"]`).click(); await page.locator(`[data-cell="${illegal[1]}"]`).click();
  await page.clock.runFor(1000);
  assert.equal((await read(page)).game.moves, MATCH_TUNING.moves - 1); assert.match(await page.getByRole('status').innerText(), /Ход сохранён/);
  buzzes = await page.evaluate(() => buzzes.splice(0));
  assert.ok(buzzes.includes('[28,45,28]'), 'неверный обмен — двойной толчок: ' + buzzes);
  const [a,b] = await pair(page);
  await page.locator(`[data-cell="${a}"]`).focus(); await page.keyboard.press('Space');
  await page.keyboard.press(b-a === MATCH_TUNING.size ? 'ArrowDown' : 'ArrowRight'); await page.keyboard.press('Enter');
  await page.clock.runFor(10000); assert.equal((await read(page)).game.moves, MATCH_TUNING.moves - 2);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.clock.runFor(300);
  await page.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true });
  const wide = await fits(page, 55); assert.ok(wide.column <= 640, 'на широком экране колонка игры до 640 px');
});

test('три в ряд: свайп, пауза посреди каскада, выход и сохранённая партия', async t => {
  const page = await setup(t);
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  const [a,b] = await pair(page); const box = await page.locator(`[data-cell="${a}"]`).boundingBox();
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+(b-a === 1 ? box.width : 0), box.y+box.height/2+(b-a === MATCH_TUNING.size ? box.height : 0)); await page.mouse.up();
  await page.clock.runFor(280); assert.equal((await read(page)).frame.kind, 'clear');
  await page.screenshot({ path: 'reports/match/clear-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  const vibration = page.getByRole('checkbox', { name: 'Вибрация', exact: true });
  assert.equal(await vibration.isChecked(), true);
  await vibration.uncheck(); assert.equal(await page.evaluate(() => localStorage.getItem('ft.games.vibration')), 'off');
  await vibration.check(); assert.equal(await page.evaluate(() => localStorage.getItem('ft.games.vibration')), 'on');
  const stopped = await read(page); await page.clock.runFor(30000);
  assert.deepEqual((await read(page)).game, stopped.game);
  await page.screenshot({ path: 'reports/match/paused-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Продолжить игру', exact: true }).click(); await page.clock.runFor(10000);
  const resumed = await read(page); assert.equal(resumed.busy, false); assert.equal(resumed.game.moves, MATCH_TUNING.moves - 1);
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
  assert.match(await scene.getByRole('timer').innerText(), /^\d+:\d\d$/);
  await fits(page, 40, '.rest-screen--match .match-game');
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
  await page.evaluate(() => showMatch({ identity: 'win', seed: 43 }));
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  for (let i = 0; i < MATCH_TUNING.moves; i++) await move(page);
  const ended = await read(page); assert.equal(ended.game.moves, 0); assert.equal(ended.mode, 'won');
  assert.equal(ended.busy, false);
  await page.screenshot({ path: 'reports/match/win-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Следующая глава', exact: true }).click();
  assert.equal((await read(page)).game.level, 2); assert.equal((await read(page)).game.moves, MATCH_TUNING.moves);
  assert.equal((await read(page)).mode, 'ready');
  assert.match(await page.getByRole('dialog').innerText(), /Зарядить команду/);
  await page.screenshot({ path: 'reports/match/chapter2-intro-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  await page.setViewportSize({ width: 360, height: 740 }); await page.clock.runFor(300);
  await fits(page, 37);
  await page.setViewportSize({ width: 320, height: 568 }); await page.clock.runFor(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await fits(page, 31);
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
  await page.evaluate(() => showMatch({ identity: 'loss', seed: 12 }));
  await page.getByRole('button', { name: 'Играть', exact: true }).click();
  for (let i = 0; i < MATCH_TUNING.moves; i++) await move(page, 'weak');
  assert.equal((await read(page)).mode, 'lost');
  assert.ok((await read(page)).game.score < (await read(page)).game.target || (await read(page)).game.collected < 6);
  await page.screenshot({ path: 'reports/match/loss-390.png', fullPage: true });
  const dialog = page.getByRole('dialog');
  const last = dialog.getByRole('button').last(); await last.focus(); await page.keyboard.press('Tab');
  assert.equal(await dialog.getByRole('button').first().evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await last.evaluate(el => el === document.activeElement), true);
  await page.getByRole('button', { name: 'Повторить главу', exact: true }).click();
  const retried = await read(page);
  assert.equal(retried.mode, 'playing'); assert.equal(retried.game.moves, MATCH_TUNING.moves);
  assert.equal(retried.game.score, 0); assert.equal(retried.game.level, 1);
});
