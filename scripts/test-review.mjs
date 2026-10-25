/**
 * Просьба об оценке (план трёх разборов, пункт 6): src/native-review.js.
 *
 * Правила магазинов и памятки 2026-10-21: только системное окно, только
 * после успеха (третья завершённая тренировка), не в первые 3 дня, не чаще
 * раза в 60 дней и не больше 3 раз за год; в браузере — ничего. Здесь
 * настоящий модуль, подменены только мост Capacitor и localStorage.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

const DAY = 86400000;
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const fake = { native: true, platform: 'ios', asked: 0, answer: { asked: true }, info: { store: '' } };
globalThis.window = {
  Capacitor: {
    isNativePlatform: () => fake.native,
    getPlatform: () => fake.platform,
    isPluginAvailable: (name) => name === 'AppReview',
    Plugins: {
      AppReview: {
        requestReview: async () => { fake.asked += 1; return fake.answer; },
        info: async () => fake.info,
      },
    },
  },
};

const review = await import('../src/native-review.js');
const T0 = Date.UTC(2026, 9, 1);
const reset = () => { store.clear(); fake.asked = 0; fake.native = true; fake.platform = 'ios'; fake.answer = { asked: true }; };

test('правила — чистой функцией', () => {
  const v = review.reviewVerdict;
  assert.equal(v({}, 'workout', T0), 'early', 'не знаем первого запуска');
  assert.equal(v({ first: T0, workouts: 5 }, 'workout', T0 + 2 * DAY), 'early', 'первые 3 дня');
  assert.equal(v({ first: T0, workouts: 2 }, 'workout', T0 + 4 * DAY), 'no-success', 'две тренировки — ещё рано');
  assert.equal(v({ first: T0, workouts: 3 }, 'workout', T0 + 4 * DAY), 'ask');
  assert.equal(v({ first: T0, workouts: 0 }, 'record', T0 + 4 * DAY), 'ask', 'другой успех вызывающий проверил сам');
  assert.equal(v({ first: T0, workouts: 9, asks: [T0 + 10 * DAY] }, 'workout', T0 + 69 * DAY), 'recent', '59 дней — рано');
  assert.equal(v({ first: T0, workouts: 9, asks: [T0 + 10 * DAY] }, 'workout', T0 + 71 * DAY), 'ask', '61 день — можно');
  const three = [T0 + 10 * DAY, T0 + 80 * DAY, T0 + 150 * DAY];
  assert.equal(v({ first: T0, workouts: 9, asks: three }, 'workout', T0 + 220 * DAY), 'year', 'три раза за год');
  assert.equal(v({ first: T0, workouts: 9, asks: three }, 'workout', T0 + 376 * DAY), 'ask', 'первая попытка ушла за год');
});

test('третья тренировка после трёх дней — системное окно, потом пауза 60 дней', async () => {
  reset();
  review.noteAppUse(T0);
  review.noteWorkoutDone('a', T0 + DAY);
  review.noteWorkoutDone('b', T0 + 2 * DAY);
  assert.equal(await review.maybeAskReview('workout', T0 + 2 * DAY), false);
  review.noteWorkoutDone('c', T0 + 4 * DAY);
  assert.equal(await review.maybeAskReview('workout', T0 + 4 * DAY), true);
  assert.equal(fake.asked, 1);
  review.noteWorkoutDone('d', T0 + 10 * DAY);
  assert.equal(await review.maybeAskReview('workout', T0 + 10 * DAY), false, 'через неделю — нет');
  assert.equal(fake.asked, 1);
});

test('одно и то же занятие («Продолжить» и снова «Завершить») — один успех', async () => {
  reset();
  review.noteAppUse(T0);
  review.noteWorkoutDone('a', T0);
  review.noteWorkoutDone('a', T0);
  review.noteWorkoutDone('a', T0);
  review.noteWorkoutDone('b', T0);
  assert.equal(await review.maybeAskReview('workout', T0 + 5 * DAY), false, 'успехов два, а не четыре');
});

test('Android не из Google Play: окна нет — попытка не тратится', async () => {
  reset();
  fake.platform = 'android';
  fake.answer = { asked: false };
  review.noteAppUse(T0);
  for (const id of ['a', 'b', 'c']) review.noteWorkoutDone(id, T0);
  assert.equal(await review.maybeAskReview('workout', T0 + 5 * DAY), false);
  fake.answer = { asked: true };
  assert.equal(await review.maybeAskReview('workout', T0 + 6 * DAY), true, 'на следующий день — можно');
});

// Первый полный день (FT-751): любая тренировка + два приёма пищи в один день
const H = 3600000;
const DAY1 = T0 + 10 * H; // 13:00 по Москве первого дня
test('полный день: тренировка и два приёма пищи — окно сразу, без «первых 3 дней»', async () => {
  reset();
  review.noteAppUse(DAY1);
  const day = review.reviewDay(DAY1);
  review.noteMeals(day, 1, DAY1);
  review.noteWorkoutDone('a', DAY1 + H);
  assert.equal(await review.askReviewAt('workout', DAY1 + H), false, 'один приём пищи — ещё не полный день, а тренировка первая');
  review.noteMeals(day, 2, DAY1 + 2 * H);
  assert.equal(await review.askReviewAt('meal', DAY1 + 2 * H), true, 'записали второй приём после тренировки');
  assert.equal(fake.asked, 1);
  // Повод — один раз: следующий полный день через 70 дней окна не даёт
  const later = DAY1 + 70 * DAY;
  review.noteWorkoutDone('b', later);
  review.noteMeals(review.reviewDay(later), 3, later);
  assert.equal(await review.askReviewAt('meal', later), false);
  assert.equal(fake.asked, 1);
});

test('полный день на итоге тренировки; вчерашняя еда не считается', async () => {
  reset();
  review.noteAppUse(DAY1);
  review.noteMeals(review.reviewDay(DAY1), 2, DAY1);
  review.noteWorkoutDone('a', DAY1 + DAY);
  assert.equal(await review.askReviewAt('workout', DAY1 + DAY), false, 'еда — вчера, тренировка — сегодня');
  review.noteMeals(review.reviewDay(DAY1 + DAY), 2, DAY1 + DAY);
  assert.equal(await review.askReviewAt('workout', DAY1 + DAY + H), true, 'еда записана заранее, тренировка завершена — на итоге');
  assert.equal(review.noteMeals('2026-01-01', 5, DAY1 + DAY), undefined);
  assert.equal(JSON.parse(store.get('fittrack_review_v1')).mealsDay, review.reviewDay(DAY1 + DAY), 'не сегодняшний день дневника не трогает счётчик');
});

test('с «Разбором дня» — окно только после его закрытия', async () => {
  reset();
  review.noteAppUse(DAY1);
  review.noteDayReview();
  review.noteMeals(review.reviewDay(DAY1), 2, DAY1);
  review.noteWorkoutDone('a', DAY1 + H);
  assert.equal(await review.askReviewAt('workout', DAY1 + H), false, 'на итоге тренировки — нет');
  assert.equal(await review.askReviewAt('meal', DAY1 + H), false, 'после записи еды — нет');
  assert.equal(await review.askReviewAt('day-review', DAY1 + 2 * H), true, 'закрыли разбор — окно');
});

test('полный день не обходит паузу 60 дней и предел 3 раза в год', () => {
  const v = review.reviewVerdict;
  const day = review.reviewDay(DAY1);
  const full = { first: DAY1, workoutDay: day, mealsDay: day, meals: 2 };
  assert.equal(v(full, 'day', DAY1), 'ask');
  assert.equal(v({ ...full, asks: [DAY1 - 10 * DAY] }, 'day', DAY1), 'recent');
  assert.equal(v({ ...full, meals: 1 }, 'day', DAY1), 'no-success');
  assert.equal(v({ ...full, dayAsked: true }, 'day', DAY1), 'done');
  assert.deepEqual(review.reviewReasons({}, 'workout'), ['day', 'workout']);
  assert.deepEqual(review.reviewReasons({ dayReview: true }, 'workout'), ['workout']);
});

test('в браузере — ничего: ни счётчиков, ни окна, ни строки «Оценить»', async () => {
  reset();
  fake.native = false;
  review.noteAppUse(T0);
  review.noteWorkoutDone('a', T0);
  review.noteMeals(review.reviewDay(T0), 3, T0);
  review.noteDayReview();
  assert.equal(store.size, 0, 'на устройстве ничего не пишем');
  assert.equal(await review.maybeAskReview('record', T0 + 10 * DAY), false);
  assert.equal(fake.asked, 0);
  assert.equal(await review.canRateInStore(), false);
});

test('«Оценить Fit Track»: iPhone — всегда, Android — только из Google Play', async () => {
  reset();
  assert.equal(await review.canRateInStore(), true);
  fake.platform = 'android';
  fake.info = { store: '' };
  assert.equal(await review.canRateInStore(), false, 'APK с сайта — строки нет');
  fake.info = { store: 'play' };
  assert.equal(await review.canRateInStore(), true);
});

test('данные для поддержки: версия оболочки и модель — без разрешений', async () => {
  reset();
  window.Capacitor.Plugins.App = { getInfo: async () => ({ version: '1.6', build: '24' }) };
  fake.info = { model: 'iPhone16,1', system: 'iOS 18.1', store: '' };
  assert.deepEqual(await review.deviceInfo(), { platform: 'ios', app: 'iPhone 1.6 (24)', device: 'iPhone16,1 · iOS 18.1' });
  fake.native = false;
  const web = await review.deviceInfo();
  assert.equal(web.platform, 'web');
  assert.match(web.device, /^браузер/);
});
