// FT-563: игра для тестовых клиентов. Параметры проверены в изолированном прототипе.
import { TUNING } from './scooter-model.js';
import trafficUrl from './assets/scooter-traffic-v3.png';
import alleyUrl from './assets/scooter-alley-v3.png';

const traffic = typeof Image === 'undefined' ? null : new Image();
const people = typeof Image === 'undefined' ? null : new Image();
if (traffic) traffic.src = trafficUrl;
if (people) people.src = alleyUrl;
const SPRITES = { grandma: [0, 0], athlete: [1, 0], runner: [2, 0], robot: [0, 1], barrier: [1, 1], rider: [2, 1] };
function sprite(ctx, type, x, y, time = 0, size = 1, direction = 1) {
  const vehicle = type === 'car' || type === 'taxi';
  const atlas = vehicle ? traffic : people;
  if (!atlas?.complete || !atlas.naturalWidth || (!vehicle && !SPRITES[type])) return false;
  const [column, row] = vehicle ? [type === 'taxi' ? 0 : 2, 0] : SPRITES[type];
  const cw = atlas.naturalWidth / 3, ch = atlas.naturalHeight / 2;
  const dimensions = vehicle ? [140, 140] : type === 'barrier' ? [96, 96] : type === 'athlete' ? [98, 98] : type === 'rider' ? [94, 104] : [86, 90];
  const bob = ['grandma', 'athlete', 'runner'].includes(type) ? Math.sin(time * (type === 'runner' ? 9 : 3) + column) * .6 : 0;
  ctx.save(); ctx.translate(x, y + bob);
  if (vehicle) ctx.rotate(direction * Math.PI / 2);
  ctx.drawImage(atlas, column * cw, row * ch, cw, ch, -dimensions[0] * size / 2, -dimensions[1] * size / 2, dimensions[0] * size, dimensions[1] * size);
  ctx.restore(); return true;
}

const C = { road: '#bcb7a2', line: '#f4f2dc', sidewalk: '#688b55', ink: '#183d34', shadow: '#102f2b4a' };
const palette = ['#dbac86', '#eac590', '#97bfb4', '#c6ad9c', '#afc7a3'];

function shape(ctx, points, color) {
  ctx.fillStyle = color; ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fill();
}
function rect(ctx, x, y, width, height, color, radius = 0) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
}
function oval(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function line(ctx, points, color, width = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
}
function shadow(ctx, x, y, rx, ry) { oval(ctx, x + 7, y + 7, rx, ry, C.shadow); }

export function drawObject(ctx, type, x, y, size = 1, time = 0) {
  if (sprite(ctx, type, x, y, time, size)) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  if (type === 'taxi' || type === 'car' || type === 'courier') {
    const body = type === 'taxi' ? '#e7ad3f' : type === 'courier' ? '#c95d42' : '#5d8fa1';
    shadow(ctx, 0, 2, 25, 42);
    rect(ctx, -24, -40, 48, 82, '#263d3a', 13);
    rect(ctx, -22, -38, 44, 76, body, 12);
    rect(ctx, -17, -25, 34, 19, '#9bb9b5', 6);
    rect(ctx, -16, 8, 32, 16, '#85a5a3', 5);
    rect(ctx, -19, -34, 9, 4, '#f8eccd', 2); rect(ctx, 10, -34, 9, 4, '#f8eccd', 2);
    rect(ctx, -19, 31, 9, 4, '#b43f33', 2); rect(ctx, 10, 31, 9, 4, '#b43f33', 2);
    line(ctx, [[-22, 0], [22, 0]], '#24453f4f', 2);
    if (type === 'taxi') { rect(ctx, -10, -5, 20, 10, '#f8efd4', 3); rect(ctx, -7, -3, 14, 6, '#314b45', 2); }
    if (type === 'courier') { rect(ctx, -13, -3, 26, 12, '#f2e9cf', 3); line(ctx, [[-6, 3], [6, 3]], '#b64f38', 2); }
  } else if (type === 'robot') {
    shadow(ctx, 0, 2, 22, 21);
    for (const side of [-1, 1]) for (const at of [-13, 0, 13]) rect(ctx, side * 20 - 3, at - 4, 6, 8, '#253e37', 3);
    rect(ctx, -20, -21, 40, 43, '#b4c9c2', 10);
    rect(ctx, -18, -24, 36, 38, '#f6f4e8', 9);
    rect(ctx, -12, -18, 24, 7, '#344e43', 3);
    rect(ctx, -10, -16, 5, 2, '#bfee8a', 1); rect(ctx, 5, -16, 5, 2, '#bfee8a', 1);
    rect(ctx, -12, -4, 24, 12, '#e59a56', 3);
    line(ctx, [[8, -21], [11, -38]], '#476656', 2);
    shape(ctx, [[11, -38], [22, -35], [11, -31]], '#e89d58');
  } else if (type === 'curb' || type === 'barrier') {
    rect(ctx, -28, -10, 62, 29, C.shadow, 5);
    rect(ctx, -30, -16, 60, 29, '#7c8d82', 5);
    rect(ctx, -30, -19, 60, 24, '#e1c395', 5);
    for (let i = -22; i < 28; i += 22) shape(ctx, [[i, -18], [i + 8, -18], [i - 2, 4], [i - 10, 4]], '#976e46');
    rect(ctx, -25, -21, 7, 4, '#f3dcad', 2); rect(ctx, 18, -21, 7, 4, '#f3dcad', 2);
  } else if (type === 'bottle') {
    shadow(ctx, 0, 0, 16, 20);
    oval(ctx, 0, 0, 22, 24, '#c7ef8b');
    rect(ctx, -8, -15, 16, 32, '#81cbd7', 6);
    rect(ctx, -5, -20, 10, 7, '#edf8e7', 2);
    rect(ctx, -8, -2, 16, 10, '#f8f9ee', 2);
    line(ctx, [[-3, -11], [-3, -5]], '#d5f3ef', 3);
  } else if (type === 'preworkout') {
    shadow(ctx, 0, 1, 18, 22);
    oval(ctx, 0, 1, 25, 28, '#bdf36f');
    rect(ctx, -14, -18, 28, 37, '#eef9cf', 7);
    rect(ctx, -12, -22, 24, 8, '#183e38', 3);
    rect(ctx, -10, -10, 20, 20, '#64ce75', 4);
    shape(ctx, [[2, -8], [-6, 2], [-1, 2], [-4, 9], [7, -3], [2, -3]], '#173c34');
  } else {
    const configs = {
      runner: { shirt: '#d97b52', hair: '#654b37', wide: 16, skin: '#d6a477', pants: '#284e4b' },
      athlete: { shirt: '#dcc584', hair: '#483f31', wide: 22, skin: '#c69062', pants: '#334b46' },
      grandma: { shirt: '#b794b9', hair: '#e1e2d4', wide: 17, skin: '#d4aa87', pants: '#68566d' },
      kid: { shirt: '#dfad56', hair: '#64432c', wide: 12, skin: '#e1b489', pants: '#4b6a8e' },
    };
    const p = configs[type] || configs.runner;
    const s = type === 'kid' ? .82 : 1;
    ctx.scale(s, s);
    const step = Math.sin(time * (type === 'runner' ? 9 : 4) + x) * 4;
    shadow(ctx, 0, 3, p.wide + 3, 22);
    rect(ctx, -12, 5 + step, 9, 24, p.pants, 4); rect(ctx, 3, 5 - step, 9, 24, p.pants, 4);
    rect(ctx, -13, 23 + step, 11, 9, '#f0eede', 4); rect(ctx, 2, 23 - step, 11, 9, '#f0eede', 4);
    rect(ctx, -p.wide - 6, -7 - step, 9, 23, p.skin, 4); rect(ctx, p.wide - 3, -7 + step, 9, 23, p.skin, 4);
    rect(ctx, -p.wide, -15, p.wide * 2, 36, p.shirt, 10);
    oval(ctx, 0, -14, 11, 12, p.skin); oval(ctx, 0, -18, 12, 11, p.hair);
    oval(ctx, -4, -22, 5, 3, '#ffffff25');
    if (type === 'grandma') {
      oval(ctx, 5, -27, 7, 6, '#c9cfbf');
      rect(ctx, 20, 4, 12, 18, '#a9c1a6', 4);
      line(ctx, [[24, 4], [24, -2], [30, -2], [30, 4]], '#355747', 2);
    }
    if (type === 'athlete') { rect(ctx, -12, -5, 24, 3, '#9e884b', 1); rect(ctx, -17, 9, 34, 6, '#c2aa66', 2); }
  }
  ctx.restore();
}

function tree(ctx, x, y, variant = 0) {
  rect(ctx, x - 18, y - 22, 36, 49, '#c9ceae', 5);
  oval(ctx, x + 10, y + 7, 25, 29, '#153b3624');
  rect(ctx, x - 3, y - 1, 6, 22, '#8c7655', 2);
  oval(ctx, x, y - 8, 21, 24, '#497d58');
  oval(ctx, x - 6, y - 14, 17, 19, variant ? '#8db471' : '#75a46d');
  oval(ctx, x + 8, y - 10, 11, 15, '#5d945d');
  oval(ctx, x - 8, y - 21, 8, 6, '#a3c180');
}

function building(ctx, x, y, width, height, index, right = false) {
  const base = palette[index % palette.length];
  rect(ctx, x + 6, y + 9, width, height, '#234c3329', 3);
  rect(ctx, x, y, width, height, base, 3);
  rect(ctx, x + 5, y + 5, width - 10, height - 12, '#fff6d52b', 2);
  line(ctx, [[x + 4, y + height - 3], [x + width - 3, y + height - 3], [x + width - 3, y + 4]], '#74553c25', 3);
  rect(ctx, x + 12, y + 22, Math.max(18, width - 23), 25, '#627e78', 3);
  rect(ctx, x + 15, y + 25, Math.max(12, width - 29), 5, '#9db8a4', 1);
  rect(ctx, x + 14, y + 53, 12, 12, '#b3906c', 1);
  const edge = right ? x - 7 : x + width - 3;
  rect(ctx, edge, y + height - 47, 11, 32, '#f2e4bf', 2);
  for (let k = 0; k < 4; k++) rect(ctx, edge, y + height - 46 + k * 8, 11, 4, index % 2 ? '#678e77' : '#c47b59');
}

function scooter(ctx, x, y, lean, hit, time, reduced) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(reduced ? 0 : lean * .15);
  shadow(ctx, 0, 0, 24, 45);
  rect(ctx, -4, -42, 8, 19, '#183e38', 4); rect(ctx, -4, 33, 8, 19, '#183e38', 4);
  rect(ctx, -7, -29, 14, 71, '#1d6957', 6); rect(ctx, -4, -26, 8, 60, '#87cf97', 4);
  line(ctx, [[0, 12], [0, -37]], '#223f39', 4);
  line(ctx, [[-25, -33], [25, -33]], '#203b34', 4);
  line(ctx, [[-27, -33], [-19, -33]], '#c9ecc3', 5); line(ctx, [[19, -33], [27, -33]], '#c9ecc3', 5);
  rect(ctx, -11, 7, 10, 25, '#344942', 4); rect(ctx, 2, 5, 10, 29, '#344942', 4);
  rect(ctx, -12, 26, 11, 10, '#f3f0de', 4); rect(ctx, 2, 30, 11, 10, '#f3f0de', 4);
  line(ctx, [[-14, -12], [-22, -22], [-24, -31]], '#d4a276', 9);
  line(ctx, [[14, -12], [22, -22], [24, -31]], '#d4a276', 9);
  rect(ctx, -17, -19, 34, 40, '#f0efd8', 12);
  rect(ctx, -12, -9, 24, 30, '#d68a48', 8);
  rect(ctx, -9, 4, 18, 12, '#b8733f', 4);
  line(ctx, [[-8, -12], [-12, 10]], '#a66d3d', 3); line(ctx, [[8, -12], [12, 10]], '#a66d3d', 3);
  oval(ctx, 0, -23, 12, 13, '#d4a276');
  oval(ctx, 0, -29, 15, 16, '#caed91'); oval(ctx, -4, -33, 10, 11, '#e0f4b4');
  line(ctx, [[-6, -41], [-6, -27]], '#7da468', 2); line(ctx, [[2, -42], [2, -28]], '#7da468', 2);
  if (hit && !reduced) {
    const fade = .35 + Math.sin(time * 7) * .15;
    ctx.globalAlpha = fade; oval(ctx, 0, -14, 35, 46, '#ffd9b0');
  }
  ctx.restore();
}

function rideContact(ctx, x, y, game, reduced) {
  const moving = game.phase === 'playing' && game.speed > 0;
  // Контакт остаётся на покрытии: тень не качается вместе с телом и рулём.
  oval(ctx, x + 2, y + 3, 19, 32, '#18372b38');
  oval(ctx, x, y - 32, 3, 5, '#142b2866');
  oval(ctx, x, y + 37, 3, 5, '#142b2877');
  if (!moving || reduced) return;
  ctx.save();
  // Короткий след колеса и пыль движутся назад по плитке, без сияния под фигуркой.
  line(ctx, [[x, y + 41], [x, y + 54]], '#47533e30', 2);
  const crossing = 450 + Math.round((game.distance - 450) / 500) * 500;
  if (Math.abs(game.distance - crossing) > 17) {
    for (let i = 0; i < 4; i++) {
      const age = (game.distance * .16 + i / 4) % 1;
      ctx.globalAlpha = (1 - age) * .18;
      oval(ctx, x + (i % 2 ? 1 : -1) * (4 + age * 7), y + 39 + age * 24, 1 + age * 2, 1 + age * 1.2, '#e9dec1');
    }
  }
  if (game.nitro > 0) {
    ctx.globalAlpha = .55;
    for (const side of [-1, 1]) line(ctx, [[x + side * 7, y + 38], [x + side * 12, y + 83]], '#d8ff84', 2);
  }
  ctx.restore();
}

function finish(ctx, y, width) {
  rect(ctx, 47, y - 110, width - 94, 81, '#f1e3bd', 5);
  rect(ctx, 55, y - 103, width - 110, 28, '#284f40', 4);
  ctx.textAlign = 'center'; ctx.font = '800 19px Manrope, sans-serif'; ctx.fillStyle = '#eff5d7'; ctx.fillText('ТВОЙ ЗАЛ', width / 2, y - 82);
  rect(ctx, width / 2 - 35, y - 69, 70, 40, '#8eb7ab', 4);
  rect(ctx, width / 2 - 2, y - 65, 4, 35, '#dbe7cf', 1);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) rect(ctx, 78 + i * 22, y + j * 10, 22, 10, (i + j) % 2 ? '#e8ebd4' : '#294e42');
}

export class StreetRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.width = 420; this.height = 640;
  }
  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(bounds.width * ratio); this.canvas.height = Math.round(bounds.height * ratio);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.width = 420; this.height = bounds.height * 420 / bounds.width;
  }
  draw(game, reduced = false) {
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0);
    const playerY = h - 154;
    const metresToPixels = Math.min(TUNING.roadPixelsPerMetre, (playerY - 40) / 72);
    const offset = game.distance * metresToPixels;
    rect(ctx, 0, 0, w, h, C.sidewalk);
    rect(ctx, 78, 0, w - 156, h, C.road);
    for (let y = (offset % 44) - 44; y < h; y += 44) {
      line(ctx, [[80, y], [340, y]], '#918e7e', .7);
      for (let x = 80; x < 340; x += 44) line(ctx, [[x + ((Math.floor(y / 44) % 2) ? 22 : 0), y], [x + ((Math.floor(y / 44) % 2) ? 22 : 0), y + 44]], '#a19d89', .6);
    }
    rect(ctx, 72, 0, 6, h, '#e0d9bc'); rect(ctx, w - 78, 0, 6, h, '#e0d9bc');
    rect(ctx, 78, 0, 3, h, '#666f5140'); rect(ctx, w - 83, 0, 5, h, '#666f5140');
    for (let y = (offset % 48) - 48; y < h; y += 48) {
      line(ctx, [[45, y], [70, y]], '#c9c5ae', 1);
      line(ctx, [[350, y], [376, y]], '#c9c5ae', 1);
    }
    const block = 158;
    const base = Math.floor(offset / block);
    for (let i = -1; i < Math.ceil(h / block) + 1; i++) {
      const y = i * block + offset % block;
      const idx = ((i - base) % 5 + 5) % 5;
      rect(ctx, 0, y + 8, 36, 76, '#527849', 13);
      rect(ctx, 386, y + 31, 34, 73, '#527849', 13);
      for (let n = 0; n < 6; n++) {
        oval(ctx, 10 + n % 2 * 14, y + 20 + n * 9, 3, 4, n % 2 ? '#e8d58d' : '#d89579');
        oval(ctx, 395 + n % 2 * 14, y + 42 + n * 9, 3, 4, n % 2 ? '#f2e3ac' : '#e3bda1');
      }
      tree(ctx, 57, y + 145, idx % 2);
      tree(ctx, 363, y + 98, (idx + 1) % 2);
      if (idx % 2 === 0) {
        rect(ctx, 49, y + 47, 15, 37, '#836d48', 3);
        for (let n = 0; n < 4; n++) rect(ctx, 50, y + 49 + n * 8, 13, 5, '#c7a16b', 1);
        rect(ctx, 354, y + 7, 14, 22, '#628b72', 4);
        oval(ctx, 361, y + 8, 6, 4, '#a3c68b');
      } else {
        oval(ctx, 55, y + 58, 11, 11, '#baa980');
        oval(ctx, 54, y + 56, 10, 10, '#f5e9c8');
        rect(ctx, 50, y + 38, 8, 8, '#c19568', 2);
        rect(ctx, 50, y + 69, 8, 8, '#c19568', 2);
      }
    }
    const firstCross = Math.max(450, 450 + Math.floor((game.distance - 450 - 40) / 500) * 500);
    for (let at = firstCross; at < game.distance + 220; at += 500) {
      const y = playerY - (at - game.distance) * metresToPixels;
      rect(ctx, 0, y - 95, w, 190, '#3e5351');
      line(ctx, [[0, y], [78, y]], '#e8e4b8', 2);
      line(ctx, [[342, y], [420, y]], '#e8e4b8', 2);
      for (let stripe = 0; stripe < 10; stripe++) rect(ctx, 87, y - 86 + stripe * 18, 246, 10, '#f2eddb', 1);
      rect(ctx, 40, y - 145, 27, 31, '#346cab', 3);
      shape(ctx, [[44, y-118], [63, y-118], [54, y-140]], '#f7f3e5');
      oval(ctx, 54, y - 134, 2, 2, '#26463e');
      line(ctx, [[54, y-131], [52, y-125], [49, y-121]], '#26463e', 1.7);
      line(ctx, [[52, y-125], [58, y-122]], '#26463e', 1.7);
    }
    const actors = [];
    for (const object of game.route) {
      const dy = object.at - game.distance;
      const y = playerY - dy * metresToPixels;
      if (y < -80 || y > h + 80 || (object.passed && ['bottle', 'preworkout'].includes(object.type))) continue;
      actors.push({ object, y });
    }
    actors.push({ y: playerY });
    // Общая глубина для игрока и НПС: самокат не рисуется поверх всех голов.
    for (const { object, y } of actors.sort((a, b) => a.y - b.y)) {
      if (object) {
        const x = 122 + object.lane * 88;
        if (object.crossing) sprite(ctx, object.type, x, y, 0, 1, object.direction);
        else drawObject(ctx, object.type, x, y, 1, reduced || object.waiting ? 0 : game.elapsed);
      } else {
        const x = 122 + game.x * 88, leaning = game.lane - game.x;
        rideContact(ctx, x, playerY, game, reduced);
        // Микровибрация привязана к пройденной плитке, а не к течению времени.
        const vibration = !reduced && game.phase === 'playing' ? Math.sin(game.distance * 1.04) * .35 : 0;
        ctx.save(); ctx.translate(x, playerY + vibration); ctx.rotate(reduced ? 0 : leaning * .16);
        if (!sprite(ctx, 'rider', 0, 0)) { ctx.scale(.74, .74); scooter(ctx, 0, 0, leaning, false, game.elapsed, reduced); }
        ctx.restore();
      }
    }
  }
}
