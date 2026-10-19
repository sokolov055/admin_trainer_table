import test from 'node:test';
import assert from 'node:assert/strict';
import { editSetField, fromPlan, withWarmup, withMachine } from '../src/workout-model.js';
import { wasSet, lastRunText } from '../src/effort.js';

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
