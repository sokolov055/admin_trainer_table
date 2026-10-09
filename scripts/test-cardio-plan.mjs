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
    button: (label, group, aria) => tree.root.findAllByType('button').find((b) => text(b) === label && (!group || b.parent.props['aria-label'] === group) && (!aria || b.props['aria-label'] === aria)),
    input: (label) => tree.root.findAllByType('input').find((n) => n.props['aria-label'] === label),
    labels: () => tree.root.findAllByType('input').map((n) => n.props['aria-label']),
  };
}

test('вид кардио: функциональное — интервалы с целью у фаз, аэробное — настройки и цели (09.10.2026)', () => {
  const ui = mount({ ...newCardio('other'), goal: undefined, metrics: ['kcal'], targets: { time: '', distance: '', kcal: '', pulse: '' } });
  assert.equal(ui.button('Аэробная тренировка', 'Вид кардио').props['aria-checked'], true);
  assert.equal(ui.button('Дорожка'), undefined, 'тренажёр больше не выбирают');
  // Старый план без выбора настроек — по тренажёру: у «другого» скорость и уровень
  assert.equal(ui.button('Скорость', 'Настройки').props['aria-pressed'], true);
  assert.equal(ui.button('Уровень сложности', 'Настройки').props['aria-pressed'], true);
  assert.equal(ui.button('Угол наклона', 'Настройки').props['aria-pressed'], false);
  assert.ok(ui.labels().includes('Скорость, км/ч'));

  // Настройки — любые вместе
  act(() => ui.button('Угол наклона', 'Настройки').props.onClick());
  assert.deepEqual(ui.value.modes, ['speed', 'incline', 'level']);
  assert.ok(ui.labels().includes('Наклон, %'));
  act(() => ui.button('Уровень сложности', 'Настройки').props.onClick());
  assert.deepEqual(ui.value.modes, ['speed', 'incline']);
  assert.ok(!ui.labels().includes('Уровень'));

  // Цели — тоже любые; главная — первая из итогов
  assert.equal(ui.value.goal, undefined);
  act(() => ui.button('Время', 'Цель').props.onClick());
  act(() => ui.button('Пульс', 'Цель').props.onClick());
  assert.deepEqual(ui.value.metrics, ['time', 'kcal', 'pulse']);
  assert.equal(ui.value.goal, 'time');
  assert.deepEqual(ui.labels().filter((l) => l.startsWith('Цель:')), ['Цель: Время, мин', 'Цель: Калории', 'Цель: Пульс']);
  act(() => ui.button('Время', 'Цель').props.onClick());
  act(() => ui.button('Калории', 'Цель').props.onClick());
  assert.deepEqual(ui.value.metrics, ['kcal', 'pulse'], 'без итога нельзя: остался бы один пульс');

  // Функциональное — интервалы: круги, фазы, у каждой свой набор; общих цели и настроек нет
  act(() => ui.button('Функциональное кардио', 'Вид кардио').props.onClick());
  assert.equal(ui.value.goal, 'intervals');
  assert.equal(ui.value.intervals.rounds, 6);
  assert.equal(ui.value.intervals.phases.length, 2);
  assert.ok(ui.labels().includes('Кругов'));
  assert.ok(ui.labels().includes('Ускорение: Скорость, км/ч') && ui.labels().includes('Замедление: Время, мм:сс'));
  assert.ok(!ui.labels().some((l) => l.startsWith('Цель:')) && !ui.labels().includes('Скорость, км/ч'), 'общих цели и режима нет — они у фаз');
  assert.equal(ui.button('Скорость', 'Настройки'), undefined, 'только свои настройки');
  assert.equal(ui.button('Время', 'Цель'), undefined);

  // Ускорение — на калории, замедление — на скорость: у каждой фазы своё, множественно
  act(() => ui.button('Скорость', 'Ускорение: что задать').props.onClick());
  act(() => ui.button('Время', 'Ускорение: что задать').props.onClick());
  act(() => ui.button('Калории', 'Ускорение: что задать').props.onClick());
  act(() => ui.button('Пульс', 'Ускорение: что задать').props.onClick());
  assert.deepEqual(ui.value.intervals.phases[0].fields, ['kcal', 'pulse']);
  assert.ok(ui.labels().includes('Ускорение: Калории') && !ui.labels().includes('Ускорение: Скорость, км/ч'));
  assert.ok(ui.labels().includes('Замедление: Скорость, км/ч'));
  // Что записывать — по фазам: время всегда, калории и пульс — от ускорения
  assert.deepEqual(ui.value.metrics, ['time', 'kcal', 'pulse']);
  assert.deepEqual(ui.value.modes, ['speed']);

  // Интервалов в круге — сколько нужно; лишний убирается
  act(() => ui.button('+ Интервал').props.onClick());
  assert.equal(ui.value.intervals.phases.length, 3);
  assert.ok(ui.labels().includes('Интервал 3: Время, мм:сс'));
  act(() => ui.input('Интервал 3: название').props.onChange({ target: { value: 'Горка' } }));
  act(() => ui.button('Наклон', 'Горка: что задать').props.onClick());
  assert.ok(ui.labels().includes('Горка: Наклон, %'));
  assert.deepEqual(ui.value.modes, ['speed', 'incline']);
  act(() => ui.button('Убрать', null, 'Убрать: Горка').props.onClick());
  assert.equal(ui.value.intervals.phases.length, 2);

  // Об/мин — и у фаз тоже
  act(() => ui.button('об/мин', 'Скорость в').props.onClick());
  assert.equal(ui.value.speedUnit, 'rpm');
  assert.ok(ui.labels().includes('Замедление: Скорость, об/мин'));

  // Обратно в аэробную — интервалов нет, главная — первая цель
  act(() => ui.button('Аэробная тренировка', 'Вид кардио').props.onClick());
  assert.equal(ui.value.goal, 'time');
  assert.equal(ui.value.intervals, null);
  assert.ok(!ui.labels().includes('Кругов'));
  assert.equal(ui.button('+ Интервал'), undefined);
});

test('об/мин и у дорожки, когда настройки выбраны тренером', () => {
  const ui = mount(newCardio('treadmill'));
  assert.equal(ui.button('об/мин').props['aria-checked'], false);
  assert.equal(ui.button('Время', 'Цель').props['aria-pressed'], true);
  act(() => ui.button('об/мин').props.onClick());
  assert.deepEqual(ui.value.modes, ['speed', 'incline'], 'выбор по тренажёру стал явным');
  assert.ok(ui.labels().includes('Скорость, об/мин'));
});
