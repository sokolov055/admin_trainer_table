import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { trackOf } from '../src/exercise-track.js';

/**
 * Кардио в программе (FT-475, 07.10.2026): главная цель — время,
 * расстояние, калории или интервалы; у интервалов отдельной цели-числа нет,
 * у фаз — своя скорость; у аэробайка скорость в км/ч или об/мин.
 */

const output = await build({
  entryPoints: ['src/trainer/CardioPlan.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react'],
  jsx: 'transform',
  logLevel: 'silent',
});
const mod = { exports: {} };
vm.runInThisContext(`(function (require, module, exports) {${output.outputFiles[0].text}\n})`)(createRequire(import.meta.url), mod, mod.exports);
const { default: CardioPlan, newCardio } = mod.exports;

const text = (node) => (typeof node === 'string' ? node : (node.children || []).map(text).join(''));

function mount(initial) {
  let value = initial;
  let tree;
  const render = () => React.createElement(CardioPlan, { value, track: trackOf({ cardio: value }), disabled: false, onChange: (v) => { value = v; tree.update(render()); } });
  act(() => { tree = renderer.create(render()); });
  return {
    get value() { return value; },
    button: (label, group) => tree.root.findAllByType('button').find((b) => text(b) === label && (!group || b.parent.props['aria-label'] === group)),
    labels: () => tree.root.findAllByType('input').map((n) => n.props['aria-label']),
  };
}

test('главная цель: интервалы — круги вместо цели-числа, у фаз скорость', () => {
  const ui = mount({ ...newCardio('other'), goal: undefined, metrics: ['kcal'], targets: { time: '', distance: '', kcal: '', pulse: '' } });
  assert.equal(ui.button('Калории', 'Главная цель').props['aria-checked'], true, 'старый план: главная — первое записываемое');
  // У «другого» (аэробайк) режим есть: скорость и уровень
  assert.ok(ui.labels().includes('Скорость, км/ч'));

  act(() => ui.button('Интервалы', 'Главная цель').props.onClick());
  assert.equal(ui.value.goal, 'intervals');
  assert.equal(ui.value.intervals.rounds, 6);
  const labels = ui.labels();
  assert.ok(labels.includes('Кругов'));
  assert.ok(labels.includes('Ускорение: Скорость, км/ч') && labels.includes('Замедление: Скорость, км/ч'), 'скорость ускорения и замедления');
  assert.ok(!labels.includes('Скорость, км/ч'), 'общего режима при интервалах нет — он у фаз');

  // Об/мин — и у фаз тоже
  act(() => ui.button('об/мин', 'Скорость в').props.onClick());
  assert.equal(ui.value.speedUnit, 'rpm');
  assert.ok(ui.labels().includes('Ускорение: Скорость, об/мин'));

  // Записываемое при интервалах можно менять, но не убрать всё
  act(() => ui.button('Калории').props.onClick());
  assert.deepEqual(ui.value.metrics, ['kcal'], 'последнее не снимается');

  // Ушли с интервалов — интервалов нет, главная цель записывается
  act(() => ui.button('Время', 'Главная цель').props.onClick());
  assert.equal(ui.value.goal, 'time');
  assert.equal(ui.value.intervals, null);
  assert.deepEqual(ui.value.metrics, ['time', 'kcal']);
  assert.equal(ui.labels().filter((l) => l.startsWith('Цель:'))[0], 'Цель: Время, мин', 'цель главной — первой');
});

test('у дорожки скорость только в км/ч', () => {
  const ui = mount(newCardio('treadmill'));
  assert.equal(ui.button('об/мин'), undefined);
  assert.equal(ui.button('Время', 'Главная цель').props['aria-checked'], true);
});
