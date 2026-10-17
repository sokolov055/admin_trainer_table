// FT-563: детерминированные правила бесконечного заезда. Та же версия проверяет рейтинг на сервере.
export const RULES_VERSION = 2;
export const TUNING = Object.freeze({ roadPixelsPerMetre: 7.2, laneResponse: 10,
  collisionHalfWidth: .48, collisionDepth: 9.5, firstObstacle: 100,
  nitroDuration: 3.2, nitroMultiplier: 1.45, nitroMax: 2 });
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ name: 'Разминка', start: 17, max: 61, ramp: 1800, gap: 46, minGap: 34, doubles: .25 }),
  medium: Object.freeze({ name: 'Час пик', start: 21, max: 76, ramp: 1100, gap: 35, minGap: 24, doubles: .65 }),
  extreme: Object.freeze({ name: 'Предел', start: 26, max: 94, ramp: 750, gap: 28, minGap: 18, doubles: .9 }),
});
export const TYPES = ['runner', 'grandma', 'athlete', 'robot', 'barrier'];
export const BARKS = Object.freeze({
  grandma: ['Куда летишь, внучек?!', 'Я тебе не кегля!', 'А пешком уже не модно?'],
  athlete: ['У меня вчера были ноги!', 'Брат, я после приседа!', 'Полегче, чемпион!'],
  runner: ['Тут вообще-то бегают!', 'Держи дистанцию!', 'Оставь мне дорожку!'],
  robot: ['Доставка не пострадала.', 'Пожалуйста, объезжайте справа.'],
});
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function randomGenerator(seed = 563) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
function random(game) {
  game.random = (Math.imul(game.random, 1664525) + 1013904223) >>> 0;
  return game.random / 4294967296;
}
function extendRoute(game, until) {
  const config = DIFFICULTIES[game.difficulty];
  while (game.nextAt < until) {
    const row = game.row++, at = game.nextAt;
    game.safe = clamp(game.safe + Math.floor(random(game) * 3) - 1, 0, 2);
    const occupied = [0, 1, 2].filter(lane => lane !== game.safe);
    if (row < 2 || random(game) > config.doubles) occupied.splice(Math.floor(random(game) * 2), 1);
    const crossing = 450 + Math.round((at - 450) / 500) * 500;
    for (const lane of occupied) {
      const type = TYPES[Math.floor(random(game) * TYPES.length)];
      if (Math.abs(at - crossing) > 35) game.route.push({ id: 'o'+row+'-'+lane, row, at, lane, type, passed: false });
    }
    if (row % 6 === 1) game.route.push({ id: 'p'+row, row, at, lane: game.safe, type: 'preworkout', passed: false });
    else if (row % 5 === 2) game.route.push({ id: 'b'+row, row, at, lane: game.safe, type: 'bottle', passed: false });
    const pressure = clamp(at / 3500, 0, 1);
    game.nextAt += config.gap + (config.minGap - config.gap) * pressure;
  }
  while (game.nextCrossing < until) {
    const at = game.nextCrossing;
    game.route.push({ id: 'car'+at, at: at - 7, crossingAt: at, row: game.row, lane: -2 - random(game), type: 'car', crossing: true, direction: 1, passed: false });
    game.route.push({ id: 'taxi'+at, at: at + 7, crossingAt: at, row: game.row, lane: 4 + random(game), type: 'taxi', crossing: true, direction: -1, passed: false });
    if (random(game) < .4) game.route.push({ id: 'walker'+at, at: at - 4 + random(game) * 8, row: game.row, lane: Math.floor(random(game) * 3), type: random(game) < .5 ? 'robot' : 'grandma', passed: false });
    game.nextCrossing += 500;
  }
}
export function createGame(seed = 563, difficulty = 'medium') {
  const mode = DIFFICULTIES[difficulty] ? difficulty : 'medium';
  const game = { phase: 'ready', resumePhase: 'playing', countdown: 3, difficulty: mode,
    distance: 0, elapsed: 0, ticks: 0, accumulator: 0, lane: 1, x: 1, speed: 0,
    hits: 0, bottles: 0, preworkouts: 0, nitroCharges: 0, nitro: 0,
    dodged: 0, score: 0, combo: 0, bestCombo: 0, crashed: false,
    event: null, eventSerial: 0, seed: seed >>> 0, random: seed >>> 0,
    nextAt: TUNING.firstObstacle, nextCrossing: 450, row: 0, safe: 1, lastBark: -5, route: [], inputs: [] };
  extendRoute(game, 300);
  return game;
}
export function begin(game) { if (game.phase === 'ready') game.phase = 'countdown'; }
export function steer(game, direction) { setLane(game, clamp(game.lane + direction, 0, 2)); }
export function setLane(game, lane) {
  if ((game.phase !== 'playing' && game.phase !== 'countdown') || !Number.isInteger(lane) || lane < 0 || lane > 2 || lane === game.lane) return;
  game.lane = lane; game.inputs.push([game.ticks, lane]);
}
export function pause(game) {
  if (game.phase !== 'playing' && game.phase !== 'countdown') return;
  game.resumePhase = game.phase; game.phase = 'paused';
}
export function resume(game) { if (game.phase === 'paused') game.phase = game.resumePhase; }
function emit(game, kind, text) { game.event = { kind, text, until: game.elapsed + 1.6, serial: ++game.eventSerial }; }
export function activateNitro(game) {
  if (game.phase !== 'playing' || game.nitroCharges < 1 || game.nitro > 0) return false;
  game.nitroCharges--; game.nitro = TUNING.nitroDuration;
  game.inputs.push([game.ticks, 'nitro']); emit(game, 'nitro', 'Нитро! +45% скорости');
  return true;
}
const WALKING_PACE = { runner: 1.6, grandma: .25, athlete: .4, robot: .8 };
// Один перекрёсток принадлежит либо пешеходам, либо машинам. Сначала выезжают
// уже въехавшие автомобили; ожидающие у бордюра получают следующую очередь.
function moveTraffic(game, dt) {
  const cars = game.route.filter(o => o.crossing);
  const walkers = game.route.filter(o => WALKING_PACE[o.type]);
  const crossings = [...new Set(cars.map(o => o.crossingAt))];
  for (const at of crossings) {
    const traffic = cars.filter(o => o.crossingAt === at);
    const approaching = walkers.some(o => o.at >= at - 22 && o.at <= at + 19);
    const occupied = traffic.some(o => o.lane > -1.2 && o.lane < 3.2);
    for (const car of traffic) {
      const rate = game.difficulty === 'easy' ? .8 : game.difficulty === 'medium' ? 1.2 : 1.6;
      const next = car.lane + rate * car.direction * dt;
      car.waiting = false;
      if (approaching && (car.direction > 0 ? car.lane <= -1.2 : car.lane >= 3.2)) {
        car.lane = car.direction > 0 ? Math.min(-1.2, next) : Math.max(3.2, next);
        car.waiting = car.lane === (car.direction > 0 ? -1.2 : 3.2);
      } else car.lane = next;
      // Повторный автомобиль появляется только за границей экрана.
      if (car.direction > 0 && car.lane > 5) car.lane = -3;
      if (car.direction < 0 && car.lane < -3) car.lane = 5;
    }
    for (const walker of walkers) {
      if (walker.at < at - 20 && walker.at + WALKING_PACE[walker.type] * dt >= at - 20 && occupied) walker.waitAt = at - 20;
      else if (walker.waitAt === at - 20 && !occupied) delete walker.waitAt;
    }
  }
  // Сначала впереди идущие: быстрый бегун не проходит сквозь бабушку или ремонт.
  for (const walker of walkers.sort((a, b) => b.at - a.at)) {
    let next = walker.at + WALKING_PACE[walker.type] * dt;
    if (walker.waitAt !== undefined) next = Math.min(next, walker.waitAt);
    const ahead = game.route.filter(o => o !== walker && !o.crossing && (WALKING_PACE[o.type] || o.type === 'barrier') && Math.abs(o.lane - walker.lane) < .65 && o.at > walker.at);
    for (const other of ahead) next = Math.min(next, Math.max(walker.at, other.at - 14));
    walker.waiting = next <= walker.at + 1e-8;
    walker.at = next;
  }
}
function tick(game) {
  const dt = 1 / 60;
  if (game.phase === 'countdown') {
    game.countdown = Math.max(0, game.countdown - dt);
    if (game.countdown < 1e-8) game.phase = 'playing';
    return;
  }
  game.ticks++; game.elapsed = game.ticks / 60;
  game.nitro = Math.max(0, game.nitro - dt);
  game.x += (game.lane - game.x) * (1 - Math.exp(-TUNING.laneResponse * dt));
  const config = DIFFICULTIES[game.difficulty];
  const progress = clamp(game.distance / config.ramp, 0, 1);
  game.speed = (config.start + (config.max - config.start) * Math.pow(progress, .85)) * (game.nitro > 0 ? TUNING.nitroMultiplier : 1);
  const previous = game.distance;
  game.distance += game.speed * dt;
  extendRoute(game, game.distance + 300);
  moveTraffic(game, dt);
  for (const object of game.route) {
    const depth = object.crossing ? 10.5 : ['bottle', 'preworkout'].includes(object.type) ? 4 : TUNING.collisionDepth;
    if (object.passed || object.at > game.distance + depth || object.at < previous - depth - 2) continue;
    if (Math.abs(game.x - object.lane) < (object.crossing ? .88 : TUNING.collisionHalfWidth)) {
      object.passed = true;
      if (object.type === 'bottle') {
        game.bottles++; game.score += 25; emit(game, 'bonus', 'Вода! +25 очков');
      } else if (object.type === 'preworkout') {
        game.preworkouts++; game.score += 50;
        game.nitroCharges = Math.min(TUNING.nitroMax, game.nitroCharges + 1);
        emit(game, 'preworkout', 'Предтрен! Нитро готово');
      } else {
        game.hits = 1; game.combo = 0; game.crashed = true; game.phase = 'lost'; game.speed = 0;
        emit(game, 'hit', 'Заезд окончен'); return;
      }
    } else if (object.at < game.distance - depth) {
      object.passed = true;
      if (object.type !== 'bottle' && object.type !== 'preworkout') {
        game.dodged++; game.combo++; game.bestCombo = Math.max(game.bestCombo, game.combo);
        game.score += 10 + Math.min(40, game.combo * 2);
        const phrases = BARKS[object.type];
        if (phrases && game.elapsed - game.lastBark > 4 && Math.abs(game.x - object.lane) < 1.3) {
          game.lastBark = game.elapsed; emit(game, 'bark', phrases[object.row % phrases.length]);
        }
      }
    }
  }
  game.route = game.route.filter(object => object.at > game.distance - 25);
}
// Остаток кадра копится: симуляция и проверка сервером всегда идут ровно по 60 Гц.
export function advance(game, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !['playing', 'countdown'].includes(game.phase)) return;
  game.accumulator += seconds;
  while (game.accumulator + 1e-9 >= 1 / 60 && ['playing', 'countdown'].includes(game.phase)) {
    game.accumulator = Math.max(0, game.accumulator - 1 / 60); tick(game);
  }
}
export function tiltAxis(gamma, beta, angle = 0) {
  if (!Number.isFinite(gamma) || !Number.isFinite(beta)) return null;
  const radians = angle * Math.PI / 180;
  return gamma * Math.cos(radians) + beta * Math.sin(radians);
}
export function laneFromTilt(delta, current = 1) {
  if (!Number.isFinite(delta)) return current;
  if (delta < -12) return 0;
  if (delta > 12) return 2;
  return Math.abs(delta) < 7 ? 1 : current;
}
