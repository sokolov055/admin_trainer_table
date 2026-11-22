import { durationOf } from './calendar-move.js';
import { isLegacyAllDay } from './calendar-look.js';

export const MIN_BOOKING_MINUTES = 15;
export const MAX_BOOKING_MINUTES = 14 * 24 * 60;
export const clampDuration = (minutes) => Math.min(MAX_BOOKING_MINUTES, Math.max(MIN_BOOKING_MINUTES, minutes));

export function resizeBooking(edge, from, end, target) {
  if (edge === 'start') {
    const minutes = clampDuration(Math.round((end - target) / 60000));
    return { at: new Date(end - minutes * 60000), manualMinutes: minutes };
  }
  return { at: new Date(from), manualMinutes: clampDuration(Math.round((target - from) / 60000)) };
}

export function bookingTime(date, end) {
  const time = (at) => at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = (at) => at.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  return date.toDateString() === end.toDateString()
    ? time(date) + '–' + time(end)
    : day(date) + ' ' + time(date) + ' — ' + day(end) + ' ' + time(end);
}

export const QUICK_DURATIONS = [45, 60, 75, 90];

export function bookingClients(clients, history, at, search = '') {
  const matches = new Map();
  const minutes = (date) => date.getHours() * 60 + date.getMinutes();
  for (const event of history) {
    const start = new Date(event.startsAt);
    if (event.done && !event.cancelledCharged && event.clientRow && start < at
      && start.getDay() === at.getDay() && Math.abs(minutes(start) - minutes(at)) <= 60) {
      const row = Number(event.clientRow);
      matches.set(row, (matches.get(row) || 0) + 1);
    }
  }
  const score = (client) => matches.get(Number(client.row)) || 0;
  const query = search.trim().toLocaleLowerCase('ru');
  return clients.filter((client) => !client.archived && client.name.toLocaleLowerCase('ru').includes(query))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'ru'))
    .map((client) => ({ ...client, usual: score(client) > 0 }));
}

export function bookingDuration(row, history, lastDurations) {
  if (!row) return 60;
  const previous = history.filter((e) => Number(e.clientRow) === Number(row) && e.done && !e.cancelledCharged)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
  const value = lastDurations?.[row] ?? (previous ? durationOf(previous) : 60);
  return value >= MIN_BOOKING_MINUTES && value <= MAX_BOOKING_MINUTES ? value : 60;
}

export function bookingOverlap(events, from, end) {
  return events.find((e) => !e.cancelledCharged && !isLegacyAllDay(e) && Date.parse(e.startsAt) < end && Date.parse(e.endsAt) > from);
}
