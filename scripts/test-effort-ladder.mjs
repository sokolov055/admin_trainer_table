import test from 'node:test';
import assert from 'node:assert/strict';
import { rateSet, rerate, unrateAt } from '../src/effort.js';

/**
 * Подсказка веса отсчитывается от того, что сделано сейчас, а не от веса
 * прошлой тренировки (владелец, 16.10.2026): прошлый раз 50 · 50 · 50,
 * сегодня первый подход 60 — «легко» даёт следующим 62,5, а не 50. Правила
 * прибавок и «тяжело» — владельца 22.10.2026 (Notion, «как у тренера») с
 * правкой 26.10.2026: «легко» — один шаг (FT-755), каждое «тяжело» — шаг
 * вниз (FT-756).
 */

const press = (weights, last = weights) => ({
  name: 'Жим лёжа', target: '8',
  lastRun: { date: '2026-10-09', weights: last.map(String), reps: last.map(() => '8') },
  sets: weights.map((w) => ({ weight: String(w), reps: '8', state: 'pending', kind: 'work' })),
});
const rate = (ex, si, effort, weight) => {
  const copy = { ...ex, sets: ex.sets.map((s, i) => (i === si && weight ? { ...s, weight: String(weight), own: true } : s)) };
  return rateSet(copy, si, effort).ex.sets.map((s) => s.weight);
};

test('сделали тяжелее прошлого раза и «легко» — дальше от сделанного, а не от прошлого', () => {
  assert.deepEqual(rate(press([50, 50, 50]), 0, 'easy', 60), ['60', '62.5', '62.5']);
});

test('«тяжело» и не добил — от сделанного по формуле, вниз до блина', () => {
  const ex = press([60, 60, 60]);
  ex.sets[0].reps = '5';
  // 55 на 5 из 8 ≈ 50,7 на 8 → 50
  assert.deepEqual(rate(ex, 0, 'hard', 55), ['55', '50', '50']);
});

test('«норм» — ближайший следующий не легче этого, дальше как стоят (24.10.2026)', () => {
  assert.deepEqual(rate(press([50, 50, 50]), 0, 'ok', 60), ['60', '60', '50']);
  // Следующий и так не легче — «норм» ничего не двигает
  assert.deepEqual(rate(press([50, 50, 50]), 0, 'ok'), ['50', '50', '50']);
});

test('вес как в прошлый раз, «легко» — +шаг следующим (FT-755)', () => {
  assert.deepEqual(rate(press([100, 100, 100]), 0, 'easy'), ['100', '102.5', '102.5']);
});

test('после «тяжело» лесенка прошлого раза не растёт (жалоба владельца 22.10.2026)', () => {
  // Прошлый раз 100 · 100 · 120, сегодня 90 и не добил: дальше 82,5, а не 107,5
  const ex = press([100, 100, 120]);
  ex.sets[0].reps = '5';
  assert.deepEqual(rate(ex, 0, 'hard', 90), ['90', '82.5', '82.5']);
  // Прошлый раз 50 · 55 · 60, сегодня 50 «тяжело» — дальше не 55, а 47,5
  assert.deepEqual(rate(press([50, 55, 60]), 0, 'hard'), ['50', '47.5', '47.5']);
});

test('подход, который в прошлый раз был легче, остаётся своим (сброс, разминка)', () => {
  assert.deepEqual(rate(press([100, 80]), 0, 'easy'), ['100', '80']);
});

test('без истории — как раньше: не легче сделанного двигаем, ниже не трогаем', () => {
  const ex = { name: 'Жим лёжа', target: '8', sets: [50, 50, 40].map((w) => ({ weight: String(w), reps: '8', state: 'pending', kind: 'work' })) };
  assert.deepEqual(rate(ex, 0, 'easy'), ['50', '52.5', '40']);
});

test('вписанное руками не трогаем', () => {
  const ex = press([50, 50, 50]);
  ex.sets[1] = { ...ex.sets[1], own: true };
  assert.deepEqual(rate(ex, 0, 'easy', 60), ['60', '50', '62.5']);
});

/** «Нажал не то» (19.10.2026): оценку можно поменять, прибавка веса возвращается */
const ws = (ex) => ex.sets.map((s) => s.weight);
const states = (ex) => ex.sets.map((s) => s.state[0]).join('');

test('«легко» нажали по ошибке → «норм»: веса следующих подходов вернулись', () => {
  const ex = press([60, 60, 60]);
  const easy = rateSet(ex, 0, 'easy').ex;
  assert.deepEqual(ws(easy), ['60', '62.5', '62.5']);
  const ok = rerate(easy, 0, 'ok').ex;
  assert.deepEqual(ws(ok), ['60', '60', '60']);
  assert.equal(ok.sets[0].effort, 'ok');
  assert.equal(ok.sets[0].state, 'done');
  assert.ok(!ok.sets[0].raised && !ok.sets[0].moved);
  assert.ok(ok.sets.slice(1).every((s) => !s.suggest), 'подсказка «было легко» ушла');
});

test('«норм» → «легко»: прибавка появилась', () => {
  const ok = rateSet(press([60, 60, 60]), 0, 'ok').ex;
  assert.deepEqual(ws(ok), ['60', '60', '60']);
  assert.deepEqual(ws(rerate(ok, 0, 'easy').ex), ['60', '62.5', '62.5']);
});

test('«снять отметку» возвращает прибавленный вес', () => {
  const easy = rateSet(press([60, 60, 60]), 0, 'easy').ex;
  const back = unrateAt(easy, 0);
  assert.deepEqual(ws(back), ['60', '60', '60']);
  assert.equal(states(back), 'ppp');
  assert.ok(!back.sets[0].effort && !back.sets[0].moved);
});

test('вес, который человек успел поменять руками, при возврате не трогаем', () => {
  const easy = rateSet(press([60, 60, 60]), 0, 'easy').ex;
  const edited = { ...easy, sets: easy.sets.map((s, i) => (i === 1 ? { ...s, weight: '70' } : s)) };
  assert.deepEqual(ws(unrateAt(edited, 0)), ['60', '70', '60']);
});

test('следующий подход уже сделан — его вес не возвращаем', () => {
  const easy = rateSet(press([60, 60, 60]), 0, 'easy').ex;
  const next = { ...easy, sets: easy.sets.map((s, i) => (i === 1 ? { ...s, state: 'done', effort: 'ok' } : s)) };
  // Сделанный второй остаётся как есть, ещё не сделанный третий — возвращается
  assert.deepEqual(ws(unrateAt(next, 0)), ['60', '62.5', '60']);
});

test('смена оценки у второго подхода не трогает первый', () => {
  let ex = rateSet(press([60, 60, 60]), 0, 'ok').ex;
  ex = rateSet(ex, 1, 'easy').ex;
  assert.deepEqual(ws(ex), ['60', '60', '62.5']);
  ex = rerate(ex, 1, 'hard').ex;
  assert.equal(ex.sets[0].effort, 'ok');
  assert.equal(ex.sets[1].effort, 'hard');
  assert.deepEqual(ws(ex).slice(0, 2), ['60', '60']);
});

/**
 * Владелец, 26.10.2026 (FT-756): каждое «тяжело» снимает шаг (7,5 → 5 →
 * 2,5), не ниже разминки; до этого вес держался, а шаг снимало только второе
 * «тяжело» подряд. Отдых короче только когда прибавлять некуда (capped)
 */
test('каждое «тяжело» подряд снимает шаг, не ниже разминки (FT-756)', () => {
  const ex = press([100, 100, 100, 100]);
  const r1 = rateSet(ex, 0, 'hard');
  assert.equal(r1.lowered, true, 'первое тяжело — уже шаг вниз');
  assert.deepEqual(r1.ex.sets.map((s) => s.weight), ['100', '97.5', '97.5', '97.5']);
  const r2 = rateSet(r1.ex, 1, 'hard');
  assert.deepEqual(r2.ex.sets.map((s) => s.weight), ['100', '97.5', '95', '95']);
  const r3 = rateSet(r2.ex, 2, 'hard');
  assert.deepEqual(r3.ex.sets.map((s) => s.weight), ['100', '97.5', '95', '92.5']);
  // Разминка 95 — ниже неё не опускаем
  const warm = { ...ex, sets: [{ weight: '95', reps: '12', state: 'done', kind: 'warmup' }, ...ex.sets] };
  assert.deepEqual(rateSet(rateSet(warm, 1, 'hard').ex, 2, 'hard').ex.sets.map((s) => s.weight), ['95', '100', '97.5', '95', '95']);
});

test('capped: «легко» на лёгком подходе лесенки — отдых обычный, на последнем без следующих — тоже не capped', () => {
  const ladder = press([100, 120, 140]);
  assert.equal(rateSet(ladder, 0, 'easy').capped, false, 'не самый тяжёлый — вес впереди ещё растёт');
  assert.equal(rateSet(ladder, 2, 'easy').capped, true, 'самый тяжёлый, а сдвигать нечего — прибавлять некуда');
  const own = { ...press([100, 100]), track: { kind: 'bodyweight' } };
  const bare = { ...own, sets: own.sets.map((s) => ({ ...s, weight: '' })) };
  assert.equal(rateSet(bare, 0, 'easy').capped, false, 'без веса оценка веса не касается');
});

/**
 * FT-758 (26.10.2026): «Легко» на 40 подняло следующие, третий вписан 50 и
 * отмечен «Норм» — у четвёртого (60) оставалась подпись «+10 кг · было
 * легко». Причина в подписи — от прежней оценки: «Норм» её снимает, а
 * «снять отметку» возвращает
 */
test('FT-758: оценка без сдвига снимает у следующих подпись прежней, «снять» возвращает', () => {
  const ex = { name: 'Жим ногами', target: '15', load: { step: 5 }, sets: [
    { weight: '40', reps: '15', state: 'done', kind: 'work', effort: 'easy' },
    { weight: '50', reps: '15', state: 'pending', kind: 'work', own: true, suggest: 'easy' },
    { weight: '60', reps: '15', state: 'pending', kind: 'work', suggest: 'easy' },
  ] };
  const ok = rateSet(ex, 1, 'ok').ex;
  assert.deepEqual(ws(ok), ['40', '50', '60']);
  assert.equal(ok.sets[2].suggest, undefined);
  assert.equal(unrateAt(ok, 1).sets[2].suggest, 'easy');
});
