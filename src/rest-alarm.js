/**
 * Сигнал конца отдыха в открытом приложении (03.10.2026): звук и вибрация,
 * повторяются, пока человек не нажмёт кнопку на экране отдыха.
 *
 * Звук — сгенерированный (Web Audio), без файла. iPhone и Android дают
 * играть звук только после касания: контекст заводим на нажатии «Легко /
 * Норм / Тяжело» (unlockAlarm) и держим. Вибрация — navigator.vibrate на
 * Android; на iPhone веб-вибрации нет — там нативная через WorkoutActivity
 * .buzz (сборка 1.4 и новее; в старой метода нет — молча без вибрации).
 * Свёрнутое приложение сигналит уведомлением (native-rest.js).
 */
import { isNativeApp, plugin } from './native-bridge.js';

let ctx = null;

/**
 * Конец отдыха: 'sound' — звук и вибрация, 'vibrate' — только вибрация
 * (RestSignalSetting). Настройка устройства; iPhone узнаёт её через
 * WorkoutActivity.setRestSignal — будильник с плашки ставится без страницы
 */
const SIGNAL_KEY = 'rest_signal_v1';

export function getRestSignal() {
  try { return localStorage.getItem(SIGNAL_KEY) === 'vibrate' ? 'vibrate' : 'sound'; } catch (_) { return 'sound'; }
}

export function setRestSignal(mode) {
  const value = mode === 'vibrate' ? 'vibrate' : 'sound';
  try { localStorage.setItem(SIGNAL_KEY, value); } catch (_) { /* приватный режим — до перезапуска */ }
  shareSignal(value);
  return value;
}

/** Приложению iPhone — для будильника, который ставит плашка или часы */
export function shareSignal(value = getRestSignal()) {
  if (!isNativeApp()) return;
  try {
    const p = plugin('WorkoutActivity');
    if (p && p.setRestSignal) p.setRestSignal({ signal: value }).catch(() => {});
  } catch (_) { /* старая сборка */ }
}

function nativeBuzz() {
  if (!isNativeApp()) return;
  try {
    const p = plugin('WorkoutActivity');
    if (p && p.buzz) p.buzz().catch(() => {});
  } catch (_) { /* старая сборка — без вибрации */ }
}

export function unlockAlarm() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (_) { /* без звука — вибрация и экран остаются */ }
}

/** Один «звонок»: два коротких сигнала и вибрация */
export function ringOnce() {
  try { if (navigator.vibrate) navigator.vibrate([400, 150, 400]); } catch (_) {}
  nativeBuzz();
  // «Только вибрация» — без писка
  if (!ctx || getRestSignal() === 'vibrate') return;
  try {
    const t0 = ctx.currentTime;
    [0, 0.35].forEach((dt) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.27);
    });
  } catch (_) {}
}

export function stopVibration() {
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (_) {}
}
