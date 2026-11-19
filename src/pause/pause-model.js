/*
 * Пауза в тренировках — заморозка (макет freeze-2026-11-19-v2, согласован
 * владельцем 19.11.2026; сервер — server/src/lib/pauses.js). Без React —
 * проверяется в scripts/test-pause.mjs.
 */

/** Клиент сам — не дольше (как CLIENT_MAX_DAYS на сервере) */
export const CLIENT_MAX_DAYS = 30;

export const REASONS = [
  { id: 'ill', emoji: '🤒', client: 'Болею', trainer: 'Болеет' },
  { id: 'vacation', emoji: '🏖️', client: 'Отпуск', trainer: 'Отпуск' },
  { id: 'trip', emoji: '💼', client: 'Поездка', trainer: 'Поездка' },
  { id: 'other', emoji: '💬', client: 'Другое', trainer: 'Другое' },
];
export const reasonOf = (id) => REASONS.find((r) => r.id === id) || null;

/** Быстрые сроки клиента: дней, считая первый */
export const QUICK = [
  { id: 'week', label: 'Неделя', days: 7 },
  { id: 'two', label: '2 недели', days: 14 },
  { id: 'month', label: 'Месяц', days: 30 },
];

export const APPROX = [
  { id: '2m', label: '2 месяца' },
  { id: '3m', label: '3 месяца' },
  { id: 'unknown', label: 'Пока не знаю' },
];

const MSK = 3 * 3600 * 1000;
/** Сегодня по Москве — как на сервере */
export const today = (now = new Date()) => new Date(now.getTime() + MSK).toISOString().slice(0, 10);

export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Дней от a до b включительно */
export const spanDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1;

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const SHORT = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
/** «3 декабря» */
export const dayLong = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
/** «3 дек.» */
export const dayShort = (d) => `${Number(d.slice(8, 10))} ${SHORT[Number(d.slice(5, 7)) - 1]}`;
/** «20 нояб. — 3 дек.» / «с 20 нояб. до разморозки» */
export const spanText = (from, to) => (to ? `${dayShort(from)} — ${dayShort(to)}` : `с ${dayShort(from)} до разморозки`);

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export const daysWord = (n) => n + ' ' + plural(n, 'день', 'дня', 'дней');

/**
 * Сетка календаря: с понедельника недели first, weeks недель. Каждый день —
 * { day, num, off (раньше min или позже max), in (внутри выбора), start, end }.
 */
export function calendar({ first, weeks = 6, min, max = null, from = null, to = null }) {
  const monday = addDays(first, -((new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7));
  const out = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const day = addDays(monday, i);
    out.push({
      day,
      num: Number(day.slice(8, 10)),
      off: day < min || (max && day > max),
      start: !!from && day === from,
      end: !!to && day === to,
      in: !!from && !!to && day > from && day < to,
      month: day.slice(8, 10) === '01' ? SHORT[Number(day.slice(5, 7)) - 1] : '',
    });
  }
  return out;
}

/**
 * Нажатие на день: первое — начало, второе — конец (раньше начала —
 * новое начало). Клиенту конец не дальше 30 дней от начала.
 */
export function pickDay({ from, to }, day, maxDays = null) {
  if (!from || to) return { from: day, to: null };
  if (day < from) return { from: day, to: null };
  if (maxDays && spanDays(from, day) > maxDays) return { from, to: addDays(from, maxDays - 1) };
  return { from, to: day };
}

/** Состояние паузы клиента словами для чипа в списке тренера */
export function listChip(pause) {
  if (!pause) return null;
  if (pause.state === 'requested') return { tone: 'ask', text: '⏳ просит паузу' };
  if (pause.state === 'upcoming') return { tone: 'ice', text: '❄️ с ' + dayShort(pause.from) };
  if (pause.to) return { tone: 'ice', text: '❄️ до ' + dayShort(pause.to) };
  return { tone: 'ice', text: '❄️ ' + pause.dayNo + '-й день' };
}

/** Готовый текст в «Пожелание тренеру» — обсудить долгую паузу */
export const WISH_LONG = 'Хочу паузу дольше месяца. Давайте обсудим условия: ';
