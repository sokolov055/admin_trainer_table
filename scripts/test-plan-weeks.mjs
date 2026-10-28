import test from 'node:test';
import assert from 'node:assert/strict';

import { monthWeeks, weekDates, weekPlan, weekQueue, lighten } from '../src/plan-weeks.js';

/**
 * Недельные циклы (IDEA-7, 27.10.2026): недели по календарю с неполными,
 * «не выполнена» после конца недели, «доделать» — первой в следующую, и
 * выключенные недели не меняют ничего.
 */

const A = { id: 'baaaaaaaaaaaaaaaa', title: 'А', exercises: [{ name: 'Жим', weight: '60', lastWeight: '62.5' }] };
const B = { id: 'bbbbbbbbbbbbbbbbb', title: 'Б', exercises: [{ name: 'Присед', weight: '80' }] };
const MONTH = 'Ноябрь 2026';
const done = (block, day) => ({ status: 'completed', sourceBlockId: block.id, month: MONTH, startedAt: `2026-11-${day}T10:00:00`, updatedAt: `2026-11-${day}T11:00:00` });
const cfg = (extra = {}) => ({ on: true, kinds: ['normal', 'heavy', 'light'], lightPct: 20, rule: 'client', choices: {}, ...extra });
const at = (day) => new Date(`2026-11-${day}T12:00:00`);

test('ноябрь 2026: шесть недель, первая и последняя — по дню и короткие', () => {
  const w = monthWeeks(MONTH);
  assert.deepEqual(w.map(weekDates), ['1 ноября', '2–8 ноября', '9–15 ноября', '16–22 ноября', '23–29 ноября', '30 ноября']);
  assert.deepEqual(w.map((x) => x.short), [true, false, false, false, false, true]);
  assert.equal(monthWeeks('Декабрь 2026').length, 5);
  assert.equal(monthWeeks('Своё название'), null);
});

test('выключено — null: экран показывает месячную очередь как раньше', () => {
  assert.equal(weekPlan({ blocks: [A, B], sessions: [], month: MONTH, cfg: null }), null);
  assert.equal(weekPlan({ blocks: [A, B], sessions: [], month: 'Своё название', cfg: cfg() }), null);
});

test('сделанное считается в своей неделе, очередь недели — несделанное', () => {
  const p = weekPlan({ blocks: [A, B], sessions: [done(A, '03')], month: MONTH, cfg: cfg(), today: at('04') });
  assert.equal(p.currentIndex, 1);
  const w = p.weeks[1];
  assert.equal(w.kind, 'heavy');
  assert.equal(w.done, 1);
  assert.deepEqual(weekQueue(w).map((r) => r.block.title), ['Б']);
  // На следующей неделе А снова в очереди
  assert.deepEqual(weekQueue(p.weeks[2]).map((r) => r.block.title), ['А', 'Б']);
});

test('неделя кончилась — «не выполнена», клиенту лист выбора', () => {
  const p = weekPlan({ blocks: [A, B], sessions: [done(A, '03')], month: MONTH, cfg: cfg(), today: at('10') });
  assert.equal(p.weeks[1].missed, 1);
  assert.deepEqual(p.pending.map((r) => r.block.title), ['Б']);
  // Пока не решено — долг не переносится
  assert.deepEqual(weekQueue(p.weeks[2]).map((r) => r.block.title), ['А', 'Б']);
});

test('«доделать» — пропущенная первой, неделя на одну длиннее', () => {
  const p = weekPlan({ blocks: [A, B], sessions: [done(A, '03')], month: MONTH, cfg: cfg({ choices: { ['2:' + B.id]: 'redo' } }), today: at('10') });
  assert.equal(p.pending.length, 0);
  const w = p.weeks[2];
  assert.equal(w.required, 3);
  assert.deepEqual(weekQueue(w).map((r) => [r.block.title, r.carried, r.left]), [['Б', true, 2], ['А', false, 1]]);
});

test('правило тренера решает без клиента', () => {
  const redo = weekPlan({ blocks: [A, B], sessions: [done(A, '03')], month: MONTH, cfg: cfg({ rule: 'redo' }), today: at('10') });
  assert.equal(redo.pending.length, 0);
  assert.equal(redo.weeks[2].required, 3);
  const skip = weekPlan({ blocks: [A, B], sessions: [done(A, '03')], month: MONTH, cfg: cfg({ rule: 'skip' }), today: at('10') });
  assert.equal(skip.pending.length, 0);
  assert.equal(skip.weeks[2].required, 2);
});

test('короткая неделя: пропусков нет, и в следующую ничего не переносится', () => {
  const p = weekPlan({ blocks: [A, B], sessions: [], month: MONTH, cfg: cfg({ rule: 'redo' }), today: at('03') });
  assert.equal(p.weeks[0].missed, 0);
  assert.equal(p.weeks[1].required, 2);
  assert.deepEqual(weekQueue(p.weeks[0]).map((r) => r.block.title), ['А', 'Б']);
});

test('лёгкая неделя: числа ниже на процент с шагом 0,5, «+5» не трогаем', () => {
  const light = lighten({ title: 'А', exercises: [
    { name: 'Жим', weight: '60', lastWeight: '62.5', startSets: [{ weight: '20', kind: 'warmup' }, { weight: '62.5', kind: 'work' }] },
    { name: 'Подтягивания', weight: '+5' },
    { name: 'Пара', weight: '40', performers: ['Е', 'К'] },
  ] }, 20);
  assert.equal(light.exercises[0].weight, '48');
  assert.equal(light.exercises[0].lastWeight, '50');
  assert.deepEqual(light.exercises[0].startSets.map((s) => s.weight), ['20', '50']);
  assert.equal(light.exercises[1].weight, '+5');
  assert.equal(light.exercises[2].weight, '40');
});
