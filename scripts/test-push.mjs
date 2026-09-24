/**
 * Уведомления: включить, выключить, включить снова.
 *
 * Выключение не работало, и причина была не там, где её искали. Отписка
 * на устройстве и на сервере проходила исправно — врала кнопка: она
 * читала разрешение браузера, а разрешение, однажды выданное, обратно не
 * забирается. После «выключить» оно так и оставалось `granted`, кнопка
 * по-прежнему говорила «выключить», человек видел, что ничего не
 * произошло, — и включить обратно было уже нечем.
 *
 * Поэтому здесь проверяется полный круг и на настоящем `push.js`:
 * подменены только браузер и сеть.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/* ==========================================================================
 * Поддельный браузер
 * ========================================================================== */

/**
 * Подписка живёт на устройстве и переживает перезагрузку страницы —
 * ровно как настоящая. Её наличие и есть то состояние, о котором спорит
 * эта проверка.
 */
function makeBrowser({ permission = 'default', subscribed = false, standalone = false } = {}) {
  const browser = {
    permission,
    subscription: subscribed ? { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }) } : null,
    asked: 0,
    unsubscribed: 0,
    registered: true,
  };

  const pushManager = {
    async getSubscription() { return browser.subscription; },
    async subscribe() {
      browser.subscription = {
        endpoint: 'https://push.example/abc',
        toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
        unsubscribe: async () => { browser.unsubscribed += 1; browser.subscription = null; return true; },
      };
      browser.subscription.unsubscribe = async () => {
        browser.unsubscribed += 1;
        browser.subscription = null;
        return true;
      };
      return browser.subscription;
    },
  };

  if (browser.subscription) {
    browser.subscription.unsubscribe = async () => {
      browser.unsubscribed += 1;
      browser.subscription = null;
      return true;
    };
  }

  const registration = { pushManager };

  globalThis.window = {
    matchMedia: () => ({ matches: standalone }),
    navigator: { standalone },
    PushManager: function PushManager() {},
    Notification: true,
  };

  globalThis.Notification = {
    get permission() { return browser.permission; },
    async requestPermission() {
      browser.asked += 1;
      if (browser.permission === 'default') browser.permission = 'granted';
      return browser.permission;
    },
  };

  // В Node у `navigator` только геттер, простым присваиванием его не
  // подменить — отсюда defineProperty.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      standalone,
      serviceWorker: {
        async getRegistration() { return browser.registered ? registration : undefined; },
        get ready() { return Promise.resolve(registration); },
      },
    },
  });

  return browser;
}

/* ==========================================================================
 * Сборка настройки с подменённой сетью
 * ========================================================================== */

const output = await build({
  entryPoints: ['src/PushSetting.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'push-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /[\\/]api\.js$/ }, () => ({ path: 'api', namespace: 'push-test' }));
      bundle.onResolve({ filter: /session\.js$/ }, () => ({ path: 'session', namespace: 'push-test' }));
      bundle.onResolve({ filter: /[\\/]ui\.jsx$/ }, () => ({ path: 'ui', namespace: 'push-test' }));

      bundle.onLoad({ filter: /.*/, namespace: 'push-test' }, (args) => {
        if (args.path === 'api') return {
          contents: `export const apiPublic = (action, params) => globalThis.__push.call(action, params);
            export const apiMutate = (action, params) => globalThis.__push.call(action, params);`,
        };
        if (args.path === 'session') return { contents: `export const describeDevice = () => 'Android · Chrome';` };
        if (args.path === 'ui') return { loader: 'jsx', contents: `import React from 'react'; export const Panel=({children})=><div>{children}</div>;` };
        return null;
      });
    },
  }],
});

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);
const PushSetting = module.exports.default;

/* ==========================================================================
 * Инструменты
 * ========================================================================== */

function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node.children !== undefined) return textOf(node.children);
  if (node.props) return textOf(node.props.children);
  return '';
}

const screen = (tree) => textOf(tree.toJSON()).replace(/\s+/g, ' ');

function buttons(tree) {
  return tree.root.findAll((node) => node.type === 'button', { deep: true });
}

/** Ждём, пока доедут обещания: состояние настройки читается асинхронно */
async function settle(times = 10) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function open({ browser, onCall } = {}) {
  const calls = [];
  globalThis.__push = {
    call(action, params) {
      calls.push({ action, params });

      // Ответ проверки важнее умолчания: иначе не подделать сервер, у
      // которого уведомления не настроены.
      const answer = onCall && onCall(action, params);
      if (answer) return Promise.resolve(answer);

      if (action === 'push.key') {
        return Promise.resolve({ enabled: true, publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' });
      }
      return Promise.resolve({});
    },
  };

  let tree;
  await act(async () => { tree = renderer.create(React.createElement(PushSetting, {})); });
  await settle();

  return { tree, calls, browser };
}

async function press(tree, label) {
  const target = buttons(tree).find((node) => textOf(node.props.children).includes(label));
  assert.ok(target, `не нашлась кнопка «${label}», на экране: ${screen(tree)}`);

  await act(async () => { target.props.onClick(); });
  await settle();
}

/* ==========================================================================
 * Полный круг
 * ========================================================================== */

test('включить — выключить — включить снова', async () => {
  const browser = makeBrowser();
  const { tree, calls } = await open({ browser });

  assert.match(screen(tree), /Включить уведомления/, 'сначала выключены');

  await press(tree, 'Включить уведомления');

  assert.equal(browser.asked, 1, 'разрешение спросили по нажатию, а не само');
  assert.ok(calls.some((c) => c.action === 'push.subscribe'), 'подписка ушла на сервер');
  assert.match(screen(tree), /Выключить на этом устройстве/);
  assert.match(screen(tree), /Сейчас включены на этом устройстве/);

  await press(tree, 'Выключить');

  assert.equal(browser.unsubscribed, 1, 'устройство отписалось');
  assert.ok(calls.some((c) => c.action === 'push.unsubscribe'), 'сервер узнал об отписке');
  assert.match(
    screen(tree),
    /Включить уведомления/,
    'ГЛАВНОЕ: кнопка вернулась во «включить». Разрешение осталось выданным, и раньше она этого не замечала',
  );

  await press(tree, 'Включить уведомления');

  assert.match(screen(tree), /Выключить на этом устройстве/, 'включается обратно');
  assert.equal(
    calls.filter((c) => c.action === 'push.subscribe').length,
    2,
    'новая подписка снова уехала на сервер: прежнюю он удалил',
  );
});

test('уже подписанное устройство открывается выключателем, а не предложением включить', async () => {
  const browser = makeBrowser({ permission: 'granted', subscribed: true });
  const { tree } = await open({ browser });

  assert.match(screen(tree), /Выключить на этом устройстве/);
  assert.doesNotMatch(screen(tree), /Включить уведомления/);
});

/**
 * Разрешение, однажды выданное и снятое человеком в настройках браузера,
 * приложению не вернуть. Кнопка здесь врала бы дважды: обещала бы то,
 * чего не может, и оставляла бы виноватым приложение.
 */
test('при запрете показываем причину, а не бесполезную кнопку', async () => {
  const browser = makeBrowser({ permission: 'denied' });
  const { tree } = await open({ browser });

  assert.match(screen(tree), /запрещены для этого сайта/);
  assert.equal(buttons(tree).length, 0);
});

test('отказ сервера не оставляет настройку включённой', async () => {
  const browser = makeBrowser();
  const { tree } = await open({
    browser,
    onCall: (action) => {
      if (action === 'push.key') return { enabled: false, publicKey: '' };
      return {};
    },
  });

  await press(tree, 'Включить уведомления');

  assert.match(screen(tree), /не настроены на сервере/);
  assert.match(screen(tree), /Включить уведомления/, 'кнопка осталась предложением включить');
});

/**
 * Сервер мог не ответить, но человек нажал «выключить», и уведомления
 * обязаны прекратиться. Запись на сервере станет мёртвой — он уберёт её
 * сам при первой отправке, получив от службы доставки отказ.
 */
test('недоступный сервер не мешает выключить на устройстве', async () => {
  const browser = makeBrowser({ permission: 'granted', subscribed: true });
  const { tree } = await open({
    browser,
    onCall: (action) => {
      if (action === 'push.unsubscribe') throw new Error('сети нет');
      return {};
    },
  });

  await press(tree, 'Выключить');

  assert.equal(browser.unsubscribed, 1);
  assert.match(screen(tree), /Включить уведомления/);
});

/** На iPhone без установки на домашний экран пушей нет — об этом надо сказать */
test('на iPhone из браузера объясняем, что сначала нужно установить приложение', async () => {
  const browser = makeBrowser();
  globalThis.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

  const { tree } = await open({ browser });

  assert.match(screen(tree), /на экран «Домой»/);
  assert.equal(buttons(tree).length, 0);
});
