/**
 * Нативное в приложениях (24.10.2026): смахнуть нижний лист вниз
 * (src/sheet-drag.js — решение «закрыть или вернуть»), вибрация через
 * плагин Haptics (src/telegram.js → haptic) и системный размер шрифта
 * (src/text-zoom.js). Модули настоящие, подменены только мост Capacitor,
 * Telegram и document.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

const calls = [];
const fake = { native: true, platform: 'android', preferred: 1.15, haptics: true };
globalThis.document = { body: { style: {} } };
globalThis.window = {
  location: { hash: '', search: '', href: 'https://app.fitness100.ru/' },
  Capacitor: {
    isNativePlatform: () => fake.native,
    getPlatform: () => fake.platform,
    get Plugins() {
      return {
        ...(fake.haptics ? { Haptics: {
          impact: async (o) => { calls.push(['impact', o.style]); },
          notification: async (o) => { calls.push(['notification', o.type]); },
          selectionChanged: async () => { calls.push(['selection']); },
        } } : {}),
        TextZoom: {
          getPreferred: async () => ({ value: fake.preferred }),
          set: async (o) => { calls.push(['zoom', o.value]); },
        },
      };
    },
  },
};

const drag = await import('../src/sheet-drag.js');
const { haptic } = await import('../src/telegram.js');
const zoom = await import('../src/text-zoom.js');

test('лист: четверть высоты — закрыть, меньше — вернуть', () => {
  const h = 600;
  assert.equal(drag.sheetRelease({ offset: 151, height: h }), 'close');
  assert.equal(drag.sheetRelease({ offset: 150, height: h }), 'return');
  assert.equal(drag.sheetRelease({ offset: 40, height: h }), 'return');
  assert.equal(drag.sheetArmed(151, h), true);
  assert.equal(drag.sheetArmed(150, h), false);
});

test('лист: быстрый взмах вниз закрывает и с короткого пути, взмах вверх — передумал', () => {
  const h = 600;
  assert.equal(drag.sheetRelease({ offset: 30, height: h, velocity: 0.6 }), 'close');
  assert.equal(drag.sheetRelease({ offset: 30, height: h, velocity: 0.4 }), 'return');
  assert.equal(drag.sheetRelease({ offset: 400, height: h, velocity: -0.3 }), 'return');
  assert.equal(drag.sheetRelease({ offset: 400, height: h, velocity: -0.1 }), 'close');
});

test('лист: с набранной формой, вверх и без высоты — всегда вернуть', () => {
  assert.equal(drag.sheetRelease({ offset: 500, height: 600, velocity: 2, dirty: true }), 'return');
  assert.equal(drag.sheetRelease({ offset: -10, height: 600, velocity: 2 }), 'return');
  assert.equal(drag.sheetRelease({ offset: 0, height: 600, velocity: 2 }), 'return');
  assert.equal(drag.sheetRelease({ offset: 100, height: 0, velocity: 2 }), 'return');
});

test('лист: скорость по последним точкам, px/мс', () => {
  assert.equal(drag.releaseVelocity([{ y: 100, t: 0 }, { y: 150, t: 50 }, { y: 200, t: 100 }]), 1);
  assert.equal(drag.releaseVelocity([{ y: 100, t: 0 }]), 0);
  assert.equal(drag.releaseVelocity([{ y: 100, t: 5 }, { y: 120, t: 5 }]), 0);
  assert.equal(drag.releaseVelocity([]), 0);
});

test('лист: тянуть за ручку и заголовок — всегда, за тело — только из самого верха', () => {
  const panel = { name: 'panel', parentElement: null, scrollTop: 0, contains: (el) => !!el && el !== null };
  const node = (match, parent, scrollTop = 0) => ({
    parentElement: parent, scrollTop,
    closest: (sel) => (match && sel.split(',').some((s) => s.trim() === match) ? {} : null),
  });
  const body = node(null, panel);
  assert.equal(drag.canDragFrom(node('.sheet__head', panel), panel), true);
  assert.equal(drag.canDragFrom(node('.sheet__close', panel), panel), false);
  assert.equal(drag.canDragFrom(node('[role="spinbutton"]', panel), panel), false);
  assert.equal(drag.canDragFrom(node(null, body), panel), true);
  body.scrollTop = 12;
  assert.equal(drag.canDragFrom(node(null, body), panel), false);
  assert.equal(drag.canDragFrom(null, panel), false);
});

test('вибрация: удар, итог и выбор — своими вызовами плагина', () => {
  calls.length = 0;
  haptic();
  haptic('medium');
  haptic('heavy');
  haptic('success');
  haptic('error');
  haptic('selection');
  haptic('странное');
  assert.deepEqual(calls, [
    ['impact', 'LIGHT'], ['impact', 'MEDIUM'], ['impact', 'HEAVY'],
    ['notification', 'SUCCESS'], ['notification', 'ERROR'], ['selection'], ['impact', 'LIGHT'],
  ]);
});

test('вибрация: без приложения — Telegram, итог через notificationOccurred', () => {
  fake.native = false;
  const tg = [];
  window.Telegram = { WebApp: { HapticFeedback: {
    impactOccurred: (s) => tg.push(['impact', s]),
    notificationOccurred: (s) => tg.push(['notification', s]),
    selectionChanged: () => tg.push(['selection']),
  } } };
  try {
    haptic('light'); haptic('success'); haptic('selection');
    assert.deepEqual(tg, [['impact', 'light'], ['notification', 'success'], ['selection']]);
    delete window.Telegram;
    assert.doesNotThrow(() => haptic('light'));
  } finally {
    fake.native = true;
    delete window.Telegram;
  }
});

test('вибрация: ошибка плагина не выходит наружу', async () => {
  const saved = Object.getOwnPropertyDescriptor(window.Capacitor, 'Plugins');
  Object.defineProperty(window.Capacitor, 'Plugins', { configurable: true, get: () => ({ Haptics: {
    impact: () => Promise.reject(new Error('not implemented')),
    notification: () => { throw new Error('boom'); },
  } }) });
  try {
    assert.doesNotThrow(() => haptic('light'));
    assert.doesNotThrow(() => haptic('success'));
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    Object.defineProperty(window.Capacitor, 'Plugins', saved);
  }
});

test('размер шрифта: обрезается до 0.9–1.3, мусор — обычный', () => {
  assert.equal(zoom.clampZoom(1), 1);
  assert.equal(zoom.clampZoom(1.176), 1.18);
  assert.equal(zoom.clampZoom(2), 1.3);
  assert.equal(zoom.clampZoom(0.82), 0.9);
  assert.equal(zoom.clampZoom(0), 1);
  assert.equal(zoom.clampZoom(undefined), 1);
  assert.equal(zoom.clampZoom('abc'), 1);
});

test('размер шрифта: Android — set плагина, iPhone — -webkit-text-size-adjust у body', async () => {
  calls.length = 0;
  fake.platform = 'android';
  fake.preferred = 1.5;
  assert.equal(await zoom.applyTextZoom(), 1.3);
  assert.deepEqual(calls, [['zoom', 1.3]]);

  calls.length = 0;
  fake.platform = 'ios';
  fake.preferred = 23 / 17;
  assert.equal(await zoom.applyTextZoom(), 1.3);
  assert.equal(document.body.style.webkitTextSizeAdjust, '130%');
  assert.deepEqual(calls, [], 'на iPhone нативного set нет');

  fake.preferred = 1;
  await zoom.applyTextZoom();
  assert.equal(document.body.style.webkitTextSizeAdjust, '100%');
});

test('размер шрифта: в браузере ничего не делает', async () => {
  fake.native = false;
  try {
    assert.equal(await zoom.applyTextZoom(), null);
  } finally {
    fake.native = true;
  }
});
