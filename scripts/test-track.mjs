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
