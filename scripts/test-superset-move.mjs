import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveExercise, leaveBelow, ungroup, removeGroup, putBack, dropTarget, tidyGroups, runsOf } from '../src/trainer/superset-move-model.js';
import { techniqueOf } from '../src/exercise-track.js';

/** Суперсет: перенос и смахивание (18.11.2026) */

const ex = (name, group = '', more = {}) => ({ name, supersetGroup: group, sets: group ? '4' : '3', reps: '12', technique: '', ...more });
// 0 Жим · 1–2 суперсет А (Пек-дек, Разгибание) · 3 Молотки · 4 Планка
const LIST = [ex('Жим'), ex('Пек-дек', 'a', { technique: 'rest90' }), ex('Разгибание', 'a', { reps: '20' }), ex('Молотки'), ex('Планка')];
const names = (l) => l.map((e) => e.name + (e.supersetGroup ? '*' + e.supersetGroup : '')).join(' ');

test('внутри рамки — меняется порядок, отдых круга переезжает к новому первому', () => {
  const next = moveExercise(LIST, 2, 1, 'a');
  assert.equal(names(next), 'Жим Разгибание*a Пек-дек*a Молотки Планка');
  assert.equal(techniqueOf(next[1].technique).rest, 90);
  assert.equal(next[1].sets, '4');
  assert.equal(names(LIST), 'Жим Пек-дек*a Разгибание*a Молотки Планка', 'исходный список не тронут');
});

test('за рамку — вышел из суперсета; остался один — рамки нет', () => {
  const next = moveExercise(LIST, 2, 3, '');
  assert.equal(names(next), 'Жим Пек-дек Молотки Разгибание Планка');
  assert.equal(next[3].sets, '4', 'подходы = кругам');
  const three = [...LIST.slice(0, 3), ex('Тяга', 'a'), ...LIST.slice(3)];
  assert.equal(names(moveExercise(three, 1, 3, '')), 'Жим Разгибание*a Тяга*a Пек-дек Молотки Планка');
  assert.equal(techniqueOf(moveExercise(three, 1, 3, '')[1].technique).rest, 90, 'первый ушёл — отдых у нового первого');
});

test('в рамку — вступил, подходов столько, сколько кругов; круги по значениям подстраиваются', () => {
  const next = moveExercise(LIST, 3, 3, 'a');
  assert.equal(names(next), 'Жим Пек-дек*a Разгибание*a Молотки*a Планка');
  assert.equal(next[3].sets, '4');
  const ladder = moveExercise([...LIST.slice(0, 3), ex('Лесенка', '', { reps: '10, 12, 14' })], 3, 3, 'a');
  assert.equal(ladder[3].reps, '10, 12, 14, 16');
});

test('«Из суперсета» — встаёт сразу под рамкой', () => {
  const three = [...LIST.slice(0, 3), ex('Тяга', 'a'), ...LIST.slice(3)];
  assert.equal(names(leaveBelow(three, 1)), 'Жим Разгибание*a Тяга*a Пек-дек Молотки Планка');
  assert.equal(names(leaveBelow(LIST, 1)), 'Жим Разгибание Пек-дек Молотки Планка', 'из двух — оба отдельные');
  assert.equal(names(leaveBelow(LIST, 0)), names(LIST), 'не в суперсете — ничего');
});

test('шапка: «Разобрать» и «Удалить оба» с «Вернуть»', () => {
  assert.equal(names(ungroup(LIST, 2)), 'Жим Пек-дек Разгибание Молотки Планка');
  const { next, gone } = removeGroup(LIST, 1);
  assert.equal(names(next), 'Жим Молотки Планка');
  assert.equal(names(putBack(next, gone)), names(LIST));
});

test('tidyGroups не трогает суперсет без отдыха', () => {
  const l = [ex('A', 'g'), ex('B', 'g')];
  assert.equal(tidyGroups(l, [l[1], l[0]].map((e) => ({ ...e })))[0].technique, '');
});

// Строки по 50 px: 0 [0–50], рамка А [60–170]: 1 [80–120], 2 [120–160], 3 [180–230], 4 [230–280]
const ROWS = [{ top: 0, bottom: 50, group: '' }, { top: 80, bottom: 120, group: 'a' }, { top: 120, bottom: 160, group: 'a' }, { top: 180, bottom: 230, group: '' }, { top: 230, bottom: 280, group: '' }];
const FRAMES = { a: { top: 60, bottom: 170 } };

test('куда упадёт: внутри рамки — в суперсет, у края — к ближнему краю, снаружи — отдельно', () => {
  assert.deepEqual(dropTarget(ROWS, FRAMES, 2, 90).to, 1, 'Разгибание выше Пек-дека');
  assert.equal(dropTarget(ROWS, FRAMES, 2, 90).group, 'a');
  assert.deepEqual(dropTarget(ROWS, FRAMES, 2, 240), { to: 3, group: '', at: 230 }, 'за рамкой под Молотками');
  assert.equal(dropTarget(ROWS, FRAMES, 3, 110).group, 'a', 'Молотки в рамку');
  assert.equal(dropTarget(ROWS, FRAMES, 3, 110).to, 2);
  assert.equal(dropTarget(ROWS, FRAMES, 3, 85).at, 78, 'первым в рамку — черта внутри рамки над строкой');
  assert.equal(dropTarget(ROWS, FRAMES, 3, 165).at, 162, 'последним — под строкой, внутри рамки');
  assert.equal(dropTarget(ROWS, FRAMES, 0, 300).to, 4, 'вниз до конца');
  assert.equal(dropTarget(ROWS, FRAMES, 2, 175, 150).group, 'a', 'край вышел за рамку, середина — нет: остаётся в суперсете');
  assert.equal(dropTarget(ROWS, FRAMES, 2, 200, 175).group, '', 'середина за рамкой — вышел');
  assert.equal(dropTarget(ROWS, FRAMES, 3, 175).at, 195, 'отдельно под рамкой — черта под рамкой');
  assert.equal(dropTarget(ROWS, FRAMES, 0, 55).at, 56, 'отдельно над рамкой — черта над рамкой');
  assert.equal(dropTarget(ROWS, FRAMES, 4, -10).to, 0, 'вверх до начала');
});

test('рамка из двух: второй тянут — рамка пустеет, вступать некуда', () => {
  const rows = [{ top: 0, bottom: 40, group: 'a' }, { top: 40, bottom: 80, group: 'a' }];
  const t = dropTarget(rows, { a: { top: 0, bottom: 90 } }, 1, 10);
  assert.equal(t.group, 'a', 'остаётся вторым в паре');
  assert.equal(t.to, 0);
  const solo = dropTarget([{ top: 0, bottom: 40, group: 'a' }], { a: { top: 0, bottom: 50 } }, 0, 20);
  assert.equal(solo.group, '', 'кроме него никого — не суперсет');
});

// Превью переноса: { j, group }, -1 — пустое место
const seqText = (seq) => runsOf(seq).map((u) => (u.group ? '[' : '') + u.items.map((x) => (x.j < 0 ? '_' : LIST[x.j].name)).join(' ') + (u.group ? ']' : '')).join(' ');

test('превью: пустое место там, куда встанет; поднятое — в своей рамке', async () => {
  const { previewSeq, runsOf: r } = await import('../src/trainer/superset-move-model.js');
  assert.equal(typeof r, 'function');
  // В начале — как было: пустое место на своём месте
  assert.equal(seqText(previewSeq(LIST, 2, 2, 'a')), 'Жим [Пек-дек _ Разгибание] Молотки Планка');
  // Внутри рамки выше
  assert.equal(seqText(previewSeq(LIST, 2, 1, 'a')), 'Жим [_ Пек-дек Разгибание] Молотки Планка');
  // За рамку вниз: рамка из двух остаётся (поднятое в ней), место — под Молотками
  assert.equal(seqText(previewSeq(LIST, 2, 3, '')), 'Жим [Пек-дек Разгибание] Молотки _ Планка');
  // Отдельное — в рамку: поднятое стоит после рамки, не разрывая её
  const join = previewSeq(LIST, 0, 1, 'a');
  assert.deepEqual(join.map((x) => x.j), [0, 1, -1, 2, 3, 4], 'Жим на своём месте, место — внутри рамки');
  assert.equal(seqText(join), 'Жим [Пек-дек _ Разгибание] Молотки Планка');
  // Снизу в рамку: Планка встаёт после Молотков, а не внутрь рамки
  assert.equal(seqText(previewSeq(LIST, 4, 3, 'a')), 'Жим [Пек-дек Разгибание _] Молотки Планка');
  // Молотки — первыми в рамку
  assert.equal(seqText(previewSeq(LIST, 3, 1, 'a')), 'Жим [_ Пек-дек Разгибание] Молотки Планка');
});

test('превью без переноса — те же блоки, что список', async () => {
  const { runsOf: r } = await import('../src/trainer/superset-move-model.js');
  const flat = LIST.map((e, j) => ({ j, group: e.supersetGroup }));
  assert.deepEqual(r(flat).map((u) => [u.group, u.items.map((x) => x.j)]), [['', [0]], ['a', [1, 2]], ['', [3]], ['', [4]]]);
});
