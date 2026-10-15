import { createMatchGame, resolveMove, earnedStars } from '../src/match-model.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { chooseMove } from './match-policy.mjs';

// Политика видит только текущее поле, не подглядывает в будущие случайные фигуры.

if (process.argv[1]?.endsWith('check-match-balance.mjs')) {
  const results = [];
  for (const strategy of ['random', 'greedy']) {
    const scores = []; let successes = 0, specials = 0, cascades = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      let game = createMatchGame(seed);
      while (game.moves) {
        const turn = resolveMove(game, ...chooseMove(game.board, strategy, game.turns));
        if (!turn.valid) throw new Error('Нет доступного хода');
        for (const f of turn.frames) if (f.kind === 'clear') { specials += f.creations.length; if (f.combo > 1) cascades++; }
        game = turn.game;
      }
      scores.push(game.score); if (earnedStars(game)) successes++;
    }
    scores.sort((a,b) => a-b);
    results.push({ strategy, games: scores.length, winRate: successes / 10, median: scores[500], p10: scores[100], p90: scores[900], min: scores[0], max: scores.at(-1), specialsPerGame: specials / 1000, cascadesPerGame: cascades / 1000 });
  }
  const report = { date: '2026-10-15', scope: 'Численная симуляция; интересность и удобство на физическом устройстве не оценены', target: createMatchGame(1).target, results };
  mkdirSync('reports/match', { recursive: true });
  writeFileSync('reports/match/balance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
