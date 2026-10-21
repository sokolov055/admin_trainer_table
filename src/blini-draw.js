// «Блины»: рисование сцены на холсте. Правил здесь нет — только то, что видно:
// трасса, помост, блины, стрелок, броски и вспышки после снятия.
import { FIELD } from './blini-tracks.js';
import { PLATES, POWERS, TUNING, platePoint, aimEnd } from './blini-model.js';

const R = TUNING.plate / 2;
const paths = new WeakMap();
function trackPath(path) {
  if (paths.has(path)) return paths.get(path);
  const p = new Path2D();
  const from = Math.max(0, Math.floor(-R));
  p.moveTo(path.xs[from], path.ys[from]);
  for (let s = from + 3; s <= path.length; s += 3) p.lineTo(path.xs[s], path.ys[s]);
  p.lineTo(path.xs[path.length], path.ys[path.length]);
  paths.set(path, p);
  return p;
}

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/** Вспышки и надписи живут в экране, не в правилах: их не нужно воспроизводить. */
export function createFx() { return { parts: [], texts: [], rings: [], banner: null }; }

export function addEvents(fx, game, events, t, reduced = false) {
  for (const e of events) {
    if (e.kind === 'clear') {
      fx.rings.push({ x: e.x, y: e.y, born: t, color: PLATES[e.plates[0]].color, big: e.depth > 1 });
      if (!reduced) e.plates.forEach((c, i) => {
        for (let k = 0; k < 5; k++) {
          const a = (i * 5 + k) * 2.4, v = 40 + ((i * 7 + k * 13) % 30);
          fx.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, born: t, color: PLATES[c].color });
        }
      });
      fx.texts.push({ x: e.x, y: e.y - 6, born: t, text: `+${e.points.toLocaleString('ru-RU')} кг`, size: 15 });
      if (e.depth > 1) fx.texts.push({ x: e.x, y: e.y - 26, born: t, text: `Цепь ×${e.depth}`, size: 19, gold: true });
      else if (e.streak >= 3) fx.texts.push({ x: e.x, y: e.y - 26, born: t, text: `Серия ×${e.streak}`, size: 16, gold: true });
    }
    if (e.kind === 'power') fx.banner = { born: t, text: `${POWERS[e.power].name}: ${POWERS[e.power].effect}` };
    if (e.kind === 'full') fx.banner = { born: t, text: 'План выполнен! Сними остаток' };
    if (e.kind === 'saved') fx.banner = { born: t, text: 'Пояс выручил: блины откатились' };
  }
  fx.parts = fx.parts.filter(p => t - p.born < 600);
  fx.texts = fx.texts.filter(p => t - p.born < 950);
  fx.rings = fx.rings.filter(p => t - p.born < 450);
  if (fx.banner && t - fx.banner.born > 1800) fx.banner = null;
}

function plate(ctx, x, y, color, size = 1, roll = 0, power = null, t = 0) {
  const r = R * size, p = PLATES[color];
  ctx.save();
  ctx.translate(x, y);
  if (power) {
    const glow = .55 + .45 * Math.sin(t / 140);
    ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,246,190,${.35 + .4 * glow})`; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 1.5, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,26,22,.35)'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = shade(p.color, .62); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * .72, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = shade(p.color, p.kg === 5 ? .78 : 1.28); ctx.stroke();
  // Метка на ободе крутится — блин катится, а не скользит
  ctx.rotate(roll);
  ctx.beginPath(); ctx.moveTo(r * .78, 0); ctx.lineTo(r * .97, 0); ctx.lineWidth = 2.2; ctx.strokeStyle = shade(p.color, p.kg === 5 ? .7 : 1.45); ctx.stroke();
  ctx.rotate(-roll);
  if (size > .55) {
    ctx.fillStyle = p.ink; ctx.font = `800 ${Math.round(10 * size)}px Manrope, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.kg), 0, .5);
  }
  if (power) {
    ctx.translate(r * .72, -r * .72);
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#183f36'; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff6c4'; ctx.stroke();
    ctx.strokeStyle = '#fff6c4'; ctx.fillStyle = '#fff6c4'; ctx.lineWidth = 1.6; ctx.beginPath();
    if (power === 'drop') { ctx.moveTo(0, -3.2); ctx.lineTo(0, 2.4); ctx.moveTo(-2.6, .2); ctx.lineTo(0, 2.8); ctx.lineTo(2.6, .2); }
    if (power === 'negative') { ctx.moveTo(2.8, 0); ctx.lineTo(-2.4, 0); ctx.moveTo(-.2, -2.6); ctx.lineTo(-2.8, 0); ctx.lineTo(-.2, 2.6); }
    if (power === 'pause') { ctx.moveTo(-1.6, -2.6); ctx.lineTo(-1.6, 2.6); ctx.moveTo(1.6, -2.6); ctx.lineTo(1.6, 2.6); }
    if (power === 'technique') { ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); }
    ctx.stroke();
  }
  ctx.restore();
}

function floor(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  g.addColorStop(0, '#20483f'); g.addColorStop(1, '#173a32');
  ctx.fillStyle = g; ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  // Резиновое покрытие зала: плитки 60 × 60
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
  for (let x = 60; x < FIELD.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.height); ctx.stroke(); }
  for (let y = 60; y < FIELD.height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(FIELD.width, y); ctx.stroke(); }
}

function platform(ctx, path, danger, t) {
  const x = path.xs[path.length], y = path.ys[path.length];
  ctx.save(); ctx.translate(x, y);
  if (danger > .75) {
    const k = (danger - .75) / .25, pulse = .5 + .5 * Math.sin(t / 110);
    ctx.beginPath(); ctx.arc(0, 0, 24 + 8 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(232,72,58,${.18 + .32 * k * pulse})`; ctx.fill();
  }
  ctx.fillStyle = '#9c6a39'; ctx.strokeStyle = '#5d3b1d'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-17, -17, 34, 34, 6); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#c99256'; ctx.lineWidth = 1.2;
  for (const dy of [-6, 6]) { ctx.beginPath(); ctx.moveTo(-14, dy); ctx.lineTo(14, dy); ctx.stroke(); }
  ctx.restore();
}

function shooter(ctx, game, t) {
  const { x, y } = game.track.shooter;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 2, 25, 0, Math.PI * 2); ctx.fillStyle = 'rgba(6,22,18,.4)'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fillStyle = '#fff9e9'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#183f36'; ctx.stroke();
  // Следующий блин — маленький, на обратной стороне стойки
  const back = game.aim + Math.PI;
  plate(ctx, Math.cos(back) * 13, Math.sin(back) * 13, game.next, .5);
  ctx.rotate(game.aim);
  ctx.fillStyle = '#8a9590'; ctx.strokeStyle = '#3d4a45'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(4, -4, 22, 8, 3); ctx.fill(); ctx.stroke();
  ctx.rotate(-game.aim);
  const tip = game.reload > 0 ? 22 - game.reload * .5 : 22;
  plate(ctx, Math.cos(game.aim) * tip, Math.sin(game.aim) * tip, game.current, 1, t / 400);
  ctx.restore();
}

function aimLine(ctx, game, strong) {
  const { x, y } = game.track.shooter, end = aimEnd(game);
  ctx.save();
  ctx.setLineDash(strong ? [7, 6] : [3, 7]);
  ctx.lineWidth = strong ? 2.4 : 1.6;
  ctx.strokeStyle = strong ? 'rgba(255,240,160,.9)' : 'rgba(255,249,233,.45)';
  ctx.beginPath(); ctx.moveTo(x + Math.cos(game.aim) * 36, y + Math.sin(game.aim) * 36); ctx.lineTo(end.x, end.y); ctx.stroke();
  ctx.restore();
}

/** Кадр сцены. Холст уже масштабирован под поле 360 × 560. */
export function drawScene(ctx, game, fx, { t, aiming = false } = {}) {
  floor(ctx);
  const danger = game.chains.map(c => c.balls.length ? Math.max(0, c.balls.at(-1).s) / c.path.length : 0);
  for (const chain of game.chains) {
    const p = trackPath(chain.path);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = TUNING.plate + 8; ctx.strokeStyle = '#102b25'; ctx.stroke(p);
    ctx.lineWidth = TUNING.plate + 2; ctx.strokeStyle = '#2b5a4e'; ctx.stroke(p);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.stroke(p);
  }
  game.chains.forEach((chain, i) => platform(ctx, chain.path, danger[i], t));
  for (const chain of game.chains) {
    for (const ball of chain.balls) {
      if (ball.s < -R) continue;
      const at = platePoint(chain, ball);
      plate(ctx, at.x, at.y, ball.color, Math.max(.2, ball.size), ball.s / R, ball.power, t);
    }
  }
  if (game.technique > 0 || aiming) aimLine(ctx, game, game.technique > 0);
  for (const shot of game.shots) plate(ctx, shot.x, shot.y, shot.color, 1, t / 60);
  shooter(ctx, game, t);
  for (const ring of fx.rings) {
    const k = (t - ring.born) / 450;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, (ring.big ? 22 : 14) + k * 26, 0, Math.PI * 2);
    ctx.lineWidth = 3 * (1 - k); ctx.strokeStyle = `rgba(255,249,220,${1 - k})`; ctx.stroke();
  }
  for (const p of fx.parts) {
    const k = (t - p.born) / 1000;
    ctx.globalAlpha = Math.max(0, 1 - k / .6);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x + p.vx * k - 2, p.y + p.vy * k + 60 * k * k - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Надпись у края поля сдвигается внутрь, чтобы не обрезалась
  const x = tx => Math.max(54, Math.min(FIELD.width - 54, tx.x));
  for (const tx of fx.texts) {
    const k = (t - tx.born) / 950, y = Math.max(tx.size, tx.y - 30 * k);
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.font = `850 ${tx.size}px Manrope, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#123630'; ctx.strokeText(tx.text, x(tx), y);
    ctx.fillStyle = tx.gold ? '#ffe17a' : '#fff9e9'; ctx.fillText(tx.text, x(tx), y);
  }
  ctx.globalAlpha = 1;
  if (fx.banner) {
    const k = Math.min(1, (t - fx.banner.born) / 160), out = Math.max(0, (t - fx.banner.born - 1500) / 300);
    ctx.globalAlpha = Math.max(0, k - out);
    ctx.font = '800 14px Manrope, sans-serif';
    const w = Math.min(FIELD.width - 24, ctx.measureText(fx.banner.text).width + 28);
    ctx.fillStyle = 'rgba(255,249,233,.96)';
    ctx.beginPath(); ctx.roundRect((FIELD.width - w) / 2, 12, w, 32, 12); ctx.fill();
    ctx.fillStyle = '#183f36'; ctx.fillText(fx.banner.text, FIELD.width / 2, 28.5);
    ctx.globalAlpha = 1;
  }
}

