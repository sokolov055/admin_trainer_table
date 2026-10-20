import test from 'node:test';
import assert from 'node:assert/strict';
import { focusOf, nextInfo, nextText, supersetMark, unitsOf, setsWord, planText } from '../src/workout-view.js';

const set = (state, weight = '', reps = '10') => ({ state, weight, reps, kind: 'work' });

test('focusOf: первый неотмеченный подход; в суперсете — ближайший круг, кто в нём ещё не сделал', () => {
  const s = { exercises: [
    { id: 'a', supersetGroup: '', sets: [set('done'), set('done')] },
    { id: 'b', supersetGroup: 'g', sets: [set('done'), set('pending')] },
    { id: 'c', supersetGroup: 'g', sets: [set('pending'), set('pending')] },
  ] };
  assert.deepEqual(focusOf(s), { ex: 'c', set: 0 }, 'круг 1 не закрыт: у «c» первый подход');
  assert.deepEqual(focusOf({ exercises: [{ id: 'a', sets: [set('done')] }] }), { ex: '', set: -1 });
});

test('focusOf: держится упражнения, где отметили подход, а не первого по списку (QA 20.10.2026)', () => {
  // Кардио первым, к нему не притрагивались; отметили первый подход приседа
  const s = { exercises: [
    { id: 'cardio', supersetGroup: '', sets: [set('pending')] },
    { id: 'squat', supersetGroup: '', sets: [set('done'), set('pending'), set('pending')] },
    { id: 'press', supersetGroup: '', sets: [set('pending'), set('pending')] },
  ] };
  assert.deepEqual(focusOf(s, 'squat'), { ex: 'squat', set: 1 }, 'с подсказкой — следующий подход приседа');
  assert.deepEqual(focusOf(s), { ex: 'squat', set: 1 }, 'без подсказки (перезагрузка) — начатое упражнение, а не кардио');
  // Присед закончен — дальше по списку: кардио всё ещё ждёт
  const done = { exercises: [s.exercises[0], { ...s.exercises[1], sets: [set('done'), set('done'), set('done')] }, s.exercises[2]] };
  assert.deepEqual(focusOf(done, 'squat'), { ex: 'cardio', set: 0 });
  // Подсказка на суперсет — круг целиком: у напарника подход того же круга
  const round = { exercises: [
    { id: 'cardio', supersetGroup: '', sets: [set('pending')] },
    { id: 'b', supersetGroup: 'g', sets: [set('done'), set('pending')] },
    { id: 'c', supersetGroup: 'g', sets: [set('pending'), set('pending')] },
  ] };
  assert.deepEqual(focusOf(round, 'b'), { ex: 'c', set: 0 });
});

test('nextInfo: «вес тот же · было тяжело» — когда вес не сдвинулся после «тяжело»', () => {
  const ex = { id: 'a', name: 'Присед', supersetGroup: '', sets: [{ ...set('done', '100', '5'), effort: 'hard' }, set('pending', '100', '5')] };
  assert.deepEqual(nextInfo({ exercises: [ex] }, { ex: 'a', set: 1 }).change, { kind: 'same', text: 'вес тот же · было тяжело' });
});

test('nextInfo: куда идти и что накинуть; суперсет — весь круг', () => {
  const ex = { id: 'a', name: 'Присед', prevWeight: '', supersetGroup: '', sets: [set('done', '100', '5'), set('pending', '102.5', '5')] };
  const n = nextInfo({ exercises: [ex] }, { ex: 'a', set: 1 });
  assert.equal(n.name, 'Присед');
  assert.equal(n.part, 'подход 2 из 2');
  assert.equal(n.load, '102,5 кг × 5');
  assert.deepEqual(n.change, { kind: 'up', text: 'накинуть 2,5 кг' });
  assert.equal(nextText({ exercises: [ex] }), 'Присед · подход 2 из 2 · 102,5 кг × 5');
  const round = { exercises: [
    { id: 'b', name: 'Жим', supersetGroup: 'g', sets: [set('done', '60'), set('pending', '60')] },
    { id: 'c', name: 'Тяга', supersetGroup: 'g', sets: [set('done', '50'), set('pending', '55')] },
  ] };
  const r = nextInfo(round, focusOf(round));
  assert.equal(r.name, 'Суперсет');
  assert.equal(r.part, 'круг 2 из 2');
  assert.deepEqual(r.items.map((i) => [i.name, i.change && i.change.kind]), [['Жим', 'same'], ['Тяга', 'up']]);
});

test('supersetMark и unitsOf: суперсет из одного — не суперсет', () => {
  const list = [
    { id: 'a', supersetGroup: 'g' }, { id: 'b', supersetGroup: 'g' }, { id: 'c', supersetGroup: 'lonely' }, { id: 'd', supersetGroup: '' },
  ];
  assert.equal(supersetMark(list, 1), 'Суперсет · 2 из 2, без отдыха между упражнениями');
  assert.equal(supersetMark(list, 2), '');
  assert.deepEqual(unitsOf(list).map((u) => [u.key, u.items.length]), [['gg', 2], ['c', 1], ['d', 1]]);
});

test('подписи: подходы словом, план без RPE', () => {
  assert.equal(setsWord(1), '1 подход');
  assert.equal(setsWord(3), '3 подхода');
  assert.equal(setsWord(11), '11 подходов');
  assert.equal(planText('3 × 12 · RPE 8 · 20 кг'), '3 × 12 · 20 кг');
});
