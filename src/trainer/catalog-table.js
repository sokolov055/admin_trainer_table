/**
 * Каталог таблицей (владелец, 24.10.2026; FT-619): упражнения и тренажёры
 * пачкой из CSV или Excel и обратно — без React, чтобы проверял тест
 * (scripts/test-catalog-table.mjs). Пишет сервер (lib/catalog-import.js),
 * здесь — разбор файла и решение, что в нём: упражнения или тренажёры.
 *
 * Что в таблице, видно по столбцам: «Группа мышц», «Техника», «Замены» —
 * упражнения; «Бренд», «Вид», «Шаг веса» — тренажёры. В одной таблице
 * можно и то и другое — тогда столбец «Что» у каждой строки («упражнение»,
 * «тренажёр», «оборудование»). В Excel — каждый лист отдельно.
 *
 * Нет столбца — поле не трогаем; пустая ячейка — поле очищают (у «да/нет»
 * пустая — не трогаем). Строки, где всё как в базе, не отправляются:
 * повторная загрузка той же таблицы ничего не меняет.
 */

export const EXERCISE_COLUMNS = [
  ['id', 'id'],
  ['name', 'Название'],
  ['muscle', 'Группа мышц'],
  ['equipment', 'Оборудование'],
  ['track', 'Тип учёта'],
  ['unilateral', 'На каждую сторону'],
  ['perSide', 'Вес с одной стороны'],
  ['notes', 'Техника'],
  ['mistakes', 'Ошибки'],
  ['setup', 'Как настроить'],
  ['link', 'Видео'],
  ['machines', 'Тренажёры'],
  ['primary', 'Основной тренажёр'],
  ['alternatives', 'Замены'],
  ['contentOk', 'Техника проверена'],
  ['setupOk', 'Настройка проверена'],
];

export const MACHINE_COLUMNS = [
  ['uid', 'uid'],
  ['name', 'Название'],
  ['kind', 'Вид'],
  ['originalName', 'Оригинальное название'],
  ['brand', 'Бренд'],
  ['muscleGroups', 'Группы мышц'],
  ['setup', 'Как настроить'],
  ['weightStep', 'Шаг веса, кг'],
  ['setupOk', 'Настройка проверена'],
];

// Только для чтения: в выгрузке есть, при загрузке пропускается
const MACHINE_USES = 'Где используется';

// Другие подписи тех же столбцов — как их могли назвать в своей таблице
const ALIASES = {
  exercises: { упражнение: 'name', группа: 'muscle', мышцы: 'muscle', тип: 'track', учет: 'track', видеоссылка: 'link', ссылка: 'link', анимация: 'link', замена: 'alternatives', тренажер: 'machines', инструкция: 'setup', настройка: 'setup' },
  machines: { тренажер: 'name', оборудование: 'name', бренд: 'brand', производитель: 'brand', марка: 'brand', шаг: 'weightStep', шагвеса: 'weightStep', инструкция: 'setup', настройка: 'setup', тип: 'kind' },
};

// Столбцы, которые бывают только у одного вида карточек
const ONLY = {
  exercises: ['id', 'muscle', 'equipment', 'track', 'unilateral', 'perSide', 'notes', 'mistakes', 'link', 'machines', 'primary', 'alternatives', 'contentOk'],
  machines: ['uid', 'kind', 'originalName', 'brand', 'muscleGroups', 'weightStep'],
};

const BOOLEAN = new Set(['unilateral', 'perSide', 'contentOk', 'setupOk']);

const TRACKS = [['strength', 'Силовое'], ['bodyweight', 'Свой вес'], ['timed', 'На время'], ['cardio', 'Кардио'], ['auto', 'Авто']];
const KINDS = [['machine', 'Тренажёр'], ['equipment', 'Оборудование']];

const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

function columnOf(sheet, header) {
  const h = norm(header);
  if (!h) return null;
  const cols = sheet === 'exercises' ? EXERCISE_COLUMNS : MACHINE_COLUMNS;
  const hit = cols.find(([, label]) => norm(label) === h);
  if (hit) return hit[0];
  if (sheet === 'machines' && norm('Шаг веса') === h) return 'weightStep';
  return ALIASES[sheet][h] || null;
}

/** Что за таблица — по заголовкам; null — не понять */
export function sheetKind(headers) {
  const score = (sheet) => headers.filter((h) => ONLY[sheet].includes(columnOf(sheet, h))).length;
  const ex = score('exercises');
  const ma = score('machines');
  if (ex === ma) return null;
  return ex > ma ? 'exercises' : 'machines';
}

/** Вид строки по столбцу «Что» */
function rowKind(value) {
  const v = norm(value);
  if (!v) return null;
  if (v.startsWith('упраж')) return { sheet: 'exercises' };
  if (v.startsWith('трен')) return { sheet: 'machines', kind: 'machine' };
  if (v.startsWith('оборуд') || v.startsWith('инвентар')) return { sheet: 'machines', kind: 'equipment' };
  return { error: `в столбце «Что» — «${value}»: нужно «упражнение», «тренажёр» или «оборудование»` };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** Ячейка → значение поля для сервера; undefined — поле не трогать */
function cell(field, raw) {
  const v = String(raw ?? '').replace(/\r/g, '').trim();
  if (BOOLEAN.has(field)) return v ? v : undefined;
  if (field === 'track') {
    if (!v) return undefined;
    const t = TRACKS.find(([, label]) => norm(label) === norm(v)) || TRACKS.find(([key]) => key === v);
    return t ? t[0] : v;
  }
  if (field === 'kind') {
    if (!v) return undefined;
    const k = KINDS.find(([, label]) => norm(label) === norm(v)) || KINDS.find(([key]) => key === v);
    return k ? k[0] : v;
  }
  if (field === 'muscle') return cap(v);
  if (field === 'muscleGroups') return v.split(/[;,\n]/).map((s) => cap(s.trim())).filter(Boolean).join(';');
  return v;
}

/**
 * Лист таблицы (строки — массивы ячеек, первая — заголовки) → строки
 * упражнений и тренажёров. line — номер строки в таблице, как в Excel.
 */
export function readSheet(grid, title = '') {
  const out = { exercises: [], machines: [], problems: [] };
  const rows = (grid || []).filter((r) => r && r.some((c) => String(c ?? '').trim()));
  if (!rows.length) return out;
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const whatCol = headers.findIndex((h) => ['что', 'карточка', 'видкарточки'].includes(norm(h)));
  const kind = sheetKind(headers);
  const where = title ? `«${title}»: ` : '';
  if (whatCol === -1 && !kind) {
    out.problems.push(`${where}не понятно, упражнения это или тренажёры. Подпишите столбцы как в выгрузке или добавьте столбец «Что».`);
    return out;
  }
  if (!headers.some((h) => norm(h) === 'название' || columnOf('exercises', h) === 'name' || columnOf('machines', h) === 'name')) {
    out.problems.push(`${where}нет столбца «Название».`);
  }
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    // Номер строки как в Excel: пустые строки над таблицей тоже считаются
    const line = grid.indexOf(r) + 1;
    const row = whatCol === -1 ? { sheet: kind } : rowKind(r[whatCol]) || (kind ? { sheet: kind } : { error: 'пусто в столбце «Что»' });
    if (row.error) { out.problems.push(`${where}строка ${line}: ${row.error}`); continue; }
    const item = { line };
    headers.forEach((h, c) => {
      if (c === whatCol) return;
      const field = columnOf(row.sheet, h);
      if (!field) return;
      const value = cell(field, r[c]);
      if (value !== undefined) item[field] = value;
    });
    if (row.kind && item.kind === undefined) item.kind = row.kind;
    out[row.sheet].push(item);
  }
  return out;
}

/* ==========================================================================
 * CSV
 * ========================================================================== */

/** CSV → строки ячеек. Разделитель — «;» (русский Excel), «,» или табуляция */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { value += '"'; i += 1; } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"' && value === '') quoted = true;
    else if (ch === sep) { row.push(value); value = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += ch;
  }
  if (value !== '' || row.length) { row.push(value); rows.push(row); }
  return rows;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Строки → CSV, который русский Excel откроет столбцами и с буквами */
export function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/* ==========================================================================
 * Excel (.xlsx) — zip с XML внутри; без библиотеки
 * ========================================================================== */

const decodeXml = (s) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  const named = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[e.toLowerCase()];
  if (named) return named;
  return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
});

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Файлы zip-архива: имя → функция, отдающая текст */
function unzip(buffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = data.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('Файл не похож на Excel (.xlsx).');
  const total = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const files = new Map();
  const utf8 = new TextDecoder();
  for (let i = 0; i < total; i += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(data.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = data.subarray(start, start + size);
    files.set(name, async () => utf8.decode(method === 0 ? raw : await inflate(raw)));
    p += 46 + nameLen + extra + comment;
  }
  return files;
}

const colIndex = (ref) => {
  const letters = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');

/** .xlsx → листы [{ title, grid }] */
export async function readXlsx(buffer) {
  const files = unzip(buffer);
  const read = (name) => (files.has(name) ? files.get(name)() : Promise.resolve(''));
  const shared = [...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = /Id="([^"]+)"/.exec(m[0]);
    const to = /Target="([^"]+)"/.exec(m[0]);
    return [id && id[1], to && to[1]];
  }));
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    title: decodeXml((/name="([^"]*)"/.exec(m[0]) || [])[1] || ''),
    path: target.get((/r:id="([^"]+)"/.exec(m[0]) || [])[1]),
  })).filter((s) => s.path);
  const out = [];
  for (const s of sheets) {
    const path = s.path.startsWith('/') ? s.path.slice(1) : 'xl/' + s.path.replace(/^\.\//, '');
    const xml = await read(path);
    const grid = [];
    for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = Number((/\br="(\d+)"/.exec(row[1]) || [])[1]) || grid.length + 1;
      const cells = [];
      for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (/\br="([A-Z]+\d+)"/.exec(c[1]) || [])[1];
        const type = (/\bt="([^"]+)"/.exec(c[1]) || [])[1];
        const body = c[2] || '';
        const v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        let value = '';
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = textOf(body);
        else if (type === 'b') value = v === '1' ? 'да' : 'нет';
        else if (v !== undefined) value = decodeXml(v);
        cells[ref ? colIndex(ref) : cells.length] = value;
      }
      grid[r - 1] = Array.from(cells, (x) => x ?? '');
    }
    out.push({ title: s.title, grid: Array.from(grid, (x) => x || []) });
  }
  return out;
}

/* ==========================================================================
 * Файл → строки; база → таблица
 * ========================================================================== */

/** Прочитать выбранный файл: CSV, TSV или .xlsx */
export async function readCatalogFile(file) {
  const name = String(file.name || '').toLowerCase();
  const buffer = await file.arrayBuffer();
  const isZip = new Uint8Array(buffer.slice(0, 2)).join() === '80,75';
  if (name.endsWith('.xls') && !isZip) throw new Error('Старый формат .xls не читается — сохраните как .xlsx или CSV.');
  const sheets = isZip ? await readXlsx(buffer) : [{ title: '', grid: parseCsv(new TextDecoder().decode(buffer)) }];
  const out = { exercises: [], machines: [], problems: [] };
  for (const s of sheets) {
    const part = readSheet(s.grid, sheets.length > 1 ? s.title : '');
    // Лист без строк (пустой третий лист Excel) — не ошибка
    if (!part.exercises.length && !part.machines.length && s.grid.filter((r) => r && r.some((c) => String(c).trim())).length <= 1) continue;
    out.exercises.push(...part.exercises.map((r) => (sheets.length > 1 ? { ...r, sheetTitle: s.title } : r)));
    out.machines.push(...part.machines.map((r) => (sheets.length > 1 ? { ...r, sheetTitle: s.title } : r)));
    out.problems.push(...part.problems);
  }
  return out;
}

const yes = (v) => (v ? 'да' : 'нет');
const trackLabel = (t) => {
  if (!t || t.auto) return 'Авто';
  return (TRACKS.find(([key]) => key === t.kind) || TRACKS[0])[1];
};

/** Упражнение базы → строка таблицы (ключ поля → текст ячейки) */
export function exerciseCells(e) {
  const primary = (e.machines || []).find((m) => m.uid === e.primaryEquipmentUid);
  return {
    id: String(e.id),
    name: e.name || '',
    muscle: e.muscle || '',
    equipment: e.equipment || '',
    track: trackLabel(e.track),
    unilateral: yes(e.track && e.track.unilateral),
    perSide: yes(e.track && e.track.perSide),
    notes: e.notes || '',
    mistakes: e.mistakes || '',
    setup: e.setup || '',
    link: (e.media && e.media.url) || '',
    machines: (e.machines || []).map((m) => m.name).join('; '),
    primary: primary ? primary.name : '',
    alternatives: (e.alternatives || []).map((a) => a.name).join('; '),
    contentOk: yes(e.contentOk),
    setupOk: yes(e.setupOk),
  };
}

/** Тренажёр каталога → строка таблицы */
export function machineCells(m) {
  return {
    uid: m.uid,
    name: m.name || '',
    kind: (KINDS.find(([key]) => key === m.kind) || KINDS[0])[1],
    originalName: m.originalName || '',
    brand: m.brand || '',
    muscleGroups: (m.muscleGroups || []).join('; '),
    setup: m.setup || '',
    weightStep: m.weightStep ? String(m.weightStep).replace('.', ',') : '',
    setupOk: yes(m.setupOk),
  };
}

/** Выгрузка: упражнения таблицей — в том же виде загружается обратно */
export function exercisesTable(exercises) {
  return [EXERCISE_COLUMNS.map(([, label]) => label), ...(exercises || []).map((e) => {
    const c = exerciseCells(e);
    return EXERCISE_COLUMNS.map(([key]) => c[key]);
  })];
}

/** Выгрузка: тренажёры таблицей; «Где используется» — только посмотреть */
export function machinesTable(machines) {
  return [[...MACHINE_COLUMNS.map(([, label]) => label), MACHINE_USES], ...(machines || []).map((m) => {
    const c = machineCells(m);
    return [...MACHINE_COLUMNS.map(([key]) => c[key]), (m.uses || []).map((u) => u.name).join('; ')];
  })];
}

const nameKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const cmp = (field, v) => {
  const s = String(v ?? '').replace(/\r/g, '').trim();
  if (BOOLEAN.has(field)) return /^(да|yes|true|1|\+|x|х|✓)$/i.test(s) ? 'да' : 'нет';
  if (field === 'machines' || field === 'alternatives' || field === 'muscleGroups') return s.split(/[;\n]/).map(nameKey).filter(Boolean).join(';');
  if (field === 'weightStep') return s.replace(',', '.').replace(/\.0+$/, '');
  return field === 'track' || field === 'kind' || field === 'name' || field === 'muscle' ? nameKey(s) : s;
};

/**
 * Разделить строки на те, где что-то меняется (их проверит и запишет
 * сервер), и те, где всё как в базе. Так повторная загрузка той же
 * таблицы ничего не шлёт, а запрос не упирается в предел размера.
 */
export function splitUnchanged({ exercises = [], machines = [] }, base = {}) {
  const exById = new Map((base.exercises || []).map((e) => [String(e.id), e]));
  const exByName = new Map((base.exercises || []).map((e) => [nameKey(e.name), e]));
  const maByUid = new Map((base.machines || []).map((m) => [m.uid, m]));
  const maByName = new Map((base.machines || []).map((m) => [nameKey(m.name), m]));
  const sameAs = (row, cells) => Object.keys(row).every((k) => {
    if (k === 'line' || k === 'sheetTitle' || cells[k] === undefined) return true;
    const a = k === 'track' ? (TRACKS.find(([key]) => key === row[k]) || [0, row[k]])[1] : k === 'kind' ? (KINDS.find(([key]) => key === row[k]) || [0, row[k]])[1] : row[k];
    return cmp(k, a) === cmp(k, cells[k]);
  });
  const ex = exercises.filter((r) => {
    const e = (r.id && exById.get(String(r.id))) || (!r.id && exByName.get(nameKey(r.name)));
    return !e || !sameAs(r, exerciseCells(e));
  });
  const ma = machines.filter((r) => {
    const m = (r.uid && maByUid.get(r.uid)) || (!r.uid && maByName.get(nameKey(r.name)));
    return !m || !sameAs(r, machineCells(m));
  });
  return {
    exercises: ex, machines: ma,
    same: { exercises: exercises.length - ex.length, machines: machines.length - ma.length },
  };
}
