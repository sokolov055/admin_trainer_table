/**
 * Персональные цвета (раздел «Оформление», 21.10.2026).
 *
 * Как цветовые темы Telegram: тема (светлая/тёмная) остаётся своей, а
 * палитра меняет только акцент — кнопки, активную вкладку, «+», выделение и
 * мягкие подложки под ними. Поверхности, текст, графики и смысловые цвета
 * (ошибка, успех, предупреждение) не трогаются: у них свои гарантии
 * контраста и различимости (styles.css, слой данных).
 *
 * Цвета сняты со снимков владельца «природа → интерьер» (мандаринка, ара,
 * кокос…): оттенок — пипеткой по дивану, подушкам и стене, светлота —
 * подобрана под интерфейс. Фото тёмные, и цвет «как на снимке» на кнопке
 * читался бы грязью.
 *
 * Для каждой темы значения подобраны отдельно, а не пересчитаны:
 * - светлая — акцент держит ≥ 4,6:1 к белому, фону и утопленной
 *   поверхности: им пишут текст
 *   (ссылки, активная вкладка), а на кнопке им залит фон под белым текстом;
 * - тёмная — акцент светлее и держит ≥ 4,7:1 к поверхности, поэтому текст
 *   на кнопке тёмный (--accent-text). Белый на таком акценте не дал бы 4,5.
 * ink — текст акцентом на его же подложке (--accent-wash), FT-645.
 * Проверка — scripts/test-palettes.mjs.
 *
 * Выбор — на устройстве (localStorage), как и тема: это вкус человека на
 * этом телефоне, а не данные аккаунта.
 */

export const PALETTE_KEY = 'app_palette_v1';
export const STANDARD = 'standard';

/** Текст на кнопке тёмной темы — фон приложения: тот же тон, что вокруг */
const DARK_TEXT = '#17161a';

/*
 * swatch — три цвета кружка в сетке (первый — главный, половина круга):
 * «как на снимке», без поправок под контраст. light/dark — токены.
 */
export const PALETTES = [
  {
    id: STANDARD, name: 'Стандартный',
    swatch: ['#2672cd', '#e9f1fc', '#1a1815'],
    // Без своих значений: остаются токены styles.css как есть
    light: null, dark: null,
  },
  {
    id: 'mandarin', name: 'Мандаринка',
    swatch: ['#d0692c', '#1f3352', '#8a4a24'],
    light: { accent: '#ae5113', ink: '#9e4a11', accent2: '#284371', ink2: '#284371' },
    dark: { accent: '#d96c23', ink: '#df8446', accent2: '#6d8bc0', ink2: '#849eca' },
  },
  {
    id: 'macaw', name: 'Ара',
    swatch: ['#c8302a', '#e3a62b', '#1f4f8f'],
    light: { accent: '#c72e23', ink: '#b72a20', accent2: '#27599b', ink2: '#27599b' },
    dark: { accent: '#da6860', ink: '#e08079', accent2: '#5c8ccc', ink2: '#769ed4' },
  },
  {
    id: 'coconut', name: 'Кокос',
    swatch: ['#6e4b33', '#ece1cf', '#ffffff'],
    light: { accent: '#745239', ink: '#745239', accent2: '#7f674b', ink2: '#755f45' },
    dark: { accent: '#a7836a', ink: '#b59782', accent2: '#9b876f', ink2: '#ab9a86' },
  },
  {
    id: 'red-panda', name: 'Красная панда',
    swatch: ['#a8462a', '#4a2c1e', '#ead9c0'],
    light: { accent: '#933f2a', ink: '#933f2a', accent2: '#5a3a2a', ink2: '#5a3a2a' },
    dark: { accent: '#c77560', ink: '#d08b79', accent2: '#ac826c', ink2: '#b99684' },
  },
  {
    id: 'sea', name: 'Море и скалы',
    swatch: ['#6e8499', '#8c8073', '#dbc9ad'],
    light: { accent: '#4f708c', ink: '#48667f', accent2: '#796a5b', ink2: '#6e6053' },
    dark: { accent: '#748da2', ink: '#8a9fb1', accent2: '#918a83', ink2: '#a39d97' },
  },
  {
    id: 'pheasant', name: 'Золотой фазан',
    swatch: ['#24439a', '#d6a12f', '#b8322a'],
    light: { accent: '#2948ae', ink: '#2948ae', accent2: '#916312', ink2: '#845a10' },
    dark: { accent: '#7087d4', ink: '#879adb', accent2: '#b88121', ink2: '#c39545' },
  },
  {
    id: 'pistachio', name: 'Фисташка',
    swatch: ['#8f9a55', '#6b2c42', '#e5dac7'],
    light: { accent: '#6d6f3c', ink: '#646637', accent2: '#723147', ink2: '#723147' },
    dark: { accent: '#8c8e5a', ink: '#9ea074', accent2: '#b9778d', ink2: '#c48d9f' },
  },
  {
    id: 'flamingo', name: 'Фламинго',
    swatch: ['#e8a9a1', '#2f7c80', '#dfcaae'],
    light: { accent: '#b83d52', ink: '#ab394c', accent2: '#2d7679', ink2: '#296b6e' },
    dark: { accent: '#c57280', ink: '#ce8994', accent2: '#459699', ink2: '#63a7a9' },
  },
  {
    id: 'avocado', name: 'Авокадо',
    swatch: ['#6f8f3a', '#5b3b27', '#efe5c9'],
    light: { accent: '#537630', ink: '#4c6b2c', accent2: '#6d4a36', ink2: '#6d4a36' },
    dark: { accent: '#6f9549', ink: '#86a666', accent2: '#a8826b', ink2: '#b69683' },
  },
  {
    id: 'orca', name: 'Косатка',
    swatch: ['#1c2b47', '#121215', '#eee6d4'],
    light: { accent: '#213763', ink: '#213763', accent2: '#535965', ink2: '#535965' },
    dark: { accent: '#6e8bc4', ink: '#859ecd', accent2: '#898a8d', ink2: '#9c9d9f' },
  },
  {
    id: 'snow-leopard', name: 'Снежный барс',
    swatch: ['#a29d97', '#3b3936', '#f0eae2'],
    light: { accent: '#55524e', ink: '#55524e', accent2: '#766b60', ink2: '#6b6157' },
    dark: { accent: '#8d8a86', ink: '#9f9c98', accent2: '#8c8a87', ink2: '#9e9d9a' },
  },
  {
    id: 'fig', name: 'Инжир',
    swatch: ['#6e2f4e', '#dcc8ae', '#b38f4d'],
    light: { accent: '#743459', ink: '#743459', accent2: '#846831', ink2: '#785f2d' },
    dark: { accent: '#b6779c', ink: '#c28dac', accent2: '#a4864a', ink2: '#b39967' },
  },
];

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

function rgba(hex, alpha) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Токены палитры для одной темы. Подложки — тот же процент, что у
 * стандартного акцента: 10 % в светлой, 16 % в тёмной (styles.css).
 */
export function paletteTokens(palette, scheme) {
  const t = palette && palette[scheme];
  if (!t) return null;
  const dark = scheme === 'dark';
  const wash = dark ? 0.16 : 0.10;
  return {
    '--accent': t.accent,
    '--accent-solid': t.accent,
    '--accent-text': dark ? DARK_TEXT : '#ffffff',
    '--accent-wash': rgba(t.accent, wash),
    '--accent-ink': t.ink,
    '--accent-2': t.accent2,
    '--accent-2-wash': rgba(t.accent2, wash),
    '--accent-2-ink': t.ink2,
  };
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
