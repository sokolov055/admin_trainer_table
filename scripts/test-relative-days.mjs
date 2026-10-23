/**
 * «Был вчера» — по календарным дням, а не по суткам (23.10.2026).
 *
 * Тренировка в среду в 07:30, в пятницу в 06:58 — прошло меньше 48 часов,
 * и деление разницы на сутки давало «вчера», хотя в четверг клиента не было.
 * Проверяем настоящий ui.jsx с подменённым «сейчас».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

const output = await build({
  entryPoints: ['src/ui.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom'],
  loader: { '.png': 'dataurl', '.svg': 'dataurl' },
  plugins: [{
    name: 'no-css',
    setup(bundle) { bundle.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })); },
  }],
});

// Свой Date: «сейчас» — пятница 23.10.2026, 06:58 по Москве
const NOW = new Date('2026-10-23T06:58:00+03:00').getTime();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}

const module = { exports: {} };
vm.runInNewContext(output.outputFiles[0].text, {
  module, exports: module.exports, require: createRequire(import.meta.url),
  Date: FixedDate, console, setTimeout, clearTimeout, URL, URLSearchParams, Intl, TextEncoder, TextDecoder,
  window: undefined, document: undefined, navigator: undefined, localStorage: undefined,
});
const { relativeDays, daysSince } = module.exports;

test('среда 07:30 при пятнице 06:58 — «2 дня назад», а не «вчера»', () => {
  assert.equal(relativeDays('2026-10-21T07:30:00+03:00'), '2 дня назад');
  assert.equal(daysSince('2026-10-21T07:30:00+03:00'), 2);
});

test('вчера вечером — «вчера», хотя суток ещё не прошло', () => {
  assert.equal(relativeDays('2026-10-22T21:00:00+03:00'), 'вчера');
});

test('сегодня утром, до «сейчас» — «сегодня»', () => {
  assert.equal(relativeDays('2026-10-23T05:00:00+03:00'), 'сегодня');
});

test('будущее: завтра и через несколько дней', () => {
  assert.equal(relativeDays('2026-10-24T05:00:00+03:00'), 'завтра');
  assert.equal(relativeDays('2026-10-26T10:00:00+03:00'), 'через 3 дня');
});
