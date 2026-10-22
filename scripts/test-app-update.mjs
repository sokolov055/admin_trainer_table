/**
 * «Вышла новая версия» на iPhone (src/app-update.js, 22.10.2026): из App
 * Store — на App Store, из TestFlight — на TestFlight, канал — по номеру
 * сборки относительно App Store.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

const { iosUpdate, updateText, compareVersions } = await import('../src/app-update.js');

const STORE = 'https://apps.apple.com/ru/app/id6816619723';
const BETA = 'itms-beta://beta.itunes.apple.com/v1/app/6816619723';
const versions = (appStore, testflight) => ({
  ios: {
    appStore: appStore && { ...appStore, url: STORE },
    testflight: testflight && { ...testflight, url: BETA },
  },
});

test('версии сравниваются по частям: 1.10 новее 1.9', () => {
  assert.equal(compareVersions('1.10', '1.9'), 1);
  assert.equal(compareVersions('1.6', '1.6.0'), 0);
  assert.equal(compareVersions('1.5', '1.6'), -1);
});

test('из App Store: вышла новее — ссылка на App Store', () => {
  const v = versions({ version: '1.6', build: 25 }, { version: '1.7', build: 28 });
  const u = iosUpdate(v, { version: '1.5', build: '22' });
  assert.deepEqual(u, { store: 'App Store', version: '1.6', build: 25, url: STORE });
  assert.equal(updateText(u), 'Вышла новая версия 1.6 — обновите в App Store');
  // Та же, что в магазине, — молчим, хотя в TestFlight есть новее
  assert.equal(iosUpdate(v, { version: '1.6', build: '25' }), null);
});

test('из TestFlight: сборка новее App Store — ссылка на TestFlight', () => {
  const v = versions({ version: '1.5', build: 22 }, { version: '1.6', build: 26 });
  assert.deepEqual(iosUpdate(v, { version: '1.6', build: '25' }), { store: 'TestFlight', version: '1.6', build: 26, url: BETA });
  assert.equal(iosUpdate(v, { version: '1.6', build: '26' }), null, 'последняя — молчим');
  // Сборки TestFlight ещё не видно (Apple обрабатывает) — молчим
  assert.equal(iosUpdate(versions({ version: '1.5', build: 22 }, null), { version: '1.6', build: '25' }), null);
});

test('сборка TestFlight не новее App Store — обновится и из App Store', () => {
  const v = versions({ version: '1.6', build: 25 }, { version: '1.7', build: 28 });
  assert.equal(iosUpdate(v, { version: '1.6', build: '24' }).store, 'App Store');
});

test('у App Store неизвестна сборка — канал по версии', () => {
  const v = versions({ version: '1.6', build: 0 }, { version: '1.7', build: 28 });
  assert.equal(iosUpdate(v, { version: '1.5', build: '22' }).store, 'App Store');
  assert.equal(iosUpdate(v, { version: '1.7', build: '27' }).store, 'TestFlight');
});

test('без ответа сервера или без номера сборки — ничего', () => {
  assert.equal(iosUpdate(null, { version: '1.5', build: '22' }), null);
  assert.equal(iosUpdate(versions({ version: '1.6', build: 25 }), { version: '1.5' }), null);
});
