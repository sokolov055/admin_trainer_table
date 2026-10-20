import test from 'node:test';
import assert from 'node:assert/strict';
import { validBarcode, parseLabel } from '../src/nutrition/label-model.js';
import { ocrAssets } from './ocr-assets.mjs';
import { existsSync } from 'node:fs';
test('товарный штрихкод: контрольная цифра, ведущие нули и неподдерживаемый QR', () => {
  for (const code of ['4601234567893', '4006381333931', '96385074', '012345678905']) assert.ok(validBarcode(code), code);
  for (const code of ['4006381333932', '123', 'https://example.org', '', '460123456789']) assert.equal(validBarcode(code), false, code);
});
test('этикетка на 100 г: запятые, нули и кДж не заменяют ккал', () => {
  assert.deepEqual(parseLabel('Пищевая ценность на 100 г\nЭнергия 503 кДж / 120 ккал\nБелки 8,5 г\nЖиры 0 г\nУглеводы 20.5 г').fields, { protein: '8.5', fat: '0', carbs: '20.5', kcal: '120' });
});
test('на 100 мл читается в миллилитрах; порция, две колонки и без базы — не переносятся', () => {
  const drink = parseLabel('Пищевая ценность на 100 мл\nБелки 0 г\nЖиры 0 г\nУглеводы 10,5 г\n42 ккал');
  assert.equal(drink.unit, 'ml');
  assert.deepEqual(drink.fields, { protein: '0', fat: '0', carbs: '10.5', kcal: '42' });
  assert.ok(drink.warnings.some(w => w.includes('в миллилитрах')));
  assert.equal(parseLabel('На 100 г\n50 ккал').unit, 'g');
  for (const basis of ['на порцию', '', 'на 100 г и на порцию', 'на 100 г / на 100 мл', 'на 100 мл и на порцию']) {
    const r = parseLabel(`${basis}\nБелки 5 г\nЖиры 2 г\nУглеводы 4 г\n50 ккал`);
    assert.deepEqual(r.fields, {}, basis);
    assert.equal(r.unit, null, basis);
  }
});
test('неоднозначные колонки, отрицательные и невозможные значения остаются пустыми', () => {
  const r = parseLabel('На 100 г\nБелки 8 г 4 г\nЖиры -2 г\nУглеводы 120 г\n100 ккал / 50 ккал');
  assert.deepEqual(r.fields, {});
  assert.deepEqual(parseLabel('На 100 г\nЭнергия 500 кДж').fields, {});
});
test('worker, движки с fallback и обе модели входят в сборку локально', () => {
  const assets = ocrAssets();
  assert.equal(assets.length, 6);
  for (const [name, path] of assets) assert.ok(existsSync(path), name);
  assert.ok(assets.some(([name]) => name === 'tesseract-core-lstm.wasm.js'));
});
