/**
 * Персональные цвета (раздел «Оформление», 21.10.2026).
 *
 * Как цветовые темы Telegram: тема (светлая/тёмная) остаётся своей, а
 * палитра раскрашивает интерфейс тремя цветами — по роли каждому
 * (владелец, 21.10.2026: «один цвет самый яркий — элементы, второй — фон
 * полупрозрачный, третий — заливка мелких элементов»):
 * - accent — самый яркий: кнопки, активная вкладка, «+», ссылки;
 * - bg — фон страницы: подмешан к фону темы, карточки — едва заметно;
 * - fill — заливка мелкого: чипы, метки, подложки выделения, дорожки
 *   переключателей.
 * Текст, смысловые цвета (ошибка, успех, предупреждение) и графики не
 * трогаются. Сколько подмешать, решает светлота: фон темы остаётся почти
 * той же яркости (поэтому текст держит контраст), меняется оттенок. Акцент и
 * надписи на подложках подстраиваются под получившиеся поверхности сами —
 * темнее в светлой теме, светлее в тёмной, до WCAG AA. Проверка —
 * scripts/test-palettes.mjs.
 *
 * Цвета сняты со снимков владельца «природа → интерьер» (мандаринка, ара,
 * кокос…): оттенок — пипеткой по дивану, подушкам и стене. swatch — кружок
 * в сетке: половина — accent, четверти — bg и fill.
 *
 * Выбор — на устройстве (localStorage), как и тема: это вкус человека на
 * этом телефоне, а не данные аккаунта.
 *
 * 22.10.2026 (FT-702): из 13 палитр оставлены 5 непохожих («Ару» владелец
 * убрал отдельно, вечером) — у кого была
 * убранная, getPaletteId вернёт стандартную. Фон богаче: у каждой палитры
 * свечение акцентом и третьим цветом по углам (--bg-art), у «Хэллоуина» —
 * свой рисунок: тыквы с горящими лицами на тёмно-бордовом. «Хэллоуин»
 * всегда тёмный (scheme: 'dark', telegram.js) — светлого Хэллоуина не бывает.
 */

import { halloweenArt } from './halloween-art.js';

export const PALETTE_KEY = 'app_palette_v1';
export const STANDARD = 'standard';

/** Текст на кнопке тёмной темы — фон приложения: тот же тон, что вокруг */
const DARK_TEXT = '#17161a';

/** Основа тем из styles.css — к ней подмешиваются цвета палитры */
export const BASE = {
  light: { bg: '#faf9f6', surface: '#ffffff', sunken: '#f3f1ec', text: ['#1a1815', '#57534a', '#6f6a60'] },
  dark: { bg: '#17161a', surface: '#221f24', sunken: '#101013', text: ['#f2f0ea', '#b5b1a7', '#8e8a80'] },
};

/*
 * accent — яркий цвет «как на снимке» (кружок); light/dark — с какого цвета
 * начинать акцент в теме (дальше его доведёт tune). bg и fill — общие для
 * обеих тем: светлота у них своя по теме.
 */
export const PALETTES = [
  {
    id: STANDARD, name: 'Стандартный',
    swatch: ['#2672cd', '#e9f1fc', '#1a1815'],
    // Без своих значений: остаются токены styles.css как есть
    light: null, dark: null,
  },
  { id: 'coconut', name: 'Кокос', accent: '#6e4b33', bg: '#ece1cf', fill: '#a07c5a', light: '#745239', dark: '#a7836a' },
  { id: 'flamingo', name: 'Фламинго', accent: '#e8a9a1', bg: '#e8a9a1', fill: '#2f7c80', light: '#b83d52', dark: '#c57280' },
  { id: 'avocado', name: 'Авокадо', accent: '#6f8f3a', bg: '#b8c46a', fill: '#5b3b27', light: '#537630', dark: '#6f9549' },
  { id: 'fig', name: 'Инжир', accent: '#6e2f4e', bg: '#8a3a62', fill: '#b38f4d', light: '#743459', dark: '#b6779c' },
  // Хэллоуин (владелец, 21–22.10.2026): тыква на тёмно-бордовой ночи, зелёный хвостик
  { id: 'halloween', name: 'Хэллоуин', accent: '#ef7d1a', bg: '#6b1a2a', fill: '#6fbf3a', light: '#b8560f', dark: '#f08a2c', scheme: 'dark' },
].map((p) => (p.swatch ? p : { ...p, swatch: [p.accent, p.bg, p.fill] }));

/* --- цвет: смешение, светлота, контраст --- */
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOf = (c) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
/** k — доля цвета b в смеси */
export const mix = (a, b, k) => { const x = rgbOf(a), y = rgbOf(b); return hexOf(x.map((v, i) => v + (y[i] - v) * k)); };
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const lum = (h) => { const [r, g, b] = rgbOf(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgba = (hex, alpha) => `rgba(${rgbOf(hex).join(', ')}, ${alpha})`;
/** Подложка поверх фона — как её видит глаз */
export const over = (fg, alpha, bg) => mix(bg, fg, alpha);

/* HSL — чтобы держать оттенок и насыщенность, меняя одну светлоту */
function hslOf(hex) {
  const [r, g, bl] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - bl) / d + (g < bl ? 6 : 0) : max === g ? (bl - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hexOfHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return hexOf([f(0), f(8), f(4)].map((v) => v * 255));
}

/**
 * Поверхность оттенка color нужной светлоты: оттенок — цвета, насыщенность —
 * его же (не больше cap), светлота подобрана под lum темы. Смешение с
 * основой тут не годится: тёмно-синий или коньячный, подмешанные до
 * светлого, выцветают в серый; так фон остаётся цветным и такой же яркости,
 * поэтому текст темы держит контраст.
 */
function tint(color, target, cap) {
  const [h, s0] = hslOf(color);
  const s = Math.min(cap, s0 * 1.2);
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2;
    if (lum(hexOfHsl(h, s, mid)) < target) lo = mid; else hi = mid;
  }
  return hexOfHsl(h, s, hi);
}

/** Довести цвет до контраста со всеми фонами: в светлой — темнее, в тёмной — светлее */
function tune(color, against, dark, target = 4.6) {
  let c = color;
  for (let i = 0; i < 60 && Math.min(...against.map((b) => contrast(c, b))) < target; i += 1) {
    c = mix(c, dark ? '#ffffff' : '#000000', 0.04);
  }
  return c;
}

/** Плотность подложек третьим цветом */
export const WASH = { light: 0.14, dark: 0.22 };

/**
 * Все цвета палитры в теме — уже посчитанные. Пределы светлоты держат
 * контраст текста темы (text-muted ≥ 4,5 на фоне, карточке и дорожке).
 */
export function paletteColors(palette, scheme) {
  if (!palette || !palette[scheme]) return null;
  const dark = scheme === 'dark';
  // Светлота — как у основы темы (BASE): фон, карточка, дорожка остаются
  // той же яркости, меняется только оттенок
  const bg = dark ? tint(palette.bg, 0.0115, 0.42) : tint(palette.bg, 0.86, 0.8);
  const surface = dark ? tint(palette.bg, 0.0152, 0.2) : tint(palette.bg, 0.965, 0.7);
  const sunken = dark ? tint(palette.fill, 0.0068, 0.32) : tint(palette.fill, 0.835, 0.5);
  const wash = WASH[scheme];
  const grounds = [bg, surface, sunken];
  const washes = grounds.map((g) => over(palette.fill, wash, g));
  // Акцент — текстом по всем поверхностям и подложкам; на кнопке под ним —
  // белый (светлая) или тёмный (тёмная) текст
  const onButton = dark ? DARK_TEXT : '#ffffff';
  let accent = tune(palette[scheme], [...grounds, ...washes], dark);
  for (let i = 0; i < 40 && contrast(onButton, accent) < 4.6; i += 1) accent = mix(accent, dark ? '#ffffff' : '#000000', 0.04);
  const ink2 = tune(palette.fill, [...grounds, ...washes], dark);
  return { bg, surface, sunken, accent, onButton, fill: palette.fill, ink2, wash };
}

/**
 * Фон «богаче» (FT-702): свечение акцентом сверху справа и третьим цветом
 * снизу слева — неподвижный слой под содержимым (styles.css, body::after).
 * Свечение — оттенок, а не темнее/светлее: цвет той же светлоты, что фон
 * (tint), поэтому текст темы на нём держит контраст. ART — светлота и доля
 * цвета на пике; artPeaks — что видит глаз в самой яркой точке (тест).
 */
export const ART = { light: { lum: 0.875, alpha: [0.9, 0.75] }, dark: { lum: 0.0118, alpha: [0.9, 0.8] } };
const glowColors = (palette, scheme) => {
  const { lum: target } = ART[scheme];
  return [tint(palette.accent, target, scheme === 'dark' ? 0.7 : 0.9), tint(palette.fill, target, scheme === 'dark' ? 0.6 : 0.8)];
};
export function artPeaks(palette, scheme) {
  const c = paletteColors(palette, scheme), [a, f] = glowColors(palette, scheme), [ka, kf] = ART[scheme].alpha;
  return [over(a, ka, c.bg), over(f, kf, c.bg)];
}
const glow = (palette, scheme) => {
  const [a, f] = glowColors(palette, scheme), [ka, kf] = ART[scheme].alpha;
  return `radial-gradient(110% 55% at 100% 0%, ${rgba(a, ka)}, transparent 70%), radial-gradient(90% 50% at 0% 100%, ${rgba(f, kf)}, transparent 70%)`;
};

/* Рисунок «Хэллоуина» — halloween-art.js */

/** Тема, которую палитра ставит сама: «Хэллоуин» — всегда тёмная, остальные — как выбрано */
export function forcedScheme(id = getPaletteId()) {
  return paletteById(id).scheme || null;
}

/** Токены палитры для одной темы (CSS-переменные) */
export function paletteTokens(palette, scheme) {
  const c = paletteColors(palette, scheme);
  if (!c) return null;
  const fillWash = rgba(c.fill, c.wash);
  return {
    '--bg-art': palette.id === 'halloween' ? halloweenArt() : glow(palette, scheme),
    '--bg': c.bg,
    '--surface': c.surface,
    '--surface-sunken': c.sunken,
    '--accent': c.accent,
    '--accent-solid': c.accent,
    '--accent-text': c.onButton,
    // Подложка выделения — третьим цветом, надпись на ней — акцентом
    '--accent-wash': fillWash,
    '--accent-ink': c.accent,
    '--accent-2': c.ink2,
    '--accent-2-wash': fillWash,
    '--accent-2-ink': c.ink2,
    '--chip-bg': fillWash,
  };
}

const BY_ID = new Map(PALETTES.map((p) => [p.id, p]));

export function paletteById(id) {
  return BY_ID.get(id) || BY_ID.get(STANDARD);
}

/** Выбранная палитра; хранилище недоступно (приватный режим) — стандартная */
export function getPaletteId() {
  try {
    const saved = localStorage.getItem(PALETTE_KEY);
    if (saved && BY_ID.has(saved)) return saved;
  } catch (_) {}
  return STANDARD;
}

const block = (selector, tokens) => selector + ' {\n' + Object.keys(tokens).map((k) => `  ${k}: ${tokens[k]};`).join('\n') + '\n}';

/**
 * CSS всех палитр. Селекторы сильнее тем из styles.css при любом порядке
 * подключения: светлая палитра (0,2,0) перебивает :root, тёмная (0,3,0) —
 * и :root[data-theme='dark'], и системную тёмную.
 */
export function paletteCss() {
  const out = [];
  const dark = [];
  PALETTES.forEach((p) => {
    if (!p.light) return;
    const sel = `:root[data-palette='${p.id}']`;
    out.push(block(sel, paletteTokens(p, 'light')));
    out.push(block(`${sel}[data-theme='dark']`, paletteTokens(p, 'dark')));
    dark.push(block(`${sel}:not([data-theme='light'])`, paletteTokens(p, 'dark')));
  });
  return out.join('\n') + '\n@media (prefers-color-scheme: dark) {\n' + dark.join('\n') + '\n}\n';
}

/** Ставим палитру на страницу: стили — один раз, дальше только атрибут */
export function applyPalette(id = getPaletteId()) {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('palette-css')) {
    const style = document.createElement('style');
    style.id = 'palette-css';
    style.textContent = paletteCss();
    document.head.appendChild(style);
  }
  const root = document.documentElement;
  if (id && id !== STANDARD && BY_ID.has(id)) root.setAttribute('data-palette', id);
  else root.removeAttribute('data-palette');
}

/**
 * Мягкая смена цвета: на время перехода всем элементам даётся переход по
 * цветам (styles.css, .color-shift). Без него кнопки и вкладки перещёлкивались
 * бы разом — резкий скачок яркости, особенно при смене светлой на тёмную.
 * «Уменьшить движение» — без перехода, сразу.
 */
let shiftTimer = 0;
export function withColorShift(change) {
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  let reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  if (!root || reduce) { change(); return; }
  root.classList.add('color-shift');
  change();
  clearTimeout(shiftTimer);
  shiftTimer = setTimeout(() => root.classList.remove('color-shift'), 420);
}

/** Сохраняем выбор и сразу применяем */
export function setPaletteId(id) {
  const next = BY_ID.has(id) ? id : STANDARD;
  try { localStorage.setItem(PALETTE_KEY, next); } catch (_) {}
  withColorShift(() => applyPalette(next));
  return next;
}
