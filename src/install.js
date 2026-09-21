import { apiPrimary } from './api.js';
import { getToken, isStandalone } from './session.js';
import { detectBrowser } from './browser.js';

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

/**
 * Что показывать про установку — и показывать ли вообще.
 *
 * Раньше здесь было «iOS — значит рассказать про „Поделиться“». Это враньё
 * ровно в тех случаях, когда помощь и нужна: во встроенном браузере
 * Telegram и в Chrome для iPhone пункта «На экран „Домой“» нет, и человек,
 * послушавшись, ищет в меню то, чего там не существует, а потом решает,
 * что сломалось приложение.
 *
 * Поэтому решение принимает detectBrowser, и вариантов стало четыре:
 *
 * `prompt`     — браузер сам предложил установку (Android). Лучший случай:
 *                одна кнопка, и дальше всё делает система.
 * `ios`        — Safari на iPhone. Установка руками, три шага.
 * `elsewhere`  — браузер, из которого установить нельзя. Единственный
 *                честный совет здесь — сменить браузер.
 * `null`       — уже установлено, подсказку закрыли, или это компьютер.
 */
export function installGuidance(options = {}) {
  const standalone = options.standalone !== undefined ? options.standalone : isStandalone();
  const dismissed = options.dismissed !== undefined ? options.dismissed : isInstallHintDismissed();
  const prompt = options.prompt !== undefined ? options.prompt : installPrompt;
  const where = options.where || detectBrowser(options);

  if (standalone || where.kind === 'installed' || dismissed) return null;
  if (prompt) return 'prompt';
  if (where.deadEnd) return 'elsewhere';

  return where.platform === 'ios' ? 'ios' : null;
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
