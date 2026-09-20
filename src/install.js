import { apiPrimary } from './api.js';
import { getToken, isStandalone } from './session.js';

const DISMISSED_KEY = 'pwa_install_hint_v1';
const INSTALL_COOKIE = 'fit_install_ticket';

let installPrompt = null;
let captureStarted = false;
const listeners = new Set();

export function startInstallPromptCapture(target = typeof window !== 'undefined' ? window : null) {
  if (!target || captureStarted || !target.addEventListener) return;
  captureStarted = true;

  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    notify();
  });

  target.addEventListener('appinstalled', () => {
    installPrompt = null;
    dismissInstallHint();
  });
}

export function onInstallPromptChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installGuidance(options = {}) {
  const standalone = options.standalone !== undefined ? options.standalone : isStandalone();
  const dismissed = options.dismissed !== undefined ? options.dismissed : isInstallHintDismissed();
  const prompt = options.prompt !== undefined ? options.prompt : installPrompt;
  const ua = options.userAgent !== undefined
    ? options.userAgent
    : (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');

  if (standalone || dismissed) return null;
  if (prompt) return 'prompt';

  return isIosDevice(ua, options.maxTouchPoints) ? 'ios' : null;
}

export function isIosDevice(ua = '', maxTouchPoints) {
  const touches = maxTouchPoints !== undefined
    ? maxTouchPoints
    : (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touches > 1);
}

export function isIosSafari(ua = '', maxTouchPoints) {
  const ios = isIosDevice(ua, maxTouchPoints);
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return ios && safari;
}

export async function prepareIosInstallBridge(options = {}) {
  const request = options.request || apiPrimary;
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const ua = options.userAgent !== undefined
    ? options.userAgent
    : (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  if (!doc || !isIosDevice(ua, options.maxTouchPoints) || !getToken()) return false;

  const result = await request('auth.install.create', {});
  if (!result || !result.ticket) throw new Error('Не удалось подготовить вход после установки.');
  writeInstallCookie(result.ticket, result.ttlSec || 900, doc, options.baseURI);
  return true;
}

export function readInstallBridgeTicket(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const standalone = options.standalone !== undefined ? options.standalone : isStandalone();
  const token = options.token !== undefined ? options.token : getToken();
  if (!doc || !standalone || token) return '';

  const match = String(doc.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(INSTALL_COOKIE + '='));
  if (!match) return '';
  const ticket = decodeURIComponent(match.slice(INSTALL_COOKIE.length + 1));
  writeInstallCookie('', 0, doc, options.baseURI);
  return ticket;
}

function writeInstallCookie(ticket, ttlSec, doc, baseURI) {
  let path = '/';
  try {
    const pathname = new URL(baseURI || doc.baseURI).pathname;
    path = pathname.endsWith('/') ? pathname : pathname.slice(0, pathname.lastIndexOf('/') + 1);
  } catch (_) {}
  doc.cookie = INSTALL_COOKIE + '=' + encodeURIComponent(ticket)
    + '; Max-Age=' + Math.max(0, Number(ttlSec) || 0)
    + '; Path=' + path + '; SameSite=Strict; Secure';
}

export async function requestInstall() {
  const prompt = installPrompt;
  if (!prompt) return false;

  installPrompt = null;
  notify();
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } finally {
    // И принятие, и отказ закрывают нативный диалог. Повторно навязывать
    // его в этой подсказке нельзя.
    dismissInstallHint();
  }
  return true;
}

export function dismissInstallHint() {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch (_) {}
  notify();
}

export function isInstallHintDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch (_) { return false; }
}

function notify() {
  listeners.forEach((listener) => listener());
}
