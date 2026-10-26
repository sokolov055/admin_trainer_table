import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPhone, looksLikeEmail, parseTrainerLink } from '../src/phone-format.js';

/**
 * Экран входа и регистрации по номеру (FT-769): одно поле «Номер или почта»
 * и вставленная ссылка тренера. Ошибка здесь — человек ввёл верное, а экран
 * отправил его не туда.
 */

test('номер в любом привычном виде — +7 и десять цифр', () => {
  assert.equal(formatPhone('89164821507'), '+7 916 482-15-07');
  assert.equal(formatPhone('9164821507'), '+7 916 482-15-07');
  assert.equal(formatPhone('+7 (916) 482 15 07 99'), '+7 916 482-15-07');
});

test('почта или номер — по виду', () => {
  assert.equal(looksLikeEmail(' anna@mail.ru '), true);
  assert.equal(looksLikeEmail('+7 916 482-15-07'), false);
  assert.equal(looksLikeEmail('anna@mail'), false);
});

test('ссылка тренера: полная, код из неё; персональная — открыть, мусор — нет', () => {
  assert.deepEqual(parseTrainerLink('https://app.fitness100.ru/?trainer=AbC_-123xyz'), { token: 'AbC_-123xyz' });
  assert.deepEqual(parseTrainerLink('  7K2QM4  '), { token: '7K2QM4' });
  assert.ok(parseTrainerLink('https://app.fitness100.ru/?access=abc').open);
  assert.equal(parseTrainerLink('привет, вот ссылка'), null);
  assert.equal(parseTrainerLink(''), null);
});
