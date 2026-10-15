/**
 * Онлайн-ведение (FT-530, 15.10.2026).
 *
 * Онлайн-клиент сам строит свой график: занятий с тренером у него нет,
 * оплачен месяц ведения. Поэтому вместо «осталось N тренировок» — по какой
 * день оплачено. Дата — ГГГГ-ММ-ДД, день включительно; считаем по
 * местному календарю устройства, а не по UTC, иначе вечером «сегодня»
 * съезжало бы на завтра.
 */

const pad = (n) => String(n).padStart(2, '0');

export function isoDay(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/**
 * Сколько дней ещё оплачено: 0 — последний день сегодня, меньше нуля —
 * срок прошёл, null — дата не назначена.
 */
export function onlineDaysLeft(until, now = new Date()) {
  const end = parseDay(until);
  if (!end) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86400000);
}

/** «15 ноября», год — только если не текущий; пусто — дата не назначена */
export function onlineDay(until, now = new Date()) {
  const end = parseDay(until);
  if (!end) return '';
  return end.toLocaleDateString('ru-RU', end.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «оплачено по 15 ноября» / «срок истёк 15 ноября» / «срок не указан» */
export function onlineLabel(until, now = new Date()) {
  const left = onlineDaysLeft(until, now);
  if (left === null) return 'срок не указан';
  return (left < 0 ? 'срок истёк ' : 'оплачено по ') + onlineDay(until, now);
}

/**
 * «+ месяц»: продлить на месяц от конца срока, а если он уже прошёл или
 * не назначен — от сегодня. Оплатил 16 октября — по 15 ноября включительно.
 * Конец месяца не перескакивает: с 31 января — по 28 (29) февраля.
 */
export function addOnlineMonth(until, now = new Date()) {
  const left = onlineDaysLeft(until, now);
  const from = left !== null && left >= 0
    ? (() => { const d = parseDay(until); d.setDate(d.getDate() + 1); return d; })()
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = from.getFullYear();
  const m = from.getMonth() + 1;
  const last = new Date(y, m + 1, 0).getDate();
  if (from.getDate() > last) return isoDay(new Date(y, m, last));
  const next = new Date(y, m, from.getDate());
  next.setDate(next.getDate() - 1);
  return isoDay(next);
}
