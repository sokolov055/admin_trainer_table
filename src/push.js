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
import { isNativeApp } from './native-bridge.js';
import { nativePushAvailable, nativePushStatus, enableNativePush, disableNativePush } from './native-push.js';

/*
 * В Android-приложении Web Push не работает — там свой канал, Firebase
 * (native-push.js). Функции ниже в приложении ведут туда, и экран настроек
 * одинаковый: «Включить уведомления».
 */

export function pushSupported() {
  if (isNativeApp()) return nativePushAvailable();
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

/**
 * Включены ли уведомления на этом устройстве.
 *
 * Вопрос не к разрешению браузера, а к подписке. Разрешение, однажды
 * выданное, обратно уже не забирается: после «выключить» оно так и
 * остаётся `granted`. Кнопка, читавшая его, показывала «выключить» и
 * после выключения — выглядело это как «ничего не произошло», а включить
 * обратно становилось нечем.
 *
 * Спрашиваем `getRegistration`, а не `ready`: `ready` ждёт воркера
 * вечно, а его может не быть вовсе — в разработке он не регистрируется, и
 * настройка молча зависала бы на «проверяю».
 */
export async function pushStatus() {
  if (isNativeApp()) return nativePushStatus();
  if (!pushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };

  const permission = Notification.permission;
  if (permission !== 'granted') return { supported: true, permission, subscribed: false };

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration && await registration.pushManager.getSubscription();

    return { supported: true, permission, subscribed: !!subscription };
  } catch (_) {
    return { supported: true, permission, subscribed: false };
  }
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
  if (isNativeApp()) return enableNativePush(clientRow);
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

  // Здесь `ready` уместен: включение возможно только там, где воркер
  // зарегистрирован, и подождать его установки — то, чего человек и ждёт,
  // нажав кнопку.

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
  if (isNativeApp()) return disableNativePush();
  if (!pushSupported()) return { ok: true };

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = registration && await registration.pushManager.getSubscription();
  if (!subscription) return { ok: true };

  try {
    await apiMutate('push.unsubscribe', { endpoint: subscription.endpoint });
  } catch (_) {
    // Сервер недоступен — отписываемся хотя бы на устройстве: человек
    // нажал «выключить», и уведомления должны прекратиться. Запись на
    // сервере станет мёртвой, но он сам её уберёт при первой же отправке:
    // служба доставки ответит на неё 410.
  }

  await subscription.unsubscribe();
  return { ok: true };
}
