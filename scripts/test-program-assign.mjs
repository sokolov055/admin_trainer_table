import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientStatus, clientsView, dativeName, startTiles, defaultStart, endOf, monthOfStart, startText,
  assignPlan, assignCalendar, shortDate, dayDate,
} from '../src/trainer/program-assign-model.js';
import { programLength, defaultHow } from '../src/plan-weeks.js';
import { sessionQueue } from '../src/program-timeline.js';

/** «Назначить клиенту» в «Библиотеке» (этап 4, 17.11.2026) */

const ex = [{ name: 'Присед', sets: '3', reps: '10' }];
const weekly = { id: 7, kind: 'program', weekLength: 2, blocks: [
  { title: 'Ноги', week: 1, exercises: ex }, { title: 'Верх', week: 1, exercises: ex }, { title: 'Кардио', week: 1, with: true, exercises: ex },
  { title: 'Всё тело', week: 1, exercises: ex },
  { title: 'Ноги', week: 2, load: 'heavy', exercises: ex }, { title: 'Верх', week: 2, load: 'heavy', exercises: ex }, { title: 'Всё тело', week: 2, load: 'heavy', exercises: ex },
] };
const flat = { id: 8, kind: 'program', blocks: [{ title: 'А', exercises: ex }, { title: 'Б', exercises: ex }, { title: 'В', exercises: ex }] };

// Прежняя форма AssignForm (Library.jsx до 17.11.2026) — что уходило серверу. Новая обязана слать то же
function oldPayload({ template, clientRow, month, mode, startsOn, endsOn, days, beat, firstPick, startWeek, how, length, prev }) {
  const blocks = template.blocks;
  const weeks = Math.max(programLength(blocks), Number(template.weekLength) || 0);
  const howNow = how || defaultHow(blocks);
  const same = !!(prev && prev.same);
  const continueWeek = same ? prev.continueWeek : 1;
  const chosenStart = startWeek === '' ? continueWeek : Number(startWeek);
  const replacing = mode === 'replace';
  const weekly = replacing && (weeks > 0 || howNow !== 'list');
  const laid = weekly ? (weeks ? blocks : blocks.map((b, i) => ({ ...b, week: howNow === 'cycle' ? 1 : Math.min(length, Math.ceil((i + 1) * length / blocks.length)) }))) : [];
  const size = weeks || (howNow === 'cycle' ? 1 : length);
  const alternate = beat.rhythm.length > 1;
  const weekDays = alternate ? (beat.rhythmDays[0] || []) : days;
  const def = (d) => (d && d.length ? 'days' : 'order');
  const firstWeek = firstPick === 'days' && !weekDays.length ? def(weekDays) : firstPick || def(weekDays);
  const queue = weekly ? sessionQueue(laid.map((b, i) => ({ ...b, id: b.id || 'p' + i }))) : [];
  const oneId = beat.one !== '' && queue[beat.one] ? queue[beat.one][0].id : '';
  return {
    clientRow, month, templateId: template.id, mode,
    ...(weekly ? { effectiveOn: startsOn, weeks: { schedule: 1, startsOn, endsOn, effectiveOn: startsOn, length: size, days: alternate ? [] : days, firstWeek,
      rhythm: beat.rhythm, rhythmDays: alternate ? beat.rhythmDays.slice(0, beat.rhythm.length).map((d) => d || []) : [], ...(beat.one !== '' && oneId ? { oneSessionAt: beat.one } : {}) } } : {}),
    ...(replacing && !weeks ? { how: howNow, ...(howNow === 'split' ? { length } : {}) } : {}),
    ...(weekly ? { startWeek: chosenStart } : {}),
  };
}

test('статус клиента: свободна, эта же, скоро конец, занята, себя', () => {
  const today = '2026-11-17';
  assert.equal(clientStatus({ name: 'А' }, 7, today).kind, 'free');
  assert.deepEqual(clientStatus({ name: 'А', programNow: { templateId: '7', week: 2 } }, 7, today), { kind: 'same', line: 'Эта программа · 2-я неделя', tag: 'эта же' });
  const end = clientStatus({ name: 'М', programNow: { templateId: '3', title: 'Девушки 2 раза', endsOn: '2026-11-22' } }, 7, today);
  assert.deepEqual(end, { kind: 'end', line: '«Девушки 2 раза» до вс 22 ноя', tag: 'скоро конец' });
  assert.equal(clientStatus({ name: 'Е', programNow: { templateId: '3', title: 'Тонус', endsOn: '' } }, 7, today).line, '«Тонус» · без конца');
  assert.equal(clientStatus({ name: 'Е', programNow: { templateId: '', endsOn: '2026-12-20' } }, 7, today).line, 'Своя программа · до 20 дек');
  assert.equal(clientStatus({ name: 'Я', self: true }, 7, today).kind, 'self');

  const list = [{ name: 'Мария', programNow: { templateId: '3', endsOn: '2026-11-20' } }, { name: 'Анна' }, { name: 'Я · Костя', self: true }, { name: 'Ольга', programNow: { templateId: '7' } }];
  const all = clientsView(list, { templateId: 7, today });
  assert.deepEqual(all.rows.map((c) => c.name), ['Я · Костя', 'Мария', 'Анна', 'Ольга'], 'себя — первым');
  assert.deepEqual(all.counts, { free: 1, end: 1 });
  assert.deepEqual(clientsView(list, { templateId: 7, filter: 'free', today }).rows.map((c) => c.name), ['Анна']);
  assert.deepEqual(clientsView(list, { templateId: 7, q: 'ольг', today }).rows.map((c) => c.name), ['Ольга']);
});

test('имя в дательном падеже', () => {
  assert.equal(dativeName('Мария Смирнова'), 'Марии');
  assert.equal(dativeName('Анна'), 'Анне');
  assert.equal(dativeName('Ольга Петрова'), 'Ольге');
  assert.equal(dativeName('Таня'), 'Тане');
  assert.equal(dativeName('Дмитрий'), 'Дмитрию');
  assert.equal(dativeName('Игорь'), 'Игорю');
  assert.equal(dativeName('Олег'), 'Олегу');
  assert.equal(dativeName('Любовь'), 'Любови');
  assert.equal(dativeName('Олег + Светлана'), 'Олег + Светлана', 'пару не склоняем');
});

test('даты: плитки, конец по неделям, месяц истории, подписи', () => {
  assert.deepEqual(startTiles('2026-11-17').map((t) => t.value), ['2026-11-17', '2026-11-23']);
  assert.equal(startTiles('2026-11-23').length, 1, 'в понедельник — одна плитка');
  assert.equal(defaultStart('2026-11-17'), '2026-11-23');
  assert.equal(defaultStart('2026-11-23'), '2026-11-30', 'как прежде: следующий понедельник');
  assert.equal(endOf('2026-11-23', 4), '2026-12-20');
  assert.equal(endOf('2026-11-23', 0), '');
  assert.equal(monthOfStart('2026-11-23'), 'Ноябрь 2026');
  assert.equal(monthOfStart('2026-11-30'), 'Декабрь 2026', 'неделя с четвергом 3 декабря — декабрьская');
  assert.equal(startText('2026-11-17', '2026-11-17'), 'сегодня');
  assert.equal(startText('2026-11-23', '2026-11-17'), 'с 23 ноя');
  assert.equal(shortDate('2026-12-01'), '1 дек');
  assert.equal(dayDate('2026-11-22'), 'вс 22 ноя');
});

test('серверу уходит то же, что слала прежняя форма', () => {
  const base = { clientRow: 5, month: 'Ноябрь 2026', mode: 'replace', startsOn: '2026-11-23', endsOn: '', days: [], beat: { rhythm: [], rhythmDays: [], one: '' }, firstPick: '', startWeek: '', how: '', length: 2, prev: null };
  const cases = [
    { ...base, template: weekly },
    { ...base, template: weekly, startsOn: '2026-11-18', days: [1, 3, 5], firstPick: 'order', endsOn: '2026-12-20' },
    { ...base, template: weekly, beat: { rhythm: [3, 1], rhythmDays: [[1, 3, 5], []], one: 2 } },
    { ...base, template: weekly, beat: { rhythm: [2], rhythmDays: [], one: '' }, days: [2, 4] },
    { ...base, template: weekly, prev: { same: true, continueWeek: 2 } },
    { ...base, template: weekly, prev: { same: true, continueWeek: 2 }, startWeek: 1 },
    { ...base, template: weekly, mode: 'append' },
    { ...base, template: flat },
    { ...base, template: flat, how: 'split', length: 3 },
    { ...base, template: flat, how: 'list' },
    { ...base, template: { ...flat, blocks: [...flat.blocks, ...flat.blocks] } },
  ];
  for (const c of cases) assert.deepEqual(assignPlan(c).payload, oldPayload(c), JSON.stringify({ ...c, template: c.template.id }));
  // Новое — только правило пропуска, и то если выбрано
  const ruled = assignPlan({ ...base, template: weekly, rule: 'redo' }).payload;
  assert.equal(ruled.weeks.rule, 'redo');
  assert.equal('rule' in assignPlan({ ...base, template: weekly }).payload.weeks, false);
  assert.equal(assignPlan({ ...base, template: weekly, mode: 'append', rule: 'redo' }).payload.weeks, undefined, 'дописать — без недель');
});

test('календарь: буквы по названию, дни, «в любой день», штриховка до начала', () => {
  // Пн/Ср/Пт с понедельника: неделя 1 — Ноги, Верх(+Кардио), Всё тело
  const plan = assignPlan({ template: weekly, clientRow: 5, month: 'Ноябрь 2026', startsOn: '2026-11-23', days: [1, 3, 5] });
  const cal = assignCalendar(plan, { startsOn: '2026-11-23' });
  assert.deepEqual(cal.legend.map((l) => [l.letter, l.title]), [['А', 'Ноги'], ['Б', 'Верх + Кардио'], ['В', 'Всё тело'], ['Г', 'Верх']]);
  assert.equal(cal.weeks.length, 4);
  const row = (w) => w.cells.map((c) => c.s.map((s) => s.letter).join('') || '·').join('');
  assert.equal(row(cal.weeks[0]), 'А·Б·В··');
  assert.equal(row(cal.weeks[1]), 'А·Г·В··', 'неделя 2 — Верх без кардио');
  assert.deepEqual(cal.weeks.map((w) => [w.week, w.load]), [[1, ''], [2, 'heavy'], [1, ''], [2, 'heavy']]);
  assert.ok(cal.weeks.every((w) => w.cells.every((c) => !c.before)));

  // Без дней — всё в «любой день»
  const free = assignCalendar(assignPlan({ template: weekly, clientRow: 5, month: 'Ноябрь 2026', startsOn: '2026-11-23' }), { startsOn: '2026-11-23' });
  assert.deepEqual(free.weeks[0].free.map((s) => s.letter), ['А', 'Б', 'В']);

  // Со среды, «по порядку»: пн–вт заштрихованы, Ноги в ср, Верх в пт, Всё тело — в начало следующей
  const mid = assignPlan({ template: weekly, clientRow: 5, month: 'Ноябрь 2026', startsOn: '2026-11-18', days: [1, 3, 5], firstPick: 'order' });
  assert.equal(mid.midWeek, true);
  const cm = assignCalendar(mid, { startsOn: '2026-11-18' });
  assert.deepEqual(cm.weeks[0].cells.map((c) => c.before), [true, true, false, false, false, false, false]);
  assert.equal(row(cm.weeks[0]), '··А·Б··');
  assert.ok(cm.weeks[1].free.some((s) => s.title === 'Всё тело') || row(cm.weeks[1]).includes('В'), 'перенос — в следующую неделю');

  // «Успеть всю неделю»: Ноги (пн — до начала) — в «любой день»
  const all = assignCalendar(assignPlan({ template: weekly, clientRow: 5, month: 'Ноябрь 2026', startsOn: '2026-11-18', days: [1, 3, 5], firstPick: 'all' }), { startsOn: '2026-11-18' });
  assert.equal(row(all.weeks[0]), '··Б·В··');
  assert.deepEqual(all.weeks[0].free.map((s) => s.letter), ['А']);

  // Конец через 4 недели: дальше пусто; больше 6 в неделю — over
  const ended = assignCalendar(assignPlan({ template: weekly, clientRow: 5, month: 'Ноябрь 2026', startsOn: '2026-11-25', endsOn: endOf('2026-11-25', 2) }), { startsOn: '2026-11-25', endsOn: endOf('2026-11-25', 2) });
  assert.ok(ended.weeks[2].cells.some((c) => c.after));
  const many = { id: 9, kind: 'program', weekLength: 1, blocks: Array.from({ length: 7 }, (_, i) => ({ title: 'Т' + i, week: 1, exercises: ex })) };
  assert.equal(assignCalendar(assignPlan({ template: many, clientRow: 5, month: 'Ноябрь 2026', startsOn: '2026-11-23' }), { startsOn: '2026-11-23' }).weeks[0].over, true);

  // Списком — календаря нет
  assert.deepEqual(assignCalendar(assignPlan({ template: flat, how: 'list', clientRow: 5, month: 'Ноябрь 2026', startsOn: '2026-11-23' }), { startsOn: '2026-11-23' }).weeks, []);
});
