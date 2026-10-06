/**
 * Конец отдыха — уведомлением, которое ставит сам телефон.
 *
 * Уведомление с сервера опаздывало на минуты: отдых начинается ровно
 * тогда, когда телефон убирают в карман, iPhone замораживает приложение,
 * и сервер узнаёт о времени окончания, только когда его снова открыли.
 * Местное уведомление ставится в момент запуска отдыха и срабатывает по
 * часам телефона — секунда в секунду, заблокированным и без сети.
 *
 * Сервер знает, что уведомление поставлено (session.restLocal —
 * платформа), и этому приложению своё о конце отдыха не шлёт, чтобы не
 * было двух (server/src/sync/reminders.js). Нет модуля — старая сборка,
 * сайт, Android без него — остаётся уведомление с сервера.
 */
import { plugin, isNativeApp } from './native-bridge.js';
import { getRestSignal } from './rest-alarm.js';

/** Одно на телефон: новый отдых заменяет прежний */
const REST_ID = 7001;

/**
 * Android (03.10.2026): конец отдыха — на канале «как будильник»: высокая
 * важность — всплывающая плашка поверх всего, звук и вибрация; закрыть —
 * смахнуть вверх. Пока отдых идёт — отсчёт в шторке (RestTimer.kt)
 */
const ALARM_CHANNEL = 'rest_end';
let channelReady = false;

async function alarmChannel(notes) {
  if (channelReady || platformName() !== 'android' || !notes.createChannel) return;
  try {
    await notes.createChannel({
      id: ALARM_CHANNEL, name: 'Конец отдыха', description: 'Отдых окончен — пора к следующему подходу',
      importance: 5, visibility: 1, vibration: true, lights: true,
    });
    channelReady = true;
  } catch (_) { /* без канала — обычное уведомление */ }
}

/**
 * iPhone с iOS 26+: конец отдыха будильником, как у «Таймера» — звенит,
 * пока не закроют, и в беззвучном режиме (WorkoutActivity.restAlarm,
 * сборка 1.4+). true — поставлен, уведомление не нужно
 */
let alarmUntil = 0;
// Постановка нативного сигнала асинхронна (разрешения, AlarmKit, канал
// Android). Если за это время отдых выключили, старый запрос не должен
// поставить будильник уже после cancelRestEnd. Очередь не даёт старому
// запросу отменить более новый отдых при позднем завершении.
let scheduleGeneration = 0;
let scheduleQueue = Promise.resolve();

async function iosAlarm(until) {
  if (platformName() !== 'ios') return false;
  try {
    const p = plugin('WorkoutActivity');
    if (!p || !p.restAlarm) return false;
    const { ok } = await p.restAlarm({ until, signal: getRestSignal() });
    alarmUntil = ok ? until : 0;
    return !!ok;
  } catch (_) { return false; }
}

/** Конец этого отдыха звенит будильник iPhone — странице свой звук не нужен */
export function alarmRings(until) {
  return !!until && alarmUntil === until;
}

/**
 * Будильник этого отдыха закрыли вне приложения — крестиком в «острове»,
 * на экране блокировки или на часах (03.10.2026): тогда и экран «Отдых
 * окончен» на странице закрыть. Старая сборка без restAlarmState — false
 */
export async function alarmClosed(until) {
  if (!alarmRings(until)) return false;
  try {
    const p = plugin('WorkoutActivity');
    if (!p || !p.restAlarmState) return false;
    const { state } = await p.restAlarmState();
    return state === 'none';
  } catch (_) { return false; }
}

function shade() {
  return isNativeApp() && platformName() === 'android' ? plugin('RestTimer') : null;
}

function local() {
  return isNativeApp() ? plugin('LocalNotifications') : null;
}

function platformName() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  try { return (cap && cap.getPlatform && cap.getPlatform()) || ''; } catch (_) { return ''; }
}

/** Платформа, если телефон умеет ставить уведомление сам; иначе '' */
export function localRestPlatform() {
  return local() ? platformName() : '';
}

/**
 * Поставить уведомление на время окончания отдыха. true — поставлено;
 * false — нечем или не разрешено (тогда пришлёт сервер).
 */
export function scheduleRestEnd(until, next = '') {
  const generation = ++scheduleGeneration;
  const task = scheduleQueue.catch(() => {}).then(() => scheduleRestEndNow(until, next, generation));
  scheduleQueue = task.catch(() => {});
  return task;
}

async function scheduleRestEndNow(until, next, generation) {
  const notes = local();
  if (!notes || !until || until <= Date.now() || generation !== scheduleGeneration) return false;
  try {
    const timer = shade();
    if (timer && timer.show) timer.show({ until, title: 'Отдых', text: next ? 'Дальше: ' + next : '' }).catch(() => {});
  } catch (_) { /* старый APK — без отсчёта в шторке */ }
  try {
    let { display } = await notes.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') ({ display } = await notes.requestPermissions());
    if (display !== 'granted' || generation !== scheduleGeneration) return false;
    await notes.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
    // Будильник поставлен — второе уведомление со звуком не нужно
    if (await iosAlarm(until)) {
      if (generation === scheduleGeneration) return true;
      await cancelRestEndNow();
      return false;
    }
    if (generation !== scheduleGeneration) return false;
    await alarmChannel(notes);
    if (generation !== scheduleGeneration) return false;
    await notes.schedule({
      notifications: [{
        id: REST_ID,
        title: 'Отдых окончен',
        body: next ? 'Пора: ' + next : 'Следующий подход.',
        ...(channelReady ? { channelId: ALARM_CHANNEL } : {}),
        schedule: { at: new Date(until), allowWhileIdle: true },
        extra: { url: '?tab=plan' },
        // iPhone: без звука уведомление беззвучное — ни вибрации, ни тапа
        // на Apple Watch (28.09.2026 так и было). Звук есть — есть и
        // вибрация, а часы, пока iPhone заблокирован, стучат по руке.
        // timeSensitive — пробивать режим «Фитнес»/«Не беспокоить», когда
        // в приложении включат это право (entitlement); до того iOS
        // считает уведомление обычным
        ...(platformName() === 'ios' ? { sound: 'default', interruptionLevel: 'timeSensitive' } : {}),
      }],
    });
    if (generation === scheduleGeneration) return true;
    await notes.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
    return false;
  } catch (_) {
    return false;
  }
}

/** Отдых сбросили, поставили на паузу или закончили занятие */
export async function cancelRestEnd() {
  scheduleGeneration += 1;
  return cancelRestEndNow();
}

async function cancelRestEndNow() {
  try {
    const timer = shade();
    if (timer && timer.hide) timer.hide().catch(() => {});
    const p = platformName() === 'ios' ? plugin('WorkoutActivity') : null;
    alarmUntil = 0;
    if (p && p.cancelRestAlarm) p.cancelRestAlarm().catch(() => {});
  } catch (_) { /* старый APK или сборка без будильника */ }
  const notes = local();
  if (!notes) return;
  try { await notes.cancel({ notifications: [{ id: REST_ID }] }); } catch (_) { /* уже нет */ }
}
