// «Блины» (21.10.2026): правила игры по мотивам жанра Zuma, переделанные под фитнес.
// Цепочка олимпийских блинов катится по трассе к помосту, стрелок в центре
// вставляет в неё блины. Три и больше одного цвета подряд снимаются, разрыв
// стягивается, и если на стыке снова совпал цвет — цепная реакция, которая
// откатывает цепочку назад. Очки — поднятый тоннаж, кг. План выполнен — новые
// блины больше не выходят; сними оставшиеся и уровень пройден.
// Время идёт шагами по 10 мс, случайность — в состоянии: партия воспроизводима.
// Разбор жанра — docs/research/2026-10-21-Zuma.md основного репозитория.
import { FIELD, TRACKS, pointAt, pointInto, nearestS } from './blini-tracks.js';

export const RULES_VERSION = 1;
export const TICK_MS = 10;

// Цвета олимпийских блинов (IWF): цвет и вес совпадают с настоящими
export const PLATES = Object.freeze([
  { kg: 25, color: '#d8343f', ink: '#fff', name: 'красный 25 кг' },
  { kg: 20, color: '#2d6bd3', ink: '#fff', name: 'синий 20 кг' },
  { kg: 15, color: '#f1c232', ink: '#3a2a00', name: 'жёлтый 15 кг' },
  { kg: 10, color: '#2c9a55', ink: '#fff', name: 'зелёный 10 кг' },
  { kg: 5, color: '#f3f0e6', ink: '#33302a', name: 'белый 5 кг' },
].map(p => Object.freeze(p)));

export const POWERS = Object.freeze({
  drop: Object.freeze({ name: 'Дроп-сет', effect: 'снимает блины вокруг' }),
  negative: Object.freeze({ name: 'Негатив', effect: 'цепочка катится назад' }),
  pause: Object.freeze({ name: 'Пауза', effect: 'цепочка почти встаёт' }),
  technique: Object.freeze({ name: 'Техника', effect: 'прицел и быстрые броски' }),
  // По мотивам «Молнии» из Zuma's Revenge (разбор 22.10.2026)
  superset: Object.freeze({ name: 'Суперсет', effect: 'снимает все блины этого цвета' }),
});

// Еда на поле (по мотивам фруктов Zuma's Revenge): сбей брошенным блином — тоннаж в план
export const FOOD = Object.freeze({
  banana: Object.freeze({ name: 'Банан', kg: 120 }),
  apple: Object.freeze({ name: 'Яблоко', kg: 100 }),
  broccoli: Object.freeze({ name: 'Брокколи', kg: 150 }),
  bar: Object.freeze({ name: 'Протеиновый батончик', kg: 200 }),
});

export const TUNING = Object.freeze({
  plate: 30, // диаметр блина в единицах поля
  shotSpeed: 6, fastShot: 11, reload: 16, maxShots: 2,
  grow: .16, // вставленный блин раздвигает соседей за ~6 шагов
  pull: .16, pullMax: 4.5, // разрыв с одинаковыми цветами стягивается с ускорением
  rush: 3.2, // скорость въезда цепочки в начале
  danger: .2, // последние 20 % пути — опасная зона
  backSpeed: 1.1, negativeTicks: 260, pauseTicks: 650, techniqueTicks: 900,
  recoilTicks: 26, // откат после цепной реакции, на каждое звено
  powerLife: 1500, saveBack: .35,
  walk: 3.5, // Михалыч на скамье: единиц за шаг — через всю скамью меньше чем за секунду
  foodLife: 900, foodRadius: 16, // еда лежит 9 секунд
});

/**
 * Уровни свободной игры: трассы повторяются с растущим темпом, как храмы в Zuma.
 * Начало новой тройки трасс — передышка: план и темп чуть ниже конца прошлой.
 * speed — единиц пути за шаг, start — до какой доли пути цепочка въезжает сразу,
 * target — план, кг; slow — во сколько раз цепочка медленнее у помоста;
 * powerEvery — шагов между бонусами; par — норматив, секунд; rail — Михалыч ходит по скамье.
 */
export const LEVELS = Object.freeze([
  { track: 'stadium', speed: .5, start: .3, target: 1800, colors: 4, slow: 3, powerEvery: 1500, par: 50 },
  { track: 'kitchen', speed: .5, start: .26, target: 2000, colors: 4, slow: 3, powerEvery: 1500, par: 75 },
  { track: 'snake', speed: .16, start: .26, target: 2000, colors: 4, slow: 3, powerEvery: 1500, par: 85 },
  { track: 'dumbbell', speed: .14, start: .22, target: 2000, colors: 4, slow: 3, powerEvery: 1500, par: 60 },
  { track: 'stadium', speed: .7, start: .34, target: 2300, colors: 4, slow: 2.6, powerEvery: 1400, par: 70 },
  { track: 'kitchen', speed: .6, start: .3, target: 2400, colors: 4, slow: 2.6, powerEvery: 1400, par: 100 },
  { track: 'snake', speed: .22, start: .3, target: 2600, colors: 5, slow: 2.6, powerEvery: 1400, par: 175, rail: true },
  { track: 'dumbbell', speed: .16, start: .26, target: 2500, colors: 5, slow: 2.6, powerEvery: 1400, par: 85 },
  { track: 'stadium', speed: .62, start: .34, target: 2800, colors: 5, slow: 2.2, powerEvery: 1300, par: 100 },
  { track: 'kitchen', speed: .64, start: .34, target: 3000, colors: 5, slow: 2, powerEvery: 1200, par: 155 },
  { track: 'snake', speed: .29, start: .34, target: 3200, colors: 5, slow: 1.8, powerEvery: 1200, par: 190, rail: true },
  { track: 'dumbbell', speed: .21, start: .3, target: 3200, colors: 5, slow: 1.6, powerEvery: 1100, par: 115 },
].map(level => Object.freeze(level)));

// Сложность растёт внутри уровня (по мотивам Zuma's Revenge, 22.10.2026): через rampAt
// шагов на трассу выходит пятый цвет, если их было меньше, и темп растёт в rampSpeed раз
const DEFAULTS = Object.freeze({ repeat: .42, lives: 0, powers: Object.keys(POWERS), foodEvery: 1700, clearBonus: 300, rampAt: 4000, rampSpeed: 1.1 });
// Подстройка сложности (по мотивам DDS Zuma's Revenge): после неудач на уровне
// темп ниже на 6 % и план ниже на 5 % за каждую, не больше трёх ступеней.
export const EASE_STEPS = 3;

/** Правила уровня: свободная игра по номеру или задание карьеры целиком. */
export function levelRules(source = 0, ease = 0) {
  const base = typeof source === 'number' ? LEVELS[Math.max(0, Math.min(LEVELS.length - 1, source))] : source;
  if (!base || !TRACKS[base.track]) throw new Error('Нет такой трассы');
  const steps = Math.max(0, Math.min(EASE_STEPS, ease | 0));
  const eased = steps ? { speed: +(base.speed * (1 - .06 * steps)).toFixed(3), target: Math.round(base.target * (1 - .05 * steps) / 50) * 50, ease: steps } : {};
  return Object.freeze({ ...DEFAULTS, ...base, ...eased, colors: Math.max(2, Math.min(PLATES.length, base.colors || 4)), rail: !!base.rail && !!TRACKS[base.track].rail });
}

// Медали за уровень (по мотивам Zuma's Revenge, 22.10.2026): бронза — пройден,
// серебро — в нормативе, золото — в нормативе и с цепью ×3 и длиннее
export const MEDALS = Object.freeze(['', 'Бронза', 'Серебро', 'Золото']);
export const GOLD_CHAIN = 3;
export function medalOf({ won, seconds, bestChain }, rules) {
  if (!won) return 0;
  if (seconds > rules.par) return 1;
  return bestChain >= GOLD_CHAIN ? 3 : 2;
}

/** Правила задания карьеры: уровень свободной игры со своим планом; пояс — одна страховка. */
export function missionRules(goal, boost = false) {
  return levelRules({ ...LEVELS[goal.level], target: goal.target, lives: boost ? 1 : 0 });
}

function random(game) {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

export function createBlini(seed = 21, source = 0) {
  const rules = levelRules(source), track = TRACKS[rules.track];
  const game = {
    version: RULES_VERSION, rules, track, seed: seed >>> 0 || 1, nextId: 0, tick: 0,
    chains: track.paths.map(path => ({ path, balls: [], rush: true, back: 0, last: -1, danger: false, visible: false })),
    pickups: [], foodAt: Math.round(rules.foodEvery * .7),
    shots: [], score: 0, full: false, mode: 'playing', lives: rules.lives, reload: 0, colors: rules.colors, ramp: false,
    // Где стоит Михалыч: на скамье он идёт к goal, а прицел держит точку aimAt
    shooter: { x: track.shooter.x, y: track.shooter.y, vx: 0 }, rail: rules.rail ? track.rail : null, goal: track.shooter.x, aimAt: null,
    negative: 0, pause: 0, technique: 0, streak: 0, bestChain: 0, bestStreak: 0, cleared: 0, shotsFired: 0,
    powerAt: Math.round(rules.powerEvery * .6), aim: -Math.PI / 2, events: [],
  };
  game.current = Math.floor(random(game) * game.colors);
  game.next = Math.floor(random(game) * game.colors);
  return game;
}

const D = TUNING.plate;
const need = (a, b) => D * (a.size + b.size) / 2;
const touching = (b, i) => b[i + 1].s - b[i].s <= need(b[i], b[i + 1]) + .75;
const emit = (game, event) => game.events.push(event);
/** Точка блина на поле: положение по пути, а только что вставленный — ещё летит к месту. */
export function platePoint(chain, ball, out = { x: 0, y: 0 }) {
  const p = pointInto(chain.path, ball.s, out);
  if (!ball.enter) return p;
  const k = ball.enter.t;
  p.x += (ball.enter.x - p.x) * k; p.y += (ball.enter.y - p.y) * k;
  return p;
}
const SCRATCH = { x: 0, y: 0 };

function newColor(game, chain) {
  const { colors } = game, { repeat } = game.rules;
  if (chain.last >= 0 && random(game) < repeat) return chain.last;
  let c = Math.floor(random(game) * (colors - (chain.last >= 0 ? 1 : 0)));
  if (chain.last >= 0 && c >= chain.last) c++;
  return c;
}

function newBall(game, chain, s) {
  const color = newColor(game, chain); chain.last = color;
  return { id: ++game.nextId, color, s, size: 1, power: null, powerUntil: 0, pull: 0, combo: 0, gap: false, fresh: false, shot: false, enter: null };
}

/** Цвета, что есть на поле: стрелку дают только их — как в Zuma, не бывает «пустых» бросков. */
export function colorsOnField(game) {
  const set = new Set();
  for (const chain of game.chains) for (const b of chain.balls) if (b.s > -D) set.add(b.color);
  return set;
}

function pickColor(game) {
  const present = [...colorsOnField(game)].sort();
  if (!present.length) return Math.floor(random(game) * game.colors);
  return present[Math.floor(random(game) * present.length)];
}

function refreshShooter(game) {
  const present = colorsOnField(game);
  if (!present.size) return;
  if (!present.has(game.current)) game.current = pickColor(game);
  if (!present.has(game.next)) game.next = pickColor(game);
}

/** Сколько килограммов «поднято» за снятые блины — с множителем цепной реакции и серии. */
export function pointsFor(removed, depth, streak) {
  const kg = removed.reduce((sum, b) => sum + PLATES[b.color].kg, 0);
  const series = 1 + Math.min(10, Math.max(0, streak - 1)) * .1;
  return Math.round(kg * depth * series);
}

function activate(game, power, chainIndex) {
  if (power === 'negative') game.negative = TUNING.negativeTicks;
  if (power === 'pause') game.pause = TUNING.pauseTicks;
  if (power === 'technique') game.technique = TUNING.techniqueTicks;
  emit(game, { kind: 'power', power, chain: chainIndex });
}

/** Снять тройку (и больше) вокруг блина index. Возвращает, снялось ли что-то. */
function resolveAt(game, chainIndex, index, depth, fromShot) {
  const chain = game.chains[chainIndex], b = chain.balls;
  if (!b[index]) return false;
  const color = b[index].color;
  let lo = index, hi = index;
  while (lo > 0 && b[lo - 1].color === color && touching(b, lo - 1)) lo--;
  while (hi + 1 < b.length && b[hi + 1].color === color && touching(b, hi)) hi++;
  if (hi - lo + 1 < 3) return false;
  const remove = new Set();
  for (let i = lo; i <= hi; i++) remove.add(i);
  // Дроп-сет снимает всё, что рядом с ним на трассе, любого цвета
  for (let i = lo; i <= hi; i++) if (b[i].power === 'drop') for (let k = 0; k < b.length; k++) if (Math.abs(b[k].s - b[i].s) <= D * 3.2) remove.add(k);
  const order = [...remove].sort((x, y) => x - y);
  const removed = order.map(i => b[i]);
  const at = platePoint(chain, b[index]);
  if (fromShot) { game.streak++; game.bestStreak = Math.max(game.bestStreak, game.streak); }
  const points = pointsFor(removed, depth, game.streak);
  for (let k = order.length - 1; k >= 0; k--) b.splice(order[k], 1);
  game.score += points; game.cleared += removed.length;
  game.bestChain = Math.max(game.bestChain, depth);
  emit(game, { kind: 'clear', chain: chainIndex, x: at.x, y: at.y, points, depth, streak: fromShot ? game.streak : 0, plates: removed.map(r => r.color), kg: removed.reduce((s, r) => s + PLATES[r.color].kg, 0) });
  for (const r of removed) if (r.power && r.power !== 'drop') activate(game, r.power, chainIndex);
  if (removed.some(r => r.power === 'drop')) emit(game, { kind: 'power', power: 'drop', chain: chainIndex });
  // Цепная реакция откатывает цепочку назад — главный способ отыграть место
  if (depth >= 2) chain.back = Math.max(chain.back, TUNING.recoilTicks * depth);
  // Новый разрыв: одинаковые цвета на краях притянутся друг к другу — следующее звено реакции
  const head = order[0];
  if (head > 0 && head < b.length) {
    b[head].gap = true;
    b[head].combo = b[head - 1].color === b[head].color ? depth + 1 : 0;
  }
  // Пока стык не сомкнулся, тянуть начинают со следующего шага
  if (head < b.length) b[head].pull = 0;
  const superset = removed.find(r => r.power === 'superset');
  if (superset) {
    const gained = []; let spot = null;
    for (const c of game.chains) {
      const keep = [];
      for (const x of c.balls) {
        if (x.color === superset.color && x.s >= 0) { gained.push(x); if (!spot) spot = platePoint(c, x); } else keep.push(x);
      }
      c.balls = keep;
    }
    if (gained.length) {
      const extra = pointsFor(gained, depth, 1);
      game.score += extra; game.cleared += gained.length;
      emit(game, { kind: 'clear', chain: chainIndex, x: spot.x, y: spot.y, points: extra, depth, streak: 0, plates: gained.map(g => g.color), kg: gained.reduce((sum, g) => sum + PLATES[g.color].kg, 0) });
    }
  }
  checkFull(game);
  refreshShooter(game);
  return true;
}

/** План выполнен: блины, что ещё не въехали на поле, не выходят. */
function checkFull(game) {
  if (game.full || game.score < game.rules.target) return;
  game.full = true;
  for (const c of game.chains) c.balls = c.balls.filter(x => x.s >= 0);
  emit(game, { kind: 'full' });
}

/** Расстояние от точки до места Михалыча — до самого стрелка или до его скамьи. */
export function awayFromShooter(track, x, y) {
  const { shooter, rail } = track;
  const nx = rail ? Math.max(rail.x0, Math.min(rail.x1, x)) : shooter.x;
  return Math.hypot(x - nx, y - shooter.y);
}

// Где класть еду: в стороне от трасс, не вплотную к Михалычу и его скамье — одна сетка на трассу
const foodSpots = new Map();
function spotsFor(track) {
  if (foodSpots.has(track.id)) return foodSpots.get(track.id);
  const spots = [];
  for (let y = 40; y <= FIELD.height - 40; y += 20) for (let x = 30; x <= FIELD.width - 30; x += 20) {
    if (awayFromShooter(track, x, y) < 72) continue;
    let ok = true;
    for (const path of track.paths) for (let i = 0; i <= path.length && ok; i += 6) if ((path.xs[i] - x) ** 2 + (path.ys[i] - y) ** 2 < (D * .5 + TUNING.foodRadius + 6) ** 2) ok = false;
    if (ok) spots.push([x, y]);
  }
  foodSpots.set(track.id, spots);
  return spots;
}
function stepFood(game) {
  game.pickups = game.pickups.filter(f => game.tick - f.born < TUNING.foodLife);
  if (game.tick < game.foodAt || game.full) return;
  game.foodAt = game.tick + Math.round(game.rules.foodEvery * (.8 + random(game) * .4));
  const spots = spotsFor(game.track);
  if (!spots.length || game.pickups.length >= 2) return;
  const [x, y] = spots[Math.floor(random(game) * spots.length)];
  const kinds = Object.keys(FOOD), kind = kinds[Math.floor(random(game) * kinds.length)];
  game.pickups.push({ id: ++game.nextId, kind, x, y, born: game.tick });
  emit(game, { kind: 'food-spawn', food: kind, x, y });
}

function stepChain(game, chainIndex) {
  const chain = game.chains[chainIndex], b = chain.balls, L = chain.path.length, r = game.rules;
  if (!game.full) while (!b.length || b[0].s > -D) b.unshift(newBall(game, chain, b.length ? b[0].s - D : -D));
  if (!b.length) return;
  // Всё снято, а план ещё не выполнен — новая цепочка снова въезжает быстро
  if (!chain.rush && !game.full && b.every(x => x.s < 0)) chain.rush = true;
  const head = b.at(-1);
  let v = game.ramp ? r.speed * r.rampSpeed : r.speed;
  if (chain.rush) { v = TUNING.rush; if (head.s >= r.start * L) chain.rush = false; }
  else {
    if (head.s > L * (1 - TUNING.danger)) v /= r.slow;
    if (game.pause > 0) v *= .25;
    if (chain.back > 0 || game.negative > 0) v = -TUNING.backSpeed;
  }
  if (chain.back > 0) chain.back--;
  // Толкает только хвост: передние куски за разрывом стоят, пока их не догонят
  let end = 0;
  while (end + 1 < b.length && touching(b, end)) end++;
  if (v > 0) b[0].s += v;
  else if (v < 0 && b[end].s > D) for (let i = 0; i <= end; i++) b[i].s += v;
  for (const ball of b) {
    if (ball.enter) { ball.enter.t -= .14; if (ball.enter.t <= 0) ball.enter = null; }
    if (ball.fresh) ball.size = Math.min(1, ball.size + TUNING.grow);
  }
  // Касание раздвигает: и хвост, который толкает, и блин, который растёт после вставки
  for (let i = 0; i + 1 < b.length; i++) { const n = need(b[i], b[i + 1]); if (b[i + 1].s < b[i].s + n) b[i + 1].s = b[i].s + n; }
  // Разрыв, на краях которого один цвет, стягивается: передний кусок едет назад
  for (let i = 0; i + 1 < b.length; i++) {
    if (touching(b, i)) continue;
    const front = b[i + 1];
    front.gap = true;
    if (front.color !== b[i].color || b[i].s < -D / 2) { front.pull = 0; continue; }
    front.pull = Math.min(TUNING.pullMax, front.pull + TUNING.pull);
    let j = i + 1;
    while (j + 1 < b.length && touching(b, j)) j++;
    const room = front.s - b[i].s - need(b[i], front);
    const step = Math.min(front.pull, room);
    for (let k = i + 1; k <= j; k++) b[k].s -= step;
  }
  // Стык, который только что сомкнулся: одинаковый цвет — следующее звено реакции
  for (let i = 0; i + 1 < b.length; i++) {
    const front = b[i + 1];
    if (!front.gap || !touching(b, i)) continue;
    front.gap = false; front.pull = 0;
    const depth = Math.max(1, front.combo); front.combo = 0;
    if (front.color === b[i].color && resolveAt(game, chainIndex, i, depth, false)) return;
  }
  // Вставленный блин встал на место — проверяем тройку
  for (let i = 0; i < b.length; i++) {
    const ball = b[i];
    if (!ball.fresh || ball.size < 1) continue;
    ball.fresh = false;
    const shot = ball.shot; ball.shot = false;
    if (!resolveAt(game, chainIndex, i, 1, shot) && shot) game.streak = 0;
    return;
  }
  const last = b.at(-1);
  if (!last) return;
  const danger = last.s > L * (1 - TUNING.danger);
  if (danger && !chain.danger) emit(game, { kind: 'danger', chain: chainIndex });
  chain.danger = danger;
  if (last.s >= L) {
    if (game.lives > 0) {
      game.lives--;
      for (const ball of b) ball.s -= L * TUNING.saveBack;
      emit(game, { kind: 'saved', chain: chainIndex });
    } else {
      game.mode = 'lost';
      emit(game, { kind: 'lost', chain: chainIndex });
    }
  }
}

function stepShots(game) {
  const speedUp = game.technique > 0;
  for (let k = game.shots.length - 1; k >= 0; k--) {
    const shot = game.shots[k];
    shot.x += shot.vx * (speedUp ? TUNING.fastShot / TUNING.shotSpeed : 1);
    shot.y += shot.vy * (speedUp ? TUNING.fastShot / TUNING.shotSpeed : 1);
    for (let f = game.pickups.length - 1; f >= 0; f--) {
      const food = game.pickups[f];
      if ((food.x - shot.x) ** 2 + (food.y - shot.y) ** 2 > (TUNING.foodRadius + D * .4) ** 2) continue;
      game.pickups.splice(f, 1);
      const points = FOOD[food.kind].kg;
      game.score += points;
      emit(game, { kind: 'food', food: food.kind, x: food.x, y: food.y, points });
      checkFull(game);
    }
    let hit = null;
    for (let c = 0; c < game.chains.length && !hit; c++) {
      const chain = game.chains[c];
      for (let i = 0; i < chain.balls.length; i++) {
        const ball = chain.balls[i];
        if (ball.s < 0 || ball.s > chain.path.length) continue;
        const p = pointInto(chain.path, ball.s, SCRATCH);
        if ((p.x - shot.x) ** 2 + (p.y - shot.y) ** 2 < (D * .9) ** 2) { hit = { c, i }; break; }
      }
    }
    if (hit) {
      game.shots.splice(k, 1);
      insert(game, hit.c, hit.i, shot);
      continue;
    }
    if (shot.x < -D || shot.y < -D || shot.x > FIELD.width + D || shot.y > FIELD.height + D) {
      game.shots.splice(k, 1); game.streak = 0;
      emit(game, { kind: 'miss' });
    }
  }
}

function insert(game, chainIndex, index, shot) {
  const chain = game.chains[chainIndex], b = chain.balls, hit = b[index];
  // Сторона вставки — по тому, куда по трассе ближе точка попадания
  const at = nearestS(chain.path, shot.x, shot.y, hit.s - D, hit.s + D);
  const ahead = at >= hit.s;
  const ball = { id: ++game.nextId, color: shot.color, s: hit.s + (ahead ? D / 2 : -D / 2), size: .2, power: null, powerUntil: 0, pull: 0, combo: 0, gap: false, fresh: true, shot: true, enter: { x: shot.x, y: shot.y, t: 1 } };
  b.splice(ahead ? index + 1 : index, 0, ball);
  emit(game, { kind: 'insert', chain: chainIndex, x: shot.x, y: shot.y });
}

function stepPowers(game) {
  for (const chain of game.chains) for (const b of chain.balls) if (b.power && game.tick > b.powerUntil) b.power = null;
  if (game.tick < game.powerAt || !game.rules.powers.length) return;
  const candidates = [];
  for (const chain of game.chains) for (const b of chain.balls) if (!b.power && !b.fresh && b.s > chain.path.length * .08 && b.s < chain.path.length * .85) candidates.push(b);
  game.powerAt = game.tick + Math.round(game.rules.powerEvery * (.75 + random(game) * .5));
  if (!candidates.length) return;
  const ball = candidates[Math.floor(random(game) * candidates.length)];
  ball.power = game.rules.powers[Math.floor(random(game) * game.rules.powers.length)];
  ball.powerUntil = game.tick + TUNING.powerLife;
}

/** Михалыч идёт по скамье к goal и держит прицел на точке, куда показывают. */
function stepShooter(game) {
  const me = game.shooter;
  me.vx = 0;
  if (!game.rail) return;
  const diff = game.goal - me.x;
  if (Math.abs(diff) < .01) return;
  me.vx = Math.sign(diff) * Math.min(TUNING.walk, Math.abs(diff));
  me.x += me.vx;
  if (game.aimAt && Math.hypot(game.aimAt.x - me.x, game.aimAt.y - me.y) > 4) game.aim = Math.atan2(game.aimAt.y - me.y, game.aimAt.x - me.x);
}

/** Один шаг партии (10 мс). События шага — в game.events, их забирает экран. */
export function step(game) {
  if (game.mode !== 'playing') return game;
  game.tick++;
  if (game.reload > 0) game.reload--;
  if (game.negative > 0) game.negative--;
  if (game.pause > 0) game.pause--;
  if (game.technique > 0) game.technique--;
  stepShooter(game);
  // Уровень набирает темп: пятый цвет и быстрее — один раз, пока план не выполнен
  if (!game.ramp && game.rules.rampAt > 0 && game.tick >= game.rules.rampAt && !game.full) {
    game.ramp = true;
    const added = game.colors < PLATES.length;
    if (added) game.colors++;
    emit(game, { kind: 'ramp', color: added ? game.colors - 1 : -1 });
  }
  stepShots(game);
  for (let c = 0; c < game.chains.length && game.mode === 'playing'; c++) stepChain(game, c);
  // Сняли всю цепочку раньше плана — «Чистая трасса!»: бонус, новая въезжает быстро
  for (const chain of game.chains) {
    let visible = false;
    for (const b of chain.balls) if (b.s >= 0) { visible = true; break; }
    if (chain.visible && !visible && !game.full && game.mode === 'playing') {
      game.score += game.rules.clearBonus;
      const at = pointInto(chain.path, chain.path.length * .5, SCRATCH);
      emit(game, { kind: 'cleartrack', x: at.x, y: at.y, points: game.rules.clearBonus });
      checkFull(game);
    }
    chain.visible = visible;
  }
  stepFood(game);
  stepPowers(game);
  if (game.mode === 'playing' && game.full && game.chains.every(c => !c.balls.length) && !game.shots.length) {
    game.mode = 'won';
    emit(game, { kind: 'won', ace: secondsOf(game) <= game.rules.par });
  }
  return game;
}

export function advance(game, ticks = 1) {
  for (let i = 0; i < ticks && game.mode === 'playing'; i++) step(game);
  return game;
}

export const secondsOf = game => game.tick * TICK_MS / 1000;

/**
 * Повернуть стрелка к точке поля. На скамье он ещё и идёт под палец (follow),
 * не сходя со скамьи, а прицел по пути держит ту же точку.
 */
export function aim(game, x, y, follow = true) {
  const shooter = game.shooter;
  if (game.rail && follow) { game.goal = Math.max(game.rail.x0, Math.min(game.rail.x1, x)); game.aimAt = { x, y }; }
  else game.aimAt = null;
  if (Math.hypot(x - shooter.x, y - shooter.y) > 4) game.aim = Math.atan2(y - shooter.y, x - shooter.x);
  return game.aim;
}

/** Шаг по скамье с клавиатуры: dx единиц влево (−) или вправо (+). */
export function walk(game, dx) {
  if (!game.rail) return false;
  game.goal = Math.max(game.rail.x0, Math.min(game.rail.x1, game.goal + dx));
  game.aimAt = null;
  return true;
}

/** Бросок в сторону точки поля. Перезарядка и не больше двух блинов в полёте. */
export function shoot(game, x, y) {
  if (game.mode !== 'playing' || game.reload > 0 || game.shots.length >= TUNING.maxShots) return false;
  if (x != null) aim(game, x, y);
  const shooter = game.shooter, dx = Math.cos(game.aim), dy = Math.sin(game.aim);
  game.shots.push({ x: shooter.x + dx * 34, y: shooter.y + dy * 34, vx: dx * TUNING.shotSpeed, vy: dy * TUNING.shotSpeed, color: game.current });
  game.current = game.next; game.next = pickColor(game);
  game.reload = game.technique > 0 ? Math.round(TUNING.reload / 2) : TUNING.reload;
  game.shotsFired++;
  emit(game, { kind: 'shot' });
  return true;
}

/** Поменять текущий и следующий блин. */
export function swap(game) {
  if (game.mode !== 'playing') return false;
  [game.current, game.next] = [game.next, game.current];
  emit(game, { kind: 'swap' });
  return true;
}

/** Забрать события, накопленные с прошлого раза. */
export function drain(game) {
  const out = game.events; game.events = []; return out;
}

/** Насколько близко к помосту самая опасная цепочка, 0…1. */
export function dangerOf(game) {
  return game.chains.reduce((max, c) => c.balls.length ? Math.max(max, Math.max(0, c.balls.at(-1).s) / c.path.length) : max, 0);
}

/** Куда упрётся прицел: первая точка луча, где он задевает блин, или край поля. */
export function aimEnd(game) {
  const shooter = game.shooter, dx = Math.cos(game.aim), dy = Math.sin(game.aim);
  for (let t = 34; t < 900; t += 4) {
    const x = shooter.x + dx * t, y = shooter.y + dy * t;
    if (x < 0 || y < 0 || x > FIELD.width || y > FIELD.height) return { x, y, hit: false };
    for (const chain of game.chains) for (const b of chain.balls) {
      if (b.s < 0 || b.s > chain.path.length) continue;
      const p = pointInto(chain.path, b.s, SCRATCH);
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < (D * .9) ** 2) return { x, y, hit: true };
    }
  }
  return { x: shooter.x + dx * 900, y: shooter.y + dy * 900, hit: false };
}

// Сохранение партии (FT-700, 22.10.2026): продолжить с того же места — на этом
// устройстве или на другом, если прогресс сохраняется в аккаунте. Трасса —
// по имени из правил; броски в полёте и вспышки не сохраняются.
const SAVED = ['seed', 'nextId', 'tick', 'score', 'full', 'mode', 'lives', 'reload', 'colors', 'ramp', 'negative', 'pause', 'technique', 'streak', 'bestChain', 'bestStreak', 'cleared', 'shotsFired', 'powerAt', 'foodAt', 'aim', 'current', 'next'];
export function serializeGame(game) {
  const out = { version: RULES_VERSION, rules: { ...game.rules, powers: [...game.rules.powers] } };
  for (const key of SAVED) out[key] = game[key];
  out.chains = game.chains.map(c => ({ rush: c.rush, back: c.back, last: c.last, danger: c.danger, visible: c.visible, balls: c.balls.map(b => ({ ...b, enter: null })) }));
  out.pickups = game.pickups.map(f => ({ ...f }));
  out.shooterX = game.shooter.x; out.goal = game.goal;
  return out;
}
const finite = n => typeof n === 'number' && Number.isFinite(n);
/** Партия из сохранения; чужая версия правил или испорченная запись — null. */
export function restoreGame(data) {
  try {
    if (!data || data.version !== RULES_VERSION || !data.rules || !TRACKS[data.rules.track]) return null;
    const game = createBlini(data.seed, data.rules);
    if (!Array.isArray(data.chains) || data.chains.length !== game.chains.length) return null;
    for (const key of SAVED) if (key in data && typeof data[key] === typeof game[key]) game[key] = data[key];
    game.colors = Math.max(game.rules.colors, Math.min(PLATES.length, game.colors | 0));
    const colors = game.colors;
    game.chains.forEach((chain, i) => {
      const saved = data.chains[i];
      chain.rush = !!saved.rush; chain.back = Math.max(0, saved.back | 0); chain.danger = !!saved.danger; chain.visible = !!saved.visible;
      chain.last = Number.isInteger(saved.last) && saved.last < colors ? saved.last : -1;
      chain.balls = (Array.isArray(saved.balls) ? saved.balls : [])
        .filter(b => b && finite(b.s) && Number.isInteger(b.color) && b.color >= 0 && b.color < PLATES.length && finite(b.size))
        .map(b => ({ id: b.id | 0, color: b.color, s: b.s, size: Math.max(.2, Math.min(1, b.size)), power: POWERS[b.power] ? b.power : null, powerUntil: b.powerUntil | 0, pull: 0, combo: b.combo | 0, gap: !!b.gap, fresh: !!b.fresh, shot: !!b.shot, enter: null }));
    });
    game.shots = []; game.events = [];
    game.pickups = (Array.isArray(data.pickups) ? data.pickups : []).filter(f => f && FOOD[f.kind] && finite(f.x) && finite(f.y) && finite(f.born)).map(f => ({ id: f.id | 0, kind: f.kind, x: f.x, y: f.y, born: f.born }));
    if (game.rail) {
      const clamp = x => Math.max(game.rail.x0, Math.min(game.rail.x1, x));
      if (finite(data.shooterX)) game.shooter.x = clamp(data.shooterX);
      game.goal = finite(data.goal) ? clamp(data.goal) : game.shooter.x;
    }
    if (!['playing', 'won', 'lost'].includes(game.mode)) game.mode = 'playing';
    if (!PLATES[game.current]) game.current = 0;
    if (!PLATES[game.next]) game.next = 0;
    return game;
  } catch (_) { return null; }
}
