/*
 * Расчёты главной клиента (макет home-redesign-2026-11-19, согласован
 * владельцем 19.11.2026). Без React — проверяются в test-overview.mjs.
 */

/** Больше стольких билетиков в ряд не помещается на 360 px — тогда полоса */
export const TICKETS_MAX = 12;

/**
 * Билетики пакета: сколько всего и сколько осталось. total — размер пакета
 * из карточки, но не меньше остатка (переплата с прошлого пакета); пакет не
 * задан — столько, сколько осталось. Долг — все пройдены.
 * Возвращает null, когда рисовать нечего или их больше TICKETS_MAX.
 */
export function ticketRow(left, packageCount) {
  if (left === null || left === undefined || !Number.isFinite(Number(left))) return null;
  const rest = Math.max(0, Math.floor(Number(left)));
  const total = Math.max(Number(packageCount) || 0, rest);
  if (!total || total > TICKETS_MAX) return null;
  return { total, left: rest, used: total - rest };
}

/**
 * «Хватит примерно до …» — по среднему темпу (решение владельца 19.11.2026):
 * perWeek — тренировок в неделю за последние 4 недели (server lib/package.js).
 * Оставшихся left хватит на left / perWeek недель. Нечего считать — null.
 */
export function enoughUntil(left, perWeek, now = new Date()) {
  const n = Number(left);
  const pace = Number(perWeek);
  if (!(n > 0) || !(pace > 0)) return null;
  const days = Math.ceil((n / pace) * 7);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return d;
}

/** «3 декабря» */
export const dayMonth = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

// Группы мышц (data-tones.js) — подписи чипов на карточке тренировки
const TONE_LABEL = { legs: 'Ноги', back: 'Спина', core: 'Пресс', chest: 'Грудь и плечи', arms: 'Руки', cardio: 'Кардио' };

/**
 * Две главные группы мышц тренировки: по числу упражнений, при равенстве —
 * в порядке программы. tone(ex) — muscleTone из data-tones.js.
 */
export function topGroups(exercises, tone, limit = 2) {
  const count = new Map();
  (Array.isArray(exercises) ? exercises : []).forEach((ex) => {
    const t = tone(ex);
    if (t) count.set(t, (count.get(t) || 0) + 1);
  });
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => ({ tone: t, label: TONE_LABEL[t] || t }));
}

/** Сегодня ли дата — по часам телефона */
export function isToday(iso, now = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Готовые тексты в «Пожелание тренеру» (кнопки главной; решение владельца 19.11.2026: в приложение) */
export const WISH_PAY = 'Оплаченные тренировки закончились — подскажите, как оплатить следующий пакет?';
export const WISH_TIME = 'Подскажите, когда следующая тренировка? Мне удобно: ';
