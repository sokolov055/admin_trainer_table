import { test } from 'node:test';
import assert from 'node:assert/strict';

// Каталог таблицей (24.10.2026, FT-619): разбор CSV и Excel, что в таблице —
// упражнения или тренажёры, и что уходит на сервер
const {
  parseCsv, toCsv, readSheet, sheetKind, readXlsx, readCatalogFile, exercisesTable, machinesTable, splitUnchanged,
} = await import('../src/trainer/catalog-table.js');

const EXERCISE = {
  id: 7, name: 'Жим в хаммере', muscle: 'Грудь', equipment: 'Тренажёр', notes: 'Лопатки сведены; локти под 45°',
  track: { kind: 'strength', unilateral: false, perSide: true }, mistakes: '', setup: '', media: { kind: 'animation', url: '/anim/press.mp4' },
  machines: [{ uid: 'aa11', name: 'Hammer жим от груди' }], primaryEquipmentUid: 'aa11', alternatives: [{ id: 8, name: 'Жим гантелей' }],
  contentOk: true, setupOk: false,
};
const MACHINE = { uid: 'aa11', name: 'Hammer жим от груди', kind: 'machine', brand: 'Hammer Strength', muscleGroups: ['Грудь'], setup: '', weightStep: 2.5, setupOk: null, uses: [{ id: 7, name: 'Жим в хаммере' }] };

test('CSV: «;» русского Excel, кавычки, переносы в ячейке, BOM', () => {
  const rows = parseCsv('﻿Название;Техника\r\n"Жим; узкий";"строка 1\nстрока 2 ""кавычки"""\r\n');
  assert.deepEqual(rows, [['Название', 'Техника'], ['Жим; узкий', 'строка 1\nстрока 2 "кавычки"']]);
  assert.deepEqual(parseCsv('name,brand\nA,B'), [['name', 'brand'], ['A', 'B']]);
  assert.deepEqual(parseCsv(toCsv([['a;b', 'c"d']])), [['a;b', 'c"d']]);
});

test('вид таблицы — по столбцам; «Что» — у каждой строки', () => {
  assert.equal(sheetKind(['Название', 'Группа мышц', 'Техника']), 'exercises');
  assert.equal(sheetKind(['Название', 'Бренд', 'Шаг веса, кг']), 'machines');
  assert.equal(sheetKind(['Название', 'Как настроить']), null);
  const mixed = readSheet([
    ['Что', 'Название', 'Группа мышц', 'Бренд'],
    ['Упражнение', 'Тяга блока', 'спина', ''],
    ['Оборудование', 'Гантели', '', 'Eleiko'],
    ['Кот', 'Мурзик', '', ''],
  ]);
  assert.equal(mixed.exercises[0].muscle, 'Спина');
  assert.equal(mixed.exercises[0].line, 2);
  assert.deepEqual(mixed.machines[0], { line: 3, name: 'Гантели', brand: 'Eleiko', kind: 'equipment' });
  assert.match(mixed.problems[0], /строка 4/);
  assert.match(readSheet([['Название', 'Заметка'], ['x', 'y']]).problems[0], /не понятно/);
});

test('ячейки: тип учёта словом, «да/нет», пустое «да/нет» не трогает поле', () => {
  const { exercises } = readSheet([['Название', 'Тип учёта', 'Вес с одной стороны', 'На каждую сторону', 'Ошибки'], ['Выпады', 'свой вес', 'нет', '', '']]);
  assert.deepEqual(exercises[0], { line: 2, name: 'Выпады', track: 'bodyweight', perSide: 'нет', mistakes: '' });
});

test('выгрузка загружается обратно и ничего не меняет', () => {
  const ex = readSheet(parseCsv(toCsv(exercisesTable([EXERCISE]))));
  const ma = readSheet(parseCsv(toCsv(machinesTable([MACHINE]))));
  assert.equal(ex.exercises.length, 1);
  assert.equal(ma.machines.length, 1);
  assert.equal(ma.machines[0].weightStep, '2,5');
  const split = splitUnchanged({ exercises: ex.exercises, machines: ma.machines }, { exercises: [EXERCISE], machines: [MACHINE] });
  assert.deepEqual([split.exercises.length, split.machines.length], [0, 0]);
  assert.deepEqual(split.same, { exercises: 1, machines: 1 });
  // Поправили технику — строка уходит; новая — тоже
  ex.exercises[0].notes = 'Другая техника';
  const again = splitUnchanged({ exercises: [...ex.exercises, { line: 3, name: 'Новое' }] }, { exercises: [EXERCISE] });
  assert.equal(again.exercises.length, 2);
});

// Минимальный .xlsx: zip без сжатия и один файл со сжатием deflate
async function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text, deflate] of files) {
    const raw = enc.encode(text);
    const data = deflate
      ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      : raw;
    const n = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, data.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, n.length, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(10, deflate ? 8 : 0, true);
    c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer();
}

test('Excel: листы читаются отдельно, у каждого свой вид', async () => {
  const book = await zip([
    ['xl/workbook.xml', '<workbook><sheets><sheet name="Упражнения" sheetId="1" r:id="rId1"/><sheet name="Тренажёры" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Название</t></si><si><t>Группа мышц</t></si><si><r><t>Жим </t></r><r><t>лёжа</t></r></si><si><t>Грудь</t></si><si><t>Бренд</t></si></sst>', true],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>', true],
    ['xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>4</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Скамья &amp; стойки</t></is></c><c r="C3"><v>12</v></c></row></sheetData></worksheet>'],
  ]);
  const sheets = await readXlsx(book);
  assert.deepEqual(sheets.map((s) => s.title), ['Упражнения', 'Тренажёры']);
  const file = { name: 'каталог.xlsx', arrayBuffer: async () => book };
  const read = await readCatalogFile(file);
  assert.deepEqual(read.problems, []);
  assert.equal(read.exercises[0].name, 'Жим лёжа');
  assert.equal(read.exercises[0].muscle, 'Грудь');
  assert.equal(read.machines[0].name, 'Скамья & стойки');
  assert.equal(read.machines[0].brand, '12');
  assert.equal(read.machines[0].line, 3);
});
