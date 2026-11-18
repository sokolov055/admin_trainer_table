// Цвета-данные (макет colors-mockup-2026-11-17.html, 18.11.2026): тон
// тренировки программы — как буква в «Назначить», тон группы мышц.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slotTones, slotClass, slotLetter, muscleTone } from '../src/data-tones.js';

const ex = (o = {}) => ({ name: 'x', ...o });
const cardio = { title: 'Кардио', exercises: [ex({ cardio: { kind: 'run' } })] };

test('тренировки программы: по порядку занятий, кардио — своим цветом без номера', () => {
  const m = slotTones([
    { title: 'Верх', exercises: [ex()] },
    { title: 'Кардио после', with: true, exercises: [ex({ cardio: {} })] },
    cardio,
    { title: 'Низ', exercises: [ex()] },
    { title: 'Верх', week: 2, exercises: [ex()] },
  ]);
  assert.equal(m.get('Верх'), 0);
  assert.equal(m.get('Кардио после'), 0, 'добавка «вместе с» — тон своего занятия');
  assert.equal(m.get('Кардио'), 'cardio');
  assert.equal(m.get('Низ'), 1);
  assert.equal(slotClass(0), 'tone-s0');
  assert.equal(slotClass(7), 'tone-s1', 'цвет по кругу из 6');
  assert.equal(slotClass('cardio'), 'tone-cardio');
  assert.equal(slotClass(undefined), '');
  assert.equal(slotLetter(1), 'Б');
  assert.equal(slotLetter('cardio'), '');
});

test('группа мышц: по группе из базы, иначе по основной мышце; «Всё тело» — без цвета', () => {
  assert.equal(muscleTone(ex({ exercise: { muscle: 'Ноги' } })), 'legs');
  assert.equal(muscleTone(ex({ exercise: { muscle: 'Плечи' } })), 'chest');
  assert.equal(muscleTone(ex({ exercise: { muscle: 'Предплечье' } })), 'arms');
  assert.equal(muscleTone(ex({ exercise: { muscle: 'Всё тело' } })), '');
  assert.equal(muscleTone(ex({ muscles: { primary: ['lats'] } })), 'back');
  assert.equal(muscleTone({ group: '', primary: ['abs'] }), 'core');
  assert.equal(muscleTone(ex({ cardio: {} })), 'cardio');
  assert.equal(muscleTone(null), '');
});

test('токены и классы тонов объявлены, тёмная тема плотнее подложка', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const t of ['--mg-legs', '--mg-back', '--mg-core', '--mg-chest', '--mg-arms', '--kind-cardio', '--slot-5-end', '--goal-lose', '--ava-5']) assert.ok(css.includes(t + ':'), t);
  for (const c of ['.tone-s0', '.tone-s5', '.tone-cardio', '.tone-legs', '.tone-arms']) assert.ok(css.includes(c + ' {'), c);
  assert.equal((css.match(/--tone-wash: 22%/g) || []).length, 2, 'оба тёмных блока');
});
