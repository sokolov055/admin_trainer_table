// Стикерпак настройки и шаги редактора тренажёра (16.11.2026): поиск по
// началу слова, синонимам и с одной опечаткой; подбор стикера к шагу;
// текст настройки ↔ шаги без потерь
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STICKERS, searchStickers, stickerFor, stickerById, oneTypo } from '../src/setup-stickers-search.js';
import { parseSetup, buildSetup } from '../src/trainer/setup-text.js';

const names = (q) => (searchStickers(q) || []).map((s) => s.name);

test('пак: уникальные id, у каждого svg и название', () => {
  assert.equal(new Set(STICKERS.map((s) => s.id)).size, STICKERS.length);
  for (const s of STICKERS) assert.ok(s.svg && s.name && /^[A-Za-z][A-Za-z0-9]*$/.test(s.id), s.id);
});

test('поиск: начало слова, синонимы, несколько слов, опечатка', () => {
  assert.equal(names('платф')[0], 'Платформа');
  assert.ok(names('платф').some((n) => /Гравитрон: разложить/.test(n)), 'подушка гравитрона — «платформа» в синонимах');
  assert.deepEqual(names('спин').slice(0, 2).sort(), ['Спина прижата', 'Спинка']);
  assert.ok(names('сиден').every((n) => /сиденье/i.test(n)));
  assert.deepEqual(names('сиден груд'), ['Жим от груди: сиденье — рукояти у середины груди']);
  assert.ok(names('блин').includes('Диски'));
  assert.ok(names('спинак').slice(0, 2).includes('Спинка'), 'переставленные буквы');
  assert.equal(names('платворма')[0], 'Платформа', 'заменённая буква');
  assert.equal(searchStickers('  '), null);
  assert.deepEqual(names('ЁЖИКзззз'), []);
  assert.ok(oneTypo('спинак', 'спинка') && !oneTypo('спинак', 'стопы'));
});

test('стикер к шагу сам: правило по подписи и тексту, иначе по подписи', () => {
  assert.equal(stickerFor('Высота блоков', 'отведите фиксатор'), 'cableLock');
  assert.equal(stickerFor('Платформа', 'потяните ручку'), 'platform');
  assert.equal(stickerFor('Что-то своё', ''), '');
  assert.ok(stickerById('platform') && !stickerById('<x>'));
});

test('текст настройки ↔ шаги: подпись, главное, подробности, ошибки, стикер и цифра', () => {
  const setup = 'Платформа — Потяните ручку, выберите наклон; Ручка под передним краем.\nПлечевые упоры: подушки на плечах\nПробный присед\nОшибка: незафиксированная платформа, отрыв пяток';
  const meta = [{ s: 'platform', p: [65, 71] }, { s: 'shoulder' }];
  const { steps, avoid } = parseSetup(setup, meta);
  assert.deepEqual(steps.map((s) => [s.label, s.main, s.rest, s.sticker, s.pin]), [
    ['Платформа', 'Потяните ручку, выберите наклон', 'Ручка под передним краем', 'platform', [65, 71]],
    ['Плечевые упоры', 'подушки на плечах', '', 'shoulder', null],
    ['', 'Пробный присед', '', '', null],
  ]);
  assert.deepEqual(avoid, ['незафиксированная платформа', 'отрыв пяток']);
  const out = buildSetup(steps, avoid);
  assert.equal(out.setup, 'Платформа — Потяните ручку, выберите наклон; Ручка под передним краем\nПлечевые упоры — подушки на плечах\nПробный присед\nОшибка: незафиксированная платформа, отрыв пяток');
  assert.deepEqual(out.meta, [{ s: 'platform', p: [65, 71] }, { s: 'shoulder' }], 'пустой хвост срезан');
  // «;» в главном не ломает разбор, пустые шаги не пишутся, «—» в подписи убирается
  const odd = buildSetup([{ label: 'Сиденье — высота', main: 'выше; ниже', rest: '', sticker: '', pin: null }, { label: '', main: '', rest: '', sticker: 'seat', pin: null }], []);
  assert.equal(odd.setup, 'Сиденье высота — выше, ниже');
  assert.deepEqual(odd.meta, []);
});
