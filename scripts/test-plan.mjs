import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { supersets, blockSessions } from '../src/plan-model.js';
import { copyPlanBlocks, patchPlanExercise, workoutRenameParams } from '../src/plan-block-actions.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('заголовок тренировки имеет системный внутренний отступ', () => {
  assert.match(
    styles,
    /\.plan__block > \.section > \.section__head\s*\{[^}]*padding:\s*var\(--space-4\) var\(--space-4\) var\(--space-3\)/s,
  );
  assert.match(styles, /\.plan__block-swipe\s*\{[^}]*margin-bottom:\s*0/s);
});

/* ==========================================================================
 * Суперсеты
 * ========================================================================== */

test('подряд идущие упражнения одной группы собираются в суперсет', () => {
  const groups = supersets([
    { name: 'Жим лёжа', sets: '4', supersetGroup: '' },
    { name: 'Подтягивания', sets: '3', supersetGroup: 'superset-4-5' },
    { name: 'Тяга блока', sets: '3', supersetGroup: 'superset-4-5' },
    { name: 'Планка', sets: '3', supersetGroup: '' },
  ]);

  assert.deepEqual(groups.map((g) => g.superset), [false, true, false]);
  assert.deepEqual(groups[1].items.map((e) => e.name), ['Подтягивания', 'Тяга блока']);
  assert.equal(groups[1].sets, '3', 'число подходов у группы общее');
});

/**
 * Объединение могло остаться от оформления. «Суперсет из одного»
 * человека только собьёт: делать подряд нечего.
 */
test('группа из одного упражнения суперсетом не считается', () => {
  const groups = supersets([{ name: 'Планка', sets: '3', supersetGroup: 'superset-9-10' }]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].superset, false);
});

test('одинаковые группы через разрыв не склеиваются', () => {
  const groups = supersets([
    { name: 'А', supersetGroup: 'g1' },
    { name: 'Б', supersetGroup: '' },
    { name: 'В', supersetGroup: 'g1' },
  ]);

  assert.equal(groups.length, 3, 'суперсет — это соседство, а не совпадение имени');
  assert.equal(groups.every((g) => !g.superset), true);
});

test('добавление круга и разминки синхронизирует весь суперсет', () => {
  const exercises = [
    { name: 'Жим', sets: '3', technique: 'warmup1 dropset', supersetGroup: 'g1' },
    { name: 'Тяга', sets: '3', technique: '', supersetGroup: 'g1' },
    { name: 'Планка', sets: '2', technique: '', supersetGroup: '' },
  ];

  const withRound = patchPlanExercise(exercises, 0, { sets: '4' });
  assert.deepEqual(withRound.map((exercise) => exercise.sets), ['4', '4', '2']);

  const withWarmup = patchPlanExercise(withRound, 0, { technique: 'warmup2 dropset' });
  assert.equal(withWarmup[0].technique, 'warmup2 dropset');
  assert.equal(withWarmup[1].technique, 'warmup2');
  assert.equal(withWarmup[2].technique, '');
});

test('копии тренировок идут после оригиналов в их порядке и сохраняют названия', () => {
  const source = [
    {
      id: 'block-1',
      title: 'Верх',
      exercises: [
        { name: 'Жим', supersetGroup: 'g1' },
        { name: 'Тяга', supersetGroup: 'g1' },
      ],
    },
    { id: 'block-2', title: 'Низ', exercises: [{ name: 'Присед', supersetGroup: '' }] },
    { id: 'block-3', title: 'Кардио', exercises: [{ name: 'Дорожка', supersetGroup: '' }] },
  ];
  const copied = copyPlanBlocks(source, [2, 0], 123);

  assert.equal(copied.length, 5);
  assert.deepEqual(copied.map((block) => block.title), ['Верх', 'Низ', 'Кардио', 'Верх', 'Кардио']);
  assert.deepEqual(copied.slice(3).map((block) => block.id), ['', '']);
  assert.notEqual(copied[3].exercises[0].supersetGroup, 'g1');
  assert.equal(copied[3].exercises[0].supersetGroup, copied[3].exercises[1].supersetGroup);
  assert.equal(source[0].exercises[0].supersetGroup, 'g1', 'исходные данные не меняются');
});

test('переименование завершённого занятия сохраняет ревизию и исходное название', () => {
  const session = { id: 'done-1', title: 'Ноги', status: 'completed', revision: 7 };
  assert.deepEqual(workoutRenameParams(session, 'Ноги и корпус', 'request-1'), {
    session: { ...session, title: 'Ноги и корпус' },
    revision: 7,
    requestId: 'request-1',
    baseTitle: 'Ноги',
  });
});

/* ==========================================================================
 * Отметка «тренировка проведена»
 * ========================================================================== */

const SESSIONS = [
  { id: 'a', status: 'completed', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-10T10:00:00Z' },
  { id: 'b', status: 'completed', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-17T10:00:00Z' },
  { id: 'c', status: 'completed', sourceBlock: 'Тренировка № 2', month: 'Сентябрь 2026', updatedAt: '2026-09-12T10:00:00Z' },
  { id: 'd', status: 'completed', sourceBlock: 'Тренировка № 1', month: 'Август 2026', updatedAt: '2026-08-20T10:00:00Z' },
  { id: 'e', status: 'active', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-23T10:00:00Z' },
  { id: 'f', status: 'cancelled', sourceBlock: 'Тренировка № 1', month: 'Сентябрь 2026', updatedAt: '2026-09-22T10:00:00Z' },
];

test('к блоку относятся только его завершённые занятия этого месяца', () => {
  const past = blockSessions(SESSIONS, 'Тренировка № 1', 'Сентябрь 2026');

  assert.deepEqual(past.map((s) => s.id), ['b', 'a'], 'свежие сверху');
});

/**
 * Идущее занятие — ещё не результат, а отменённое не состоялось. Зелёная
 * отметка и кнопка «посмотреть веса» по ним обещали бы несуществующее.
 */
test('незакрытое и отменённое занятия блок выполненным не делают', () => {
  const past = blockSessions(SESSIONS, 'Тренировка № 1', 'Сентябрь 2026');

  assert.equal(past.some((s) => ['e', 'f'].includes(s.id)), false);
});

test('прошлый месяц не красит блок текущего', () => {
  assert.deepEqual(blockSessions(SESSIONS, 'Тренировка № 1', 'Август 2026').map((s) => s.id), ['d']);
});

/**
 * Занятие переименовывают прямо в зале. Название меняется, sourceBlock —
 * нет: иначе блок программы переставал бы считаться выполненным.
 */
test('переименованное занятие остаётся привязанным к своему блоку', () => {
  const renamed = [{
    id: 'x', status: 'completed', title: 'Ноги, спина болит',
    sourceBlock: 'Тренировка № 3', month: 'Сентябрь 2026', updatedAt: '2026-09-18T10:00:00Z',
  }];

  assert.deepEqual(blockSessions(renamed, 'Тренировка № 3', 'Сентябрь 2026').map((s) => s.id), ['x']);
  assert.deepEqual(blockSessions(renamed, 'Ноги, спина болит', 'Сентябрь 2026'), []);
});

test('свободная тренировка ни к одному блоку не относится', () => {
  const free = [{ id: 'y', status: 'completed', sourceBlock: '', month: '', updatedAt: '2026-09-18T10:00:00Z' }];

  assert.deepEqual(blockSessions(free, 'Тренировка № 1', 'Сентябрь 2026'), []);
});

/**
 * Тренировка — по id (28.09.2026): в месяце бывает несколько одноимённых
 * («Грудь, трицепс» дважды в неделю), и название меняют и в программе,
 * и в журнале.
 */
test('одноимённые тренировки различаются по id', () => {
  const first = { id: 'b1', title: 'Грудь, трицепс' };
  const second = { id: 'b2', title: 'Грудь, трицепс' };
  const done = [
    { id: 'p', status: 'completed', title: 'Грудь, трицепс', sourceBlock: 'Грудь, трицепс', sourceBlockId: 'b2', month: 'Сентябрь 2026', updatedAt: '2026-09-18T10:00:00Z' },
  ];
  assert.deepEqual(blockSessions(done, first, 'Сентябрь 2026'), []);
  assert.deepEqual(blockSessions(done, second, 'Сентябрь 2026').map((s) => s.id), ['p']);
});

test('по id занятие остаётся при своей тренировке, как бы их ни переименовали', () => {
  const block = { id: 'b1', title: 'Грудь, трицепс, плечи' };
  const done = [{ id: 'q', status: 'completed', title: 'Верх', sourceBlock: 'Тренировка № 1', sourceBlockId: 'b1', month: 'Сентябрь 2026', updatedAt: '2026-09-18T10:00:00Z' }];
  assert.deepEqual(blockSessions(done, block, 'Сентябрь 2026').map((s) => s.id), ['q']);
});

test('занятие, заведённое до id, находится по названию тренировки', () => {
  const legacy = [{ id: 'r', status: 'completed', sourceBlock: 'Спина', month: 'Сентябрь 2026', updatedAt: '2026-09-18T10:00:00Z' }];
  assert.deepEqual(blockSessions(legacy, { id: 'b9', title: 'Спина' }, 'Сентябрь 2026').map((s) => s.id), ['r']);
});

test('подход суперсета — без числа кругов: круги стоят у скобки', async () => {
  const { roundLine } = await import('../src/plan-model.js');
  assert.equal(roundLine([{ weight: '', reps: '15' }, { weight: '', reps: '15' }]), '15 повт.');
  assert.equal(roundLine([{ weight: '10', reps: '12' }, { weight: '10', reps: '12' }]), '12 повт. · 10 кг');
  assert.equal(roundLine([{ weight: '10', reps: '12' }, { weight: '12', reps: '10' }]), '10 кг × 12, 12 кг × 10');
});

test('прогресс: изменения с прошлого замера — по двум последним, где показатель есть', async () => {
  const { recentDeltas } = await import('../src/client/deltas.js');
  const rows = [
    { date: '2026-09-09', 'Вес': 90, 'Талия': 91 },
    { date: '2026-09-18', 'Вес': 92.9 },
    { date: '2026-09-25', 'Вес': 93.3, 'Талия': 92 },
  ];
  assert.deepEqual(recentDeltas(rows, ['Вес', 'Талия', 'Грудь']), {
    'Вес': { first: 92.9, last: 93.3, delta: 0.4, from: '2026-09-18' },
    'Талия': { first: 91, last: 92, delta: 1, from: '2026-09-09' },
  });
});
