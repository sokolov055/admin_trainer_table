import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlineDaysLeft, onlineLabel, addOnlineMonth } from '../src/online.js';

/**
 * Онлайн-ведение (FT-530): оплаченный срок вместо пакета занятий.
 * День «по» включительно, по местному календарю.
 */

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

test('сколько дней осталось: сегодня последний — 0, вчера кончился — −1', () => {
  assert.equal(onlineDaysLeft('2026-10-15', at(2026, 10, 15, 23)), 0);
  assert.equal(onlineDaysLeft('2026-10-14', at(2026, 10, 15, 0)), -1);
  assert.equal(onlineDaysLeft('2026-11-15', at(2026, 10, 15)), 31);
  assert.equal(onlineDaysLeft('', at(2026, 10, 15)), null);
  assert.equal(onlineDaysLeft(null, at(2026, 10, 15)), null);
});

test('подпись: оплачено по / срок истёк / не указан, год — только чужой', () => {
  assert.equal(onlineLabel('2026-11-15', at(2026, 10, 15)), 'оплачено по 15 ноября');
  assert.equal(onlineLabel('2026-10-01', at(2026, 10, 15)), 'срок истёк 1 октября');
  assert.equal(onlineLabel('2027-01-10', at(2026, 12, 20)), 'оплачено по 10 января 2027 г.');
  assert.equal(onlineLabel(null), 'срок не указан');
});

test('«+ месяц»: от сегодня, если срок прошёл или не назначен', () => {
  assert.equal(addOnlineMonth(null, at(2026, 10, 16)), '2026-11-15');
  assert.equal(addOnlineMonth('2026-09-01', at(2026, 10, 16)), '2026-11-15');
  assert.equal(addOnlineMonth('', at(2026, 12, 20)), '2027-01-19');
});

test('«+ месяц»: от конца срока, если он ещё идёт', () => {
  assert.equal(addOnlineMonth('2026-11-15', at(2026, 10, 20)), '2026-12-15');
  assert.equal(addOnlineMonth('2026-10-20', at(2026, 10, 20)), '2026-11-20');
});

test('конец месяца не перескакивает в следующий', () => {
  assert.equal(addOnlineMonth(null, at(2027, 1, 31)), '2027-02-28');
  assert.equal(addOnlineMonth(null, at(2028, 1, 31)), '2028-02-29');
  assert.equal(addOnlineMonth('2027-01-30', at(2027, 1, 10)), '2027-02-28');
});

test('карточка тренера: у онлайн-клиента нет «занятия закончились», срок из строки списка', async () => {
  const { trainerOverview } = await import('../src/client/trainer-overview.js');
  const data = { row: 8, packageEnding: { perWeek: 2 } };
  const client = { row: 8, price: 6000, balance: 0, online: true, onlineUntil: '2026-11-15' };
  const out = trainerOverview(data, client, [client]);
  assert.equal(out.packageEnding.known, false);
  assert.deepEqual(out.online, { until: '2026-11-15' });
  const offline = trainerOverview(data, { ...client, online: false }, []);
  assert.equal(offline.packageEnding.out, true);
  assert.equal(offline.online, null);
});
