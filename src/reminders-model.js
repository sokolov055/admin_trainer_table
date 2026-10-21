/**
 * Напоминания телефона (план трёх разборов, пункт 14, 21.10.2026): что
 * включено и когда сработает. Чистые функции без браузера и Capacitor —
 * ставит уведомления native-reminders.js, экран — client/Settings.jsx.
 *
 * Всё живёт на телефоне: расписание — в localStorage, срабатывания — в
 * системном расписании уведомлений. На сервер не уходит (юр. памятка
 * 2026-10-21), поэтому и PUSH_OFF этих напоминаний не касается.
 *
 * Повторы ставятся не системным «каждую неделю», а ближайшими
 * срабатываниями по одному: «раз в две недели» система не умеет, а так все
 * виды устроены одинаково. Список пересчитывается при каждом открытии
 * приложения; запас — на несколько недель вперёд, всего не больше 43
 * уведомлений (iPhone держит не больше 64 на приложение). Кто не открывал
 * приложение больше двух недель, перестаёт получать «Еду» — и это к лучшему.
 *
 * Время — по часам телефона. Ближайшее занятие сервер отдаёт без пояса
 * («2026-10-22T18:00:00», время зала), и экран «Обзор» читает его так же —
 * как местное время телефона.
 */

const DAY = 86400000;

/** Дни недели по Date.getDay(): 0 — воскресенье */
export const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
export const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/** За сколько минут до занятия напоминать */
export const PLAN_BEFORE_MIN = 120;

/**
 * Номера уведомлений. Конец отдыха — 7001, отсчёт в шторке Android — 7002
 * (native-rest.js, RestTimer.kt); у напоминаний свой ряд 7100–7159
 */
export const REMINDER_IDS = { plan: 7100, weigh: 7110, measure: 7120, food: 7130 };
export const ALL_REMINDER_IDS = Array.from({ length: 60 }, (_, i) => 7100 + i);

/** Сколько срабатываний ставить вперёд */
const AHEAD = { weigh: 8, measure: 6, food: 28 };

export const DEFAULT_REMINDERS = {
  plan: { on: false },
  weigh: { on: false, day: 1, time: '07:30' },
  measure: { on: false, day: 0, time: '10:00', anchor: '' },
  food: { on: false, times: ['13:00', '20:00'] },
};

/** Тексты — на «вы», без медицинских слов */
const TEXTS = {
  weigh: { title: 'Взвешивание', body: 'Взвесьтесь и запишите вес в «Прогрессе».' },
  measure: { title: 'Замеры', body: 'Пора сделать замеры — запишите их в «Прогрессе».' },
  food: { title: 'Дневник питания', body: 'Запишите, что съели.' },
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validTime(value) {
  return TIME.test(String(value || ''));
}

function time(value, fallback) {
  return validTime(value) ? value : fallback;
}

function weekday(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : fallback;
}

/** Любое сохранённое (старое, испорченное, пустое) — в полный вид */
export function normalizeReminders(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_REMINDERS;
  const pick = (k) => (r[k] && typeof r[k] === 'object' ? r[k] : {});
  const plan = pick('plan');
  const weigh = pick('weigh');
  const measure = pick('measure');
  const food = pick('food');
  const times = Array.isArray(food.times) ? food.times : d.food.times;
  return {
    plan: { on: !!plan.on },
    weigh: { on: !!weigh.on, day: weekday(weigh.day, d.weigh.day), time: time(weigh.time, d.weigh.time) },
    measure: {
      on: !!measure.on,
      day: weekday(measure.day, d.measure.day),
      time: time(measure.time, d.measure.time),
      anchor: /^\d{4}-\d{2}-\d{2}$/.test(measure.anchor || '') ? measure.anchor : '',
    },
    food: { on: !!food.on, times: [time(times[0], d.food.times[0]), time(times[1], d.food.times[1])] },
  };
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function atTime(day, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** «7:30», а не «07:30» — как в подписях приложения */
export function shortTime(hhmm) {
  return String(hhmm || '').replace(/^0(\d)/, '$1');
}

/** Ближайший такой день недели, когда время ещё впереди (сегодня — если успеваем) */
export function nextWeekday(day, hhmm, now) {
  const today = startOfDay(now);
  for (let i = 0; i < 8; i += 1) {
    const d = addDays(today, i);
    if (d.getDay() === day && atTime(d, hhmm) > now) return d;
  }
  return addDays(today, 7);
}

/**
 * «Раз в две недели» отсчитывается от первого срабатывания после
 * включения — его и запоминаем (anchor). Без него каждый пересчёт брал бы
 * ближайшее воскресенье, и напоминание шло бы каждую неделю. Сменили день —
 * отсчёт заново. Возвращает тот же объект, если менять нечего
 */
export function withAnchor(settings, now = new Date()) {
  const m = settings.measure;
  if (!m.on) return m.anchor ? { ...settings, measure: { ...m, anchor: '' } } : settings;
  if (m.anchor && fromYmd(m.anchor).getDay() === m.day) return settings;
  return { ...settings, measure: { ...m, anchor: ymd(nextWeekday(m.day, m.time, now)) } };
}

function parseLocal(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Ближайшие срабатывания: [{ id, kind, at: Date, title, body }] по времени.
 * nextTraining — ближайшее занятие из client.overview (nextTrainingDate)
 */
export function nextFires(raw, now = new Date(), { nextTraining = null } = {}) {
  const s = normalizeReminders(raw);
  const out = [];
  const push = (kind, index, at, text) => out.push({ id: REMINDER_IDS[kind] + index, kind, at, title: text.title, body: text.body });

  if (s.plan.on) {
    const start = parseLocal(nextTraining);
    const at = start ? new Date(start.getTime() - PLAN_BEFORE_MIN * 60000) : null;
    // Открыли приложение меньше чем за 2 часа — опоздавшее напоминание не нужно
    if (at && at > now) {
      const hhmm = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
      push('plan', 0, at, { title: 'Скоро тренировка', body: `Начало в ${shortTime(hhmm)} — через 2 часа.` });
    }
  }

  if (s.weigh.on) {
    const first = nextWeekday(s.weigh.day, s.weigh.time, now);
    for (let i = 0; i < AHEAD.weigh; i += 1) push('weigh', i, atTime(addDays(first, i * 7), s.weigh.time), TEXTS.weigh);
  }

  if (s.measure.on) {
    const anchored = withAnchor(s, now).measure;
    let day = fromYmd(anchored.anchor);
    // Отсчёт в прошлом — шагаем по 14 дней до первого будущего
    if (atTime(day, s.measure.time) <= now) {
      const behind = Math.floor((startOfDay(now) - day) / DAY / 14);
      day = addDays(day, Math.max(0, behind) * 14);
      while (atTime(day, s.measure.time) <= now) day = addDays(day, 14);
    }
    for (let i = 0; i < AHEAD.measure; i += 1) push('measure', i, atTime(addDays(day, i * 14), s.measure.time), TEXTS.measure);
  }

  if (s.food.on) {
    const times = [...new Set(s.food.times)].sort();
    const today = startOfDay(now);
    let n = 0;
    for (let i = 0; n < AHEAD.food && i < 31; i += 1) {
      for (const t of times) {
        const at = atTime(addDays(today, i), t);
        if (at > now && n < AHEAD.food) push('food', n++, at, TEXTS.food);
      }
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

/** Подпись под названием напоминания — как в макете «Настроек» */
export function reminderNote(kind, raw) {
  const s = normalizeReminders(raw);
  if (kind === 'plan') return 'За 2 часа до начала';
  if (kind === 'weigh') return WEEKDAYS[s.weigh.day] + ', ' + shortTime(s.weigh.time);
  if (kind === 'measure') return 'Раз в две недели, ' + WEEKDAYS[s.measure.day].toLowerCase() + ', ' + shortTime(s.measure.time);
  if (kind === 'food') {
    const [a, b] = s.food.times;
    return a === b ? 'В ' + shortTime(a) : 'В ' + shortTime(a) + ' и ' + shortTime(b);
  }
  return '';
}
