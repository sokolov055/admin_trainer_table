import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dropMinutes, fetchRanges, gridDropStart, MAX_FETCH_DAYS, mergeRange, monthDropStart, movable, moveRequest, rangeOf, sameTimeOn, shifted,
} from '../src/trainer/calendar-move.js';

const local = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

test('событие в часовой сетке переносится по дням и четвертям часа', () => {
  const moved = gridDropStart('2026-10-06T07:00:00.000Z', 110, 20, 100, 48);
  assert.equal(moved.toISOString(), '2026-10-07T07:30:00.000Z');
  // 10 px при часе в 48 px — 12,5 мин, ближе к 15
  assert.equal(gridDropStart('2026-10-06T07:00:00.000Z', 0, 10, 100, 48).toISOString(), '2026-10-06T07:15:00.000Z');
});

test('место под пальцем: шаг 15 минут, за сутки событие не выходит', () => {
  // Взяли за середину часового занятия (grab 30 мин), палец на 10:40
  assert.equal(dropMinutes(48 * 10 + 32, 48, 30, 60), 10 * 60 + 15);
  assert.equal(dropMinutes(-50, 48, 0, 60), 0, 'выше полуночи — с 00:00');
  assert.equal(dropMinutes(48 * 24 + 100, 48, 0, 90), 24 * 60 - 90, 'ниже конца дня — заканчивается в 24:00');
});

test('событие в месяце переносится между ячейками с сохранением времени', () => {
  const moved = monthDropStart('2026-10-06T07:30:00.000Z', 205, 90, 100, 80);
  assert.equal(moved.toISOString(), '2026-10-15T07:30:00.000Z');
  assert.equal(sameTimeOn(local(2026, 10, 6, 10, 30), local(2026, 10, 21)).getTime(), local(2026, 10, 21, 10, 30).getTime());
});

test('листание — ровно на экран: 3 дня — на три, неделя — на неделю, месяц — на месяц', () => {
  const a = local(2026, 10, 19);
  assert.equal(shifted('3day', a, 1).getTime(), local(2026, 10, 22).getTime());
  assert.equal(shifted('3day', a, -1).getTime(), local(2026, 10, 16).getTime());
  assert.equal(shifted('week', a, 1).getTime(), local(2026, 10, 26).getTime());
  assert.equal(shifted('day', a, -1).getTime(), local(2026, 10, 18).getTime());
  assert.equal(shifted('month', local(2026, 10, 31), 1).getTime(), local(2026, 11, 1).getTime(), '31 октября + месяц — ноябрь, а не декабрь');
  // Неделя начинается с понедельника, сколько бы ни листали
  assert.equal(rangeOf('week', local(2026, 10, 22)).start.getTime(), local(2026, 10, 19).getTime());
});

test('загружается экран и по экрану с каждой стороны, кусками в пределах сервера', () => {
  const [r] = fetchRanges('3day', local(2026, 10, 19));
  assert.equal(r.from.getTime(), local(2026, 10, 16).getTime());
  assert.equal(r.to.getTime(), local(2026, 10, 25).getTime());
  const m = fetchRanges('month', local(2026, 10, 19));
  assert.equal(m.length, 3, 'прошлый, этот и следующий месяц');
  assert.equal(m[0].from.getTime(), local(2026, 8, 31).getTime(), 'сентябрь с понедельника его первой недели (1.09 — вторник)');
  assert.equal(m[1].from.getTime(), local(2026, 9, 28).getTime());
  const list = fetchRanges('list', local(2026, 10, 19), 84);
  assert.equal(list.length, 3);
  assert.equal(list[2].to.getTime(), local(2027, 1, 11).getTime());
  for (const view of ['day', '3day', 'week', 'month']) {
    for (const x of fetchRanges(view, local(2026, 10, 19), 84).concat(fetchRanges('list', local(2026, 10, 19), 84))) {
      assert.ok((x.to - x.from) / 86400000 <= MAX_FETCH_DAYS + 1, view + ': промежуток не длиннее предела сервера');
    }
  }
});

test('загруженное копится, свежий ответ заменяет свой промежуток', () => {
  const e = (id, at) => ({ id, startsAt: at, endsAt: at });
  let cache = mergeRange(new Map(), '2026-10-12T00:00:00.000Z', '2026-10-19T00:00:00.000Z', [e('a', '2026-10-13T08:00:00.000Z')]);
  cache = mergeRange(cache, '2026-10-19T00:00:00.000Z', '2026-10-26T00:00:00.000Z', [e('b', '2026-10-20T08:00:00.000Z'), e('c', '2026-10-21T08:00:00.000Z')]);
  assert.deepEqual([...cache.keys()].sort(), ['a', 'b', 'c'], 'прошлая неделя осталась');
  cache = mergeRange(cache, '2026-10-19T00:00:00.000Z', '2026-10-26T00:00:00.000Z', [e('b', '2026-10-22T08:00:00.000Z')]);
  assert.deepEqual([...cache.keys()].sort(), ['a', 'b'], 'удалённое на сервере пропало');
  assert.equal(cache.get('b').startsAt, '2026-10-22T08:00:00.000Z', 'перенесённое — на новом месте');
});

test('перенос занятия передаёт ответ тренера «чей перенос», личное — без него', () => {
  const next = new Date('2026-10-08T09:00:00.000Z');
  assert.deepEqual(moveRequest({ id: 'personal', personal: true, title: 'Массаж', startsAt: '2026-10-07T07:00:00.000Z', endsAt: '2026-10-07T08:00:00.000Z' }, next), {
    id: 'personal', personal: true, title: 'Массаж', startsAt: next.toISOString(), minutes: 60,
  });
  const training = { id: 'training', clientRow: 4, startsAt: '2026-10-07T07:00:00.000Z', endsAt: '2026-10-07T08:15:00.000Z' };
  assert.deepEqual(moveRequest(training, next, 'client'), {
    id: 'training', personal: false, clientRow: 4, change: 'client', startsAt: next.toISOString(), minutes: 75,
  });
  assert.equal(moveRequest(training, next, 'trainer').change, 'trainer');
  // Без ответа — исправление: в статистику переносов не попадает
  assert.equal(moveRequest(training, next).change, 'fix');
});

test('переносить можно занятия и личные события, но не списанные и не неузнанные', () => {
  assert.equal(movable({ personal: true }), true);
  assert.equal(movable({ clientRow: 3 }), true);
  assert.equal(movable({ clientRow: 3, cancelledCharged: true }), false);
  assert.equal(movable({ clientRow: null, title: 'Массаж' }), false);
});
