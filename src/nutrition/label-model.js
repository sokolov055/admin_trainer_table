// OCR предлагает только однозначные значения. Не угадываем пропущенные цифры,
// колонку таблицы и вес порции. Этикетка напитка «на 100 мл» читается как
// есть: продукт заводится в миллилитрах, плотность не нужна.
export function validBarcode(value) {
  const code = String(value || '').trim();
  if (!/^(?:\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number), check = digits.pop();
  const sum = digits.reverse().reduce((s, n, i) => s + n * (i % 2 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === check;
}

// Код «Честного знака» (GS1 DataMatrix): 01 + GTIN-14, дальше 21 + серийный номер и
// криптохвост. Берём только GTIN — серия и подпись принадлежат одной пачке, хранить их
// незачем. GTIN-14 сокращаем до вида с упаковки (EAN-13, UPC-A, EAN-8), как в базе.
// Сканер отдаёт код с префиксом «]d2» или символом GS (FNC1) в начале, человек — «(01)…».
export function gtinFromCode(value) {
  const code = String(value || '').trim();
  const gtin = validBarcode(code) ? code : code.replace(/^\][dQC]\d/, '').replace(/^\x1d+/, '').match(/^(?:\(01\)|01)(\d{14})/)?.[1];
  if (!gtin || !validBarcode(gtin)) return '';
  if (gtin.length < 14) return gtin;
  return gtin.startsWith('000000') ? gtin.slice(6) : gtin.startsWith('00') ? gtin.slice(2) : gtin.startsWith('0') ? gtin.slice(1) : gtin;
}

// Tesseract с rus+eng путает похожие буквы: «на» → «ha», «г» → «r», «ккал» → «kkaл».
// Замена посимвольная, длина строки не меняется: позиции совпадают с исходным текстом,
// английские слова (protein, kcal) ищем в исходном, русские — в заменённом.
const LOOKALIKE = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', r: 'г', t: 'т', x: 'х', y: 'у' };
const cyr = s => s.replace(/[a-z]/g, ch => LOOKALIKE[ch] || ch);

// База «на 100 г / 100 мл». После «100» OCR вместо «г» видит «r», «т», «)», «;», «1», «7»:
// «на100г», «HA 100T», «на 1001». Предлог обязателен — «масса нетто 100 г» не база.
// Русские шаблоны — по заменённому тексту, английские — по исходному.
// «на» бывает слито с предыдущим словом («ценностына 100»), «в» — только отдельным словом.
const GRAM_BASIS = [/(?:на|(?<![а-я])в)\s*[!.,:]?\s*100\s*(?:г|т(?![а-я])|[);:/](?!\s*мл)|[17](?![\d.,]))|100\s*г\.?\s*продукт/, /(?:per|in)\s*100\s*g/];
const ML_BASIS = [/(?:на|(?<![а-я])в)\s*[!.,:]?\s*100\s*(?:мл|мп|м1)/, /(?:per|in)\s*100\s*ml/];
// «Хранить в упаковке» — не порция, поэтому упаковку здесь не ищем
const PORTION = [/(?:на|в)\s*(?:одну\s*)?порци|на\s*1\s*(?:шт|ломтик|пакет|бутылк|стакан)/, /per\s*serving/];
const both = ([ru, en], t, raw) => ru.test(t) || en.test(raw);

// Ключевые слова. Жир — не «жирность»/«жирные кислоты», не «обезжиренный» и не «насыщенные жиры».
const KEYS = {
  protein: { ru: /(?<![а-я])[б6]ел(?:к|ок)/g, en: /\bproteins?\b/g },
  fat: { ru: /(?<![а-я])жир(?!н)/g, en: /\b(?:total\s+)?fat\b/g, skip: /(?:насыщ|транс|saturat|trans)[^\n]{0,12}$/ },
  carbs: { ru: /(?<![а-я])угле[вз]од/g, en: /\bcarbohydrates?\b|\bcarbs\b/g },
};
// После ключевого слова значение ищем до следующего слова из списка
const STOP_RU = /(?<![а-я])(?:[б6]ел[ко]|жир|угле[вз]од|энерг|калор|ккал|кдж|сахар|клетч|волок|пищев|соль|натри|насыщ|в\s*т\.?\s*ч|в том числ|из них|витамин|кальци|железо|срок|хранит|масса|нетто|изготов|состав)/g;
const STOP_EN = /\b(?:protein|fat|carbohydrate|energy|kcal|sugars?|fib(?:re|er)|salt|sodium|saturate|of which)/g;

const num = s => Number(s.replace(/[,: ]/, '.'));
// Числа сегмента: «14,5», «14:5» и «5 7 г» (запятая прочитана двоеточием или пробелом),
// но не «-2» и не «70%». «14,51» без единицы после — это «14,5 г», у которой «г» прочитана единицей.
// rest — текст сразу за сегментом: «углеводы 4 г, 82 ккал» — 82 относится к ккал, а не к углеводам
function segmentNumbers(seg, rest = '') {
  const out = [];
  let bad = false;
  // Одиночная «1» перед «г» читается как «l», «I», «|», «!» или «і»: «белки l г» — это «белки 1 г» (FT-748)
  seg = seg.replace(/(^|[\s:])[lI|!іi](?=\s*[гgr](?![а-яa-z]))/g, '$11');
  for (const m of seg.matchAll(/(\d+(?:[.,:]\d+| \d(?=\s*[гg](?![а-яa-z])))?)(\s*%)?/g)) {
    if (m[2]) continue;
    const before = seg.slice(0, m.index);
    if (/(?:^|\s)-$/.test(before)) bad = true;          // «Жиры -2 г»: отрицательное — не берём
    let token = m[1];
    const after = seg.slice(m.index + m[0].length) + rest;
    if (/^\s*(?:ккал|кдж|kcal|kj)/.test(after)) continue;
    if (/^\d+[.,]\d[17]$/.test(token) && !/^\s*[гgr]/.test(after)) token = token.slice(0, -1);
    out.push(token);
  }
  return { tokens: out, bad };
}

// Варианты одного прочтения: «57» может быть «5,7» — OCR теряет запятую
function variants(token) {
  const v = num(token), list = [v];
  if (/^\d{2,3}$/.test(token)) list.push(v / 10);
  return list;
}

// Плитки «число над подписью» — снимок экрана «Честного знака», таблица в строку:
// «16,8 16,3 0,6 215,3\nбелки жиры углеводы ккал» → «белки 16,8\n…\n215,3 ккал».
// Пара соседних строк: в одной только числа, в другой столько же слов, среди них БЖУ
const NUM_ROW = /^\s*(?:\d+(?:[.,]\d+)?\s*(?:г|g|мг|ккал|kcal)?\.?\s+)*\d+(?:[.,]\d+)?\s*(?:г|g|мг|ккал|kcal)?\.?\s*$/i;
const NUTRIENT = /^(?:[б6]ел(?:ки|ок)|жиры?|углеводы|ккал|proteins?|fat|carbs|carbohydrates?|kcal)$/i;
function columns(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i].trim().split(/\s+/);
    if (words.length < 2 || words.some(w => /\d/.test(w)) || !words.some(w => NUTRIENT.test(w))) continue;
    for (const j of [i - 1, i + 1]) {
      if (!NUM_ROW.test(lines[j] ?? '')) continue;
      const nums = [...lines[j].matchAll(/(\d+(?:[.,]\d+)?)\s*((?:г|g|мг)(?![а-яa-z])\.?)?/gi)];
      if (nums.length !== words.length) continue;
      lines[i] = words.map((w, k) => /^(?:ккал|kcal)$/i.test(w)
        ? `${nums[k][1]} ${w}` : `${w} ${nums[k][1]}${nums[k][2] ? ' ' + nums[k][2] : ''}`).join('\n');
      lines[j] = '';
      break;
    }
  }
  return lines.join('\n');
}

function extract(text) {
  // «1OOг», «1О0 г»: буква «о» внутри числа — ноль (длина та же, позиции не сдвигаются)
  const raw = columns(String(text || '')).toLowerCase().replace(/ё/g, 'е').replace(/[^\S\n]/g, ' ').replace(/[\doо]*\d[\doо]*/g, m => m.replace(/[oо]/g, '0'));
  const t = cyr(raw);
  const grams = both(GRAM_BASIS, t, raw), ml = both(ML_BASIS, t, raw), portion = both(PORTION, t, raw);
  const basis = portion ? 'portion' : grams && ml ? 'mixed' : grams ? '100g' : ml ? '100ml' : 'unknown';
  // Состав выше таблицы тоже говорит «белок», «жир»: начинаем с «Пищевая ценность», если она прочитана.
  // «Пищевые волокна» — строка таблицы, а не её начало: на экране «Честного знака» она ниже белков
  const start = Math.max(0, t.search(/пищев(?!ы[ех]\s*волок)|nutrition/));
  const stops = [...t.matchAll(STOP_RU), ...raw.matchAll(STOP_EN)].map(m => m.index).filter(i => i >= start).sort((a, b) => a - b);
  const values = {}, ambiguous = new Set();
  for (const [key, spec] of Object.entries(KEYS)) {
    const before = (s, i) => s.slice(Math.max(0, i - 16), i);
    const hits = [...t.matchAll(spec.ru), ...raw.matchAll(spec.en)].filter(m => m.index >= start && !(spec.skip && (spec.skip.test(before(t, m.index)) || spec.skip.test(before(raw, m.index)))));
    const tokens = new Set();
    for (const m of hits) {
      const from = m.index + m[0].length, end = stops.find(i => i > m.index) ?? t.length;
      let seg = t.slice(from, end);
      // Значение — в той же строке. Следующая строка подходит, только если с числа
      // и начинается (таблица «Белки\n9 г»): иначе через строку-мусор OCR цифра
      // соседнего поля с искажённым названием («углезоды — 14,5») ушла бы в жиры.
      const nl = seg.indexOf('\n');
      if (nl >= 0) {
        if (/\d/.test(seg.slice(0, nl))) seg = seg.slice(0, nl);
        else {
          const next = seg.slice(nl + 1), stop = next.indexOf('\n');
          seg = /^[^\da-zа-я]*\d/.test(next) ? (stop >= 0 ? next.slice(0, stop) : next) : '';
        }
      }
      const { tokens: found, bad } = segmentNumbers(seg, seg.length === end - from ? t.slice(end, end + 6) : '');
      if (bad || found.length > 1) ambiguous.add(key);
      else if (found.length === 1) tokens.add(found[0]);
    }
    if (tokens.size > 1) ambiguous.add(key);
    if (!ambiguous.has(key) && tokens.size === 1) values[key] = [...tokens][0];
  }
  // Число и «ккал» — в одной строке: «углеводы — 14,57\nккал)» не калорийность
  const kcals = new Set([...t.matchAll(/(\d+(?:[.,]\d+)?)[ \t]*ккал/g), ...raw.matchAll(/(\d+(?:[.,]\d+)?)[ \t]*kcal/g)].map(m => m[1].replace(',', '.')));
  const kcalBad = /-\s*\d+(?:[.,]\d+)?\s*ккал/.test(t) || /-\s*\d+(?:[.,]\d+)?\s*kcal/.test(raw) || kcals.size > 1;
  return { basis, values, ambiguous, kcal: !kcalBad && kcals.size === 1 ? [...kcals][0] : null, kcalAmbiguous: kcalBad };
}

const WARN = {
  mixed: 'На этикетке есть и значения на 100 г, и на 100 мл. Выберите одну колонку и внесите цифры вручную.',
  portion: 'На этикетке есть значения на порцию. Выберите значения на 100 г или 100 мл и внесите их вручную.',
  unknown: 'Не удалось подтвердить, что значения указаны на 100 г или 100 мл. Сверьте этикетку и внесите цифры вручную.',
};
const MACROS = ['protein', 'fat', 'carbs'];
const atwater = v => 4 * (v.protein || 0) + 9 * (v.fat || 0) + 4 * (v.carbs || 0);
const near = (est, kcal) => Math.abs(est - kcal) <= Math.max(12, kcal * 0.12);
const clean = n => String(Math.round(n * 100) / 100);

// Один текст или несколько прочтений одного фото (разные проходы OCR).
// Поле берётся, только если все прочтения, где оно найдено, сходятся.
export function parseLabel(input) {
  const reads = (Array.isArray(input) ? input : [input]).map(extract);
  const fields = {}, warnings = [];
  const bases = new Set(reads.map(r => r.basis).filter(b => b !== 'unknown'));
  // Порция или две колонки хотя бы в одном прочтении — не угадываем
  const basis = bases.has('portion') ? 'portion' : bases.has('mixed') || bases.size > 1 ? 'mixed' : bases.size === 1 ? [...bases][0] : 'unknown';
  if (basis !== '100g' && basis !== '100ml') { warnings.push(WARN[basis]); return { fields, warnings, basis, unit: null }; }
  const unit = basis === '100ml' ? 'ml' : 'g';
  // Варианты каждого поля: пересечение по прочтениям; первым — буквальное прочтение
  const options = {};
  for (const key of MACROS) {
    if (reads.some(r => r.ambiguous.has(key))) continue;
    const seen = reads.map(r => r.values[key]).filter(Boolean);
    if (!seen.length) continue;
    let common = variants(seen[0]);
    for (const token of seen.slice(1)) { const next = variants(token); common = common.filter(v => next.includes(v)); }
    const literal = seen.map(num).filter(v => common.includes(v));
    common.sort((a, b) => literal.filter(v => v === b).length - literal.filter(v => v === a).length);
    // Больше 100 г на 100 г не бывает: такое прочтение — шум, поле остаётся пустым
    if (common.some(v => v <= 100)) options[key] = common;
  }
  const kcals = new Set(reads.map(r => r.kcal).filter(Boolean));
  const kcal = !reads.some(r => r.kcalAmbiguous) && kcals.size === 1 ? Number([...kcals][0]) : null;
  if (kcal !== null && kcal <= 1000) fields.kcal = clean(kcal);
  // Перебор вариантов: каждое ≤ 100, сумма БЖУ ≤ 100 г, энергия сходится с ккал
  const keys = Object.keys(options);
  let combos = [{}];
  for (const key of keys) combos = combos.flatMap(c => options[key].map(v => ({ ...c, [key]: v })));
  combos = combos.filter(c => keys.every(k => c[k] <= 100) && keys.reduce((s, k) => s + c[k], 0) <= 101);
  let chosen = null, repaired = false;
  if (fields.kcal && combos.length) {
    const full = keys.length === 3;
    const fits = combos.filter(c => full ? near(atwater(c), kcal) : atwater(c) <= kcal + Math.max(12, kcal * 0.12));
    const literal = combos[0] && keys.every(k => combos[0][k] === options[k][0]) ? combos[0] : null;
    if (literal && fits.includes(literal)) chosen = literal;
    else if (fits.length === 1) { chosen = fits[0]; repaired = keys.some(k => chosen[k] !== options[k][0]); }
    else if (!fits.length && literal) { chosen = literal; if (full) warnings.push('Калорийность не сходится с белками, жирами и углеводами. Сверьте цифры с этикеткой.'); }
  } else {
    // Без ккал проверить нечем: берём только буквальное прочтение, если оно возможно
    // (прочтение больше 100 г просто не берём, остальные поля не страдают)
    const sure = keys.filter(k => options[k][0] <= 100);
    if (sure.reduce((sum, k) => sum + options[k][0], 0) <= 101) { chosen = {}; for (const k of sure) chosen[k] = options[k][0]; }
  }
  if (chosen) for (const key of Object.keys(chosen)) fields[key] = clean(chosen[key]);
  if (repaired) warnings.push('Часть запятых не прочиталась — цифры подобраны по калорийности. Проверьте белки, жиры и углеводы.');
  if (basis === '100ml') warnings.push('На этикетке значения на 100 мл: продукт сохранится в миллилитрах, порции — тоже в мл.');
  if (Object.keys(fields).length < 4) warnings.push('Часть значений не прочитана однозначно. Заполните пустые поля по этикетке.');
  warnings.push('Сверьте каждую цифру с фотографией. Распознавание может ошибаться.');
  return { fields, warnings, basis, unit };
}

// Насколько прочтение полезно: решает, нужен ли ещё один проход OCR
export function labelScore(result) {
  if (!result || (result.basis !== '100g' && result.basis !== '100ml')) return 0;
  return 1 + Object.keys(result.fields).length;
}
