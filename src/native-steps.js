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
import { apiMutate } from './api.js';
import { plugin, bridge } from './native-bridge.js';

/** iPhone: шаги из «Здоровья» (HealthKit). Apple не говорит приложению,
 *  выдано ли чтение, — поэтому там «подключено» значит «прошли окно» */
export function onIphone() {
  const cap = bridge();
  try { return !!(cap && cap.getPlatform && cap.getPlatform() === 'ios'); } catch (_) { return false; }
}

const DAYS = 30;
const ON_KEY = 'native_steps_on_v1';
const SENT_KEY = 'native_steps_sent_v1';
/** Не чаще раза в 10 минут: шаги копятся медленно, а запрос — это батарея */
const EVERY_MS = 10 * 60 * 1000;

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
  if (!days.length) return { sent: 0 };
  await apiMutate('steps.sync', { days, source: 'health-connect' });
  try { localStorage.setItem(SENT_KEY, String(Date.now())); } catch (_) {}
  return { sent: days.length };
}

/** Отключить на этом телефоне: больше не читать и не отправлять */
export function disconnectSteps() {
  try { localStorage.removeItem(ON_KEY); localStorage.removeItem(SENT_KEY); } catch (_) {}
}

export function stepsOn() {
  try { return !!localStorage.getItem(ON_KEY); } catch (_) { return false; }
}
