// «Блины»: бот для проверки баланса. Видит только поле, как игрок: цвет в руке,
// следующий цвет и цепочки. Целится в группу своего цвета ближе к помосту,
// с упреждением по скорости цепочки; реакция и разброс прицела — как у человека.
import { TUNING, pointAt, shoot, swap, aim, createBlini, step, drain, secondsOf, dangerOf } from './blini-shim.mjs';

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

/** Свободна ли линия броска: ни один блин цепочки не стоит на пути. */
function clearLine(game, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  for (let t = 34; t < len; t += 6) {
    const x = x0 + (x1 - x0) * t / len, y = y0 + (y1 - y0) * t / len;
    for (const chain of game.chains) for (const b of chain.balls) {
      if (b.s < 0) continue;
      const p = pointAt(chain.path, b.s);
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < (TUNING.plate * .95) ** 2) return false;
    }
  }
  return true;
}

/** Ход против Дивана: уйти из-под пончика, бросить в него, если линия свободна, или встать туда, откуда она свободна. */
function bossTurn(game, noise) {
  const boss = game.boss, me = game.shooter, rail = game.rail;
  const threat = game.donuts.find(d => d.vy > 0 && Math.abs(d.x + d.vx * (me.y - d.y) / d.vy - me.x) < 34);
  if (threat && rail) {
    const side = me.x - rail.x0 > rail.x1 - me.x ? -1 : 1;
    aim(game, me.x + side * 80, me.y - 120);
    return true;
  }
  if (dangerOf(game) > .7) return false; // цепочка близко к помосту — сначала она
  if (boss.shield > 0 || boss.flinch > 40) return false;
  if (clearLine(game, me.x, me.y, boss.x, boss.y)) {
    const angle = Math.atan2(boss.y - me.y, boss.x - me.x) + noise, far = Math.hypot(boss.x - me.x, boss.y - me.y);
    aim(game, me.x + Math.cos(angle) * far, me.y + Math.sin(angle) * far, false);
    shoot(game);
    return true;
  }
  if (!rail) return false;
  let best = null;
  for (let x = rail.x0; x <= rail.x1; x += 20) if (clearLine(game, x, me.y, boss.x, boss.y) && (best == null || Math.abs(x - me.x) < Math.abs(best - me.x))) best = x;
  if (best == null) return false;
  aim(game, best, boss.y);
  return true;
}

/** Один ход бота: подумать, может быть поменять блин, прицелиться и бросить. */
export function botTurn(game, noise = 0) {
  if (game.boss && game.boss.hp > 0 && bossTurn(game, noise)) return true;
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
