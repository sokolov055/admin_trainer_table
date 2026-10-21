import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flagStatus, growthPoints, monthName, needsConfirm, percent, perClientNote, perClientPrice, shortDay, sourceTotals,
} from '../src/trainer/admin-model.js';

/** Панель владельца «Управление» (FT-562): как показываются числа и когда переспросить */

test('недели роста — столбики с подписью дат', () => {
  const points = growthPoints([
    { from: '2026-10-03', to: '2026-10-09', clients: 2, trainers: 0 },
    { from: '2026-10-10', to: '2026-10-16', clients: 5, trainers: 1 },
  ]);
  assert.deepEqual(points.map((p) => p.value), [2, 5]);
  assert.equal(points[1].label, '10.10–16.10');
  assert.equal(points[1].short, '10.10');
  assert.deepEqual(growthPoints(null), []);
  assert.equal(shortDay(''), '');
});

test('источники складываются по неделям и идут в постоянном порядке', () => {
  const totals = sourceTotals([
    { bySource: { self: 1, trainer: 2 } },
    { bySource: { link: 1, self: 2 } },
  ]);
  assert.deepEqual(totals.map((t) => [t.key, t.value]), [['trainer', 2], ['link', 1], ['self', 3]]);
});

test('доля и месяц', () => {
  assert.equal(percent(1, 3), '33%');
  assert.equal(percent(0, 0), '—');
  assert.equal(monthName('2026-10'), 'октябрь 2026');
});

const flag = (over = {}) => ({ key: 'tariffs', value: false, envValue: false, overridden: false, riskyTo: true, ...over });

test('переспрашиваем только при переключении в опасную сторону', () => {
  assert.equal(needsConfirm(flag(), true), true, 'включить тарифы — переспросить');
  assert.equal(needsConfirm(flag({ value: true }), false), false, 'выключить — сразу');
  const push = flag({ key: 'pushOff', value: true, envValue: true, riskyTo: false });
  assert.equal(needsConfirm(push, false), true, 'снять паузу push — переспросить');
  assert.equal(needsConfirm(push, true), false);
  // «Как в .env» — переспросить, только если значение поменяется
  assert.equal(needsConfirm(flag({ value: true, overridden: true }), null), true);
  assert.equal(needsConfirm(flag({ value: false, overridden: true }), null), false);
});

test('состояние флага говорит, откуда значение', () => {
  assert.equal(flagStatus(flag()), 'Выключено · как в .env');
  const s = flagStatus(flag({ value: true, overridden: true, setAt: '2026-10-17T09:05:00' }));
  assert.match(s, /^Включено из панели 17\.10 09:05 · в \.env — выкл$/);
});

test('цена ступени на клиента: цена ÷ граница до рубля; у бесплатной и последней — нет', () => {
  // Ступени по умолчанию (server/src/lib/tariffs.js): Старт, Рост, Про, Студия
  const tiers = [
    { key: 'start', upTo: 3, price: 0 },
    { key: 'growth', upTo: 15, price: 490 },
    { key: 'pro', upTo: 50, price: 990 },
    { key: 'studio', upTo: 150, price: 1990 },
  ];
  const notes = tiers.map((t, i) => perClientNote(t, { unlimited: i === tiers.length - 1 }));
  assert.deepEqual(notes, [
    '',
    '≈ 33 ₽ за клиента в месяц при 15 клиентах',
    '≈ 20 ₽ за клиента в месяц при 50 клиентах',
    '',
  ]);
  assert.equal(perClientPrice(tiers[2]), 20, '19,8 → 20');
  assert.equal(perClientPrice({ upTo: 4, price: 10 }), 3, '2,5 → 3');
  assert.equal(perClientPrice(tiers[3], { unlimited: true }), null);
  // Поля формы — строки, пустые и неверные значения строки не дают
  assert.equal(perClientPrice({ upTo: '40', price: '1 000' }), 25);
  assert.equal(perClientPrice({ upTo: '', price: '490' }), null);
  assert.equal(perClientPrice({ upTo: '15', price: '' }), null);
  assert.equal(perClientPrice({ upTo: '0', price: '490' }), null);
  assert.equal(perClientPrice({ upTo: '2,5', price: '490' }), null);
  assert.equal(perClientPrice({ upTo: 1000, price: 100 }), null, 'меньше рубля — не показываем «≈ 0 ₽»');
  assert.equal(perClientPrice(), null);
  // «при 1 клиенте», «при 21 клиенте», но «при 11 клиентах»
  assert.match(perClientNote({ upTo: 21, price: 420 }), /при 21 клиенте$/);
  assert.match(perClientNote({ upTo: 11, price: 110 }), /при 11 клиентах$/);
  assert.match(perClientNote({ upTo: 1000, price: 25000 }), /^≈ 25 ₽ за клиента в месяц при 1\s000 клиентах$/);
});
