import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackOf, rowFields, missing, setText, setsLine, volumeOf, planScheme, planSet } from '../src/exercise-track.js';
import { fromPlan, summary } from '../src/workout-model.js';
import { doneLine, roundLine } from '../src/plan-model.js';

/**
 * Типы упражнений: что записывать в подходе и как это показать.
 * Дорожка — время, скорость, наклон; подтягивания — свой вес; выпады —
 * на ногу; гантели и Смит — вес одной стороны; дропсет — сбросы.
 */

if (!globalThis.crypto) globalThis.crypto = (await import('node:crypto')).webcrypto;

const cardio = { kind: 'cardio', machine: 'treadmill', unilateral: false, perSide: false };
const bw = { kind: 'bodyweight', machine: '', unilateral: false, perSide: false };
const lunge = { kind: 'strength', machine: '', unilateral: true, perSide: true };

test('колонки подхода — по типу и тренажёру', () => {
  assert.deepEqual(rowFields(trackOf({})).map((f) => f.key), ['weight', 'reps'], 'нет типа — силовое, как раньше');
  assert.deepEqual(rowFields(cardio).map((f) => f.key), ['time', 'speed', 'incline']);
  assert.deepEqual(rowFields({ ...cardio, machine: 'elliptical' }).map((f) => f.head), ['Время, мин', 'Уровень']);
  assert.deepEqual(rowFields({ ...cardio, machine: 'rower' }).map((f) => f.head), ['Время, мин', 'Нагрузка']);
  assert.equal(rowFields(bw)[0].placeholder, 'свой');
  assert.equal(rowFields(lunge)[0].head, 'Кг / сторона');
  assert.equal(rowFields(lunge)[1].head, 'Повт. / стор.');
});

test('отметить подход: кардио — по времени, силовое — по повторам', () => {
  assert.match(missing({ time: '' }, cardio), /время/);
  assert.equal(missing({ time: '20:30' }, cardio), '');
  assert.equal(missing({ time: '20' }, cardio), '');
  assert.match(missing({ reps: '' }, bw), /повторов/);
  assert.equal(missing({ reps: '8' }, bw), '');
});

test('силовое: без веса подход не отмечается, 0 и больше — можно', () => {
  const press = trackOf({});
  assert.match(missing({ weight: '', reps: '8' }, press), /вес/);
  assert.match(missing({ reps: '8' }, press), /вес/);
  assert.match(missing({ weight: 'abc', reps: '8' }, press), /вес/);
  assert.match(missing({ weight: '-5', reps: '8' }, press), /вес/);
  assert.equal(missing({ weight: '0', reps: '8' }, press), '');
  assert.equal(missing({ weight: '52,5', reps: '8' }, press), '');
  assert.equal(missing({ weight: '40', reps: '8' }, lunge), '');
  assert.match(missing({ weight: '40', reps: '' }, press), /повторов/);
  assert.equal(missing({ weight: '', reps: '8' }, bw), '', 'свой вес — добавка, пустая можно');
});

test('подход строкой', () => {
  assert.equal(setText({ time: '20', speed: '8', incline: '3', pulse: '140' }, cardio), '20 мин · 8 км/ч · 3% · пульс 140');
  assert.equal(setText({ time: '7:30', level: '6', distance: '2000' }, { ...cardio, machine: 'rower' }), '7:30 · нагрузка 6 · 2000 м');
  assert.equal(setText({ weight: '', reps: '10' }, bw), 'свой вес × 10');
  assert.equal(setText({ weight: '10', reps: '8' }, bw), '+10 кг × 8');
  assert.equal(setText({ assist: 'красная резинка', reps: '6' }, bw), 'поддержка: красная резинка × 6');
  assert.equal(setText({ weight: '20', reps: '12' }, lunge), '20 кг/стор. × 12 на ст.');
  assert.equal(setText({ weight: '20', reps: '10', left: '10', right: '12' }, lunge), '20 кг/стор. × Л 10 / П 12');
  assert.equal(setText({ weight: '40', reps: '8', drops: [{ weight: '30', reps: '6' }, { weight: '20', reps: '5' }] }), '40 кг × 8 → 30 × 6 → 20 × 5');
});

test('строка выполненного: одинаковые подходы — коротко, прежний вид силового не меняется', () => {
  const same = [{ weight: '20', reps: '15' }, { weight: '20', reps: '15' }];
  assert.equal(doneLine(same), '2 × 15 · 20 кг');
  assert.equal(roundLine(same), '15 повт. · 20 кг');
  assert.equal(doneLine([{ weight: '20', reps: '12' }, { weight: '22.5', reps: '10' }]), '20 кг × 12, 22.5 кг × 10');
  assert.equal(doneLine([{ reps: '10' }, { reps: '10' }], bw), '2 × 10 · свой вес');
  assert.equal(doneLine([{ time: '20', speed: '8' }], cardio), '20 мин · 8 км/ч');
  assert.equal(setsLine([{ weight: '20', reps: '12' }], lunge), '1 × 12 на ст. · 20 кг/стор.');
});

test('объём: сторона и «на сторону» удваивают, сбросы считаются, кардио — ноль', () => {
  assert.equal(volumeOf({ weight: '20', reps: '10' }), 200);
  assert.equal(volumeOf({ weight: '20', reps: '10' }, { ...lunge, unilateral: false }), 400);
  assert.equal(volumeOf({ weight: '20', reps: '10' }, lunge), 800);
  assert.equal(volumeOf({ weight: '40', reps: '8', drops: [{ weight: '30', reps: '6' }] }), 500);
  assert.equal(volumeOf({ time: '20', speed: '8' }, cardio), 0);
});

test('план строкой — по типу', () => {
  assert.equal(planScheme({ sets: '1', reps: '20', weight: '8 км/ч', track: cardio }), '20 мин · 8 км/ч');
  assert.equal(planScheme({ sets: '3', reps: '60', track: { kind: 'timed' } }), '3 × 60 с');
  assert.equal(planScheme({ sets: '3', reps: '12', track: lunge }), '3 × 12 на сторону');
  assert.equal(planScheme({ sets: '4', reps: '10', technique: 'dropset' }), '4 × 10 · дропсет в последнем');
  assert.equal(planScheme({ sets: '3', reps: '12' }, true), '12 повт.');
  assert.deepEqual(planSet({ reps: '20 мин' }, cardio), { time: '20' });
  assert.deepEqual(planSet({ reps: '10', weight: '6,5 км/ч, 5%' }, cardio), { time: '10', speed: '6.5', incline: '5' });
  assert.deepEqual(planSet({ reps: '15', weight: 'уровень 8' }, { ...cardio, machine: 'elliptical' }), { time: '15', level: '8' });
});

test('занятие из плана: кардио — один отрезок со временем, дропсет — сброс в последнем', () => {
  const s = fromPlan({ title: 'Т', exercises: [
    { name: 'Дорожка', sets: '', reps: '20', weight: '6 км/ч', track: cardio },
    { name: 'Тяга', sets: '3', reps: '10', weight: '60', technique: 'dropset' },
  ] }, 'Сентябрь 2026');
  const [run, row] = s.exercises;
  assert.equal(run.sets.length, 1);
  assert.equal(run.sets[0].time, '20');
  assert.equal(run.sets[0].weight, '', 'режим тренажёра в вес не попадает');
  assert.equal(run.sets[0].speed, '6');
  assert.equal(run.prescription, '20 мин · 6 км/ч');
  assert.deepEqual(row.sets.map((x) => (x.drops || []).length), [0, 0, 1]);
  assert.equal(row.prescription, '3 × 10 · дропсет в последнем · 60 кг');

  row.sets[2] = { ...row.sets[2], state: 'done', drops: [{ weight: '40', reps: '6' }] };
  run.sets[0] = { ...run.sets[0], state: 'done' };
  assert.equal(summary(s).volume, 60 * 10 + 40 * 6);
});

test('кардио-план: строка, фазы интервалов, отметка по любому итогу', async () => {
  const { cardioLine, intervalPhases, intervalsText, seconds, cardioFrom } = await import('../src/exercise-track.js');
  const plan = { machine: 'elliptical', metrics: ['time', 'kcal', 'pulse'], targets: { time: '30', kcal: '300', pulse: '130–150' },
    settings: { level: '6' }, intervals: { rounds: 2, fast: { time: '1:00', level: '12' }, slow: { time: '90', level: '5' } } };
  const t = trackOf({ cardio: plan });
  assert.equal(t.machine, 'elliptical');
  assert.deepEqual(t.metrics, ['time', 'kcal', 'pulse']);
  // Старый план без отметки цели: интервалы есть — они главная цель, первыми (FT-475)
  assert.equal(t.goal, 'intervals');
  assert.equal(cardioLine(plan, t), 'интервалы 2 × ускорение 1:00 (уровень 12) / замедление 1:30 (уровень 5) · 30 мин · 300 ккал · пульс 130–150 · уровень 6');
  assert.equal(cardioLine({ ...plan, goal: 'time' }, t), '30 мин · 300 ккал · пульс 130–150 · уровень 6 · интервалы 2 × ускорение 1:00 (уровень 12) / замедление 1:30 (уровень 5)');
  assert.equal(seconds('1:30'), 90);
  assert.deepEqual(intervalPhases(plan.intervals, t).map((p) => p.label + ' ' + p.round + ' ' + p.seconds), [
    'Ускорение 1 60', 'Замедление 1 90', 'Ускорение 2 60', 'Замедление 2 90',
  ]);
  assert.match(intervalsText(plan.intervals, t), /^2 × ускорение/);
  assert.equal(missing({ kcal: '310' }, t), '', 'калорий достаточно');
  assert.match(missing({ pulse: '140' }, t), /время, расстояние или калории/);
  // Старая запись: время в «повторах», режим в «весе»
  const legacy = cardioFrom({ reps: '10', weight: '6 км/ч, 5%' }, cardio);
  assert.deepEqual([legacy.targets.time, legacy.settings.speed, legacy.settings.incline], ['10', '6', '5']);
});

test('занятие из кардио-плана: режим и время-цель в отрезке, план — в снимке', () => {
  const plan = { machine: 'treadmill', goal: 'time', metrics: ['time', 'distance'], targets: { time: '30', distance: '5000' }, settings: { speed: '8', incline: '3' },
    intervals: { rounds: 4, fast: { time: '1:00', speed: '12' }, slow: { time: '2:00', speed: '6' } } };
  const s = fromPlan({ title: 'Кардио', exercises: [{ name: 'Беговая дорожка', cardio: plan }] }, 'Сентябрь 2026');
  const run = s.exercises[0];
  assert.equal(run.track.kind, 'cardio');
  assert.deepEqual(run.track.metrics, ['time', 'distance']);
  assert.equal(run.cardio.intervals.rounds, 4);
  assert.equal(run.sets.length, 1);
  assert.deepEqual([run.sets[0].time, run.sets[0].speed, run.sets[0].incline], ['30', '8', '3']);
  assert.match(run.prescription, /^30 мин · 5000 м · 8 км\/ч, 3% · интервалы 4 ×/);
});
test('вес на одну сторону: из программы — в каждый подход занятия; в суперсете у каждого своя (07.10.2026)', async () => {
  const { planOneSide, techniqueOf } = await import('../src/exercise-track.js');
  const { patchPlanExercise } = await import('../src/plan-block-actions.js');
  const dumbbell = { name: 'Жим гантелей', track: { kind: 'strength', perSide: false }, sets: '3', reps: '10', weight: '20', technique: 'side1' };
  assert.equal(planOneSide(dumbbell), true);
  const s = fromPlan({ title: 'Т', exercises: [dumbbell] }, 'Октябрь 2026');
  assert.deepEqual(s.exercises[0].sets.map((x) => x.side), ['one', 'one', 'one']);

  const pair = [{ ...dumbbell, supersetGroup: 'g' }, { ...dumbbell, name: 'Разводки', technique: '', supersetGroup: 'g' }];
  const next = patchPlanExercise(pair, 0, { technique: 'warmup1 side1' });
  assert.equal(techniqueOf(next[1].technique).warmup, 1, 'разминка — у всего суперсета');
  assert.equal(techniqueOf(next[1].technique).side, '', 'вес на сторону — у каждого упражнения свой');
});

test('кардио: главная цель — первой в плане, отрезке и строке подхода (FT-475)', async () => {
  const { cardioLine, cardioGoal } = await import('../src/exercise-track.js');
  const plan = { machine: 'treadmill', goal: 'distance', metrics: ['time', 'distance'], targets: { time: '30', distance: '5000' }, settings: { speed: '8', incline: '' } };
  const t = trackOf({ cardio: plan });
  assert.equal(t.goal, 'distance');
  assert.deepEqual(t.metrics, ['distance', 'time']);
  assert.equal(cardioLine(plan, t), '5000 м · 30 мин · 8 км/ч');
  assert.deepEqual(rowFields(t).map((f) => f.key), ['distance', 'speed', 'incline']);
  assert.equal(setText({ time: '28', speed: '8', distance: '5000' }, t), '5000 м · 28 мин · 8 км/ч');
  // Цель вписана в отрезок — его можно отметить сразу, как повторы у силового
  assert.deepEqual(planSet({ cardio: plan }, t), { speed: '8', time: '30', distance: '5000' });
  const s = fromPlan({ title: 'Кардио', exercises: [{ name: 'Беговая дорожка', cardio: plan }] }, 'Октябрь 2026');
  assert.match(s.exercises[0].prescription, /^5000 м · 30 мин/);
  assert.equal(missing(s.exercises[0].sets[0], s.exercises[0].track), '');

  // Калории главной: время не записывают — в отрезке только калории и уровень
  const kcal = { machine: 'elliptical', goal: 'kcal', metrics: ['kcal', 'pulse'], targets: { kcal: '300', pulse: '130–150' }, settings: { level: '6' } };
  assert.deepEqual(planSet({ cardio: kcal }, trackOf({ cardio: kcal })), { level: '6', kcal: '300' });
  assert.equal(cardioLine(kcal, trackOf({ cardio: kcal })), '300 ккал · пульс 130–150 · уровень 6');

  // Старый план без отметки — время, если его записывают; иначе первое из записываемого
  assert.equal(cardioGoal({ metrics: ['time', 'distance'] }), 'time');
  assert.equal(cardioGoal({ metrics: ['distance', 'pulse'] }), 'distance');
  assert.equal(cardioGoal({ metrics: ['pulse'] }), 'time');
  assert.equal(cardioGoal({ goal: 'pulse', metrics: ['pulse'] }), 'time', 'пульс главной не бывает');
  assert.deepEqual(trackOf({ cardio: { machine: 'bike', metrics: ['pulse'] } }).metrics, ['time', 'pulse']);
});

test('кардио: интервалы главной целью, скорость в об/мин у аэробайка (FT-475)', async () => {
  const { cardioLine, settingsFields } = await import('../src/exercise-track.js');
  const plan = { machine: 'other', goal: 'intervals', speedUnit: 'rpm', metrics: ['kcal'], targets: { kcal: '' },
    intervals: { rounds: 6, fast: { time: '1:00', speed: '90' }, slow: { time: '2:00', speed: '60' } } };
  const t = trackOf({ cardio: plan });
  assert.equal(t.goal, 'intervals');
  assert.equal(t.speedUnit, 'rpm');
  assert.deepEqual(settingsFields(t).map((f) => f.head), ['Скорость, об/мин', 'Уровень'], 'у «другого» есть скорость и уровень');
  assert.equal(cardioLine(plan, t), 'интервалы 6 × ускорение 1:00 (90 об/мин) / замедление 2:00 (60 об/мин)');
  // Время не записывают — калории вписывают руками
  assert.deepEqual(planSet({ cardio: plan }, t), {});
  assert.deepEqual(t.metrics, ['kcal']);

  // Записывают время — в отрезок сразу все круги подряд: 6 × (1:00 + 2:00)
  const timed = { ...plan, metrics: ['time', 'kcal'] };
  assert.deepEqual(planSet({ cardio: timed }, trackOf({ cardio: timed })), { time: '18:00' });
  assert.equal(setText({ time: '18:00', speed: '75', kcal: '120' }, trackOf({ cardio: timed })), '18:00 · 75 об/мин · 120 ккал');

  // Дорожка — всегда км/ч; об/мин только у велотренажёра и «другого»
  assert.equal(trackOf({ cardio: { ...plan, machine: 'treadmill' } }).speedUnit, undefined);
  assert.equal(settingsFields(trackOf({ cardio: { ...plan, speedUnit: '' } }))[0].head, 'Скорость, км/ч');
  // Цель «интервалы», а сами интервалы убрали — главная снова число
  assert.equal(trackOf({ cardio: { ...plan, intervals: null } }).goal, 'kcal');
});

test('кардио: фазы интервалов — сколько угодно, у каждой свой набор (09.10.2026)', async () => {
  const { cardioLine, intervalPhases, phasesOf, intervalsUse } = await import('../src/exercise-track.js');
  // Старый план — ускорение и замедление: время и то, что вписано
  const old = { machine: 'treadmill', goal: 'intervals', metrics: ['time', 'distance', 'pulse'], targets: {},
    intervals: { rounds: 6, fast: { time: '1:00', speed: '12', distance: '200', pulse: '150–160' }, slow: { time: '2:00', speed: '6', distance: '200' } } };
  const t = trackOf({ cardio: old });
  assert.deepEqual(phasesOf(old.intervals).map((p) => p.fields), [['time', 'distance', 'pulse', 'speed'], ['time', 'distance', 'speed']]);
  assert.equal(cardioLine(old, t), 'интервалы 6 × ускорение 1:00 (12 км/ч, 200 м, пульс 150–160) / замедление 2:00 (6 км/ч, 200 м)');
  assert.equal(intervalPhases(old.intervals, t)[0].mode, '12 км/ч, 200 м, пульс 150–160', 'таймер показывает цель фазы');
  // Отрезок — все круги: 6 × (1:00 + 2:00) и 6 × (200 + 200) м
  assert.deepEqual(planSet({ cardio: old }, t), { time: '18:00', distance: '2400' });

  // Новый: ускорение — на калории, замедление — на скорость, третья — горка
  const iv = { rounds: 4, phases: [
    { fields: ['kcal'], kcal: '20', speed: '15' },
    { fields: ['time', 'speed'], time: '2:00', speed: '6' },
    { name: 'Горка', fields: ['time', 'incline'], time: '0:30', incline: '8' },
  ] };
  const plan = { machine: 'treadmill', goal: 'intervals', intervals: iv, ...intervalsUse(iv) };
  assert.deepEqual(intervalsUse(iv), { metrics: ['time', 'kcal'], modes: ['speed', 'incline'] });
  const tt = trackOf({ cardio: plan });
  assert.equal(cardioLine(plan, tt), 'интервалы 4 × ускорение (20 ккал) / замедление 2:00 (6 км/ч) / горка 0:30 (8%)', 'не выбранное (скорость ускорения) не показывается');
  const phases = intervalPhases(iv, tt);
  assert.equal(phases.length, 12);
  assert.deepEqual([phases[0].seconds, phases[2].label], [0, 'Горка'], 'фаза без времени ждёт «Дальше»');
  // Время не у всех фаз — итог времени не сосчитать; калории — 4 × 20
  assert.deepEqual(planSet({ cardio: plan }, tt), { kcal: '80' });
});
