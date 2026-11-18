import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundList, roundValue, topWeight, withRounds, resizeList, cardioRound, perRoundOf } from '../src/round-plan.js';
import { planText, planScheme } from '../src/exercise-track.js';
import {
  splitGroupAt, groupLetter, groupMembers, varies, roundValues, toggleField, withLadder, withCell, stepCell, ladderStep,
  flatField, withCardioKey, groupVaries, pickedFields, pickedValue, setPicked, stepPicked, toggleCells,
} from '../src/trainer/exercise-card-model.js';
import { patchPlanExercise } from '../src/plan-block-actions.js';
import { fromPlan } from '../src/workout-model.js';
import { rateSet } from '../src/effort.js';

/** Разные круги суперсета (этап 5, шаг 2, 17.11.2026) */

const lunge = { name: 'Выпады с гантелями', sets: '3', reps: '12, 15, 20', weight: '6, 8, 10', supersetGroup: 'a', technique: '', track: { kind: 'strength' } };
const raise = { name: 'Подъём гантелей в стороны', sets: '3', reps: '12, 15, 20', weight: '3', supersetGroup: 'a', technique: '', track: { kind: 'strength' } };
const bike = {
  name: 'Аэробайк', sets: '3', reps: '', weight: '', supersetGroup: 'a', technique: '',
  track: { kind: 'cardio', machine: 'other' },
  cardio: {
    machine: 'other', goal: 'intervals', metrics: ['time'], targets: { time: '' }, settings: {},
    intervals: { rounds: 4, phases: [{ name: 'Ускорение', fields: ['time', 'speed'], time: '60', speed: '35' }, { name: 'Отдых', fields: ['time', 'speed'], time: '30', speed: '15' }] },
    perRound: { goal: 'intervals', goals: '3, 4, 5', load: 'speed', loads: '35, 38, 40' },
  },
};
const rower = {
  name: 'Гребной тренажёр', sets: '3', supersetGroup: 'b', technique: '', track: { kind: 'cardio', machine: 'rower' },
  cardio: { machine: 'rower', goal: 'kcal', metrics: ['kcal'], targets: { kcal: '15' }, settings: { level: '8' }, modes: ['level'], intervals: null,
    perRound: { goal: 'kcal', goals: '15, 20, 25', load: 'level', loads: '8, 9, 10' } },
};

test('список по кругам: у повторов любая запятая, у веса «12,5» — одно число', () => {
  assert.deepEqual(roundList('12, 15, 20'), ['12', '15', '20']);
  assert.deepEqual(roundList('12,15,20'), ['12', '15', '20']);
  assert.equal(roundList('12'), null);
  assert.equal(roundList('8–12'), null);
  assert.equal(roundList('12,5', 'weight'), null);
  assert.deepEqual(roundList('7,5, 10, 12,5', 'weight'), ['7,5', '10', '12,5']);
  assert.deepEqual(roundList('20 кг / 22,5 кг / 25 кг', 'weight'), ['20 кг', '22,5 кг', '25 кг']);
  assert.equal(roundValue('12, 15, 20', 1), '15');
  assert.equal(roundValue('12, 15', 5), '15', 'кругов больше списка — последнее');
  assert.equal(roundValue('12', 2), '12');
});

test('рабочий вес одним числом: у лесенки — наибольший', () => {
  assert.equal(topWeight('6, 8, 10'), 10);
  assert.equal(topWeight('80'), 80);
  assert.equal(topWeight('12,5'), 12.5);
  assert.equal(topWeight('80 кг'), 80);
  assert.ok(Number.isNaN(topWeight('по ощущениям')));
});

test('занятие: в подход встаёт значение своего круга', () => {
  const w = fromPlan({ title: 'Функциональная 1', exercises: [lunge, raise, bike] }, 'Ноябрь');
  const [l, r, b] = w.exercises;
  assert.deepEqual(l.sets.map((s) => s.reps), ['12', '15', '20']);
  assert.deepEqual(l.sets.map((s) => s.weight), ['6', '8', '10']);
  assert.deepEqual(l.sets.map((s) => s.target), ['12', '15', '20']);
  assert.deepEqual(r.sets.map((s) => s.weight), ['3', '3', '3'], 'вес одним числом — как раньше');
  assert.deepEqual(b.sets.map((s) => s.intervals.rounds), [3, 4, 5], 'ускорения по кругам');
  assert.deepEqual(b.sets.map((s) => s.intervals.phases[0].speed), ['35', '38', '40'], 'скорость ускорения по кругам');
  assert.equal(b.sets[1].intervals.phases[1].speed, '15', 'отдых между ускорениями не меняется');
  assert.equal(b.sets[0].time, '4:30', 'время отрезка пересчитано: 3 × (60 + 30) с');
});

test('занятие: аэробное кардио — цель и уровень круга', () => {
  const w = fromPlan({ title: 'Круг', exercises: [rower] }, 'Ноябрь');
  assert.deepEqual(w.exercises[0].sets.map((s) => s.kcal), ['15', '20', '25']);
  assert.deepEqual(w.exercises[0].sets.map((s) => s.level), ['8', '9', '10']);
});

test('занятие: разминка не считается кругом, вес лесенки важнее прошлого раза', () => {
  const w = fromPlan({ title: 'Ноги', exercises: [{ ...lunge, supersetGroup: '', technique: 'warmup1', lastWeight: '9' }] }, 'Ноябрь');
  const sets = w.exercises[0].sets;
  assert.equal(sets[0].kind, 'warmup');
  assert.deepEqual(sets.slice(1).map((s) => [s.reps, s.weight]), [['12', '6'], ['15', '8'], ['20', '10']]);
});

test('старые программы без списков — подходы как раньше', () => {
  const w = fromPlan({ title: 'Ноги', exercises: [{ name: 'Жим ногами', sets: '3', reps: '12', weight: '80', technique: '' }] }, 'Ноябрь');
  assert.deepEqual(w.exercises[0].sets.map((s) => [s.reps, s.weight, s.target]), [['12', '80', undefined], ['12', '80', undefined], ['12', '80', undefined]]);
});

test('оценка подхода: «не добил» — по повторам своего круга', () => {
  const w = fromPlan({ title: 'Круг', exercises: [{ ...lunge, supersetGroup: '', reps: '12, 15, 20', weight: '20' }] }, 'Ноябрь');
  const ex = w.exercises[0];
  ex.sets[0] = { ...ex.sets[0], state: 'done', reps: '12' };
  ex.sets[1] = { ...ex.sets[1], state: 'done', reps: '15' };
  const after = rateSet(ex, 1, 'ok').ex;
  // 15 из 15 на втором круге — не «перевыполнил»: вес следующего не трогаем
  assert.equal(after.sets[2].weight, '20');
  // Без цели круга (по первому числу, 12) те же 15 считались бы перебором
  const old = rateSet({ ...ex, sets: ex.sets.map(({ target, ...s }) => s) }, 1, 'ok').ex;
  assert.notEqual(old.sets[2].weight, '20');
});

test('звенья: собрать и разобрать суперсет в месте звена', () => {
  const list = [{ name: 'A', supersetGroup: 'g' }, { name: 'B', supersetGroup: 'g' }, { name: 'C', supersetGroup: 'g' }, { name: 'D', supersetGroup: '' }];
  const two = splitGroupAt(list, 0, 1);
  assert.deepEqual(two.map((e) => e.supersetGroup), ['', 'g-1', 'g-1', '']);
  const three = splitGroupAt(list, 1, 1);
  assert.deepEqual(three.map((e) => e.supersetGroup), ['g', 'g', '', '']);
  assert.deepEqual(groupMembers(list, 2), [0, 1, 2]);
  assert.equal(groupLetter([...list.slice(0, 3), { name: 'E', supersetGroup: 'h' }, { name: 'F', supersetGroup: 'h' }], 'h'), 'Б');
});

test('таблица: что меняется, шаг лесенкой, «все круги как 1-й»', () => {
  const ex = { name: 'Отжимания', sets: '3', reps: '12', weight: '', track: { kind: 'bodyweight' } };
  assert.equal(varies(ex, 'reps'), false);
  const on = { ...ex, ...toggleField(ex, 'reps', 3, true) };
  assert.equal(on.reps, '12, 12, 12');
  const up = { ...on, ...withLadder(on, 'reps', 3, 1) };
  assert.equal(up.reps, '12, 13, 14');
  const up3 = [1, 1].reduce((e) => ({ ...e, ...withLadder(e, 'reps', 3, 1) }), up);
  assert.equal(up3.reps, '12, 15, 18', '«+3» превращает 12 в 12 → 15 → 18');
  assert.equal(ladderStep(roundValues(up3, 'reps', 3)), 3);
  const cell = { ...up3, ...withCell(up3, 'reps', 3, 1, '16') };
  assert.equal(cell.reps, '12, 16, 18');
  assert.equal({ ...cell, ...flatField(cell, 'reps', 3) }.reps, '12');
  // Вес: шаг 2,5, у лёгкого — 1; клетка «− / +» — как у счётчика
  const w = { ...lunge, ...withLadder({ ...lunge, weight: '6' }, 'weight', 3, 1) };
  assert.equal(w.weight, '6, 7, 8');
  assert.equal(stepCell(lunge, 'weight', '10', 1), '12,5');
});

test('кардио по кругам: ускорения и скорость; смена цели; выключить — в план', () => {
  assert.deepEqual(roundValues(bike, 'goal', 3), ['3', '4', '5']);
  assert.deepEqual(cardioRound(bike.cardio, 2), { goal: ['intervals', '5'], load: ['speed', '40'] });
  const plain = { ...bike, cardio: { ...bike.cardio, perRound: null } };
  assert.equal(varies(plain, 'goal'), false);
  assert.deepEqual(roundValues(plain, 'load', 3), ['35', '35', '35'], 'нагрузка «как на всех» — из первого интервала');
  const on = { ...plain, ...toggleField(plain, 'goal', 3, true) };
  assert.equal(on.cardio.perRound.goals, '4, 4, 4');
  const kcal = { ...rower, ...withCardioKey(rower, 'goal', 'time', 3) };
  assert.equal(perRoundOf(kcal.cardio).goal, 'time');
  const off = { ...rower, ...flatField(rower, 'goal', 3) };
  assert.equal(off.cardio.targets.kcal, '15');
  assert.equal(off.cardio.perRound.goals, '');
  assert.equal(off.cardio.perRound.loads, '8, 9, 10', 'нагрузка осталась по кругам');
  assert.equal(stepCell(rower, 'goal', '15', 1), '20', 'ккал шагом 5');
});

test('«+» у кругов продолжает шаг, «−» убирает последний — у всего суперсета', () => {
  assert.equal(resizeList('12, 15, 20', 4), '12, 15, 20, 25');
  assert.equal(resizeList('6, 8, 10', 2, 'weight'), '6, 8');
  const list = [lunge, raise, bike];
  const more = patchPlanExercise(list, 0, { sets: '4' });
  assert.equal(more[0].reps, '12, 15, 20, 25');
  assert.equal(more[0].weight, '6, 8, 10, 12');
  assert.equal(more[1].reps, '12, 15, 20, 25');
  assert.equal(more[1].weight, '3');
  assert.equal(more[2].cardio.perRound.goals, '3, 4, 5, 6');
  assert.equal(more[2].sets, '4');
  assert.equal(groupVaries(list, [0, 1, 2]), true);
  assert.equal(groupVaries([{ ...raise, reps: '12' }], [0]), false);
});

test('стёрли число в клетке — пустой круг, строка не растёт (18.11.2026)', () => {
  const ex = { name: 'Отжимания от пола', sets: '3', reps: '12, 15, 20', weight: '', track: { kind: 'bodyweight' } };
  const cleared = { ...ex, ...withCell(ex, 'reps', 3, 1, '') };
  assert.equal(cleared.reps, '12, , 20');
  assert.equal(varies(cleared, 'reps'), true, 'всё ещё по кругам');
  assert.deepEqual(roundValues(cleared, 'reps', 3), ['12', '', '20']);
  // Повторное включение, шаг, «− / +» — значения на месте, строка той же длины
  const again = { ...cleared, ...toggleField(cleared, 'reps', 3, true) };
  assert.equal(again.reps, '12, , 20');
  const filled = { ...cleared, ...withCell(cleared, 'reps', 3, 1, stepCell(cleared, 'reps', '', 1)) };
  assert.equal(filled.reps, '12, 12, 20', 'пустое «+» — предложение 12');
  const ladder = { ...cleared, ...withLadder(cleared, 'reps', 3, 1) };
  assert.equal(ladder.reps, '12, 13, 14');
  // Строка, испорченная до исправления, чинится первой же правкой
  const broken = { ...ex, reps: '12, , 12, 12, , 12, 12, , 12' };
  assert.equal({ ...broken, ...withCell(broken, 'reps', 3, 0, '10') }.reps, '10, , 12');
  // В тренировке пустой круг не подставляет ничего
  const w = fromPlan({ title: 'Круг', exercises: [{ ...cleared, supersetGroup: '' }] }, 'Ноябрь');
  assert.deepEqual(w.exercises[0].sets.map((s) => s.reps), ['12', '', '20']);
});

test('все круги пустые: «Повторы» без повторов, стёрли все клетки (второй случай 18.11.2026)', () => {
  const ex = { name: 'Отжимания от пола', sets: '3', reps: '', weight: '', track: { kind: 'bodyweight' } };
  const on = { ...ex, ...toggleField(ex, 'reps', 3, true) };
  assert.equal(varies(on, 'reps'), true, '«Повторы» включились');
  assert.deepEqual(roundValues(on, 'reps', 3), ['', '', '']);
  // Дальше — правки не размножают строку
  const again = { ...on, ...toggleField(on, 'reps', 3, true) };
  assert.equal(again.reps, on.reps);
  const one = { ...on, ...withCell(on, 'reps', 3, 1, '15') };
  assert.equal(one.reps, ', 15, ');
  const cleared = { ...one, ...withCell(one, 'reps', 3, 1, '') };
  assert.deepEqual(roundValues(cleared, 'reps', 3), ['', '', '']);
  assert.equal({ ...cleared, ...flatField(cleared, 'reps', 3) }.reps, '');
  // Показ: пустые круги — пусто, без запятых
  assert.equal(planText(', , '), '');
  assert.equal(planText('12, , 20'), '12, , 20');
  assert.equal(planScheme({ ...cleared, supersetGroup: 'g' }, true), '');
  // Кардио без значения цели — то же
  const cardio = { name: 'Гребля', sets: '3', track: { kind: 'cardio', machine: 'rower' }, cardio: { machine: 'rower', goal: 'kcal', metrics: ['kcal'], targets: { kcal: '' }, settings: {} } };
  const c = { ...cardio, ...toggleField(cardio, 'goal', 3, true) };
  assert.equal(varies(c, 'goal'), true);
  assert.equal({ ...c, ...toggleField(c, 'goal', 3, true) }.cardio.perRound.goals, c.cardio.perRound.goals);
});

test('случайные цепочки правок: строка не растёт сверх числа кругов', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  const vals = ['', '12', '15', '8–12', ' ', '0', '7,5'];
  for (let run = 0; run < 3000; run++) {
    let list = [
      { name: 'A', sets: '3', reps: '', weight: '', supersetGroup: 'g', track: { kind: 'strength' } },
      { name: 'B', sets: '3', reps: '12', weight: '', supersetGroup: 'g', track: { kind: 'strength' } },
    ];
    for (let step = 0; step < 20; step++) {
      const i = rnd(2);
      const f = rnd(2) ? 'reps' : 'weight';
      const n = parseInt(list[i].sets, 10);
      const ex = list[i];
      const op = rnd(6);
      let p = null;
      if (op === 0) p = withCell(ex, f, n, rnd(n), vals[rnd(vals.length)]);
      if (op === 1) p = toggleField(ex, f, n, !varies(ex, f));
      if (op === 2) p = withLadder(ex, f, n, rnd(2) ? 1 : -1);
      if (op === 3) { const k = rnd(n); const v = stepCell(ex, f, roundValues(ex, f, n)[k], rnd(2) ? 1 : -1); if (v !== null) p = withCell(ex, f, n, k, v); }
      if (op === 4) p = { sets: String(Math.max(1, n + (rnd(2) ? 1 : -1))) };
      if (op === 5) p = flatField(ex, f, n);
      if (p) list = patchPlanExercise(list, i, p);
      for (const e of list) {
        for (const g of ['reps', 'weight']) {
          const s = String(e[g] ?? '');
          const m = parseInt(e.sets, 10);
          const l = roundList(s, g);
          assert.ok(s.length <= 8 * Math.max(m, 2) + 6, `${g} «${s}» при ${m} кругах`);
          if (l) assert.ok(l.length <= Math.max(m, 2), `${g} «${s}»: кругов в строке больше, чем ${m}`);
          if (g === 'reps') assert.ok(l || !/[,;/→]/.test(s), `повторы «${s}» с запятой, но не список`);
        }
      }
    }
  }
});

test('несколько клеток сразу: примеры владельца 18.11.2026', () => {
  const st = (name, reps) => ({ name, sets: '3', reps, weight: '', supersetGroup: 'g', track: { kind: 'bodyweight' } });
  const row = { name: 'Гребной тренажёр', sets: '3', supersetGroup: 'g', track: { kind: 'cardio', machine: 'rower' },
    cardio: { machine: 'rower', goal: 'kcal', metrics: ['kcal'], targets: { kcal: '30' }, settings: {}, perRound: { goal: 'kcal', goals: '30, 50, 70', load: 'speed', loads: '' } } };
  let list = [st('Приседы', ''), st('Подтягивания', '12, 15, 20'), st('Отжимания', '12, 15, 20'), st('Ролик', '12, 15, 20'), row];
  const apply = (changes) => { changes.forEach(([i, v]) => { list = patchPlanExercise(list, i, v); }); };
  // «В первом круге во всех, кроме последнего, по 12»: круг 1 целиком, снять последнее
  let picked = toggleCells(new Set(), list.map((_, i) => i + ':0'));
  picked = toggleCells(picked, ['4:0']);
  assert.deepEqual(pickedFields(list, [...picked]).map((f) => f.field), ['reps', 'weight']);
  apply(setPicked(list, [...picked], 'reps', 3, '10'));
  assert.deepEqual(list.slice(0, 4).map((e) => roundValues(e, 'reps', 3)[0]), ['10', '10', '10', '10']);
  assert.equal(list[0].reps, '10, , ', 'приседы стали «по кругам»');
  assert.equal(list[4].cardio.perRound.goals, '30, 50, 70', 'кардио не тронуто');
  // «В первом и втором у второго и третьего по 20»
  const four = ['1:0', '1:1', '2:0', '2:1'];
  apply(setPicked(list, four, 'reps', 3, '20'));
  assert.equal(list[1].reps, '20, 20, 20');
  assert.equal(list[2].reps, '20, 20, 20');
  assert.deepEqual(pickedValue(list, four, 'reps', 3), { same: true, value: '20' });
  // «− / +» — каждая на шаг от своего
  apply(stepPicked(list, ['3:0', '3:1', '3:2'], 'reps', 3, 1));
  assert.equal(list[3].reps, '11, 16, 21');
  assert.equal(pickedValue(list, ['3:0', '3:1'], 'reps', 3).same, false);
  // Кардио — своя строка «Цель», шаг 5 ккал
  apply(stepPicked(list, ['4:0', '4:2', '0:0'], 'goal', 3, 1));
  assert.equal(list[4].cardio.perRound.goals, '35, 50, 75');
  assert.equal(list[0].reps, '10, , ', 'у силового «Цели» нет — не тронуто');
  // Весь круг ещё раз — снять
  assert.equal(toggleCells(new Set(['0:1', '1:1']), ['0:1', '1:1']).size, 0);
});
