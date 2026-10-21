/**
 * Напоминания телефона (план трёх разборов, пункт 14): расчёт ближайших
 * срабатываний — src/reminders-model.js, чистые функции без Capacitor.
 *
 * Главное, что здесь стережём: «раз в две недели» не превращается в
 * «каждую неделю» при пересчёте на каждом открытии, прошедшее время не
 * ставится, номера не пересекаются с концом отдыха и влезают в предел
 * iPhone (64 уведомления на приложение).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextFires, normalizeReminders, withAnchor, reminderNote, ALL_REMINDER_IDS, DEFAULT_REMINDERS,
} from '../src/reminders-model.js';

// Среда, 21.10.2026, 12:00 по часам телефона
const NOW = new Date(2026, 9, 21, 12, 0, 0);
const on = (patch) => normalizeReminders({
  ...DEFAULT_REMINDERS,
  ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { ...DEFAULT_REMINDERS[k], on: true, ...v }])),
});
const hhmm = (d) => d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');

test('всё выключено — ничего не ставим', () => {
  assert.deepEqual(nextFires(DEFAULT_REMINDERS, NOW), []);
  assert.deepEqual(nextFires(null, NOW), [], 'пустое хранилище — тоже ничего');
});

test('взвешивание: по понедельникам в 7:30, восемь недель вперёд', () => {
  const fires = nextFires(on({ weigh: {} }), NOW);
  assert.equal(fires.length, 8);
  assert.ok(fires.every((f) => f.at.getDay() === 1 && hhmm(f.at) === '7:30'));
  assert.equal(fires[0].at.getDate(), 26, 'ближайший понедельник — 26 октября');
  assert.equal(fires[1].at - fires[0].at, 7 * 86400000);
  assert.match(fires[0].body, /запишите вес/);
});

test('сегодня, если время ещё впереди; завтра — если уже прошло', () => {
  const later = nextFires(on({ weigh: { day: 3, time: '18:00' } }), NOW);
  assert.equal(later[0].at.getDate(), 21, 'среда, 18:00 — ещё сегодня');
  const passed = nextFires(on({ weigh: { day: 3, time: '08:00' } }), NOW);
  assert.equal(passed[0].at.getDate(), 28, 'среда, 8:00 уже прошла — через неделю');
});

test('замеры раз в две недели: отсчёт запоминается и не съезжает при пересчёте', () => {
  const settings = withAnchor(on({ measure: {} }), NOW);
  assert.equal(settings.measure.anchor, '2026-10-25', 'первое — ближайшее воскресенье');
  // Открыли приложение через неделю — следующее всё равно 8 ноября, а не 1-го
  const weekLater = new Date(2026, 9, 28, 12, 0, 0);
  const fires = nextFires(settings, weekLater);
  assert.equal(fires.length, 6);
  assert.equal(fires[0].at.getMonth(), 10);
  assert.equal(fires[0].at.getDate(), 8);
  assert.ok(fires.every((f) => f.at.getDay() === 0 && hhmm(f.at) === '10:00'));
  assert.equal(fires[1].at - fires[0].at, 14 * 86400000);
});

test('замеры: сменили день недели — отсчёт заново, выключили — забыт', () => {
  const anchored = withAnchor(on({ measure: {} }), NOW);
  const moved = withAnchor({ ...anchored, measure: { ...anchored.measure, day: 6 } }, NOW);
  assert.equal(moved.measure.anchor, '2026-10-24', 'суббота');
  const off = withAnchor({ ...moved, measure: { ...moved.measure, on: false } }, NOW);
  assert.equal(off.measure.anchor, '');
  assert.equal(withAnchor(anchored, NOW), anchored, 'менять нечего — тот же объект');
});

test('еда: 13:00 и 20:00 на две недели, прошедшее сегодня — не ставим', () => {
  const fires = nextFires(on({ food: {} }), NOW);
  assert.equal(fires.length, 28);
  assert.equal(hhmm(fires[0].at), '13:00');
  assert.equal(fires[0].at.getDate(), 21);
  assert.equal(fires[0].body, 'Запишите, что съели.');
  const evening = nextFires(on({ food: {} }), new Date(2026, 9, 21, 21, 0));
  assert.equal(evening[0].at.getDate(), 22, 'после 20:00 — уже завтра');
});

test('занятие по плану: за 2 часа до начала; опоздавшее не ставим', () => {
  const settings = on({ plan: {} });
  const fires = nextFires(settings, NOW, { nextTraining: '2026-10-21T18:00:00' });
  assert.equal(fires.length, 1);
  assert.equal(hhmm(fires[0].at), '16:00');
  assert.match(fires[0].body, /18:00/);
  assert.deepEqual(nextFires(settings, NOW, { nextTraining: '2026-10-21T13:30:00' }), [], 'до начала меньше 2 часов');
  assert.deepEqual(nextFires(settings, NOW, { nextTraining: null }), [], 'занятий нет');
  assert.deepEqual(nextFires(settings, NOW, { nextTraining: 'мусор' }), []);
});

test('всё сразу: номера свои, без повторов и в пределе iPhone', () => {
  const fires = nextFires(on({ plan: {}, weigh: {}, measure: {}, food: {} }), NOW, { nextTraining: '2026-10-22T10:00:00' });
  const ids = fires.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'номера не повторяются');
  assert.ok(ids.every((id) => ALL_REMINDER_IDS.includes(id)), 'только свой ряд 7100–7159');
  assert.ok(!ids.includes(7001) && !ids.includes(7002), 'не задевают конец отдыха');
  assert.ok(fires.length <= 64 - 1, 'с концом отдыха — не больше 64');
  assert.ok(fires.every((f, i) => i === 0 || fires[i - 1].at <= f.at), 'по времени');
  assert.ok(fires.every((f) => f.at > NOW));
});

test('испорченное хранилище — значения по умолчанию', () => {
  const s = normalizeReminders({ weigh: { on: true, day: 9, time: '25:99' }, food: { times: ['x'] } });
  assert.equal(s.weigh.day, 1);
  assert.equal(s.weigh.time, '07:30');
  assert.deepEqual(s.food.times, ['13:00', '20:00']);
});

test('подписи строк — как в макете', () => {
  assert.equal(reminderNote('weigh', DEFAULT_REMINDERS), 'Понедельник, 7:30');
  assert.equal(reminderNote('measure', DEFAULT_REMINDERS), 'Раз в две недели, воскресенье, 10:00');
  assert.equal(reminderNote('food', DEFAULT_REMINDERS), 'В 13:00 и 20:00');
  assert.equal(reminderNote('plan', DEFAULT_REMINDERS), 'За 2 часа до начала');
});

/*
 * Постановка в телефон — настоящий native-reminders.js, подменены мост
 * Capacitor (LocalNotifications) и localStorage
 */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const phone = { display: 'granted', pending: [], cancelled: [], scheduled: [], channels: [], asked: 0 };
globalThis.window = {
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      LocalNotifications: {
        checkPermissions: async () => ({ display: phone.display }),
        requestPermissions: async () => { phone.asked += 1; return { display: phone.display }; },
        getPending: async () => ({ notifications: phone.pending.map((id) => ({ id: String(id) })) }),
        cancel: async ({ notifications }) => {
          const ids = notifications.map((n) => n.id);
          phone.cancelled.push(...ids);
          phone.pending = phone.pending.filter((id) => !ids.includes(id));
        },
        schedule: async ({ notifications }) => {
          phone.scheduled.push(...notifications);
          phone.pending.push(...notifications.map((n) => n.id));
        },
        createChannel: async (c) => { phone.channels.push(c.id); },
      },
    },
  },
};
const native = await import('../src/native-reminders.js');

test('телефон: ставит включённые, снимает только свои, окна разрешения сам не открывает', async () => {
  phone.pending = [7001];
  native.saveReminders(on({ weigh: {} }));
  assert.equal(await native.syncReminders(), true);
  assert.equal(phone.scheduled.length, 8);
  assert.ok(phone.scheduled.every((n) => n.channelId === 'reminders' && n.schedule.at instanceof Date));
  assert.deepEqual(phone.channels, ['reminders']);
  assert.ok(!phone.cancelled.includes(7001), 'конец отдыха не тронут');

  // Выключили — снимаются ровно поставленные, новых нет
  phone.scheduled = [];
  native.saveReminders(DEFAULT_REMINDERS);
  assert.equal(await native.syncReminders(), true);
  assert.equal(phone.scheduled.length, 0);
  assert.deepEqual(phone.pending, [7001]);

  // Разрешение отозвали в настройках телефона — не ставим и не спрашиваем
  phone.display = 'denied';
  native.saveReminders(on({ food: {} }));
  assert.equal(await native.syncReminders(), false);
  assert.equal(phone.scheduled.length, 0);
  assert.equal(phone.asked, 0);
  phone.display = 'granted';
});

test('телефон: «раз в две недели» получает отсчёт при сохранении, выход из аккаунта всё снимает', async () => {
  const saved = native.saveReminders(on({ measure: {} }), NOW);
  assert.equal(saved.measure.anchor, '2026-10-25');
  assert.equal(native.readReminders().measure.anchor, '2026-10-25', 'отсчёт лежит на телефоне');
  await native.syncReminders();
  assert.ok(phone.pending.some((id) => id >= 7120 && id < 7130));
  await native.forgetReminders();
  assert.deepEqual(phone.pending, [7001], 'остался только конец отдыха');
  assert.equal(native.readReminders().measure.on, false, 'настройки стёрты');
});
