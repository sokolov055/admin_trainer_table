/**
 * Стикерпак настройки: поиск и подбор стикера к шагу (16.11.2026) — без
 * React, чтобы проверялось тестом (scripts/test-setup-stickers.mjs).
 */
import { STICKERS, STICKER_RULES } from './setup-stickers-data.js';

export const STICKER_GROUPS = [
  { id: '', name: 'Все' },
  { id: 'special', name: 'Под тренажёры' },
  { id: 'machine', name: 'Тренажёр' },
  { id: 'body', name: 'Положение' },
  { id: 'action', name: 'Действие' },
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));
export const stickerById = (id) => BY_ID.get(String(id || '')) || null;

/** Строка поиска → нормальная форма: регистр, ё/е, знаки не важны */
export const normQuery = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Одна опечатка: лишняя, пропущенная, заменённая или переставленная буква */
export function oneTypo(a, b) {
  const w0 = b.slice(0, a.length);
  if (w0.length === a.length) {
    const d = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== w0[i]) d.push(i);
    if (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === w0[d[1]] && a[d[1]] === w0[d[0]]) return true;
  }
  for (const L of [a.length, a.length - 1, a.length + 1]) {
    const w = b.slice(0, L);
    if (Math.abs(w.length - a.length) > 1) continue;
    let i = 0; let j = 0; let e = 0;
    while (i < a.length && j < w.length) {
      if (a[i] === w[j]) { i++; j++; continue; }
      if (++e > 1) break;
      if (a.length > w.length) i++; else if (a.length < w.length) j++; else { i++; j++; }
    }
    e += (a.length - i) + (w.length - j);
    if (e <= 1) return true;
  }
  return false;
}

const WORDS = new Map(STICKERS.map((s) => [s.id, { name: normQuery(s.name).split(' '), kw: s.kw.split(' ') }]));

/**
 * Поиск по паку: каждое слово запроса — началом слова в названии (сильнее)
 * или в синонимах; от 3 букв — и внутри слова; от 4 — с одной опечаткой.
 * Пустой запрос — null (показать весь пак).
 */
export function searchStickers(q, list = STICKERS) {
  const toks = normQuery(q).split(' ').filter(Boolean);
  if (!toks.length) return null;
  const out = [];
  for (const s of list) {
    const { name, kw } = WORDS.get(s.id);
    let score = 0;
    let ok = true;
    for (const t of toks) {
      if (name.some((w) => w.startsWith(t))) score += 4;
      else if (kw.some((w) => w.startsWith(t))) score += 2;
      else if (t.length >= 3 && (name.some((w) => w.includes(t)) || kw.some((w) => w.includes(t)))) score += 1;
      else if (t.length >= 4 && name.some((w) => oneTypo(t, w))) score += 2;
      else if (t.length >= 4 && kw.some((w) => oneTypo(t, w))) score += 1;
      else { ok = false; break; }
    }
    if (!ok) continue;
    const first = name[0] || '';
    if (first.startsWith(toks[0]) || (toks[0].length >= 4 && oneTypo(toks[0], first))) score += 2;
    out.push({ s, score });
  }
  return out.sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name, 'ru')).map((x) => x.s);
}

const RULES = STICKER_RULES.map(([l, m, id]) => [new RegExp(l), new RegExp(m), id]);
const RES = STICKERS.filter((s) => s.re).map((s) => [new RegExp(s.re, 'i'), s.id]);

/** Стикер к шагу, если тренер не выбрал: по подписи и тексту шага */
export function stickerFor(label, text = '') {
  const l = String(label || '').toLowerCase().trim();
  if (!l) return '';
  const t = String(text || '').toLowerCase();
  for (const [lr, mr, id] of RULES) if (lr.test(l) && mr.test(t) && BY_ID.has(id)) return id;
  for (const [re, id] of RES) if (re.test(l)) return id;
  return '';
}

export { STICKERS };
