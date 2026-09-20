import { api, apiPrimary, clearApiCache } from './api.js';
import { setToken, describeDevice } from './session.js';

export function readInviteToken(location = window.location) {
  try {
    return String(new URL(location.href).searchParams.get('invite') || '').trim();
  } catch (_) {
    return '';
  }
}

export function removeInviteToken(history = window.history, location = window.location) {
  const url = new URL(location.href);
  url.searchParams.delete('invite');
  const next = url.pathname + (url.search ? url.search : '') + (url.hash || '');
  history.replaceState(history.state, '', next);
}

export function inspectInvite(token) {
  return apiPrimary('auth.invite.inspect', { token });
}

export async function requestInviteEmail(token, name, email) {
  return apiPrimary('auth.invite.email.request', {
    token, name, email, device: describeDevice(),
  });
}

export async function confirmInviteEmail(requestId, code) {
  const result = await apiPrimary('auth.invite.email.confirm', {
    requestId, code, device: describeDevice(),
  });
  clearApiCache();
  setToken(result.token);
  return result;
}

export function listTrainerInvites() {
  return api('trainer.invites', {}, { fresh: true });
}

export async function createTrainerInvite(kind, label = '') {
  const result = await apiPrimary('trainer.invite.create', { kind, label });
  clearApiCache();
  return result;
}

export async function revokeTrainerInvite(inviteId) {
  const result = await apiPrimary('trainer.invite.revoke', { inviteId });
  clearApiCache();
  return result;
}

export async function copyInviteText(text, navigatorObject = navigator, documentObject = document) {
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
