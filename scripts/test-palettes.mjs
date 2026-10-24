/**
 * Персональные цвета (src/palettes.js, «Оформление», 21.10.2026): у каждой
 * палитры полный набор токенов для светлой и тёмной темы, текст на кнопке
 * и текст акцентом держат WCAG AA (≥ 4,5:1) к настоящим поверхностям из
 * styles.css, выбор переживает сломанное хранилище.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

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
        '--accent', '--accent-2', '--accent-2-ink', '--accent-2-wash', '--accent-fill', '--accent-ink', '--accent-solid',
        '--accent-text', '--accent-wash', '--bg', '--bg-art', '--chip-bg', ...(p.mascot ? ['--mascot-glow', '--mascot-lit'] : []), '--surface', '--surface-sunken',
      ], p.id);
      // Фон богаче: свечение у всех, у темы с рисунком (art) — цельная картинка
      assert.match(t['--bg-art'], p.art ? /^url\("data:image\/svg\+xml,[^"]+"\)$/ : /^radial-gradient\(.+radial-gradient\(/, p.id);
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

test('тема с картинкой вместо «+»: data-mascot ставится и снимается вместе с палитрой', () => {
  const attrs = new Map();
  globalThis.document = {
    documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), classList: { add() {}, remove() {} } },
    getElementById: () => ({}),
  };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  try {
    for (const p of PALETTES.filter((x) => x.mascot)) {
      assert.match(p.mascot.glow, /^rgba\(/, p.id); assert.match(p.mascot.lit, /^rgba\(/, p.id);
      setPaletteId(p.id);
      assert.equal(attrs.get('data-mascot'), p.id);
    }
    setPaletteId('fig');
    assert.equal(attrs.has('data-mascot'), false, 'у палитры без картинки — плюс');
  } finally { delete globalThis.document; delete globalThis.window; store.delete(PALETTE_KEY); }
});

test('тема файлом (22.10.2026): загруженная — в списке и со своими токенами, закрытая — стандартная', async () => {
  const { setRemoteThemes, listPalettes, isClosedTheme, THEMES_KEY } = await import('../src/palettes.js');
  const art = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844"><circle cx="40" cy="40" r="30" fill="#fff"/></svg>';
  const theme = {
    format: 'fittrack-theme', id: 'new-year', name: 'Новый год', accent: '#d23b3b', bg: '#0f2a4a', fill: '#e8c15a',
    light: '#b02a2a', dark: '#e05555', scheme: 'dark', art,
    mascot: { svg: '<svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="20"/></svg>', glow: 'rgba(255, 80, 80, 0.45)', lit: 'rgba(255, 120, 120, 0.8)' },
  };
  try {
    setRemoteThemes({ themes: [theme, { ...theme, id: 'broken', accent: 'red' }, { ...theme, id: 'fig', name: 'Подмена' }], closed: [] });
    assert.ok(store.get(THEMES_KEY), 'ответ сервера — на устройстве');
    const names = listPalettes().map((p) => p.name);
    assert.deepEqual(names, ['Стандартный', 'Кокос', 'Фламинго', 'Авокадо', 'Инжир', 'Хэллоуин', 'Новый год'], 'битая — пропущена, встроенную не подменить');
    const p = paletteById('new-year');
    assert.equal(forcedScheme('new-year'), 'dark');
    for (const scheme of ['light', 'dark']) {
      const t = paletteTokens(p, scheme);
      assert.match(t['--bg-art'], /^url\("data:image\/svg\+xml,%3Csvg/);
      assert.equal(t['--mascot-glow'], 'rgba(255, 80, 80, 0.45)');
      const c = paletteColors(p, scheme);
      for (const g of [c.bg, c.surface, c.sunken]) {
        for (const text of BASE[scheme].text) assert.ok(contrast(text, g) >= AA, `new-year/${scheme}: текст на ${g}`);
      }
      assert.ok(contrast(c.onButton, c.accent) >= AA, 'текст на кнопке');
    }
    assert.match(p.mascot.src, /^data:image\/svg\+xml,/);
    assert.ok(paletteCss().includes(":root[data-palette='new-year'] {"));

    assert.equal(setPaletteId('new-year'), 'new-year');
    assert.equal(getPaletteId(), 'new-year');
    // Тот же ответ — ничего не меняется
    assert.equal(setRemoteThemes({ themes: [theme, { ...theme, id: 'broken', accent: 'red' }, { ...theme, id: 'fig', name: 'Подмена' }], closed: [] }), false);
    // Владелец закрыл (сервер её больше не отдаёт) — стандартная, и тема пересчитывается
    assert.equal(setRemoteThemes({ themes: [], closed: ['halloween'] }), true);
    assert.equal(getPaletteId(), STANDARD);
    assert.equal(setPaletteId('new-year'), STANDARD);
    // Встроенный «Хэллоуин» закрыт — его нет в списке, выбрать нельзя
    assert.ok(isClosedTheme('halloween'));
    assert.ok(!listPalettes().some((x) => x.id === 'halloween'));
    assert.equal(setPaletteId('halloween'), STANDARD);
    // «Стандартный» закрыть нельзя
    setRemoteThemes({ themes: [], closed: ['standard'] });
    assert.equal(listPalettes()[0].id, STANDARD);

    // Владелец (trial): закрытую загруженную и закрытый «Хэллоуин» можно
    // примерить у себя; в списке закрытая — только пока она у него стоит
    setRemoteThemes({ themes: [{ ...theme, closed: true }], closed: ['halloween'], trial: true });
    assert.ok(!listPalettes().some((x) => x.id === 'new-year'), 'закрытая не в списке');
    assert.equal(setPaletteId('new-year'), 'new-year', 'но примерить можно');
    assert.ok(listPalettes().some((x) => x.id === 'new-year'), 'стоит у владельца — видна с галочкой');
    assert.equal(setPaletteId('halloween'), 'halloween');
    // Тот же ответ без trial (не владелец) — закрытая снимается
    assert.equal(setRemoteThemes({ themes: [{ ...theme, closed: true }], closed: ['halloween'] }), true);
    assert.equal(getPaletteId(), STANDARD);
  } finally {
    setRemoteThemes({ themes: [], closed: [] });
    store.delete(PALETTE_KEY);
    store.delete(THEMES_KEY);
  }
});

/*
 * Стандартная тема (аудит 24.10.2026): у неё своих значений в palettes.js
 * нет, токены — в styles.css, и контраст там уезжал незаметно: белый на
 * синих кнопках тёмной темы 3,6:1, синий на голубой подложке 3,7–4,2:1,
 * серое на подложке выделения 3,8:1.
 */
const declsOf = (block) => {
  const out = {};
  for (const m of block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) out[m[1]] = m[2].trim();
  return out;
};
const ROOT = declsOf(blockOf(':root'));
const DARK_ATTR = declsOf(blockOf(":root[data-theme='dark']"));
const DARK_MEDIA = declsOf(blockOf(":root:not([data-theme='light'])"));
/** Значение токена: var(--x) — по цепочке, var(--tg-*, #hex) — наше запасное, rgba — поверх under */
function colorOf(decls, name, under) {
  let v = decls[name] ?? ROOT[name];
  assert.ok(v, 'нет токена ' + name);
  for (let i = 0; i < 5; i += 1) {
    const fb = v.match(/^var\(--tg-[\w-]+,\s*(.+)\)$/);
    if (fb) { v = fb[1].trim(); continue; }
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    if (ref) { v = decls[ref[1]] ?? ROOT[ref[1]]; continue; }
    break;
  }
  if (HEX.test(v)) return v;
  const r = v.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  assert.ok(r && under, `${name}: не цвет — ${v}`);
  const hex = '#' + [r[1], r[2], r[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  return over(hex, Number(r[4]), under);
}

test('стандартная тема: тёмные блоки styles.css одинаковы (правишь один — правь оба)', () => {
  for (const [k, v] of Object.entries(DARK_ATTR)) assert.equal(DARK_MEDIA[k], v, k);
  assert.equal(Object.keys(DARK_MEDIA).length, Object.keys(DARK_ATTR).length);
});

test('стандартная тема: кнопки, ссылки и надписи на подложке выделения — не ниже 4,5:1', () => {
  for (const [scheme, d] of [['light', ROOT], ['dark', DARK_ATTR]]) {
    const at = (what, fg, bg) => {
      const c = contrast(fg, bg);
      assert.ok(c >= AA, `стандартная/${scheme}: ${what} ${fg} на ${bg} — ${c.toFixed(2)}`);
    };
    const col = (n, under) => colorOf(d, n, under);
    // Белый на заливке: кнопки, активные чипы, «+», «сегодня», события
    at('--accent-text на --accent-fill', col('--accent-text'), col('--accent-fill'));
    for (const g of ['--bg', '--surface']) {
      const ground = col(g);
      // Ссылки и иконки акцентом прямо на фоне и карточке
      at('--accent на ' + g, col('--accent'), ground);
      at('--accent-solid на ' + g, col('--accent-solid'), ground);
      const wash = col('--accent-wash', ground);
      at('--accent-ink на --accent-wash/' + g, col('--accent-ink'), wash);
      at('--accent-2-ink на --accent-2-wash/' + g, col('--accent-2-ink'), col('--accent-2-wash', ground));
      at('--text на --accent-wash/' + g, col('--text'), wash);
      // Серое на подложке пишется вторичным (правило ниже) — вторичный держит
      at('--text-secondary на --accent-wash/' + g, col('--text-secondary'), wash);
      at('--good-text на ' + g, col('--good-text'), ground);
      // Кольцо перебора отдыха — графика, 3:1
      assert.ok(contrast(col('--overtime'), ground) >= 3, `стандартная/${scheme}: --overtime на ${g}`);
    }
    // Оценка подхода — белым по постоянным заливкам вне палитры
    for (const e of ['--effort-easy', '--effort-ok', '--effort-hard']) at('#fff на ' + e, '#ffffff', col(e));
  }
});

// Правила CSS одним списком: селектор и тело (без вложенности глубже @media)
const SRC = new URL('../src/', import.meta.url);
const cssRules = () => {
  const out = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = new URL(f.name + (f.isDirectory() ? '/' : ''), dir);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.css')) {
        const text = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ file: p.href.slice(SRC.href.length), sel: m[1].trim(), body: m[2] });
      }
    }
  };
  walk(SRC);
  return out;
};

test('CSS: на подложке выделения — --accent-ink, под белым текстом — --accent-fill', () => {
  const rules = cssRules();
  assert.ok(rules.length > 1000, 'правила прочитаны: ' + rules.length);
  const bad = [];
  for (const r of rules) {
    const bg = (r.body.match(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;]+)/) || [])[1] || '';
    const color = (r.body.match(/(?:^|[;\s])color\s*:\s*([^;]+)/) || [])[1] || '';
    if (/^var\(--(accent-wash|accent-2-wash|chip-bg)/.test(bg.trim()) && /^var\(--(accent|accent-solid|text-muted)\)/.test(color.trim())) bad.push(`${r.file}: ${r.sel} — ${color.trim()} на ${bg.trim()}`);
    if (/^var\(--(accent|accent-solid)\)$/.test(bg.trim()) && /var\(--accent-text\)/.test(color)) bad.push(`${r.file}: ${r.sel} — --accent-text на ${bg.trim()} (нужен --accent-fill)`);
  }
  assert.deepEqual(bad, []);
});

test('серое на подложке выделения пишется вторичным: --text-muted переопределён внутри', () => {
  const rule = cssRules().find((r) => r.file === 'styles.css' && /--text-muted:\s*var\(--text-secondary\)/.test(r.body));
  assert.ok(rule, 'нет правила --text-muted: var(--text-secondary)');
  const sels = rule.sel.split(',').map((s) => s.trim());
  for (const s of ['.chip', '.option--active', '.rows__item--picked', '.workout__set--current']) assert.ok(sels.includes(s), 'нет ' + s);
});

test('палитры: заливка кнопки = акцент палитры, текст на ней — не ниже 4,5:1', () => {
  for (const p of PALETTES.slice(1)) {
    for (const scheme of ['light', 'dark']) {
      const t = paletteTokens(p, scheme);
      assert.equal(t['--accent-fill'], t['--accent'], `${p.id}/${scheme}`);
      assert.ok(contrast(t['--accent-text'], t['--accent-fill']) >= AA, `${p.id}/${scheme}: текст на заливке`);
      // Надпись на подложке выделения — --accent-ink поверх фона и карточки
      const c = paletteColors(p, scheme);
      for (const g of [c.bg, c.surface]) {
        const wash = over(c.fill, WASH[scheme], g);
        const k = contrast(t['--accent-ink'], wash);
        assert.ok(k >= AA, `${p.id}/${scheme}: --accent-ink на подложке ${k.toFixed(2)}`);
      }
    }
  }
});

/*
 * Рамка поля ввода (аудит 24.10.2026): белое поле на белой карточке видно
 * только по рамке — она держит ≥ 3:1 к поверхности (WCAG 1.4.11) и в
 * стандартной теме, и поверх карточки и фона каждой палитры.
 */
test('рамка поля ввода — не ниже 3:1 к карточке и фону во всех палитрах', () => {
  for (const [scheme, d] of [['light', ROOT], ['dark', DARK_ATTR]]) {
    const raw = d['--field-line'] ?? ROOT['--field-line'];
    const r = raw && raw.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
    assert.ok(r, scheme + ': --field-line — rgba');
    const ink = '#' + [r[1], r[2], r[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
    const grounds = [['стандартная', colorOf(d, '--surface'), colorOf(d, '--bg')]]
      .concat(PALETTES.filter((p) => p[scheme]).map((p) => {
        const c = paletteColors(p, scheme);
        return [p.id, c.surface, c.bg];
      }));
    for (const [id, ...under] of grounds) {
      for (const g of under) {
        const c = contrast(over(ink, Number(r[4]), g), g);
        assert.ok(c >= 3, `${id}/${scheme}: рамка поля на ${g} — ${c.toFixed(2)}`);
      }
    }
  }
});
