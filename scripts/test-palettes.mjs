/**
 * Персональные цвета (src/palettes.js, «Оформление», 21.10.2026): у каждой
 * палитры полный набор токенов для светлой и тёмной темы, текст на кнопке
 * и текст акцентом держат WCAG AA (≥ 4,5:1) к настоящим поверхностям из
 * styles.css, выбор переживает сломанное хранилище.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const store = new Map();
let broken = false;
globalThis.localStorage = {
  getItem: (k) => { if (broken) throw new Error('denied'); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { if (broken) throw new Error('denied'); store.set(k, String(v)); },
};

const { PALETTES, STANDARD, PALETTE_KEY, paletteTokens, paletteCss, getPaletteId, setPaletteId, paletteById } = await import('../src/palettes.js');

const HEX = /^#[0-9a-f]{6}$/;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (arr) => '#' + arr.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** Подложка: акцент с прозрачностью поверх поверхности */
const over = (fg, alpha, bg) => { const f = rgb(fg), b = rgb(bg); return hex(f.map((v, i) => v * alpha + b[i] * (1 - alpha))); };

// Поверхности — из styles.css, чтобы проверка не разошлась с темой
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const blockOf = (selector) => {
  const at = css.indexOf(selector + ' {');
  assert.ok(at >= 0, 'нет блока ' + selector);
  return css.slice(at, css.indexOf('\n}', at));
};
const token = (block, name) => {
  const m = block.match(new RegExp(`\\s${name}:\\s*(?:var\\([^,]+,\\s*)?(#[0-9a-f]{6})`));
  assert.ok(m, 'нет токена ' + name);
  return m[1];
};
const LIGHT = blockOf(':root');
const DARK = blockOf(":root[data-theme='dark']");
const SURF = {
  light: [token(LIGHT, '--bg'), token(LIGHT, '--surface'), token(LIGHT, '--surface-sunken')],
  dark: [token(DARK, '--bg'), token(DARK, '--surface')],
};
const WASH = { light: 0.10, dark: 0.16 };
const AA = 4.5;

test('палитры владельца — все на месте, стандартная первой', () => {
  assert.equal(PALETTES[0].id, STANDARD);
  assert.deepEqual(PALETTES.map((p) => p.name), [
    'Стандартный', 'Мандаринка', 'Ара', 'Кокос', 'Красная панда', 'Море и скалы', 'Золотой фазан',
    'Фисташка', 'Фламинго', 'Авокадо', 'Косатка', 'Снежный барс', 'Инжир',
  ]);
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length, 'id не повторяются');
  for (const p of PALETTES) {
    assert.equal(p.swatch.length, 3, p.id + ': три цвета кружка');
    p.swatch.forEach((c) => assert.match(c, HEX, p.id));
  }
});

test('у каждой палитры полный набор токенов в обеих темах', () => {
  for (const p of PALETTES.slice(1)) {
    for (const scheme of ['light', 'dark']) {
      const t = p[scheme];
      for (const k of ['accent', 'ink', 'accent2', 'ink2']) assert.match(t[k], HEX, `${p.id}/${scheme}/${k}`);
      const tokens = paletteTokens(p, scheme);
      assert.deepEqual(Object.keys(tokens).sort(), [
        '--accent', '--accent-2', '--accent-2-ink', '--accent-2-wash', '--accent-ink',
        '--accent-solid', '--accent-text', '--accent-wash',
      ]);
      Object.values(tokens).forEach((v) => assert.ok(v, `${p.id}/${scheme}`));
    }
  }
  assert.equal(paletteTokens(paletteById(STANDARD), 'light'), null, 'стандартная — токены styles.css');
});

test('контраст: текст на кнопке, акцент текстом, надписи на подложках — не ниже 4,5:1', () => {
  for (const p of PALETTES.slice(1)) {
    for (const scheme of ['light', 'dark']) {
      const t = p[scheme];
      const onButton = paletteTokens(p, scheme)['--accent-text'];
      const at = (what, v) => `${p.id}/${scheme}: ${what} ${v.toFixed(2)}`;
      const c = contrast(onButton, t.accent);
      assert.ok(c >= AA, at('текст на кнопке', c));
      for (const s of SURF[scheme]) {
        const a = contrast(t.accent, s);
        assert.ok(a >= AA, at('акцент к поверхности ' + s, a));
        const i = contrast(t.ink, over(t.accent, WASH[scheme], s));
        assert.ok(i >= AA, at('ink на подложке ' + s, i));
        const i2 = contrast(t.ink2, over(t.accent2, WASH[scheme], s));
        assert.ok(i2 >= AA, at('ink2 на подложке ' + s, i2));
      }
    }
  }
});

test('CSS: светлая и тёмная для каждой палитры, тёмная и по системной теме', () => {
  const out = paletteCss();
  for (const p of PALETTES.slice(1)) {
    assert.ok(out.includes(`:root[data-palette='${p.id}'] {`), p.id);
    assert.ok(out.includes(`:root[data-palette='${p.id}'][data-theme='dark'] {`), p.id);
    assert.ok(out.includes(`:root[data-palette='${p.id}']:not([data-theme='light']) {`), p.id);
    assert.ok(out.includes(p.dark.accent) && out.includes(p.light.accent), p.id);
  }
  assert.ok(!out.includes("data-palette='standard'"), 'стандартной своих правил не нужно');
  assert.ok(out.includes('@media (prefers-color-scheme: dark)'));
  // Статусные цвета палитра не трогает
  assert.ok(!/--(good|warning|critical|info)/.test(out));
});

test('выбор: сохраняется, чужое значение и сломанное хранилище — стандартная', () => {
  assert.equal(getPaletteId(), STANDARD);
  assert.equal(setPaletteId('fig'), 'fig');
  assert.equal(store.get(PALETTE_KEY), 'fig');
  assert.equal(getPaletteId(), 'fig');
  store.set(PALETTE_KEY, 'neon');
  assert.equal(getPaletteId(), STANDARD);
  assert.equal(setPaletteId('neon'), STANDARD);
  broken = true;
  assert.equal(getPaletteId(), STANDARD);
  assert.equal(setPaletteId('orca'), 'orca', 'не упали — выбор применён хотя бы до перезапуска');
  broken = false;
});
