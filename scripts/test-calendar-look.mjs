// Вид события календаря тренера (макет calendar-redesign-2026-11-21, этап 1):
// тип события, точки под днём, строки плашки, подпись для чтения с экрана.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dayOverview } from '../src/trainer/calendar-day.js';
import { bookingOverlap } from '../src/trainer/quick-booking.js';
import { dayDots, eventAria, eventKind, eventLines } from '../src/trainer/calendar-look.js';

const lesson = { id: 'a', clientRow: 3, clientName: 'Анна', startsAt: '2026-11-21T08:00:00Z' };
const cardio = { ...lesson, id: 'b', session: { short: 'Кардио', cardio: true }, startsAt: '2026-11-21T07:00:00Z' };
const mine = { id: 'c', clientRow: null, personal: true, title: 'Обед', startsAt: '2026-11-21T10:00:00Z' };

test('тип события: тренировка, кардио по занятию программы, личное — и без клиента', () => {
  assert.equal(eventKind(lesson), 'training');
  assert.equal(eventKind(cardio), 'cardio');
  assert.equal(eventKind(mine), 'personal');
  assert.equal(eventKind({ id: 'x', title: 'Массаж', clientRow: null }), 'personal', 'неузнанное событие без клиента — личное');
  assert.equal(eventKind(null), 'training');
});

test('по одной точке каждого типа, без отменённых', () => {
  const cancelled = { ...cardio, cancelledCharged: true };
  assert.deepEqual(dayDots([lesson, lesson, mine, cardio]), ['training', 'personal', 'cardio']);
  assert.deepEqual(dayDots([lesson, cancelled]), ['training']);
  assert.deepEqual(dayDots([]), []);
});

test('строки плашки: занятие программы главнее времени', () => {
  const withSession = { ...lesson, session: { short: 'Ноги B' } };
  assert.deepEqual(eventLines(withSession, { height: 20 }), { session: '', time: false }, 'низкая — только имя');
  assert.deepEqual(eventLines(withSession, { height: 36 }), { session: 'Ноги B', time: false });
  assert.deepEqual(eventLines(withSession, { height: 60 }), { session: 'Ноги B', time: true });
  assert.deepEqual(eventLines(lesson, { height: 36 }), { session: '', time: true });
});

test('подпись для чтения с экрана называет состояние', () => {
  assert.equal(eventAria({ ...lesson, session: { short: 'Ноги B' }, unpaid: true }, '10:30–11:45'), '10:30–11:45 Анна, Ноги B, не оплачено');
  assert.equal(eventAria({ ...lesson, done: true }, '08:00–09:00'), '08:00–09:00 Анна, проведено');
  assert.equal(eventAria(mine, '13:00–14:00'), '13:00–14:00 Обед, личное');
  assert.equal(eventAria({ ...lesson, cancelledCharged: true, done: true, unpaid: true }, '1'), '1 Анна, отменено со списанием');
});

test('пересечение игнорирует старое событие на весь день, учитывает длинную запись и обычное занятие', () => {
  const from = Date.parse('2026-11-21T10:30:00Z');
  const end = Date.parse('2026-11-21T11:30:00Z');
  const legacy = { id: 'birthday', startsAt: '2026-11-21T00:00:00Z', endsAt: '2026-11-22T00:00:00Z' };
  const timed = { ...mine, endsAt: '2026-11-21T11:00:00Z' };
  const long = { ...legacy, id: 'app-booking' };
  assert.equal(bookingOverlap([legacy], from, end), undefined);
  assert.equal(bookingOverlap([legacy, timed], from, end), timed);
  assert.equal(bookingOverlap([long], from, end), long);
  assert.equal(bookingOverlap([{ ...long, id: 'demo-custom-booking' }], from, end)?.id, 'demo-custom-booking');
  assert.equal(bookingOverlap([{ ...timed, cancelledCharged: true }], from, end), undefined);
});

const day = new Date(2026, 10, 21);
const time = (hour, minute = 0) => new Date(2026, 10, 21, hour, minute);
const appointment = (id, start, end, extra) => ({
  id, clientRow: 1, startsAt: start.toISOString(), endsAt: end.toISOString(), ...extra,
});

test('сводка дня и окна учитывают пересечения, личные записи и границы суток', () => {
  const unpaid = appointment('app-unpaid', time(6), time(7), { unpaid: true });
  const events = [
    appointment('app-overnight', time(-2), time(5), { personal: true }),
    unpaid,
    appointment('app-overlap', time(6, 30), time(7, 15)),
    appointment('app-late', time(22, 15), time(25)),
    appointment('app-cancelled', time(10), time(11), { cancelledCharged: true, unpaid: true }),
    appointment('legacy', day, time(24), { clientRow: null }),
  ];
  assert.deepEqual(dayOverview(events, day, time(-1)), {
    count: 3, minutes: 210, unpaid: [unpaid],
    windows: [
      { start: +time(5), end: +time(6), minutes: 60 },
      { start: +time(7, 15), end: +time(22, 15), minutes: 900 },
    ],
  });
});

test('в окнах сегодня остаётся только время для новой записи, от часа', () => {
  const events = [appointment('app-first', time(14), time(23, 15))];
  assert.deepEqual(dayOverview(events, day, time(12, 22)).windows, [
    { start: +time(12, 30), end: +time(14), minutes: 90 },
  ]);
  assert.deepEqual(dayOverview(events, day, time(14)).windows, []);
  assert.deepEqual(dayOverview([], day, time(24)).windows, []);
});

test('новая запись на весь день блокирует окна, пустой будущий день доступен целиком', () => {
  const tomorrow = time(24);
  assert.deepEqual(dayOverview([appointment('app-full', day, tomorrow)], day, time(-1)).windows, []);
  assert.deepEqual(dayOverview([], day, time(-1)).windows, [
    { start: +day, end: +tomorrow, minutes: (+tomorrow - +day) / 60000 },
  ]);
});
