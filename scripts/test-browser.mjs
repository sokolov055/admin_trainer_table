/**
 * Определение браузера по User-Agent.
 *
 * Разбор UA — классическое место, где ошибка не видна на своём телефоне и
 * находится только у клиента. Цена ошибки несимметрична: не узнали Safari —
 * человек упирается в стену вместо входа в кабинет и звонит тренеру; не
 * узнали встроенный браузер — человек просто не поставит приложение, что
 * ровно то же, что было раньше. Поэтому строки взяты настоящие.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { detectBrowser, androidBrowserUrl, copyCurrentLink } from '../src/browser.js';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosTelegram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iosYandex: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 YaBrowser/23.9.0.185.10 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidTelegram: 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

/* ==========================================================================
 * iOS: годится только Safari
 * ========================================================================== */

test('Safari на iPhone — можно ставить приложение', () => {
  const at = detectBrowser({ userAgent: UA.iosSafari, standalone: false });
  assert.equal(at.platform, 'ios');
  assert.equal(at.kind, 'ok');
  assert.equal(at.deadEnd, false);
});

test('встроенный браузер Telegram на iPhone — тупик', () => {
  // Отличается от Safari именно отсутствием navigator.standalone: строка
  // User-Agent у него почти такая же, и по ней одной его не поймать
  const at = detectBrowser({ userAgent: UA.iosTelegram, standalone: undefined });
  assert.equal(at.kind, 'webview');
  assert.equal(at.deadEnd, true);
});

test('Chrome на iPhone — тоже тупик: «На экран „Домой“» там нет', () => {
  const at = detectBrowser({ userAgent: UA.iosChrome, standalone: undefined });
  assert.equal(at.kind, 'other-browser');
  assert.equal(at.deadEnd, true);
});

test('Яндекс.Браузер на iPhone — тупик', () => {
  const at = detectBrowser({ userAgent: UA.iosYandex, standalone: undefined });
  assert.equal(at.kind, 'other-browser');
  assert.equal(at.deadEnd, true);
});

test('уже установленное приложение вести некуда', () => {
  const at = detectBrowser({ userAgent: UA.iosSafari, standalone: true });
  assert.equal(at.kind, 'installed');
  assert.equal(at.deadEnd, false);
});

test('iPad притворяется Mac, но выдаёт себя касаниями', () => {
  const at = detectBrowser({ userAgent: UA.ipadSafari, standalone: false, maxTouchPoints: 5 });
  assert.equal(at.platform, 'ios');
  assert.equal(at.deadEnd, false);
});

test('настоящий Mac остаётся компьютером', () => {
  const at = detectBrowser({ userAgent: UA.ipadSafari, standalone: undefined, maxTouchPoints: 0 });
  assert.equal(at.platform, 'other');
  assert.equal(at.deadEnd, false);
});

/* ==========================================================================
 * Android: мешаем только встроенному WebView
 * ========================================================================== */

test('своё Android-приложение — тоже WebView, но это цель, а не тупик', () => {
  const where = detectBrowser({ userAgent: UA.androidTelegram, native: true });
  assert.equal(where.platform, 'android');
  assert.equal(where.kind, 'installed');
  assert.equal(where.deadEnd, false);
});

test('встроенный браузер Telegram на Android — тупик', () => {
  const at = detectBrowser({ userAgent: UA.androidTelegram });
  assert.equal(at.platform, 'android');
  assert.equal(at.kind, 'webview');
  assert.equal(at.deadEnd, true);
});

test('Chrome на Android — можно ставить', () => {
  const at = detectBrowser({ userAgent: UA.androidChrome });
  assert.equal(at.deadEnd, false);
});

test('Samsung Internet тоже умеет установку, и мешать ему не надо', () => {
  const at = detectBrowser({ userAgent: UA.androidSamsung });
  assert.equal(at.deadEnd, false);
});

test('компьютер не трогаем', () => {
  const at = detectBrowser({ userAgent: UA.desktop });
  assert.equal(at.platform, 'other');
  assert.equal(at.deadEnd, false);
});

/* ==========================================================================
 * Выход в настоящий браузер на Android
 * ========================================================================== */

test('intent-адрес сохраняет токен ссылки и запасной путь', () => {
  const href = 'https://sokolov055.github.io/admin_trainer_table/?access=AbC123';
  const url = androidBrowserUrl(href);

  assert.ok(url.startsWith('intent://sokolov055.github.io/admin_trainer_table/?access=AbC123#Intent'));
  assert.ok(url.includes(';scheme=https;'), 'схема уезжает отдельным полем');
  assert.ok(url.includes(';package=com.android.chrome;'));
  assert.ok(url.endsWith(';end'));

  // Без запасного адреса телефон без Chrome показал бы отказ вместо кабинета
  assert.ok(url.includes('S.browser_fallback_url=' + encodeURIComponent(href)));
});

test('чужая схема в intent-адрес не превращается', () => {
  assert.equal(androidBrowserUrl('javascript:alert(1)'), '');
  assert.equal(androidBrowserUrl('не адрес'), '');
});

/* ==========================================================================
 * Копирование
 * ========================================================================== */

test('ссылка копируется целиком, вместе с токеном', async () => {
  let copied = '';
  const ok = await copyCurrentLink({
    href: 'https://example.org/app/?access=Zz9',
    clipboard: { writeText: async (value) => { copied = value; } },
  });

  assert.equal(ok, true);
  assert.equal(copied, 'https://example.org/app/?access=Zz9');
});

test('отказ буфера обмена не считается ошибкой', async () => {
  const ok = await copyCurrentLink({
    href: 'https://example.org/app/',
    clipboard: { writeText: async () => { throw new Error('нет разрешения'); } },
  });

  assert.equal(ok, false);
});

test('браузер без буфера обмена не роняет экран', async () => {
  assert.equal(await copyCurrentLink({ href: 'https://example.org/', clipboard: null }), false);
});
