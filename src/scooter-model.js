// FT-563: игра для тестовых клиентов. Параметры проверены в изолированном прототипе.
export const TUNING = Object.freeze({ distance: 900, duration: 60, penalty: 4, bonus: 2,
  startSpeed: 12, speedGain: 14, firstObstacle: 78, rowGap: 34, laneResponse: 8,
  collisionHalfWidth: .53, collisionDepth: 1.8, grace: 1.4, slowDuration: .85, slowFactor: .45 });
export const DISTANCE = TUNING.distance;
export const DURATION = TUNING.duration;
export const HIT_PENALTY = TUNING.penalty;
export const TYPES = ['taxi', 'runner', 'barrier', 'courier', 'robot', 'car'];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function randomGenerator(seed = 563) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

// Между рядами всегда есть время перестроиться; в каждом остаётся свободная полоса.
export function createRoute(seed = 563) {
  const random = randomGenerator(seed);
  const objects = [];
  let safe = 1;
  for (let row = 0, at = TUNING.firstObstacle; at < DISTANCE - 35; row++, at += TUNING.rowGap) {
    safe = clamp(safe + Math.floor(random() * 3) - 1, 0, 2);
    const occupied = [0, 1, 2].filter(lane => lane !== safe);
    if (row < 3 || row % 3 !== 2) occupied.splice(Math.floor(random() * 2), 1);
    for (const lane of occupied) objects.push({ id: `o${row}-${lane}`, row, at, lane, type: TYPES[row % TYPES.length], passed: false });
    if (row % 4 === 2) objects.push({ id: `b${row}`, row, at, lane: safe, type: 'bottle', passed: false });
  }
  return objects;
}

export function createGame(seed = 563) {
  return { phase: 'ready', resumePhase: 'playing', countdown: 3, distance: 0, remaining: DURATION, elapsed: 0,
    lane: 1, x: 1, speed: 0, hits: 0, bottles: 0, dodged: 0, score: 0, combo: 0, bestCombo: 0, invincible: 0, slow: 0,
    event: null, eventSerial: 0, route: createRoute(seed), seed };
}

export function begin(game) {
  if (game.phase === 'ready') game.phase = 'countdown';
}

export function steer(game, direction) {
  if (game.phase === 'playing' || game.phase === 'countdown') game.lane = clamp(game.lane + direction, 0, 2);
}

export function setLane(game, lane) {
  if (game.phase === 'playing' || game.phase === 'countdown') game.lane = clamp(lane, 0, 2);
}

export function pause(game) {
  if (game.phase !== 'playing' && game.phase !== 'countdown') return;
  game.resumePhase = game.phase;
  game.phase = 'paused';
}

export function resume(game) {
  if (game.phase === 'paused') game.phase = game.resumePhase;
}

function emit(game, kind, text) {
  game.event = { kind, text, until: game.elapsed + 1.6, serial: ++game.eventSerial };
}

function tick(game, dt) {
  if (game.phase === 'countdown') {
    game.countdown = Math.max(0, game.countdown - dt);
    if (game.countdown <= 1e-8) game.phase = 'playing';
    return;
  }
  if (game.phase !== 'playing') return;
  const interval = Math.min(dt, game.remaining);
  game.elapsed += interval;
  game.remaining = Math.max(0, game.remaining - interval);
  game.invincible = Math.max(0, game.invincible - interval);
  game.slow = Math.max(0, game.slow - interval);
  game.x += (game.lane - game.x) * (1 - Math.exp(-TUNING.laneResponse * interval));
  game.speed = (TUNING.startSpeed + TUNING.speedGain * game.distance / DISTANCE) * (game.slow > 0 ? TUNING.slowFactor : 1);
  const previous = game.distance;
  game.distance = Math.min(DISTANCE, game.distance + game.speed * interval);
  for (const object of game.route) {
    if (object.passed || object.at > game.distance + TUNING.collisionDepth || object.at < previous - 2) continue;
    const touching = Math.abs(game.x - object.lane) < TUNING.collisionHalfWidth;
    if (touching) {
      object.passed = true;
      if (object.type === 'bottle') {
        game.bottles++;
        game.score += 25;
        game.remaining += TUNING.bonus;
        emit(game, 'bonus', 'Вода в дорогу! +2 сек');
      } else if (!game.invincible) {
        game.hits++;
        game.combo = 0;
        game.remaining = Math.max(0, game.remaining - HIT_PENALTY);
        game.invincible = TUNING.grace;
        game.slow = TUNING.slowDuration;
        emit(game, 'hit', 'Притормозили! −4 сек');
      }
    } else if (object.at < game.distance - TUNING.collisionDepth) {
      object.passed = true;
      if (object.type !== 'bottle') {
        game.dodged++;
        game.combo++;
        game.bestCombo = Math.max(game.bestCombo, game.combo);
        game.score += 10 + Math.min(40, game.combo * 2);
        if (game.combo > 0 && game.combo % 5 === 0) emit(game, 'streak', `Серия ${game.combo}! +${10 + Math.min(40, game.combo * 2)}`);
      }
    }
  }
  if (game.distance >= DISTANCE && game.remaining > 0) {
    game.phase = 'won'; game.speed = 0;
  } else if (game.remaining <= 0) {
    game.phase = 'lost'; game.speed = 0;
  }
}

// Фиксированные подшаги не дают проскочить препятствие на медленном устройстве.
export function advance(game, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  let left = seconds;
  while (left > 1e-8 && (game.phase === 'playing' || game.phase === 'countdown')) {
    const step = Math.min(left, 1 / 60);
    tick(game, step);
    left -= step;
  }
}

export function tiltAxis(gamma, beta, angle = 0) {
  if (!Number.isFinite(gamma) || !Number.isFinite(beta)) return null;
  const radians = angle * Math.PI / 180;
  return gamma * Math.cos(radians) + beta * Math.sin(radians);
}

// Гистерезис убирает дрожание у границы полосы; ноль задаётся при калибровке.
export function laneFromTilt(delta, current = 1) {
  if (!Number.isFinite(delta)) return current;
  if (delta < -12) return 0;
  if (delta > 12) return 2;
  if (Math.abs(delta) < 7) return 1;
  return current;
}
