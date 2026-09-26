/**
 * Уведомления в Android-приложении.
 *
 * Web Push внутри WebView оболочки не работает, поэтому у приложения свой
 * канал — Firebase: телефон выдаёт токен, сервер шлёт на него то же, что
 * и в браузер (server/src/lib/fcm.js). push.js в приложении ведёт сюда, и
 * экран настроек остаётся прежним: «Включить уведомления».
 *
 * Разрешение (Android 13+) спрашиваем только по нажатию — как и в
 * браузере. Токен Firebase иногда меняется, поэтому при каждом запуске,
 * если разрешение уже есть, он заново отдаётся серверу (refreshNativePush).
 */
import { apiPublic, apiMutate } from './api.js';
import { describeDevice } from './session.js';
import { plugin } from './native-bridge.js';

const TOKEN_KEY = 'native_push_token_v1';
const OFF_KEY = 'native_push_off_v1';

function remember(key, value) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch (_) {}
}
function recall(key) {
  try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
}

export function nativePushAvailable() {
  return !!plugin('PushNotifications');
}

/** Выдать токен: регистрация отвечает событием, а не обещанием */
function register(push) {
  return new Promise((resolve, reject) => {
    let done = false;
    const handles = [];
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      handles.forEach((h) => h && h.then && h.then((x) => x && x.remove && x.remove()));
      fn(value);
    };
    handles.push(push.addListener('registration', (t) => finish(resolve, t && t.value)));
    handles.push(push.addListener('registrationError', (e) => finish(reject, new Error((e && e.error) || 'Телефон не выдал адрес для уведомлений.'))));
    push.register().catch((e) => finish(reject, e));
    setTimeout(() => finish(reject, new Error('Телефон не ответил. Проверьте интернет и попробуйте ещё раз.')), 20000);
  });
}

async function send(token, clientRow) {
  await apiMutate('push.native.register', {
    token,
    platform: 'android',
    device: describeDevice(),
    ...(clientRow ? { clientRow } : {}),
  });
  remember(TOKEN_KEY, token);
  remember(OFF_KEY, '');
}

export async function nativePushStatus() {
  const push = plugin('PushNotifications');
  if (!push) return { supported: false, permission: 'unsupported', subscribed: false, native: true };
  let permission = 'default';
  try {
    const res = await push.checkPermissions();
    permission = res.receive === 'granted' ? 'granted' : res.receive === 'denied' ? 'denied' : 'default';
  } catch (_) { /* считаем, что ещё не спрашивали */ }
  return { supported: true, permission, subscribed: permission === 'granted' && !!recall(TOKEN_KEY), native: true };
}

export async function enableNativePush(clientRow) {
  const push = plugin('PushNotifications');
  if (!push) return { ok: false, reason: 'Эта версия приложения не умеет уведомления — обновите её.' };

  const { enabled } = await apiPublic('push.native.status', {});
  if (!enabled) return { ok: false, reason: 'Уведомления пока не настроены на сервере.' };

  let res = await push.checkPermissions();
  if (res.receive !== 'granted') res = await push.requestPermissions();
  if (res.receive !== 'granted') {
    return {
      ok: false,
      reason: res.receive === 'denied'
        ? 'Уведомления запрещены. Разрешить их можно в настройках телефона: Приложения → Fit Track → Уведомления.'
        : 'Разрешение не выдано.',
    };
  }

  try {
    await push.createChannel({ id: 'fit', name: 'Напоминания', description: 'Взвешивание, замеры, конец отдыха', importance: 4, visibility: 1 });
  } catch (_) { /* канал уже есть */ }

  const token = await register(push);
  if (!token) return { ok: false, reason: 'Телефон не выдал адрес для уведомлений.' };
  await send(token, clientRow);
  return { ok: true };
}

export async function disableNativePush() {
  const push = plugin('PushNotifications');
  const token = recall(TOKEN_KEY);
  if (token) {
    try { await apiMutate('push.native.unregister', { token }); } catch (_) { /* сервер сам уберёт мёртвый токен */ }
  }
  remember(TOKEN_KEY, '');
  // Выключили сами — при запуске не включать обратно
  remember(OFF_KEY, '1');
  if (push) { try { await push.unregister(); } catch (_) {} }
  return { ok: true };
}

/**
 * При запуске приложения: разрешение уже есть и человек не выключал —
 * отдать серверу свежий токен (Firebase меняет его после переустановки,
 * очистки данных, иногда и сам). Без вопросов и без окон.
 */
export async function refreshNativePush() {
  const push = plugin('PushNotifications');
  if (!push || recall(OFF_KEY)) return;
  try {
    const res = await push.checkPermissions();
    if (res.receive !== 'granted') return;
    const token = await register(push);
    if (token) await send(token);
  } catch (_) { /* не вышло сейчас — выйдет при следующем запуске */ }
}

/** Нажали на уведомление — открыть то, о чём оно (url внутри сайта) */
export function listenNativeTaps(open) {
  const push = plugin('PushNotifications');
  if (!push) return;
  push.addListener('pushNotificationActionPerformed', (action) => {
    const url = action && action.notification && action.notification.data && action.notification.data.url;
    if (url) open(url);
  });
}
