/**
 * Фоновая отправка шагов и тренировок — Android (30.09.2026).
 *
 * Раньше шаги уходили на сервер только при открытом приложении
 * (native-steps.js): клиент три дня не заходил — тренер три дня видел
 * старое. Теперь APK (versionCode 5) держит свою задачу WorkManager
 * (mobile/android-native/BackgroundSync.kt): раз в 30 минут она читает
 * Health Connect и шлёт steps.sync / health.workouts.sync сама.
 *
 * Страница здесь только включает её: просит у сервера узкий ключ
 * (auth.sync.token — умеет лишь эти два действия) и отдаёт его задаче
 * вместе с адресом сервера. Читать в фоне Health Connect даёт по отдельному
 * разрешению — окно по кнопке «Отправлять в фоне» (requestBackgroundAccess).
 *
 * Старый APK без модуля — ничего не делаем, всё работает как прежде.
 */
import { apiMutate } from './api.js';
import { loadApiConfig, currentApiUrl } from './apiConfig.js';
import { plugin } from './native-bridge.js';
import { onIphone, stepsOn, workoutsOn } from './native-steps.js';

function bg() {
  return onIphone() ? null : plugin('BackgroundSync');
}

/** Есть ли фоновая отправка в этом приложении (Android, APK 5+) */
export function backgroundSyncAvailable() {
  return !!bg();
}

/** { enabled, supported, background, lastAt, lastResult } или null */
export async function backgroundSyncStatus() {
  const p = bg();
  if (!p) return null;
  try { return await p.status(); } catch (_) { return null; }
}

function deviceName() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const m = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua);
  return m ? m[1].trim() : 'Android';
}

/**
 * Включить, если шаги подключены, а задача ещё нет; и передать ей, нужны
 * ли тренировки. Зовётся при запуске и после «Подключить шаги/тренировки».
 * Ключ просим только когда его нет: каждый выпуск — запись в списке
 * устройств (сервер держит один ключ на телефон, но зря не дёргаем).
 */
export async function ensureBackgroundSync() {
  const p = bg();
  if (!p || !stepsOn()) return null;
  const status = await backgroundSyncStatus();
  if (!status) return null;
  if (status.enabled) {
    await p.setWorkouts({ workouts: workoutsOn() }).catch(() => {});
    return status;
  }
  await loadApiConfig();
  const apiUrl = currentApiUrl();
  if (!apiUrl) return status;
  const { token } = await apiMutate('auth.sync.token', { device: deviceName() }, { quiet: true });
  await p.enable({ token, apiUrl, workouts: workoutsOn() });
  return backgroundSyncStatus();
}

/** Окно Health Connect «доступ в фоне», затем включить задачу */
export async function requestBackgroundAccess() {
  const p = bg();
  if (!p) return { granted: false };
  const res = await p.requestBackgroundAccess();
  if (res && res.granted) {
    await ensureBackgroundSync();
    p.runNow().catch(() => {});
  }
  return res || { granted: false };
}

/**
 * Выключить на этом телефоне: снять задачу и погасить ключ на сервере.
 * Ключ предъявляет сам себя (auth.sync.revoke) — у страницы в этот момент
 * может уже не быть своего входа (выход из аккаунта).
 */
export async function stopBackgroundSync() {
  const p = bg();
  if (!p) return;
  let token = '';
  try { token = ((await p.disable()) || {}).token || ''; } catch (_) { return; }
  if (!token) return;
  try {
    await loadApiConfig();
    const url = currentApiUrl();
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ action: 'auth.sync.revoke' }),
    });
  } catch (_) { /* не отозвали — ключ умрёт сам через 90 дней без использования */ }
}
