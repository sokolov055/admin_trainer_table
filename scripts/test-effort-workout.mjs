import test from 'node:test';
import assert from 'node:assert/strict';
import { editSetField, fromPlan, withWarmup, withMachine } from '../src/workout-model.js';
import { wasSet, lastRunText, repsGoalText, repsLeftText } from '../src/effort.js';

/**
 * Вес в занятии — разбор с владельцем 19.10.2026 (FT-620…628).
 */

const work = (w, extra = {}) => ({ weight: String(w), reps: '8', rpe: '', state: 'pending', kind: 'work', ...extra });
const warm = (w, extra = {}) => ({ ...work(w), reps: '10', kind: 'warmup', ...extra });
const weights = (ex) => ex.sets.map((s) => s.weight);

test('FT-620: вес разминки (гриф, 0) не переходит на рабочие подходы', () => {
  // Новое упражнение: рабочие пустые; в разминку вписали 20 — рабочие пустые
  const fresh = { name: 'Жим лёжа', target: '8', sets: [warm(''), work(''), work(''), work('')] };
  assert.deepEqual(weights(editSetField(fresh, 0, 'weight', '20')), ['20', '', '', '']);
  assert.deepEqual(weights(editSetField(fresh, 0, 'weight', '0')), ['0', '', '', '']);
  // Подход переведён в разминку, вес был как у рабочих
  const same = { name: 'Жим лёжа', target: '8', sets: [warm(60), work(60), work(60)] };
  assert.deepEqual(weights(editSetField(same, 0, 'weight', '20')), ['20', '60', '60']);
  // Рабочий вес по-прежнему переходит на следующие рабочие — и мимо разминки
  const mixed = { name: 'Жим лёжа', target: '8', sets: [work(''), warm(''), work(''), work('')] };
  assert.deepEqual(weights(editSetField(mixed, 0, 'weight', '60')), ['60', '', '60', '60']);
  assert.equal(editSetField(mixed, 0, 'weight', '60').sets[0].own, true);
});

test('FT-621: «Добавить разминку» и удаление подхода не сдвигают «было»', () => {
  const plan = { title: 'Т', exercises: [{ name: 'Жим лёжа', sets: '3', reps: '8',
    startSets: [{ weight: '50', reps: '8', kind: 'work', was: 0 }, { weight: '60', reps: '8', kind: 'work', was: 1 }, { weight: '70', reps: '8', kind: 'work', was: 2 }],
    lastRun: { date: '2026-10-15', weights: ['50', '60', '70'], reps: ['8', '8', '8'], kinds: ['work', 'work', 'work'], effort: 'ok', streak: 1, action: 'same', step: 0 } }] };
  let ex = fromPlan(plan, 'Октябрь 2026').exercises[0];
  ex = withWarmup(ex);
  const was = (e) => e.sets.map((_, i) => (wasSet(e, i) || { weight: '—' }).weight);
  assert.deepEqual(was(ex), ['—', '50', '60', '70']);
  const without = { ...ex, sets: ex.sets.filter((_, i) => i !== 1) };
  assert.deepEqual(was(without), ['—', '60', '70']);
});

test('FT-626, FT-621: смена тренажёра в занятии — шаг и связь с прошлым разом нового', () => {
  const ex = { name: 'Жим в тренажёре', load: { muscle: 'Грудь', equipment: '' }, lastRun: { weights: ['40'], reps: ['8'] },
    sets: [warm(20, { was: 0 }), work(40, { was: 0 }), work(40)] };
  const history = { lastWeight: '55', machine: { uid: 'm2', name: 'Matrix', step: 5 },
    startSets: [{ weight: '25', reps: '10', kind: 'warmup', was: 0 }, { weight: '55', reps: '8', kind: 'work', was: 1 }],
    lastRun: { weights: ['25', '50'], reps: ['10', '8'], kinds: ['warmup', 'work'] } };
  const out = withMachine(ex, { uid: 'm2', name: 'Matrix' }, history);
  assert.deepEqual(out.machine, { uid: 'm2', name: 'Matrix', step: 5 });
  assert.equal(out.load.step, 5);
  assert.deepEqual(weights(out), ['20', '55', '55']);
  assert.deepEqual(out.sets.map((s) => s.was), [0, 1, undefined]);
  assert.deepEqual(out.sets.map((_, i) => (wasSet(out, i) || {}).weight), ['25', '50', undefined]);
});

test('FT-628: вес помощи — вписанная помощь своя и переходит на рабочие, было — помощь', () => {
  const grav = { name: 'Подтягивания в гравитроне', track: { kind: 'bodyweight', weightMode: 'assistance' }, target: '8',
    sets: [{ ...work(''), assist: '' }, { ...work(''), assist: '' }] };
  const out = editSetField(grav, 0, 'assist', '30');
  assert.deepEqual(out.sets.map((s) => s.assist), ['30', '30']);
  assert.equal(out.sets[0].own, true);
  const plan = { title: 'Т', exercises: [{ name: 'Подтягивания в гравитроне', sets: '1', reps: '8', track: { kind: 'bodyweight', weightMode: 'assistance' },
    startSets: [{ weight: '', assist: '25', reps: '8', kind: 'work', was: 0 }],
    lastRun: { date: '2026-10-15', weights: ['—'], assist: ['30'], mode: 'assist', reps: ['8'], effort: 'easy', streak: 0, action: 'up', reason: 'easy', step: 5 } }] };
  const ex = fromPlan(plan, 'Октябрь 2026').exercises[0];
  assert.equal(ex.sets[0].assist, '25');
  assert.deepEqual(wasSet(ex, 0), { weight: '', assist: '30', reps: '8' });
});

test('диапазон «8–12»: в поле нижняя граница, цель — верхняя отдельной подсказкой', () => {
  const ex = fromPlan({ title: 'Т', exercises: [{ name: 'Жим', sets: '2', reps: '8–12' }] }, 'Октябрь 2026').exercises[0];
  assert.deepEqual(ex.sets.map((s) => s.reps), ['8', '8']);
  assert.equal(repsGoalText(ex), 'Повторы 8–12: дойдите до 12 во всех подходах — тогда прибавим вес');
  assert.equal(repsLeftText(ex, { ...ex.sets[0], state: 'done', reps: '10' }), 'до цели 2 повтора');
  assert.equal(repsLeftText(ex, { ...ex.sets[0], state: 'done', reps: '11' }), 'до цели 1 повтор');
  assert.equal(repsLeftText(ex, { ...ex.sets[0], state: 'done', reps: '12' }), '');
  assert.equal(repsLeftText(ex, { ...ex.sets[0], state: 'pending', reps: '10' }), '', 'до отметки — молчим');
  assert.equal(repsLeftText(ex, { ...ex.sets[0], state: 'done', reps: '6', kind: 'warmup' }), '', 'разминка не в счёт');
  // Одно число — ни цели, ни подписи
  const fixed = fromPlan({ title: 'Т', exercises: [{ name: 'Жим', sets: '1', reps: '10' }] }, 'Октябрь 2026').exercises[0];
  assert.equal(repsGoalText(fixed), '');
  assert.equal(repsLeftText(fixed, { ...fixed.sets[0], state: 'done', reps: '8' }), '');
});

test('план повторов целиком уходит в занятие (FT-624)', () => {
  const s = fromPlan({ title: 'Т', exercises: [{ name: 'Жим', sets: '3', reps: '8-12' }, { name: 'Тяга', sets: '3', reps: '10' }] }, 'Октябрь 2026');
  assert.deepEqual(s.exercises.map((e) => e.planReps), ['8-12', '10']);
});

test('подсказка «последний раз»: число, верх диапазона, перерыв, помощь', () => {
  const base = { date: '2026-10-15', weights: ['60', '60'], reps: ['12', '12'], effort: 'easy', streak: 0 };
  // FT-622: пересчёт — с числом
  assert.equal(lastRunText({ ...base, action: 'scaled', scaled: '62.5', planReps: '10', step: 2.5 }),
    'Последний раз (15.10) вы делали 60 · 60 кг на 12 повторов, вам было легко — сегодня на 10 повторов, это примерно 62,5 кг');
  // FT-625: дошли до верха диапазона
  assert.equal(lastRunText({ ...base, effort: 'ok', action: 'up', reason: 'reps', planReps: '8–12', step: 2.5 }),
    'Последний раз (15.10) вы делали 60 · 60 кг на 12 повторов, вам было нормально — повторы дошли до верха — сегодня +2,5 кг и снова с 8 повторов');
  // FT-627: перерыв
  assert.equal(lastRunText({ ...base, date: '2026-09-21', reps: ['3', '3'], weights: ['100', '100'], action: 'down', reason: 'break', gap: 28, step: 10 }),
    'Последний раз (21.09) вы делали 100 · 100 кг на 3 повтора, вам было легко — с тех пор 4 недели — сегодня −10 кг, втянуться');
  // FT-628: помощь
  assert.equal(lastRunText({ ...base, weights: ['—', '—'], assist: ['30', '30'], mode: 'assist', reps: ['8', '8'], action: 'up', reason: 'easy', step: 5 }),
    'Последний раз (15.10) вы делали с помощью 30 · 30 кг на 8 повторов, вам было легко — сегодня помощь −5 кг');
  // Старая подсказка без причины — как раньше
  assert.equal(lastRunText({ ...base, effort: 'ok', streak: 2, action: 'up', step: 2.5 }),
    'Последний раз (15.10) вы делали 60 · 60 кг на 12 повторов, вам было нормально — норм 2 раза подряд — сегодня пробуем +2,5 кг');
});

test('20.10.2026: копия подхода — без «было», own и сдвигов оценки; замена названия не теряет сделанное', async () => {
  const { cloneSet, replaceWorkoutExercise } = await import('../src/workout-model.js');
  const src = { weight: '60', reps: '8', state: 'done', kind: 'work', effort: 'easy', raised: true, was: 2, own: true, sid: 'abcd1234', moved: [{ i: 1 }], closed: true, suggest: 'easy' };
  assert.deepEqual(cloneSet(src), { weight: '60', reps: '8', state: 'pending', kind: 'work' });
  const current = { id: 'x', name: 'Жим', note: 'темп', supersetGroup: '', target: '8',
    sets: [work(60, { state: 'done', effort: 'ok' }), work(60, { state: 'done', effort: 'ok' }), work(60), work(60)] };
  const next = replaceWorkoutExercise(current, { name: 'Жим гантелей', exerciseId: 7 }, { startSets: [{ weight: '22', reps: '10' }, { weight: '24', reps: '10' }, { weight: '24', reps: '10' }] });
  assert.equal(next.name, 'Жим гантелей');
  assert.equal(next.note, 'темп');
  assert.deepEqual(next.sets.map((s) => [s.state, s.weight]), [['done', '60'], ['done', '60'], ['pending', '22'], ['pending', '24']], 'сделанное осталось, неотмеченные — из истории нового');
  const fresh = replaceWorkoutExercise({ ...current, sets: [work(60), work(60)] }, { name: 'Жим гантелей', exerciseId: 7 });
  assert.deepEqual(fresh.sets.map((s) => s.weight), ['', ''], 'ничего не сделано — подходы новые, без весов прежнего');
});

test('20.10.2026: «прошлый раз» частями — для карточки упражнения, текст тот же', async () => {
  const { lastRunParts } = await import('../src/effort.js');
  const last = { date: '2026-10-09', weights: ['100', '120'], reps: ['8', '8'], effort: 'easy', action: 'up', reason: 'easy', step: 5, streak: 0 };
  const p = lastRunParts(last);
  assert.equal(p.date, '09.10');
  assert.equal(p.was, '100 · 120 кг на 8 повторов, вам было легко');
  assert.equal(p.today, 'сегодня +5 кг');
  assert.equal(p.action, 'up');
  assert.equal(lastRunText(last), 'Последний раз (09.10) вы делали 100 · 120 кг на 8 повторов, вам было легко — сегодня +5 кг');
  assert.equal(lastRunParts(null), null);
});

test('23.10.2026: удалили лишнюю отметку — следующие подходы встают на её место и «было» берут по порядку', async () => {
  const { withoutSet } = await import('../src/workout-model.js');
  const set = (weight, state, was, kind = 'work') => ({ weight, reps: '12', state, kind, ...(was === undefined ? {} : { was }) });
  const lastRun = { date: '2026-10-16', weights: ['10', '20', '30', '40', '35'], reps: ['12', '12', '12', '12', '12'], kinds: ['warmup', 'work', 'work', 'work', 'work'] };
  // Свиридов, жим над головой: второй подход отметился сам через 3 с — его удалили
  const ex = { id: 'e', name: 'Жим', lastRun, sets: [set('10', 'done', 0, 'warmup'), set('20', 'done', 1), set('30', 'pending', 2), set('40', 'pending', 3), set('35', 'pending', 4)] };
  const fixed = withoutSet(ex, 1);
  assert.deepEqual(fixed.sets.map((s) => s.weight), ['10', '30', '40', '35']);
  assert.deepEqual(fixed.sets.map((s) => s.was), [0, 1, 2, 3], 'третий стал вторым — «было» второго');
  assert.deepEqual(wasSet(fixed, 1), { weight: '20', reps: '12' });

  // Неотмеченный удалили — подхода просто нет, «было» у остальных своё (FT-621)
  const skipped = withoutSet(ex, 3);
  assert.deepEqual(skipped.sets.map((s) => s.was), [0, 1, 2, 4]);
  // Разминку не трогает: удалили отмеченный рабочий — разминка своё «было» держит
  const warm = { ...ex, sets: [set('10', 'done', 0, 'warmup'), set('20', 'done', 1), set('10', 'pending', undefined, 'warmup'), set('30', 'pending', 2)] };
  assert.deepEqual(withoutSet(warm, 1).sets.map((s) => s.was), [0, undefined, 1]);
});

test('23.10.2026: повторы 15 → 20 — четвёртый подход без своего «было» пересчитан как третий, подсказка — по новым повторам', async () => {
  const { lastRunParts } = await import('../src/effort.js');
  // Свиридов, подъём на носки: в программе 15, прошлый раз 30 · 35 · 35 × 20
  const lastRun = { date: '2026-10-16', weights: ['30', '35', '35'], reps: ['20', '20', '20'], kinds: ['work', 'work', 'work'], planReps: '15', scaled: '37.5', effort: 'ok', streak: 1, action: 'scaled', reason: 'plan', step: 2.5 };
  const set = (weight, was) => ({ weight, reps: '15', state: 'pending', kind: 'work', ...(was === undefined ? {} : { was }) });
  let ex = { id: 'e', name: 'Подъём на носки стоя', lastRun, load: { muscle: 'Ноги', equipment: 'Тренажёр' }, track: { kind: 'strength' }, target: '15', planReps: '15',
    sets: [set('32.5', 0), set('37.5', 1), set('37.5', 2), set('37.5')] };
  assert.equal(lastRunParts(lastRun, ex.sets).today, 'сегодня на 15 повторов, это примерно 37,5 кг', 'повторы как в плане — подсказка сервера');
  for (let k = 0; k < 4; k += 1) ex = editSetField(ex, k, 'reps', '20');
  assert.deepEqual(ex.sets.map((s) => s.weight), ['30', '35', '35', '35'], 'четвёртый — как третий, а не 37,5 × 20');
  const parts = lastRunParts(lastRun, ex.sets);
  assert.equal(parts.today, 'сегодня на 20 повторов — вес пересчитан от прошлого раза');
  assert.equal(parts.action, 'same', 'без стрелки вниз');
  assert.equal(lastRunParts(lastRun, [{ ...ex.sets[0], reps: '18' }, ...ex.sets.slice(1)]).today, '', 'повторы вразнобой — о сегодня молчим');
  assert.equal(lastRunParts(lastRun).today, 'сегодня на 15 повторов, это примерно 37,5 кг', 'без подходов (часы, уведомления) — как раньше');
});
