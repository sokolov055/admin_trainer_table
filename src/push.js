/**
 * Подписка на уведомления.
 *
 * После ухода от Telegram это единственный способ дотянуться до человека,
 * не заставляя его открыть приложение. На iOS работает только у
 * приложения, добавленного на домашний экран, — поэтому здесь важнее
 * всего честно сказать, ПОЧЕМУ не получилось, а не молча ничего не сделать.
 *
 * Разрешение спрашиваем только по нажатию: браузеры давно наказывают за
 * непрошеный запрос, а человек, которого спросили на первом экране, жмёт
 * «запретить» не глядя — и вернуть это можно только через настройки.
 */

import { apiPublic, apiMutate } from './api.js';
import { describeDevice } from './session.js';

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** Установлено ли приложение на домашний экран — на iOS без этого пушей нет */
export function installedAsApp() {
  if (typeof window === 'undefined') return false;

  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function pushState() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

function toBytes(base64) {
  const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Включить уведомления на этом устройстве.
 *
 * Возвращает понятную причину отказа, а не бросает: человек нажал кнопку
 * и должен узнать, что произошло, даже если дело в его браузере.
 */
export async function enablePush(clientRow) {
  if (!pushSupported()) {
    return { ok: false, reason: 'Этот браузер не умеет уведомления.' };
  }

  const { enabled, publicKey } = await apiPublic('push.key', {});
  if (!enabled || !publicKey) {
    return { ok: false, reason: 'Уведомления пока не настроены на сервере.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: permission === 'denied'
        ? 'Уведомления запрещены. Разрешить их можно в настройках браузера для этого сайта.'
        : 'Разрешение не выдано.',
    };
  }

  const registration = await navigator.serviceWorker.ready;

  // Переиспользуем существующую подписку: повторный subscribe с теми же
  // ключами вернёт её же, а с другими — упадёт.
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBytes(publicKey),
    });

  await apiMutate('push.subscribe', {
    subscription: subscription.toJSON(),
    device: describeDevice(),
    ...(clientRow ? { clientRow } : {}),
  });

  return { ok: true };
}

export async function disablePush() {
  if (!pushSupported()) return { ok: true };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { ok: true };

  try {
    await apiMutate('push.unsubscribe', { endpoint: subscription.endpoint });
  } catch (_) {
    // Сервер недоступен — отписываемся хотя бы на устройстве: человек
    // нажал «выключить», и уведомления должны прекратиться.
  }

  await subscription.unsubscribe();
  return { ok: true };
}
