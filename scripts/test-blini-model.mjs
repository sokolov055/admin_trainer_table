import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlini, step, advance, drain, shoot, swap, aim, levelRules, missionRules, pointsFor, colorsOnField, platePoint, secondsOf, levelBeforeBosses, LEVELS, PLATES, TUNING } from '../src/blini-model.js';
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

test('уровни: три круга по пять, круг кончается боссом, цвета 4–5, план и сердца растут от круга к кругу', () => {
  assert.equal(LEVELS.length, 15);
  assert.deepEqual([...new Set(LEVELS.map(l => l.track))].sort(), Object.keys(TRACKS).sort());
  for (const [i, level] of LEVELS.entries()) {
    assert.ok(level.colors >= 4 && level.colors <= 5 && level.speed > 0 && level.par > 0, `уровень ${i + 1}`);
    assert.equal(!!level.boss, i % 5 === 4, `уровень ${i + 1}: босс — последний в круге`);
    if (i >= 5 && !level.boss) assert.ok(level.target > LEVELS[i - 5].target, `уровень ${i + 1}: план выше, чем на той же трассе кругом раньше`);
    if (i >= 5 && level.boss) assert.ok(level.boss.hp > LEVELS[i - 5].boss.hp, `уровень ${i + 1}: у Дивана больше сердец`);
  }
  assert.deepEqual([0, 3, 4, 7, 8, 11].map(levelBeforeBosses), [0, 3, 5, 8, 10, 13], 'старые номера — на свои трассы');
  for (let old = 0; old < 12; old++) assert.equal(LEVELS[levelBeforeBosses(old)].track, ['stadium', 'kitchen', 'snake', 'dumbbell'][old % 4]);
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
  assert.equal(session.hydrate({ v: 2, unlocked: 4, level: 2, savedAt: Date.now() + 1000, game: serializeGame(remote) }), true);
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

test('суперсет снимает все блины своего цвета на поле, сверх тройки', () => {
  const game = rig([1, 0, 2, 0, 3, 3, 4, 0]);
  game.chains[0].balls[4].power = 'superset'; game.chains[0].balls[4].powerUntil = 1e9;
  hit(game, 5, 3);
  const events = settle(game);
  assert.ok(events.some(e => e.kind === 'power' && e.power === 'superset'));
  assert.equal(game.chains[0].balls.filter(b => b.color === 3).length, 0, 'тройка снята');
  assert.equal(game.chains[0].balls.filter(b => b.color === 0).length, 3, 'чужой цвет не тронут');
  const extra = rig([1, 3, 2, 0, 0, 3, 4]);
  extra.chains[0].balls[3].power = 'superset'; extra.chains[0].balls[3].powerUntil = 1e9;
  hit(extra, 4, 0);
  settle(extra);
  assert.deepEqual(extra.chains[0].balls.map(b => b.color).filter(c => c === 0), [], 'все красные — и не в тройке тоже');
});

test('еда на поле: появляется в стороне от трассы, бросок её собирает и идёт дальше', async () => {
  const { FOOD } = await import('../src/blini-model.js');
  const game = createBlini(3, { track: 'stadium', speed: .2, start: .2, target: 99999, colors: 4, slow: 1, powerEvery: 1e9, par: 60, foodEvery: 50 });
  advance(game, 200);
  assert.ok(game.pickups.length >= 1 && game.pickups.length <= 2, 'еда появилась, но не больше двух');
  const food = game.pickups[0], { shooter } = game.track;
  for (const path of game.track.paths) for (let s = 0; s <= path.length; s += 8) assert.ok(Math.hypot(path.xs[s] - food.x, path.ys[s] - food.y) > 20, 'не на трассе');
  const before = game.score;
  const a = Math.atan2(food.y - shooter.y, food.x - shooter.x);
  game.shots.push({ x: food.x - Math.cos(a) * 30, y: food.y - Math.sin(a) * 30, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, color: 0 });
  const events = []; for (let i = 0; i < 12; i++) { step(game); events.push(...drain(game)); }
  const got = events.find(e => e.kind === 'food');
  assert.ok(got, 'собрана'); assert.equal(game.score - before >= FOOD[got.food].kg, true);
  assert.equal(game.pickups.some(f => f.id === food.id), false);
  advance(game, 2000);
  assert.ok(game.pickups.every(f => game.tick - f.born < 900), 'старая еда исчезает');
});

test('чистая трасса: сняли всю видимую цепочку раньше плана — бонус в тоннаж', () => {
  const game = rig([2]);
  game.full = false;
  const chain = game.chains[0];
  chain.visible = true; chain.balls[0].s = -5; // видимых блинов не осталось, хвост ещё за краем
  step(game);
  const bonus = drain(game).find(e => e.kind === 'cleartrack');
  assert.ok(bonus); assert.equal(bonus.points, game.rules.clearBonus); assert.equal(game.score, game.rules.clearBonus);
  step(game);
  assert.equal(drain(game).some(e => e.kind === 'cleartrack'), false, 'один раз, а не каждый шаг');
});

test('подстройка сложности: после неудач темп и план ниже, не больше трёх ступеней', () => {
  const base = levelRules(5), one = levelRules(5, 1), max = levelRules(5, 9);
  assert.ok(one.speed < base.speed && one.target < base.target);
  assert.equal(max.ease, 3); assert.ok(Math.abs(max.speed - base.speed * .82) < .01);
  assert.equal(levelRules(5, 0).ease, undefined);
  const session = createBliniSession({ seed: 2, now: () => 0 });
  const token = {}; session.claim(token, () => false);
  session.start(token); session.game().mode = 'lost'; session.frame(token);
  assert.equal(session.easeOf(0), 1);
  assert.ok(session.game().rules.speed <= levelRules(0).speed, 'следующая попытка — уже мягче');
  session.start(token);
  assert.equal(session.game().rules.ease, 1);
});

test('медали: бронза — пройден, серебро — в нормативе, золото — ещё и цепь ×3; лучшая не теряется', async () => {
  const { medalOf, GOLD_CHAIN } = await import('../src/blini-model.js');
  const rules = levelRules(0);
  assert.equal(medalOf({ won: false, seconds: 1, bestChain: 9 }, rules), 0);
  assert.equal(medalOf({ won: true, seconds: rules.par + 1, bestChain: 9 }, rules), 1);
  assert.equal(medalOf({ won: true, seconds: rules.par, bestChain: GOLD_CHAIN - 1 }, rules), 2);
  assert.equal(medalOf({ won: true, seconds: rules.par, bestChain: GOLD_CHAIN }, rules), 3);
  // Время целыми секундами, как на экране: 85,3 с при нормативе 1:25 — «за 1:25», в нормативе
  assert.equal(medalOf({ won: true, seconds: rules.par + 0.3, bestChain: GOLD_CHAIN }, rules), 3);
  assert.equal(medalOf({ won: true, seconds: rules.par + 1, bestChain: GOLD_CHAIN }, rules), 1);
  let clock = 0;
  const session = createBliniSession({ seed: 2, now: () => clock });
  const saves = []; session.onPersist(data => saves.push(data));
  const token = {}; session.claim(token, () => false);
  const win = (chain, ticks) => { session.start(token); const g = session.game(); g.tick = ticks; g.bestChain = chain; g.full = true; g.chains.forEach(c => { c.balls = []; }); clock += 20; session.frame(token); };
  win(3, 100);
  let snap = session.getSnapshot();
  assert.deepEqual([snap.mode, snap.result.medal, snap.result.newMedal, snap.medals[0]], ['won', 3, true, 3]);
  assert.equal(saves.at(-1).medals[0], 3, 'медаль уходит в сохранение');
  win(1, rules.par * 100 + 500);
  snap = session.getSnapshot();
  assert.deepEqual([snap.result.medal, snap.result.newMedal, snap.medals[0]], [1, false, 3], 'бронза после золота не затирает его');
  assert.equal(session.hydrate({ unlocked: 2, level: 1, savedAt: Date.now() + 1000, medals: { 0: 1, 1: 2, 40: 3, 2: 'x' } }), true);
  assert.deepEqual(session.getSnapshot().medals, { 0: 3, 1: 2 }, 'из аккаунта — лучшая по каждому уровню, мусор отброшен');
  session.mission({ goal: { level: 2, target: 500 }, boost: false });
  win(3, 100);
  assert.equal(session.getSnapshot().medals[2], undefined, 'задание карьеры медаль уровню не даёт');
});

test('темп растёт внутри уровня: через 40 с пятый цвет и быстрее, один раз; переживает сохранение', async () => {
  const { serializeGame, restoreGame } = await import('../src/blini-model.js');
  const game = createBlini(4, 0), chain = game.chains[0];
  assert.equal(game.rules.colors, 4); assert.equal(game.colors, 4);
  advance(game, game.rules.rampAt - 1); drain(game);
  assert.equal(game.ramp, false);
  step(game);
  const events = drain(game).filter(e => e.kind === 'ramp');
  assert.equal(events.length, 1); assert.equal(events[0].color, 4, 'вышел белый');
  assert.equal(game.colors, 5); assert.equal(game.ramp, true);
  const fast = rig([0, 1, 2, 3], { head: 300, rampAt: 5 }); fast.full = false;
  const lead = fast.chains[0].balls.at(-1), was = lead.s;
  advance(fast, 10);
  assert.ok(fast.ramp && Math.abs(lead.s - was - fast.rules.speed * (4 + 6 * fast.rules.rampSpeed)) < 1e-6, 'после роста цепочка катится быстрее');
  advance(game, 3000);
  assert.equal(drain(game).filter(e => e.kind === 'ramp').length, 0, 'только один раз');
  const copy = restoreGame(JSON.parse(JSON.stringify(serializeGame(game))));
  assert.deepEqual([copy.colors, copy.ramp], [5, true]);
  const five = createBlini(4, LEVELS.findIndex(l => l.colors === 5 && !l.boss)); advance(five, five.rules.rampAt);
  assert.deepEqual([five.colors, drain(five).find(e => e.kind === 'ramp')?.color], [5, -1], 'пять цветов — только быстрее');
  const off = createBlini(4, { ...LEVELS[0], rampAt: 0 }); advance(off, 5000);
  assert.equal(off.ramp, false, 'rampAt: 0 — без роста');
});

test('скамья: Михалыч идёт под палец, не сходит со скамьи, прицел держит точку; позиция сохраняется', async () => {
  const { walk, serializeGame, restoreGame, awayFromShooter } = await import('../src/blini-model.js');
  for (const track of Object.values(TRACKS)) if (track.rail) for (let x = track.rail.x0; x <= track.rail.x1; x += 2)
    for (const path of track.paths) for (let s = 0; s <= path.length; s += 2)
      assert.ok(Math.hypot(path.xs[s] - x, path.ys[s] - track.rail.y) > 50, `${track.id}: скамья в ${x} задевает трассу`);
  const level = LEVELS.findIndex(l => l.rail);
  assert.ok(level > 3, 'на первом круге Михалыч стоит');
  const fixed = createBlini(5, 2); aim(fixed, 20, 100); advance(fixed, 100);
  assert.deepEqual([fixed.shooter.x, fixed.rail], [fixed.track.shooter.x, null], 'без скамьи не ходит');
  const game = createBlini(5, level), { rail } = game.track;
  assert.ok(game.rail && game.shooter.x === game.track.shooter.x);
  aim(game, 5, 120);
  assert.equal(game.goal, rail.x0, 'дальше края скамьи не идёт');
  step(game);
  assert.ok(game.shooter.x < game.track.shooter.x && game.shooter.vx < 0);
  advance(game, 200);
  assert.equal(game.shooter.x, rail.x0);
  assert.ok(Math.abs(game.aim - Math.atan2(120 - rail.y, 5 - rail.x0)) < 1e-9, 'прицел — на ту же точку с нового места');
  shoot(game);
  assert.ok(Math.abs(game.shots[0].x - (rail.x0 + Math.cos(game.aim) * 34)) < 1e-9, 'бросок — оттуда, где стоит');
  walk(game, 50); advance(game, 50);
  assert.equal(game.shooter.x, rail.x0 + 50, 'шаг с клавиатуры');
  aim(game, 300, 100, false); advance(game, 50);
  assert.equal(game.shooter.x, rail.x0 + 50, 'поворот стрелками не двигает');
  const copy = restoreGame(JSON.parse(JSON.stringify(serializeGame(game))));
  assert.deepEqual([copy.shooter.x, copy.goal], [game.shooter.x, game.goal]);
  assert.equal(awayFromShooter(game.track, rail.x1 + 10, rail.y), 10, 'еда и предметы не ложатся на скамью');
});

test('босс «Диван»: попадание снимает сердце, подушка и дрожь отбивают, на половине — ярость', () => {
  const level = LEVELS.findIndex(l => l.boss), game = createBlini(8, level), boss = game.boss;
  assert.deepEqual([game.rules.rampAt, !!game.rail, boss.hp, boss.max], [0, true, 6, 6]);
  const throwAt = (x = boss.x, y = boss.y + TUNING.bossH / 2 + 2) => game.shots.push({ x, y, vx: 0, vy: -1, color: 0 });
  game.chains[0].balls = []; game.full = false; boss.throwAt = boss.shieldAt = 1e9;
  throwAt(); const one = settle(game, 2);
  assert.equal(one.find(e => e.kind === 'boss-hit')?.hp, 5); assert.equal(boss.hp, 5);
  throwAt(); settle(game, 2);
  assert.equal(boss.hp, 5, 'пока дрожит — блин отскакивает');
  boss.flinch = 0; boss.shield = 50;
  throwAt(); const blocked = settle(game, 2);
  assert.ok(blocked.some(e => e.kind === 'boss-block' && e.shield)); assert.equal(boss.hp, 5, 'подушка');
  boss.shield = 0;
  for (const hp of [4, 3]) { boss.flinch = 0; throwAt(); settle(game, 2); assert.equal(boss.hp, hp); }
  assert.equal(boss.rage, true, 'на половине сердец — ярость');
  game.score = 1e6; step(game);
  assert.equal(game.full, false, 'у босса нет плана по тоннажу');
});

test('босс: пончики оглушают Михалыча, сбитый пончик — в тоннаж, в ярости летят по два', () => {
  const game = createBlini(8, LEVELS.findIndex(l => l.boss)), boss = game.boss;
  boss.shieldAt = 1e9; boss.throwAt = game.tick + 1;
  const thrown = settle(game, 3).find(e => e.kind === 'donut');
  assert.equal(thrown?.count, 1); assert.equal(game.donuts.length, 1);
  let stunned = null;
  for (let i = 0; i < 400 && !stunned; i++) { step(game); stunned = drain(game).find(e => e.kind === 'stunned'); }
  assert.ok(stunned, 'долетел до стоящего Михалыча'); assert.ok(game.stun > 0);
  game.reload = 0; game.shots = [];
  assert.equal(shoot(game, 180, 100), false, 'оглушён — не бросает');
  settle(game, TUNING.stunTicks); game.reload = 0;
  assert.equal(shoot(game, 180, 100), true);
  game.shots = []; boss.throwAt = game.tick + 1; settle(game, 3);
  const donut = game.donuts[0], before = game.score;
  game.shots.push({ x: donut.x + donut.vx * 4, y: donut.y + donut.vy * 4, vx: 0, vy: 0, color: 1 });
  const down = settle(game, 6).find(e => e.kind === 'donut-down');
  assert.ok(down); assert.equal(game.score - before, TUNING.donutKg); assert.equal(game.donuts.length, 0);
  boss.rage = true; boss.throwAt = game.tick + 1;
  assert.equal(settle(game, 3).find(e => e.kind === 'donut').count, 2); assert.equal(game.donuts.length, 2);
});

test('босс повержен: оставшиеся блины — в тоннаж, уровень взят; партия с боссом сохраняется', async () => {
  const { serializeGame, restoreGame } = await import('../src/blini-model.js');
  const game = createBlini(8, LEVELS.findIndex(l => l.boss)), boss = game.boss;
  advance(game, 900); drain(game);
  const copy = restoreGame(JSON.parse(JSON.stringify(serializeGame(game))));
  assert.deepEqual([copy.boss.hp, copy.boss.phase, copy.boss.throwAt, copy.donuts.length], [boss.hp, boss.phase, boss.throwAt, game.donuts.length]);
  const plates = game.chains[0].balls.filter(b => b.s >= 0).length;
  assert.ok(plates > 5);
  boss.hp = 1; boss.flinch = 0; boss.shield = 0; boss.shieldAt = 1e9;
  const score = game.score;
  game.shots = [{ x: boss.x, y: boss.y + TUNING.bossH / 2 + 2, vx: 0, vy: -1, color: 0 }];
  const events = settle(game, 5);
  const down = events.find(e => e.kind === 'boss-down');
  assert.ok(down); assert.equal(down.plates.length, plates);
  assert.ok(game.score - score >= TUNING.bossBonus + down.kg);
  assert.equal(game.mode, 'won'); assert.equal(game.donuts.length, 0);
  assert.equal(levelRules(LEVELS.findIndex(l => l.boss), 3).boss.hp, 3, 'облегчение — минус сердце за ступень, не меньше половины');
});

test('сохранение до боссов (12 уровней) переводится на нынешние номера', async () => {
  const { readSaved, SAVE_VERSION } = await import('../src/blini-session.js');
  const old = readSaved({ unlocked: 8, level: 7, fails: { 7: 2, 11: 1 }, medals: { 3: 3, 4: 1 }, savedAt: 5 });
  assert.deepEqual([old.unlocked, old.level, old.fails, old.medals], [10, 8, { 8: 2, 13: 1 }, { 3: 3, 5: 1 }]);
  assert.equal(LEVELS[old.level].track, 'dumbbell');
  const fresh = readSaved({ v: SAVE_VERSION, unlocked: 9, level: 9, medals: { 4: 2 } });
  assert.deepEqual([fresh.unlocked, fresh.level, fresh.medals], [9, 9, { 4: 2 }], 'новое сохранение не трогается');
});
