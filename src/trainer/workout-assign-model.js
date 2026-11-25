/**
 * «Назначить клиенту» тренировку из библиотеки (этап 4 «Тренировок», макет
 * trainirovki-library-v2-2026-11-25.html). Чистые функции без React —
 * scripts/test-workout-assign.mjs.
 */
import { addDays } from '../program-timeline.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Семь дней недели сегодняшнего дня (пн–вс) для выбора: номер дня как на
 * сервере (1 — пн), число, подпись и прошёл ли день. Прошедшие дни нельзя
 */
export function weekDays(today) {
  const offset = (new Date(today + 'T12:00:00').getDay() + 6) % 7;
  const start = addDays(today, -offset);
  return WEEKDAYS.map((label, i) => {
    const key = addDays(start, i);
    return { day: i + 1, key, label, date: Number(key.slice(8)), past: key < today };
  });
}
