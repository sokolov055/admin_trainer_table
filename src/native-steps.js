/**
 * Шаги из телефона — Android-приложение, Health Connect.
 *
 * Считает шаги не приложение: в Health Connect их пишут Google Fit,
 * Samsung Health, Mi Fitness, браслеты. Приложение, получив разрешение,
 * читает суммы по дням и отправляет на сервер (steps.sync) — при
 * подключении, при каждом запуске и при возврате в приложение. Тренер
 * видит их в карточке клиента, клиент — у себя в прогрессе.
 *
 * Разрешение — только на чтение шагов, и только по нажатию «Подключить».
 */
import { apiMutate, apiPrimary } from './api.js';
import { plugin, bridge, isNativeApp } from './native-bridge.js';
import { APP_VERSION } from './version.js';

/** iPhone: шаги из «Здоровья» (HealthKit). Apple не говорит приложению,
 *  выдано ли чтение, — поэтому там «подключено» значит «прошли окно» */
export function onIphone() {
  const cap = bridge();
  try { return !!(cap && cap.getPlatform && cap.getPlatform() === 'ios'); } catch (_) { return false; }
}

const DAYS = 30;
const ON_KEY = 'native_steps_on_v1';
const SENT_KEY = 'native_steps_sent_v1';
/** Нашлись ли шаги при последнем чтении: '1' — да, '0' — Health Connect пуст */
const HAD_KEY = 'native_steps_had_v1';
const REPORT_KEY = 'native_device_report_v1';
/** Тот же отчёт о телефоне — не чаще раза в полчаса; изменился — сразу */
const REPORT_EVERY_MS = 30 * 60 * 1000;
/** При возврате в приложение — не чаще раза в 3 минуты: шаги копятся
 *  медленно, а запрос — это батарея. При запуске — всегда */
const EVERY_MS = 3 * 60 * 1000;
/** Событие «шаги ушли на сервер» — «Прогресс» перечитывает график */
export const STEPS_SENT = 'fittrack:steps-sent';

function health() { return plugin('Health'); }

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Есть ли вообще шаги на этом устройстве: приложение и Health Connect */
export async function stepsAvailability() {
  const h = health();
  if (!h) return { available: false, reason: 'app' };
  try {
    const res = await h.isAvailable();
    return res.available ? { available: true } : { available: false, reason: 'health-connect' };
  } catch (_) {
    return { available: false, reason: 'health-connect' };
  }
}

export async function stepsConnected() {
  const h = health();
  if (!h) return false;
  if (onIphone()) return stepsOn();
  try {
    const res = await h.checkAuthorization({ read: ['steps'] });
    return (res.readAuthorized || []).includes('steps');
  } catch (_) {
    return false;
  }
}

/** По нажатию «Подключить шаги»: системное окно Health Connect */
export async function connectSteps() {
  const h = health();
  if (!h) return { ok: false, reason: 'Обновите приложение — в этой версии шагов ещё нет.' };
  const avail = await stepsAvailability();
  if (!avail.available) {
    return {
      ok: false,
      reason: onIphone()
        ? 'На этом устройстве нет приложения «Здоровье» — шаги здесь недоступны.'
        : 'На телефоне нет Health Connect. Установите «Health Connect» из Google Play (на Android 14 и новее он уже встроен) и попробуйте снова.',
    };
  }
  const res = await h.requestAuthorization({ read: ['steps'] });
  if (!onIphone() && !(res.readAuthorized || []).includes('steps')) {
    return { ok: false, reason: 'Доступ к шагам не выдан. Его можно включить в Health Connect: Разрешения приложений → Fit Track.' };
  }
  try { localStorage.setItem(ON_KEY, '1'); } catch (_) {}
  await syncSteps(true);
  return { ok: true };
}

/** Прочитать суммы по дням и отправить. force — без паузы в 10 минут */
export async function syncSteps(force = false) {
  const h = health();
  if (!h) return { sent: 0 };
  try { if (!localStorage.getItem(ON_KEY)) return { sent: 0 }; } catch (_) { return { sent: 0 }; }
  if (!force) {
    try {
      const last = Number(localStorage.getItem(SENT_KEY) || 0);
      if (Date.now() - last < EVERY_MS) return { sent: 0 };
    } catch (_) {}
  }
  if (!(await stepsConnected())) return { sent: 0 };

  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (DAYS - 1));
  const res = await h.queryAggregated({
    dataType: 'steps', startDate: start.toISOString(), endDate: end.toISOString(), bucket: 'day', aggregation: 'sum',
  });
  const days = (res.samples || [])
    .map((s) => ({ date: localDate(new Date(s.startDate)), steps: Math.round(Number(s.value) || 0) }))
    .filter((d) => d.steps >= 0);
  try { localStorage.setItem(HAD_KEY, days.some((d) => d.steps > 0) ? '1' : '0'); } catch (_) {}
  if (!days.length) return { sent: 0 };
  await apiMutate('steps.sync', { days, source: onIphone() ? 'healthkit' : 'health-connect' });
  try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch (_) {}
  // Экран «Прогресс» мог загрузиться раньше, чем шаги ушли, — пусть перечитает
  try { window.dispatchEvent(new Event(STEPS_SENT)); } catch (_) {}
  return { sent: days.length };
}

/** Отключить на этом телефоне: больше не читать и не отправлять */
export function disconnectSteps() {
  try { localStorage.removeItem(ON_KEY); localStorage.removeItem(SENT_KEY); localStorage.removeItem(HAD_KEY); } catch (_) {}
}

/** Что с шагами на этом телефоне — словами, понятными тренеру */
async function stepsState() {
  if (!health()) return 'unavailable';
  if (!(await stepsAvailability()).available) return 'unavailable';
  if (!stepsOn() || !(await stepsConnected())) return 'off';
  try { return localStorage.getItem(HAD_KEY) === '1' ? 'on' : 'empty'; } catch (_) { return 'empty'; }
}

/**
 * Рассказать серверу о телефоне: оболочка, её версия, версия экранов и
 * что с шагами. Тренер экрана клиента не видит, а «шагов нет» бывает по
 * разным причинам — не поставил приложение, не нажал «Подключить», Samsung
 * Health не передаёт шаги в Health Connect. По этой строке он поймёт какая.
 *
 * Только сервер (apiPrimary): Apps Script о телефонах не знает, а сбой
 * отчёта не должен ни мешать человеку, ни сбрасывать кэш экранов.
 */
export async function reportDevice(force = false) {
  if (!isNativeApp()) return;
  let appVersion = null;
  try {
    const app = plugin('App');
    const info = app && app.getInfo ? await app.getInfo() : null;
    if (info && info.version) appVersion = info.build ? `${info.version} (${info.build})` : String(info.version);
  } catch (_) {}
  const report = {
    platform: onIphone() ? 'ios' : 'android',
    appVersion,
    webVersion: APP_VERSION,
    steps: await stepsState(),
  };
  const sig = JSON.stringify(report);
  try {
    const last = JSON.parse(localStorage.getItem(REPORT_KEY) || 'null');
    if (!force && last && last.sig === sig && Date.now() - last.at < REPORT_EVERY_MS) return;
  } catch (_) {}
  try {
    await apiPrimary('device.report', report);
    localStorage.setItem(REPORT_KEY, JSON.stringify({ sig, at: Date.now() }));
  } catch (_) {}
}

export function stepsOn() {
  try { return !!localStorage.getItem(ON_KEY); } catch (_) { return false; }
}
