import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledPlan, versionAt, programSize } from '../src/program-timeline.js';

const blocks = [1, 2, 3, 4].map((week) => ({ id: 'b' + week, title: 'Неделя ' + week, week, exercises: [] }));
const cfg = { schedule: 1, startsOn: '2026-10-26', length: 4, rule: 'client', startWeek: 1 };
const at = (day, settings = cfg, list = blocks, sessions = []) => scheduledPlan({ blocks: list, sessions, month: 'Октябрь 2026', cfg: settings, today: new Date(day + 'T12:00:00') });
const current = (p) => p.weeks[p.currentIndex];

test('программа продолжается после месяца и полугода без новых месячных листов', () => {
  assert.equal(current(at('2026-11-02')).week, 2);
  assert.equal(current(at('2026-11-23')).week, 1);
  assert.ok(current(at('2027-08-16')));
});
test('начала среди недели и паузы не дают оценки «не выполнена»', () => {
  const p = at('2026-11-02', { ...cfg, startsOn: '2026-10-28' });
  assert.equal(p.weeks[0].status, 'partial');
  assert.equal(p.pending.length, 0);
  const paused = { ...cfg, pauses: [{ from: '2026-11-02', to: '2026-11-15' }] };
  assert.equal(current(at('2026-11-09', paused)).status, 'paused');
  assert.equal(current(at('2026-11-16', paused)).week, 2);
});
test('срок и запланированная смена прекращают очередь, неделя отдыха сохраняется', () => {
  assert.equal(current(at('2026-11-02', { ...cfg, endsOn: '2026-11-01' })).status, 'expired');
  assert.equal(current(at('2026-10-30', { ...cfg, endsOn: '2026-10-29' })).status, 'expired');
  assert.equal(current(at('2026-11-02', { ...cfg, stopOn: '2026-11-01' })).need, 0);
  const rest = at('2026-11-16', cfg, blocks.slice(0, 3));
  assert.equal(current(rest).week, 4);
  assert.equal(current(rest).status, 'empty');
  assert.equal(programSize(blocks.slice(0, 3), cfg), 4);
});
test('будущая правка не меняет прошлые недели и очередь до даты применения', () => {
  const changed = [{ id: 'new', title: 'Новая', week: 1 }];
  const settings = { ...cfg, effectiveOn: '2026-11-09', startWeek: 1, length: 1,
    history: [{ from: cfg.startsOn, blocks, settings: cfg }] };
  assert.equal(current(at('2026-11-02', settings, changed)).rows[0].block.id, 'b2');
  assert.equal(current(at('2026-11-09', settings, changed)).rows[0].block.id, 'new');
  assert.equal(versionAt(changed, settings, '2026-11-02').blocks[0].id, 'b1');
});
test('правка со среды не появляется в понедельник; старый список не повторяется каждую неделю', () => {
  const changed = [{ id: 'new', title: 'Новая', week: 1 }];
  const settings = { ...cfg, effectiveOn: '2026-11-04', startWeek: 1, length: 1,
    history: [{ from: cfg.startsOn, blocks, settings: cfg }] };
  assert.equal(current(at('2026-11-02', settings, changed)).rows[0].block.id, 'b2');
  assert.equal(current(at('2026-11-04', settings, changed)).rows[0].block.id, 'new');
  const list = [{ id: 'old', title: 'Старая' }];
  const legacy = { ...settings, history: [{ from: cfg.startsOn, blocks: list, settings: { ...cfg, length: 1, legacyList: true } }] };
  const sessions = [{ id: 's-old', status: 'completed', month: 'Октябрь 2026', sourceBlockId: 'old', startedAt: '2026-10-27T12:00:00' }];
  const p = at('2026-11-02', legacy, changed, sessions);
  assert.equal(current(p).status, 'legacy');
  assert.equal(current(p).rows[0].left, 0);
});
test('сделанное по другой программе не засчитывается произвольной новой тренировке', () => {
  const sessions = [{ id: 's1', status: 'completed', sourceBlockId: 'other', month: 'Сентябрь 2026', startedAt: '2026-10-27T12:00:00' }];
  assert.equal(current(at('2026-10-28', cfg, blocks, sessions)).done, 0);
});
test('перенос требует выбора, сохраняет оценку прошлой недели и количество повторов', () => {
  const one = [blocks[0]];
  const base = { ...cfg, length: 1 };
  assert.equal(current(at('2026-11-02', base, one)).need, 1);
  assert.equal(at('2026-11-02', base, one).pending.length, 1);
  const redo = { ...base, rule: 'redo' };
  const p = at('2026-11-09', redo, one);
  assert.equal(p.weeks[0].status, 'missed');
  assert.equal(current(p).need, 3);
});

// Дни занятий и старт среди недели (решение владельца 13.11.2026)
const abc = ['A', 'B', 'C'].map((t) => ({ id: t, title: t, week: 1, exercises: [] }));
const wed = { schedule: 1, startsOn: '2026-11-18', length: 1, rule: 'client', startWeek: 1 };
const plan = (settings, day = '2026-11-18', sessions = []) => scheduledPlan({ blocks: abc, sessions, month: 'Ноябрь 2026', cfg: settings, today: new Date(day + 'T12:00:00') });
const titles = (w) => w.rows.map((r) => (r.day ? ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][r.day] + ' ' : '') + r.block.title);

test('старт в среду «по дням» Пн Ср Пт: Ср B, Пт C, A пропущена без долга', () => {
  const p = plan({ ...wed, days: [1, 3, 5], firstWeek: 'days' });
  assert.deepEqual(titles(current(p)), ['Ср B', 'Пт C']);
  assert.equal(current(p).need, 2);
  const next = plan({ ...wed, days: [1, 3, 5], firstWeek: 'days' }, '2026-11-23');
  assert.deepEqual(titles(current(next)), ['Пн A', 'Ср B', 'Пт C']);
  assert.equal(next.pending.length, 0);
});
test('старт в среду «по дням» Пн Вт Пт: только Пт C; Пн Чт Вс: Чт B, Вс C', () => {
  assert.deepEqual(titles(current(plan({ ...wed, days: [5, 1, 2], firstWeek: 'days' }))), ['Пт C']);
  assert.deepEqual(titles(current(plan({ ...wed, days: [1, 4, 7], firstWeek: 'days' }))), ['Чт B', 'Вс C']);
});
test('старт в среду «по порядку»: Ср A, Пт B, C — первой в следующей неделе, без долга', () => {
  const cfg2 = { ...wed, days: [1, 3, 5], firstWeek: 'order' };
  assert.deepEqual(titles(current(plan(cfg2))), ['Ср A', 'Пт B']);
  const next = current(plan(cfg2, '2026-11-23'));
  assert.deepEqual(titles(next), ['Пн A', 'Ср B', 'Пт C']);
  assert.equal(next.need, 4);
  const c = next.rows.find((r) => r.shifted);
  assert.equal(c.block.id, 'C');
  assert.equal(c.required, 2);
  assert.ok(c.carried);
  // через неделю — снова три
  assert.equal(current(plan(cfg2, '2026-11-30')).need, 3);
});
test('«по порядку» без дней — по доле оставшихся дней недели', () => {
  assert.equal(current(plan({ ...wed, firstWeek: 'order' })).need, 2);
  assert.equal(current(plan({ ...wed, startsOn: '2026-11-21', firstWeek: 'order' }, '2026-11-21')).need, 1);
});
test('«успеть всю неделю», старые программы без выбора и старт в понедельник — как раньше', () => {
  assert.deepEqual(titles(current(plan({ ...wed, days: [1, 3, 5], firstWeek: 'all' }))), ['Пн A', 'Ср B', 'Пт C']);
  assert.equal(current(plan(wed)).need, 3);
  const mon = { ...wed, startsOn: '2026-11-16', days: [1, 3, 5], firstWeek: 'days' };
  assert.deepEqual(titles(current(plan(mon))), ['Пн A', 'Ср B', 'Пт C']);
});
test('«по дням» без дней клиента работает как «успеть всю неделю»', () => {
  assert.equal(current(plan({ ...wed, firstWeek: 'days' })).need, 3);
});
test('перенос «по порядку» переживает неделю паузы', () => {
  const cfg2 = { ...wed, days: [1, 3, 5], firstWeek: 'order', pauses: [{ from: '2026-11-23', to: '2026-11-29' }] };
  assert.equal(current(plan(cfg2, '2026-11-23')).status, 'paused');
  assert.equal(current(plan(cfg2, '2026-11-30')).need, 4);
});
test('сделанная в другой день тренировка засчитывается', () => {
  const cfg2 = { ...wed, days: [1, 3, 5], firstWeek: 'days' };
  const s = [{ id: 's1', status: 'completed', month: 'Ноябрь 2026', sourceBlockId: 'B', startedAt: '2026-11-19T10:00:00' }];
  assert.equal(current(plan(cfg2, '2026-11-19', s)).done, 1);
});
test('перенос «по порядку» у тренировок без id (предпросмотр шаблона) — только не поместившиеся', () => {
  const raw = ['A', 'B', 'C'].map((t) => ({ title: t, week: 1, exercises: [] }));
  const p = scheduledPlan({ blocks: raw, sessions: [], month: 'Ноябрь 2026', cfg: { ...wed, days: [1, 3, 5], firstWeek: 'order' }, today: new Date('2026-11-18T12:00:00') });
  assert.deepEqual(p.weeks[1].rows.filter((r) => r.shifted).map((r) => r.block.title), ['C']);
  assert.equal(p.weeks[1].need, 4);
});
