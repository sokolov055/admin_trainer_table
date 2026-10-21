/**
 * Напоминания, которые ставит сам телефон (план трёх разборов, пункт 14,
 * 21.10.2026): занятие по плану, взвешивание, замеры, еда. Расчёт — в
 * reminders-model.js, здесь — хранение на телефоне и системное расписание
 * (@capacitor/local-notifications, тот же модуль, что у конца отдыха).
 *
 * Расписание лежит только в localStorage и на сервер не уходит; уведомления
 * приходят без сервера, FCM и APNs — поэтому PUSH_OFF их не касается.
 * Пересчитываются при каждом открытии приложения (ClientApp.jsx): так
 * «занятие по плану» узнаёт о перенесённой тренировке. Вышли из аккаунта —
 * всё снимается (api.js, logout).
 *
 * В браузере модуля нет: раздел виден, переключатели неактивны.
 */
import { isNativeApp, plugin } from './native-bridge.js';
import { ALL_REMINDER_IDS, nextFires, normalizeReminders, withAnchor } from './reminders-model.js';

const KEY = 'fittrack_reminders_v1';

/** Android: свой канал — в настройках телефона его можно выключить отдельно от отдыха */
const CHANNEL = 'reminders';
let channelReady = false;

function local() {
  return isNativeApp() ? plugin('LocalNotifications') : null;
}

function platformName() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  try { return (cap && cap.getPlatform && cap.getPlatform()) || ''; } catch (_) { return ''; }
}

/** Может ли этот телефон ставить напоминания сам */
export function remindersAvailable() {
  return !!local();
}

export function readReminders() {
  try { return normalizeReminders(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (_) { return normalizeReminders(null); }
}

/** Сохранить настройку; «раз в две недели» получает точку отсчёта сразу */
export function saveReminders(next, now = new Date()) {
  const s = withAnchor(normalizeReminders(next), now);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* приватный режим — до перезапуска */ }
  return s;
}

async function channel(notes) {
  if (channelReady || platformName() !== 'android' || !notes.createChannel) return;
  try {
    await notes.createChannel({
      id: CHANNEL, name: 'Напоминания', description: 'Занятие, взвешивание, замеры и еда — по вашему расписанию',
      importance: 3, visibility: 1,
    });
    channelReady = true;
  } catch (_) { /* без канала — канал модуля по умолчанию */ }
}

async function nextTrainingDate() {
  try {
    // Лениво: модуль берёт и выход из аккаунта (api.js), и тест без сервера
    const { api } = await import('./api.js');
    const overview = await api('client.overview', {});
    return (overview && overview.nextTrainingDate) || null;
  } catch (_) { return null; }
}

/**
 * Снять поставленные напоминания. Спрашиваем у телефона, какие из наших
 * стоят, — при каждом открытии приложения не трогать 60 номеров впустую;
 * не ответил — снимаем весь ряд
 */
async function cancelOurs(notes) {
  let ids = ALL_REMINDER_IDS;
  if (notes.getPending) {
    try {
      const { notifications } = await notes.getPending();
      ids = (notifications || []).map((n) => Number(n.id)).filter((id) => ALL_REMINDER_IDS.includes(id));
    } catch (_) { /* весь ряд */ }
  }
  if (!ids.length) return;
  try { await notes.cancel({ notifications: ids.map((id) => ({ id })) }); } catch (_) { /* уже нет */ }
}

// Пересчёт снимает прежние и ставит новые: два пересчёта подряд (открыли
// приложение и тут же переключили) не должны перемешаться
let queue = Promise.resolve();

/**
 * Пересчитать и поставить заново. nextTraining — если вызывающий уже знает
 * ближайшее занятие; иначе спросим client.overview (из кэша, если есть).
 * true — расписание телефона совпадает с настройками
 */
export function syncReminders(options = {}) {
  const task = queue.catch(() => {}).then(() => syncNow(options));
  queue = task.catch(() => {});
  return task;
}

async function syncNow({ nextTraining } = {}) {
  const notes = local();
  if (!notes) return false;
  const now = new Date();
  const stored = readReminders();
  const settings = withAnchor(stored, now);
  if (settings !== stored) saveReminders(settings, now);
  const training = settings.plan.on ? (nextTraining !== undefined ? nextTraining : await nextTrainingDate()) : null;
  const fires = nextFires(settings, now, { nextTraining: training });
  await cancelOurs(notes);
  if (!fires.length) return true;
  try {
    const { display } = await notes.checkPermissions();
    // Не спрашиваем здесь: окно разрешения — только по нажатию переключателя
    if (display !== 'granted') return false;
    await channel(notes);
    await notes.schedule({
      notifications: fires.map((f) => ({
        id: f.id,
        title: f.title,
        body: f.body,
        schedule: { at: f.at },
        ...(channelReady ? { channelId: CHANNEL } : {}),
        ...(platformName() === 'ios' ? { sound: 'default' } : {}),
      })),
    });
    return true;
  } catch (_) {
    return false;
  }
}

/** Выход из аккаунта: чужому человеку на этом телефоне напоминания не нужны */
export async function forgetReminders() {
  try { localStorage.removeItem(KEY); } catch (_) { /* нечего стирать */ }
  const notes = local();
  if (!notes) return;
  await cancelOurs(notes);
}
