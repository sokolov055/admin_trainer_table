import { apiPrimary, clearApiCache } from './api.js';
import { describeDevice, setToken } from './session.js';

/**
 * Вход по персональной ссылке тренера — основной способ попасть в кабинет.
 *
 * Тренер заводит карточку, нажимает «Пригласить» и отправляет ссылку чем
 * угодно. Клиент открывает её в обычном браузере, видит своё имя и одну
 * кнопку. Ни Telegram, ни почты, ни пароля.
 *
 * ПОЧЕМУ ВХОД — ОТДЕЛЬНОЕ ДЕЙСТВИЕ, А НЕ САМ ПЕРЕХОД
 *
 * Мессенджеры разворачивают ссылки предпросмотром, антивирусы их
 * проверяют, почтовые фильтры открывают. Если бы переход сразу
 * засчитывался входом, ссылка расходовалась бы ещё до того, как человек
 * её увидит. Поэтому переход только показывает имя, а вход происходит по
 * нажатию — и заодно человек видит, в чей кабинет он попадёт.
 */

const PARAM = 'access';

export function readAccessToken(location = window.location) {
  try {
    return String(new URL(location.href).searchParams.get(PARAM) || '').trim();
  } catch (_) {
    return '';
  }
}

/**
 * Убираем токен из адреса сразу после входа.
 *
 * Иначе он остаётся в истории браузера, уезжает в закладки и всплывает в
 * подсказках адресной строки на чужом устройстве.
 */
export function removeAccessToken(history = window.history, location = window.location) {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has(PARAM)) return;
    url.searchParams.delete(PARAM);
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch (_) {}
}

export function inspectAccessLink(token, deps = {}) {
  const request = deps.request || apiPrimary;
  return request('auth.access.inspect', { token });
}

export async function enterByAccessLink(token, deps = {}) {
  const request = deps.request || apiPrimary;
  const clear = deps.clearCache || clearApiCache;
  const store = deps.storeToken || setToken;
  const device = deps.device || describeDevice();

  const result = await request('auth.access.enter', { token, device });
  if (!result || !result.token) throw new Error('Сервер не выдал ключ входа.');

  clear();
  store(result.token);
  return result;
}

/* ==========================================================================
 * Сторона тренера
 * ========================================================================== */

// member — место участника сплита: у каждого из пары своя ссылка
const withMember = (clientRow, member) => (member === undefined || member === null ? { clientRow } : { clientRow, member });

export function fetchClientLink(clientRow, deps = {}, member) {
  const request = deps.request || apiPrimary;
  return request('trainer.client.link', withMember(clientRow, member));
}

export async function createClientLink(clientRow, deps = {}, member) {
  const request = deps.request || apiPrimary;
  const result = await request('trainer.client.link.create', withMember(clientRow, member));
  (deps.clearCache || clearApiCache)();
  return result;
}

export async function revokeClientLink(clientRow, deps = {}, member) {
  const request = deps.request || apiPrimary;
  const result = await request('trainer.client.link.revoke', withMember(clientRow, member));
  (deps.clearCache || clearApiCache)();
  return result;
}

export async function createClient(name, deps = {}) {
  const request = deps.request || apiPrimary;
  const result = await request('trainer.client.create', { name });
  (deps.clearCache || clearApiCache)();
  return result;
}

export const APP_STORE_URL = 'https://apps.apple.com/ru/app/id6816619723';
export const ANDROID_APK_URL = 'https://api.fitness100.ru/android/fit-track.apk';

/**
 * Текст приглашения — инструкция по шагам (FT-614, владелец 19.10.2026):
 * без приветствия, на «ты». Сначала поставить приложение, потом открыть
 * ссылку — она откроет приложение сразу в кабинете клиента (applinks на
 * iPhone, autoVerify на Android). И что ссылка личная: по ней входят без
 * пароля, пересланная — вход для другого человека.
 *
 * Ссылка — внутри текста, последней строкой перед предупреждением, а не
 * отдельным полем «Поделиться»: мессенджеры сами решают, куда приклеить
 * отдельный адрес, и шаги шли бы не по порядку.
 *
 * Имя — только у участника сплита: там у каждого своя ссылка, и важно,
 * кому какая.
 */
export function inviteMessage(url, memberName) {
  const lead = memberName
    ? memberName + ', это твой личный кабинет в Fit Track'
    : 'Твой личный кабинет в Fit Track';
  return [
    lead + ': программа тренировок, записи подходов и прогресс.',
    '',
    '1. Установи приложение.',
    'iPhone — из App Store: ' + APP_STORE_URL,
    'Android — скачай файл и открой его: ' + ANDROID_APK_URL,
    '2. Вернись к этому сообщению и нажми на ссылку ниже — приложение откроется сразу в твоём кабинете, пароль не нужен.',
    '',
    url,
    '',
    'Ссылка личная — не пересылай её.',
  ].join('\n');
}

/**
 * Отправить приглашение так, как удобно на этом устройстве.
 *
 * На телефоне это системное «Поделиться» — сразу в нужный чат. На
 * компьютере такого окна нет, и остаётся буфер обмена: туда кладём всё
 * сообщение со ссылкой, чтобы вставить его целиком. Возвращаем, что
 * именно произошло: подпись у кнопки должна совпадать с реальностью.
 */
export async function shareAccessLink(url, memberName, navigatorObject = navigator) {
  const text = inviteMessage(url, memberName);
  if (navigatorObject.share) {
    try {
      await navigatorObject.share({ title: 'Приглашение в Fit Track', text });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
    }
  }

  await copyText(text, navigatorObject);
  return 'copied';
}

/**
 * Отправить готовый текст: «Поделиться» на телефоне, буфер обмена на
 * компьютере. Для инструкции клиенту, где ссылки нет (FT-613).
 */
export async function shareText(text, navigatorObject = navigator) {
  if (navigatorObject.share) {
    try {
      await navigatorObject.share({ text });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
    }
  }
  await copyText(text, navigatorObject);
  return 'copied';
}

export async function copyText(text, navigatorObject = navigator, documentObject = document) {
  if (navigatorObject.clipboard && navigatorObject.clipboard.writeText) {
    await navigatorObject.clipboard.writeText(text);
    return true;
  }

  const input = documentObject.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  documentObject.body.appendChild(input);
  input.select();
  const copied = documentObject.execCommand('copy');
  input.remove();
  return copied;
}

/**
 * Адрес входа внутри приложения из вставленного текста (PasteLink.jsx):
 * персональная ссылка (?access=) или одноразовый вход (#loginTicket=).
 * Пусто — это не ссылка для входа.
 */
export function linkTarget(text, base) {
  const raw = String(text || '').trim();
  const access = /[?&]access=([^&#\s]+)/.exec(raw);
  if (access) return new URL('./?access=' + access[1], base).href;
  const ticket = /[#&]loginTicket=([^&\s]+)/.exec(raw);
  if (ticket) return new URL('./#loginTicket=' + ticket[1], base).href;
  return '';
}
