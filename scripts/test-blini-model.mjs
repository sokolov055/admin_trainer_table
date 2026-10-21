import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlini, step, advance, drain, shoot, swap, aim, levelRules, missionRules, pointsFor, colorsOnField, platePoint, secondsOf, LEVELS, PLATES, TUNING } from '../src/blini-model.js';
import { TRACKS, FIELD, pointAt } from '../src/blini-tracks.js';
import { createBliniSession } from '../src/blini-session.js';
import { botTurn } from './blini-policy.mjs';

const D = TUNING.plate;
// Цепочка, выставленная руками: цвета от хвоста к голове, блины вплотную, голова на head
function rig(colors, { head = 600, track = 'stadium', target = 99999, ...rules } = {}) {
  const game = createBlini(7, { track, speed: .2, start: .2, target, colors: 5, slow: 1, powerEvery: 1e9, par: 60, ...rules });
  const chain = game.chains[0];
  chain.rush = false;
  game.full = true; // новые блины не выходят — проверяем только выставленные
  chain.balls = colors.map((color, i) => ({ id: 1000 + i, color, s: head - (colors.length - 1 - i) * D, size: 1, power: null, powerUntil: 0, pull: 0, combo: 0, gap: false, fresh: false, shot: false, enter: null }));
  game.chains.slice(1).forEach(c => { c.balls = []; });
  return game;
}
// Бросок прямо в блин index: снаряд ставится рядом с ним со стороны головы
function hit(game, index, color, side = 1) {
  const chain = game.chains[0], ball = chain.balls[index];
  const p = pointAt(chain.path, ball.s + side * D * .45);
  game.shots.push({ x: p.x, y: p.y, vx: 0, vy: 0, color });
}
const settle = (game, ticks = 120) => { const events = []; for (let i = 0; i < ticks && game.mode === 'playing'; i++) { step(game); events.push(...drain(game)); } return events; };

test('трассы: шаг в одну единицу, въезд из-за края, витки не слипаются, стрелку есть место', () => {
  for (const track of Object.values(TRACKS)) {
    assert.ok(track.paths.length >= 1 && track.paths.length <= 2, track.id);
    for (const path of track.paths) {
      for (let s = 1; s <= path.length; s += 7) {
        const d = Math.hypot(path.xs[s] - path.xs[s - 1], path.ys[s] - path.ys[s - 1]);
        assert.ok(d > .9 && d < 1.1, `${track.id}: шаг ${d}`);
      }
      const start = pointAt(path, 0), end = pointAt(path, path.length);
      assert.ok(start.x < 0 || start.y < 0 || start.x > FIELD.width || start.y > FIELD.height, `${track.id}: начало за краем`);
      assert.ok(end.x > D && end.y > D && end.x < FIELD.width - D && end.y < FIELD.height - D, `${track.id}: помост на поле`);
      for (let s = 0; s <= path.length; s += 5) {
        assert.ok(Math.hypot(path.xs[s] - track.shooter.x, path.ys[s] - track.shooter.y) > 40, `${track.id}: стрелок не на трассе`);
        for (let q = s + 80; q <= path.length; q += 5) assert.ok(Math.hypot(path.xs[s] - path.xs[q], path.ys[s] - path.ys[q]) > D + 12, `${track.id}: витки ${s} и ${q} слишком близко`);
      }
    }
  }
});

test('уровни: двенадцать, все трассы, цвета 4–5, план растёт от круга к кругу', () => {
  assert.equal(LEVELS.length, 12);
  assert.deepEqual([...new Set(LEVELS.map(l => l.track))].sort(), Object.keys(TRACKS).sort());
  for (const [i, level] of LEVELS.entries()) {
    assert.ok(level.colors >= 4 && level.colors <= 5 && level.speed > 0 && level.par > 0, `уровень ${i + 1}`);
    if (i >= 4) assert.ok(level.target > LEVELS[i - 4].target, `уровень ${i + 1}: план выше, чем на той же трассе кругом раньше`);
  }
  assert.equal(levelRules(99).track, LEVELS.at(-1).track, 'номер больше последнего — последний');
  assert.equal(missionRules({ level: 2, target: 777 }, true).lives, 1, 'пояс — одна страховка');
  assert.equal(missionRules({ level: 2, target: 777 }).target, 777);
});

test('цепочка въезжает быстро до своей доли пути, дальше катится в темпе уровня', () => {
  const game = createBlini(3, 0), chain = game.chains[0];
  advance(game, 60);
  assert.ok(chain.rush, 'въезд ещё идёт');
  const L = chain.path.length;
  let ticks = 0;
  while (chain.rush && ticks++ < 3000) step(game);
  assert.ok(chain.balls.at(-1).s >= game.rules.start * L - 4);
  const before = chain.balls.at(-1).s; advance(game, 100);
  assert.ok(Math.abs(chain.balls.at(-1).s - before - game.rules.speed * 100) < 1, 'сто шагов — сто темпов');
  assert.ok(chain.balls.every(b => PLATES[b.color]) && chain.balls.every(b => b.color < game.rules.colors));
});

test('попадание: блин встаёт в цепочку, тройка снимается, вес — в тоннаж', () => {
  const game = rig([1, 3, 0, 0, 3, 1]);
  hit(game, 3, 0);
  const events = settle(game);
  const clear = events.find(e => e.kind === 'clear');
  assert.ok(clear, 'тройка снята');
  assert.deepEqual(clear.plates, [0, 0, 0]);
  assert.equal(clear.points, 75, '3 × 25 кг');
  assert.equal(game.score, 75);
  assert.deepEqual(game.chains[0].balls.map(b => b.color), [1, 3, 3, 1], 'зелёные сошлись, но двух мало — не снимаются');
});

test('цепь: после снятия на стыке один цвет — стягивается и снимается, очки ×2, цепочка откатывается', () => {
  const game = rig([2, 1, 1, 0, 0, 1, 4]);
  hit(game, 4, 0);
  const events = settle(game, 400);
  const clears = events.filter(e => e.kind === 'clear');
  assert.equal(clears.length, 2, JSON.stringify(clears));
  assert.equal(clears[1].depth, 2);
  assert.equal(clears[1].points, 60 * 2, 'три синих по 20 кг, второе звено ×2');
  assert.equal(game.bestChain, 2);
  assert.deepEqual(game.chains[0].balls.map(b => b.color), [2, 4]);
});

test('разрыв с разными цветами не стягивается: передний кусок стоит, пока хвост не догонит', () => {
  const game = rig([2, 1, 0, 0, 3, 4]);
  hit(game, 3, 0);
  settle(game, 40);
  const front = game.chains[0].balls.find(b => b.color === 3), at = front.s;
  assert.deepEqual(game.chains[0].balls.map(x => x.color), [2, 1, 3, 4]);
  settle(game, 40);
  assert.equal(front.s, at);
});

test('серия: подряд удачные броски дороже, промах её сбрасывает', () => {
  assert.equal(pointsFor([{ color: 1 }, { color: 1 }, { color: 1 }], 1, 1), 60);
  assert.equal(pointsFor([{ color: 1 }, { color: 1 }, { color: 1 }], 1, 3), 72, '+20 % на третьем подряд');
  assert.equal(pointsFor([{ color: 4 }, { color: 4 }, { color: 4 }], 3, 1), 45);
  const game = rig([0, 0, 3, 1, 1, 3]);
  hit(game, 1, 0); settle(game);
  assert.equal(game.streak, 1);
  game.shots.push({ x: -100, y: -100, vx: -1, vy: 0, color: 2 }); settle(game, 5);
  assert.equal(game.streak, 0, 'промах — серия заново');
});

test('план выполнен: новые блины не выходят; сняты все — победа и норматив', () => {
  const game = createBlini(5, { track: 'stadium', speed: .3, start: .2, target: 30, colors: 2, slow: 1, powerEvery: 1e9, par: 600 });
  let ticks = 0;
  while (game.mode === 'playing' && ticks++ < 60000) { step(game); if (ticks % 40 === 0) botTurn(game); drain(game); }
  assert.equal(game.mode, 'won');
  assert.ok(game.full && game.chains.every(c => c.balls.length === 0));
  assert.ok(secondsOf(game) > 0);
});

test('блины на помосте — поражение; пояс один раз откатывает их назад', () => {
  const lose = rig([0, 1, 2, 3], { head: TRACKS.stadium.paths[0].length - 3, speed: .5 });
  settle(lose, 50);
  assert.equal(lose.mode, 'lost');
  const saved = rig([0, 1, 2, 3], { head: TRACKS.stadium.paths[0].length - 3, speed: .5, lives: 1 });
  const events = settle(saved, 50);
  assert.equal(saved.mode, 'playing');
  assert.ok(events.some(e => e.kind === 'saved'));
  assert.equal(saved.lives, 0);
  assert.ok(saved.chains[0].balls.at(-1).s < saved.chains[0].path.length * .7);
});

test('бонусы: дроп-сет снимает соседей любого цвета, негатив катит назад, пауза и техника — на время', () => {
  const game = rig([1, 2, 3, 0, 0, 4, 2, 1]);
  game.chains[0].balls[3].power = 'drop'; game.chains[0].balls[3].powerUntil = 1e9;
  hit(game, 4, 0);
  const events = settle(game);
  assert.ok(events.some(e => e.kind === 'power' && e.power === 'drop'));
  assert.ok(game.chains[0].balls.length <= 3, 'вокруг дроп-сета пусто');
  const back = rig([1, 2, 0, 0, 3, 4]);
  back.chains[0].balls[2].power = 'negative'; back.chains[0].balls[2].powerUntil = 1e9;
  hit(back, 3, 0); settle(back, 20);
  assert.ok(back.negative > 0);
  const head = back.chains[0].balls[0].s; settle(back, 30);
  assert.ok(back.chains[0].balls[0].s < head, 'хвост едет назад');
});

test('стрелку дают только цвета, что есть на поле; обмен и прицел', () => {
  const game = rig([2, 2, 4, 4]);
  game.current = 0; game.next = 1;
  shoot(game, 0, 0);
  assert.ok(colorsOnField(game).has(game.next), 'следующий — из тех, что на поле');
  const [a, b] = [game.current, game.next];
  swap(game); assert.deepEqual([game.current, game.next], [b, a]);
  const { x, y } = game.track.shooter;
  aim(game, x + 100, y); assert.ok(Math.abs(game.aim) < 1e-9);
  game.reload = 0; game.shots = [];
  assert.ok(shoot(game)); assert.equal(shoot(game), false, 'перезарядка');
});

test('партия воспроизводима: то же зерно и те же броски — тот же итог', () => {
  const play = () => { const g = createBlini(99, 4); for (let t = 0; t < 4000 && g.mode === 'playing'; t++) { step(g); if (t % 50 === 0) botTurn(g); drain(g); } return [g.tick, g.score, g.mode, g.cleared]; };
  assert.deepEqual(play(), play());
});

test('вставленный блин подлетает к месту, а не появляется в нём', () => {
  const game = rig([0, 1, 2]);
  hit(game, 1, 3);
  step(game);
  const fresh = game.chains[0].balls.find(b => b.fresh);
  assert.ok(fresh?.enter, 'есть точка, откуда летит');
  const p = platePoint(game.chains[0], fresh), q = pointAt(game.chains[0].path, fresh.s);
  assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > 0);
});

test('сессия: конец отдыха ставит паузу, кадр на паузе не двигает партию, продолжение — с того же места', () => {
  let clock = 1000, expired = false;
  const session = createBliniSession({ seed: 3, now: () => clock });
  const token = {};
  session.claim(token, () => expired);
  session.start(token);
  assert.equal(session.getSnapshot().mode, 'playing');
  clock += 500; session.frame(token);
  const tick = session.game().tick;
  assert.ok(tick > 0 && tick <= 25, 'отставший кадр не прокручивает больше 250 мс');
  expired = true; clock += 500; session.frame(token);
  assert.equal(session.getSnapshot().mode, 'paused'); assert.equal(session.getSnapshot().reason, 'rest');
  clock += 5000; session.frame(token);
  assert.equal(session.game().tick, tick, 'на паузе стоит');
  session.resume(token); assert.equal(session.getSnapshot().mode, 'paused', 'отдых кончился — не продолжить');
  expired = false; session.resume(token); assert.equal(session.getSnapshot().mode, 'playing');
  clock += 100; session.frame(token);
  assert.ok(session.game().tick > tick);
});

test('сессия: задание карьеры — свой план и пояс; после него — снова свободная игра', () => {
  const session = createBliniSession({ seed: 3, now: () => 0 });
  session.mission({ goal: { level: 4, target: 1234 }, boost: true });
  assert.equal(session.game().rules.target, 1234);
  assert.equal(session.game().lives, 1);
  assert.equal(session.getSnapshot().level, 4);
  const same = session.game();
  session.mission({ goal: { level: 4, target: 1234 }, boost: true });
  assert.equal(session.game(), same, 'те же правила — партия та же');
  session.mission(null);
  assert.equal(session.getSnapshot().mission, null);
  assert.equal(session.game().lives, 0);
});

test('сохранение партии: восстановленная продолжается так же, как исходная', async () => {
  const { serializeGame, restoreGame } = await import('../src/blini-model.js');
  const game = createBlini(41, 3);
  for (let t = 0; t < 1500; t++) { step(game); if (t % 50 === 0) botTurn(game); drain(game); }
  game.shots = []; // броски в полёте не сохраняются
  const copy = restoreGame(JSON.parse(JSON.stringify(serializeGame(game))));
  assert.ok(copy, 'восстановилась');
  assert.equal(copy.track.id, game.track.id); assert.equal(copy.chains.length, game.chains.length);
  for (let t = 0; t < 800; t++) { step(game); step(copy); drain(game); drain(copy); }
  assert.deepEqual([copy.tick, copy.score, copy.mode, copy.chains[0].balls.length], [game.tick, game.score, game.mode, game.chains[0].balls.length]);
  assert.equal(restoreGame({ ...serializeGame(game), version: 99 }), null, 'чужая версия правил');
  assert.equal(restoreGame({ ...serializeGame(game), rules: { ...game.rules, track: 'луна' } }), null, 'нет такой трассы');
  const odd = serializeGame(game); odd.chains[0].balls.push({ s: 'x', color: 9 });
  assert.equal(restoreGame(odd).chains[0].balls.length, game.chains[0].balls.length, 'испорченный блин отброшен');
});

test('сессия: сохранение из аккаунта новее — партия на паузе «сохранена»; старее — не трогает', async () => {
  const { serializeGame } = await import('../src/blini-model.js');
  const session = createBliniSession({ seed: 5, now: () => 0 });
  const saves = []; session.onPersist(data => saves.push(data));
  const remote = createBlini(9, 2); advance(remote, 600);
  assert.equal(session.hydrate({ unlocked: 4, level: 2, savedAt: Date.now() + 1000, game: serializeGame(remote) }), true);
  const snap = session.getSnapshot();
  assert.deepEqual([snap.mode, snap.reason, snap.level, snap.unlocked], ['paused', 'saved', 2, 4]);
  assert.equal(session.game().tick, remote.tick);
  assert.equal(session.hydrate({ unlocked: 1, level: 0, savedAt: 1 }), false, 'старое сохранение не применяется');
  const token = {}; session.claim(token, () => false); session.resume(token);
  session.pause('manual', token);
  assert.ok(saves.at(-1)?.game, 'пауза сохраняет незаконченную партию');
  assert.equal(saves.at(-1).unlocked, 4);
  session.mission({ goal: { level: 1, target: 900 }, boost: false });
  session.save();
  assert.equal(saves.at(-1).game, null, 'задание карьеры не сохраняется как партия');
});
