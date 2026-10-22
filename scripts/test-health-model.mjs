/**
 * Данные о здоровье (FT-708): что спрашивать на этом устройстве, спрашивать
 * ли при входе, как разложить сон, пульс, вес и калории по дням и что
 * показать в блоке «Здоровье». Настоящий src/health-model.js, без телефона.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  healthScope, shouldAskHealth, healthReads, sleepByDay, lastByDay, avgByDay, aggregatedByDay, totalKcalByDay,
  fatPercent, mergeHealthDays, hrFromAggregated, healthSummary, spentForDay, formatMinutes, localDate,
} from '../src/health-model.js';

const at = (date, hm) => new Date(`${date}T${hm}:00`).toISOString();

test('scope: iPhone 26+ и Health Connect 11+ — всё; старые сборки и Huawei — шаги и тренировки', () => {
  assert.equal(healthScope({ platform: 'ios', build: '26' }), 'full');
  assert.equal(healthScope({ platform: 'ios', build: 25 }), 'basic');
  assert.equal(healthScope({ platform: 'android', build: 11 }), 'full');
  assert.equal(healthScope({ platform: 'android', build: 10 }), 'basic');
  assert.equal(healthScope({ platform: 'android', build: 12, huawei: true }), 'basic');
  assert.equal(healthScope({ platform: 'android', build: 0 }), 'basic', 'номер сборки неизвестен — как старая');
  assert.equal(healthScope({ platform: 'web', build: 30 }), '');
  assert.equal(healthScope({ platform: 'ios', build: 30, available: false }), '');
});

test('спрашивать ли при входе: один раз; «Не сейчас» — никогда; basic → full — ещё раз, тоже один', () => {
  assert.equal(shouldAskHealth({ access: { decision: '' }, deviceScope: 'basic' }), true, 'не спрашивали');
  assert.equal(shouldAskHealth({ access: { decision: '' }, deviceScope: 'full' }), true);
  assert.equal(shouldAskHealth({ access: { decision: 'declined', scope: 'basic' }, deviceScope: 'full' }), false);
  assert.equal(shouldAskHealth({ access: { decision: 'granted', scope: 'basic' }, deviceScope: 'basic' }), false, 'новых пунктов нет');
  assert.equal(shouldAskHealth({ access: { decision: 'granted', scope: 'basic' }, deviceScope: 'full' }), true, 'обновился');
  assert.equal(shouldAskHealth({ access: { decision: 'granted', scope: 'basic' }, deviceScope: 'full', fullAsked: true }), false, 'уже показали на полном');
  assert.equal(shouldAskHealth({ access: { decision: 'granted', scope: 'full', consent: true }, deviceScope: 'full' }), false);
  assert.equal(shouldAskHealth({ access: { decision: 'granted', scope: 'full', consent: false }, deviceScope: 'full', fullAsked: true }), true, 'согласие устарело — как впервые');
  assert.equal(shouldAskHealth({ access: { decision: 'granted', scope: 'full', consent: false }, deviceScope: 'basic' }), false);
  assert.equal(shouldAskHealth({ access: null, deviceScope: 'full' }), false, 'сервер не ответил — не спрашиваем');
  assert.equal(shouldAskHealth({ access: { decision: '' }, deviceScope: '' }), false, 'нет «Здоровья»');
});

test('одно окно: basic — как раньше, full — все типы; на iPhone totalCalories не просим, давления и сахара нет', () => {
  assert.deepEqual(healthReads('ios', 'basic'), ['steps', 'workouts']);
  assert.deepEqual(healthReads('android', 'basic'), ['steps', 'workouts', 'calories', 'totalCalories', 'distance']);
  assert.deepEqual(healthReads('android', 'basic', false), ['steps']);
  const ios = healthReads('ios', 'full');
  for (const t of ['sleep', 'restingHeartRate', 'heartRateVariability', 'heartRate', 'weight', 'bodyFat', 'height', 'vo2Max', 'calories']) assert.ok(ios.includes(t), t);
  assert.ok(!ios.includes('totalCalories'));
  const android = healthReads('android', 'full');
  assert.ok(android.includes('totalCalories'));
  assert.equal(new Set(android).size, android.length, 'без повторов');
  for (const t of ['bloodPressure', 'bloodGlucose', 'bodyTemperature', 'oxygenSaturation', 'respiratoryRate', 'mindfulness']) assert.ok(!android.includes(t) && !ios.includes(t), t);
});

test('сон iPhone: отрезки фаз от часов; «в кровати» от телефона не прибавляется; ночь — по дню пробуждения', () => {
  const watch = (stage, from, to) => ({ startDate: from, endDate: to, value: (Date.parse(to) - Date.parse(from)) / 60000, sleepState: stage, sourceId: 'com.apple.health.watch', stages: [{ stage, durationMinutes: (Date.parse(to) - Date.parse(from)) / 60000 }] });
  const samples = [
    { startDate: at('2026-10-20', '23:00'), endDate: at('2026-10-21', '07:00'), value: 480, sleepState: 'inBed', sourceId: 'com.apple.iphone', stages: [{ stage: 'inBed', durationMinutes: 480 }] },
    watch('light', at('2026-10-20', '23:10'), at('2026-10-21', '01:10')),
    watch('deep', at('2026-10-21', '01:10'), at('2026-10-21', '02:40')),
    watch('awake', at('2026-10-21', '02:40'), at('2026-10-21', '02:55')),
    watch('rem', at('2026-10-21', '02:55'), at('2026-10-21', '04:25')),
    watch('light', at('2026-10-21', '04:25'), at('2026-10-21', '06:45')),
  ];
  const nights = sleepByDay(samples);
  assert.deepEqual(Object.keys(nights), ['2026-10-21'], 'начало накануне вечером — ночь на 21-е');
  assert.deepEqual(nights['2026-10-21'], { sleepMin: 440, sleepDeepMin: 90, sleepRemMin: 90, sleepLightMin: 260, sleepAwakeMin: 15 });
});

test('сон: только «в кровати» (iPhone без часов) — длительность без фаз; Android — сессия с фазами и без', () => {
  const bed = sleepByDay([{ startDate: at('2026-10-20', '23:30'), endDate: at('2026-10-21', '07:00'), value: 450, sleepState: 'inBed', stages: [{ stage: 'inBed', durationMinutes: 450 }] }]);
  assert.deepEqual(bed['2026-10-21'], { sleepMin: 450, sleepDeepMin: null, sleepRemMin: null, sleepLightMin: null, sleepAwakeMin: null });
  const hc = sleepByDay([
    { startDate: at('2026-10-21', '23:00'), endDate: at('2026-10-22', '06:30'), value: 450, sourceId: 'com.sec.android.app.shealth', hasStageData: true,
      stages: [{ stage: 'light', durationMinutes: 250 }, { stage: 'deep', durationMinutes: 80 }, { stage: 'rem', durationMinutes: 100 }, { stage: 'awake', durationMinutes: 20 }] },
    // Тот же сон от второго приложения без фаз — не складываем
    { startDate: at('2026-10-21', '23:05'), endDate: at('2026-10-22', '06:20'), value: 435, sourceId: 'com.google.android.apps.fitness', hasStageData: false },
    // Без фаз вовсе — вся сессия как сон
    { startDate: at('2026-10-22', '23:00'), endDate: at('2026-10-23', '06:00'), value: 420, sourceId: 'com.mi.health', hasStageData: false },
  ]);
  assert.deepEqual(hc['2026-10-22'], { sleepMin: 430, sleepDeepMin: 80, sleepRemMin: 100, sleepLightMin: 250, sleepAwakeMin: 20 });
  assert.equal(hc['2026-10-23'].sleepMin, 420);
  assert.equal(hc['2026-10-23'].sleepDeepMin, null);
});

test('по дням: вес — последний за день, ВСР — среднее, суммы и пульс покоя — из queryAggregated', () => {
  const weight = lastByDay([
    { startDate: at('2026-10-21', '07:10'), value: 77.4 },
    { startDate: at('2026-10-21', '21:40'), value: 77.9 },
    { startDate: at('2026-10-20', '07:05'), value: 77.6 },
  ]);
  assert.deepEqual(weight, { '2026-10-21': 77.9, '2026-10-20': 77.6 });
  assert.deepEqual(avgByDay([{ startDate: at('2026-10-21', '03:00'), value: 40 }, { startDate: at('2026-10-21', '09:00'), value: 50 }]), { '2026-10-21': 45 });
  const agg = [{ startDate: at('2026-10-21', '00:00'), value: 61, values: { average: 58, max: 70 } }];
  assert.deepEqual(aggregatedByDay(agg, 'average'), { '2026-10-21': 58 });
  assert.deepEqual(aggregatedByDay([{ startDate: at('2026-10-21', '00:00'), value: 512 }], 'sum'), { '2026-10-21': 512 });
  assert.equal(fatPercent(0.214), 21.4, 'iPhone — доля');
  assert.equal(fatPercent(21.4), 21.4, 'Android — проценты');
});

test('общий расход Health Connect: часы и телефон пишут оба — берём источник с большим, а не сумму', () => {
  const total = totalKcalByDay([
    { startDate: at('2026-10-21', '01:00'), value: 1200, sourceId: 'watch' },
    { startDate: at('2026-10-21', '13:00'), value: 1100, sourceId: 'watch' },
    { startDate: at('2026-10-21', '12:00'), value: 2000, sourceId: 'phone' },
  ]);
  assert.deepEqual(total, { '2026-10-21': 2300 });
});

test('дни для отправки: пустые поля не шлём, округляем, сортируем по дате', () => {
  const days = mergeHealthDays({
    sleep: { '2026-10-21': { sleepMin: 460, sleepDeepMin: null } },
    restingHr: { '2026-10-21': 57.6, '2026-10-19': 60 },
    weightKg: { '2026-10-20': 77.94 },
    bodyFatPct: { '2026-10-20': 21.449 },
    vo2max: {},
  });
  assert.deepEqual(days, [
    { date: '2026-10-19', restingHr: 60 },
    { date: '2026-10-20', weightKg: 77.9, bodyFatPct: 21.4 },
    { date: '2026-10-21', sleepMin: 460, restingHr: 58 },
  ]);
});

test('пульс за тренировку: средний и максимальный; через полночь — две корзины; мусор отбрасываем', () => {
  assert.deepEqual(hrFromAggregated([{ value: 120, values: { average: 120, max: 165 } }]), { hrAvg: 120, hrMax: 165 });
  assert.deepEqual(hrFromAggregated([{ values: { average: 130, max: 170 } }, { values: { average: 110, max: 150 } }]), { hrAvg: 120, hrMax: 170 });
  assert.deepEqual(hrFromAggregated([]), { hrAvg: null, hrMax: null });
  assert.deepEqual(hrFromAggregated([{ values: { average: 0, max: 400 } }]), { hrAvg: null, hrMax: null });
});

test('блок «Здоровье»: прошлая ночь и среднее за неделю, тренд пульса, сегодня, вес из latest; пустого нет', () => {
  const today = '2026-10-22';
  const days = [
    { date: '2026-10-16', sleepMin: 420, restingHr: 60, hrvMs: 40 },
    { date: '2026-10-18', sleepMin: 400, restingHr: 62, hrvMs: 42 },
    { date: '2026-10-20', sleepMin: 440, restingHr: 61 },
    { date: '2026-10-22', sleepMin: 460, sleepDeepMin: 80, sleepRemMin: 90, sleepLightMin: 270, sleepAwakeMin: 20, restingHr: 57, activeKcal: 380, totalKcal: 1900 },
  ];
  const s = healthSummary({ days, latest: { weightKg: 76.8, weightDate: '2026-10-21' } }, today);
  assert.equal(s.sleep.lastNight, true);
  assert.equal(s.sleep.min, 460);
  assert.equal(s.sleep.avg7, 430, 'неделя — с 16-го по 22-е');
  assert.equal(s.sleep.deep, 80);
  assert.deepEqual([s.restingHr.value, s.restingHr.avg, s.restingHr.delta], [57, 61, -4]);
  assert.deepEqual([s.hrv.value, s.hrv.delta], [42, 2], 'ВСР — последнее значение 18-го');
  assert.deepEqual(s.kcal, { active: 380, total: 1900 });
  assert.deepEqual(s.weight, { value: 76.8, date: '2026-10-21' });
  assert.equal(s.bodyFat, null);
  assert.equal(s.vo2max, null);
});

test('блок «Здоровье»: сон старше двух суток не «прошлая ночь»; ничего нет — блока нет', () => {
  const s = healthSummary({ days: [{ date: '2026-10-18', sleepMin: 400 }, { date: '2026-10-21', restingHr: 58 }] }, '2026-10-22');
  assert.equal(s.sleep, null);
  assert.equal(s.restingHr.value, 58);
  assert.equal(s.kcal, null, 'сегодня калорий нет');
  assert.equal(healthSummary({ days: [], latest: {} }, '2026-10-22'), null);
  assert.equal(healthSummary(null), null);
  const yesterday = healthSummary({ days: [{ date: '2026-10-21', sleepMin: 380 }] }, '2026-10-22');
  assert.equal(yesterday.sleep.lastNight, false, 'ночь на вчера — подпишем датой');
});

test('«Потрачено» в «Питании»: общий расход, иначе активные; нет — строки нет', () => {
  const data = { days: [{ date: '2026-10-21', activeKcal: 420, totalKcal: 2310.4 }, { date: '2026-10-22', activeKcal: 380 }] };
  assert.deepEqual(spentForDay(data, '2026-10-21'), { kcal: 2310, kind: 'total' });
  assert.deepEqual(spentForDay(data, '2026-10-22'), { kcal: 380, kind: 'active' });
  assert.equal(spentForDay(data, '2026-10-20'), null);
  assert.equal(spentForDay(null, '2026-10-20'), null);
});

test('минуты словами', () => {
  assert.equal(formatMinutes(445), '7 ч 25 мин');
  assert.equal(formatMinutes(420), '7 ч');
  assert.equal(formatMinutes(35), '35 мин');
  assert.equal(localDate(new Date(2026, 9, 2)), '2026-10-02');
});
