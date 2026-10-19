import test from 'node:test';
import assert from 'node:assert/strict';
import { CAREER, GAMES, createCareer, recordResult, promote, buy, useItem, priceOf, rankComplete, missionMet, restoreCareer, goalText, itemEffect, ITEMS } from '../src/career-model.js';
import { createMatchGame } from '../src/match-model.js';
import { chapterComplete, chapterProgress } from '../src/match-story.js';

const MODES = ['easy', 'medium', 'extreme'];

test('десять ступеней от улицы до собственника, по заданию в каждой игре', () => {
  assert.equal(CAREER.length, 10);
  assert.equal(CAREER[0].title, 'Тренировки на улице');
  assert.equal(CAREER.at(-1).title, 'Собственник сети');
  for (const rank of CAREER) for (const game of GAMES) assert.ok(goalText(game, rank[game]).length > 10);
  assert.equal(goalText('match', CAREER[0].match), 'Пройти главу 1 за 24 хода · 1 700 очков');
  assert.equal(goalText('match', CAREER[3].match), 'Пройти главу 2 за 18 ходов · 2 400 очков');
  assert.match(goalText('plank', CAREER[0].plank), /^3 верных ответа подряд/);
  assert.match(goalText('plank', CAREER[1].plank), /^5 верных ответов подряд/);
});

test('чем выше ступень, тем сложнее: ни одно задание не становится легче', () => {
  for (let i = 1; i < CAREER.length; i++) {
    const [was, now] = [CAREER[i - 1], CAREER[i]];
    // Самокат: режим не мягче; в том же режиме — дальше
    const mode = MODES.indexOf(now.scooter.difficulty) - MODES.indexOf(was.scooter.difficulty);
    assert.ok(mode > 0 || (mode === 0 && now.scooter.metres > was.scooter.metres), `самокат, ступень ${i + 1}`);
    // Планка: вопросы не проще; на том же уровне — длиннее серия
    assert.ok(now.plank.level > was.plank.level || (now.plank.level === was.plank.level && now.plank.streak > was.plank.streak), `планка, ступень ${i + 1}`);
    // Три в ряд: глава не раньше, ходов не больше, очков и фигур не меньше, и хоть что-то строже
    const [a, b] = [was.match, now.match];
    assert.ok(b.chapter >= a.chapter && b.moves <= a.moves && b.target >= a.target && b.count >= a.count, `три в ряд, ступень ${i + 1}`);
    assert.ok(b.chapter > a.chapter || b.moves < a.moves || b.target > a.target || b.count > a.count, `три в ряд строже, ступень ${i + 1}`);
    assert.ok(now.salary > was.salary, 'зарплата растёт');
  }
});

test('задание засчитывается один раз, повышение — только после всех трёх', () => {
  let state = createCareer();
  let r = recordResult(state, 'scooter', { difficulty: 'easy', distance: 199 });
  assert.equal(r.met, false); assert.equal(r.state.coins, 0);
  r = recordResult(state, 'scooter', { difficulty: 'medium', distance: 5000 });
  assert.equal(r.met, false, 'другой режим не считается');
  r = recordResult(state, 'scooter', { difficulty: 'easy', distance: 200 }); state = r.state;
  assert.equal(r.earned, CAREER[0].salary);
  assert.equal(recordResult(state, 'scooter', { difficulty: 'easy', distance: 900 }).earned, 0, 'повтор без зарплаты');
  assert.equal(promote(state).bonus, 0, 'без всех трёх заданий повышения нет');
  state = recordResult(state, 'plank', { streak: 3 }).state;
  state = recordResult(state, 'match', { won: true }).state;
  assert.ok(rankComplete(state));
  const { state: next, bonus } = promote(state);
  assert.equal(next.rank, 1); assert.equal(bonus, CAREER[0].salary * 2);
  assert.deepEqual(next.done, { scooter: false, plank: false, match: false });
  assert.equal(next.coins, CAREER[0].salary * 5);
});

test('последняя ступень завершает карьеру', () => {
  let state = { ...createCareer(), rank: 9 };
  for (const game of GAMES) state = recordResult(state, game, { difficulty: 'extreme', distance: 1e4, streak: 99, won: true }).state;
  state = promote(state).state;
  assert.equal(state.finished, true); assert.equal(state.rank, 9);
  assert.equal(recordResult(state, 'plank', { streak: 99 }).earned, 0);
});

test('бонусы покупаются на зарплату, цена растёт со ступенью', () => {
  let state = { ...createCareer(), coins: 130 };
  assert.equal(buy(state, 'cheat').ok, false, 'не хватает');
  const bought = buy(state, 'energy'); assert.ok(bought.ok); state = bought.state;
  assert.equal(state.coins, 10); assert.equal(state.items.energy, 1);
  assert.ok(useItem(state, 'energy').ok); assert.equal(useItem(useItem(state, 'energy').state, 'energy').ok, false);
  assert.ok(priceOf({ rank: 9 }, 'protein') > priceOf({ rank: 0 }, 'protein'));
});

test('испорченная или старая запись начинает карьеру заново', () => {
  assert.deepEqual(restoreCareer('{не json'), createCareer());
  assert.deepEqual(restoreCareer({ version: 0, rank: 4 }), createCareer());
  assert.deepEqual(restoreCareer({ version: 1, rank: 42 }), createCareer());
  const saved = { ...createCareer(), rank: 3, coins: 500, done: { scooter: true } };
  const back = restoreCareer(JSON.stringify(saved));
  assert.equal(back.rank, 3); assert.equal(back.coins, 500); assert.deepEqual(back.done, { scooter: true, plank: false, match: false });
  // Запись, поправленная руками: ни отрицательных бонусов, ни задания «выполненного» строкой
  const odd = restoreCareer({ ...createCareer(), rank: 2, coins: '12.7', done: { scooter: 'нет', plank: 1, match: true }, items: { energy: -2, cheat: 1.5, protein: 3 }, finished: 'да' });
  assert.deepEqual(odd.done, { scooter: false, plank: false, match: true });
  assert.deepEqual(odd.items, { energy: 0, cheat: 0, protein: 3 });
  assert.equal(odd.coins, 12); assert.equal(odd.finished, false);
  assert.deepEqual(restoreCareer({ ...createCareer(), rank: 2, done: null, items: 'x' }).items, createCareer().items);
});

test('действие бонуса в подписи: со строчной, но «Три в ряд» с заглавной', () => {
  assert.equal(itemEffect(ITEMS.protein), '+3 хода в задании «Три в ряд»');
  assert.equal(itemEffect(ITEMS.energy), 'один заряд нитро на старте заезда');
});

test('правила задания «Три в ряд» меняют ходы, очки и сюжетную цель главы', () => {
  const goal = CAREER[6].match;
  const game = createMatchGame(5, goal.chapter, goal);
  assert.equal(game.moves, goal.moves); assert.equal(game.target, goal.target);
  assert.equal(chapterProgress(game).required, goal.count);
  assert.equal(chapterComplete({ ...game, collected: goal.count - 1, uncovered: 6 }), false);
  assert.equal(chapterComplete({ ...game, collected: goal.count, uncovered: 6 }), true);
  assert.equal(createMatchGame(5, 1).storyGoal, undefined, 'обычная история не меняется');
  assert.ok(missionMet('match', goal, { won: true }));
});
