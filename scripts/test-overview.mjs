/**
 * Обзор клиента: первый экран, и единственный, куда заходят без вопроса.
 *
 * Проверяется предупреждение о конце пакета. Оно устроено так, чтобы
 * молчать, — и в этом вся сложность: плашка, висящая всегда, перестаёт
 * быть предупреждением, а не появившаяся вовремя означает, что человек
 * узнает о конце оплаты в тот день, когда пришёл заниматься.
 *
 * Экран собирается настоящий, с настоящим набором компонентов: подменены
 * только сеть и вибрация.
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
  entryPoints: ['scripts/fixtures/overview-entry.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  plugins: [{
    name: 'overview-stubs',
    setup(bundle) {
      bundle.onResolve({ filter: /useData\.js$/ }, () => ({ path: 'data', namespace: 'overview-test' }));
      bundle.onResolve({ filter: /[\\/]api\.js$/ }, () => ({ path: 'api', namespace: 'overview-test' }));
      bundle.onResolve({ filter: /telegram\.js$/ }, () => ({ path: 'telegram', namespace: 'overview-test' }));

      // Стили сюда приезжают за компанию с соседними экранами из того же
      // файла: обзор их не подключает, но живёт с ними под одной крышей.
      bundle.onResolve({ filter: /\.css$/ }, () => ({ path: 'styles', namespace: 'overview-test' }));

      bundle.onLoad({ filter: /.*/, namespace: 'overview-test' }, (args) => {
        if (args.path === 'styles') return { contents: '' };
        if (args.path === 'data') return {
          contents: `export const useData = (action, params) => globalThis.__overview.useData(action, params);`,
        };
        if (args.path === 'api') return {
          contents: `export const apiMutate = (action, params) => globalThis.__overview.apiMutate(action, params);
            export const apiPublic = async () => ({});
            export const apiPrimary = async () => ({});
            export const logout = () => {};
            export const apiBatch = async () => ({});
            export const apiStale = () => ({ data: null, stale: false, promise: Promise.resolve({}) });`,
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


const { Overview } = module.exports;

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

/** Ответ обзора: только то, что читает экран */
function overview(extra = {}) {
  return {
    name: 'Анна',
    row: 3,
    balance: 20000,
    price: 2000,
    trainingsLeft: 10,
    trainingsThisMonth: 6,
    lastTrainingDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    nextTrainingDate: new Date(Date.now() + 86400000).toISOString(),
    scheduleKnown: true,
    startDate: '2026-01-15',
    birthDate: '1992-03-14',
    lastMeasureStatus: '',
    monthSheetStatus: '',
    currentMonthName: 'Сентябрь 2026',
    hasPersonalSheet: true,
    packageEnding: { known: true, left: 10, perWeek: 2, soon: false, out: false },
    ...extra,
  };
}

function draw(data) {
  globalThis.__overview = {
    useData: () => ({ loading: false, data, error: null, reload() {} }),
    apiMutate: () => Promise.resolve({}),
  };

  let tree;
  act(() => { tree = renderer.create(React.createElement(Overview, {})); });
  return tree;
}

/* ==========================================================================
 * Конец пакета
 * ========================================================================== */

test('пока занятий много, о конце пакета молчим', () => {
  const tree = draw(overview());

  assert.doesNotMatch(screen(tree), /продлите|закончились/i, 'предупреждение, висящее всегда, ничего не значит');
});

test('за неделю до конца появляется предупреждение с числом', () => {
  const tree = draw(overview({
    balance: 4000,
    trainingsLeft: 2,
    packageEnding: { known: true, left: 2, perWeek: 2, soon: true, out: false },
  }));

  const text = screen(tree);

  assert.match(text, /Осталось 2 занятия/);
  assert.match(text, /продлите пакет/i);
});

test('одно занятие называется одним, а не «1 занятие»', () => {
  const tree = draw(overview({
    balance: 2000,
    trainingsLeft: 1,
    packageEnding: { known: true, left: 1, perWeek: 2, soon: true, out: false },
  }));

  assert.match(screen(tree), /Осталось одно оплаченное занятие/);
});

test('кончившийся пакет говорит о долге', () => {
  const tree = draw(overview({
    balance: -2000,
    trainingsLeft: -1,
    packageEnding: { known: true, left: -1, perWeek: 2, soon: false, out: true },
  }));

  const text = screen(tree);

  assert.match(text, /Оплаченные занятия закончились/);
  assert.match(text, /в долг/);
});

/** Цены занятия нет — считать нечего, и выдумывать нельзя */
test('без цены занятия плашки нет', () => {
  const tree = draw(overview({
    price: 0,
    trainingsLeft: null,
    packageEnding: { known: false, left: null, perWeek: null, soon: false, out: false },
  }));

  assert.doesNotMatch(screen(tree), /продлите|закончились/i);
});

/**
 * Старый ответ сервера поля не содержит. Экран обязан открыться: клиент
 * может неделями не обновлять приложение, а обзор — первое, что он видит.
 */
test('ответ без нового поля не ломает экран', () => {
  const data = overview();
  delete data.packageEnding;

  const tree = draw(data);

  assert.match(screen(tree), /Оплачено вперёд/, 'экран цел');
});
