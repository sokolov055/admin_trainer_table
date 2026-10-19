import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareTopics } from '../src/story-topics.js';
import {
  addFrame, draftFrom, duplicateFrame, frameNote, moveFrame, newId, problems,
  removeFrame, sameDraft, toPayload, updateFrame, updateTopic,
} from '../src/trainer/stories-edit.js';
import { framesForEditor, legacyFields, legacyToCanvas, splitText, stickerLayer, textLayer } from '../src/story-canvas.js';

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

test('черновик из вшитых: у каждого кадра холст, открытие — не правка', () => {
  const draft = draftFrom(TOPICS);
  assert.equal(draft[0].audience, 'all');
  assert.equal(draft[1].audience, 'clients');
  assert.equal(draft[0].frames[1].hidden, true);
  assert.ok(draft.every((t) => t.frames.every((f) => f.canvas && Array.isArray(f.canvas.layers))));
  assert.ok(sameDraft(draft, draftFrom(TOPICS)), 'перевод в холст одинаков каждый раз');

  const a = draft[0].frames[0];
  assert.equal(a.date, '8 октября');
  const kinds = a.canvas.layers.map((l) => l.kind || l.type);
  assert.deepEqual(kinds, ['art', 'text', 'text'], 'рисунок, заголовок, текст');
  assert.equal(a.canvas.layers[0].value, 'nutrition');
  assert.equal(a.canvas.layers[0].color, '#f5c65c', 'цвет рисунка — цвет кадра');
  const ys = a.canvas.layers.map((l) => l.y);
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2], 'сверху вниз');
  assert.ok(ys.every((y) => y > 0.12 && y < 0.95), 'не под полосками и не за краем');
});

test('кадр со своим текстом для iPhone — два кадра: не iPhone и iPhone', () => {
  const guide = draftFrom(TOPICS)[1].frames;
  assert.deepEqual(guide.map((f) => [f.id, f.only || '']), [['g1', 'android'], ['g1-ios', 'ios'], ['g2', 'ios'], ['g3', 'android']]);
  assert.equal(guide[1].canvas.layers.find((l) => l.id === 'b').text, 'Текст про «Здоровье»');
  // На каждом устройстве — свой текст, как раньше
  const ios = prepareTopics(toPayload(draftFrom(TOPICS)), { role: 'client', ios: true });
  assert.deepEqual(ios[1].frames.map((f) => f.body), ['Текст про «Здоровье»', 'Часы']);
  const web = prepareTopics(toPayload(draftFrom(TOPICS)), { role: 'client', ios: false });
  assert.deepEqual(web[1].frames.map((f) => f.body), ['Обычный текст', 'Шаги']);
});

test('для старых сборок: заголовок — самый крупный текст, остальное — текстом', () => {
  const payload = toPayload(draftFrom(TOPICS));
  const a = payload[0].frames[0];
  assert.equal(a.heading, 'Новость А');
  assert.equal(a.body, 'Откройте «Питание».');
  assert.equal(a.art, 'nutrition');
  assert.equal(a.tint, '#f5c65c');
  assert.equal(a.date, '8 октября');

  const canvas = {
    bg: { kind: 'gradient', value: 'forest' },
    layers: [
      textLayer('Мелко сверху', { size: 4, y: 0.2 }),
      textLayer('Крупно\nв две строки', { size: 9, y: 0.4 }),
      textLayer('Ещё снизу', { size: 4, y: 0.7 }),
      stickerLayer('photo', { src: '/media/' + 'a'.repeat(24) + '.jpg' }),
    ],
  };
  const old = legacyFields(canvas, 'Тема');
  assert.equal(old.heading, 'Крупно в две строки');
  assert.equal(old.body, 'Мелко сверху\nЕщё снизу');
  assert.equal(old.image, '/media/' + 'a'.repeat(24) + '.jpg');
  assert.equal(old.tint, '#7fd97f', 'цвет — от градиента');
  assert.equal(legacyFields({ bg: { kind: 'color', value: '#000000' }, layers: [] }, 'Как пользоваться').heading, 'Как пользоваться',
    'без текста — заголовок темы: старая сборка без заголовка не покажет кадр');
});

test('отправка: пустые тексты и пустая дата не уходят, лишнего нет', () => {
  const draft = draftFrom(TOPICS);
  const frame = draft[0].frames[0];
  const edited = updateFrame(draft, 0, 0, {
    date: '',
    canvas: { ...frame.canvas, layers: [...frame.canvas.layers, textLayer('   ')] },
  });
  const out = toPayload(edited)[0].frames[0];
  assert.equal('date' in out, false);
  assert.equal(out.canvas.layers.length, 3);
  assert.ok(!sameDraft(edited, draft), 'правка видна — «Сохранить» загорается');
  assert.deepEqual(Object.keys(out).sort(), ['art', 'body', 'canvas', 'heading', 'id', 'tint']);
});

test('новый кадр — за текущим, с новым id и пустым холстом; копия, удаление, порядок', () => {
  const draft = draftFrom(TOPICS);
  const { draft: next, frame } = addFrame(draft, 0, 1760000000000, 1);
  assert.equal(frame, 1);
  assert.equal(next[0].frames.length, 3);
  const id = next[0].frames[1].id;
  assert.match(id, /^f-[a-z0-9-]+$/, 'id подходит серверу');
  assert.deepEqual(next[0].frames[1].canvas.layers, []);
  assert.notEqual(next[0].frames[1].canvas.bg.value, 'paper', 'светлый фон сам не выбирается');

  const moved = moveFrame(next, 0, 1, 0);
  assert.deepEqual(moved[0].frames.map((f) => f.id), [id, 'a', 'b']);
  assert.equal(moveFrame(moved, 0, 0, -1), moved, 'за край — без изменений');
  assert.deepEqual(removeFrame(moved, 0, 0)[0].frames.map((f) => f.id), ['a', 'b']);

  const copy = duplicateFrame(draft, 0, 0, 1760000000000);
  assert.equal(copy[0].frames.length, 3);
  assert.notEqual(copy[0].frames[1].id, 'a');
  assert.deepEqual(copy[0].frames[1].canvas.layers.map((l) => l.text || l.value), draft[0].frames[0].canvas.layers.map((l) => l.text || l.value));
  assert.ok(copy[0].frames[1].canvas.layers.every((l) => /^[a-z0-9]{1,16}$/.test(l.id)), 'id слоёв подходят серверу');
});

test('длинный старый текст — несколькими слоями, каждый в пределе', () => {
  const long = 'Первое предложение про тренировки. '.repeat(20).trim();
  const parts = splitText(long, 400);
  assert.ok(parts.length >= 2);
  assert.ok(parts.every((p) => p.length <= 400));
  assert.equal(parts.join(' '), long);
  const canvas = legacyToCanvas({ heading: 'Заголовок', body: long, tint: '#7fd97f' });
  assert.ok(canvas.layers.filter((l) => l.type === 'text').length >= 3);
});

test('newId не повторяет занятые', () => {
  const now = 1760000000000;
  const first = newId('f', [], now);
  assert.notEqual(newId('f', [first], now), first);
});

test('что мешает сохранить — понятными словами', () => {
  let draft = draftFrom(TOPICS);
  assert.deepEqual(problems(draft), []);
  const many = Array.from({ length: 13 }, () => stickerLayer('arrow'));
  draft = updateFrame(draft, 0, 0, { canvas: { bg: { kind: 'gradient', value: 'night' }, layers: many } });
  assert.match(problems(draft)[0], /«Что нового», кадр 1: слоёв больше 12/);
  draft = updateFrame(draft, 0, 0, { canvas: { bg: { kind: 'gradient', value: 'night' }, layers: [textLayer('я'.repeat(401))] } });
  assert.match(problems(draft)[0], /текст длиннее 400/);
  draft = updateTopic(draftFrom(TOPICS), 1, { label: '' });
  assert.match(problems(draft)[0], /нет подписи на кружке/);
});

test('сводка кадра', () => {
  assert.equal(frameNote({ hidden: true, only: 'ios', date: '8 октября' }), 'скрыт · только iPhone · 8 октября');
  assert.equal(frameNote({ only: 'android' }), 'кроме iPhone');
  assert.equal(frameNote({}), '');
});

test('кадр с холстом из панели проходит как есть', () => {
  const canvas = { bg: { kind: 'color', value: '#2672cd' }, layers: [textLayer('Привет', { id: 'x1' })] };
  const [f] = framesForEditor([{ id: 'n1', heading: 'Привет', body: '', canvas }]);
  assert.equal(f.canvas, canvas);
});
