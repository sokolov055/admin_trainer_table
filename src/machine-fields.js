/**
 * Поля настройки тренажёра (FT-760, решения владельца 26.10.2026).
 *
 * Названия полей («Сиденье», «Спинка») задаёт тренер у тренажёра — их видят
 * все, кто на нём занимается. Значения у каждого клиента свои, в каждом
 * упражнении (FT-759), и любые — текст или число. Клиент может добавить
 * своё поле — оно только у него. Под полями — свободная заметка.
 *
 * На сервере настройка хранится и строкой: «Сиденье 5, спинка 3. Упор
 * левой» (её показывают сборки iPhone до 26.10). Запись без полей — старая
 * или из такой сборки — разбирается по полям тренажёра здесь; что не
 * разобралось, остаётся заметкой.
 */

export const OWN_FIELDS_MAX = 4;

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
const LETTER = /[a-zа-яё]/i;

/** Значение поля name в куске «Сиденье 5» или '' — кусок не про это поле */
function valueIn(part, name) {
  const a = norm(part);
  const b = norm(name);
  if (!b || !a.startsWith(b) || LETTER.test(a.charAt(b.length))) return '';
  return part.slice(b.length).replace(/^[\s:=—–-]+/, '').trim();
}

/**
 * Строка → { values: Map(name → value), rest: [куски] } по полям fields.
 * Длинные названия — первыми: «Высота блока» раньше «Высота»
 */
function parseText(text, fields) {
  const found = new Map();
  const rest = [];
  const names = [...fields].sort((x, y) => y.length - x.length);
  String(text || '').split(/[,;\n]|\.(?:\s|$)/).forEach((raw) => {
    const part = raw.trim();
    if (!part) return;
    const name = names.find((n) => !found.has(n) && valueIn(part, n));
    if (name) found.set(name, valueIn(part, name));
    else rest.push(part);
  });
  return { found, rest };
}

/**
 * Настройка → поля для листа: сначала поля тренажёра по порядку (пустые
 * тоже), потом свои клиента (own). parsed — значения взяты из старой
 * строки: лист просит проверить
 */
export function noteFields(note, fields = []) {
  const list = Array.isArray(fields) ? fields : [];
  if (note && Array.isArray(note.values)) {
    const valueOf = (name) => (note.values.find((v) => norm(v.name) === norm(name)) || {}).value || '';
    const own = note.values.filter((v) => !list.some((name) => norm(name) === norm(v.name))).map((v) => ({ ...v, own: true }));
    return { values: [...list.map((name) => ({ name, value: valueOf(name) })), ...own], note: note.note || '', parsed: false };
  }
  const text = note ? String(note.text || '') : '';
  if (!text || !list.length) return { values: list.map((name) => ({ name, value: '' })), note: text, parsed: false };
  const { found, rest } = parseText(text, list);
  return {
    values: list.map((name) => ({ name, value: found.get(name) || '' })),
    note: found.size ? rest.join(', ') : text,
    parsed: found.size > 0,
  };
}

/**
 * Одной строкой для плашки: «Сиденье 5 · Спинка 3 · …» — до трёх значений;
 * значений нет — заметка (или старая строка как есть)
 */
export function noteSummary(note, fields = []) {
  if (!note) return '';
  const { values, note: rest } = noteFields(note, fields);
  const filled = values.filter((v) => String(v.value || '').trim());
  if (!filled.length) return rest || String(note.text || '');
  const line = filled.slice(0, 3).map((v) => v.name + ' ' + v.value).join(' · ');
  return filled.length > 3 ? line + ' · …' : line;
}

/** Что уходит на сервер: заполненные поля по порядку */
export function valuesToSave(values) {
  return (values || [])
    .map((v) => ({ name: String(v.name || '').trim(), value: String(v.value || '').trim() }))
    .filter((v) => v.name && v.value);
}
