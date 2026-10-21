// «Блины»: доля побед бота на каждом уровне свободной игры и в заданиях карьеры.
// Запуск: node scripts/check-blini-balance.mjs [партий на уровень]
import { LEVELS, missionRules } from './blini-shim.mjs';
import { BOTS, winRate } from './blini-policy.mjs';
import { CAREER } from '../src/career-model.js';

const games = Number(process.argv[2]) || 40;
for (const [name, bot] of Object.entries(BOTS)) {
  console.log('уровни', name, LEVELS.map((level, i) => { const r = winRate(i, bot, games); return `${i + 1}:${r.rate}%/${r.seconds ?? '-'}с`; }).join(' '));
}
if (CAREER[0].blini) for (const [name, bot] of Object.entries(BOTS)) {
  console.log('карьера', name, CAREER.map((rank, i) => { const r = winRate(missionRules(rank.blini), bot, games, i); return `${i + 1}:${r.rate}%`; }).join(' '));
}
