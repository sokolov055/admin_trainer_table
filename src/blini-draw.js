// «Блины»: рисование сцены на холсте. Правил здесь нет — только то, что видно:
// карта с фоном и предметами, трасса, помост, блины, Гиря Михалыч, броски и вспышки.
// Фон карты рисуется один раз на размер экрана, каждый кадр — только движущееся.
import { FIELD, pointAt, pointInto } from './blini-tracks.js';
import { PLATES, POWERS, TUNING, platePoint, aimEnd } from './blini-model.js';

const R = TUNING.plate / 2;
const TAU = Math.PI * 2;
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ── Блин как настоящий бампер: борт, ступенька у втулки, стальная втулка с отверстием,
      вес слева и перевёрнутый справа, надпись по дуге сверху и снизу ── */
const SPRITE = 192;
const sprites = new Map();
function arcText(ctx, text, radius, size) {
  ctx.font = `800 ${size}px Manrope, sans-serif`;
  const widths = [...text].map(ch => ctx.measureText(ch).width + size * .1);
  const total = widths.reduce((a, b) => a + b, 0);
  let angle = -Math.PI / 2 - total / radius / 2;
  for (const [i, ch] of [...text].entries()) {
    const w = widths[i];
    ctx.save(); ctx.rotate(angle + w / radius / 2 + Math.PI / 2); ctx.translate(0, -radius);
    ctx.fillText(ch, 0, 0); ctx.restore();
    angle += w / radius;
  }
}
function plateSprite(color, size = SPRITE) {
  const key = color + ':' + size;
  if (sprites.has(key)) return sprites.get(key);
  const p = PLATES[color], c = canvasOf(size, size), ctx = c.getContext('2d'), r = size / 2 - Math.max(1, size / 96);
  const ink = p.kg === 5 ? '#2b2925' : p.kg === 15 ? '#2f2600' : '#ffffff';
  ctx.translate(size / 2, size / 2);
  // Резиновый диск с лёгким объёмом и тёмным бортом
  const face = ctx.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r);
  face.addColorStop(0, shade(p.color, p.kg === 5 ? 1.02 : 1.14)); face.addColorStop(.7, p.color); face.addColorStop(1, shade(p.color, .82));
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = face; ctx.fill();
  ctx.lineWidth = r * .045; ctx.strokeStyle = shade(p.color, .66); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * .9, 0, TAU); ctx.lineWidth = r * .02; ctx.strokeStyle = shade(p.color, .78); ctx.stroke();
  // Ступенька вокруг втулки
  ctx.beginPath(); ctx.arc(0, 0, r * .52, 0, TAU); ctx.lineWidth = r * .035; ctx.strokeStyle = shade(p.color, .72); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * .555, 0, TAU); ctx.lineWidth = r * .015; ctx.strokeStyle = shade(p.color, 1.25); ctx.stroke();
  // Надписи: марка по дуге сверху и (перевёрнутая) снизу, вес слева и справа
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  arcText(ctx, 'FIT TRACK', r * .73, r * .16);
  ctx.save(); ctx.rotate(Math.PI); arcText(ctx, 'FIT TRACK', r * .73, r * .16); ctx.restore();
  const weight = side => {
    ctx.save(); ctx.rotate(side); ctx.translate(-r * .73, 0);
    ctx.font = `850 ${r * .2}px Manrope, sans-serif`; ctx.fillText(String(p.kg), 0, -r * .1);
    ctx.font = `850 ${r * .16}px Manrope, sans-serif`; ctx.fillText('KG', 0, r * .11);
    ctx.restore();
  };
  weight(0); weight(Math.PI);
  // Стальная втулка с кольцами
  const steel = ctx.createRadialGradient(-r * .12, -r * .14, r * .02, 0, 0, r * .36);
  steel.addColorStop(0, '#f4f7f9'); steel.addColorStop(.55, '#b9c1c6'); steel.addColorStop(1, '#7d878e');
  ctx.beginPath(); ctx.arc(0, 0, r * .36, 0, TAU); ctx.fillStyle = steel; ctx.fill();
  ctx.lineWidth = r * .02; ctx.strokeStyle = '#6a737a'; ctx.stroke();
  for (const k of [.29, .22]) { ctx.beginPath(); ctx.arc(0, 0, r * k, 0, TAU); ctx.lineWidth = r * .018; ctx.strokeStyle = '#8b949a'; ctx.stroke(); }
  // Отверстие под гриф — насквозь
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(0, 0, r * .13, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.arc(0, 0, r * .13, 0, TAU); ctx.lineWidth = r * .025; ctx.strokeStyle = '#59626a'; ctx.stroke();
  sprites.set(key, c);
  return c;
}
const images = new Map();
/** Тот же блин картинкой — для кнопок и правил. */
export function plateImage(color) {
  if (!images.has(color)) images.set(color, plateSprite(color).toDataURL());
  return images.get(color);
}

// Уровни детализации: картинки блина готовятся под экранный размер (шаг 8 px),
// чтобы каждый кадр не уменьшать большую. PIXEL — пикселей экрана на единицу поля.
let PIXEL = 2;
const bucket = r => Math.max(16, Math.ceil(r * 2 * PIXEL / 8) * 8);
const overlays = new Map();
// Блик сверху-слева и затемнение края — блин катится, а свет остаётся на месте
function glossSprite(size) {
  const key = 'gloss:' + size;
  if (overlays.has(key)) return overlays.get(key);
  const c = canvasOf(size, size), ctx = c.getContext('2d'), r = size / 2 - 1;
  ctx.translate(size / 2, size / 2);
  const g = ctx.createRadialGradient(-r * .45, -r * .5, r * .05, -r * .2, -r * .25, r * .95);
  g.addColorStop(0, 'rgba(255,255,255,.34)'); g.addColorStop(.45, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
  const edge = ctx.createRadialGradient(0, 0, r * .8, 0, 0, r);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.22)');
  ctx.fillStyle = edge; ctx.fill();
  overlays.set(key, c);
  return c;
}
// Тень на полу и толщина диска (край снизу справа) одной картинкой; поле вокруг — 25 %
function underSprite(color, size) {
  const key = 'under:' + color + ':' + size;
  if (overlays.has(key)) return overlays.get(key);
  const full = Math.round(size * 1.25), c = canvasOf(full, full), ctx = c.getContext('2d'), r = size / 2 - 1, k = size / TUNING.plate;
  ctx.translate(full / 2, full / 2);
  ctx.beginPath(); ctx.ellipse(2.6 * k, 4.2 * k, r, r * .92, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fill();
  ctx.beginPath(); ctx.arc(.9 * k, 2 * k, r, 0, TAU); ctx.fillStyle = shade(PLATES[color].color, .55); ctx.fill();
  overlays.set(key, c);
  return c;
}

function plate(ctx, x, y, color, size = 1, roll = 0, power = null, t = 0, alpha = 1) {
  const r = R * size;
  ctx.save(); ctx.translate(x, y);
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (power) {
    const glow = .55 + .45 * Math.sin(t / 140);
    ctx.globalAlpha = alpha * (.35 + .45 * glow);
    ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, TAU); ctx.fillStyle = '#fff09a'; ctx.fill();
    ctx.globalAlpha = alpha;
  }
  const px = bucket(r);
  ctx.drawImage(underSprite(color, px), -r * 1.25, -r * 1.25, r * 2.5, r * 2.5);
  ctx.rotate(roll);
  ctx.drawImage(plateSprite(color, px), -r, -r, r * 2, r * 2);
  ctx.rotate(-roll);
  ctx.drawImage(glossSprite(px), -r, -r, r * 2, r * 2);
  if (power) {
    ctx.translate(r * .7, -r * .7);
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.fillStyle = '#183f36'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff6c4'; ctx.stroke();
    ctx.strokeStyle = '#fff6c4'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (power === 'drop') { ctx.moveTo(0, -3.6); ctx.lineTo(0, 2.8); ctx.moveTo(-3, .3); ctx.lineTo(0, 3.2); ctx.lineTo(3, .3); }
    if (power === 'negative') { ctx.moveTo(3.2, 0); ctx.lineTo(-2.8, 0); ctx.moveTo(-.2, -3); ctx.lineTo(-3.2, 0); ctx.lineTo(-.2, 3); }
    if (power === 'pause') { ctx.moveTo(-1.8, -3); ctx.lineTo(-1.8, 3); ctx.moveTo(1.8, -3); ctx.lineTo(1.8, 3); }
    if (power === 'technique') { ctx.arc(0, 0, 3, 0, TAU); ctx.moveTo(0, -4.6); ctx.lineTo(0, 4.6); ctx.moveTo(-4.6, 0); ctx.lineTo(4.6, 0); }
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Предметы на картах: зал, стадион, кухня, помост. Вид сверху, мультяшно ── */
const DECOR = {
  cone(ctx) {
    ctx.fillStyle = '#d95b18'; ctx.beginPath(); ctx.roundRect(-12, -12, 24, 24, 4); ctx.fill();
    ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff7ea'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, 0, 5.6, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#c84a10'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
  },
  hurdle(ctx) {
    ctx.fillStyle = '#5b6168'; ctx.fillRect(-27, -6, 5, 12); ctx.fillRect(22, -6, 5, 12);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#202326' : '#f4f1ea'; ctx.fillRect(-22 + i * 7.4, -3, 7.4, 6); }
  },
  stopwatch(ctx) {
    ctx.fillStyle = '#8d969c'; ctx.fillRect(-2.5, -16, 5, 5);
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fillStyle = '#c7cdd1'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, TAU); ctx.fillStyle = '#fbfbf7'; ctx.fill();
    ctx.strokeStyle = '#2a2e31'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5); ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.stroke(); }
    ctx.strokeStyle = '#d8343f'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(5, -5); ctx.stroke();
  },
  bottle(ctx) {
    ctx.fillStyle = 'rgba(120,190,240,.85)'; ctx.beginPath(); ctx.roundRect(-6, -14, 12, 28, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(-3.5, -10, 2, 20);
    ctx.fillStyle = '#2b5f9e'; ctx.beginPath(); ctx.roundRect(-4.5, -19, 9, 6, 2); ctx.fill();
  },
  towel(ctx) {
    ctx.fillStyle = '#f2efe8'; ctx.beginPath(); ctx.roundRect(-17, -11, 34, 22, 3); ctx.fill();
    ctx.fillStyle = '#4f9bd9'; ctx.fillRect(-17, -6, 34, 3); ctx.fillRect(-17, 3, 34, 3);
  },
  dumbbell(ctx) {
    ctx.fillStyle = '#a8b0b5'; ctx.fillRect(-15, -2, 30, 4);
    const head = x => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * 8, Math.sin(a) * 9); } ctx.closePath(); ctx.fillStyle = '#2e3337'; ctx.fill(); ctx.strokeStyle = '#4c5359'; ctx.lineWidth = 1.5; ctx.stroke(); };
    head(-17); head(17);
  },
  kettlebell(ctx) {
    ctx.strokeStyle = '#30363a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -9, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    const g = ctx.createRadialGradient(-3, -2, 1, 0, 2, 12); g.addColorStop(0, '#5c656c'); g.addColorStop(1, '#262b2f');
    ctx.beginPath(); ctx.arc(0, 2, 11, 0, TAU); ctx.fillStyle = g; ctx.fill();
  },
  bench(ctx) {
    ctx.fillStyle = '#3a3f44'; ctx.fillRect(-15, -34, 4, 68); ctx.fillRect(11, -34, 4, 68);
    ctx.fillStyle = '#7d2630'; ctx.beginPath(); ctx.roundRect(-12, -36, 24, 72, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(12, -6); ctx.stroke();
  },
  plate(ctx, k) { ctx.drawImage(plateSprite(k % 5, bucket(15)), -15, -15, 30, 30); },
  mat(ctx, k) {
    ctx.fillStyle = ['#7d63c7', '#2f9d93', '#d0567a'][k % 3]; ctx.beginPath(); ctx.roundRect(-17, -40, 34, 80, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.roundRect(-17, 26, 34, 14, 7); ctx.fill();
  },
  apple(ctx) {
    ctx.beginPath(); ctx.arc(-3, 1, 9, 0, TAU); ctx.arc(3, 1, 9, 0, TAU); ctx.fillStyle = '#d63a3a'; ctx.fill();
    ctx.beginPath(); ctx.arc(-5, -3, 3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    ctx.strokeStyle = '#6b3f1f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(1, -12); ctx.stroke();
    ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(5, -11, 5, 2.5, -.5, 0, TAU); ctx.fill();
  },
  broccoli(ctx) {
    ctx.fillStyle = '#8bc34a'; ctx.fillRect(-3, 2, 6, 14);
    for (const [x, y, r] of [[-7, -2, 7], [6, -3, 7], [0, -9, 7], [-2, 2, 6], [5, 3, 5]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#2e7d32'; ctx.fill(); ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, r * .45, 0, TAU); ctx.fillStyle = '#43a047'; ctx.fill(); }
  },
  banana(ctx) {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, -10, 18, Math.PI * .2, Math.PI * .8); ctx.stroke();
    ctx.strokeStyle = '#e0b030'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -10, 15, Math.PI * .25, Math.PI * .75); ctx.stroke();
    ctx.fillStyle = '#5d4325';
    for (const a of [Math.PI * .2, Math.PI * .8]) { ctx.beginPath(); ctx.arc(Math.cos(a) * 18, -10 + Math.sin(a) * 18, 2.2, 0, TAU); ctx.fill(); }
  },
  egg(ctx) {
    ctx.fillStyle = '#fffdf6';
    for (const [x, y, r] of [[0, 0, 12], [-8, 4, 8], [8, -3, 8], [3, 8, 7]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(1, 1, 5.5, 0, TAU); ctx.fillStyle = '#ffb300'; ctx.fill();
    ctx.beginPath(); ctx.arc(-.5, -.5, 1.8, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  },
  avocado(ctx) {
    ctx.fillStyle = '#2f5d1e'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8de7a'; ctx.beginPath(); ctx.ellipse(0, 1, 8.5, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a4a24'; ctx.beginPath(); ctx.arc(0, 4, 5, 0, TAU); ctx.fill();
  },
  shaker(ctx) {
    ctx.fillStyle = 'rgba(230,236,240,.92)'; ctx.beginPath(); ctx.roundRect(-9, -12, 18, 30, 4); ctx.fill();
    ctx.fillStyle = '#a07650'; ctx.fillRect(-9, 4, 18, 14);
    ctx.fillStyle = '#1f2326'; ctx.beginPath(); ctx.roundRect(-10, -19, 20, 8, 3); ctx.fill();
    ctx.fillStyle = '#d8343f'; ctx.fillRect(-9, -6, 18, 4);
  },
  container(ctx) {
    ctx.fillStyle = '#f4f6f7'; ctx.beginPath(); ctx.roundRect(-24, -16, 48, 32, 5); ctx.fill();
    ctx.strokeStyle = '#c7ced3'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 16); ctx.moveTo(0, 0); ctx.lineTo(24, 0); ctx.stroke();
    ctx.fillStyle = '#fffaf0'; for (let i = 0; i < 14; i++) ctx.fillRect(-21 + (i * 7) % 18, -12 + Math.floor(i / 3) * 5, 3, 2);
    ctx.fillStyle = '#d9a066'; ctx.beginPath(); ctx.roundRect(3, -13, 18, 10, 3); ctx.fill();
    for (const [x, y] of [[7, 7], [13, 6], [18, 8], [10, 11]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fillStyle = '#2e7d32'; ctx.fill(); }
  },
  water(ctx) {
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fillStyle = 'rgba(200,230,250,.8)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(-3, -3, 3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
  },
  chalk(ctx) {
    ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fillStyle = '#6d757b'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fillStyle = '#f5f5f2'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; for (const [x, y] of [[20, 4], [-19, -7], [6, -21]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); }
  },
  handprint(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath(); ctx.ellipse(0, 4, 7, 8, 0, 0, TAU); ctx.fill();
    for (const [x, y, a] of [[-5, -7, -.25], [-1.5, -9, -.08], [2, -9, .08], [5.5, -7, .25]]) { ctx.beginPath(); ctx.ellipse(x, y, 1.8, 4, a, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(-8, 3, 1.8, 4, -.9, 0, TAU); ctx.fill();
  },
  belt(ctx) {
    ctx.strokeStyle = '#6b3d1e'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(0, 0, 18, 12, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#c0c6ca'; ctx.fillRect(14, -5, 7, 10);
  },
  barbell(ctx, k) {
    ctx.fillStyle = '#b8c0c5'; ctx.fillRect(-62, -2, 124, 4);
    const side = x => { ctx.fillStyle = PLATES[k % 4].color; ctx.beginPath(); ctx.roundRect(x - 4, -18, 8, 36, 2); ctx.fill(); ctx.fillStyle = '#8b949a'; ctx.fillRect(x + (x > 0 ? 4 : -7), -4, 3, 8); };
    side(-48); side(48);
  },
};
// Темы карт: основа, предметы (размер — радиус места под предмет) и слои желоба трассы
const THEMES = {
  stadium: {
    kinds: ['cone', 'hurdle', 'stopwatch', 'cone', 'bottle', 'towel'], count: 14, spot: { cone: 14, hurdle: 28, stopwatch: 16, bottle: 18, towel: 20 },
    groove: [['#f4f1ea', 39], ['#b8452f', 35], ['rgba(255,255,255,.12)', 1.5]],
    base(ctx, v) {
      ctx.fillStyle = '#3f8f43'; ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.fillStyle = 'rgba(255,255,255,.055)';
      for (let x = Math.floor(v.x / 72) * 72; x < v.x + v.w; x += 72) ctx.fillRect(x, v.y, 36, v.h);
      // Разметка футбольного поля внутри беговой дорожки
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2.5;
      ctx.strokeRect(36, 30, 288, 580);
      ctx.beginPath(); ctx.moveTo(36, 320); ctx.lineTo(324, 320); ctx.stroke();
      ctx.beginPath(); ctx.arc(180, 320, 46, 0, TAU); ctx.stroke();
      ctx.strokeRect(100, 30, 160, 70); ctx.strokeRect(100, 540, 160, 70);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(180, 320, 3, 0, TAU); ctx.fill();
    },
  },
  gym: {
    kinds: ['dumbbell', 'kettlebell', 'bench', 'plate', 'mat', 'bottle', 'towel'], count: 15, spot: { dumbbell: 26, kettlebell: 14, bench: 38, plate: 16, mat: 42, bottle: 18, towel: 20 },
    groove: [['#121518', 42], ['#363c42', 36], ['rgba(255,255,255,.06)', 2]],
    base(ctx, v, random) {
      ctx.fillStyle = '#272c31'; ctx.fillRect(v.x, v.y, v.w, v.h);
      for (let i = 0; i < v.w * v.h / 220; i++) { ctx.fillStyle = ['rgba(120,128,136,.35)', 'rgba(70,120,190,.3)', 'rgba(200,80,60,.25)'][i % 3]; ctx.fillRect(v.x + random() * v.w, v.y + random() * v.h, 1.6, 1.6); }
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.2;
      for (let x = Math.floor(v.x / 60) * 60; x < v.x + v.w; x += 60) { ctx.beginPath(); ctx.moveTo(x, v.y); ctx.lineTo(x, v.y + v.h); ctx.stroke(); }
      for (let y = Math.floor(v.y / 60) * 60; y < v.y + v.h; y += 60) { ctx.beginPath(); ctx.moveTo(v.x, y); ctx.lineTo(v.x + v.w, y); ctx.stroke(); }
      // Дорожка для саней из искусственной травы — по левому краю
      ctx.fillStyle = '#2f7d3f'; ctx.fillRect(v.x, 250, v.w, 140);
      ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let x = Math.floor(v.x / 30) * 30; x < v.x + v.w; x += 60) ctx.fillRect(x, 250, 30, 140);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
      for (let x = Math.floor(v.x / 60) * 60; x < v.x + v.w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 254); ctx.lineTo(x, 386); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '850 13px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let x = Math.floor(v.x / 60) * 60, n = 0; x < v.x + v.w; x += 60, n++) if (x > v.x + 8) ctx.fillText(String(((n % 5) + 1) * 10), x, 264);
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.font = '900 54px Manrope, sans-serif';
      ctx.save(); ctx.translate(180, 520); ctx.rotate(-.08); ctx.fillText('FIT TRACK', 0, 0); ctx.restore();
    },
  },
  kitchen: {
    kinds: ['apple', 'broccoli', 'banana', 'egg', 'avocado', 'shaker', 'container', 'water'], count: 16, spot: { apple: 14, broccoli: 16, banana: 18, egg: 16, avocado: 16, shaker: 20, container: 30, water: 14 },
    groove: [['#9c8b75', 39], ['#efe6d8', 34], ['rgba(0,0,0,.05)', 2]],
    base(ctx, v, random) {
      const h = 46;
      for (let y = Math.floor(v.y / h) * h, i = 0; y < v.y + v.h; y += h, i++) {
        ctx.fillStyle = ['#c99561', '#c08b57', '#cf9d6a'][i % 3]; ctx.fillRect(v.x, y, v.w, h);
        ctx.strokeStyle = 'rgba(90,50,20,.35)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(v.x, y); ctx.lineTo(v.x + v.w, y); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,70,30,.16)'; ctx.lineWidth = 1;
        for (let g = 0; g < 4; g++) { const gy = y + 8 + g * 9 + random() * 4; ctx.beginPath(); ctx.moveTo(v.x, gy); ctx.bezierCurveTo(v.x + v.w * .3, gy + random() * 6 - 3, v.x + v.w * .6, gy + random() * 6 - 3, v.x + v.w, gy); ctx.stroke(); }
      }
      // Клетчатая скатерть под Михалычем
      ctx.save(); ctx.translate(153, 340); ctx.rotate(-.06);
      ctx.fillStyle = '#fbf6ee'; ctx.fillRect(-62, -150, 124, 300);
      ctx.fillStyle = 'rgba(214,58,58,.38)';
      for (let i = -62; i < 62; i += 16) ctx.fillRect(i, -150, 8, 300);
      for (let j = -150; j < 150; j += 16) ctx.fillRect(-62, j, 124, 8);
      ctx.strokeStyle = 'rgba(150,40,40,.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(-62, -150, 124, 300);
      ctx.restore();
    },
  },
  platform: {
    kinds: ['chalk', 'handprint', 'plate', 'handprint', 'belt', 'bottle', 'kettlebell', 'barbell'], count: 13, spot: { chalk: 20, handprint: 12, plate: 16, belt: 22, bottle: 18, kettlebell: 14, barbell: 64 },
    groove: [['#aab3b9', 40], ['#2c3135', 35], ['rgba(255,255,255,.07)', 2]],
    base(ctx, v, random) {
      ctx.fillStyle = '#1f2326'; ctx.fillRect(v.x, v.y, v.w, v.h);
      for (let i = 0; i < v.w * v.h / 260; i++) { ctx.fillStyle = 'rgba(140,148,155,.25)'; ctx.fillRect(v.x + random() * v.w, v.y + random() * v.h, 1.5, 1.5); }
      // Деревянный помост посередине — там стоит Михалыч
      ctx.fillStyle = '#c8955c'; ctx.fillRect(14, 262, 332, 116);
      ctx.strokeStyle = 'rgba(90,50,20,.35)'; ctx.lineWidth = 1.2;
      for (let x = 14; x <= 346; x += 41.5) { ctx.beginPath(); ctx.moveTo(x, 262); ctx.lineTo(x, 378); ctx.stroke(); }
      ctx.strokeStyle = '#8b5e33'; ctx.lineWidth = 3; ctx.strokeRect(14, 262, 332, 116);
      ctx.fillStyle = 'rgba(90,50,20,.22)'; ctx.font = '900 30px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FIT', 62, 320); ctx.fillText('TRACK', 288, 320);
    },
  },
};
export const THEME_NAMES = Object.freeze(Object.keys(THEMES));

/** Где нет трассы и стрелка: туда кладутся предметы. */
function freeSpots(track, view, theme, random) {
  const samples = [];
  for (const path of track.paths) for (let s = 0; s <= path.length; s += 6) samples.push(path.xs[s], path.ys[s]);
  const placed = [], want = Math.round(theme.count * (view.w * view.h) / (FIELD.width * FIELD.height));
  for (let tries = 0; tries < 1200 && placed.length < want; tries++) {
    const kind = theme.kinds[placed.length % theme.kinds.length], size = theme.spot[kind] || 16;
    const x = view.x + size + random() * (view.w - size * 2), y = view.y + size + random() * (view.h - size * 2);
    if (Math.hypot(x - track.shooter.x, y - track.shooter.y) < 66 + size) continue;
    let ok = true;
    for (let i = 0; i < samples.length && ok; i += 2) if ((samples[i] - x) ** 2 + (samples[i + 1] - y) ** 2 < (size + R + 8) ** 2) ok = false;
    for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < p.size + size + 6) ok = false;
    if (ok) placed.push({ kind, x, y, size, rot: ['bench', 'mat', 'barbell', 'hurdle'].includes(kind) ? (random() < .5 ? 0 : Math.PI / 2) : random() * TAU, k: Math.floor(random() * 12) });
  }
  return placed;
}

/**
 * Фон карты на весь экран: основа темы, предметы, желоб трассы, люк въезда и помост.
 * view — как поле лежит на экране: масштаб s и сдвиг ox, oy в CSS-пикселях.
 */
export function bakeBackground(track, view, target = null) {
  const { width, height, dpr, s, ox, oy } = view;
  const c = target || canvasOf(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr)));
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr, oy * dpr);
  PIXEL = s * dpr;
  // Заранее, пока печётся фон: картинки блинов всех размеров, через которые
  // проходит растущий после вставки блин, — в кадре они больше не создаются
  const sizes = new Set();
  for (let k = .2; k <= 1.001; k += .05) sizes.add(bucket(R * k));
  sizes.add(bucket(R * .55));
  for (const size of sizes) { glossSprite(size); for (let color = 0; color < PLATES.length; color++) { plateSprite(color, size); underSprite(color, size); } }
  const visible = { x: -ox / s, y: -oy / s, w: width / s, h: height / s };
  const theme = THEMES[track.theme] || THEMES.gym, random = rng(track.id.length * 977 + 13);
  theme.base(ctx, visible, random);
  for (const d of freeSpots(track, visible, theme, random)) {
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 4 * s * dpr; ctx.shadowOffsetY = 2 * s * dpr;
    DECOR[d.kind](ctx, d.k);
    ctx.restore();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const path of track.paths) {
    const p = new Path2D();
    p.moveTo(path.xs[0] - 40 * (path.xs[1] - path.xs[0]), path.ys[0] - 40 * (path.ys[1] - path.ys[0]));
    for (let i = 0; i <= path.length; i += 3) p.lineTo(path.xs[i], path.ys[i]);
    p.lineTo(path.xs[path.length], path.ys[path.length]);
    theme.groove.forEach(([color, w], i) => {
      ctx.save();
      if (i === 0) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6 * s * dpr; ctx.shadowOffsetY = 2 * s * dpr; }
      ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(p);
      ctx.restore();
    });
    // Люк, из которого выезжают блины, — с глубиной; виден на широком экране
    const a = pointAt(path, 0);
    const hole = ctx.createRadialGradient(a.x, a.y, 2, a.x, a.y, R + 7);
    hole.addColorStop(0, '#000'); hole.addColorStop(.7, '#15191c'); hole.addColorStop(1, '#2c3338');
    ctx.beginPath(); ctx.arc(a.x, a.y, R + 7, 0, TAU); ctx.fillStyle = hole; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#7d868c'; ctx.stroke();
    // Помост в конце пути
    const e = pointAt(path, path.length);
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 6 * s * dpr; ctx.shadowOffsetY = 3 * s * dpr;
    ctx.fillStyle = '#a7703c'; ctx.beginPath(); ctx.roundRect(-20, -20, 40, 40, 6); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#5d3b1d'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = '#d29a5c'; ctx.lineWidth = 1.4;
    for (const dy of [-7, 7]) { ctx.beginPath(); ctx.moveTo(-17, dy); ctx.lineTo(17, dy); ctx.stroke(); }
    // Гриф поперёк помоста — сюда и «грузятся» блины, если их не снять
    ctx.fillStyle = '#c3cacf'; ctx.fillRect(-26, -1.6, 52, 3.2);
    for (const bx of [-21, 21]) { ctx.fillStyle = '#3a4146'; ctx.beginPath(); ctx.roundRect(bx - 2.5, -8, 5, 16, 1.5); ctx.fill(); }
    ctx.restore();
  }
  // Свет сверху и мягкое затемнение по краям экрана — глубина без лишних деталей
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const w = c.width, h = c.height;
  const light = ctx.createLinearGradient(0, 0, 0, h);
  light.addColorStop(0, 'rgba(255,255,255,.06)'); light.addColorStop(.5, 'rgba(255,255,255,0)'); light.addColorStop(1, 'rgba(0,0,0,.12)');
  ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .42, w / 2, h / 2, Math.max(w, h) * .72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  return c;
}

/* ── Гиря Михалыч: 16 кг харизмы. Держит блин над головой, как в толчке,
      руки растут из боков; куда полетит блин — показывает стрелка на кольце ── */
const SKIN = '#f6bd8f', SKIN_LINE = '#c47d52';
function limb(ctx, points, width = 6.5) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [color, w] of [[SKIN_LINE, width + 2], [SKIN, width]]) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  }
}
function ball(ctx, x, y, r, fill = SKIN) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = SKIN_LINE; ctx.stroke();
}
function mihalych(ctx, game, fx, t, danger, reduced) {
  const { x, y } = game.track.shooter, a = game.aim;
  const flexing = fx.flex && t - fx.flex < 750;
  const since = TUNING.reload - game.reload; // шагов после броска
  const throwing = game.reload > 0 && since < 6;
  const worried = danger > .8 && !game.full;
  const bob = reduced ? 0 : Math.sin(t / 420) * 1.2;
  ctx.save(); ctx.translate(x, y);
  // Кольцо прицела со стрелкой — куда полетит блин
  ctx.setLineDash([3, 5]); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,253,246,.45)';
  ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.rotate(a); ctx.translate(46, 0);
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-3, -7); ctx.lineTo(0, 0); ctx.lineTo(-3, 7); ctx.closePath();
  ctx.fillStyle = '#ffe17a'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#183f36'; ctx.stroke();
  ctx.restore();
  ctx.translate(0, bob);
  ctx.beginPath(); ctx.ellipse(0, 33 - bob, 25, 6, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
  // Присед при броске: чуть ниже и шире — бросок «от ног»
  if (throwing && !reduced) { ctx.translate(0, 30); ctx.scale(1.05, .93); ctx.translate(0, -30); }
  // Ножки в кроссовках
  for (const k of [-1, 1]) {
    limb(ctx, [[k * 8, 24], [k * 10, 31]], 5);
    ctx.beginPath(); ctx.ellipse(k * 12, 32, 7.5, 4.2, 0, 0, TAU); ctx.fillStyle = '#fbfbf7'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#9aa3a8'; ctx.stroke();
    ctx.fillStyle = '#e0453a'; ctx.fillRect(k * 12 - 4, 30.6, 8, 1.8);
  }
  // Следующий блин лежит у ног
  plate(ctx, 30, 24, game.next, .55);
  // Ручка гири
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a3034'; ctx.lineWidth = 7.5; ctx.beginPath(); ctx.arc(0, -12, 14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.strokeStyle = '#626b73'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -13.5, 14, Math.PI * 1.22, Math.PI * 1.55); ctx.stroke();
  // Чугунное тело
  const body = ctx.createRadialGradient(-8, -2, 3, 0, 8, 27);
  body.addColorStop(0, '#727c84'); body.addColorStop(.6, '#40474d'); body.addColorStop(1, '#262b2f');
  ctx.beginPath(); ctx.arc(0, 8, 24, 0, TAU); ctx.fillStyle = body; ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 8, 24, 0, TAU); ctx.clip();
  ctx.fillStyle = '#e0453a'; ctx.fillRect(-25, -8, 50, 7);
  ctx.fillStyle = '#fff4ea'; ctx.fillRect(-25, -5.6, 50, 1.4);
  ctx.restore();
  const flutter = reduced ? 0 : Math.sin(t / 120) * 2;
  ctx.fillStyle = '#c93a30';
  ctx.beginPath(); ctx.moveTo(-21, -6); ctx.lineTo(-31, -10 + flutter); ctx.lineTo(-29, -3 + flutter); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-21, -3); ctx.lineTo(-30, 1 - flutter); ctx.lineTo(-26, 4 - flutter); ctx.closePath(); ctx.fill();
  // Лицо: большие глаза с бликами смотрят туда, куда целимся
  const blink = !reduced && (t % 4200) < 120;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  for (const k of [-1, 1]) {
    const ex = k * 8, ey = 6;
    ctx.beginPath(); ctx.ellipse(ex, ey, 6, blink ? 1 : 7, 0, 0, TAU); ctx.fillStyle = '#fffdf8'; ctx.fill();
    if (!blink) {
      const px = ex + dir.x * 2, py = ey + dir.y * 2.4;
      ctx.beginPath(); ctx.arc(px, py, 3.4, 0, TAU); ctx.fillStyle = '#241a14'; ctx.fill();
      ctx.beginPath(); ctx.arc(px - 1.2, py - 1.4, 1.1, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    }
    // Брови: спокойные, у помоста — домиком, на бицепсах — вверх
    const lift = flexing ? -3 : 0, tilt = worried ? 2.2 : -.6;
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ex - k * 4.5, ey - 10 + lift - tilt); ctx.quadraticCurveTo(ex, ey - 12 + lift, ex + k * 4.5, ey - 10 + lift + tilt * .3); ctx.stroke();
    // Румянец
    ctx.beginPath(); ctx.arc(k * 15, ey + 9, 3.6, 0, TAU); ctx.fillStyle = 'rgba(255,120,120,.38)'; ctx.fill();
  }
  // Усы и улыбка под ними
  if (throwing) { ctx.beginPath(); ctx.ellipse(0, 22, 3, 2.6, 0, 0, TAU); ctx.fillStyle = '#5a1a14'; ctx.fill(); }
  else if (worried) { ctx.fillStyle = '#fffdf8'; ctx.fillRect(-4.5, 19.5, 9, 3.2); ctx.strokeStyle = '#5a1a14'; ctx.lineWidth = .8; ctx.strokeRect(-4.5, 19.5, 9, 3.2); }
  else { ctx.beginPath(); ctx.arc(0, 16.5, flexing ? 6.5 : 5, Math.PI * .15, Math.PI * .85); ctx.lineWidth = 1.8; ctx.strokeStyle = '#5a1a14'; ctx.stroke(); }
  ctx.fillStyle = '#2a1a12';
  ctx.beginPath(); ctx.moveTo(0, 15);
  ctx.bezierCurveTo(-4, 12, -10, 13, -12, 17.5); ctx.bezierCurveTo(-8, 16, -4, 17.5, 0, 17);
  ctx.bezierCurveTo(4, 17.5, 8, 16, 12, 17.5); ctx.bezierCurveTo(10, 13, 4, 12, 0, 15); ctx.fill();
  ctx.fillStyle = 'rgba(200,208,214,.6)'; ctx.font = '800 6px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('16', 0, 27);
  if (worried && !reduced) {
    for (const [dx, phase] of [[-18, 0], [19, 500]]) {
      const k = ((t + phase) % 900) / 900;
      ctx.beginPath(); ctx.ellipse(dx, -2 + k * 16, 2, 3, 0, 0, TAU); ctx.fillStyle = `rgba(120,200,255,${1 - k})`; ctx.fill();
    }
  }
  // Руки растут из боков: блин над головой, после броска — руки вперёд, на цепи — бицепсы
  if (flexing) {
    for (const k of [-1, 1]) { limb(ctx, [[k * 21, 12], [k * 38, 4], [k * 33, -14]], 7); ball(ctx, k * 30, 6, 6.5); ball(ctx, k * 33, -15, 4.6); }
  } else if (throwing) {
    for (const k of [-1, 1]) { limb(ctx, [[k * 21, 12], [k * 27, -6], [k * 10, -24]]); ball(ctx, k * 10, -25, 4); }
  } else {
    const grow = game.reload > 0 ? Math.min(1, .45 + since / TUNING.reload) : 1;
    plate(ctx, 0, -40, game.current, grow, reduced ? 0 : t / 900);
    for (const k of [-1, 1]) { limb(ctx, [[k * 21, 12], [k * 31, -10], [k * 14, -37]]); ball(ctx, k * 28.5, -4, 4.6); ball(ctx, k * 14, -38, 4); }
  }
  ctx.restore();
}

function bubble(ctx, game, fx, t) {
  if (!fx.say || t - fx.say.born > 1700) return;
  const k = Math.min(1, (t - fx.say.born) / 140), out = Math.max(0, (t - fx.say.born - 1400) / 300);
  const { x, y } = game.track.shooter;
  ctx.save(); ctx.globalAlpha = Math.max(0, k - out);
  ctx.font = '800 12px Manrope, sans-serif';
  const w = ctx.measureText(fx.say.text).width + 18, h = 26;
  const bx = Math.max(6, Math.min(FIELD.width - w - 6, x + 22)), by = y - 92;
  ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#183f36'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 11); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 12, by + h - 1); ctx.lineTo(x + 6, by + h + 9); ctx.lineTo(x + 22, by + h - 1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 12, by + h); ctx.lineTo(x + 6, by + h + 9); ctx.lineTo(x + 22, by + h); ctx.stroke();
  ctx.fillStyle = '#183f36'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(fx.say.text, bx + 9, by + h / 2 + .5);
  ctx.restore();
}

/* ── Вспышки, надписи и реплики Михалыча ── */
const LINES = {
  chain: ['Лёгкий вес!', 'Ещё подход!', 'Чувствую мышцу!', 'Вот это техника!'],
  streak: ['Серия пошла!', 'Не сбавляем!', 'Работаем!'],
  danger: ['Кто так кладёт блины?!', 'Помост близко!', 'Страхуй!'],
  drop: ['Дроп-сет!'], negative: ['Негатив — назад!'], pause: ['Отдышусь…'], technique: ['Вижу цель!'],
  full: ['План закрыт! Добиваем!'], saved: ['Пояс спас спину!'], start: ['Погнали!', 'Разминка окончена!', 'Ну, за тоннаж!'],
};
function line(fx, kind) { fx.lines = (fx.lines || 0) + 1; const list = LINES[kind]; return list[fx.lines % list.length]; }
const POOL = { parts: 160, texts: 24, rings: 32 };
export function createFx(t = 0, greet = false) {
  const make = n => Array.from({ length: n }, () => ({ born: -1e9, x: 0, y: 0, vx: 0, vy: 0, spin: 0, color: '', text: '', size: 0, gold: false, big: false, dust: false }));
  const fx = { parts: make(POOL.parts), texts: make(POOL.texts), rings: make(POOL.rings), next: { parts: 0, texts: 0, rings: 0 }, banner: null, say: null, flex: 0, shake: null, lines: 0 };
  if (greet) fx.say = { text: line(fx, 'start'), born: t };
  return fx;
}
// Следующая свободная запись пула по кругу: самая старая перезаписывается
function take(fx, kind, t) { const list = fx[kind], i = fx.next[kind]; fx.next[kind] = (i + 1) % list.length; const item = list[i]; item.born = t; return item; }

export function addEvents(fx, game, events, t, reduced = false) {
  for (const e of events) {
    if (e.kind === 'clear') {
      const ring = take(fx, 'rings', t); ring.x = e.x; ring.y = e.y; ring.big = e.depth > 1; ring.dust = false;
      if (!reduced) {
        // Облачко магнезии и резиновая крошка цвета снятых блинов
        for (let k = 0; k < 3; k++) { const d = take(fx, 'rings', t); d.x = e.x + (k - 1) * 9; d.y = e.y + (k % 2) * 5; d.dust = true; d.big = k === 1; }
        e.plates.forEach((c, i) => {
          for (let k = 0; k < 5; k++) {
            const a = (i * 5 + k) * 2.4, v = 45 + ((i * 7 + k * 13) % 35), part = take(fx, 'parts', t);
            part.x = e.x; part.y = e.y; part.vx = Math.cos(a) * v; part.vy = Math.sin(a) * v - 25; part.spin = (k - 2) * 3; part.color = PLATES[c].color;
          }
        });
        if (e.depth > 1) fx.shake = { born: t, power: Math.min(5, 1.5 + e.depth) };
      }
      const text = take(fx, 'texts', t); text.x = e.x; text.y = e.y - 6; text.text = `+${e.points.toLocaleString('ru-RU')} кг`; text.size = 16; text.gold = false;
      if (e.depth > 1) {
        const chain = take(fx, 'texts', t); chain.x = e.x; chain.y = e.y - 28; chain.text = `Цепь ×${e.depth}`; chain.size = 20; chain.gold = true;
        fx.flex = t; fx.say = { text: line(fx, 'chain'), born: t };
      } else if (e.streak >= 3) {
        const streak = take(fx, 'texts', t); streak.x = e.x; streak.y = e.y - 28; streak.text = `Серия ×${e.streak}`; streak.size = 17; streak.gold = true;
        if (e.streak % 3 === 0) { fx.flex = t; fx.say = { text: line(fx, 'streak'), born: t }; }
      }
    }
    if (e.kind === 'power') { fx.banner = { born: t, text: `${POWERS[e.power].name}: ${POWERS[e.power].effect}` }; fx.say = { text: line(fx, e.power), born: t }; }
    if (e.kind === 'full') { fx.banner = { born: t, text: 'План выполнен! Сними остаток' }; fx.say = { text: line(fx, 'full'), born: t }; fx.flex = t; }
    if (e.kind === 'saved') { fx.banner = { born: t, text: 'Пояс выручил: блины откатились' }; fx.say = { text: line(fx, 'saved'), born: t }; }
    if (e.kind === 'danger') fx.say = { text: line(fx, 'danger'), born: t };
  }
  if (fx.banner && t - fx.banner.born > 1800) fx.banner = null;
}

function aimLine(ctx, game, strong) {
  const { x, y } = game.track.shooter, end = aimEnd(game);
  ctx.save();
  ctx.setLineDash(strong ? [7, 6] : [3, 7]);
  ctx.lineWidth = strong ? 2.6 : 1.8;
  ctx.strokeStyle = strong ? 'rgba(255,236,140,.95)' : 'rgba(255,253,246,.6)';
  ctx.beginPath(); ctx.moveTo(x + Math.cos(game.aim) * 58, y + Math.sin(game.aim) * 58); ctx.lineTo(end.x, end.y); ctx.stroke();
  ctx.restore();
}

/**
 * Кадр того, что движется. Фон карты — отдельный неподвижный слой под этим
 * холстом (bakeBackground), его каждый кадр не перерисовываем: склейку слоёв
 * делает видеокарта. В кадре нет новых объектов — точки блинов пишутся в одну.
 */
const AT = { x: 0, y: 0 };
export function drawScene(ctx, game, fx, { t, aiming = false, view, background = null, reduced = false }) {
  const { width, height, dpr, s, ox, oy } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (background) ctx.drawImage(background, 0, 0);
  else ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // Тряска на цепи: пара пикселей на четверть секунды
  let sx = 0, sy = 0;
  if (fx.shake && !reduced) {
    const k = (t - fx.shake.born) / 260;
    if (k < 1) { const p = fx.shake.power * (1 - k); sx = Math.sin(t / 23) * p; sy = Math.cos(t / 29) * p; } else fx.shake = null;
  }
  ctx.setTransform(s * dpr, 0, 0, s * dpr, (ox + sx) * dpr, (oy + sy) * dpr);
  PIXEL = s * dpr;
  let danger = 0;
  for (const chain of game.chains) {
    const share = chain.balls.length ? Math.max(0, chain.balls[chain.balls.length - 1].s) / chain.path.length : 0;
    if (share > danger) danger = share;
    if (share > .75) {
      const e = pointInto(chain.path, chain.path.length, AT), k = (share - .75) / .25, pulse = .5 + .5 * Math.sin(t / 110);
      ctx.globalAlpha = .2 + .35 * k * pulse;
      ctx.beginPath(); ctx.arc(e.x, e.y, 28 + 10 * pulse, 0, TAU); ctx.fillStyle = '#e8483a'; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  for (const chain of game.chains) {
    const balls = chain.balls;
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      if (ball.s < -R) continue;
      const at = platePoint(chain, ball, AT);
      plate(ctx, at.x, at.y, ball.color, ball.size > .2 ? ball.size : .2, ball.s / R, ball.power, t);
    }
  }
  if (game.technique > 0 || aiming) aimLine(ctx, game, game.technique > 0);
  // Брошенный блин тянет за собой шлейф
  for (const shot of game.shots) {
    if (!reduced) for (let k = 3; k >= 1; k--) plate(ctx, shot.x - shot.vx * k * 1.6, shot.y - shot.vy * k * 1.6, shot.color, 1 - k * .08, t / 60, null, t, .32 - k * .08);
    plate(ctx, shot.x, shot.y, shot.color, 1, t / 60);
  }
  mihalych(ctx, game, fx, t, danger, reduced);
  for (const ring of fx.rings) {
    const age = t - ring.born;
    if (ring.dust) {
      if (age > 700) continue;
      const k = age / 700;
      ctx.globalAlpha = .38 * (1 - k);
      ctx.beginPath(); ctx.arc(ring.x, ring.y - k * 10, (ring.big ? 14 : 10) + k * 22, 0, TAU); ctx.fillStyle = '#f7f6f0'; ctx.fill();
      continue;
    }
    if (age > 450) continue;
    const k = age / 450;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, (ring.big ? 24 : 16) + k * 28, 0, TAU);
    ctx.lineWidth = 3 * (1 - k); ctx.strokeStyle = '#fff9dc'; ctx.stroke();
  }
  for (const p of fx.parts) {
    const age = t - p.born;
    if (age > 600) continue;
    const k = age / 1000;
    ctx.globalAlpha = 1 - age / 600;
    ctx.fillStyle = p.color;
    ctx.save(); ctx.translate(p.x + p.vx * k, p.y + p.vy * k + 70 * k * k); ctx.rotate(p.spin * k);
    ctx.fillRect(-3, -2, 6, 4); ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Надпись у края поля сдвигается внутрь, чтобы не обрезалась
  for (const tx of fx.texts) {
    const age = t - tx.born;
    if (age > 950) continue;
    const k = age / 950, y = Math.max(tx.size, tx.y - 30 * k), x = Math.max(56, Math.min(FIELD.width - 56, tx.x));
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `850 ${tx.size}px Manrope, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#123630'; ctx.strokeText(tx.text, x, y);
    ctx.fillStyle = tx.gold ? '#ffe17a' : '#fff9e9'; ctx.fillText(tx.text, x, y);
  }
  ctx.globalAlpha = 1;
  bubble(ctx, game, fx, t);
  if (fx.banner) {
    const k = Math.min(1, (t - fx.banner.born) / 160), out = Math.max(0, (t - fx.banner.born - 1500) / 300);
    ctx.globalAlpha = Math.max(0, k - out);
    ctx.font = '800 14px Manrope, sans-serif';
    const w = Math.min(FIELD.width - 24, ctx.measureText(fx.banner.text).width + 28);
    ctx.fillStyle = 'rgba(255,249,233,.96)';
    ctx.beginPath(); ctx.roundRect((FIELD.width - w) / 2, 4, w, 32, 12); ctx.fill();
    ctx.fillStyle = '#183f36'; ctx.fillText(fx.banner.text, FIELD.width / 2, 20.5);
    ctx.globalAlpha = 1;
  }
  // Блины у помоста — красная виньетка по краям экрана
  if (danger > .82 && !game.full) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pulse = reduced ? .6 : .5 + .5 * Math.sin(t / 150), w = width * dpr, h = height * dpr;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .45, w / 2, h / 2, Math.max(w, h) * .75);
    g.addColorStop(0, 'rgba(200,40,30,0)'); g.addColorStop(1, `rgba(200,40,30,${.18 + .22 * pulse})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
}
