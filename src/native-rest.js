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

/** Одно на телефон: новый отдых заменяет прежний */
const REST_ID = 7001;

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
export async function scheduleRestEnd(until) {
  const notes = local();
  if (!notes || !until || until <= Date.now()) return false;
  try {
    let { display } = await notes.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') ({ display } = await notes.requestPermissions());
    if (display !== 'granted') return false;
    await notes.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
    await notes.schedule({
      notifications: [{
        id: REST_ID,
        title: 'Отдых закончен',
        body: 'Следующий подход.',
        schedule: { at: new Date(until), allowWhileIdle: true },
        extra: { url: '?tab=plan' },
      }],
    });
    return true;
  } catch (_) {
    return false;
  }
}

/** Отдых сбросили, поставили на паузу или закончили занятие */
export async function cancelRestEnd() {
  const notes = local();
  if (!notes) return;
  try { await notes.cancel({ notifications: [{ id: REST_ID }] }); } catch (_) { /* уже нет */ }
}
