import assert from 'node:assert/strict';
import test from 'node:test';

import { gridDropStart, monthDropStart, moveRequest } from '../src/trainer/calendar-move.js';

test('событие в часовой сетке переносится по дням и получасам', () => {
  const moved = gridDropStart('2026-10-06T07:00:00.000Z', 110, 20, 100, 48);
  assert.equal(moved.toISOString(), '2026-10-07T07:30:00.000Z');
});

test('событие в месяце переносится между ячейками с сохранением времени', () => {
  const moved = monthDropStart('2026-10-06T07:30:00.000Z', 205, 90, 100, 80);
  assert.equal(moved.toISOString(), '2026-10-15T07:30:00.000Z');
});

test('перенос личного события сохраняет название, а занятия отмечает инициативой тренера', () => {
  const next = new Date('2026-10-08T09:00:00.000Z');
  assert.deepEqual(moveRequest({ id: 'personal', personal: true, title: 'Массаж', startsAt: '2026-10-07T07:00:00.000Z', endsAt: '2026-10-07T08:00:00.000Z' }, next), {
    id: 'personal', personal: true, title: 'Массаж', startsAt: next.toISOString(), minutes: 60,
  });
  assert.deepEqual(moveRequest({ id: 'training', clientRow: 4, startsAt: '2026-10-07T07:00:00.000Z', endsAt: '2026-10-07T08:15:00.000Z' }, next), {
    id: 'training', personal: false, clientRow: 4, change: 'trainer', startsAt: next.toISOString(), minutes: 75,
  });
  assert.equal(moveRequest({ id: 'google', title: 'Не распознано', startsAt: '2026-10-07T07:00:00.000Z', endsAt: '2026-10-07T08:00:00.000Z' }, next).personal, false);
});
