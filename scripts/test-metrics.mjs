/**
 * Показатели и расходы: экраны рисуются по-настоящему.
 *
 * Сборка таких ошибок не ловит. Забытый импорт в JSX — это не синтаксис, а
 * обращение к несуществующей переменной во время отрисовки: `vite build`
 * проходит, экран падает у человека. Однажды так и вышло, и починка заняла
 * три часа не потому, что была сложной, а потому, что о поломке сказала
 * сборка на GitHub, а не проверка здесь.
 *
 * Поэтому набор компонентов (`ui.jsx`) и значки настоящие, подменены только
 * сеть и вибрация. Всё, что экран показывает и отправляет, проверяется на
 * собранном дереве.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

/* ==========================================================================
 * Сборка экранов с подменённой сетью
 * ========================================================================== */

const output = await build({
  entryPoints: ['scripts/fixtures/metrics-entry.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'metrics-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /useData\.js$/ }, () => ({ path: 'data', namespace: 'metrics-test' }));
      bundle.onResolve({ filter: /[\\/]api\.js$/ }, () => ({ path: 'api', namespace: 'metrics-test' }));
      bundle.onResolve({ filter: /telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'metrics-test' }));

      bundle.onLoad({ filter: /.*/, namespace: 'metrics-test' }, (args) => {
        if (args.path === 'data') return {
          contents: `export const useData = (action, params) => globalThis.__metrics.useData(action, params);`,
        };
        if (args.path === 'api') return {
          contents: `export const apiMutate = (action, params) => globalThis.__metrics.apiMutate(action, params);
            export const apiPublic = async () => ({});
            export const logout = () => {};
            export const apiStale = () => ({ data: null, stale: false, promise: Promise.resolve({}) });`,
        };
        if (args.path === 'telegram') return {
          contents: `export const haptic = () => {};
            export const getThemeMode = () => 'auto';
            export const setThemeMode = (value) => value;
            export const environmentInfo = () => ({ inTelegram: false });`,
        };
        return null;
      });
    },
  }],
});

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);

const { Finance, Processes, Expenses } = module.exports;

/* ==========================================================================
 * Инструменты
 * ========================================================================== */

/**
 * Весь текст одной строкой: ищем по тому, что человек видит.
 *
 * Понимает и отрисованное дерево (у него дети в `children`), и элементы
 * React из `props` (у них — в `props.children`): поле ищется по подписи,
 * которая лежит рядом с ним внутри `label`.
 */
function textOf(node) {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node.children !== undefined) return textOf(node.children);
  if (node.props) return textOf(node.props.children);
  return '';
}

function screenText(tree) {
  return textOf(tree.toJSON()).replace(/\s+/g, ' ');
}

/** Кнопка по подписи для экранного диктора или по видимому тексту */
function button(tree, name) {
  const all = tree.root.findAll(
    (node) => node.type === 'button'
      && (node.props['aria-label'] === name || textOf(node.props.children).trim() === name),
    { deep: true },
  );

  assert.ok(all.length, `не нашлась кнопка «${name}»`);
  return all[0];
}

function press(tree, name) {
  const target = button(tree, name);
  act(() => { target.props.onClick(); });
  return target;
}

function type(tree, label, value) {
  const field = tree.root.findAll((node) => node.type === 'input', { deep: true })
    .find((node) => {
      const wrapper = node.parent;
      return wrapper && textOf(wrapper.props.children).includes(label);
    });

  assert.ok(field, `не нашлось поле «${label}»`);
  act(() => { field.props.onChange({ target: { value } }); });
}

/** Ответ сервера с показателями: только то, что экран действительно читает */
function metrics({ month = '2026-09', now = {}, before = {}, process: proc = {}, processBefore = {} } = {}) {
  const zeroFinance = {
    revenue: 0, expenses: 0, profit: 0, payments: 0, trainings: 0, activeClients: 0,
    bank: 0, averageCheck: null, perTraining: null, perClient: null, topShare: null, bankCover: null,
  };
  const zeroProcess = {
    activeClients: 0, measuredClients: 0, measuredShare: 0, trainings: 0,
    perClient: null, withPlan: 0, planShare: 0, silentClients: 0,
  };

  const [year, m] = month.split('-').map(Number);
  const past = new Date(Date.UTC(year, m - 2, 1));

  return {
    month,
    previousMonth: past.getUTCFullYear() + '-' + String(past.getUTCMonth() + 1).padStart(2, '0'),
    finance: { now: { ...zeroFinance, ...now }, before: { ...zeroFinance, ...before } },
    process: { now: { ...zeroProcess, ...proc }, before: { ...zeroProcess, ...processBefore } },
  };
}

/**
 * Отрисовка экрана.
 *
 * `answer` получает действие и параметры и возвращает данные — так видно,
 * какой месяц экран на самом деле спросил у сервера.
 */
function draw(Screen, answer, { onMutate } = {}) {
  const asked = [];
  const sent = [];

  globalThis.__metrics = {
    useData(action, params) {
      asked.push({ action, params });
      return { loading: false, data: answer(action, params), error: null, reload() {} };
    },
    apiMutate(action, params) {
      sent.push({ action, params });
      return Promise.resolve((onMutate && onMutate(action, params)) || {});
    },
  };

  let tree;
  act(() => { tree = renderer.create(React.createElement(Screen)); });

  return { tree, asked, sent };
}

/* ==========================================================================
 * Финансы
 * ========================================================================== */

test('прибыль стоит крупно, а выручка и расходы — рядом', () => {
  const { tree } = draw(Finance, () => metrics({
    now: { revenue: 336400, expenses: 96000, profit: 240400, payments: 23, trainings: 178 },
    before: { revenue: 300000, expenses: 96000, profit: 204000 },
  }));

  const text = screenText(tree);

  assert.match(text, /Прибыль · Сентябрь 2026/);
  assert.match(text, /240 400 ₽/);
  assert.match(text, /336 400 ₽/, 'выручка');
  assert.match(text, /96 000 ₽/, 'расходы');
});

/**
 * Касса — не выручка: это оплаты, которые ещё предстоит отработать.
 * Сводка однажды показывала их выручкой, и на экране клиентов за тот же
 * месяц стояла другая цифра.
 */
test('касса стоит отдельно от выручки', () => {
  const { tree } = draw(Finance, () => metrics({
    now: { revenue: 216850, expenses: 62000, profit: 154850, cash: 155000, payments: 6, trainings: 89 },
    before: { revenue: 200000, expenses: 62000, profit: 138000, cash: 90000 },
  }));

  const text = screenText(tree);

  assert.match(text, /154 850 ₽/, 'прибыль — выручка минус расходы');
  assert.match(text, /Касса за месяц/);
  assert.match(text, /155 000 ₽/);
});

/** Число без сравнения ничего не значит — за этим сюда и приходят */
test('изменение к прошлому месяцу видно рядом с цифрой', () => {
  const { tree } = draw(Finance, () => metrics({
    now: { revenue: 100000, profit: 100000 },
    before: { revenue: 80000, profit: 80000 },
  }));

  assert.match(screenText(tree), /\+20 000 ₽ к прошлому месяцу/);
});

test('месяц без данных не показывает NaN и бесконечность', () => {
  const { tree } = draw(Finance, () => metrics());
  const text = screenText(tree);

  assert.ok(!/NaN|Infinity|undefined|null/.test(text), 'в тексте экрана: ' + text);
  assert.match(text, /оплат не было/, 'прочерк объясняется, а не молчит');
  assert.match(text, /столько же, сколько месяцем раньше/);
});

test('убыток помечен тревожным, а не зелёным', () => {
  const { tree } = draw(Finance, () => metrics({ now: { revenue: 10000, expenses: 30000, profit: -20000 } }));

  const lead = tree.root.findAll((node) => typeof node.type === 'string'
    && String(node.props.className || '').includes('lead--'), { deep: true })[0];

  assert.match(lead.props.className, /lead--critical/);
});

/* ==========================================================================
 * Месяц
 * ========================================================================== */

test('шаг назад спрашивает у сервера прошлый месяц', () => {
  const { tree, asked } = draw(Finance, () => metrics({ month: '2026-09' }));

  press(tree, 'Предыдущий месяц');

  assert.equal(asked[asked.length - 1].params.month, '2026-08');
});

/**
 * Вперёд за текущий месяц не пускаем: там заведомо нули, и человек решит,
 * что приложение сломалось.
 */
test('дальше текущего месяца не уйти', () => {
  const now = new Date();
  const current = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const { tree, asked } = draw(Finance, () => metrics({ month: current }));

  assert.equal(button(tree, 'Следующий месяц').props.disabled, true);

  const before = asked.length;
  press(tree, 'Следующий месяц');
  assert.equal(asked.length, before, 'запроса не случилось');
});

/* ==========================================================================
 * Процессы
 * ========================================================================== */

test('процессы показывают доли и тех, кто пропал', () => {
  const { tree } = draw(Processes, () => metrics({
    process: {
      activeClients: 20, measuredClients: 12, measuredShare: 60, trainings: 178,
      perClient: 8.9, withPlan: 18, planShare: 90, silentClients: 3,
    },
    processBefore: { activeClients: 18, measuredClients: 9, measuredShare: 50, trainings: 150 },
  }));

  const text = screenText(tree);

  assert.match(text, /Тренировок · Сентябрь 2026/);
  assert.match(text, /по 8,9 на клиента/);
  assert.match(text, /60%/, 'доля с замером');
  assert.match(text, /90%/, 'доля с программой');
  assert.match(text, /Не приходили месяц/);
});

test('пустые процессы не врут про долю', () => {
  const { tree } = draw(Processes, () => metrics());
  const text = screenText(tree);

  assert.ok(!/NaN|Infinity|undefined/.test(text), 'в тексте экрана: ' + text);
  assert.match(text, /занятий в этом месяце ещё не было/);
});

/* ==========================================================================
 * Расходы
 * ========================================================================== */

const EXPENSES = {
  month: '2026-09',
  total: 15000,
  categories: ['Аренда зала', 'Реклама'],
  expenses: [
    { id: 1, spent_at: '2026-09-01', category: 'Аренда зала', amount: 12000, note: null },
    { id: 2, spent_at: '2026-09-15', category: 'Реклама', amount: 3000, note: 'таргет' },
  ],
};

test('расходы показаны списком с итогом', () => {
  const { tree } = draw(Expenses, () => EXPENSES);
  const text = screenText(tree);

  assert.match(text, /Расходы · Сентябрь 2026/);
  assert.match(text, /15 000 ₽/, 'итог');
  assert.match(text, /Аренда зала/);
  assert.match(text, /таргет/, 'заметка видна');
  assert.match(text, /2 записи/);
});

test('пустой месяц объясняет, что сюда вписывать', () => {
  const { tree } = draw(Expenses, () => ({ ...EXPENSES, total: 0, expenses: [] }));

  assert.match(screenText(tree), /Впишите аренду, рекламу/);
});

test('новый расход уходит на сервер тем, что набрали', () => {
  const { tree, sent } = draw(Expenses, () => EXPENSES);

  type(tree, 'Статья', 'Гантели');
  type(tree, 'Сумма', '7 500');
  press(tree, 'Записать');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, 'expense.create');
  assert.equal(sent[0].params.category, 'Гантели');
  assert.equal(sent[0].params.amount, '7 500');
  assert.match(sent[0].params.spentAt, /^\d{4}-\d{2}-\d{2}$/, 'дата подставлена сама');
});

/** Пустую трату не отправляем: сервер откажет, а человек получит красное */
test('без статьи и суммы кнопка не работает', () => {
  const { tree, sent } = draw(Expenses, () => EXPENSES);

  assert.equal(button(tree, 'Записать').props.disabled, true);

  type(tree, 'Статья', 'Гантели');
  assert.equal(button(tree, 'Записать').props.disabled, true, 'суммы всё ещё нет');

  assert.equal(sent.length, 0);
});

/**
 * Удаление спрашивает на месте. Окно браузера здесь запрещено: в
 * приложении с домашнего экрана оно выглядит чужим, а в отдельных случаях
 * и вовсе подвешивает страницу.
 */
test('удаление сначала спрашивает', () => {
  const { tree, sent } = draw(Expenses, () => EXPENSES);

  press(tree, 'Удалить расход «Реклама»');
  assert.equal(sent.length, 0, 'один нажатие корзины ничего не удаляет');

  press(tree, 'Удалить');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, 'expense.delete');
  assert.equal(sent[0].params.id, 2);
});

test('от удаления можно отказаться', () => {
  const { tree, sent } = draw(Expenses, () => EXPENSES);

  press(tree, 'Удалить расход «Реклама»');
  press(tree, 'Отмена');

  assert.equal(sent.length, 0);
  assert.ok(button(tree, 'Удалить расход «Реклама»'), 'корзина вернулась на место');
});

test('другой месяц спрашивается у сервера', () => {
  const { tree, asked } = draw(Expenses, () => EXPENSES);

  const months = tree.root.findAll(
    (node) => node.type === 'button' && String(node.props.className || '').includes('chip'),
    { deep: true },
  );

  assert.ok(months.length >= 6, 'выбор из последних месяцев');
  act(() => { months[1].props.onClick(); });

  assert.notEqual(asked[asked.length - 1].params.month, asked[0].params.month);
});
