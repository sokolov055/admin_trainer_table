import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareTopics } from '../src/story-topics.js';
import {
  addFrame, draftFrom, frameNote, moveFrame, newId, problems,
  removeFrame, sameDraft, toPayload, updateFrame, updateTopic,
} from '../src/trainer/stories-edit.js';

/**
 * Истории из панели владельца (FT-615): что увидит человек на своём
 * устройстве и как правится черновик в «Управлении → Истории».
 */

const TOPICS = [
  {
    id: 'release', label: 'Что нового', caption: 'Что нового в версии 3.9', cover: 'release',
    frames: [
      { id: 'a', heading: 'Новость А', body: 'Откройте «Питание».', art: 'nutrition', tint: '#f5c65c', date: '8 октября' },
      { id: 'b', heading: 'Новость Б', body: 'Откройте «Тренировки».', hidden: true },
    ],
  },
  {
    id: 'guide', label: 'Инструкция', caption: 'Как пользоваться', cover: 'guide', audience: 'clients',
    frames: [
      { id: 'g1', heading: 'Прогресс', body: 'Обычный текст', bodyIos: 'Текст про «Здоровье»' },
      { id: 'g2', heading: 'Apple Watch', body: 'Часы', only: 'ios' },
      { id: 'g3', heading: 'Android', body: 'Шаги', only: 'android' },
    ],
  },
  { id: 'trainers-only', label: 'Тренерам', caption: 'Для тренеров', audience: 'trainers', frames: [{ id: 't1', heading: 'Т', body: '' }] },
  { id: 'empty', label: 'Пусто', caption: 'Пусто', frames: [] },
];

test('клиент на iPhone: скрытых нет, свой текст для iPhone, без «только Android»', () => {
  const out = prepareTopics(TOPICS, { role: 'client', ios: true });
  assert.deepEqual(out.map((t) => t.id), ['release', 'guide'], 'тренерская и пустая темы не видны');
  assert.deepEqual(out[0].frames.map((f) => f.id), ['a'], 'скрытый кадр не показывается');
  assert.deepEqual(out[1].frames.map((f) => f.id), ['g1', 'g2']);
  assert.equal(out[1].frames[0].body, 'Текст про «Здоровье»');
});

test('клиент на Android: без «только iPhone», основной текст', () => {
  const out = prepareTopics(TOPICS, { role: 'client', ios: false });
  assert.deepEqual(out[1].frames.map((f) => f.id), ['g1', 'g3']);
  assert.equal(out[1].frames[0].body, 'Обычный текст');
});

test('тренер: темы «всем» и «тренерам», без клиентской инструкции', () => {
  const out = prepareTopics(TOPICS, { role: 'trainer', ios: false });
  assert.deepEqual(out.map((t) => t.id), ['release', 'trainers-only']);
});

test('исходный набор не меняется — панель правит вшитые как есть', () => {
  const before = JSON.stringify(TOPICS);
  prepareTopics(TOPICS, { ios: true });
  assert.equal(JSON.stringify(TOPICS), before);
});

test('черновик из вшитых: только данные, «кому» явно, пустое не уходит', () => {
  const draft = draftFrom(TOPICS);
  assert.equal(draft[0].audience, 'all');
  assert.equal(draft[1].audience, 'clients');
  assert.equal(draft[0].frames[1].hidden, true);
  assert.ok(sameDraft(draft, draftFrom(TOPICS)));

  const edited = updateFrame(draft, 0, 0, { date: '', body: '  Откройте «Питание» → «Дневник».  ' });
  const payload = toPayload(edited);
  assert.equal('date' in payload[0].frames[0], false, 'пустая дата — поля нет');
  assert.equal(payload[0].frames[0].body, 'Откройте «Питание» → «Дневник».');
  assert.ok(!sameDraft(edited, draft), 'правка видна — «Сохранить» загорается');
});

test('новый кадр — первым, с новым id; удаление, перестановка, своя картинка', () => {
  const draft = draftFrom(TOPICS);
  const { draft: next, frame } = addFrame(draft, 0, 1760000000000);
  assert.equal(frame, 0);
  assert.equal(next[0].frames.length, 3);
  const id = next[0].frames[0].id;
  assert.match(id, /^f-[a-z0-9-]+$/, 'id подходит серверу');
  assert.ok(!draft.flatMap((t) => t.frames.map((f) => f.id)).includes(id));
  assert.equal(next[0].frames[0].heading, '');

  const moved = moveFrame(next, 0, 0, 1);
  assert.deepEqual(moved[0].frames.map((f) => f.id), ['a', id, 'b']);
  assert.equal(moveFrame(moved, 0, 0, -1), moved, 'за край — без изменений');
  assert.deepEqual(removeFrame(moved, 0, 1)[0].frames.map((f) => f.id), ['a', 'b']);

  // Своя картинка вместо рисунка — в черновике и в отправке
  const pic = updateFrame(draft, 0, 0, { image: '/media/' + 'a'.repeat(24) + '.png', art: '' });
  assert.equal(toPayload(pic)[0].frames[0].image, '/media/' + 'a'.repeat(24) + '.png');
  assert.equal('art' in toPayload(pic)[0].frames[0], false);
});

test('newId не повторяет занятые', () => {
  const now = 1760000000000;
  const first = newId('f', [], now);
  assert.notEqual(newId('f', [first], now), first);
});

test('что мешает сохранить — понятными словами', () => {
  let draft = draftFrom(TOPICS);
  assert.deepEqual(problems(draft), []);
  draft = addFrame(draft, 0).draft;
  assert.match(problems(draft)[0], /«Что нового», кадр 1: нет заголовка/);
  draft = updateFrame(draft, 0, 0, { heading: 'Дневник', body: 'я'.repeat(701) });
  assert.match(problems(draft)[0], /текст длиннее 700/);
  draft = updateTopic(updateFrame(draft, 0, 0, { body: 'ок' }), 1, { label: '' });
  assert.match(problems(draft)[0], /нет подписи на кружке/);
});

test('сводка кадра в списке', () => {
  assert.equal(frameNote({ hidden: true, only: 'ios', date: '8 октября' }), 'скрыт · только iPhone · 8 октября');
  assert.equal(frameNote({}), '');
  assert.equal(frameNote({ image: '/media/x.png' }), 'своя картинка');
});
