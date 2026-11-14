import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timelineWith, weekAt, weekItems, movedToDay, movedToWeek, removedFromWeek, addedToWeek, revertedWeek, clean,
  firstOpenDay, freeDay, crowdedDays, changedWeeks, spanShort,
} from '../src/week-edits.js';
import { weekQueue } from '../src/plan-weeks.js';

/**
 * Редактор по неделям (FT-788, этап 3, макет week-editor-mockup.html):
 * сценарий владельца — на неделе 3 занятия, последнее не успевают,
 * переносим на следующую, там 4; программа не меняется.
 */
const id = (k) => 'b' + String(k).repeat(16).slice(0, 16);
const blocks = [
  { id: id(1), title: 'Ноги', week: 1, exercises: [] },
  { id: id(2), title: 'Кардио', week: 1, with: true, exercises: [{ name: 'Бег', cardio: true }] },
  { id: id(3), title: 'Спина', week: 1, exercises: [] },
  { id: id(4), title: 'Грудь', week: 1, exercises: [] },
];
const [A, , B, C] = blocks.map((b) => b.id);
const W1 = '2091-01-15'; // понедельник
const W2 = '2091-01-22';
const W3 = '2091-01-29';
const cfg = { schedule: 1, startsOn: W1, length: 1, rule: 'client', startWeek: 1, days: [1, 3, 5] };
const today = new Date(W1 + 'T12:00:00');
const tl = (weekEdits = {}, sessions = []) => timelineWith({ blocks, sessions, month: 'Январь 2091', cfg, weekEdits, until: W3, today });

test('раскладка недели: занятия с днями, «Ноги + Кардио» — одно занятие', () => {
  const w = weekAt(tl(), W1);
  assert.deepEqual(w.layout, [{ id: A, day: 1 }, { id: B, day: 3 }, { id: C, day: 5 }]);
  assert.deepEqual(weekItems(w).map((it) => it.title), ['Ноги + Кардио', 'Спина', 'Грудь']);
  assert.equal(w.edited, false);
  assert.equal(spanShort(W1), '15–21 янв');
});

test('перенос на следующую неделю: там 4 занятия, здесь 2 и неделя «выполнена» по двум', () => {
  const t0 = tl();
  const edits = movedToWeek({}, t0, W1, 2, W2, null, W1);
  assert.deepEqual(edits[W1], [{ id: A, day: 1 }, { id: B, day: 3 }]);
  // ближайший свободный день следующей недели — вторник
  assert.deepEqual(edits[W2].at(-1), { id: C, day: 2, from: W1 });
  const done = [A, id(2), B].map((sourceBlockId, i) => ({ status: 'completed', month: 'Январь 2091', sourceBlockId, startedAt: `2091-01-1${5 + i}T10:00:00` }));
  const t = tl(edits, done);
  const w1 = weekAt(t, W1);
  const w2 = weekAt(t, W2);
  assert.equal(w1.need, 2);
  assert.equal(w1.done, 2);
  assert.deepEqual(w1.sent, [{ id: C, to: W2 }]);
  assert.equal(w2.need, 4);
  const items = weekItems(w2);
  assert.deepEqual(items.filter((it) => it.id === C).map((it) => [it.day, it.from]), [[5, ''], [2, W1]]);
  // Очередь клиента — по дням недели
  assert.deepEqual(weekQueue(w2).map((r) => r.block.title), ['Ноги', 'Кардио', 'Грудь', 'Спина']);
  // Программа не меняется: третья неделя — как была
  assert.equal(weekAt(t, W3).edited, false);
  assert.equal(weekAt(t, W3).need, 3);
});

test('перенос по дням, без дня, «убрать без долга», «+ занятие»', () => {
  const t0 = tl();
  let e = movedToDay({}, t0, W1, 2, 6);
  assert.deepEqual(weekAt(tl(e), W1).layout.at(-1), { id: C, day: 6 });
  e = movedToDay(e, tl(e), W1, 0, 0);
  assert.equal(weekItems(weekAt(tl(e), W1))[0].day, 0);
  e = removedFromWeek(e, tl(e), W1, 1);
  assert.equal(weekAt(tl(e), W1).need, 2);
  e = addedToWeek(e, tl(e), W1, B, 7);
  assert.deepEqual(weekAt(tl(e), W1).layout.at(-1), { id: B, day: 7 });
  assert.deepEqual(crowdedDays(weekItems(weekAt(tl(movedToDay({}, t0, W1, 2, 3)), W1)), W1), ['Ср 17']);
});

test('вернуть неделю как в программе: перенесённое возвращается, правка, совпавшая с программой, исчезает', () => {
  const base = tl();
  const moved = movedToWeek({}, base, W1, 2, W2, 2, W1);
  // Вернули неделю-источник — из следующей занятие уходит
  assert.deepEqual(revertedWeek(moved, base, W1, W1), {});
  // Вернули неделю-получатель — занятие возвращается в источник на свой день
  assert.deepEqual(revertedWeek(moved, base, W2, W1), {});
  // Перенесли и вернули руками — это не правка
  const back = movedToDay(movedToDay({}, base, W1, 2, 6), tl(movedToDay({}, base, W1, 2, 6)), W1, 2, 5);
  assert.deepEqual(clean(back, base), {});
  assert.deepEqual(changedWeeks({}, moved), [W1, W2]);
});

test('прошедшие дни закрыты, свободный день — с сегодняшнего', () => {
  assert.equal(firstOpenDay(W1, '2091-01-17'), 3);
  assert.equal(firstOpenDay(W1, '2091-01-22'), 8);
  assert.equal(firstOpenDay(W2, '2091-01-17'), 1);
  assert.equal(freeDay([{ day: 1 }, { day: 3 }], 1), 2);
  assert.equal(freeDay([1, 2, 3, 4, 5, 6, 7].map((day) => ({ day })), 1), 0);
});

test('сделанное занятие — при двух одинаковых сделанным считается раннее по дню', () => {
  const e = addedToWeek({}, tl(), W1, C, 2);
  const s = [{ status: 'completed', month: 'Январь 2091', sourceBlockId: C, startedAt: '2091-01-16T10:00:00' }];
  const items = weekItems(weekAt(tl(e, s), W1)).filter((it) => it.id === C);
  assert.deepEqual(items.map((it) => [it.day, it.done]), [[5, false], [2, true]]);
});
