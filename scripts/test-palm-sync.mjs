/**
 * «Ладонь» (план трёх разборов, п. 8): КБЖУ порции рукой заданы дважды —
 * в src/nutrition/palm-model.js (экран считает итог и норму) и в
 * server/src/api/diary-handlers.js (сервер пишет запись). Разойдутся —
 * дневник покажет одни калории, а неделя и тренер увидят другие.
 *
 * Сервер лежит в соседнем репозитории (../server относительно webapp/);
 * в CI веба его нет — тогда проверка пропускается, а не падает.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALM } from '../src/nutrition/palm-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// webapp/ лежит рядом с server/; worktree веба (worktrees/<имя>) — на уровень глубже
const serverFile = ['..', '../..'].map((up) => path.resolve(root, up, 'server', 'src', 'api', 'diary-handlers.js')).find((f) => fs.existsSync(f)) || '';

/** Вырезать `export const PALM = {...};` из исходника сервера, не исполняя его */
export function palmFromSource(source) {
  const m = /export const PALM = (\{[\s\S]*?\});/.exec(source);
  if (!m) return null;
  return new Function('return (' + m[1] + ');')();
}

test('PALM сервера и веба совпадают', (t) => {
  if (!serverFile) { t.skip('сервер рядом не лежит'); return; }
  const server = palmFromSource(fs.readFileSync(serverFile, 'utf8'));
  assert.ok(server, 'в diary-handlers.js не нашёлся export const PALM = {...};');
  assert.deepEqual(server, PALM);
});

test('вырезка читает объект сервера как есть и замечает расхождение', () => {
  const same = palmFromSource("const x = 1;\nexport const PALM = {\n  protein: { name: 'Белок · ладонь', kcal: 135, protein: 25, fat: 4, carbs: 0 },\n};\nexport const OTHER = {};");
  assert.deepEqual(same, { protein: { name: 'Белок · ладонь', kcal: 135, protein: 25, fat: 4, carbs: 0 } });
  assert.notDeepEqual({ ...PALM, veg: { ...PALM.veg, kcal: PALM.veg.kcal + 1 } }, PALM);
  assert.equal(palmFromSource('export const PALMS = {};'), null);
});
