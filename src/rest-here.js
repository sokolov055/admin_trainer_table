/**
 * Отдых, запущенный с этого телефона (03.10.2026).
 *
 * Экран тренировки у тренера живёт в карточке клиента: ушёл в
 * «Расписание» — карточка закрылась, и окно отдыха пропадало вместе с ней,
 * не прозвенев. Поэтому отдых помнит не экран, а приложение: RestLayer
 * (в App.jsx) показывает плашку и «Отдых окончен», пока экрана тренировки
 * нет. Экран тренировки открыт — рисует отдых сам (Workout.jsx).
 *
 * «Закрыть» вне тренировки — помним, какой отдых закрыли: вернулись к
 * тренировке — он уже закрыт, второй раз не звенит.
 */
const KEY = 'rest_here_v1';
const CLOSED = 'rest_closed_v1';
const OLD = 30 * 60 * 1000;

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v && Number(v.until) > Date.now() - OLD) return v;
  } catch (_) { /* приватный режим */ }
  return null;
}

let rest = load();
let screens = 0;
const subs = new Set();
const emit = () => subs.forEach((fn) => { try { fn(); } catch (_) { /* слушатель упал — остальным не мешать */ } });

/** { until, total, next, sessionId } или null */
export const restHere = () => rest;

export function setRestHere(value) {
  rest = value || null;
  try {
    if (rest) localStorage.setItem(KEY, JSON.stringify(rest));
    else localStorage.removeItem(KEY);
  } catch (_) { /* приватный режим — до перезапуска */ }
  emit();
}

export function onRestHere(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Экран тренировки открыт: пока он есть, общий слой молчит */
export function workoutScreenOpen() {
  screens += 1;
  emit();
  return () => { screens -= 1; emit(); };
}

export const workoutScreens = () => screens;

/** Закрыли «Отдых окончен» (или закончили отдых) вне экрана тренировки */
export function closeRestHere(until) {
  try { localStorage.setItem(CLOSED, String(until)); } catch (_) { /* приватный режим */ }
  setRestHere(null);
}

export function restClosed(until) {
  try { return !!until && localStorage.getItem(CLOSED) === String(until); } catch (_) { return false; }
}
