/**
 * Вид события в календаре тренера (макет calendar-redesign-2026-11-21,
 * этап 1). Цвет — по типу события, а не по клиенту (владелец, 21.11.2026):
 * тренировка — цветом темы, кардио — тоном кардио, личное — серой
 * пунктирной рамкой. Чистые функции без React — их проверяет
 * scripts/test-calendar-look.mjs.
 */

/** Длинные записи идут в отдельную строку над сеткой по часам. */
export const isAllDay = (event) => Date.parse(event.endsAt) - Date.parse(event.startsAt) >= 20 * 3600000;

/** Старые события «весь день» не занимают время для быстрой записи. */
export const isLegacyAllDay = (event) => isAllDay(event) && !/^(app-|demo-custom-)/.test(event.id);

/** Тип события: 'personal' | 'cardio' | 'training' */
export function eventKind(e) {
  if (!e) return 'training';
  if (e.personal || !e.clientRow) return 'personal';
  if (e.session && e.session.cardio) return 'cardio';
  return 'training';
}

/** Подпись типа для чтения с экрана и подсказок */
export const KIND_LABEL = { training: 'тренировка', cardio: 'кардио', personal: 'личное' };

/** Каждый тип присутствующих событий показываем одной точкой. */
export function dayDots(list) {
  return [...new Set(list.filter((e) => !e.cancelledCharged).map(eventKind))];
}

export function dayTypeLabels(kinds) {
  return kinds.length ? ', типы событий: ' + kinds.map((kind) => KIND_LABEL[kind]).join(', ') : '';
}

/**
 * Что писать на плашке под именем. Занятие программы — главное, время и
 * так видно по сетке; время пишем вторым, если хватает высоты.
 *   height — высота плашки в пикселях
 */
export function eventLines(e, { height = 0 } = {}) {
  const session = e?.session?.short || '';
  if (height < 30) return { session: '', time: false };
  if (!session) return { session: '', time: true };
  return { session, time: height >= 44 };
}

/** Подпись для чтения с экрана: «10:30–11:45 Анна, Ноги B, не оплачено» */
export function eventAria(e, when) {
  const parts = [when + ' ' + (e.clientName || e.title || 'Без названия')];
  if (e.session && e.session.short) parts.push(e.session.short);
  const kind = eventKind(e);
  if (kind !== 'training') parts.push(KIND_LABEL[kind]);
  if (e.done && !e.cancelledCharged) parts.push('проведено');
  if (e.cancelledCharged) parts.push('отменено со списанием');
  if (e.unpaid && !e.cancelledCharged) parts.push('не оплачено');
  return parts.join(', ');
}
