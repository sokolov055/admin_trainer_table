import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * Ссылка доступа клиента: «Отправить приглашение» и одна «Скопировать
 * ссылку» (FT-614 — раскрытия «Ссылка и доступ» с полем адреса нет).
 * Текст приглашения — по шагам, ссылка внутри текста.
 */

// В Node старше 21 глобального navigator нет (компонент читает navigator.share)
if (typeof navigator === 'undefined') globalThis.navigator = {};

const URL_ = 'https://app.fitness100.ru/?access=UCxKf4lR15lnH6W3X9ZIfAKIg-weWuWbTBm0KRfAdfOb';
const copied = [];
globalThis.__access = {
  fetchClientLink: async () => ({ link: { url: URL_, useCount: 3, maxUses: 5, usesLeft: 2, expiresAt: '2026-11-15', lastUsedAt: '2026-10-16' } }),
  createClientLink: async () => ({ link: { url: URL_ } }),
  revokeClientLink: async () => ({}),
  shareAccessLink: async () => 'copied',
  copyText: async (text) => { copied.push(text); return true; },
};

const output = await build({ entryPoints: ['src/trainer/InviteLink.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty' }, logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\.\/(access|ui|telegram)\.js(x)?$/ }, (args) => ({ path: args.path, namespace: 'stub' }));
    b.onLoad({ filter: /access\.js$/, namespace: 'stub' }, () => ({ contents: 'export const copyText=(...a)=>globalThis.__access.copyText(...a); export const createClientLink=(...a)=>globalThis.__access.createClientLink(...a); export const fetchClientLink=(...a)=>globalThis.__access.fetchClientLink(...a); export const revokeClientLink=(...a)=>globalThis.__access.revokeClientLink(...a); export const shareAccessLink=(...a)=>globalThis.__access.shareAccessLink(...a);' }));
    b.onLoad({ filter: /ui\.jsx$/, namespace: 'stub' }, () => ({ contents: 'export const formatDate=(d)=>String(d);' }));
    b.onLoad({ filter: /telegram\.js$/, namespace: 'stub' }, () => ({ contents: 'export const haptic=()=>{};' }));
  } }] });
const mod = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(createRequire(import.meta.url), mod, mod.exports);
const { ClientInviteLink } = mod.exports;

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));
const delay = () => new Promise((r) => setTimeout(r, 10));

test('FT-614: одна «Скопировать ссылку», без раскрытия и поля с адресом', async () => {
  let tree;
  await act(async () => { tree = renderer.create(React.createElement(ClientInviteLink, { client: { row: 5, name: 'Никита' } })); await delay(); });
  assert.equal(tree.root.findAllByType('details').length, 0, 'раскрытия «Ссылка и доступ» нет');
  assert.equal(tree.root.findAllByType('input').length, 0, 'поля с адресом нет');
  const labels = tree.root.findAllByType('button').map(text);
  assert.equal(labels.filter((l) => /Скопировать ссылку/.test(l)).length, 1, 'копирует одна кнопка');
  assert.ok(!labels.some((l) => /Новая ссылка|Отозвать/.test(l)), 'перевыпуска и отзыва здесь нет');
  assert.ok(text(tree.root).includes('Входов: 3 из 5'), 'строка состояния под кнопками');

  const button = () => tree.root.findAllByType('button').find((b) => /Скопировать ссылку|Скопировано/.test(text(b)));
  assert.equal(text(button()), 'Скопировать ссылку');
  await act(async () => { button().props.onClick(); await delay(); });
  assert.deepEqual(copied, [URL_], 'в буфер ушёл весь адрес');
  assert.equal(text(button()), 'Скопировано', 'подтверждение на кнопке');
  tree.unmount();
});

test('FT-613: «Скопировать ссылку» и до приглашения — выпускает ссылку и копирует только адрес', async () => {
  const saved = globalThis.__access.fetchClientLink;
  let shared = 0;
  const savedShare = globalThis.__access.shareAccessLink;
  globalThis.__access.fetchClientLink = async () => ({ link: null });
  globalThis.__access.shareAccessLink = async () => { shared += 1; return 'shared'; };
  copied.length = 0;
  let tree;
  try {
    await act(async () => { tree = renderer.create(React.createElement(ClientInviteLink, { client: { row: 6, name: 'Оля' } })); await delay(); });
    const labels = tree.root.findAllByType('button').map(text);
    assert.ok(labels.includes('Пригласить в приложение'), 'приглашение на месте');
    const copyBtn = tree.root.findAllByType('button').find((b) => text(b) === 'Скопировать ссылку');
    assert.ok(copyBtn, 'копирование — отдельной кнопкой');
    await act(async () => { copyBtn.props.onClick(); await delay(); });
    assert.deepEqual(copied, [URL_], 'в буфере только адрес');
    assert.equal(shared, 0, 'окно «Поделиться» не открывалось');
  } finally {
    globalThis.__access.fetchClientLink = saved;
    globalThis.__access.shareAccessLink = savedShare;
    if (tree) tree.unmount();
  }
});

test('FT-614: приглашение — по шагам, на «ты», ссылка внутри текста', async () => {
  const { inviteMessage, shareAccessLink, APP_STORE_URL, ANDROID_APK_URL } = await import('../src/access.js');
  const message = inviteMessage(URL_);
  assert.ok(message.startsWith('Твой личный кабинет в Fit Track'), 'без приветствия');
  assert.ok(!/Здравствуйте|вас|ваш/.test(message), 'на «ты»');
  const steps = [APP_STORE_URL, ANDROID_APK_URL, URL_, 'Ссылка личная'].map((part) => message.indexOf(part));
  assert.ok(steps.every((at) => at >= 0), 'App Store, APK, ссылка и предупреждение — в тексте');
  assert.deepEqual([...steps].sort((a, b) => a - b), steps, 'по порядку: установить, потом ссылка');
  assert.ok(inviteMessage(URL_, 'Светлана').startsWith('Светлана, это твой личный кабинет'), 'у сплита — имя участника');

  let shared;
  const result = await shareAccessLink(URL_, '', { share: async (data) => { shared = data; } });
  assert.equal(result, 'shared');
  assert.equal(shared.url, undefined, 'адрес не отдельным полем — мессенджер не переставит шаги');
  assert.equal(shared.text, message);

  let clip;
  // copyText берёт document параметром по умолчанию — в Node его нет
  if (typeof document === 'undefined') globalThis.document = {};
  const copiedResult = await shareAccessLink(URL_, '', { clipboard: { writeText: async (t) => { clip = t; } } });
  assert.equal(copiedResult, 'copied');
  assert.equal(clip, message, 'на компьютере в буфер — всё сообщение, ссылка уже внутри');
});
