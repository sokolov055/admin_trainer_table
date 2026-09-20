import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTransferUrl, consumeTransferTicket, readLoginTicket, removeLoginTicketFromUrl,
} from '../src/auth-transfer.js';
import { installGuidance, isIosDevice, isIosSafari, readInstallBridgeTicket } from '../src/install.js';

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
