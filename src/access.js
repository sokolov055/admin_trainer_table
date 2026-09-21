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

export function fetchClientLink(clientRow, deps = {}) {
  const request = deps.request || apiPrimary;
  return request('trainer.client.link', { clientRow });
}

export async function createClientLink(clientRow, deps = {}) {
  const request = deps.request || apiPrimary;
  const result = await request('trainer.client.link.create', { clientRow });
  (deps.clearCache || clearApiCache)();
  return result;
}

export async function revokeClientLink(clientRow, deps = {}) {
  const request = deps.request || apiPrimary;
  const result = await request('trainer.client.link.revoke', { clientRow });
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
 * Отправить ссылку так, как удобно на этом устройстве.
 *
 * На телефоне это системное «Поделиться» — сразу в нужный чат. На
 * компьютере такого окна нет, и остаётся буфер обмена. Возвращаем, что
 * именно произошло: подпись у кнопки должна совпадать с реальностью.
 */
export async function shareAccessLink(url, name, navigatorObject = navigator) {
  if (navigatorObject.share) {
    try {
      await navigatorObject.share({
        title: 'Личный кабинет',
        text: name ? `${name}, ваш кабинет с тренировками` : 'Ваш кабинет с тренировками',
        url,
      });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
    }
  }

  await copyText(url);
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
