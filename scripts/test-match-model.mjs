import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchGame, findMatches, legalMoves, resolveMove, adjacent, reshuffle, earnedStars } from '../src/match-model.js';
import { createMatchSession } from '../src/match-session.js';

const boardOf = rows => rows.flat().map((type, id) => ({ id: id + 1, type, power: null }));
const base = () => createMatchGame(153);

test('начальное поле: 2000 воспроизводимых полей без совпадений, с доступным ходом', () => {
  for (let seed = 0; seed < 2000; seed++) {
    const game = createMatchGame(seed);
    assert.equal(game.board.length, 36);
    assert.equal(new Set(game.board.map(t => t.id)).size, 36);
    assert.equal(findMatches(game.board).length, 0);
    assert.ok(legalMoves(game.board).length);
  }
  assert.deepEqual(createMatchGame(19), createMatchGame(19));
  assert.equal(adjacent(5, 6), false, 'край строки не соединяется с началом следующей');
});

test('обмен без совпадения возвращает поле, не расходует ход и не меняет вход', () => {
  const game = base(); const before = structuredClone(game);
  let pair;
  for (let i = 0; i < 35 && !pair; i++) if (adjacent(i, i + 1) && !legalMoves(game.board).some(([a,b]) => a === i && b === i + 1)) pair = [i, i + 1];
  const turn = resolveMove(game, ...pair);
  assert.equal(turn.valid, false); assert.equal(turn.frames.length, 2);
  assert.deepEqual(turn.game, before); assert.deepEqual(game, before);
});

test('совпадение четырёх создаёт заряд строки, пяти — цветной заряд', () => {
  for (const length of [4, 5]) {
    const game = base();
    game.board = boardOf([[0,0,1,0,length === 5 ? 0 : 3,4],[2,3,0,5,1,2],[3,4,2,1,5,3],[4,2,5,3,2,4],[2,5,3,4,3,5],[5,3,4,2,4,2]]);
    const turn = resolveMove(game, 2, 8);
    assert.equal(turn.valid, true);
    assert.equal(turn.frames.find(f => f.kind === 'clear').creations[0].power, length === 5 ? 'color' : 'row');
    assert.equal(turn.game.moves, 11);
  }
});

test('Т-совпадение объединяется, создаёт взрыв и не удваивает очки пересечения', () => {
  const board = boardOf([[1,2,0,3,4,5],[2,3,0,4,5,1],[3,0,0,0,1,2],[4,5,1,2,3,4],[5,1,2,3,4,5],[1,2,3,4,5,1]]);
  const groups = findMatches(board);
  assert.equal(groups.length, 1); assert.equal(groups[0].cells.length, 5); assert.equal(groups[0].runs.length, 2);
});

test('два цветных заряда убирают всё поле один раз, обычный заряд убирает свой цвет', () => {
  for (const both of [false, true]) {
    const game = base();
    game.board[0] = { ...game.board[0], power: 'color' };
    if (both) game.board[1] = { ...game.board[1], power: 'color' };
    const turn = resolveMove(game, 0, 1);
    const clear = turn.frames.find(f => f.kind === 'clear');
    assert.ok(clear);
    if (both) { assert.equal(clear.cells.length, 36); assert.equal(clear.points, 720); }
    else assert.ok(clear.cells.length >= game.board.filter(t => t.type === game.board[1].type).length);
    assert.equal(new Set(clear.cells).size, clear.cells.length);
  }
});

test('случайные партии: целостность поля, очков, каскадов и последний ход', () => {
  for (let seed = 0; seed < 150; seed++) {
    let game = createMatchGame(seed);
    for (let move = 0; move < 12; move++) {
      const before = structuredClone(game);
      const options = legalMoves(game.board);
      assert.ok(options.length);
      const turn = resolveMove(game, ...options[(seed + move * 7) % options.length]);
      assert.equal(turn.valid, true);
      assert.deepEqual(game, before);
      game = turn.game;
      assert.equal(game.moves, 11 - move);
      assert.equal(findMatches(game.board).length, 0);
      assert.equal(new Set(game.board.map(t => t.id)).size, 36);
      assert.equal(game.board.length, 36);
      assert.ok(game.score >= before.score + 40);
      assert.ok(game.board.every(t => t && t.type >= 0 && t.type < 6));
    }
    assert.equal(resolveMove(game, 0, 1).frames.length, 0);
    assert.equal(earnedStars(game) > 0, game.score >= game.target);
  }
});

test('перемешивание сохраняет счёт, ходы и специальные фигуры', () => {
  const game = base(); game.board[0].power = 'row'; game.board[4].power = 'color';
  const mixed = reshuffle(game);
  assert.equal(mixed.moves, game.moves); assert.equal(mixed.score, game.score);
  assert.equal(mixed.board.filter(t => t.power).length, 2);
  assert.ok(legalMoves(mixed.board).length); assert.equal(findMatches(mixed.board).length, 0);
});

function clockFixture() {
  let time = 0, next = 0; const jobs = new Map();
  const session = createMatchSession({ seed: 41, now: () => time, schedule: (fn, ms) => { jobs.set(++next, { fn, at: time + ms }); return next; }, cancel: id => jobs.delete(id) });
  const tick = ms => { const end = time + ms; while (true) { const entry = [...jobs].sort((a,b)=>a[1].at-b[1].at)[0]; if (!entry || entry[1].at > end) break; time = entry[1].at; jobs.delete(entry[0]); entry[1].fn(); } time = end; };
  return { session, tick, jobs };
}

test('пауза внутри каскада хранит очередь, очки и ходы; продолжение завершает тот же ход', () => {
  const { session, tick, jobs } = clockFixture(); const token = {};
  session.claim(token); session.start(1, token);
  const before = session.getSnapshot().game;
  const pair = legalMoves(before.board)[0]; const expected = resolveMove(before, ...pair).game;
  session.move(...pair, token); tick(200);
  session.pause('rest'); const paused = session.getSnapshot(); tick(30000);
  assert.equal(jobs.size, 0); assert.strictEqual(session.getSnapshot(), paused);
  session.resume(token); tick(100000);
  assert.deepEqual(session.getSnapshot().game, expected); assert.equal(session.getSnapshot().busy, false);
});

test('нижняя сцена не управляет игрой, выход ставит на паузу, истёкший отдых блокирует старт', () => {
  const { session, tick, jobs } = clockFixture(); const menu = {}, rest = {};
  session.claim(menu); session.start(1, menu);
  const release = session.claim(rest, () => false);
  assert.equal(session.getSnapshot().mode, 'paused'); session.resume(menu);
  assert.equal(session.getSnapshot().mode, 'paused'); session.resume(rest);
  const before = session.getSnapshot(); session.move(...legalMoves(before.game.board)[0], menu);
  assert.strictEqual(session.getSnapshot(), before);
  session.move(...legalMoves(before.game.board)[0], rest); release(); tick(10000);
  assert.equal(session.getSnapshot().mode, 'paused'); assert.equal(jobs.size, 0);
  session.claim({}, () => true); session.start(); assert.equal(session.getSnapshot().mode, 'paused');
});
