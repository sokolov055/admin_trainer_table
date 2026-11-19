// Пауза в тренировках — заморозка (макет freeze-2026-11-19-v2, 19.11.2026):
// календарь, выбор дней, чип в списке тренера.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calendar, pickDay, listChip, spanText, spanDays, addDays, daysWord, CLIENT_MAX_DAYS } from '../src/pause/pause-model.js';

test('календарь начинается с понедельника, прошлое и дальше предела — выключены', () => {
  const days = calendar({ first: '2026-11-19', weeks: 2, min: '2026-11-19', max: '2026-11-25', from: '2026-11-20', to: '2026-11-23' });
  assert.equal(days[0].day, '2026-11-16', 'четверг 19-го — неделя с понедельника 16-го');
  assert.equal(days.length, 14);
  const by = Object.fromEntries(days.map((d) => [d.day, d]));
  assert.ok(by['2026-11-18'].off && !by['2026-11-19'].off && by['2026-11-26'].off);
  assert.ok(by['2026-11-20'].start && by['2026-11-23'].end && by['2026-11-21'].in && !by['2026-11-24'].in);
});

test('выбор дней: начало, конец, назад — новое начало, клиенту не больше 30 дней', () => {
  let r = pickDay({ from: null, to: null }, '2026-11-20');
  assert.deepEqual(r, { from: '2026-11-20', to: null });
  r = pickDay(r, '2026-11-25');
  assert.deepEqual(r, { from: '2026-11-20', to: '2026-11-25' });
  assert.deepEqual(pickDay(r, '2026-11-28'), { from: '2026-11-28', to: null }, 'выбор закончен — тап начинает заново');
  assert.deepEqual(pickDay({ from: '2026-11-20', to: null }, '2026-11-19'), { from: '2026-11-19', to: null });
  const long = pickDay({ from: '2026-11-20', to: null }, '2027-01-15', CLIENT_MAX_DAYS);
  assert.equal(spanDays(long.from, long.to), 30, 'дальше 30 дней — обрезается');
});

test('тексты: «20 нояб. — 3 дек.», до разморозки, дни', () => {
  assert.equal(spanText('2026-11-20', '2026-12-03'), '20 нояб. — 3 дек.');
  assert.equal(spanText('2026-11-20', null), 'с 20 нояб. до разморозки');
  assert.equal(daysWord(14), '14 дней');
  assert.equal(daysWord(1), '1 день');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('чип в списке тренера', () => {
  assert.equal(listChip(null), null);
  assert.deepEqual(listChip({ state: 'requested' }), { tone: 'ask', text: '⏳ просит паузу' });
  assert.equal(listChip({ state: 'active', to: '2026-12-03' }).text, '❄️ до 3 дек.');
  assert.equal(listChip({ state: 'active', to: null, dayNo: 42 }).text, '❄️ 42-й день');
  assert.equal(listChip({ state: 'upcoming', from: '2026-11-25', to: '2026-12-03' }).text, '❄️ с 25 нояб.');
});
