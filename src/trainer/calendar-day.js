import { isLegacyAllDay } from './calendar-look.js';
import { addDays, SNAP } from './calendar-move.js';

const MINUTE = 60000;
const MIN_WINDOW = 60 * MINUTE;

export function dayOverview(events, day, now) {
  const endOfDay = +addDays(day, 1);
  const intervals = events
    .filter((event) => !event.cancelledCharged && !isLegacyAllDay(event))
    .map((event) => ({
      event,
      start: Math.max(+day, Date.parse(event.startsAt)),
      end: Math.min(endOfDay, Date.parse(event.endsAt)),
    }))
    .filter(({ start, end }) => start < end)
    .sort((a, b) => a.start - b.start);

  const lessons = intervals.filter(({ event }) => event.clientRow && !event.personal);
  // Начало уже идущего окна — ближайшая четверть часа, доступная для записи.
  const nextSlot = +now + ((SNAP - now.getMinutes() % SNAP) % SNAP) * MINUTE
    - now.getSeconds() * 1000 - now.getMilliseconds();
  let cursor = Math.max(+day, nextSlot < +now ? nextSlot + SNAP * MINUTE : nextSlot);
  const windows = [];
  const addWindow = (end) => {
    const start = Math.ceil(cursor / MINUTE) * MINUTE;
    if (end - start >= MIN_WINDOW) windows.push({ start, end, minutes: Math.floor((end - start) / MINUTE) });
  };
  for (const interval of intervals) {
    addWindow(interval.start);
    cursor = Math.max(cursor, interval.end);
  }
  addWindow(endOfDay);

  return {
    count: lessons.length,
    minutes: Math.round(lessons.reduce((total, { start, end }) => total + (end - start) / MINUTE, 0)),
    unpaid: lessons.filter(({ event }) => event.unpaid).map(({ event }) => event),
    windows,
  };
}
