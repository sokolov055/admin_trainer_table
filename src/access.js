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

/**
 * Текст приглашения (FT-613, владелец 18.10.2026: прежнее «Ваш кабинет с
 * тренировками» ничего не объясняло). Сказать, что это, что внутри и что
 * делать: открыть ссылку — пароль не нужен. И что ссылка личная: по ней
 * входят без пароля, пересланная — вход для другого человека.
 *
 * Имя — только у участника сплита: там у каждого своя ссылка, и важно,
 * кому какая. Полное ФИО из карточки в обращении звучит как повестка,
 * поэтому одиночному клиенту — просто «Здравствуйте!».
 */
export function inviteMessage(memberName) {
  return (memberName ? memberName + ', здравствуйте!' : 'Здравствуйте!')
    + ' Приглашаю вас в Fit Track — там ваша программа, записи тренировок и прогресс.'
    + ' Откройте ссылку: кабинет откроется сразу, пароль не нужен.'
    + ' Ссылка личная — не пересылайте её.';
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
  const text = inviteMessage(memberName);
  if (navigatorObject.share) {
    try {
      await navigatorObject.share({ title: 'Приглашение в Fit Track', text, url });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
    }
  }

  await copyText(text + ' ' + url, navigatorObject);
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
