import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as web from '../src/effort.js';

/**
 * Одни и те же примеры для копии логики веса на сайте и на сервере
 * (FT-629). Файл — копия server/test/fixtures/effort-cases.json; тест
 * сервера сверяет, что копии одинаковы, когда сайт лежит рядом.
 */

const { cases } = JSON.parse(readFileSync(new URL('./fixtures/effort-cases.json', import.meta.url), 'utf8'));

function outcome(c) {
  const out = web[c.fn](...structuredClone(c.args));
  if (c.fn !== 'rateSet') return out;
  const key = (c.expect && c.expect.key) || 'weight';
  return { ...(key !== 'weight' ? { key } : {}), values: out.ex.sets.map((s) => s[key] ?? ''), raised: out.raised, lowered: out.lowered };
}

for (const c of cases) {
  test('общий пример: ' + c.name, () => assert.deepEqual(outcome(c), c.expect));
}
