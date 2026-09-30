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
  // Итог первой отправки — тому, кто нажал: «Проверить ещё раз» показывает его
  const sent = await syncSteps(true);
  return { ok: true, ...sent };
}

/**
 * Прочитать суммы по дням и отправить. force — без паузы в 10 минут.
 *
 * reason — почему ничего не ушло, для кнопки «Проверить ещё раз»: раньше
 * она молчала при любом исходе, и было не понять, сломано что-то или
 * телефону просто нечего отдать (28.09.2026).
 */
export async function syncSteps(force = false) {
  const h = health();
  if (!h) return { sent: 0, reason: 'app' };
  try { if (!localStorage.getItem(ON_KEY)) return { sent: 0, reason: 'off' }; } catch (_) { return { sent: 0, reason: 'off' }; }
  if (!force) {
    try {
      const last = Number(localStorage.getItem(SENT_KEY) || 0);
      if (Date.now() - last < EVERY_MS) return { sent: 0, reason: 'recent' };
    } catch (_) {}
  }
  if (!(await stepsConnected())) return { sent: 0, reason: 'denied' };

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
  const had = days.some((d) => d.steps > 0);
  try { localStorage.setItem(HAD_KEY, had ? '1' : '0'); } catch (_) {}
  // Месяц нулей — это не «не ходил», а «доступа нет»: iPhone без разрешения
  // отдаёт пустые дни и не говорит, что чтение запрещено. Нули в прогресс
  // не шлём — там они выглядели бы как месяц без движения
  if (!days.length || !had) return { sent: 0, reason: 'empty' };
  await apiMutate('steps.sync', { days, source: onIphone() ? 'healthkit' : 'health-connect' });
  try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch (_) {}
  // Экран «Прогресс» мог загрузиться раньше, чем шаги ушли, — пусть перечитает
  try { window.dispatchEvent(new Event(STEPS_SENT)); } catch (_) {}
  return { sent: days.length, reason: 'ok' };
}

/**
 * Открыть, где выдаётся доступ к шагам. iPhone спрашивает доступ один раз:
 * отказали или закрыли окно — повторно iOS его не покажет, включить можно
 * только в «Здоровье». Плагин на iOS такого не умеет — открываем «Здоровье»
 * ссылкой x-apple-health://, оболочка Capacitor отдаёт такие ссылки системе.
 * Android — настройки Health Connect через плагин.
 */
export async function openHealthSettings() {
  if (onIphone()) {
    window.location.href = 'x-apple-health://';
    return true;
  }
  const h = health();
  if (!h || !h.openHealthConnectSettings) return false;
  await h.openHealthConnectSettings();
  return true;
}

/*
 * Тренировки с часов (28.09.2026) — пока только «Мои тренировки» владельца.
 * Приложение читает тренировки за месяц (тип, начало, конец, калории,
 * дистанция) и отправляет на сервер; тот совмещает их с занятиями в
 * приложении. Доступ спрашивается отдельно от шагов — по нажатию
 * «Подключить тренировки».
 *
 * iPhone — из «Здоровья». Android — из Health Connect (с 30.09.2026), но
 * только в APK с versionCode 4 и новее: манифест старых разрешает Health
 * Connect одни шаги, и окно разрешения там молча не выдало бы тренировки.
 * Сайт у Android живой и приходит сразу, а APK обновляют не все — поэтому
 * номер сборки сверяем (noteAppBuild из native.js).
 */
const WORKOUTS_ON_KEY = 'native_workouts_on_v1';
const WORKOUTS_SENT_KEY = 'native_workouts_sent_v1';
const APP_BUILD_KEY = 'native_app_build_v1';
const ANDROID_WORKOUTS_BUILD = 4;
/** На Android вместе с тренировками — калории и дистанция за время тренировки */
const ANDROID_WORKOUT_READS = ['workouts', 'calories', 'totalCalories', 'distance'];
/** Событие «тренировки ушли на сервер» — блок в «Прогрессе» перечитывает список */
export const WORKOUTS_SENT = 'fittrack:workouts-sent';

/** Номер сборки приложения (App.getInfo().build) — запоминаем при запуске */
export function noteAppBuild(info) {
  const build = Number(info && info.build) || 0;
  if (!build) return;
  try { localStorage.setItem(APP_BUILD_KEY, String(build)); } catch (_) {}
}

function appBuild() {
  try { return Number(localStorage.getItem(APP_BUILD_KEY)) || 0; } catch (_) { return 0; }
}

export function workoutsOn() {
  try { return !!localStorage.getItem(WORKOUTS_ON_KEY); } catch (_) { return false; }
}

/** Можно ли подключить тренировки на этом устройстве */
export function workoutsAvailable() {
  const h = health();
  if (!h || !h.queryWorkouts) return false;
  return onIphone() || appBuild() >= ANDROID_WORKOUTS_BUILD;
}

/**
 * Приходят ли тренировки на Android. Health Connect, в отличие от iPhone,
 * честно говорит, выдано ли чтение
 */
async function androidWorkoutsAllowed() {
  try {
    const res = await health().checkAuthorization({ read: ['workouts'] });
    return (res.readAuthorized || []).includes('workouts');
  } catch (_) {
    return false;
  }
}

/** По нажатию «Подключить тренировки»: окно «Здоровья», затем первая отправка */
export async function connectWorkouts() {
  if (!workoutsAvailable()) return { ok: false, reason: 'Обновите приложение — в этой версии тренировок из Health Connect ещё нет.' };
  if (onIphone()) {
    await health().requestAuthorization({ read: ['steps', 'workouts'] });
  } else {
    const avail = await stepsAvailability();
    if (!avail.available) {
      return { ok: false, reason: 'На телефоне нет Health Connect. Установите «Health Connect» из Google Play (на Android 14 и новее он уже встроен) и попробуйте снова.' };
    }
    const res = await health().requestAuthorization({ read: ANDROID_WORKOUT_READS });
    if (!(res.readAuthorized || []).includes('workouts')) {
      return { ok: false, reason: 'Доступ к тренировкам не выдан. Его можно включить в Health Connect: Разрешения приложений → Fit Track → «Тренировки».' };
    }
  }
  try { localStorage.setItem(WORKOUTS_ON_KEY, '1'); } catch (_) {}
  const sent = await syncWorkouts(true);
  return { ok: true, ...sent };
}

/**
 * Прочитать тренировки за месяц и отправить. Как и с шагами, iPhone не
 * говорит, что чтение запрещено: запрет выглядит как «тренировок нет».
 */
export async function syncWorkouts(force = false) {
  if (!workoutsAvailable()) return { sent: 0, reason: 'app' };
  if (!workoutsOn()) return { sent: 0, reason: 'off' };
  if (!force) {
    try {
      const last = Number(localStorage.getItem(WORKOUTS_SENT_KEY) || 0);
      if (Date.now() - last < EVERY_MS) return { sent: 0, reason: 'recent' };
    } catch (_) {}
  }
  if (!onIphone() && !(await androidWorkoutsAllowed())) return { sent: 0, reason: 'denied' };
  const end = new Date();
  const start = new Date(end.getTime() - DAYS * 86400000);
  const res = await health().queryWorkouts({ startDate: start.toISOString(), endDate: end.toISOString(), limit: 200 });
  const workouts = (res.workouts || []).map((w) => ({
    platformId: w.platformId, workoutType: w.workoutType, startDate: w.startDate, endDate: w.endDate,
    duration: w.duration, totalEnergyBurned: w.totalEnergyBurned, totalDistance: w.totalDistance,
    sourceName: sourceLabel(w.sourceName),
  }));
  if (!workouts.length) return { sent: 0, reason: 'empty' };
  await apiMutate('health.workouts.sync', { workouts });
  try { localStorage.setItem(WORKOUTS_SENT_KEY, String(Date.now())); } catch (_) {}
  try { window.dispatchEvent(new Event(WORKOUTS_SENT)); } catch (_) {}
  return { sent: workouts.length, reason: 'ok' };
}

/**
 * Health Connect называет источник пакетом приложения
 * («com.sec.android.app.shealth») — на экране нужно человеческое имя.
 * Часы с моделью модуль подписывает сам («samsung SM-R960») — их не трогаем
 */
const ANDROID_SOURCES = {
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.huawei.health': 'Huawei Health',
  'com.mi.health': 'Mi Fitness',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.xiaomi.hm.health': 'Zepp Life',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.strava': 'Strava',
};

function sourceLabel(name) {
  const raw = String(name || '');
  return ANDROID_SOURCES[raw] || raw;
}

export function disconnectWorkouts() {
  try { localStorage.removeItem(WORKOUTS_ON_KEY); localStorage.removeItem(WORKOUTS_SENT_KEY); } catch (_) {}
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
