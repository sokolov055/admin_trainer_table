import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, LAST, canAdvance, nextStep, resumeStep, stageOf, bmrOf, timesWeek, ageOf, hasBody, fmtBirth } from '../src/client/onboarding-model.js';

const body = { sex: 'm', age: 30, height: 180, weight: 80 };
const at = (id) => STEPS.indexOf(id);

test('шаги совпадают с сервером: тело, обмен, активность, цель, опыт, место, график, план, программы', () => {
  assert.deepEqual(STEPS, ['body', 'bmr', 'lifestyle', 'goal', 'experience', 'place', 'days', 'plan', 'programs']);
  assert.equal(LAST, 8);
});

test('каждый шаг требует свой ответ; данные о теле — все четыре', () => {
  assert.equal(canAdvance({ sex: 'm', age: 30, height: 180 }, at('body')), false);
  assert.equal(canAdvance(body, at('body')), true);
  assert.equal(canAdvance({}, at('goal')), false);
  assert.equal(canAdvance({ goal: 'lose' }, at('goal')), true);
  assert.equal(canAdvance({ goal: 'weird' }, at('goal')), false);
  assert.equal(canAdvance({ days: 7 }, at('days')), false);
  assert.equal(canAdvance({ days: 3 }, at('days')), true);
  assert.equal(canAdvance({ lifestyle: 'feet' }, at('lifestyle')), true);
});

test('без данных о теле обмен, активность и план пропускаются в обе стороны', () => {
  assert.equal(nextStep({}, at('body')), at('goal'));
  assert.equal(nextStep({}, at('days')), at('programs'));
  assert.equal(nextStep({}, at('goal'), -1), at('body'));
  assert.equal(nextStep(body, at('body')), at('bmr'));
  assert.equal(nextStep(body, at('days')), at('plan'));
  assert.equal(nextStep(body, at('programs'), -1), at('plan'));
});

test('возврат к анкете не уводит за неотвеченный обязательный вопрос (черновик прежнего порядка)', () => {
  assert.equal(resumeStep({ goal: 'fitness', experience: 'beginner' }, 4), at('experience'));
  assert.equal(resumeStep({ goal: 'fitness' }, 6), at('experience'));
  assert.equal(resumeStep({}, 6), at('goal'));
  assert.equal(resumeStep({}, 0), at('body'));
  assert.equal(resumeStep({ goal: 'fitness', experience: 'beginner', place: 'gym', days: 2 }, 8), at('programs'));
  assert.equal(resumeStep({ goal: 'fitness' }, 1), at('goal'), 'обмен без данных о теле не показывается');
});

test('разделы полосы, базовый обмен как на сервере, «раза/раз в неделю»', () => {
  assert.equal(stageOf(at('bmr')), 0);
  assert.equal(stageOf(at('days')), 3);
  assert.equal(stageOf(at('programs')), 4);
  assert.equal(bmrOf(body), 1780);
  assert.equal(bmrOf({ ...body, sex: 'f' }), 1614);
  assert.equal(bmrOf({ sex: 'm' }), null);
  assert.equal(timesWeek(3), '3 раза в неделю');
  assert.equal(timesWeek(5), '5 раз в неделю');
});

test('дата рождения: полных лет до и после дня рождения, хватает вместо возраста', () => {
  const now = new Date(2026, 9, 15);
  assert.equal(ageOf({ birth: '1996-10-15' }, now), 30);
  assert.equal(ageOf({ birth: '1996-10-16' }, now), 29);
  assert.equal(ageOf({ age: 41 }, now), 41, 'прежний черновик с возрастом');
  assert.equal(hasBody({ sex: 'f', birth: '1990-05-05', height: 165, weight: 60 }), true);
  assert.equal(fmtBirth('1997-05-05'), '5 мая 1997');
});
