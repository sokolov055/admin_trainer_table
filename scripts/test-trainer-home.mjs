/**
 * Первая страница тренера — «Клиенты» (макет home-redesign-2026-11-19,
 * согласован владельцем 19.11.2026): шапка дня с лентой клиентов, плитки
 * «Сделать», строка темпа месяца. Экран собирается настоящий: подменены
 * только сеть и вибрация (как в test-overview.mjs).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';

const output = await build({
  entryPoints: ['scripts/fixtures/trainer-home-entry.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  loader: { '.png': 'dataurl' },
  plugins: [{
    name: 'th-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /useData\.js$/ }, () => ({ path: 'data', namespace: 'th-test' }));
      bundle.onResolve({ filter: /[\\/]api\.js$/ }, () => ({ path: 'api', namespace: 'th-test' }));
      bundle.onResolve({ filter: /telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'th-test' }));

      // Стили сюда приезжают за компанию с соседними экранами из того же
      // файла: обзор их не подключает, но живёт с ними под одной крышей.
      bundle.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'th-test' }));

      bundle.onLoad({ filter: /.*/, namespace: 'th-test' }, (args) => {
        if (args.path === 'styles') return { contents: '' };
        if (args.path === 'data') return {
          contents: `export const useData = (action, params) => globalThis.__th.useData(action, params);`,
        };
        if (args.path === 'api') return {
          contents: `export const apiMutate = (action, params) => globalThis.__th.apiMutate(action, params);
            export const apiWait=()=>new Promise(()=>{}); export const apiPublic = async () => ({});
            export const apiFresh = async () => ({ data: {}, offline: false, at: 0 });
            export const apiStoredAt = () => 0;
            export const apiPrimary = async () => ({});
            export const logout = () => {};
            export const apiBatch = async () => ({});
            export const apiStale = () => ({ data: null, stale: false, promise: Promise.resolve({}) });
            export const onMutated = () => () => {};
            export const api = async () => ({}); export const clearApiCache = () => {};`,
        };
        if (args.path === 'telegram') return {
          contents: `export const haptic = () => {};
            export const getThemeMode = () => 'auto';
            export const setThemeMode = (value) => value;
            export const environmentInfo = () => ({ inTelegram: false });
            export const getInitData = () => '';`,
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


const { Clients, dayLine, dayHint, inWords, todoTiles, inTile, paceLine, shortMoney } = module.exports;

function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (node.children !== undefined) return textOf(node.children);
  if (node.props) return textOf(node.props.children);
  return '';
}
const screen = (tree) => textOf(tree.toJSON()).replace(/\s+/g, ' ');

const NOW = new Date(2026, 10, 19, 14, 20);
const at = (h, m = 0) => new Date(2026, 10, 19, h, m).toISOString();

/* ==========================================================================
 * Модель
 * ========================================================================== */

test('лента дня: по времени, «сейчас» — ближайшее впереди, проведённые считаются', () => {
  const line = dayLine([
    { row: 3, name: 'Мария К', at: at(15), done: false },
    { row: 1, name: 'Анна С', at: at(9), done: true },
    { row: 2, name: 'Дима В', at: at(11), done: true },
    { row: 4, name: 'Олег П', at: at(17, 30), done: false },
  ], NOW);
  assert.deepEqual(line.slots.map((s) => s.row), [1, 2, 3, 4]);
  assert.deepEqual(line.slots.map((s) => s.now), [false, false, true, false]);
  assert.equal(line.total, 4);
  assert.equal(line.done, 2);
  assert.equal(dayHint(line, null, NOW), 'занятий проведено · следующее через 40 мин');
});

test('лента дня: идущее занятие (меньше часа назад, не проведено) — «сейчас идёт»', () => {
  const line = dayLine([{ row: 1, name: 'А', at: at(14), done: false }, { row: 2, name: 'Б', at: at(16), done: false }], NOW);
  assert.deepEqual(line.slots.map((s) => s.now), [true, false]);
  assert.match(dayHint(line, null, NOW), /сейчас идёт/);
});

test('инициалы: два слова, одно слово, пара сплита', () => {
  assert.equal(module.exports.initials('Мария Кузнецова'), 'МК');
  assert.equal(module.exports.initials('Олег + Светлана'), 'ОС');
  assert.equal(module.exports.initials('Олег'), 'ОЛ');
});

test('подписи дня: всё проведено, пустой день, «через 2 ч 10 мин»', () => {
  const all = dayLine([{ row: 1, name: 'А', at: at(9), done: true }], NOW);
  assert.equal(dayHint(all, { at: at(20) }, NOW, () => 'завтра, 9:00'), 'все занятия проведены · дальше завтра, 9:00');
  assert.equal(dayHint(dayLine([], NOW), null, NOW), 'сегодня занятий нет');
  assert.equal(inWords(at(16, 30), NOW), 'через 2 ч 10 мин');
  assert.equal(inWords(at(17, 20), NOW), 'через 3 ч');
});

const CLIENTS = [
  { row: 1, name: 'Анна Морозова', chatId: '1', balance: 6000, trainings: 6 },
  { row: 2, name: 'Олег Петров', balance: -3000, trainings: 3, invited: true },
  { row: 3, name: 'Ирина Л', balance: 1500, trainings: 4 },
  { row: 30, name: 'Олег', splitOf: 29, joined: true, balance: 0, trainings: 3 },
  { row: 31, name: 'Светлана', splitOf: 29, joined: true, balance: 0, trainings: 3 },
  { row: 5, name: 'Мария В', joined: true, pause: { state: 'requested' }, balance: 0, trainings: 0 },
];
const SIGNALS = {
  silent: [{ row: 5, name: 'Мария В', days: 38 }],
  packages: [{ row: 2, name: 'Олег Петров', balance: -3000 }, { row: 29, name: 'Олег + Светлана', split: true }],
  measureDue: [],
  noPlan: [{ row: 3, name: 'Ирина Л' }],
};

test('плитки «Сделать»: сигналы «Сводки», не приглашены, просят паузу; сплит — по паре', () => {
  const tiles = todoTiles(CLIENTS, SIGNALS);
  const by = Object.fromEntries(tiles.map((t) => [t.id, t]));
  assert.deepEqual(tiles.map((t) => t.id), ['packages', 'silent', 'noPlan', 'measureDue', 'uninvited', 'asking']);
  assert.equal(by.packages.count, 2);
  assert.equal(by.measureDue.count, 0);
  assert.equal(by.uninvited.count, 1, 'Ирина: ни чата, ни ссылки, ни входа');
  assert.equal(by.asking.count, 1);
  assert.deepEqual(CLIENTS.filter((c) => inTile(by.packages, c)).map((c) => c.row), [2, 30, 31], 'участники сплита — по карточке пары');
  assert.equal(todoTiles(CLIENTS, undefined).find((t) => t.id === 'silent').count, 0, 'старый сервер без сигналов — нули, не падение');
});

test('темп месяца: % к тому же дню, полоска к месячной цели, черта прошлого месяца', () => {
  const p = paceLine({
    month: '2026-11', finance: { now: { revenue: 216850 }, before: { revenue: 340000 } },
    pace: { day: 19, month: '2026-10', revenue: 200000 }, targets: { revenue: 340000 },
  });
  assert.equal(p.diff, 8);
  assert.equal(p.against, 'к 19 окт');
  assert.equal(p.bar, 64);
  assert.equal(p.was, 59);
  assert.equal(p.goal, 'цель 340к');
  assert.equal(p.month, 'Ноябрь');
  const year = paceLine({ month: '2026-11', finance: { now: { revenue: 100 }, before: {} }, pace: {}, targets: { revenueYear: 1200000 } });
  assert.equal(year.goal, 'цель 100к', 'нет месячной — годовая / 12');
  assert.equal(year.diff, null);
  assert.equal(year.was, null);
  const none = paceLine({ month: '2026-11', finance: { now: { revenue: 150000 }, before: { revenue: 300000 } }, pace: { day: 19, month: '2026-10', revenue: 0 }, targets: {} });
  assert.equal(none.bar, 50);
  assert.equal(none.goal, 'весь октябрь 300к');
  assert.equal(paceLine(null), null);
  assert.equal(shortMoney(1250000), '1,25 млн');
});

test('строка: обводка по важности, билетики, сегодня у сплита — по паре', () => {
  const { ringOf, packOf, todayByRow, todayOf, ticketRow } = module.exports;
  assert.equal(ringOf({}, { money: -1, noPlan: true, today: true }), 'debt');
  assert.equal(ringOf({}, { money: 0, noPlan: true, today: true }), 'plan');
  assert.equal(ringOf({ pause: { state: 'active' } }, { money: 0, noPlan: false, today: true }), 'pause');
  assert.equal(ringOf({ pause: { state: 'requested' } }, { money: 0, noPlan: false, today: true }), 'today');
  assert.equal(ringOf({}, { money: 5, noPlan: false, today: false }), '');
  assert.deepEqual(packOf({ price: 1500, balance: 1500, count: 8 }, ticketRow), { total: 8, left: 1, used: 7 });
  assert.deepEqual(packOf({ price: 3000, balance: -3000, count: 8 }, ticketRow), { total: 8, left: 0, used: 8 }, 'долг — все пройдены');
  assert.deepEqual(packOf({ splitOf: 29, splitTrainingsLeft: 4, count: 0 }, ticketRow), { total: 4, left: 4, used: 0 });
  assert.equal(packOf({ online: true, price: 1, balance: 5 }, ticketRow), null);
  assert.equal(packOf({ price: 0, balance: 0 }, ticketRow), null);
  const map = todayByRow([{ row: 29, at: 'x', done: false }, { row: 1, at: 'y', done: true }]);
  assert.equal(todayOf(map, { row: 30, splitOf: 29 }).row, 29);
  assert.equal(todayOf(map, { row: 1 }), null, 'проведённое — не «сегодня»');
});

/* ==========================================================================
 * Экран
 * ========================================================================== */

function draw(clients = CLIENTS, extra = {}) {
  const today = new Date();
  const t = (min) => new Date(today.getTime() + min * 60000).toISOString();
  const list = {
    clients,
    summary: {
      count: clients.length, totalTrainings: 16, negativeBalance: 1, staleClients: 1, staleDays: 14,
      today: { total: 2, done: 1, next: null, items: [
        { row: 1, name: 'Анна Морозова', at: t(-1), done: true },
        { row: 2, name: 'Олег Петров', at: t(1), done: false, topic: { title: 'Спина', exercises: [{ muscle: 'Спина' }] } },
      ].filter((x) => new Date(x.at).toDateString() === today.toDateString()) },
    },
    signals: SIGNALS,
    ...extra,
  };
  const metrics = {
    month: '2026-11', finance: { now: { revenue: 216850 }, before: { revenue: 340000 } },
    pace: { day: 19, month: '2026-10', revenue: 200000 }, targets: { revenue: 340000 },
  };
  const opened = [];
  const went = [];
  globalThis.__th = {
    useData: (action) => ({ loading: false, data: action === 'trainer.metrics.overview' ? metrics : list, error: null, reload() {} }),
    apiMutate: () => Promise.resolve({}),
  };
  let tree;
  act(() => {
    tree = renderer.create(React.createElement(Clients, {
      onOpenClient: (c) => opened.push(c.row), onRefresh() {}, refreshRevision: 0, onGo: (id) => went.push(id),
    }));
  });
  return { tree, opened, went };
}

const byClass = (tree, cls) => tree.root.findAll((n) => typeof n.type === 'string' && String(n.props.className || '').split(' ').includes(cls));

test('экран: шапка дня вместо строки фактов, плитки и темп', () => {
  const { tree, opened, went } = draw();
  const text = screen(tree);
  assert.doesNotMatch(text, /внимания требуют|тренировк\S* за месяц ·|не приглашены \d+ ·/, 'строки фактов нет');
  assert.match(text, /Сделать/);
  assert.match(text, /216 850/);
  assert.match(text, /▲ 8 ?% к 19 окт/);
  const chips = tree.root.findAll((n) => n.props && n.props.role === 'tab').map((n) => textOf(n.props.children));
  assert.ok(!chips.some((c) => /Требуют внимания|Долг|Без замера|Просят паузу/.test(c)), 'фильтры ушли в плитки: ' + chips.join(', '));
  const slots = byClass(tree, 'th-slot');
  // У полуночи одно из занятий «вчера» — тогда кружок один
  if (slots.length) {
    act(() => slots[slots.length - 1].props.onClick());
    assert.equal(opened.length, 1, 'кружок открывает карточку');
  }
  act(() => byClass(tree, 'th-pace')[0].props.onClick());
  assert.deepEqual(went, ['dashboard'], 'темп открывает «Сводку»');
});

test('плитка фильтрует список, повторное касание снимает фильтр, ноль — выключен', () => {
  const { tree } = draw();
  const tile = (id) => byClass(tree, 'th-td--' + id)[0];
  const names = () => byClass(tree, 'item__name').map((n) => textOf(n.props.children)).sort();
  act(() => tile('crit').props.onClick());
  assert.deepEqual(names(), ['Олег', 'Олег Петров', 'Светлана']);
  act(() => tile('violet').props.onClick());
  assert.deepEqual(names(), ['Ирина Л']);
  act(() => tile('violet').props.onClick());
  assert.equal(tile('violet').props['aria-pressed'], false, 'плитка снята');
  assert.ok(!names().includes('Ирина Л'), 'снова «Ещё сегодня»: Ирины сегодня нет');
  assert.equal(tile('teal').props.disabled, true, '0 «пора замер» — не нажимается');
  assert.ok(tile('teal').props.className.includes('is-zero'));
});

test('список: аватар с обводкой, время пилюлей, тема цветом мышц, билетики, короткая строка', () => {
  const clients = CLIENTS.map((c) => (c.row === 2 ? { ...c, price: 3000, count: 8 } : c.row === 3 ? { ...c, price: 1500, count: 8 } : c));
  const { tree } = draw(clients);
  act(() => tree.root.findAll((n) => n.props && n.props.role === 'tab' && /^Все/.test(textOf(n.props.children)))[0].props.onClick());
  const row = (name) => byClass(tree, 'cl-item')
    .find((n) => n.findAll((x) => x.props.className === 'item__name' && textOf(x.props.children) === name).length);
  const oleg = row('Олег Петров');
  const ava = oleg.findAll((n) => String(n.props.className || '').includes('th-ava'))[0];
  assert.match(ava.props.className, /th-ring--debt/, 'долг — красная обводка');
  assert.equal(textOf(ava.props.children), 'ОП');
  const today = new Date();
  if (new Date(today.getTime() + 60000).toDateString() === today.toDateString()) {
    assert.equal(oleg.findAll((n) => n.props.className === 'cl-time').length, 1, 'время сегодня пилюлей');
    assert.match(oleg.findAll((n) => String(n.props.className || '').startsWith('cl-topic'))[0].props.className, /tone-back/);
  }
  const irina = row('Ирина Л');
  assert.match(irina.findAll((n) => String(n.props.className || '').includes('th-ava'))[0].props.className, /th-ring--plan/);
  const tickets = irina.findAll((n) => n.type === 'i' && n.parent && n.parent.props.className === 'cl-pack');
  assert.equal(tickets.length, 8);
  assert.equal(tickets.filter((n) => n.props.className === 'is-last').length, 1, 'последний — оранжевый');
  const meta = textOf(byClass(tree, 'cl-item__meta').map((n) => n.props.children));
  assert.doesNotMatch(meta, /за месяц/, 'без «N тренировок за месяц»');
});
