import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterChips, toggleFilter, applyFilters, groupByGoal, explainTitle, minutesText, timesText, placeText, levelTone,
} from '../src/client/programs-model.js';

/**
 * «Программы тренера» (FT-497): метки карточки, фильтры-пилюли, группы по
 * цели и расшифровка сокращений в названиях.
 */

const P = (id, extra) => ({ id, title: 'Программа ' + id, goal: '', level: '', place: '', days: null, minutes: 45, minutesAuto: false, workouts: 3, ...extra });
const list = [
  P(1, { title: 'Первый месяц в зале', goal: 'Похудение', level: 'Новичок', place: 'gym', days: 2 }),
  P(2, { title: 'Круги дома', goal: 'Похудение', level: 'Средний', place: 'home', days: 3 }),
  P(3, { title: 'Сила всего тела', goal: 'Сила', level: 'Опытный', place: 'gym', days: 3 }),
  P(4, { title: 'Ягодицы с нуля', goal: 'Ягодицы и ноги', level: 'Новичок', place: 'gym', days: 2 }),
  P(5, { title: 'Без цели', level: '', place: '', days: null }),
];

test('метки карточки: минуты (≈ — посчитаны), раз в неделю, место, тон уровня', () => {
  assert.equal(minutesText({ minutes: 45 }), '45 мин');
  assert.equal(minutesText({ minutes: 50, minutesAuto: true }), '≈ 50 мин');
  assert.equal(minutesText({ minutes: null }), '');
  assert.equal(timesText({ days: 2 }), '2 раза в неделю');
  assert.equal(timesText({ days: 5 }), '5 раз в неделю');
  assert.equal(timesText({ days: null, workouts: 3 }), '3 тренировки', 'частота не указана — не выдумываем её');
  assert.equal(timesText({ days: null, workouts: 1 }), '1 тренировка');
  assert.equal(placeText({ place: 'home' }), 'дома');
  assert.equal(placeText({ place: '' }), '');
  assert.deepEqual(['Новичок', 'Средний', 'Опытный', ''].map(levelTone), ['easy', 'mid', 'hard', '']);
});

test('пилюли — только значения, которые есть и что-то отсекают; порядок: раз в неделю, место, опыт', () => {
  const chips = filterChips(list);
  assert.deepEqual(chips.map((c) => c.label), ['2 раза в неделю', '3 раза в неделю', 'Зал', 'Дома', 'Новичок', 'Средний', 'Опытный']);
  // Все в зале — «Зал» ничего не сужает
  const gymOnly = filterChips([P(1, { place: 'gym', days: 2 }), P(2, { place: 'gym', days: 3 })]);
  assert.deepEqual(gymOnly.map((c) => c.label), ['2 раза в неделю', '3 раза в неделю']);
  assert.deepEqual(filterChips([P(1, { place: 'gym' })]), [], 'одна программа — фильтровать нечего');
});

test('выбранная пилюля сужает список сразу; повторное нажатие («×») снимает; того же вида — заменяет', () => {
  let f = toggleFilter({}, 'place', 'home');
  assert.deepEqual(applyFilters(list, f).map((p) => p.id), [2]);
  f = toggleFilter(f, 'place', 'gym');
  assert.deepEqual(f, { place: 'gym' }, 'другое место заменяет прежнее');
  f = toggleFilter(f, 'days', 2);
  assert.deepEqual(applyFilters(list, f).map((p) => p.id), [1, 4]);
  f = toggleFilter(f, 'level', 'Опытный');
  assert.deepEqual(applyFilters(list, f), [], 'ничего не подошло — экран предложит сбросить');
  f = toggleFilter(f, 'level', 'Опытный');
  f = toggleFilter(f, 'days', 2);
  f = toggleFilter(f, 'place', 'gym');
  assert.deepEqual(f, {});
  assert.equal(applyFilters(list, f).length, list.length, 'всё снято — весь список');
});

test('группы — по цели из шаблонов: частые по порядку, свои после, без цели — в конце', () => {
  const groups = groupByGoal(list);
  assert.deepEqual(groups.map((g) => g.title), ['Похудение', 'Сила', 'Ягодицы и ноги', 'Другие программы']);
  assert.deepEqual(groups[0].items.map((p) => p.id), [1, 2], 'от новичка к опытному');
  assert.deepEqual(groupByGoal([P(1), P(2)]).map((g) => g.title), ['Все программы'], 'целей нет — одна группа без выдумок');
  assert.deepEqual(groupByGoal([]), []);
});

test('сокращения в названии — с расшифровкой рядом', () => {
  assert.deepEqual(explainTitle('Full Body [2] Fast'), ['Full Body — всё тело за одну тренировку', '[2] — 2 раза в неделю']);
  assert.deepEqual(explainTitle('UL/PPL'), ['PPL — жимы, тяги и ноги в разные дни', 'UL — верх и низ тела по очереди']);
  assert.deepEqual(explainTitle('Тяга ВБ, тяж/лёг'), ['ВБ — верхний блок (тренажёр)', 'тяж / лёг — тяжёлая и лёгкая тренировка']);
  assert.deepEqual(explainTitle('Сила: база 5×5'), ['5×5 — 5 подходов по 5 повторений']);
  assert.deepEqual(explainTitle('Первый месяц в зале'), [], 'понятное название — без подписей');
  assert.deepEqual(explainTitle('Бульон'), [], '«UL» внутри слова — не сокращение');
  assert.deepEqual(explainTitle('Ultra'), []);
});
