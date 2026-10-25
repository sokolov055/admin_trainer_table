/**
 * Просьба об оценке в магазине (план трёх разборов, пункт 6, 21.10.2026).
 *
 * Только системное окно: на iPhone его рисует Apple (StoreKit), на Android —
 * Google Play In-App Review. Свой экран-уговор перед ним запрещён (App Store
 * 5.6.1), у Google — вопрос «нравится ли» перед окном и награда за оценку.
 * Оценку получает магазин от аккаунта человека напрямую, мы её не видим.
 *
 * Когда просим — только после успеха и редко:
 *   - успех — третья и каждая следующая тренировка, завершённая на этом
 *     телефоне (её видно ровно в момент завершения, без запросов к серверу);
 *   - или первый полный день (FT-751, решения владельца 25.10.2026): в
 *     один день завершена любая тренировка и записаны хотя бы два приёма
 *     пищи. У кого есть «Разбор дня» — окно после его закрытия; у
 *     остальных — как только день стал полным: записан второй приём пищи
 *     после тренировки или завершена тренировка после еды («Завершить
 *     день» нажимают редко — владелец 25.10.2026, на него не опираемся).
 *     Этот повод — один раз и без правила первых 3 дней;
 *   - не в первые 3 дня с первого запуска приложения;
 *   - не чаще раза в 60 дней и не больше 3 раз за 365 дней;
 *   - после экрана итога, никогда посреди тренировки (Workout.jsx).
 * Счётчики — на телефоне, на сервер не уходят (юр. памятка 2026-10-21).
 * Сколько раз окно реально показали, магазин не говорит: показ считается
 * попыткой, а лишние попытки система сама молча гасит.
 *
 * Мост — модуль AppReview оболочки (mobile/: AppReviewPlugin.swift,
 * android-native/AppReview.kt). Он же открывает страницу приложения в
 * магазине, настройки уведомлений телефона и называет модель — для
 * «Настроек» клиента. В браузере и в старой сборке без модуля — ничего.
 */
import { bridge, iosApp, isNativeApp, plugin } from './native-bridge.js';

const KEY = 'fittrack_review_v1';
const DAY = 86400000;

export const REVIEW_RULES = { quietDays: 3, gapDays: 60, perYear: 3, workouts: 3, dayMeals: 2 };

/** День по Москве — как у дневника питания (diary-model.js, today) */
export const reviewDay = (now = Date.now()) => new Date(now + 3 * 3600000).toISOString().slice(0, 10);

/** Страница в App Store сразу на отзыве; ID — mobile/APP_STORE.md, как APP_STORE_URL в access.js */
const IOS_REVIEW_URL = 'https://apps.apple.com/app/id6816619723?action=write-review';

function native() {
  if (!isNativeApp()) return null;
  const cap = bridge();
  try { if (cap.isPluginAvailable && !cap.isPluginAvailable('AppReview')) return null; } catch (_) { return null; }
  return plugin('AppReview');
}

function read() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* испорчено — заново */ }
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    first: Number(s.first) || 0,
    workouts: Number(s.workouts) || 0,
    counted: Array.isArray(s.counted) ? s.counted.filter(Boolean).map(String) : [],
    asks: Array.isArray(s.asks) ? s.asks.map(Number).filter(Number.isFinite) : [],
    // Полный день (FT-751): когда была тренировка, сколько приёмов пищи
    // записано сегодня, есть ли «Разбор дня», просили ли уже по этому поводу
    workoutDay: typeof s.workoutDay === 'string' ? s.workoutDay : '',
    mealsDay: typeof s.mealsDay === 'string' ? s.mealsDay : '',
    meals: Number(s.meals) || 0,
    dayReview: s.dayReview === true,
    dayAsked: s.dayAsked === true,
  };
}

function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* приватный режим — без счётчика */ }
}

/** Первый запуск приложения на этом телефоне — от него «не в первые 3 дня» */
export function noteAppUse(now = Date.now()) {
  if (!isNativeApp()) return;
  const s = read();
  if (s.first) return;
  write({ ...s, first: now });
}

/**
 * Тренировка завершена на этом телефоне. Одно и то же занятие — один раз:
 * «Продолжить тренировку» и повторное «Завершить» успехом не считаются
 */
export function noteWorkoutDone(id, now = Date.now()) {
  if (!isNativeApp()) return;
  const s = read();
  const key = String(id || '');
  if (key && s.counted.includes(key)) return;
  write({
    ...s,
    first: s.first || now,
    workouts: s.workouts + 1,
    counted: key ? [...s.counted, key].slice(-10) : s.counted,
    workoutDay: reviewDay(now),
  });
}

/**
 * Свой дневник питания показал день: сколько приёмов пищи (завтрак, обед,
 * ужин, перекус) в нём есть записи. Считаем только сегодняшний
 */
export function noteMeals(day, count, now = Date.now()) {
  if (!isNativeApp() || day !== reviewDay(now)) return;
  const s = read();
  const meals = Math.max(0, Number(count) || 0);
  if (s.mealsDay === day && s.meals === meals) return;
  write({ ...s, first: s.first || now, mealsDay: day, meals });
}

/** «Разбор дня» у человека есть — окно за полный день ждёт его закрытия */
export function noteDayReview() {
  if (!isNativeApp()) return;
  const s = read();
  if (!s.dayReview) write({ ...s, dayReview: true });
}

/** Сегодня полный день: тренировка и хотя бы два приёма пищи */
export function fullDay(state, now = Date.now()) {
  const s = state || {};
  const day = reviewDay(now);
  return s.workoutDay === day && s.mealsDay === day && (Number(s.meals) || 0) >= REVIEW_RULES.dayMeals;
}

/**
 * Можно ли просить сейчас: 'ask' или почему нет — 'early' (первые дни),
 * 'no-success' (ещё нечем гордиться), 'recent' (просили меньше 60 дней
 * назад), 'year' (уже трижды за год). Чистая функция — для теста
 */
export function reviewVerdict(state, reason, now = Date.now()) {
  const s = state || {};
  const first = Number(s.first) || 0;
  if (reason === 'day') {
    // Первый полный день — один раз и без «не в первые 3 дня»
    if (s.dayAsked) return 'done';
    if (!fullDay(s, now)) return 'no-success';
  } else if (!first || now - first < REVIEW_RULES.quietDays * DAY) return 'early';
  if (reason === 'workout' && (Number(s.workouts) || 0) < REVIEW_RULES.workouts) return 'no-success';
  const asks = (s.asks || []).filter((t) => now - t < 365 * DAY);
  if (asks.length && now - Math.max(...asks) < REVIEW_RULES.gapDays * DAY) return 'recent';
  if (asks.length >= REVIEW_RULES.perYear) return 'year';
  return 'ask';
}

/**
 * Попросить оценку, если сейчас можно. reason — какой успех: 'workout'
 * (нужна третья завершённая тренировка); любой другой повод вызывающий
 * уже проверил сам. true — системное окно запрошено
 */
export async function maybeAskReview(reason, now = Date.now()) {
  const p = native();
  if (!p || !p.requestReview) return false;
  if (reviewVerdict(read(), reason, now) !== 'ask') return false;
  try {
    const res = await p.requestReview();
    // Android не из Google Play: окна нет — и попытку не тратим
    if (!res || !res.asked) return false;
  } catch (_) { return false; }
  const s = read();
  write({ ...s, asks: [...s.asks.filter((t) => now - t < 365 * DAY), now], dayAsked: s.dayAsked || reason === 'day' });
  return true;
}

/**
 * Где сейчас успех и какой повод проверить (FT-751): 'workout' — итог
 * тренировки, 'meal' — в своём дневнике записан ещё один приём пищи,
 * 'day-finish' — «Завершить день», 'day-review' — закрыли «Разбор дня».
 * Полный день у тех, у кого есть разбор, — только после него; у остальных —
 * в момент, когда день стал полным. Не подошёл полный день — на итоге
 * тренировки прежнее правило
 */
export function reviewReasons(state, moment) {
  const s = state || {};
  if (moment === 'day-review') return ['day'];
  if (moment === 'meal' || moment === 'day-finish') return s.dayReview ? [] : ['day'];
  if (moment === 'workout') return s.dayReview ? ['workout'] : ['day', 'workout'];
  return [];
}

export async function askReviewAt(moment, now = Date.now()) {
  if (!native()) return false;
  const s = read();
  const reason = reviewReasons(s, moment).find((r) => reviewVerdict(s, r, now) === 'ask');
  return reason ? maybeAskReview(reason, now) : false;
}

/**
 * Есть ли куда вести «Оценить Fit Track»: iPhone — всегда (App Store);
 * Android — только если приложение поставлено из Google Play. Сейчас APK
 * раздаётся напрямую, и на Android строки нет
 */
export async function canRateInStore() {
  if (!isNativeApp()) return false;
  if (iosApp()) return true;
  const p = native();
  if (!p || !p.info) return false;
  try { return (await p.info()).store === 'play'; } catch (_) { return false; }
}

/** Страница приложения в магазине — по нажатию «Оценить Fit Track» */
export async function openStorePage() {
  const p = native();
  if (p && p.openStore) {
    try { if ((await p.openStore()).opened) return true; } catch (_) { /* ниже — ссылкой */ }
  }
  // Сборка без модуля: оболочка iPhone отдаёт чужие адреса системе,
  // apps.apple.com открывается в App Store
  if (iosApp()) { window.location.href = IOS_REVIEW_URL; return true; }
  return false;
}

/**
 * Настройки телефона — когда уведомления запрещены: повторно спросить
 * приложение уже не может. what: 'notifications' — сразу уведомления
 * Fit Track, 'app' — страница приложения
 */
export async function openPhoneSettings(what = 'notifications') {
  const p = native();
  if (p && p.openSettings) {
    try { if ((await p.openSettings({ what })).opened !== false) return true; } catch (_) { /* ниже */ }
  }
  if (iosApp()) { window.location.href = 'app-settings:'; return true; }
  return false;
}

/**
 * Что за устройство — для «Скопировать данные для поддержки». Только то,
 * что телефон отдаёт без разрешений: платформа, модель, версия системы и
 * версия приложения. { platform, app, device }
 */
export async function deviceInfo() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  // «Linux; Android 14; Pixel 7» — то, что браузер сам пишет о системе
  const fromUa = (/\(([^)]*)\)/.exec(ua) || [])[1] || '';
  if (!isNativeApp()) return { platform: 'web', app: '', device: 'браузер' + (fromUa ? ' · ' + fromUa : '') };
  let platform = '';
  try { platform = bridge().getPlatform() || ''; } catch (_) { /* старая оболочка */ }
  let app = '';
  try {
    const shell = plugin('App');
    const info = shell && shell.getInfo ? await shell.getInfo() : null;
    if (info && info.version) app = info.version + (info.build ? ' (' + info.build + ')' : '');
  } catch (_) { /* без версии оболочки */ }
  let device = fromUa;
  const p = native();
  if (p && p.info) {
    try {
      const info = await p.info();
      device = [info.model, info.system].filter(Boolean).join(' · ') || device;
    } catch (_) { /* модель из строки браузера */ }
  }
  const name = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : platform;
  return { platform, app: [name, app].filter(Boolean).join(' '), device };
}
