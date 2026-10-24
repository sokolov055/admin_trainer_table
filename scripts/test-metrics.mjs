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
      // Лист целей рисуется порталом в document.body — в проверке тела нет,
      // и портал заменён на «нарисовать на месте»
      bundle.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom', namespace: 'metrics-test' }));

      bundle.onLoad({ filter: /.*/, namespace: 'metrics-test' }, (args) => {
        if (args.path === 'data') return {
          contents: `export const useData = (action, params) => globalThis.__metrics.useData(action, params);`,
        };
        if (args.path === 'api') return {
          contents: `export const apiMutate = (action, params) => globalThis.__metrics.apiMutate(action, params);
            export const apiPrimary = async () => ({});
            export const apiWait=()=>new Promise(()=>{}); export const apiPublic = async () => ({});
            export const apiFresh = async () => ({ data: {}, offline: false, at: 0 });
            export const apiStoredAt = () => 0;
            export const logout = () => {};
            export const apiStale = () => ({ data: null, stale: false, promise: Promise.resolve({}) });`,
        };
        if (args.path === 'react-dom') return { contents: 'export const createPortal = (node) => node; export const flushSync = (fn) => fn();' };
        if (args.path === 'telegram') return {
          contents: `export const haptic = () => {};
            export const getInitData = () => '';
            export const getThemeMode = () => 'auto';
            export const setThemeMode = (value) => value;
            export const environmentInfo = () => ({ inTelegram: false });`,
        };
        return null;
      });
    },
  }],
});

// Лист (Sheet) трогает document и window: фокус, блокировка прокрутки,
// Escape. Здесь их нет — подставляем ровно столько, чтобы он нарисовался
const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, scrollTop: 0, focus: noop, contains: () => false, querySelector: () => null, getBoundingClientRect: () => ({ top: 0, height: 0 }) });
globalThis.document = { activeElement: null, addEventListener: noop, removeEventListener: noop, body: el(), documentElement: el(), querySelector: () => null, querySelectorAll: () => [] };
globalThis.window = { addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: true, addEventListener: noop, removeEventListener: noop }), scrollY: 0, scrollTo: noop, innerHeight: 800, innerWidth: 390, visualViewport: null, history: { state: null, pushState: noop, back: noop }, location: { hash: '' }, requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: noop, setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a) };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = noop;

const module = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + output.outputFiles[0].text + '\n})')(
  createRequire(import.meta.url), module, module.exports,
);

const { Finance, Clients, Processes, Expenses, Dashboard, resetPeriod, useLeaveGuard } = module.exports;

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
function metrics({ month = '2026-09', now = {}, before = {}, clients = {}, clientsBefore = {}, process: proc = {}, processBefore = {}, marketing = {}, development = {} } = {}) {
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
    clients: { now: { ...zeroClients, ...clients }, before: { ...zeroClients, ...clientsBefore } },
    process: { now: { ...zeroProcess, ...proc }, before: { ...zeroProcess, ...processBefore } },
    marketing: { now: { ...zeroMarketing, ...marketing }, before: { ...zeroMarketing } },
    development: { now: { ...zeroDevelopment, ...development }, before: { ...zeroDevelopment } },
  };
}

const zeroMarketing = { newClients: 0, referral: 0, gym: 0, club: 0, social: 0, site: 0, other: 0, unknown: 0, referralShare: null };
const zeroDevelopment = { learningHours: 0, learningEntries: 0, ownWorkouts: 0 };

const zeroClients = { active: 0, newClients: 0, retained: 0, lost: 0, retention: null, renewals: 0, newPayers: 0 };

/**
 * Отрисовка экрана.
 *
 * `answer` получает действие и параметры и возвращает данные — так видно,
 * какой месяц экран на самом деле спросил у сервера.
 */
function draw(Screen, answer, { onMutate, props } = {}) {
  resetPeriod();
  const asked = [];
  const charted = [];
  const sent = [];
  const stats = [];

  globalThis.__metrics = {
    useData(action, params) {
      // График просит свой ряд отдельным запросом. В сводке его не
      // считаем: проверки смотрят, какой ПЕРИОД спросили у сервера.
      if (action === 'trainer.metrics.series') {
        charted.push(params);
        const series = answer(action, params);
        return {
          loading: false,
          data: series && series.points ? series : { by: params.by, points: [] },
          error: null,
          reload() {},
        };
      }
      // Сверка денег (LedgerCheck) о периоде не спрашивает — не считаем
      if (action === 'trainer.ledger') return { loading: false, data: null, error: null, reload() {} };
      // Журнал обучения — свой запрос по месяцу
      if (action === 'trainer.learning.list') {
        const data = answer(action, params);
        return { loading: false, data: data && data.entries ? data : { month: params.month, entries: [], hours: 0 }, error: null, reload() {} };
      }
      // Кто отменяет (ScheduleStats) — свой запрос с границами периода
      if (action === 'trainer.schedule.stats') {
        stats.push(params);
        const data = answer(action, params);
        return { loading: false, data: data && data.total ? data : null, error: null, reload() {} };
      }
      asked.push({ action, params });
      return { loading: false, data: answer(action, params), error: null, reload() {} };
    },
    apiMutate(action, params) {
      sent.push({ action, params });
      return Promise.resolve((onMutate && onMutate(action, params)) || {});
    },
  };

  let tree;
  act(() => { tree = renderer.create(React.createElement(Screen, props || {})); });

  return { tree, asked, sent, charted, stats };
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
  // Экран открывается на текущем месяце — прошлый считаем от сегодня: с
  // зашитым «2026-09» тест сломался первого октября (01.10.2026)
  const now = new Date();
  const current = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const back = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  const previous = back.getUTCFullYear() + '-' + String(back.getUTCMonth() + 1).padStart(2, '0');
  const { tree, asked } = draw(Finance, () => metrics({ month: current }));

  press(tree, 'Предыдущий месяц');

  assert.equal(asked[asked.length - 1].params.month, previous);
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

/**
 * Сентябрь к августу врёт про сезон, поэтому месяц можно сравнить и с тем
 * же месяцем год назад. Выбор уходит на сервер, подпись меняется вместе
 * с ним.
 */
test('месяц сравнивается с тем же месяцем год назад', () => {
  const { tree, asked } = draw(Finance, (action, params) => ({
    ...metrics({ now: { profit: 100000 }, before: { profit: 80000 } }),
    ...(params.compare === 'year' ? { compare: 'year', previousMonth: '2025-09' } : {}),
  }));

  press(tree, 'К году назад');

  assert.equal(asked[asked.length - 1].params.compare, 'year');
  const text = screenText(tree);
  assert.match(text, /\+20 000 ₽ к сентябрю 2025/);
  assert.match(text, /изменение к сентябрю 2025/);
});

/**
 * Год сравнивается с прошлым, а текущий — с теми же месяцами прошлого:
 * иначе каждый год до декабря выглядел бы падением.
 */
test('год сравнивается с прошлым, текущий — с теми же месяцами', () => {
  const year = (data) => ({
    year: 2026, previousYear: 2025, throughMonth: 9,
    finance: { now: { ...data.finance.now, profit: 900000 }, before: { ...data.finance.before, profit: 700000 } },
    process: data.process,
  });

  const { tree, asked } = draw(Finance, (action, params) => (params.year ? year(metrics()) : metrics()));

  press(tree, 'Год');

  assert.deepEqual(asked[asked.length - 1].params, { year: new Date().getFullYear() });

  const text = screenText(tree);
  assert.match(text, /Прибыль · 2026/);
  assert.match(text, /\+200 000 ₽ к 2025 году/);
  assert.match(text, /изменение к 2025 году \(январь — сентябрь\)/);
  assert.match(text, /Касса за год/);
  assert.doesNotMatch(text, /К году назад/, 'у года способ сравнения один');
});

test('выбранный период сохраняется при переходе на процессы', () => {
  const answer = (action, params) => (params.year
    ? { year: 2026, previousYear: 2025, throughMonth: 9, ...metrics() }
    : metrics());

  const first = draw(Finance, answer);
  press(first.tree, 'Год');

  // Второй экран открываем без сброса — как переход по вкладке
  const asked = [];
  globalThis.__metrics.useData = (action, params) => {
    asked.push(params);
    return { loading: false, data: answer(action, params), error: null, reload() {} };
  };
  let tree;
  act(() => { tree = renderer.create(React.createElement(Processes)); });

  assert.equal(asked[0].year, new Date().getFullYear());
  assert.match(screenText(tree), /Тренировок · 2026/);
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
  assert.match(text, /занятий за этот период ещё не было/);
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
/**
 * Удаление — как в списках iPhone: смахнули и нажали «Удалить» (или
 * протянули до конца) — строка пропадает сразу, а на сервер уходит через
 * несколько секунд, если не нажали «Вернуть». Вопроса «Удалить?» нет.
 */
test('удалённый расход пропадает сразу, а на сервер уходит не сразу', async () => {
  const { tree, sent } = draw(Expenses, () => EXPENSES);

  press(tree, 'Удалить расход «Реклама»');
  await act(async () => {});

  assert.equal(sent.length, 0, 'пока можно вернуть — на сервер не отправлено');
  const left = tree.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === 'Удалить расход «Реклама»', { deep: true });
  assert.equal(left.length, 0, 'строки уже нет');
  assert.ok(button(tree, 'Удалить расход «Аренда зала»'), 'соседние на месте');
});

test('ушли с экрана — удаление не теряется, а уходит на сервер', async () => {
  const { tree, sent } = draw(Expenses, () => EXPENSES);

  press(tree, 'Удалить расход «Реклама»');
  await act(async () => {});
  act(() => { tree.unmount(); });
  await act(async () => {});

  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, 'expense.delete');
  assert.equal(sent[0].params.id, 2);
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

/**
 * Цифровая клавиатура — только у суммы. Общее поле по умолчанию цифровое,
 * и статья с заметкой открывали на телефоне цифры вместо букв.
 */
test('в расходе цифровая клавиатура только у суммы', () => {
  const { tree } = draw(Expenses, () => ({ month: '2026-09', total: 0, count: 0, items: [], categories: [] }));

  const modes = Object.fromEntries(
    tree.root.findAll((node) => node.type === 'input', { deep: true })
      .map((input) => [textOf(input.parent.props.children).trim(), input.props.inputMode]),
  );

  assert.equal(modes['Сумма, ₽'], 'decimal');
  assert.equal(modes['Статья'], 'text');
  assert.equal(modes['Заметка'], 'text');
});

/**
 * С 24.10.2026 общее поле по умолчанию буквенное (аудит: имя участника
 * сплита набиралось на цифрах). Обратная ошибка хуже: вес или цена на
 * буквенной клавиатуре. Каждое поле из ui.jsx с числом в подписи обязано
 * просить цифры само.
 */
test('у каждого числового Field явная цифровая клавиатура', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.jsx$/.test(entry.name)) files.push(full);
    }
  };
  await walk('src');
  const numeric = /кг|, см|₽|%|лет|дней|минут|порций|клиентов|сборка|сумма|цена|часов|возраст|рост/i;
  const missing = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    // Своё поле у питания (FoodField / diary-ui) — там клавиатура задаётся иначе
    if (!/import\s*\{[^}]*\bField\b[^}]*\}\s*from\s*'\.\.?\/(\.\.\/)?ui\.jsx'/.test(text)) continue;
    for (const match of text.matchAll(/<Field\b([\s\S]*?)\/>/g)) {
      const props = match[1];
      if (/\btype="(date|time)"/.test(props)) continue;
      const label = (props.match(/label=("[^"]*"|\{[^\n]*\})/) || [])[1] || '';
      if (numeric.test(label) && !/inputMode=/.test(props)) missing.push(file + ': ' + label);
    }
  }
  assert.deepEqual(missing, []);
});

/**
 * Правка шаблона или события с несохранённым (аудит 24.10.2026): «назад»
 * не закрывает молча, а спрашивает на месте; без изменений — закрывает сразу.
 */
test('выход из правки с несохранённым спрашивает «Выйти без сохранения?»', () => {
  let closed = 0;
  let guard = null;
  function Probe({ dirty }) {
    guard = useLeaveGuard(dirty, () => { closed += 1; });
    return React.createElement('div', null, guard.confirm);
  }
  let tree;
  act(() => { tree = renderer.create(React.createElement(Probe, { dirty: false })); });
  act(() => { guard.leave(); });
  assert.equal(closed, 1, 'без изменений — сразу');

  act(() => { tree.update(React.createElement(Probe, { dirty: true })); });
  act(() => { guard.leave(); });
  assert.equal(closed, 1, 'с изменениями не закрылось');
  assert.match(screenText(tree), /Выйти без сохранения\?/);

  act(() => { button(tree, 'Остаться').props.onClick(); });
  assert.doesNotMatch(screenText(tree), /Выйти без сохранения/);
  assert.equal(closed, 1);

  act(() => { guard.leave(); });
  act(() => { button(tree, 'Выйти').props.onClick(); });
  assert.equal(closed, 2, '«Выйти» закрывает');
});

/* ==========================================================================
 * График сводки
 * ========================================================================== */

/** Ряд для графика: выручка по трём месяцам — рост, потом падение */
function series(by = 'month') {
  const point = (key, revenue, extra = {}) => ({
    key,
    label: key,
    partial: false,
    finance: { profit: revenue - 62000, revenue, expenses: 62000, cash: 0, trainings: 0 },
    process: { trainings: 10, perClient: 1 },
    ...extra,
  });

  return {
    by,
    points: [
      point('2026-07', 200000),
      point('2026-08', 340000),
      point('2026-09', 216850, { partial: true }),
    ],
  };
}

const answerWithSeries = (action, params) => (action === 'trainer.metrics.series'
  ? series(params.by)
  : metrics({ now: { revenue: 216850, profit: 154850 }, before: { revenue: 340000, profit: 278000 } }));

const barsOf = (tree) => tree.root.findAll(
  (node) => node.type === 'path' && String(node.props.className || '').includes('bars__bar'),
  { deep: true },
);

test('график показывает прибыль, пока не выбрали другое', () => {
  const { tree } = draw(Finance, answerWithSeries);

  const title = tree.root.find((node) => node.props.className === 'chart-card__title');
  assert.equal(textOf(title.props.children), 'Прибыль');
});

/**
 * Как на бирже: зелёный — стало лучше, красный — хуже. Первый столбик
 * сравнить не с чем. Падение рисуется ещё и «пустым» — это отдельный
 * класс, а не только цвет.
 */
test('рост зелёный, падение красное, первый столбик нейтральный', () => {
  const { tree } = draw(Finance, answerWithSeries);
  const kinds = barsOf(tree).map((bar) => bar.props.className.match(/bars__bar--(up|down|flat)/)[1]);

  assert.deepEqual(kinds, ['flat', 'up', 'down']);
});

test('нажатие на строку переводит на неё график', () => {
  const { tree } = draw(Finance, answerWithSeries);

  const revenue = tree.root.findAll(
    (node) => node.type === 'button' && textOf(node.props.children).startsWith('Выручка'),
    { deep: true },
  )[0];
  act(() => { revenue.props.onClick(); });

  const title = tree.root.find((node) => node.props.className === 'chart-card__title');
  assert.equal(textOf(title.props.children), 'Выручка');
});

/** У расходов рост — плохо: столбик роста расходов красный */
test('у расходов рост красный', () => {
  const answer = (action, params) => {
    if (action !== 'trainer.metrics.series') return metrics();
    const data = series(params.by);
    data.points[1].finance.expenses = 90000;
    return data;
  };
  const { tree } = draw(Finance, answer);

  const expenses = tree.root.findAll(
    (node) => node.type === 'button' && textOf(node.props.children).startsWith('Расходы'),
    { deep: true },
  )[0];
  act(() => { expenses.props.onClick(); });

  const kinds = barsOf(tree).map((bar) => bar.props.className.match(/bars__bar--(up|down|flat)/)[1]);
  assert.equal(kinds[1], 'down', '62 000 → 90 000 — это хуже');
});

test('разбивка графика по кварталам уходит на сервер', () => {
  const { tree, charted } = draw(Finance, answerWithSeries);

  press(tree, 'Квартал');

  assert.equal(charted[charted.length - 1].by, 'quarter');
});

/**
 * «Оплачено вперёд» — цифра на сегодня, истории у неё нет: строка не
 * кнопка, иначе график из одинаковых столбиков сбил бы с толку.
 */
test('цифры «на сегодня» на график не переключают', () => {
  const { tree } = draw(Finance, answerWithSeries);

  const clickable = tree.root.findAll(
    (node) => node.type === 'button' && textOf(node.props.children).startsWith('Оплачено вперёд'),
    { deep: true },
  );
  assert.equal(clickable.length, 0);
  assert.match(screenText(tree), /Долг перед клиентами/);
  assert.doesNotMatch(screenText(tree), /В банке|Хватит месяцев/);
});

test('идущий период подписан, чтобы не читаться провалом', () => {
  const { tree } = draw(Finance, answerWithSeries);
  assert.match(screenText(tree), /ещё идёт, данные неполные/);
});

/* ==========================================================================
 * Клиенты
 * ========================================================================== */

test('клиенты: удержание словами, новые и ушедшие рядом', () => {
  const { tree } = draw(Clients, () => metrics({
    clients: { active: 15, newClients: 2, retained: 13, lost: 1, retention: 86.7, renewals: 9, newPayers: 2 },
    clientsBefore: { active: 15, newClients: 3, retained: 12, lost: 3, retention: 80 },
  }));

  const text = screenText(tree);
  assert.match(text, /Клиентов · Сентябрь 2026/);
  assert.match(text, /удержание 86,7% — 13 из 15 остались/);
  assert.match(text, /Пришли впервые/);
  assert.match(text, /Продлений/);
});

test('клиенты без прошлого периода не делят на ноль', () => {
  const { tree } = draw(Clients, () => metrics({ clients: { active: 4 } }));
  const text = screenText(tree);

  assert.ok(!/NaN|Infinity|undefined|null/.test(text), 'в тексте экрана: ' + text);
  assert.match(text, /сравнить не с чем/);
  assert.match(text, /прошлый период пуст/, 'прочерк у удержания объясняется');
});

/** Старый сервер стороны «Клиенты» не знает — экран не падает */
test('без стороны «Клиенты» в ответе экран рисуется пустым, а не падает', () => {
  const data = metrics();
  delete data.clients;
  const { tree } = draw(Clients, () => data);
  assert.match(screenText(tree), /занятий за этот период ещё не было/);
});

/* ==========================================================================
 * Процессы: срывы и кто отменяет — за тот же период
 * ========================================================================== */

const STATS = {
  total: { done: 41, cancelClient: 5, cancelTrainer: 1, cancelLate: 3, cancelCharged: 2, moveClient: 4, moveTrainer: 2 },
  lateHours: 24,
  clients: [{ clientRow: 3, name: 'Анна Морозова', done: 6, cancelClient: 2, cancelTrainer: 0, cancelLate: 1, cancelCharged: 1, moveClient: 2, moveTrainer: 0 }],
  recent: [{ kind: 'cancel', who: 'client', late: true, charged: true, reason: 'заболела', clientRow: 3, clientName: 'Анна Морозова', fromAt: '2026-09-20T10:00:00.000Z', toAt: null }],
};

test('срывы: отмены, переносы и доля — с красным ростом', () => {
  const { tree, stats } = draw(Processes, (action) => (action === 'trainer.schedule.stats' ? STATS : metrics({
    process: { trainings: 100, cancels: 6, cancelsLate: 3, moves: 6, cancelShare: 5.7 },
    processBefore: { trainings: 90, cancels: 2, cancelsLate: 0, moves: 1, cancelShare: 2.2 },
  })));

  const text = screenText(tree);
  assert.match(text, /Срывы/);
  assert.match(text, /Доля отмен/);
  assert.match(text, /Кто отменяет/, 'имена — под теми же цифрами');
  assert.match(text, /Анна Морозова/);
  assert.match(text, /заболела/);

  // Рост отмен — хуже: дельта красная
  const row = tree.root.findAll((node) => node.type === 'button' && textOf(node.props.children).startsWith('Отмен'), { deep: true })[0];
  const delta = row.findAll((node) => typeof node.type === 'string' && String(node.props.className || '').includes('delta--'), { deep: true })[0];
  assert.match(delta.props.className, /delta--off/);

  // Кто отменяет — за тот же месяц, что открыт в сводке
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  assert.equal(stats[0].from, from);
});

test('старый сервер без срывов: раздела нет, экран цел', () => {
  const data = metrics({ process: { trainings: 10 } });
  delete data.process.now.cancels;
  const { tree } = draw(Processes, (action) => (action === 'trainer.schedule.stats' ? null : data));
  const text = screenText(tree);
  assert.doesNotMatch(text, /Срывы/);
  assert.ok(!/NaN|undefined/.test(text));
});

test('шаг назад в процессах двигает и период «кто отменяет»', () => {
  const { tree, stats } = draw(Processes, (action) => (action === 'trainer.schedule.stats' ? STATS : metrics()));
  press(tree, 'Предыдущий месяц');

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  assert.equal(stats[stats.length - 1].from, from);
});

/* ==========================================================================
 * Обзор
 * ========================================================================== */

/** Ответ обзора: октябрь к 20-му, цели из «Горизонтов», сигналы с именами */
function overview(extra = {}) {
  return {
    month: '2026-10',
    previousMonth: '2026-09',
    pace: { day: 20, month: '2026-09', trainings: 82, revenue: 199800 },
    finance: {
      now: { revenue: 216850, expenses: 62000, profit: 154850, trainings: 89, activeClients: 15, averageCheck: 2546 },
      before: { revenue: 340250, expenses: 62000, profit: 278250, trainings: 141, activeClients: 21, averageCheck: 2544 },
    },
    clients: { now: { active: 15, retention: 86.7, retained: 13, lost: 1, newClients: 2 }, before: { active: 15, retention: 80 } },
    process: {
      now: { trainings: 89, activeClients: 15, measuredShare: 50, cancelShare: 4.3, silentClients: 2 },
      before: { trainings: 141, activeClients: 21, measuredShare: 60, cancelShare: 6 },
    },
    year: { year: 2026, revenue: 3333700, forecast: 4100000, throughMonth: 10 },
    marketing: { now: { newClients: 2, referral: 1, social: 1, unknown: 0, referralShare: 50 }, before: { referralShare: 100 } },
    development: { now: { learningHours: 4.5, learningEntries: 2, ownWorkouts: 9 }, before: { learningHours: 6 } },
    targets: { averageCheck: 3500, revenueYear: 7000000, retention: 80, measuredShare: 100, cancelShare: 10, referralShare: 50, learningHours: 8 },
    signals: {
      silent: [{ row: 6, name: 'Мария Волкова', days: 38, nextAt: null }, { row: 7, name: 'Игорь Лебедев', days: 31, nextAt: '2026-10-24T10:00:00.000Z' }],
      packages: [{ row: 4, name: 'Евгений', balance: -4000, left: -1 }, { row: 17, name: 'Соня + Юля', balance: 0, left: 0, split: true, payer: 'Евгений' }],
      measureDue: [{ row: 5, name: 'Дмитрий Соколов', days: 79 }],
      noPlan: [{ row: 6, name: 'Мария Волкова' }],
    },
    ...extra,
  };
}

const quiet = { onGo() {}, onOpenClient() {} };

test('обзор: выручка к сегодняшнему числу против того же числа прошлого месяца', () => {
  const { tree } = draw(Dashboard, () => overview(), { props: quiet });
  const text = screenText(tree);

  assert.match(text, /Выручка · Октябрь 2026, к 20-му/);
  assert.match(text, /216 850 ₽/);
  assert.match(text, /на 9% больше, чем к 20 сентября \(199 800 ₽\)/);
  assert.match(text, /89 · было 82/, 'тренировок — тоже к тому же числу');

  const lead = tree.root.findAll((node) => typeof node.type === 'string' && String(node.props.className || '').includes('lead--'), { deep: true })[0];
  assert.match(lead.props.className, /lead--good/, 'темп выше прошлого — зелёным');
});

test('обзор: четыре стороны с целью, достигнутая помечена, недостигнутая — «до цели»', () => {
  const { tree } = draw(Dashboard, () => overview(), { props: quiet });
  const text = screenText(tree);

  assert.match(text, /Средняя оплата/);
  assert.match(text, /до цели 954 ₽ из 3 500 ₽/);
  assert.match(text, /Удержание/);
  assert.match(text, /цель 80% — есть/);
  assert.match(text, /Доля отмен/);
  assert.match(text, /цель 10% — есть/, 'у «не больше» цель достигнута, когда цифра ниже');
  assert.match(text, /Клиентов в работе/);
  assert.match(text, /цель не задана/);

  const bars = tree.root.findAll((node) => node.props && node.props.role === 'progressbar', { deep: true });
  const check = bars.find((b) => b.props['aria-valuenow'] === 73);
  assert.ok(check, 'средняя оплата 2 546 из 3 500 — 73 %');
});

test('обзор: строка стороны ведёт на её вкладку', () => {
  const gone = [];
  const { tree } = draw(Dashboard, () => overview(), { props: { onGo: (pane) => gone.push(pane), onOpenClient() {} } });

  const row = tree.root.findAll((node) => node.type === 'button' && textOf(node.props.children).includes('Удержание'), { deep: true })[0];
  act(() => { row.props.onClick(); });

  assert.deepEqual(gone, ['clients']);
});

test('обзор: год к цели и прогноз по темпу', () => {
  const { tree } = draw(Dashboard, () => overview(), { props: quiet });
  const text = screenText(tree);

  assert.match(text, /Год · 2026/);
  assert.match(text, /3 333 700 ₽/);
  assert.match(text, /до цели 3 666 300 ₽ из 7 000 000 ₽/);
  assert.match(text, /около 4 100 000 ₽, цель 7 000 000 ₽ при таком темпе не выйдет/);
});

test('обзор: сигналы с именами открывают нужный раздел карточки', () => {
  const opened = [];
  const { tree } = draw(Dashboard, () => overview(), { props: { onGo() {}, onOpenClient: (client, at) => opened.push([client.name, at]) } });
  const text = screenText(tree);

  assert.match(text, /Молчат · 2/);
  assert.match(text, /38 дней без занятий/);
  assert.match(text, /31 день без занятий · записан на 24\.10/);
  assert.match(text, /Пакет кончается · 2/);
  assert.match(text, /долг 4 000 ₽/);
  assert.match(text, /Пора снять замер · 1/);
  assert.match(text, /замер 79 дней назад/);
  assert.match(text, /Нет программы · 1/);

  const personButton = (name) => tree.root.findAll((node) => node.type === 'button' && textOf(node.props.children).startsWith(name), { deep: true });
  act(() => { personButton('Мария Волкова')[1].props.onClick(); });
  act(() => { personButton('Евгений')[0].props.onClick(); });
  act(() => { personButton('Дмитрий Соколов')[0].props.onClick(); });

  assert.deepEqual(opened, [['Мария Волкова', 'plan'], ['Евгений', 'payments'], ['Дмитрий Соколов', 'progress']]);
});

test('обзор без сигналов хвалит, а не показывает пустые разделы', () => {
  const { tree } = draw(Dashboard, () => overview({ signals: { silent: [], packages: [], measureDue: [], noPlan: [] } }), { props: quiet });
  const text = screenText(tree);

  assert.match(text, /Всё на месте/);
  assert.doesNotMatch(text, /Молчат ·/);
});

test('обзор: пустой месяц без целей не показывает NaN и не красит', () => {
  const { tree } = draw(Dashboard, () => overview({
    pace: { day: 1, month: '2026-09', trainings: 0, revenue: 0 },
    finance: { now: { revenue: 0, expenses: 0, profit: 0, trainings: 0, activeClients: 0, averageCheck: null }, before: {} },
    clients: { now: { active: 0, retention: null }, before: {} },
    process: { now: { trainings: 0, measuredShare: null, cancelShare: null }, before: {} },
    year: { year: 2026, revenue: 0, forecast: null, throughMonth: 10 },
    targets: {},
    signals: { silent: [], packages: [], measureDue: [], noPlan: [] },
  }), { props: quiet });
  const text = screenText(tree);

  assert.ok(!/NaN|Infinity|undefined|null/.test(text), 'в тексте экрана: ' + text);
  assert.match(text, /занятий в этом месяце ещё не было/);
  const lead = tree.root.findAll((node) => typeof node.type === 'string' && String(node.props.className || '').includes('lead'), { deep: true })[0];
  assert.doesNotMatch(lead.props.className, /lead--/);
});

test('цели правятся листом и уходят на сервер разом', async () => {
  const { tree, sent } = draw(Dashboard, () => overview(), {
    props: quiet,
    onMutate: (action, params) => ({ targets: { ...params.targets, averageCheck: 4000 } }),
  });

  press(tree, 'Цели');
  assert.match(screenText(tree), /Норма, с которой сравнивается каждая цифра/);

  type(tree, 'Средняя оплата', '4000');
  type(tree, 'Удержание', '');
  press(tree, 'Сохранить');
  // Лист закрывается не сразу — ждём его таймер и ответ сервера
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, 'trainer.metrics.targets.set');
  assert.equal(sent[0].params.targets.averageCheck, '4000');
  assert.equal(sent[0].params.targets.retention, '', 'пустое поле снимает цель');
  assert.match(screenText(tree), /из 4 000 ₽/, 'экран показывает цель из ответа сервера');
});

/* ==========================================================================
 * Маркетинг, развитие, сплит и плательщик (20.10.2026)
 * ========================================================================== */

test('обзор: главные цифры месяца — маркетинг и развитие с целями', () => {
  const { tree } = draw(Dashboard, () => overview(), { props: quiet });
  const text = screenText(tree);

  assert.match(text, /Главные цифры месяца/);
  assert.match(text, /Маркетинг Доля по рекомендации цель 50% — есть 50%/);
  assert.match(text, /Развитие Часов обучения до цели 3,5 ч из 8 ч 4,5 ч/);
});

test('обзор: пара сплита — одной строкой с меткой, деньги плательщика подписаны', () => {
  const { tree } = draw(Dashboard, () => overview(), { props: quiet });
  const text = screenText(tree);

  assert.match(text, /Пакет кончается · 2/);
  assert.match(text, /Соня \+ Юля сплит платит Евгений · занятий не осталось/);
});

test('старый обзор без маркетинга и развития не падает', () => {
  const data = overview();
  delete data.marketing;
  delete data.development;
  const { tree } = draw(Dashboard, () => data, { props: quiet });
  const text = screenText(tree);
  assert.match(text, /Доля по рекомендации/);
  assert.match(text, /пока нет/);
  assert.ok(!/NaN|undefined/.test(text));
});

test('клиенты: откуда приходят новые — по источникам из карточек', () => {
  const { tree } = draw(Clients, () => metrics({
    clients: { active: 10 },
    marketing: { newClients: 3, referral: 2, gym: 1, unknown: 0, referralShare: 66.7 },
  }));
  const text = screenText(tree);

  assert.match(text, /Откуда приходят новые/);
  assert.match(text, /По рекомендации 2/);
  assert.match(text, /Подошёл в зале 1/);
  assert.match(text, /Доля по рекомендации 66,7%/);
});

test('процессы: развитие — часы из журнала, запись уходит на сервер, удаление тоже', async () => {
  const learning = { month: '2026-09', hours: 4.5, entries: [{ id: 7, day: '2026-09-12', hours: 1.5, note: 'Семинар' }, { id: 8, day: '2026-09-20', hours: 3, note: null }] };
  const { tree, sent } = draw(Processes, (action) => (action === 'trainer.learning.list' ? learning
    : action === 'trainer.schedule.stats' ? null
      : metrics({ development: { learningHours: 4.5, learningEntries: 2, ownWorkouts: 9 } })), {
    onMutate: () => ({ id: 9 }),
  });
  const text = screenText(tree);

  assert.match(text, /Развитие/);
  assert.match(text, /Часов обучения 4,5 ч/);
  assert.match(text, /Своих тренировок 9/);
  assert.match(text, /12\.09 · Семинар 1,5 ч/);

  press(tree, 'Записать');
  assert.match(screenText(tree), /Записать обучение/);
  type(tree, 'Часов', '2');
  type(tree, 'Что это было', 'Книга');
  // Две кнопки «Записать»: открывающая лист и его же «готово» — нужна вторая
  const buttons = tree.root.findAll((node) => node.type === 'button' && textOf(node.props.children).trim() === 'Записать', { deep: true });
  act(() => { buttons[buttons.length - 1].props.onClick(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

  assert.equal(sent[0].action, 'trainer.learning.add');
  assert.equal(sent[0].params.hours, '2');
  assert.equal(sent[0].params.note, 'Книга');

  press(tree, 'Удалить запись 12.09');
  await act(async () => { await Promise.resolve(); });
  assert.equal(sent[1].action, 'trainer.learning.delete');
  assert.equal(sent[1].params.id, 7);
});
