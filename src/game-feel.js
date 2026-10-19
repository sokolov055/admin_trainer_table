import { useEffect } from 'react';
import { plugin } from './native-bridge.js';

/**
 * Общие повадки трёх игр (FT-563, 19.10.2026): игра занимает весь экран —
 * без строки состояния телефона и, где браузер умеет, без адресной строки —
 * и отвечает на касания короткой вибрацией. Логика партий здесь не живёт.
 */

const VIBRATION_KEY = 'ft.games.vibration';

/** Вибрация включена по умолчанию; выбор хранится только на устройстве. */
export function vibrationOn() {
  try { return localStorage.getItem(VIBRATION_KEY) !== 'off'; } catch (_) { return true; }
}

export function setVibration(on) {
  try { localStorage.setItem(VIBRATION_KEY, on ? 'on' : 'off'); } catch (_) {}
}

const PATTERNS = { tap: 8, good: 14, great: [14, 40, 22], bad: [28, 45, 28], crash: [40, 30, 70] };

/** Android и браузеры с Vibration API; iPhone молчит — там её нет. */
export function buzz(kind = 'tap') {
  if (!vibrationOn()) return;
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(PATTERNS[kind] || PATTERNS.tap); } catch (_) {}
}

/** Во весь экран браузера — только из обработчика касания: без жеста браузер откажет. */
export function enterFullscreen(node) {
  const scene = node && node.closest ? (node.closest('.game-shell') || node.closest('.rest-screen')) : null;
  if (typeof document === 'undefined' || document.fullscreenElement || !scene || !scene.requestFullscreen) return;
  try { scene.requestFullscreen().catch(() => {}); } catch (_) {}
}

/**
 * Пока игра на экране — строки состояния нет; после выхода она возвращается,
 * а полноэкранный режим, в который вошли ради игры, снимается.
 */
export function useGameChrome(root) {
  useEffect(() => {
    const bar = plugin('StatusBar');
    let active = true;
    // Плагин уже входит в обе оболочки. Позднее hide не должно пережить выход.
    if (bar && bar.hide) bar.hide().then(() => { if (!active && bar.show) bar.show().catch(() => {}); }).catch(() => {});
    return () => {
      active = false;
      if (bar && bar.show) bar.show().catch(() => {});
      const full = document.fullscreenElement;
      if (full && root && root.current && full.contains(root.current) && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    };
  }, [root]);
}
