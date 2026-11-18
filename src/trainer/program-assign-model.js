/**
 * «Назначить клиенту» в «Библиотеке» тренера (этап 4 макета
 * templates-programs-2026-11-17, согласован владельцем 17.11.2026): кому —
 * со статусом программы, сверху календарь «что получит клиент», ниже те же
 * блоки, что лист «Программа» у клиента. Чистые функции без React —
 * scripts/test-program-assign.mjs.
 *
 * Что уходит серверу (plan.fromTemplate), не поменялось: assignPlan считает
 * те же поля, что прежняя форма AssignForm (Library.jsx), — недели, даты,
 * ритм, первая неделя, с какой недели; новое только правило пропуска,
 * и то лишь когда тренер его выбрал.
 */
import { programLength, defaultHow, weekLoad, cycleMonthOf } from '../plan-weeks.js';
import { dateKey, addDays, scheduledPlan, sessionQueue } from '../program-timeline.js';

/** Как client/PlanWeeks.jsx firstWeekDefault: есть дни — по дням, нет — по порядку */
const firstWeekDefault = (days) => (days && days.length ? 'days' : 'order');

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAY_LOWER = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const at = (key) => new Date(key + 'T12:00:00');

/** «23 ноя» */
export const shortDate = (key) => (key ? at(key).getDate() + ' ' + MONTH_SHORT[at(key).getMonth()] : '');
/** «вс 22 ноя» */
export const dayDate = (key) => (key ? WEEKDAY_LOWER[at(key).getDay()] + ' ' + shortDate(key) : '');
/** «пн 23» — плитка даты */
export const tileDate = (key) => WEEKDAY_LOWER[at(key).getDay()] + ' ' + at(key).getDate();
const weekday = (key) => ((at(key).getDay() + 6) % 7) + 1;

/**
 * Статус клиента по его программе сейчас (trainer.clients → programNow):
 * self — «Мои тренировки»; free — программы нет; same — эта же программа;
 * end — кончается в ближайшие 7 дней; busy — идёт другая
 */
export function clientStatus(c, templateId, today = dateKey()) {
  if (c.self) return { kind: 'self', line: 'Для себя', tag: '' };
  const p = c.programNow;
  if (!p) return { kind: 'free', line: 'Без программы', tag: 'свободна' };
  if (p.templateId && String(p.templateId) === String(templateId)) {
    return { kind: 'same', line: 'Эта программа' + (p.week ? ` · ${p.week}-я неделя` : ''), tag: 'эта же' };
  }
  const name = p.title ? `«${p.title}»` : 'Своя программа';
  if (p.endsOn && p.endsOn <= addDays(today, 7)) return { kind: 'end', line: `${name} до ${dayDate(p.endsOn)}`, tag: 'скоро конец' };
  return { kind: 'busy', line: `${name} · ${p.endsOn ? 'до ' + shortDate(p.endsOn) : 'без конца'}`, tag: 'занята' };
}

/** Фильтры «Все / Свободны / Скоро конец» со счётчиками; себя — первым, поиск по имени */
export function clientsView(list, { templateId, filter = 'all', q = '', today = dateKey() } = {}) {
  const rows = (list || []).map((c) => ({ ...c, status: clientStatus(c, templateId, today) }));
  const counts = { free: rows.filter((c) => c.status.kind === 'free').length, end: rows.filter((c) => c.status.kind === 'end').length };
  const query = q.trim().toLowerCase();
  const shown = rows
    .filter((c) => filter === 'all' || c.status.kind === filter)
    .filter((c) => !query || c.name.toLowerCase().includes(query))
    .sort((a, b) => Number(!!b.self) - Number(!!a.self));
  return { rows: shown, counts };
}

/**
 * Имя в дательном падеже для кнопки «Назначить Марии»: по первому слову,
 * обычные русские окончания. Пара («Олег + Светлана») и непонятное — как есть
 */
export function dativeName(name) {
  const full = String(name || '').trim();
  if (!full || /[+&]|\sи\s/.test(full)) return full;
  const w = full.split(/\s+/)[0];
  const low = w.toLowerCase();
  if (low === 'любовь') return w.slice(0, -1) + 'и';
  if (/ия$/.test(low)) return w.slice(0, -1) + 'и';
  if (/[ая]$/.test(low)) return w.slice(0, -1) + 'е';
  if (/[йь]$/.test(low)) return w.slice(0, -1) + 'ю';
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(low)) return w + 'у';
  return w;
}

/** Плитки «Когда»: сегодня и ближайший понедельник (сегодня понедельник — одна плитка) */
export function startTiles(today = dateKey()) {
  const mon = addDays(today, 8 - weekday(today));
  return weekday(today) === 1 ? [{ value: today, title: 'сегодня' }] : [{ value: today, title: 'сегодня' }, { value: mon, title: 'с понедельника' }];
}

/** Умолчание старта — как в прежней форме: ближайший понедельник */
export const defaultStart = (today = dateKey()) => addDays(today, 8 - weekday(today));

/** Конец по длительности: 4 / 8 / 12 недель; 0 — без конца */
export const endOf = (startsOn, weeks) => (weeks ? addDays(startsOn, weeks * 7 - 1) : '');

/** Месяц истории — сам по дате начала (неделя — месяцу своего четверга) */
export const monthOfStart = (startsOn) => cycleMonthOf(at(startsOn));

/** «сегодня» / «с 23 ноя» — в кнопке и сводке */
export const startText = (startsOn, today = dateKey()) => (startsOn === today ? 'сегодня' : 'с ' + shortDate(startsOn));

/**
 * Что уйдёт серверу и всё, что форме нужно показать. На входе — шаблон
 * (blocks, weekLength, kind) и выбор тренера:
 *   mode 'replace' | 'append', startsOn, endsOn, days, beat { rhythm,
 *   rhythmDays, one — номер занятия в очереди }, firstPick, startWeek
 *   ('' — продолжить само), how/length (шаблон без недель), rule ('' — не
 *   трогать), month (месяц истории); prev — plan.assign.info.prev
 */
export function assignPlan({ template, clientRow, month, mode = 'replace', startsOn, endsOn = '', days = [], beat = { rhythm: [], rhythmDays: [], one: '' },
  firstPick = '', startWeek = '', how = '', length = 2, rule = '', prev = null }) {
  const blocks = (template && template.blocks) || [];
  const weeks = Math.max(programLength(blocks), Number(template && template.weekLength) || 0);
  const howNow = how || defaultHow(blocks);
  const same = !!(prev && prev.same);
  const continueWeek = same ? prev.continueWeek : 1;
  const chosenStart = startWeek === '' ? continueWeek : Number(startWeek);
  const replacing = mode === 'replace';
  const weekly = replacing && (weeks > 0 || howNow !== 'list');
  const laid = weekly ? (weeks ? blocks : blocks.map((b, i) => ({ ...b, week: howNow === 'cycle' ? 1 : Math.min(length, Math.ceil((i + 1) * length / blocks.length)) }))) : [];
  const size = weeks || (howNow === 'cycle' ? 1 : length);
  const alternate = beat.rhythm.length > 1;
  const weekDays = alternate ? (beat.rhythmDays[0] || []) : days;
  const firstWeek = firstPick === 'days' && !weekDays.length ? firstWeekDefault(weekDays) : firstPick || firstWeekDefault(weekDays);
  const midWeek = weekly && !!startsOn && weekday(startsOn) !== 1;
  // Тренировкам шаблона нет id — для раскладки временные
  const laidIds = laid.map((b, i) => ({ ...b, id: b.id || 'p' + i }));
  const queue = weekly ? sessionQueue(laidIds) : [];
  const oneId = beat.one !== '' && beat.one !== undefined && queue[beat.one] ? queue[beat.one][0].id : '';
  const weekCount = weekly ? sessionQueue(laid.filter((b) => (Number(b.week) || 1) === 1)).length : 0;
  const cfg = weekly ? {
    schedule: 1, startsOn, endsOn, startWeek: chosenStart, length: size, days: alternate ? [] : days, firstWeek,
    ...(beat.rhythm.length ? { rhythm: beat.rhythm, ...(alternate ? { rhythmDays: beat.rhythmDays } : {}), ...(oneId ? { oneSession: oneId } : {}) } : {}),
  } : null;
  const payload = {
    clientRow, month, templateId: template.id, mode,
    ...(weekly ? { effectiveOn: startsOn, weeks: { schedule: 1, startsOn, endsOn, effectiveOn: startsOn, length: size, days: alternate ? [] : days, firstWeek,
      rhythm: beat.rhythm, rhythmDays: alternate ? beat.rhythmDays.slice(0, beat.rhythm.length).map((d) => d || []) : [],
      ...(beat.one !== '' && beat.one !== undefined && oneId ? { oneSessionAt: beat.one } : {}),
      ...(rule ? { rule } : {}) } } : {}),
    ...(replacing && !weeks ? { how: howNow, ...(howNow === 'split' ? { length } : {}) } : {}),
    ...(weekly ? { startWeek: chosenStart } : {}),
  };
  return { weeks, howNow, same, continueWeek, chosenStart, replacing, weekly, laid: laidIds, size, alternate, firstWeek, midWeek, queue, weekCount, cfg, payload };
}

export const CAL_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ'.split('');

/**
 * Календарь «что получит клиент»: 4 недели × 7 дней по той же раскладке,
 * что увидит клиент (scheduledPlan). Занятие — буква и цвет по названию
 * (одинаковые тренировки разных недель — одна буква); «в любой день» —
 * справа; дни до начала — заштрихованы, после конца — пустые.
 * { weeks: [{ start, from, to, week, load, cells: [{ date, before, after, s: [буквы] }], free, need, over }], legend }
 */
export function assignCalendar(plan, { startsOn, endsOn = '', count = 4 } = {}) {
  if (!plan.weekly || !startsOn) return { weeks: [], legend: [] };
  const legend = [];
  const titleOf = (g) => g.map((b) => b.title).join(' + ');
  // Цвет и буква — как у тренировки на экранах клиента (data-tones.js,
  // 18.11.2026): занятие только из кардио — «К» цветом кардио, номера не занимает
  let n = 0;
  const letter = (title, cardio = false) => {
    let item = legend.find((l) => l.title === title);
    if (!item) {
      item = cardio ? { title, letter: 'К', tone: 'cardio' } : { title, letter: CAL_LETTERS[n % CAL_LETTERS.length], tone: n % 6 };
      if (!cardio) n += 1;
      legend.push(item);
    }
    return item;
  };
  const cardioOnly = (g) => g.every((b) => (b.exercises || []).length > 0 && b.exercises.every((e) => e && e.cardio));
  const head = new Map();
  plan.queue.forEach((g) => { head.set(g[0].id, titleOf(g)); letter(titleOf(g), cardioOnly(g)); });
  const timeline = scheduledPlan({ blocks: plan.laid, sessions: [], month: '', cfg: plan.cfg, today: at(startsOn) });
  const weeks = timeline.weeks.slice(0, count).map((w) => {
    const cells = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(w.start, i);
      return { date, before: date < startsOn, after: !!endsOn && date > endsOn, s: [] };
    });
    const free = [];
    w.rows.filter((r) => !r.extra).forEach((r) => {
      const item = letter(head.get(r.block.id) || r.block.title);
      // День до начала («Успеть всю неделю») — занятие остаётся, но уже без дня
      const set = (r.days || []).filter((d) => d && !cells[d - 1].before);
      set.forEach((d) => cells[d - 1].s.push(item));
      for (let k = set.length; k < r.required; k += 1) free.push(item);
    });
    const load = plan.cfg.rhythm ? '' : weekLoad(plan.laid, w.week);
    return { start: w.start, from: w.from, to: w.to, week: w.week, load, cells, free, need: w.need, over: w.need > 6 };
  });
  return { weeks, legend };
}
