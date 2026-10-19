// FT-563, карьера: сколько метров проезжает бот с заданной реакцией на каждой сложности самоката.
// Нужен, чтобы цели ступеней были проходимы и росли. Запуск: node scripts/check-career-balance.mjs
import { createGame, advance, setLane } from '../src/scooter-model.js';
import { CAREER } from '../src/career-model.js';
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const runs = {};
for (const reaction of [.32, .45]) for (const difficulty of ['easy', 'medium', 'extreme']) {
  const metres = [];
  for (let seed = 1; seed <= 120; seed++) {
    const g = createGame(seed, difficulty); g.phase = 'playing'; let pending = null, seenRow = -1;
    for (let tick = 0; tick < 36000 && g.phase === 'playing'; tick++) {
      if (pending && g.elapsed >= pending.at) { setLane(g, pending.lane); pending = null; }
      const nearby = g.route.filter(o => !o.passed && o.at > g.distance && o.at < g.distance + 48 && !['bottle', 'preworkout'].includes(o.type)).sort((a, b) => a.at - b.at);
      const next = nearby[0];
      if (next && !pending && next.row !== seenRow) {
        const same = nearby.filter(o => o.row === next.row);
        const scores = [0, 1, 2].map(lane => ({ lane, cost: same.reduce((s, o) => s + (Math.abs(o.lane - lane) < .85 ? 10 : 0), 0) + Math.abs(g.x - lane) * .1 }));
        scores.sort((a, b) => a.cost - b.cost); pending = { lane: scores[0].lane, at: g.elapsed + reaction }; seenRow = next.row;
      }
      advance(g, 1 / 60);
    }
    metres.push(Math.round(g.distance));
  }
  metres.sort((a, b) => a - b);
  runs[reaction + difficulty] = metres;
  console.log(reaction, difficulty, JSON.stringify({ p25: pct(metres, .25), median: pct(metres, .5), p75: pct(metres, .75), p90: pct(metres, .9) }));
}
// Доля успешных заездов для цели каждой ступени: должна только падать с ростом ступени
for (const reaction of [.32, .45]) console.log('реакция', reaction, CAREER.map((rank, i) => {
  const goal = rank.scooter, all = runs[reaction + goal.difficulty];
  return `${i + 1}:${Math.round(all.filter(m => m >= goal.metres).length / all.length * 100)}%`;
}).join(' '));

// «Три в ряд»: доля побед в задании каждой ступени у случайного и жадного игрока
import { createMatchGame, resolveMove, earnedStars } from '../src/match-model.js';
import { chooseMove } from './match-policy.mjs';
for (const strategy of ['random', 'greedy']) console.log('три в ряд', strategy, CAREER.map((rank, i) => {
  let wins = 0; const games = 150;
  for (let seed = 1; seed <= games; seed++) {
    let game = createMatchGame(seed * 31 + i, rank.match.chapter, rank.match);
    while (game.moves) game = resolveMove(game, ...chooseMove(game.board, strategy, game.turns, game.covers)).game;
    if (earnedStars(game)) wins++;
  }
  return `${i + 1}:${Math.round(wins / games * 100)}%`;
}).join(' '));
