import { useSyncExternalStore } from 'react';

/**
 * Права по тарифу (FT-545). Решает сервер (server/src/lib/tariffs.js) и
 * присылает в ответе «me»; API отказывает само, а здесь — только чтобы не
 * показывать то, что всё равно не откроется.
 *
 * Прав нет (старый сервер, мок, ещё не загрузились) — открыто всё, как до
 * тарифов: лучше лишняя кнопка с понятным отказом, чем пропавший раздел.
 */

let current = null;
const listeners = new Set();

export function setRights(next) {
  if (next === current) return;
  current = next || null;
  listeners.forEach((fn) => fn());
}

export function getRights() {
  return current;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useRights() {
  return useSyncExternalStore(subscribe, getRights, getRights);
}

/** «Плюс» у клиента */
export function hasPlus(rights = current) {
  return !rights || rights.plus !== false;
}

/** Платная ступень у тренера */
export function isPro(rights = current) {
  return !rights || rights.pro !== false;
}

/**
 * Платформа для сервера: на iPhone цифровое не продаётся (App Store 3.1.1),
 * и сервер по ней решает, показывать ли продажу (rights.sellDigital)
 */
export function appPlatform(native) {
  if (!native || !native.isNativeApp()) return 'web';
  return native.iosApp() ? 'ios' : 'android';
}
