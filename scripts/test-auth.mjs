import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTransferUrl, consumeTransferTicket, readLoginTicket, removeLoginTicketFromUrl,
} from '../src/auth-transfer.js';
import { installGuidance, isIosDevice, isIosSafari, readInstallBridgeTicket } from '../src/install.js';
import { resetClientAccess } from '../src/client-access.js';
import { readInviteToken, removeInviteToken } from '../src/invites.js';
import { enterByAccessLink, readAccessToken, removeAccessToken } from '../src/access.js';

test('invite token is read from query and removed without losing other parameters or hash', () => {
  const location = {
    href: 'https://example.test/app/?source=coach&invite=signed-token#section',
  };
  assert.equal(readInviteToken(location), 'signed-token');

  let replaced = '';
  removeInviteToken({ state: null, replaceState: (_s, _t, value) => { replaced = value; } }, location);
  assert.equal(replaced, '/app/?source=coach#section');
});

test('transfer secret lives in fragment and is removed without changing query', () => {
  const location = {
    href: 'https://example.test/app/?source=guide#old=value',
    origin: 'https://example.test', pathname: '/app/', search: '?source=guide', hash: '#old=value',
  };
  const url = buildTransferUrl('secret-ticket', location);
  assert.equal(url, 'https://example.test/app/#loginTicket=secret-ticket');
  assert.equal(readLoginTicket({ ...location, href: url, hash: '#loginTicket=secret-ticket' }), 'secret-ticket');

  let replaced = '';
  removeLoginTicketFromUrl({ state: null, replaceState: (_s, _t, value) => { replaced = value; } }, {
    href: 'https://example.test/app/?source=guide#loginTicket=secret-ticket',
  });
  assert.equal(replaced, '/app/?source=guide');
});

test('one ticket is consumed once and cache is cleared before account token changes', async () => {
  let requests = 0;
  const order = [];
  const options = {
    request: async (action) => {
      requests += 1;
      assert.equal(action, 'auth.transfer.consume');
      return { token: 'account-b' };
    },
    clearPending: () => order.push('pending'),
    clearCache: () => order.push('cache'),
    storeToken: (token) => order.push('token:' + token),
    device: 'test',
  };
  const [a, b] = await Promise.all([
    consumeTransferTicket('unique-ticket-a', options),
    consumeTransferTicket('unique-ticket-a', options),
  ]);
  assert.equal(requests, 1);
  assert.equal(a, b);
  assert.deepEqual(order, ['pending', 'cache', 'token:account-b']);
});

test('a failed one-time ticket is not retried in the same page', async () => {
  let requests = 0;
  const options = { request: async () => { requests += 1; throw new Error('lost response'); } };
  await assert.rejects(consumeTransferTicket('unique-ticket-b', options));
  await assert.rejects(consumeTransferTicket('unique-ticket-b', options));
  assert.equal(requests, 1);
});

test('iOS guidance is limited to Safari and standalone install ticket is consumed', () => {
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2) AppleWebKit/605.1.15 Version/17.2 Mobile Safari/604.1';
  assert.equal(isIosSafari(safari), true);
  assert.equal(isIosSafari(safari.replace('Safari', 'CriOS')), false);
  assert.equal(isIosDevice(safari.replace('Safari', 'CriOS')), true);
  assert.equal(installGuidance({ standalone: false, dismissed: false, prompt: null, userAgent: safari }), 'ios');

  const writes = [];
  const doc = {
    baseURI: 'https://example.test/app/',
    get cookie() { return 'fit_install_ticket=install-secret; theme=dark'; },
    set cookie(value) { writes.push(value); },
  };
  assert.equal(readInstallBridgeTicket({ document: doc, standalone: true, token: '' }), 'install-secret');
  assert.match(writes[0], /Max-Age=0/);
  assert.match(writes[0], /Path=\/app\//);
});

/**
 * Совет про установку обязан зависеть от браузера, а не от системы.
 *
 * Прежняя версия отвечала «iOS — значит рассказать про „Поделиться“», и
 * ошибалась ровно там, где подсказка нужнее всего: во встроенном браузере
 * Telegram и в Chrome для iPhone пункта «На экран „Домой“» нет. Человек
 * искал в меню то, чего там не бывает, и решал, что сломалось приложение.
 */
test('подсказка про установку не советует невозможного', () => {
  const base = { standalone: false, dismissed: false, prompt: null };

  const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
  const iosTelegram = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1';
  const androidChrome = 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
  const androidWebview = 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/124.0 Mobile Safari/537.36';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

  assert.equal(installGuidance({ ...base, userAgent: iosSafari }), 'ios',
    'в Safari установка руками — и это единственное место на iPhone, где она есть');

  assert.equal(installGuidance({ ...base, userAgent: iosTelegram, standalone: undefined }), 'elsewhere',
    'во встроенном браузере Telegram советовать «Поделиться» бессмысленно');

  assert.equal(installGuidance({ ...base, userAgent: iosChrome, standalone: undefined }), 'elsewhere',
    'в Chrome для iPhone пункта «На экран „Домой“» нет');

  assert.equal(installGuidance({ ...base, userAgent: androidChrome, prompt: {} }), 'prompt',
    'когда браузер сам предложил установку, никакие инструкции не нужны');

  assert.equal(installGuidance({ ...base, userAgent: androidWebview }), 'elsewhere');

  assert.equal(installGuidance({ ...base, userAgent: desktop }), null,
    'на компьютере ставить нечего');

  assert.equal(installGuidance({ ...base, userAgent: iosSafari, standalone: true }), null,
    'уже установлено');

  assert.equal(installGuidance({ ...base, userAgent: iosSafari, dismissed: true }), null,
    'подсказку закрыли — больше не навязываемся');
});

test('client access reset is primary-only and clears cached client data after success', async () => {
  const calls = [];
  let cleared = 0;
  const result = await resetClientAccess(7, true, {
    request: async (action, params) => {
      calls.push({ action, params });
      return { clientRow: 7, unlinked: true };
    },
    clearCache: () => { cleared += 1; },
  });

  assert.deepEqual(calls, [{
    action: 'trainer.client.access.reset',
    params: { clientRow: 7, unlinkTelegram: true },
  }]);
  assert.equal(cleared, 1);
  assert.equal(result.unlinked, true);
});

test('failed client access reset keeps cached data and rejects invalid rows', async () => {
  let cleared = 0;
  await assert.rejects(
    resetClientAccess(3, false, {
      request: async () => { throw new Error('offline'); },
      clearCache: () => { cleared += 1; },
    }),
    /offline/
  );
  assert.equal(cleared, 0);
  await assert.rejects(resetClientAccess(0, false, { request: async () => ({}) }), /Не указан клиент/);
});

test('access token is read from the address and cleaned up after login', () => {
  const location = { href: 'https://example.test/app/?utm=letter&access=signed-access-token#plan' };
  assert.equal(readAccessToken(location), 'signed-access-token');

  let replaced = '';
  removeAccessToken({ state: null, replaceState: (_s, _t, value) => { replaced = value; } }, location);
  assert.equal(replaced, '/app/?utm=letter#plan');

  // Ничего не меняем, если токена в адресе не было: лишний replaceState
  // засоряет историю браузера.
  let touched = false;
  removeAccessToken(
    { state: null, replaceState: () => { touched = true; } },
    { href: 'https://example.test/app/' },
  );
  assert.equal(touched, false);
});

test('entering by link clears cached data before the new account token is stored', async () => {
  const order = [];
  const result = await enterByAccessLink('signed-access-token', {
    request: async (action, params) => {
      assert.equal(action, 'auth.access.enter');
      assert.equal(params.token, 'signed-access-token');
      assert.equal(params.device, 'iPhone, браузер');
      return { token: 'client-session', name: 'Пётр Смирнов' };
    },
    clearCache: () => order.push('cache'),
    storeToken: (token) => order.push('token:' + token),
    device: 'iPhone, браузер',
  });

  assert.equal(result.name, 'Пётр Смирнов');
  assert.deepEqual(order, ['cache', 'token:client-session'], 'чужие данные уходят до входа');
});

test('a login without a token is a failure, not a silent half-entry', async () => {
  await assert.rejects(
    enterByAccessLink('signed-access-token', {
      request: async () => ({ ok: true }),
      clearCache: () => { throw new Error('кэш чистить нечего'); },
      storeToken: () => { throw new Error('ключа нет'); },
      device: 'test',
    }),
    /ключ входа/,
  );
});
