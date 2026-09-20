import { apiPrimary, clearApiCache } from './api.js';
import { readInstallBridgeTicket } from './install.js';
import {
  clearPendingLogin, describeDevice, setToken,
} from './session.js';

/**
 * Одноразовая ссылка переносит уже подтверждённую Telegram-сессию в
 * обычный браузер. Билет никогда не кладём в localStorage: после первого
 * запроса он больше не является секретом, пригодным для повторного входа.
 */

const consumeAttempts = new Map();

export function readLoginTicket(locationLike = safeLocation()) {
  try {
    const fromLink = new URLSearchParams(String(locationLike.hash || '').replace(/^#/, ''))
      .get('loginTicket') || '';
    return fromLink || readInstallBridgeTicket();
  } catch (_) {
    return '';
  }
}

export function buildTransferUrl(ticket, locationLike = safeLocation()) {
  const value = String(ticket || '').trim();
  if (!value) throw new Error('Сервер не выдал ссылку для входа.');

  const url = new URL(locationLike.href || (
    locationLike.origin + locationLike.pathname
  ));
  url.search = '';
  url.hash = '';
  url.hash = new URLSearchParams({ loginTicket: value }).toString();
  return url.toString();
}

export function removeLoginTicketFromUrl(
  historyLike = typeof history !== 'undefined' ? history : null,
  locationLike = safeLocation()
) {
  if (!historyLike || !historyLike.replaceState) return;

  try {
    const url = new URL(locationLike.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    if (!fragment.has('loginTicket')) return;
    fragment.delete('loginTicket');
    url.hash = fragment.toString();
    historyLike.replaceState(historyLike.state, '', url.pathname + url.search + url.hash);
  } catch (_) {}
}

/**
 * React StrictMode монтирует эффект дважды. Общая Promise гарантирует,
 * что одноразовый билет не будет погашен второй раз, пока первый запрос
 * ещё летит. Успешный и неопределённый результаты остаются в карте до
 * перезагрузки: повторять одноразовый билет после потери ответа нельзя.
 */
export function consumeTransferTicket(ticket, options = {}) {
  const value = String(ticket || '').trim();
  if (!value) return Promise.reject(new Error('В ссылке нет данных для входа.'));
  if (consumeAttempts.has(value)) return consumeAttempts.get(value);

  const request = options.request || apiPrimary;
  const storeToken = options.storeToken || setToken;
  const clearPending = options.clearPending || clearPendingLogin;
  const clearCache = options.clearCache || clearApiCache;
  const device = options.device || describeDevice();

  const attempt = Promise.resolve()
    .then(() => request('auth.transfer.consume', { ticket: value, device }))
    .then((result) => {
      if (!result || !result.token) {
        throw new Error('Сервер не выдал ключ входа.');
      }
      clearPending();
      clearCache();
      storeToken(result.token);
      return result;
    });

  consumeAttempts.set(value, attempt);
  return attempt;
}

export async function createTransferUrl(options = {}) {
  const request = options.request || apiPrimary;
  const locationLike = options.location || safeLocation();
  const result = await request('auth.transfer.create', {});

  if (!result || !result.ticket) {
    throw new Error('Сервер не выдал ссылку для входа.');
  }

  return {
    url: buildTransferUrl(result.ticket, locationLike),
    expiresAt: result.expiresAt || '',
  };
}

export function friendlyTransferError(error) {
  const code = error && error.code;
  if (code === 400 || code === 404 || code === 409 || code === 410) {
    return 'Ссылка уже использована или её время вышло. Вернитесь в Telegram и создайте новую.';
  }
  return (error && error.message) || 'Не удалось войти. Проверьте связь и попробуйте снова.';
}

function safeLocation() {
  if (typeof window !== 'undefined' && window.location) return window.location;
  return { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '' };
}
