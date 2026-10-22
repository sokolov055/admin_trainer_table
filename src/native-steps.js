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
import {
  healthScope, healthReads, shouldAskHealth, DAILY_TYPES, sleepByDay, lastByDay, avgByDay,
  aggregatedByDay, totalKcalByDay, iphoneTotalKcal, fatPercent, mergeHealthDays, hrFromAggregated,
} from './health-model.js';

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

/*
 * Huawei без Google (03.10.2026): Health Connect там не ставится, шаги и
 * тренировки читаем из Huawei Health — модуль HuaweiHealth в APK 1.4 (7)
 * (mobile/android-native/HuaweiHealth.kt). Методы у него те же, что у
 * модуля Health Connect, поэтому дальше всё одинаково: меняется только
 * источник. Выбор — один раз за запуск: Health Connect есть — он, иначе
 * Huawei, если на телефоне есть сервисы Huawei.
 */
let huawei = false;
let picked = null;

function pickSource() {
  if (!picked) {
    picked = (async () => {
      const hw = plugin('HuaweiHealth');
      if (onIphone() || !hw) return;
      const hc = plugin('Health');
      try { if (hc && (await hc.isAvailable()).available) return; } catch (_) {}
      try { huawei = !!(await hw.isAvailable()).available; } catch (_) {}
    })();
  }
  return picked;
}

/** Шаги и тренировки берутся из Huawei Health (после pickSource) */
export function onHuawei() { return huawei; }

/** Как называть источник на экране: «Здоровье», Huawei Health или Health Connect */
export function healthHub() {
  if (onIphone()) return '«Здоровье»';
  return huawei ? 'Huawei Health' : 'Health Connect';
}

function health() { return huawei ? plugin('HuaweiHealth') : plugin('Health'); }

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Есть ли вообще шаги на этом устройстве: приложение и Health Connect */
export async function stepsAvailability() {
  await pickSource();
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
  await pickSource();
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
  await pickSource();
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
    return {
      ok: false,
      reason: huawei
        ? 'Доступ к шагам не выдан. Нажмите «Подключить шаги» ещё раз и разрешите Fit Track читать шаги в окне Huawei Health.'
        : 'Доступ к шагам не выдан. Его можно включить в Health Connect: Разрешения приложений → Fit Track.',
    };
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
  await pickSource();
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
  // Huawei: история только за неделю (заявка Health Kit)
  start.setDate(start.getDate() - ((huawei ? 7 : DAYS) - 1));
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
  await apiMutate('steps.sync', { days, source: onIphone() ? 'healthkit' : huawei ? 'huawei-health' : 'health-connect' });
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
  await pickSource();
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
  await pickSource();
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
      return {
        ok: false,
        reason: huawei
          ? 'Доступ к тренировкам не выдан. Нажмите «Подключить тренировки» ещё раз и разрешите Fit Track читать записи тренировок в окне Huawei Health.'
          : 'Доступ к тренировкам не выдан. Его можно включить в Health Connect: Разрешения приложений → Fit Track → «Тренировки».',
      };
    }
  }
  try { localStorage.setItem(WORKOUTS_ON_KEY, '1'); } catch (_) {}
  const sent = await syncWorkouts(true);
  return { ok: true, ...sent };
}

/*
 * Данные о здоровье одним окном (FT-708, владелец 22.10.2026): кроме шагов и
 * тренировок — сон с фазами, пульс покоя и ВСР, пульс на тренировке, вес и
 * % жира с весов, активные и общие ккал за день, рост, VO2max. Только
 * чтение. Новые типы — только в новых сборках (iPhone 26+, Android 11+,
 * health-model.js); Huawei и старые сборки — шаги и тренировки, как раньше.
 * Решение человека хранит сервер (health.access.*), а «читать на этом
 * телефоне» — флаг здесь: согласие одно на аккаунт, телефонов бывает два.
 */
const HEALTH_ON_KEY = 'native_health_on_v1';
const HEALTH_SENT_KEY = 'native_health_sent_v1';
/** Показали экран на полном устройстве — повторно из-за «basic» не спрашиваем */
const HEALTH_FULL_ASKED_KEY = 'native_health_full_asked_v1';
/** Пульс тренировок, уже прочитанный: platformId → [средний, макс] */
const HR_CACHE_KEY = 'native_workout_hr_v1';
/** Событие «данные о здоровье ушли на сервер» — блок «Здоровье» перечитывает */
export const HEALTH_SENT = 'fittrack:health-sent';

/** Что умеет это устройство: 'full', 'basic' или '' (нет «Здоровья»/Health Connect) */
export async function deviceHealthScope() {
  await pickSource();
  if (!health() || !(await stepsAvailability()).available) return '';
  // Номер сборки — свежий: после обновления в памяти ещё прежний
  let build = appBuild();
  try {
    const app = plugin('App');
    const info = app && app.getInfo ? await app.getInfo() : null;
    if (info && info.build) { noteAppBuild(info); build = Number(info.build) || build; }
  } catch (_) {}
  return healthScope({ platform: onIphone() ? 'ios' : 'android', build, huawei });
}

/** Читаем ли сон, пульс и вес на этом телефоне */
export function healthDailyOn() {
  try { return !!localStorage.getItem(HEALTH_ON_KEY); } catch (_) { return false; }
}

export function healthFullAsked() {
  try { return localStorage.getItem(HEALTH_FULL_ASKED_KEY) === '1'; } catch (_) { return false; }
}

export function markHealthFullAsked() {
  try { localStorage.setItem(HEALTH_FULL_ASKED_KEY, '1'); } catch (_) {}
}

/** Отключить новые данные на этом телефоне; шаги и тренировки не трогаем */
export function disconnectHealth() {
  try { [HEALTH_ON_KEY, HEALTH_SENT_KEY, HR_CACHE_KEY].forEach((k) => localStorage.removeItem(k)); } catch (_) {}
}

/** Спросить ли экран «Здоровье» при входе: решение сервера + что умеет телефон */
export async function healthAskNeeded(access) {
  const deviceScope = await deviceHealthScope().catch(() => '');
  return shouldAskHealth({ access, deviceScope, fullAsked: healthFullAsked() }) ? deviceScope : '';
}

/**
 * Записать решение на сервер. Ошибку не бросаем: старый сервер этих
 * действий не знает, а шаги и тренировки работают и без записи
 */
export async function saveHealthAccess(decision, scope, consent = false) {
  try {
    return await apiMutate('health.access.set', {
      decision, scope, ...(consent ? { consent: true } : {}), device: onIphone() ? 'ios' : 'android',
    }, { quiet: true });
  } catch (_) { return null; }
}

/**
 * Всё одним окном — экран «Здоровье» (client/HealthConnect.jsx) и анкета
 * (FT-510): человек один раз читает, что берём и зачем, и видит одно
 * системное окно. consent — галочка отдельного согласия на данные о
 * здоровье: без неё (или на старой сборке) просим только шаги и тренировки,
 * их покрывает общее согласие. Дальше — те же отправки, что у кнопок
 * «Подключить» в «Прогрессе»: второго импорта нет.
 *
 * Итог честный: steps/workouts/daily — 'ok' (данные ушли), 'empty' (записей
 * нет; на iPhone так же выглядит и запрет), 'denied' (Android сказал «не
 * выдано»), 'error' (чтение упало), 'off' (на телефоне этого нет).
 */
export async function connectHealth({ consent = false } = {}) {
  await pickSource();
  const h = health();
  if (!h || !(await stepsAvailability()).available) return { ok: false, steps: 'off', workouts: 'off', daily: 'off', scope: '' };
  const deviceScope = await deviceHealthScope();
  const scope = deviceScope === 'full' && consent ? 'full' : 'basic';
  const withWorkouts = workoutsAvailable();
  const read = healthReads(onIphone() ? 'ios' : 'android', scope, withWorkouts);
  let granted = null;
  try {
    // На повторном окне после обновления система покажет только новые пункты
    const res = await h.requestAuthorization({ read });
    granted = res && res.readAuthorized;
  } catch (_) {
    return { ok: false, steps: 'error', workouts: withWorkouts ? 'error' : 'off', daily: 'off', scope };
  }
  if (deviceScope === 'full') markHealthFullAsked();
  // Решение — на сервер до первой отправки: без согласия он не примет сон и пульс
  await saveHealthAccess('granted', scope, scope === 'full');
  // Android честно говорит, что выдано; iPhone — нет, там «прошли окно»
  const allowed = (type) => onIphone() || (granted || []).includes(type);
  const out = { ok: true, steps: 'off', workouts: 'off', daily: 'off', scope };
  const run = async (on, key, sync) => {
    if (!on) return 'denied';
    try { localStorage.setItem(key, '1'); } catch (_) {}
    try {
      const r = await sync(true);
      return r.reason === 'ok' ? 'ok' : r.reason === 'denied' ? 'denied' : 'empty';
    } catch (_) { return 'error'; }
  };
  // Пульс тренировок читается вместе с ними — флаг раньше их отправки
  const daily = scope === 'full' && DAILY_TYPES.concat('heartRate').some(allowed);
  if (daily) { try { localStorage.setItem(HEALTH_ON_KEY, '1'); } catch (_) {} }
  out.steps = await run(allowed('steps'), ON_KEY, syncSteps);
  if (withWorkouts) out.workouts = await run(allowed('workouts'), WORKOUTS_ON_KEY, syncWorkouts);
  if (scope === 'full') out.daily = await run(daily, HEALTH_ON_KEY, syncHealthDaily);
  out.ok = out.steps !== 'denied' || out.workouts === 'ok' || out.daily === 'ok';
  return out;
}

/**
 * Сон, пульс покоя, ВСР, ккал, вес, % жира, VO2max за 30 дней и рост —
 * по дням, на сервер (health.daily.sync). Как шаги: при запуске, при
 * возврате (не чаще раза в 3 минуты) и после подключения.
 *
 * Чтение по типам по очереди: Health Connect ограничивает частоту запросов,
 * а отказ в одном типе (человек выключил его в окне) не должен оставлять
 * без остальных. Android говорит, что выдано, — читаем только это; iPhone
 * не говорит — запрет там выглядит как «пусто».
 */
export async function syncHealthDaily(force = false) {
  await pickSource();
  const h = health();
  if (!h || huawei) return { sent: 0, reason: 'app' };
  if (!healthDailyOn()) return { sent: 0, reason: 'off' };
  if (!force) {
    try {
      const last = Number(localStorage.getItem(HEALTH_SENT_KEY) || 0);
      if (Date.now() - last < EVERY_MS) return { sent: 0, reason: 'recent' };
    } catch (_) {}
  }
  let allowed = DAILY_TYPES;
  if (!onIphone()) {
    try { allowed = ((await h.checkAuthorization({ read: DAILY_TYPES })).readAuthorized) || []; } catch (_) { allowed = []; }
    if (!allowed.length) return { sent: 0, reason: 'denied' };
  }
  // Не старше 30 дней: глубже Health Connect пускает только по отдельному
  // разрешению (READ_HEALTH_DATA_HISTORY), его мы не просим
  const end = new Date();
  const floor = new Date(end.getTime() - DAYS * 86400000 + 60000);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (DAYS - 1));
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const read = async (type, fn) => {
    if (!allowed.includes(type) || (onIphone() ? type === 'totalCalories' : type === 'basalCalories')) return null;
    try { return await fn(); } catch (_) { return null; }
  };
  const samples = (type, extra = {}) => read(type, async () => ((await h.readSamples({ dataType: type, ...range, limit: 1000, ...extra })).samples) || []);
  const aggregated = (type, aggregation) => read(type, async () => ((await h.queryAggregated({ dataType: type, ...range, bucket: 'day', aggregation })).samples) || []);

  // Ночь на первый день началась накануне вечером — сколько пускает предел
  const sleepFrom = new Date(Math.max(start.getTime() - 12 * 3600000, floor.getTime()));
  const sleep = await samples('sleep', { startDate: sleepFrom.toISOString(), ascending: true });
  const rhr = await aggregated('restingHeartRate', 'average');
  const hrv = await samples('heartRateVariability', { limit: 2000 });
  const active = await aggregated('calories', 'sum');
  // Общий расход Health Connect не суммирует сам — сырые записи
  const total = await samples('totalCalories', { limit: 5000 });
  // iPhone: общий расход — активные + базовый обмен
  const basal = await aggregated('basalCalories', 'sum');
  const weight = await samples('weight');
  const fat = await samples('bodyFat');
  const vo2 = await samples('vo2Max');
  // Рост — последний за те же 30 дней: глубже не читаем
  const heights = await samples('height', { startDate: floor.toISOString(), limit: 50 });

  const days = mergeHealthDays({
    sleep: sleep ? sleepByDay(sleep) : {},
    restingHr: rhr ? aggregatedByDay(rhr, 'average') : {},
    hrvMs: hrv ? avgByDay(hrv) : {},
    activeKcal: active ? aggregatedByDay(active, 'sum') : {},
    totalKcal: total ? totalKcalByDay(total)
      : basal && active ? iphoneTotalKcal(aggregatedByDay(active, 'sum'), aggregatedByDay(basal, 'sum')) : {},
    weightKg: weight ? lastByDay(weight) : {},
    bodyFatPct: fat ? lastByDay(fat, fatPercent) : {},
    vo2max: vo2 ? lastByDay(vo2) : {},
  });
  const lastHeight = Object.entries(heights ? lastByDay(heights) : {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)).pop();
  const heightCm = lastHeight ? Math.round(lastHeight[1]) : null;
  if (!days.length && !heightCm) return { sent: 0, reason: 'empty' };
  const res = await apiMutate('health.daily.sync', {
    days, ...(heightCm ? { heightCm } : {}), source: onIphone() ? 'healthkit' : 'health-connect',
  }, { quiet: true });
  try { localStorage.setItem(HEALTH_SENT_KEY, String(Date.now())); } catch (_) {}
  // Сервер без действующего согласия ничего не пишет — так и говорим
  if (res && res.skipped === 'no-consent') return { sent: 0, reason: 'no-consent' };
  try { window.dispatchEvent(new Event(HEALTH_SENT)); } catch (_) {}
  return { sent: days.length, reason: 'ok' };
}

function readHrCache() {
  try { return JSON.parse(localStorage.getItem(HR_CACHE_KEY) || '{}') || {}; } catch (_) { return {}; }
}

/**
 * Средний и максимальный пульс за время каждой тренировки — при данных о
 * здоровье на этом телефоне. Прочитанное помним: за месяц тренировок
 * десятки, а отправка — при каждом возврате в приложение
 */
async function withHeartRate(list) {
  if (!healthDailyOn() || huawei || !list.length) return list;
  if (!onIphone()) {
    try {
      const res = await health().checkAuthorization({ read: ['heartRate'] });
      if (!(res.readAuthorized || []).includes('heartRate')) return list;
    } catch (_) { return list; }
  }
  const cache = readHrCache();
  const kept = {};
  for (const w of list) {
    const key = w.platformId || w.startDate;
    let hr = cache[key];
    if (!hr) {
      try {
        const res = await health().queryAggregated({
          dataType: 'heartRate', startDate: w.startDate, endDate: w.endDate, bucket: 'day', aggregation: ['average', 'max'],
        });
        const got = hrFromAggregated(res.samples);
        hr = [got.hrAvg, got.hrMax];
        // Пусто у свежей — часы могли ещё не передать пульс: спросим в следующий раз
        if (!got.hrAvg && Date.now() - Date.parse(w.endDate) < 86400000) hr = null;
      } catch (_) { hr = null; }
    }
    if (hr) {
      kept[key] = hr;
      if (hr[0]) { w.hrAvg = hr[0]; if (hr[1]) w.hrMax = hr[1]; }
    }
  }
  try { localStorage.setItem(HR_CACHE_KEY, JSON.stringify(kept)); } catch (_) {}
  return list;
}

/**
 * Прочитать тренировки за месяц и отправить. Как и с шагами, iPhone не
 * говорит, что чтение запрещено: запрет выглядит как «тренировок нет».
 */
export async function syncWorkouts(force = false) {
  await pickSource();
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
  // Huawei даёт историю только за неделю — так подана заявка
  const start = new Date(end.getTime() - (huawei ? 7 : DAYS) * 86400000);
  const res = await health().queryWorkouts({ startDate: start.toISOString(), endDate: end.toISOString(), limit: 200 });
  const workouts = (res.workouts || []).map((w) => ({
    platformId: w.platformId, workoutType: w.workoutType, startDate: w.startDate, endDate: w.endDate,
    duration: w.duration, totalEnergyBurned: w.totalEnergyBurned, totalDistance: w.totalDistance,
    sourceName: sourceLabel(w.sourceName),
  }));
  if (!workouts.length) return { sent: 0, reason: 'empty' };
  await withHeartRate(workouts);
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
  await pickSource();
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
