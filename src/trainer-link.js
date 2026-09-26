import { api, apiPrimary, clearApiCache } from './api.js';

/**
 * Ссылка тренера «привязаться ко мне» (?trainer=…).
 *
 * Открывают её по-разному: уже вошедший клиент, человек без кабинета,
 * Android-приложение, которому ссылку передал браузер. Поэтому ссылка не
 * обрабатывается на месте, а запоминается: сначала человек входит или
 * регистрируется, а предложение «Тренер … приглашает» ждёт его на обзоре.
 * Привязка — только нажатием «Привязаться»: ссылка сама ничего не меняет.
 */

const KEY = 'pending_trainer_link_v1';

/** Забрать токен из адреса и убрать его оттуда — вызывается при запуске */
export function captureTrainerLink(location = window.location, history = window.history) {
  try {
    const url = new URL(location.href);
    const token = String(url.searchParams.get('trainer') || '').trim();
    if (!token) return;
    try { localStorage.setItem(KEY, token); } catch (_) {}
    url.searchParams.delete('trainer');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  } catch (_) {}
}

export function pendingTrainerLink() {
  try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; }
}

export function forgetTrainerLink() {
  try { localStorage.removeItem(KEY); } catch (_) {}
}

export function inspectTrainerLink(token) {
  return apiPrimary('auth.trainer.link.inspect', { token });
}

export async function joinTrainer(token) {
  const result = await apiPrimary('account.link.join', { token });
  forgetTrainerLink();
  clearApiCache();
  return result;
}

export function accountState() {
  return api('account.get', {}, { fresh: true });
}

export async function answerRequest(requestId, accept) {
  const result = await apiPrimary('account.link.answer', { requestId, accept });
  clearApiCache();
  return result;
}

/** Адрес ссылки тренера — от адреса самого приложения */
export function trainerLinkUrl(token) {
  const url = new URL('./', window.location.href);
  url.searchParams.set('trainer', token);
  return url.href;
}
