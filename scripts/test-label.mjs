import test from 'node:test';
import assert from 'node:assert/strict';
import { validBarcode, gtinFromCode, parseLabel, labelScore } from '../src/nutrition/label-model.js';
import { ocrAssets } from './ocr-assets.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { localContrast } from '../src/nutrition/label-image.js';
test('товарный штрихкод: контрольная цифра, ведущие нули и неподдерживаемый QR', () => {
  for (const code of ['4601234567893', '4006381333931', '96385074', '012345678905']) assert.ok(validBarcode(code), code);
  for (const code of ['4006381333932', '123', 'https://example.org', '', '460123456789']) assert.equal(validBarcode(code), false, code);
});
test('код «Честного знака»: берём только GTIN в виде с упаковки, серию и криптохвост отбрасываем', () => {
  const gs = String.fromCharCode(29);
  assert.equal(gtinFromCode(`${gs}0104601234567893215Ab1c${gs}93dGVz`), '4601234567893');
  assert.equal(gtinFromCode(']d20104601234567893215Ab1c'), '4601234567893');
  assert.equal(gtinFromCode('(01)04601234567893(21)5Ab1c'), '4601234567893');
  assert.equal(gtinFromCode('0100000096385074215Ab1c'), '96385074');
  assert.equal(gtinFromCode('0100012345678905215Ab1c'), '012345678905');
  assert.equal(gtinFromCode('04601234567893'), '4601234567893');
  assert.equal(gtinFromCode('14601234567890'), '14601234567890');
  assert.equal(gtinFromCode('4601234567893'), '4601234567893');
  for (const code of ['0104601234567894215Ab1c', 'https://example.org/01/04601234567893', '215Ab1c', '', '0104601234']) assert.equal(gtinFromCode(code), '', code);
});
test('этикетка на 100 г: запятые, нули и кДж не заменяют ккал', () => {
  assert.deepEqual(parseLabel('Пищевая ценность на 100 г\nЭнергия 503 кДж / 120 ккал\nБелки 8,5 г\nЖиры 0 г\nУглеводы 20.5 г').fields, { protein: '8.5', fat: '0', carbs: '20.5', kcal: '120' });
});
test('зефир «Фисташка» (FT-748): «1» перед «г» OCR читает как l, I, | или і', () => {
  for (const one of ['l', 'I', '|', 'і']) assert.deepEqual(parseLabel(`Пищевая ценность 100 г продукта (средние значения): белки ${one} г, жиры 10,5 г, углеводы 78 г; энергетическая ценность (калорийность): 1717 кДж (410 ккал).`).fields, { protein: '1', fat: '10.5', carbs: '78', kcal: '410' });
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
// Горчица «Русская» со скриншота владельца 21.10.2026: абзац вместо таблицы,
// тире вместо двоеточия, ккал в скобках после кДж. Раньше: «не удалось подтвердить 100 г».
const MUSTARD = { protein: '9', fat: '5.7', carbs: '14.5', kcal: '145' };
test('горчица: строки абзаца и одна строка целиком', () => {
  const lines = 'Пищевая ценность на 100 г\nпродукта (средние значения):\nбелки — 9 г, жиры — 5,7 г,\nуглеводы — 14,5 г, энергетическая\nценность (калорийность) —\n610 кДж (145 ккал).';
  assert.deepEqual(parseLabel(lines).fields, MUSTARD);
  assert.equal(parseLabel(lines).unit, 'g');
  assert.deepEqual(parseLabel(lines.replace(/\n/g, ' ')).fields, MUSTARD);
  // Две цифры в строке «белки — 9 г, жиры — 5,7 г» больше не отбрасывают оба поля,
  // а одна цифра на строку с двумя словами не попадает сразу в белки и жиры
  assert.deepEqual(parseLabel('На 100 г\nбелки — Sr, жиры — 6 г').fields, { fat: '6' });
});
test('горчица: типичные ошибки Tesseract в базе «на 100 г»', () => {
  const body = '\nбелки — 9 г, жиры — 5,7 г,\nуглеводы — 14,5 г. энергетическая\n610 кДж (145 ккал).';
  for (const head of ['Пищевая ценность HA100T', 'Пищевая ценность на100г', 'Пищевая ценность Ha 100r', 'Пищевая ценность на 1001', 'Пищевая ценность на 100)', 'Пищевая ценность на! 100; г', 'Пищевая ценность (средние значения) в 100 г продукта']) {
    const r = parseLabel(head + body);
    assert.equal(r.basis, '100g', head);
    assert.deepEqual(r.fields, MUSTARD, head);
  }
  // «Масса нетто 100 г» без предлога — это вес банки, а не база значений
  assert.equal(parseLabel('Масса нетто 100 г' + body).basis, 'unknown');
  // «Хранить в упаковке» — не порция
  assert.equal(parseLabel('Пищевая ценность на 100 г' + body + '\nХранить в упаковке').basis, '100g');
});
// Холодец «Мясной» со скриншота владельца 22.10.2026 (FT-701): «100г продукта» слитно,
// без «на», углеводов нет, ккал в скобках после кДж; «O» вместо нуля в «100»
test('холодец: «Пищевая ценность 100г продукта» и буква O вместо нуля', () => {
  const body = ' продукта (средние значения): белки-10г, жиры-10г, энергетическая ценность (калорийность): 540 кДж (130 ккал)';
  for (const head of ['Пищевая ценность 100г', 'Пищевая ценность 100r', 'Пищевая ценность 1OOг', 'Пищевая ценность 1О0 г', 'Пищевая ценность 10oг']) {
    const r = parseLabel(head + body);
    assert.equal(r.basis, '100g', head);
    assert.deepEqual(r.fields, { protein: '10', fat: '10', kcal: '130' }, head);
  }
  // Ноль только внутри числа: «о» в словах и «до +6» не трогаем
  assert.equal(parseLabel('Хранить при температуре от +2 до +6 °С. Масса нетто 350 г').basis, 'unknown');
  assert.deepEqual(parseLabel('На 100 г\nБелки 1О г\nЖиры 2,O г\n130 ккал').fields, { protein: '10', fat: '2', kcal: '130' });
});
test('потерянная запятая и «г», прочитанная как 1, — только если сходится калорийность', () => {
  const r = parseLabel('Пищевая ценность на 100 г\nбелки — 9 жиры — 57 г\nуглеводы — 145; энергетическая\n610 кДж (145 ккал)');
  assert.deepEqual(r.fields, MUSTARD);
  assert.ok(r.warnings.some(w => w.includes('запятых')));
  assert.deepEqual(parseLabel('Пищевая ценность на 100 г\nбелки — 9 г, жиры — 5,7 г,\nУглеводы — 14,51, энергетическая\n610 кДж (145 ккал).').fields, MUSTARD);
  assert.deepEqual(parseLabel('Пищевая ценность на 100 г\nуглеводы — 14:5 г\n145 ккал').fields, { carbs: '14.5', kcal: '145' });
  // Без калорийности проверить нечем: «57» остаётся как прочитано, 145 г — пусто
  assert.deepEqual(parseLabel('На 100 г\nЖиры 57 г\nУглеводы 145 г').fields, { fat: '57' });
  // Жир 57 г при 145 ккал невозможен (513 ккал): подходит только 5,7; при 600 ккал 57 г возможны — как прочитано
  assert.deepEqual(parseLabel('На 100 г\nЖиры 57 г\n145 ккал').fields, { fat: '5.7', kcal: '145' });
  assert.deepEqual(parseLabel('На 100 г\nЖиры 57 г\n600 ккал').fields, { fat: '57', kcal: '600' });
  // Буквальное прочтение не сходится, а исправлений два (12/1/20 и 12/10/2) — БЖУ пусто
  assert.deepEqual(parseLabel('На 100 г\nБелки 12 г\nЖиры 10 г\nУглеводы 20 г\n140 ккал').fields, { kcal: '140' });
  // Сошлось не всё — цифры остаются, но с предупреждением
  const off = parseLabel('На 100 г\nБелки 1 г\nЖиры 1 г\nУглеводы 1 г\n300 ккал');
  assert.deepEqual(off.fields, { protein: '1', fat: '1', carbs: '1', kcal: '300' });
  assert.ok(off.warnings.some(w => w.includes('не сходится')));
});
test('состав, насыщенные жиры и английская этикетка', () => {
  assert.deepEqual(parseLabel('Состав: молоко, белок молочный 80%, жир молочный.\nПищевая ценность на 100 г: белки 10 г, жиры 2 г, в т.ч. насыщенные жиры 1,2 г, углеводы 4 г, 82 ккал').fields, { protein: '10', fat: '2', carbs: '4', kcal: '82' });
  assert.deepEqual(parseLabel('Nutrition per 100 g\nEnergy 1530 kJ / 365 kcal\nFat 12 g\nof which saturates 3 g\nCarbohydrate 55 g\nProtein 8 g').fields, { protein: '8', fat: '12', carbs: '55', kcal: '365' });
});
test('несколько проходов OCR: поле берётся, только когда прочтения сходятся', () => {
  const a = 'Пищевая ценность на 100 г\nбелки — 9 жиры — 57 г\nуглеводы — 145; энергетическая\n610 кДж (145 ккал)';
  const b = 'Пищевая ценность на 1\nбелки — 9 г, жиры — 5,7 г.\nуглеводы — 14,5 г.\n610 кДж (145 ккал).';
  assert.deepEqual(parseLabel([a, b]).fields, MUSTARD);
  assert.deepEqual(parseLabel([b]).fields, {});
  assert.deepEqual(parseLabel(['На 100 г\nБелки 9 г\n145 ккал', 'На 100 г\nБелки 6 г\n145 ккал']).fields, { kcal: '145' });
  // Порция хотя бы в одном прочтении — не угадываем
  assert.equal(parseLabel(['На 100 г\nБелки 9 г', 'На порцию\nБелки 9 г']).unit, null);
  assert.equal(labelScore(parseLabel(a)), 5);
  assert.equal(labelScore(parseLabel(b)), 0);
});
// Настоящий вывод Tesseract по фото горчицы (scripts/fixtures/label-ocr.json)
test('горчица с фото: до правки цифр нет, после — 9 / 5,7 / 14,5 / 145 на 100 г', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/label-ocr.json', import.meta.url), 'utf8'));
  const photo = fx['mustard-photo'];
  assert.equal(Object.keys(parseLabel(photo.old).fields).length, 0);
  // Первое прочтение после контраста уже даёт БЖУ, второе добавляет ккал
  assert.deepEqual(parseLabel([photo.contrast6]).fields, { protein: '9', fat: '5.7', carbs: '14.5' });
  assert.deepEqual(parseLabel([photo.contrast6, photo.contrast11]).fields, MUSTARD);
  // «жиры —» в конце строки и «углезоды — 14,51» ниже: 14,5 не уходит в жиры
  assert.equal(parseLabel([photo.contrast11]).fields.fat, undefined);
  assert.deepEqual(parseLabel([fx['mustard-synthetic'].contrast6]).fields, MUSTARD);
});
test('localContrast: светлый текст на жёлтом и тёмный на белом — тёмный на белом', () => {
  const w = 120, h = 60;
  const draw = (bg, ink) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const on = y >= 25 && y < 35 && x % 12 < 3, c = on ? ink : bg, p = (y * w + x) * 4;
      px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = 255;
    }
    return localContrast(px, w, h, 8);
  };
  for (const [bg, ink] of [[[215, 175, 55], [240, 236, 205]], [[255, 255, 255], [20, 20, 20]], [[200, 30, 30], [250, 240, 60]]]) {
    const out = draw(bg, ink), at = (x, y) => out[(y * w + x) * 4];
    assert.ok(at(13, 30) < 90, 'буква тёмная ' + ink);
    assert.ok(at(18, 30) > 200, 'фон между буквами светлый ' + bg);
    assert.ok(at(60, 5) > 200, 'фон вдали белый ' + bg);
  }
});
test('снимок экрана «Честного знака»: числа над подписями и «Пищевые волокна» под белками', () => {
  // Текст — как его склеивает распознавание iPhone (строки по высоте, слева направо)
  const tuna = parseLabel('Рыбные консервы Тунец ЛЕНТА\nкусочками в масле 185г\nТовар продан 21 октября 2026\nКитай 185 г Без ГМО\nНа 100 грамм\n16,8 16,3 0,6 215,3\nбелки жиры углеводы ккал\nОбъём / Вес\n185 г\nСостав\nКусочки рыбы (Skipjack Tuna) тунец, масло\nсоевое, вода, соль.');
  assert.deepEqual(tuna.fields, { kcal: '215.3', protein: '16.8', fat: '16.3', carbs: '0.6' });
  const yogurt = parseLabel('На 100 г На весь продукт\nNEO 230г Йогурт «Греческий\nКлассический», м.д.ж. 2,0 %\n68 ккал на 100 г\nДанные на 100 г\nЖиры 2 г\nНизкое содержание\nБелки 8 г\nВитамины и минералы 9\nДобавленный сахар 0 г\nТрансжиры 0 г\nСоль 0 г\nПищевые волокна 0 г');
  assert.deepEqual(yogurt.fields, { kcal: '68', protein: '8', fat: '2' });
  assert.deepEqual(parseLabel('На 100 г На весь продукт\n0 г 0 г 2 г 0 г\nСахар Соль Жиры Трансжиры').fields, { fat: '2' });
  // Таблица на упаковке «подписи над числами» — так же
  assert.deepEqual(parseLabel('Пищевая ценность на 100 г\nБелки Жиры Углеводы\n3,2 2,5 4,7\n55 ккал').fields, { kcal: '55', protein: '3.2', fat: '2.5', carbs: '4.7' });
});
