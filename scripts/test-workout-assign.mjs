import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekDays } from '../src/trainer/workout-assign-model.js';

/** «Назначить клиенту» тренировку (этап 4 «Тренировок», 25.11.2026) */

test('дни недели: пн–вс текущей недели, прошедшие нельзя, сегодня — можно', () => {
  // 25.11.2026 — среда
  const days = weekDays('2026-11-25');
  assert.deepEqual(days.map((d) => d.key), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  assert.deepEqual(days.map((d) => d.past), [true, true, false, false, false, false, false]);
  assert.equal(days[0].label, 'Пн');
  assert.equal(days[6].day, 7);
});

test('дни недели: воскресенье относится к неделе, которая начинается в понедельник', () => {
  // 29.11.2026 — воскресенье: неделя с 23-го, а не со следующего понедельника
  const days = weekDays('2026-11-29');
  assert.equal(days[0].key, '2026-11-23');
  assert.equal(days[6].key, '2026-11-29');
  assert.equal(days.filter((d) => d.past).length, 6);
});
