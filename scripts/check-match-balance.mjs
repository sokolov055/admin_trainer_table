import { createMatchGame, resolveMove, earnedStars } from '../src/match-model.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chooseMove } from './match-policy.mjs';

// Политика видит только текущее поле, не подглядывает в будущие случайные фигуры.

if (process.argv[1]?.endsWith('check-match-balance.mjs')) {
  const results = [];
  const games = 300;
  for (const level of [1, 2, 3]) for (const strategy of ['random', 'greedy']) {
    const scores = []; let successes = 0, specials = 0, cascades = 0;
    for (let seed = 1; seed <= games; seed++) {
      let game = createMatchGame(seed, level);
      while (game.moves) {
        const turn = resolveMove(game, ...chooseMove(game.board, strategy, game.turns, game.covers));
        if (!turn.valid) throw new Error('Нет доступного хода');
        for (const f of turn.frames) if (f.kind === 'clear') { specials += f.creations.length; if (f.combo > 1) cascades++; }
        game = turn.game;
      }
      scores.push(game.score); if (earnedStars(game)) successes++;
    }
    scores.sort((a,b) => a-b);
    results.push({ level, strategy, games, winRate: +(successes / games * 100).toFixed(1), median: scores[Math.floor(games / 2)], p10: scores[Math.floor(games / 10)], p90: scores[Math.floor(games * .9)], min: scores[0], max: scores.at(-1), specialsPerGame: +(specials / games).toFixed(2), cascadesPerGame: +(cascades / games).toFixed(2) });
  }
  const report = { date: '2026-10-16', scope: 'Численная симуляция; интересность и удобство на физическом устройстве не оценены', board: '9×9', targets: [1,2,3].map(level => createMatchGame(1, level).target), results };
  mkdirSync('reports/match', { recursive: true });
  writeFileSync('reports/match/balance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
