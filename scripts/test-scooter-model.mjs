import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createRoute, begin, advance, steer, setLane, pause, resume, activateNitro, laneFromTilt, tiltAxis, DISTANCE, DURATION, TUNING, LEVELS } from '../src/scooter-model.js';

const playing = () => { const g = createGame(); begin(g); advance(g, 3.01); return g; };

test('отсчёт не съедает время поездки, кнопки ограничены тремя полосами', () => {
  const g = createGame(); begin(g); advance(g, 2);
  assert.equal(g.phase, 'countdown'); assert.equal(g.remaining, DURATION);
  advance(g, 1); assert.equal(g.phase, 'playing');
  steer(g, -1); steer(g, -1); assert.equal(g.lane, 0);
  steer(g, 1); steer(g, 1); steer(g, 1); assert.equal(g.lane, 2);
});

test('пауза сохраняет время, дорогу и обратный отсчёт', () => {
  const g = createGame(); begin(g); advance(g, 1); pause(g);
  const before = JSON.stringify(g); advance(g, 50); steer(g, 1);
  assert.equal(JSON.stringify(g), before); resume(g); assert.equal(g.phase, 'countdown');
  advance(g, 2.1); pause(g); const snapshot = JSON.stringify(g);
  advance(g, 80); assert.equal(JSON.stringify(g), snapshot); resume(g); assert.equal(g.phase, 'playing');
});

test('первый удлинённый маршрут заканчивается победой до тренировки', () => {
  const g = playing(); g.route = []; advance(g, 60);
  assert.equal(g.phase, 'won'); assert.equal(g.distance, DISTANCE);
  assert.ok(g.elapsed > 39 && g.elapsed < 46); assert.ok(g.remaining > 9);
});

test('каждый следующий уровень длиннее и получает своё время', () => {
  assert.deepEqual(LEVELS.map(level => level.distance), [1200, 1800, 2600]);
  assert.ok(LEVELS.every((level, index) => index === 0 || level.distance > LEVELS[index - 1].distance));
  const second = createGame(563, 2), final = createGame(563, 99);
  assert.equal(second.level, 2); assert.equal(second.goalDistance, 1800); assert.equal(second.remaining, 75);
  assert.equal(final.level, 3); assert.equal(final.goalDistance, 2600); assert.equal(final.remaining, 105);
  assert.ok(final.route.length > second.route.length);
});

test('истечение времени даёт проигрыш и замораживает мир', () => {
  const g = playing(); g.remaining = .2; advance(g, 1);
  assert.equal(g.phase, 'lost'); assert.equal(g.remaining, 0);
  const before = JSON.stringify(g); advance(g, 50); steer(g, -1); assert.equal(JSON.stringify(g), before);
});

test('столкновение сразу завершает попытку и замораживает мир', () => {
  const g = playing(); g.route = [{ at: 3, lane: 1, type: 'robot' }];
  const initial = g.remaining; advance(g, .5);
  assert.equal(g.hits, 1); assert.equal(g.phase, 'lost'); assert.equal(g.crashed, true);
  assert.ok(initial - g.remaining < .5); const snapshot = JSON.stringify(g);
  advance(g, 1); assert.equal(JSON.stringify(g), snapshot);
});

test('перестроение действительно позволяет объехать препятствие', () => {
  const g = playing(); g.route = [{ at: 14, lane: 1, type: 'curb' }];
  steer(g, -1); advance(g, 2);
  assert.equal(g.hits, 0); assert.equal(g.dodged, 1); assert.ok(g.x < .01);
  assert.ok(g.score > 10); assert.equal(g.combo, 1);
});

test('серия объездов растит счёт, столкновение обнуляет серию', () => {
  const g = playing();
  g.route = [
    { at: 3, lane: 0, type: 'car' },
    { at: 8, lane: 0, type: 'taxi' },
    { at: 24, lane: 1, type: 'barrier' },
  ];
  setLane(g, 2); advance(g, 1);
  assert.equal(g.combo, 2); assert.equal(g.bestCombo, 2); assert.ok(g.score >= 26);
  setLane(g, 1); advance(g, 1);
  assert.equal(g.hits, 1); assert.equal(g.combo, 0); assert.equal(g.bestCombo, 2);
});

test('бутылка прибавляет две секунды один раз', () => {
  const g = playing(); g.route = [{ at: 3, lane: 1, type: 'bottle' }];
  const initial = g.remaining; advance(g, .5);
  assert.equal(g.bottles, 1); assert.ok(Math.abs(g.remaining - initial - 1.5) < .02);
  advance(g, 2); assert.equal(g.bottles, 1);
});

test('предтрен даёт заряд, а нитро временно умножает растущую скорость', () => {
  const normal = playing(), boosted = playing();
  normal.route = []; boosted.route = [{ at: 3, lane: 1, type: 'preworkout' }];
  advance(boosted, .5);
  assert.equal(boosted.preworkouts, 1); assert.equal(boosted.nitroCharges, 1);
  normal.distance = boosted.distance; normal.remaining = boosted.remaining; normal.elapsed = boosted.elapsed;
  advance(normal, 1 / 60);
  assert.equal(activateNitro(boosted), true); assert.equal(boosted.nitroCharges, 0);
  advance(boosted, 1 / 60);
  assert.ok(boosted.speed > normal.speed * 1.4);
  assert.equal(activateNitro(boosted), false, 'активное нитро нельзя наложить второй раз');
  advance(boosted, TUNING.nitroDuration + .1);
  assert.equal(boosted.nitro, 0);
});

test('обычная скорость заметно растёт по мере приближения к залу', () => {
  const start = playing(); start.route = []; advance(start, 1 / 60);
  const finish = playing(); finish.route = []; finish.distance = DISTANCE * .9; advance(finish, 1 / 60);
  assert.ok(finish.speed > start.speed * 3);
  assert.ok(finish.speed * 3.6 > 190);
  assert.ok((TUNING.startSpeed + TUNING.speedGain) * 3.6 > 210,
    'максимум обычной езды равен прежнему темпу нитро');
  assert.ok((TUNING.startSpeed + TUNING.speedGain) * TUNING.nitroMultiplier * 3.6 > 310,
    'нитро добавляет скорость сверх нового максимума');
});

test('одновременный контакт считается одним столкновением', () => {
  const g = playing(); g.route = [{ at: 3, lane: 1, type: 'runner' }, { at: 4, lane: 1, type: 'curb' }];
  advance(g, 1); assert.equal(g.hits, 1);
});

test('60 и 30 кадров дают одинаковую дистанцию, скорость и остаток времени', () => {
  const a = playing(), b = playing(); a.route = []; b.route = [];
  for (let i = 0; i < 600; i++) advance(a, 1 / 60);
  for (let i = 0; i < 300; i++) advance(b, 1 / 30);
  assert.ok(Math.abs(a.distance - b.distance) < .001);
  assert.ok(Math.abs(a.remaining - b.remaining) < .001);
  assert.ok(a.speed > 12);
});

test('все уровни: свободная полоса есть в каждом ряду и водитель может выиграть', () => {
  for (let level = 1; level <= LEVELS.length; level++) for (let seed = 1; seed <= 100; seed++) {
    const g = createGame(seed, level); begin(g); advance(g, 3);
    for (let frame = 0; frame < 7200 && g.phase === 'playing'; frame++) {
      const next = g.route.find(o => o.type !== 'bottle' && o.type !== 'preworkout' && o.at > g.distance - 3);
      if (next) {
        const occupied = g.route.filter(o => o.at === next.at && o.type !== 'bottle' && o.type !== 'preworkout').map(o => o.lane);
        assert.ok(occupied.length < 3);
        const lanes = [0, 1, 2].filter(lane => !occupied.includes(lane)).sort((a, b) => Math.abs(a - g.x) - Math.abs(b - g.x));
        setLane(g, lanes[0]);
      }
      advance(g, 1 / 60);
    }
    assert.equal(g.phase, 'won', `уровень ${level}, маршрут ${seed}`);
    assert.equal(g.hits, 0, `уровень ${level}, контакт на маршруте ${seed}`);
  }
});

test('наклон: мёртвая зона, гистерезис и ориентация экрана', () => {
  assert.equal(laneFromTilt(-14), 0); assert.equal(laneFromTilt(14), 2);
  assert.equal(laneFromTilt(9, 2), 2); assert.equal(laneFromTilt(5, 2), 1);
  assert.equal(laneFromTilt(NaN, 0), 0);
  assert.equal(tiltAxis(null, 10), null);
  assert.equal(tiltAxis(15, 20, 0), 15);
  assert.ok(Math.abs(tiltAxis(15, 20, 90) - 20) < .001);
  assert.ok(Math.abs(tiltAxis(15, 20, 180) + 15) < .001);
  assert.ok(Math.abs(tiltAxis(15, 20, 270) + 20) < .001);
});

test('один seed даёт повторяемый маршрут; новый заезд меняет препятствия', () => {
  assert.deepEqual(createRoute(563), createRoute(563));
  assert.notDeepEqual(createRoute(563), createRoute(564));
});
