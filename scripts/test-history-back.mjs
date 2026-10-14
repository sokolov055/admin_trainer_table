import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryGuard } from '../src/history-back.js';

/**
 * Back браузера по стопке «назад» (FT-567, src/history-back.js).
 *
 * Пока в приложении открыт экран с «назад», в истории ровно одна наша
 * запись: Back браузера закрывает верхний экран, а не уводит со страницы.
 * Закрыли экран кнопкой в приложении — запись убираем сами, иначе
 * следующий Back браузера тратился бы впустую.
 */

// С запасом: на Windows таймеры идут шагами по ~15 мс
const tick = () => new Promise((r) => setTimeout(r, 50));

function fakeWindow() {
  const listeners = new Set();
  const entries = [{ state: null }];
  let at = 0;
  const calls = { push: 0, back: 0 };
  const fire = () => listeners.forEach((fn) => fn({ state: entries[at].state }));
  const win = {
    setTimeout, clearTimeout,
    addEventListener: (type, fn) => { if (type === 'popstate') listeners.add(fn); },
    removeEventListener: (type, fn) => listeners.delete(fn),
    history: {
      get state() { return entries[at].state; },
      get length() { return entries.length; },
      pushState(state) { calls.push += 1; entries.splice(at + 1); entries.push({ state }); at += 1; },
      // Как в браузере: переход асинхронный, popstate — потом
      back() { calls.back += 1; if (at === 0) return; at -= 1; setTimeout(fire, 0); },
      forward() { if (at === entries.length - 1) return; at += 1; setTimeout(fire, 0); },
    },
  };
  return { win, calls, where: () => at };
}

test('экран с «назад» ставит одну запись, Back браузера закрывает его', async () => {
  const { win, calls, where } = fakeWindow();
  const stack = [];
  const guard = createHistoryGuard({ win, size: () => stack.length, onBack: () => stack.pop() });
  await tick();
  assert.equal(calls.push, 0, 'на главном экране история не трогается');

  stack.push('menu'); guard.schedule(); await tick();
  assert.equal(calls.push, 1);
  assert.equal(where(), 1);

  win.history.back(); await tick();
  assert.deepEqual(stack, [], 'Back браузера = «назад» приложения');
  assert.equal(calls.push, 1, 'под ним ничего нет — новую запись не ставим');
  guard.stop();
});

test('два экрана друг на друге: Back закрывает верхний и ставит запись снова', async () => {
  const { win, calls } = fakeWindow();
  const stack = ['card', 'journal'];
  const guard = createHistoryGuard({ win, size: () => stack.length, onBack: () => stack.pop() });
  await tick();
  assert.equal(calls.push, 1);
  win.history.back(); await tick();
  assert.deepEqual(stack, ['card']);
  assert.equal(calls.push, 2, 'остался экран — Back браузера снова должен закрыть его');
  win.history.back(); await tick();
  assert.deepEqual(stack, []);
  guard.stop();
});

test('закрыли кнопкой в приложении — запись убирается без лишнего «назад»', async () => {
  const { win, calls, where } = fakeWindow();
  const stack = ['settings'];
  let backs = 0;
  const guard = createHistoryGuard({ win, size: () => stack.length, onBack: () => { backs += 1; stack.pop(); } });
  await tick();
  stack.pop(); guard.schedule(); await tick();
  assert.equal(calls.back, 1);
  assert.equal(where(), 0);
  assert.equal(backs, 0, 'свой history.back() не считается нажатием Back');
  guard.stop();
});

test('экран сменился на другой в одном кадре — история не дёргается', async () => {
  const { win, calls } = fakeWindow();
  const stack = ['expenses'];
  const guard = createHistoryGuard({ win, size: () => stack.length, onBack: () => stack.pop() });
  await tick();
  stack.pop(); guard.schedule();
  stack.push('settings'); guard.schedule();
  await tick();
  assert.equal(calls.push, 1);
  assert.equal(calls.back, 0);
  guard.stop();
});

test('перезагрузка на нашей записи при пустой стопке — запись снимается', async () => {
  const { win, calls } = fakeWindow();
  win.history.pushState({ ftBack: true }, '');
  calls.push = 0;
  const guard = createHistoryGuard({ win, size: () => 0, onBack: () => assert.fail('не должен вызываться') });
  await tick(); await tick();
  assert.equal(calls.back, 1);
  assert.equal(calls.push, 0);
  guard.stop();
});
