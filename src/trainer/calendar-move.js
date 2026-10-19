/**
 * Расчёты расписания без React: какие дни на экране, на сколько листать,
 * куда встаёт перенесённое событие и как копить загруженные занятия.
 * Покрыто scripts/test-calendar-move.mjs.
 */
const DAY = 86400000;
/** Шаг сетки при переносе и при нажатии на пустое место, мин — как в Google */
export const SNAP = 15;

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const pad = (n) => String(n).padStart(2, '0');
export const dateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Сколько дней в виде с сеткой по часам */
export const DAYS_OF = { day: 1, '3day': 3, week: 7 };

/** Первый день и число дней на экране для вида и опорной даты */
export function rangeOf(view, anchor) {
  if (view === 'week') return { start: mondayOf(anchor), days: 7 };
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { start: mondayOf(first), days: 42 };
  }
  if (view === 'list') return { start: startOfDay(anchor), days: 28 };
  return { start: startOfDay(anchor), days: DAYS_OF[view] || 1 };
}

/**
 * Шаг «вперёд/назад» — ровно на экран: день, три дня, неделя, месяц.
 * Раньше «3 дня» доезжали до ближайшего дня под пальцем и сдвигались то на
 * один, то на два дня — расписание «перескакивало» (19.10.2026).
 */
export function shifted(view, anchor, dir) {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  const step = view === 'week' ? 7 : view === '3day' ? 3 : view === 'list' ? 7 : 1;
  return addDays(anchor, dir * step);
}

/** Больше этого сервер за один запрос не отдаёт (MAX_RANGE_DAYS = 62) */
export const MAX_FETCH_DAYS = 62;

/**
 * Что загрузить — списком промежутков, каждый не длиннее предела сервера:
 * сам экран и по экрану с каждой стороны — соседи видны, пока сетку тянут
 * пальцем, и после листания приходят уже с занятиями. Месяц — три сетки по
 * шесть недель отдельными запросами, список — кусками по четыре недели.
 */
export function fetchRanges(view, anchor, listDays = 28) {
  if (view === 'month') {
    return [-1, 0, 1].map((i) => {
      const from = mondayOf(new Date(anchor.getFullYear(), anchor.getMonth() + i, 1));
      return { from, to: addDays(from, 42) };
    });
  }
  const { start, days } = rangeOf(view, anchor);
  if (view === 'list') {
    const out = [];
    for (let i = 0; i < listDays; i += 28) out.push({ from: addDays(start, i), to: addDays(start, Math.min(listDays, i + 28)) });
    return out;
  }
  return [{ from: addDays(start, -days), to: addDays(start, days * 2) }];
}

/**
 * Загруженные занятия копятся: вернулись на прошлую неделю — она уже на
 * месте, а не пустая до ответа сервера. Ответ за промежуток заменяет в
 * копилке всё, что начиналось в этом промежутке (удалённое пропадает).
 */
export function mergeRange(cache, from, to, events) {
  const lo = new Date(from).getTime();
  const hi = new Date(to).getTime();
  const next = new Map();
  cache.forEach((e, id) => {
    const s = new Date(e.startsAt).getTime();
    if (s < lo || s >= hi) next.set(id, e);
  });
  (events || []).forEach((e) => next.set(e.id, e));
  return next;
}

/** Минуты, привязанные к шагу сетки */
export const snap = (minutes, step = SNAP) => Math.round(minutes / step) * step;

/**
 * Куда встаёт событие под пальцем в часовой сетке: y — от верха колонки
 * дня, grab — сколько минут от начала события до места, за которое взяли.
 * Привязка к 15 минутам, событие не выходит за сутки.
 */
export function dropMinutes(y, hourHeight, grab, duration) {
  const raw = (y / Math.max(1, hourHeight)) * 60 - grab;
  return Math.max(0, Math.min(24 * 60 - Math.max(SNAP, duration), snap(raw)));
}

/** Новое начало после перетаскивания в часовой сетке: дни и четверти часа */
export function gridDropStart(startsAt, dx, dy, columnWidth, hourHeight) {
  const start = new Date(startsAt).getTime();
  const days = Math.round(dx / Math.max(1, columnWidth));
  const minutes = snap((dy / Math.max(1, hourHeight)) * 60);
  return new Date(start + days * DAY + minutes * 60000);
}

/** Тот же час и минута в другой день — перенос в сетке месяца */
export function sameTimeOn(startsAt, day) {
  const s = new Date(startsAt);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes());
}

/** Новое начало после перетаскивания между ячейками месяца */
export function monthDropStart(startsAt, dx, dy, cellWidth, cellHeight) {
  const days = Math.round(dx / Math.max(1, cellWidth)) + Math.round(dy / Math.max(1, cellHeight)) * 7;
  return new Date(new Date(startsAt).getTime() + days * DAY);
}

/** Длительность события, мин (не меньше 15, как требует сервер) */
export const durationOf = (event) => Math.max(SNAP, Math.round((new Date(event.endsAt) - new Date(event.startsAt)) / 60000));

/**
 * Запрос переноса. У занятия с клиентом сервер требует ответа, что это:
 * перенос по просьбе клиента (client), по инициативе тренера (trainer)
 * или исправление ошибки записи (fix). Раньше перетаскивание всегда
 * писало «тренер» — и портило статистику переносов (19.10.2026).
 */
export function moveRequest(event, nextStart, change) {
  const personal = event.personal === true;
  return {
    id: event.id,
    personal,
    ...(personal ? { title: event.title } : { clientRow: Number(event.clientRow), change: change || 'fix' }),
    startsAt: nextStart.toISOString(),
    minutes: durationOf(event),
  };
}

/** Можно ли взять событие и перенести: списанное и неузнанное — нельзя */
export const movable = (event) => !event.cancelledCharged && (event.personal === true || !!event.clientRow);
