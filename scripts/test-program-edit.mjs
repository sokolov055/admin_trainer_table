import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftOf, cleanBlocks, draftSnapshot, autoDays, autoMinutes, blockMinutes, weekItems, loadOfWeek, removedWeek,
  movedInWeek, removedAt, copiedTo, addedBlock, sessionsForCardio, cardioAdded, toggledJoin, canJoin,
} from '../src/trainer/program-edit-model.js';

/** Редактор программы «Библиотеки» (этап 3, 17.11.2026) */

const ex = (name, extra = {}) => ({ name, sets: '3', reps: '10', ...extra });
const cardio = { name: 'Беговая дорожка', sets: '1', cardio: { machine: 'treadmill', targets: { time: '20' } } };
const titles = (list) => list.map((b) => b.title);

const program = () => draftOf([
  { title: 'Ноги', week: 1, exercises: [ex('Присед'), ex('Выпады')] },
  { title: 'Кардио', week: 1, with: true, exercises: [cardio] },
  { title: 'Верх', week: 1, exercises: [ex('Жим')] },
  { title: 'Ноги 2', week: 2, load: 'heavy', exercises: [ex('Присед', { supersetGroup: 'g1' }), ex('Выпады', { supersetGroup: 'g1' })] },
]);

test('черновик: ключи строк, в сохранение — без ключей и пустых упражнений', () => {
  const d = draftOf([{ title: 'А', week: 2, load: 'light', with: true, exercises: [ex('Жим'), { name: ' ' }] }]);
  assert.ok(d[0]._k);
  const clean = cleanBlocks(d);
  assert.equal(clean[0]._k, undefined);
  assert.deepEqual(clean[0].exercises.map((e) => e.name), ['Жим']);
  assert.equal(clean[0].week, 2);
  assert.equal(clean[0].load, 'light');
  assert.equal(clean[0].with, true);
  // Снимок «есть ли несохранённое» не зависит от ключей
  assert.equal(draftSnapshot(d), draftSnapshot(d.map((b) => ({ ...b, _k: 'x' }))));
  assert.equal(draftOf([]).length, 1, 'новая программа — с одной тренировкой');
});

test('авто: раз в неделю — занятия недели 1, минуты — как у сервера', () => {
  const d = program();
  assert.equal(autoDays(d, 2), 2, 'кардио в одном занятии с «Ногами» — два прихода');
  assert.equal(autoDays(d.map(({ week, ...b }) => b), 0), 3, 'без недель — занятия всей программы');
  assert.equal(autoDays([], 0), 0);
  // Силовая: (60 + 3 × (40 + 90)) с на упражнение
  assert.equal(blockMinutes({ exercises: [ex('Жим')] }), 10, '7,5 мин — до 5 вверх');
  assert.equal(blockMinutes({ exercises: [] }), 0);
  const m = autoMinutes(d);
  assert.ok(m >= 10 && m % 5 === 0);
  assert.equal(autoMinutes([{ title: 'А', exercises: [{ name: '' }] }]), null);
});

test('недели: тренировки вкладки, нагрузка, убрать неделю', () => {
  const d = program();
  assert.deepEqual(weekItems(d, 1).map((i) => i.index), [0, 1, 2]);
  assert.deepEqual(weekItems(d, 0).length, 4, 'без недель — все');
  assert.equal(loadOfWeek(d, 2), 'heavy');
  assert.equal(loadOfWeek(d, 1), '');
  const gone = removedWeek(d, 1);
  assert.deepEqual(titles(gone), ['Ноги 2']);
  assert.equal(gone[0].week, 1, 'неделя 2 встала на место первой');
});

test('перестановка внутри недели — по местам вкладки', () => {
  const d = program();
  const moved = movedInWeek(d, 1, 2, 0);
  assert.deepEqual(titles(moved), ['Верх', 'Ноги', 'Кардио', 'Ноги 2']);
  assert.equal(moved[2].with, true, 'кардио осталось в занятии с «Ногами»');
  assert.equal(movedInWeek(d, 1, 1, 1), d, 'на то же место — без изменений');
  // Голову занятия утащили — кардио становится само по себе
  const head = movedInWeek(d, 1, 0, 2);
  assert.deepEqual(titles(head), ['Кардио', 'Верх', 'Ноги', 'Ноги 2']);
  assert.ok(!head[0].with);
});

test('удалить, копия, новая тренировка', () => {
  const d = program();
  const rm = removedAt(d, 0);
  assert.deepEqual(titles(rm), ['Кардио', 'Верх', 'Ноги 2']);
  assert.ok(!rm[0].with, 'удалили голову — кардио само по себе');

  const copy = copiedTo(d, 3, 1, 7);
  const c = copy[copy.length - 1];
  assert.equal(c.title, 'Ноги 2');
  assert.equal(c.week, 1);
  assert.equal(c.load, undefined, 'нагрузка — недели, куда легла');
  assert.notEqual(c._k, d[3]._k);
  assert.ok(c.exercises[0].supersetGroup && c.exercises[0].supersetGroup !== 'g1', 'суперсет копии — свой');
  assert.equal(c.exercises[0].supersetGroup, c.exercises[1].supersetGroup);

  const added = addedBlock(d, 2, { title: 'Спина', exercises: [], with: true });
  const a = added[added.length - 1];
  assert.equal(a.week, 2);
  assert.equal(a.load, 'heavy');
  assert.ok(!a.with);
  assert.equal(addedBlock([], 0)[0].title, 'Тренировка № 1');
});

test('кардио к занятию и «в одно занятие»', () => {
  const d = program();
  const sessions = sessionsForCardio(d, 1);
  assert.deepEqual(sessions.map((s) => [s.head, s.last, s.hasCardio]), [[0, 1, true], [2, 2, false]]);
  const withCardio = cardioAdded(d, 2, { title: 'Кардио', exercises: [cardio] });
  assert.deepEqual(titles(withCardio), ['Ноги', 'Кардио', 'Верх', 'Кардио', 'Ноги 2']);
  assert.equal(withCardio[3].with, true);
  assert.equal(withCardio[3].week, 1);

  assert.equal(canJoin(d, 0, 2), false, 'первую в неделе не к чему цеплять');
  assert.equal(canJoin(d, 2, 2), true);
  assert.equal(canJoin(d, 3, 2), false, 'первая в неделе 2');
  const joined = toggledJoin(d, 2);
  assert.equal(joined[2].with, true);
  assert.ok(!toggledJoin(joined, 2)[2].with, 'второй раз — отдельным занятием');
});
