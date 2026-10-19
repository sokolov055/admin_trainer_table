/**
 * Кадр истории из слоёв (FT-615, шаг 2) — без React, чтобы это проверял
 * тест (scripts/test-stories-edit.mjs).
 *
 * Редактор в «Управлении → Истории» устроен как в Instagram: кадр 9:16,
 * поверх фона — тексты и наклейки, каждый со своим местом, размером и
 * поворотом. Всё хранится данными в `frame.canvas`:
 *
 *   { bg: { kind: 'gradient' | 'color', value },
 *     image: { src, x, y, scale, dim } | absent,   — картинка на весь кадр
 *     layers: [ { id, type: 'text', text, style, color, align, plate, size, width?, x, y, scale, rotate }
 *             | { id, type: 'sticker', kind, variant, value?, section?, src?, color?, x, y, scale, rotate } ] }
 *
 * x и y — центр слоя в долях кадра, size и width — в процентах ширины
 * кадра (cqw): кадр одинаков на любом экране и в миниатюре. Рисует слои
 * сборка (StoryCanvas.jsx); с сервера — только слова из списков ниже и
 * числа (правило Apple 2.5.2). Те же списки проверяет сервер
 * (server/src/lib/stories.js): новое слово — сначала в сборку.
 *
 * Старые сборки слоёв не знают и показывают heading/body/art/image —
 * legacyFields собирает их из слоёв при сохранении.
 */

export const CANVAS_LIMITS = { layers: 12, text: 400 };

/** Высота кадра в процентах его ширины: 16 / 9 */
export const FRAME_H = 177.78;

export const GRADIENTS = [
  // tint — цвет кадра для старых сборок: им там рисуется картинка
  { id: 'night', css: 'linear-gradient(170deg,#121116 0%,#2b2733 100%)', tint: '#8ec0f5' },
  { id: 'ocean', css: 'linear-gradient(165deg,#143a70 0%,#2672cd 55%,#64a8ee 100%)', tint: '#8ec0f5' },
  { id: 'forest', css: 'linear-gradient(165deg,#0e4532 0%,#2f9b62 62%,#9fe39a 100%)', tint: '#7fd97f' },
  { id: 'sunset', css: 'linear-gradient(160deg,#e8532c 0%,#f5c65c 100%)', tint: '#f5c65c' },
  { id: 'berry', css: 'linear-gradient(160deg,#4f2477 0%,#d47aa0 100%)', tint: '#c9a4f0' },
  { id: 'ember', css: 'linear-gradient(170deg,#231210 0%,#9c3420 100%)', tint: '#ffa24c' },
  { id: 'paper', css: 'linear-gradient(170deg,#faf9f6 0%,#e7e2d7 100%)', tint: '#f5c65c', light: true },
];
export const BG_COLORS = ['#1a1815', '#2672cd', '#1f7a52', '#f5c65c', '#ff7a45', '#f0a4a4', '#c9a4f0', '#faf9f6'];
export const TEXT_COLORS = ['#ffffff', '#1a1815', '#2672cd', '#8ec0f5', '#7fd97f', '#f5c65c', '#ff7a45', '#f0a4a4', '#c9a4f0'];
export const TEXT_STYLES = [
  { id: 'classic', name: 'Обычный' },
  { id: 'strong', name: 'Крупный' },
  { id: 'serif', name: 'Изящный' },
  { id: 'type', name: 'Печатный' },
  { id: 'neon', name: 'Неон' },
];
export const STICKER_COLORS = ['#f5c65c', '#ffffff', '#ff7a45', '#7fd97f', '#8ec0f5'];
export const BADGES = [
  { text: 'Новое', color: '#f5c65c' },
  { text: 'Совет', color: '#7fd97f' },
  { text: 'Важно', color: '#ff7a45' },
  { text: 'Скоро', color: '#c9a4f0' },
];
/** Куда ведёт кнопка раздела: вкладки клиента, «Мои данные» и инструкция */
export const SECTIONS = [
  { id: 'overview', name: 'Обзор', label: 'Открыть «Обзор»' },
  { id: 'plan', name: 'Тренировки', label: 'Открыть «Тренировки»' },
  { id: 'progress', name: 'Прогресс', label: 'Открыть «Прогресс»' },
  { id: 'nutrition', name: 'Питание', label: 'Открыть «Питание»' },
  { id: 'profile', name: 'Мои данные', label: 'Открыть «Мои данные»' },
  { id: 'guide', name: 'Как пользоваться', label: 'Открыть инструкцию' },
];
export const EMOJI = ['💪', '🔥', '✅', '⭐', '👉', '👆', '🎯', '🏆', '⏱️', '❤️', '🥗', '💧', '📈', '⌚', '🎉', '👏'];
export const SIZE_MIN = 3.5;
export const SIZE_MAX = 14;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = (n) => Math.round(n * 1000) / 1000;

export function bgCss(bg) {
  if (bg && bg.kind === 'color') return bg.value;
  return (GRADIENTS.find((g) => g.id === (bg && bg.value)) || GRADIENTS[0]).css;
}

function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(((n >> 16) & 255) / 255) + 0.7152 * f(((n >> 8) & 255) / 255) + 0.0722 * f((n & 255) / 255);
}

/** Цвет текста на плашке этого цвета */
export const onColor = (hex) => (luminance(hex) > 0.42 ? '#141216' : '#ffffff');

/** Светлый фон: новый текст по умолчанию тёмный */
export function isLightBg(canvas) {
  if (!canvas || canvas.image) return false;
  if (canvas.bg.kind === 'color') return luminance(canvas.bg.value) > 0.5;
  return !!(GRADIENTS.find((g) => g.id === canvas.bg.value) || {}).light;
}

export const sectionOf = (id) => SECTIONS.find((s) => s.id === id) || SECTIONS[0];

/** Короткий id слоя: им держатся ключи в редакторе, сервер его хранит */
export function layerId(taken = []) {
  const used = new Set(taken);
  let id;
  do id = Math.random().toString(36).slice(2, 10); while (!id || used.has(id));
  return id;
}

export function textLayer(text, o = {}) {
  return {
    id: o.id || layerId(), type: 'text', text,
    style: 'classic', color: '#ffffff', align: 'center', plate: 0, size: 7,
    x: 0.5, y: 0.5, scale: 1, rotate: 0, ...o,
  };
}

export function stickerLayer(kind, o = {}) {
  return { id: o.id || layerId(), type: 'sticker', kind, variant: 0, x: 0.5, y: 0.5, scale: 1, rotate: 0, ...o };
}

export function emptyCanvas(bg = 'night') {
  return { bg: { kind: 'gradient', value: bg }, layers: [] };
}

/** Длинный текст — кусками по предложениям, каждый не длиннее max */
export function splitText(text, max = CANVAS_LIMITS.text) {
  const parts = [];
  let rest = String(text || '').trim();
  while (rest.length > max) {
    const cut = rest.slice(0, max);
    const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    const end = at > max * 0.4 ? at + 1 : (cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max);
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Сколько строк займёт текст: средняя буква Manrope 700 — около 0,55 кегля
const linesOf = (text, size, width) => {
  const perLine = Math.max(8, Math.floor(width / (size * 0.55)));
  return String(text).split('\n').reduce((n, p) => n + Math.max(1, Math.ceil((p.length * 1.08) / perLine)), 0);
};

/**
 * Старый кадр (заголовок, текст, рисунок или картинка) → холст. Детерминированно:
 * тот же кадр даёт тот же холст, иначе панель считала бы правкой простое
 * открытие. Раскладка как в прежнем просмотре: тёмный фон, рисунок, под
 * ним заголовок и текст по левому краю, всё по центру высоты.
 */
export function legacyToCanvas(frame, body = frame.body) {
  const tint = frame.tint || '#8ec0f5';
  const W = 84;
  const blocks = [];
  if (frame.image) blocks.push({ h: 48, layer: stickerLayer('photo', { id: 'img', src: frame.image, variant: 0 }) });
  else if (frame.art) blocks.push({ h: 76 * 180 / 320, layer: stickerLayer('art', { id: 'art', value: frame.art, color: tint }) });
  const heading = String(frame.heading || '').trim();
  if (heading) {
    const size = 7;
    blocks.push({ h: linesOf(heading, size, W) * size * 1.2, layer: textLayer(heading, { id: 'h', size, align: 'left', width: W }) });
  }
  splitText(body).forEach((part, i) => {
    const size = 4.4;
    blocks.push({ h: linesOf(part, size, W) * size * 1.2, layer: textLayer(part, { id: 'b' + (i || ''), size, align: 'left', width: W, color: '#e6e3dc' }) });
  });
  const GAP = 5;
  const total = blocks.reduce((s, b) => s + b.h, 0) + GAP * Math.max(0, blocks.length - 1);
  let top = Math.max(26, (FRAME_H - total) / 2);
  const layers = blocks.map((b) => {
    const layer = { ...b.layer, y: r3(clamp((top + b.h / 2) / FRAME_H, 0.05, 0.95)) };
    top += b.h + GAP;
    return layer;
  });
  return { bg: { kind: 'gradient', value: 'night' }, layers };
}

/**
 * Кадры темы → кадры редактора: у каждого холст. Кадр со своим текстом для
 * iPhone (bodyIos) становится двумя — «не iPhone» и «только iPhone»:
 * в холсте один набор слоёв на все устройства.
 */
export function framesForEditor(frames) {
  return (frames || []).flatMap((f) => {
    if (f.canvas) return [f];
    const base = { id: f.id, heading: f.heading || '', body: f.body || '' };
    ['date', 'only', 'hidden'].forEach((k) => { if (f[k]) base[k] = f[k]; });
    if (f.bodyIos && f.only !== 'android') {
      const other = f.only === 'ios' ? [] : [{ ...base, only: 'android', canvas: legacyToCanvas(f) }];
      return [...other, { ...base, id: f.only === 'ios' ? f.id : f.id + '-ios', only: 'ios', body: f.bodyIos, canvas: legacyToCanvas(f, f.bodyIos) }];
    }
    return [{ ...base, canvas: legacyToCanvas(f) }];
  });
}

const oneLine = (s) => String(s || '').replace(/\s*\n\s*/g, ' ').trim();
const cut = (s, max) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);

/**
 * Что увидят старые сборки: заголовок — самый крупный текст кадра, текст —
 * остальные сверху вниз, рисунок — первая встроенная картинка, картинка —
 * первый снимок. Без текста — заголовок темы: пустой кадр старая сборка
 * показать не может.
 */
export function legacyFields(canvas, caption = '') {
  const texts = canvas.layers.filter((l) => l.type === 'text' && String(l.text || '').trim());
  const weight = (l) => (l.size || 7) * (l.scale || 1);
  const head = texts.slice().sort((a, b) => weight(b) - weight(a) || a.y - b.y)[0];
  const rest = texts.filter((l) => l !== head).sort((a, b) => a.y - b.y);
  const out = {
    heading: cut(head ? oneLine(head.text) : (oneLine(caption) || 'Новое в приложении'), 90),
    body: cut(rest.map((l) => oneLine(l.text)).join('\n'), 700),
  };
  const art = canvas.layers.find((l) => l.kind === 'art');
  const photo = canvas.layers.find((l) => l.kind === 'photo');
  if (photo) out.image = photo.src;
  else if (art) out.art = art.value;
  const g = canvas.bg.kind === 'gradient' ? GRADIENTS.find((x) => x.id === canvas.bg.value) : null;
  out.tint = (art && art.color) || (g ? g.tint : '#8ec0f5');
  return out;
}
