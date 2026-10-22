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

const { PALETTES, STANDARD, PALETTE_KEY, BASE, WASH, artPeaks, paletteTokens, paletteColors, paletteCss, getPaletteId, setPaletteId, paletteById, forcedScheme, contrast, over, lum } = await import('../src/palettes.js');

const HEX = /^#[0-9a-f]{6}$/;

// Основа палитр совпадает с темами styles.css — иначе контраст считался бы
// не к тем поверхностям
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
const AA = 4.5;

test('основа палитр — те же цвета, что у тем styles.css', () => {
  for (const [scheme, sel] of [['light', ':root'], ['dark', ":root[data-theme='dark']"]]) {
    const b = blockOf(sel);
    assert.equal(BASE[scheme].bg, token(b, '--bg'), scheme);
    assert.equal(BASE[scheme].surface, token(b, '--surface'), scheme);
    assert.equal(BASE[scheme].sunken, token(b, '--surface-sunken'), scheme);
    assert.deepEqual(BASE[scheme].text, [token(b, '--text'), token(b, '--text-secondary'), token(b, '--text-muted')], scheme);
  }
});

test('палитры владельца — стандартная первой, Хэллоуин последним, шесть непохожих (FT-702)', () => {
  assert.equal(PALETTES[0].id, STANDARD);
  assert.deepEqual(PALETTES.map((p) => p.name), ['Стандартный', 'Кокос', 'Фламинго', 'Авокадо', 'Инжир', 'Хэллоуин']);
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length, 'id не повторяются');
  for (const p of PALETTES) {
    assert.equal(p.swatch.length, 3, p.id + ': три цвета кружка');
    p.swatch.forEach((c) => assert.match(c, HEX, p.id));
  }
});

test('три роли: фон — второй цвет, мелкое — третий, у каждой палитры свой фон', () => {
  for (const scheme of ['light', 'dark']) {
    const bgs = new Set();
    for (const p of PALETTES.slice(1)) {
      const t = paletteTokens(p, scheme);
      assert.deepEqual(Object.keys(t).sort(), [
        '--accent', '--accent-2', '--accent-2-ink', '--accent-2-wash', '--accent-ink', '--accent-solid',
        '--accent-text', '--accent-wash', '--bg', '--bg-art', '--chip-bg', '--surface', '--surface-sunken',
      ], p.id);
      // Фон богаче: свечение у всех, у «Хэллоуина» — ещё и рисунок тыкв
      assert.match(t['--bg-art'], p.id === 'halloween' ? /^url\("data:image\/svg\+xml,[^"]+"\)$/ : /^radial-gradient\(.+radial-gradient\(/, p.id);
      ['--bg', '--surface', '--surface-sunken', '--accent'].forEach((k) => assert.match(t[k], HEX, `${p.id}/${scheme}/${k}`));
      // Подложки мелкого — третьим цветом, полупрозрачные
      assert.match(t['--chip-bg'], /^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
      assert.equal(t['--accent-wash'], t['--chip-bg']);
      assert.notEqual(t['--bg'], BASE[scheme].bg, p.id + ': фон подкрашен');
      bgs.add(t['--bg']);
    }
    assert.ok(bgs.size >= PALETTES.length - 2, scheme + ': фоны разные, а не одна бежевая — ' + bgs.size);
  }
  assert.equal(paletteTokens(paletteById(STANDARD), 'light'), null, 'стандартная — токены styles.css');
});

test('контраст: текст темы, кнопка, акцент и надписи на подложках — не ниже 4,5:1', () => {
  for (const p of PALETTES.slice(1)) {
    for (const scheme of ['light', 'dark']) {
      const c = paletteColors(p, scheme);
      const at = (what, v) => `${p.id}/${scheme}: ${what} ${v.toFixed(2)}`;
      const grounds = [c.bg, c.surface, c.sunken];
      const washes = grounds.map((g) => over(c.fill, WASH[scheme], g));
      assert.ok(contrast(c.onButton, c.accent) >= AA, at('текст на кнопке', contrast(c.onButton, c.accent)));
      // Текст темы — на фоне, карточке, дорожке; на подложках мелкого —
      // основной и вторичный (подписи чипов, меток), приглушённого там нет
      for (const g of grounds) {
        for (const text of BASE[scheme].text) assert.ok(contrast(text, g) >= AA, at('текст ' + text + ' на ' + g, contrast(text, g)));
      }
      for (const g of washes) {
        for (const text of BASE[scheme].text.slice(0, 2)) assert.ok(contrast(text, g) >= AA, at('текст ' + text + ' на подложке ' + g, contrast(text, g)));
      }
      for (const g of [...grounds, ...washes]) {
        assert.ok(contrast(c.accent, g) >= AA, at('акцент на ' + g, contrast(c.accent, g)));
        assert.ok(contrast(c.ink2, g) >= AA, at('третий цвет текстом на ' + g, contrast(c.ink2, g)));
      }
      // На пике свечения (--bg-art) текст темы держит контраст так же
      if (p.id !== 'halloween') {
        for (const peak of artPeaks(p, scheme)) {
          for (const text of BASE[scheme].text) assert.ok(contrast(text, peak) >= AA, at('текст ' + text + ' на свечении ' + peak, contrast(text, peak)));
        }
      }
      // Тёмная остаётся тёмной, светлая — светлой: строка состояния и
      // системные элементы подбираются по фону
      assert.ok(scheme === 'dark' ? lum(c.bg) < 0.05 : lum(c.bg) > 0.6, at('светлота фона', lum(c.bg)));
    }
  }
});

test('CSS: светлая и тёмная для каждой палитры, тёмная и по системной теме', () => {
  const out = paletteCss();
  for (const p of PALETTES.slice(1)) {
    assert.ok(out.includes(`:root[data-palette='${p.id}'] {`), p.id);
    assert.ok(out.includes(`:root[data-palette='${p.id}'][data-theme='dark'] {`), p.id);
    assert.ok(out.includes(`:root[data-palette='${p.id}']:not([data-theme='light']) {`), p.id);
    assert.ok(out.includes(paletteColors(p, 'dark').accent) && out.includes(paletteColors(p, 'light').accent), p.id);
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
  assert.equal(setPaletteId('fig'), 'fig', 'не упали — выбор применён хотя бы до перезапуска');
  broken = false;
  // Убранная 22.10.2026 палитра (FT-702) — стандартная, без ошибки
  for (const gone of ['macaw', 'mandarin', 'red-panda', 'sea', 'pheasant', 'pistachio', 'orca', 'snow-leopard']) {
    store.set(PALETTE_KEY, gone);
    assert.equal(getPaletteId(), STANDARD, gone);
  }
});

test('«Хэллоуин» всегда тёмный, остальные — по выбору человека (FT-702)', () => {
  assert.equal(forcedScheme('halloween'), 'dark');
  for (const p of PALETTES.filter((x) => x.id !== 'halloween')) assert.equal(forcedScheme(p.id), null, p.id);
  store.set(PALETTE_KEY, 'halloween');
  assert.equal(forcedScheme(), 'dark');
  store.delete(PALETTE_KEY);
  // telegram.js спрашивает палитру прежде выбора темы
  const tg = readFileSync(new URL('../src/telegram.js', import.meta.url), 'utf8');
  assert.match(tg, /const mode = forcedScheme\(\) \|\| getThemeMode\(\);/);
});

test('«Хэллоуин»: цельный рисунок, предметы не налезают друг на друга (FT-702)', async () => {
  const { SCENE, sceneSvg, halloweenArt } = await import('../src/halloween-art.js');
  const kinds = new Set(SCENE.map((s) => s.kind));
  for (const k of ['web', 'bat', 'ghost', 'pumpkin']) assert.ok(kinds.has(k), 'есть ' + k);
  for (const { kind, box: [x, y, w, h] } of SCENE) assert.ok(x >= 0 && y >= 0 && x + w <= 390 && y + h <= 844, kind + ' в рамке 390×844');
  for (let i = 0; i < SCENE.length; i += 1) {
    for (let j = i + 1; j < SCENE.length; j += 1) {
      const [a, b] = [SCENE[i].box, SCENE[j].box];
      const apart = a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];
      assert.ok(apart, `${SCENE[i].kind} ${a} и ${SCENE[j].kind} ${b} налезают`);
    }
  }
  // Одна картинка, а не обои из нескольких слоёв
  assert.equal((halloweenArt().match(/url\("data:/g) || []).length, 1);
  assert.ok(sceneSvg().startsWith('<svg') && sceneSvg().includes('preserveAspectRatio="xMidYMid slice"'));
});
