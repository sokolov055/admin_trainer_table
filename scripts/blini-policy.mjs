// «Блины»: бот для проверки баланса. Видит только поле, как игрок: цвет в руке,
// следующий цвет и цепочки. Целится в группу своего цвета ближе к помосту,
// с упреждением по скорости цепочки; реакция и разброс прицела — как у человека.
import { TUNING, pointAt, shoot, swap, aim, createBlini, step, drain, secondsOf } from './blini-shim.mjs';

function targets(game, color) {
  const out = [];
  game.chains.forEach(chain => {
    const b = chain.balls, L = chain.path.length;
    for (let i = 0; i < b.length; i++) {
      const ball = b[i];
      if (ball.color !== color || ball.s < TUNING.plate || ball.s > L) continue;
      let run = 1;
      if (b[i - 1]?.color === color && ball.s - b[i - 1].s <= TUNING.plate + 1) run++;
      if (b[i + 1]?.color === color && b[i + 1].s - ball.s <= TUNING.plate + 1) run++;
      out.push({ chain, ball, value: (run >= 2 ? 10 : 0) + (ball.s / L) * 6 + (ball.power ? 3 : 0) });
    }
  });
  return out.sort((a, b) => b.value - a.value);
}

/** Один ход бота: подумать, может быть поменять блин, прицелиться и бросить. */
export function botTurn(game, noise = 0) {
  let best = targets(game, game.current)[0];
  const other = targets(game, game.next)[0];
  if (other && (!best || other.value > best.value + 4)) { swap(game); best = other; }
  if (!best) return false;
  const { shooter } = game;
  const p = pointAt(best.chain.path, best.ball.s);
  // На скамье — как человек: сначала довести Михалыча под цель, бросить на следующем ходу
  if (game.rail) {
    const x = Math.max(game.rail.x0, Math.min(game.rail.x1, p.x));
    if (Math.abs(shooter.x - x) > 24) { aim(game, p.x, p.y); return false; }
  }
  const travel = Math.hypot(p.x - shooter.x, p.y - shooter.y) / TUNING.shotSpeed;
  const lead = pointAt(best.chain.path, best.ball.s + game.rules.speed * travel);
  const angle = Math.atan2(lead.y - shooter.y, lead.x - shooter.x) + noise, far = Math.hypot(lead.x - shooter.x, lead.y - shooter.y);
  // Касание цели, как у человека: на скамье Михалыч пойдёт под неё
  aim(game, shooter.x + Math.cos(angle) * far, shooter.y + Math.sin(angle) * far);
  return shoot(game);
}


export const BOTS = Object.freeze({ sharp: { delay: 45, spread: .05 }, casual: { delay: 75, spread: .09 } });

/** Партия бота: возвращает итог и длительность в секундах. Предел — 10 минут. */
export function playBot(seed, rules, bot) {
  const game = createBlini(seed, rules);
  let wait = bot.delay, noise = seed;
  while (game.mode === 'playing' && game.tick < 60000) {
    step(game); drain(game);
    if (--wait <= 0) {
      noise = (Math.imul(noise, 1103515245) + 12345) >>> 0;
      botTurn(game, ((noise / 4294967296) - .5) * 2 * bot.spread);
      wait = bot.delay;
    }
  }
  return { won: game.mode === 'won', seconds: secondsOf(game), score: game.score, bestChain: game.bestChain };
}

export function winRate(rules, bot, games = 40, salt = 0) {
  let wins = 0, time = 0;
  for (let seed = 1; seed <= games; seed++) { const r = playBot(seed * 97 + salt, rules, bot); if (r.won) { wins++; time += r.seconds; } }
  return { rate: Math.round(wins / games * 100), seconds: wins ? Math.round(time / wins) : null };
}
