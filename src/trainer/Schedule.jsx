import { useReturnScroll } from '../scroll.js';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { reloadWidgets } from '../native-widget.js';
import { haptic } from '../telegram.js';
import { Section, Panel, Loading, ErrorState, Note, Field, Options, Chips } from '../ui.jsx';
import { IconAlert, IconBack, IconCopy, IconPlus } from '../icons.jsx';
import { gridDropStart, monthDropStart, moveRequest } from './calendar-move.js';

/**
 * Расписание тренера — занятия из его Google Календаря.
 *
 * Календарь остаётся местом, где живут события: заведённое с телефона в
 * Google появляется здесь, заведённое здесь — там, с инициалами и номером
 * клиента в названии. Поэтому ничего не расходится, и деньги видят те же
 * занятия.
 *
 * Вид — как в Google Календаре (решение владельца 30.09.2026): сетка по
 * часам на 1 день, 3 дня или неделю и сетка месяца. Нажатие на пустое место
 * сетки — новое занятие на это время, на событие — правка, на день в
 * месяце или шапке — этот день крупно. Выбранный вид помнится на телефоне.
 */

const DAY = 86400000;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_TITLE = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DURATIONS = [45, 60, 75, 90, 120];

/** Высота часа в сетке, px. Час в 48 px — занятие на 60 мин читается в две строки */
const HOUR = 48;
/** Щипком (01.10.2026, как в Google Календаре): от «почти сутки на экране»
 *  до крупных занятий. Выбранная высота запоминается на устройстве */
const HOUR_MIN = 22;
const HOUR_MAX = 140;
const HOUR_KEY = 'schedule_hour_v1';
const savedHour = () => {
  try {
    const v = Number(localStorage.getItem(HOUR_KEY));
    return v >= HOUR_MIN && v <= HOUR_MAX ? v : HOUR;
  } catch (_) { return HOUR; }
};
/** С какого часа открывается сетка: ночь есть, но её пролистывают */
const FIRST_HOUR = 7;

const VIEWS = [
  { value: 'day', label: 'День', days: 1 },
  { value: '3day', label: '3 дня', days: 3 },
  { value: 'week', label: 'Неделя', days: 7 },
  { value: 'month', label: 'Месяц' },
];
const VIEW_KEY = 'schedule_view_v1';

/** Отмена позже этого срока до начала — поздняя (как на сервере) */
const LATE_HOURS = 24;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const hm = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const dateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const weekdayOf = (d) => WEEKDAYS[(d.getDay() + 6) % 7];

function readView() {
  try { const v = localStorage.getItem(VIEW_KEY); return VIEWS.some((x) => x.value === v) ? v : '3day'; } catch (_) { return '3day'; }
}

/** Первый день и число дней на экране для вида и опорной даты */
function rangeOf(view, anchor) {
  if (view === 'week') return { start: mondayOf(anchor), days: 7 };
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { start: mondayOf(first), days: 42 };
  }
  return { start: startOfDay(anchor), days: view === '3day' ? 3 : 1 };
}

/** Шаг «вперёд/назад»: на весь экран; у месяца — на месяц */
function shifted(view, anchor, dir) {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  const step = view === 'week' ? 7 : view === '3day' ? 3 : 1;
  return addDays(anchor, dir * step);
}

/** «Сентябрь 2026» или «Сентябрь – октябрь 2026» для сетки на стыке месяцев */
function titleOf(view, anchor, start, days) {
  if (view === 'month') return MONTHS_TITLE[anchor.getMonth()] + ' ' + anchor.getFullYear();
  const end = addDays(start, days - 1);
  if (start.getMonth() === end.getMonth()) return MONTHS_TITLE[start.getMonth()] + ' ' + start.getFullYear();
  // На стыке месяцев — коротко, чтобы заголовок не переносился
  return MONTHS_TITLE[start.getMonth()].slice(0, 3) + ' - ' + MONTHS_TITLE[end.getMonth()].slice(0, 3).toLowerCase() + ' ' + end.getFullYear();
}

export default function Schedule() {
  const [view, setViewState] = useState(readView);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState(null); // null | {} — новое | событие
  const [preset, setPreset] = useState(null); // время нового занятия из сетки
  const [movedEvents, setMovedEvents] = useState({});
  const [moveFailure, setMoveFailure] = useState(null);
  useReturnScroll(!!editing);

  const setView = (v) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch (_) { /* не запомнили — не беда */ }
    haptic();
  };

  const { start, days } = rangeOf(view, anchor);
  // Сетке по часам — с соседними днями по обе стороны: они видны, пока
  // сетку тянут пальцем, и после пролистывания уже с занятиями
  const around = view === 'month' ? 0 : days;
  const params = useMemo(() => ({
    from: addDays(start, -around).toISOString(),
    to: addDays(start, days + around).toISOString(),
  }), [start.getTime(), days, around]);
  const { loading, data, error, reload } = useData('trainer.schedule', params, [params.from, params.to]);
  // Виджеты iPhone «Занятия сегодня»: расписание перечитали (в том числе
  // после правки) — пусть и они перечитают сейчас, а не через полчаса
  useEffect(() => { if (data) reloadWidgets(); }, [data]);
  useEffect(() => { if (data && data.events) setMovedEvents({}); }, [data]);
  // Пока грузится новый период, показываем уже известное — а не пустую
  // сетку: после пролистывания большинство занятий уже загружено
  const known = useRef([]);
  if (data && data.events) known.current = data.events;
  const clients = useData('trainer.clients', {}, []);

  if (editing) {
    return (
      <EventForm
        key={editing.id || editing.copyKey || 'new'}
        event={editing}
        preset={preset}
        onCopy={(e) => {
          // Копия — на те же дату и время (решение владельца): тренер правит
          // их перед сохранением
          const s0 = new Date(e.startsAt);
          setPreset({ date: startOfDay(s0), minutes: s0.getHours() * 60 + s0.getMinutes() });
          setEditing({ copyKey: 'copy-' + e.id + '-' + Date.now(), clientRow: e.clientRow || '',
            personal: !!e.personal, title: e.personal ? e.title : '',
            duration: Math.round((new Date(e.endsAt) - s0) / 60000), copyOf: e.clientName || e.title || '' });
          haptic();
        }}
        clients={(clients.data && clients.data.clients) || []}
        serviceEmail={data && data.serviceEmail}
        onDone={() => { setEditing(null); setPreset(null); reload(); }}
        onCancel={() => { setEditing(null); setPreset(null); }}
      />
    );
  }

  const events = ((data && data.events) || known.current).map((e) => movedEvents[e.id]
    ? { ...e, startsAt: movedEvents[e.id].startsAt, endsAt: movedEvents[e.id].endsAt }
    : e);
  const create = (when) => { setPreset(when || { date: startOfDay(anchor), minutes: 10 * 60 }); setEditing({}); haptic(); };
  const openDay = (d) => { setAnchor(startOfDay(d)); setView('day'); };
  const moveEvent = async (event, nextStart) => {
    if (event.cancelledCharged) return;
    const request = moveRequest(event, nextStart);
    const duration = request.minutes;
    const nextEnd = new Date(nextStart.getTime() + duration * 60000);
    setMoveFailure(null);
    setMovedEvents((old) => ({ ...old, [event.id]: { startsAt: nextStart.toISOString(), endsAt: nextEnd.toISOString() } }));
    try {
      await apiMutate('trainer.schedule.save', request);
      haptic('success');
      reload();
    } catch (err) {
      setMovedEvents((old) => { const next = { ...old }; delete next[event.id]; return next; });
      setMoveFailure(err);
    }
  };

  return (
    <>
      <div className="cal-bar">
        <strong className="cal-bar__title">{titleOf(view, anchor, start, days)}</strong>
        <div className="cal-bar__nav">
          <button className="button button--ghost cal-bar__today" onClick={() => { setAnchor(startOfDay(new Date())); haptic(); }}>Сегодня</button>
          <button className="icon-button" aria-label="Назад" onClick={() => { setAnchor(shifted(view, anchor, -1)); haptic(); }}><IconBack size={18} /></button>
          <button className="icon-button cal-bar__next" aria-label="Вперёд" onClick={() => { setAnchor(shifted(view, anchor, 1)); haptic(); }}><IconBack size={18} /></button>
        </div>
      </div>

      <div className="cal-views">
        <Chips variant="nav" items={VIEWS.map((v) => ({ value: v.value, label: v.label }))} value={view} onChange={setView} />
      </div>

      {/* Новое событие — плавающей кнопкой, как в Google: сетка занимает
          экран, а кнопка всегда под пальцем над нижним меню */}
      <button className="cal-fab" aria-label="Добавить событие" onClick={() => create()}><IconPlus size={24} /></button>

      {error && <ErrorState error={error} onRetry={reload} />}
      {moveFailure && <Note tone="critical" icon={IconAlert}>Не удалось перенести событие: {moveFailure.message || 'повторите ещё раз'}</Note>}

      {/* Google Календарь — только у владельца сервиса; у других тренеров
          расписание живёт в приложении, и предупреждать не о чем */}
      {!loading && !error && data && !data.calendar && data.owner !== false && (
        <Note tone="critical" icon={IconAlert}>Календарь не подключён на сервере.</Note>
      )}

      {!error && (loading && !data && !known.current.length ? <Loading lead={false} rows={4} /> : view === 'month' ? (
        <SwipePager onShift={(dir) => { setAnchor(shifted(view, anchor, dir)); haptic(); }}>
          <MonthGrid start={start} anchor={anchor} events={events} onDay={openDay} onEvent={setEditing} onMove={moveEvent} />
        </SwipePager>
      ) : (
        <TimeGrid start={start} days={days} events={events} onDay={openDay} onEvent={setEditing} onSlot={create} onMove={moveEvent}
          onShift={(n) => { setAnchor(addDays(anchor, n)); haptic(); }} />
      ))}

      {data && data.feedUrl && (
        <PhoneCalendar url={data.feedUrl} text="Все занятия и личные события — в календаре телефона: подпишитесь один раз, дальше он обновляется сам." />
      )}
    </>
  );
}

/**
 * Пролистывание вбок, как в Google Календаре: сетка едет за пальцем, и
 * если протянули дальше порога — уезжает целиком, а на её место приходит
 * соседний период (onShift). Вертикальную прокрутку сетки не трогаем:
 * направление решается по первым 10 px движения. От левого края экрана
 * жест не берём — там «назад» приложения.
 */
const SWIPE_EDGE = 24;
const SWIPE_LOCK = 10;

function SwipePager({ onShift, children }) {
  const box = useRef(null);
  const g = useRef(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const move = (x, animate) => {
    const el = box.current;
    if (!el) return;
    el.style.transition = animate && !reduce ? 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none';
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    g.current = t.clientX < SWIPE_EDGE || e.touches.length > 1 ? null : { x: t.clientX, y: t.clientY, mode: null, dx: 0 };
  };
  const onTouchMove = (e) => {
    const s = g.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.mode) {
      if (Math.abs(dx) < SWIPE_LOCK && Math.abs(dy) < SWIPE_LOCK) return;
      s.mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (s.mode !== 'x') return;
    s.dx = dx;
    move(dx, false);
  };
  const onTouchEnd = () => {
    const s = g.current;
    g.current = null;
    if (!s || s.mode !== 'x') return;
    const width = (box.current && box.current.offsetWidth) || 360;
    if (Math.abs(s.dx) > width * 0.22) {
      const dir = s.dx < 0 ? 1 : -1;
      // Уезжает целиком, соседний период въезжает с другой стороны
      move(-dir * width, true);
      setTimeout(() => {
        onShift(dir);
        move(dir * width * 0.35, false);
        requestAnimationFrame(() => move(0, true));
      }, reduce ? 0 : 180);
    } else {
      move(0, true);
    }
  };

  return (
    // data-no-swipe: жесты приложения (листание вкладок, «назад») над сеткой
    // не работают — иначе вбок листалась страница, а не календарь (gestures.jsx)
    <div className="cal-swipe" data-no-swipe="" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div ref={box} className="cal-swipe__page">{children}</div>
    </div>
  );
}

/** Название события в сетке: клиент, иначе название из календаря */
const labelOf = (e) => e.clientName || e.title || 'Без названия';
/** В узких колонках недели и месяца — только имя, как в Google на телефоне */
const shortLabelOf = (e) => labelOf(e).split(/\s+/)[0];

function eventClass(e) {
  return 'cal-event'
    + (e.cancelledCharged ? ' cal-event--cancelled' : '')
    + (e.personal ? ' cal-event--personal' : '')
    + (e.done && !e.cancelledCharged ? ' cal-event--done' : '');
}

// iPhone позволяет отменить прокрутку только слушателю touchmove, который уже
// существовал в момент начала касания. Поэтому он зарегистрирован заранее, а
// блокировка включается лишь после удержания события.
let calendarTouchDragging = false;
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('touchmove', (event) => {
    if (calendarTouchDragging) event.preventDefault();
  }, { passive: false });
}

/**
 * Событие можно перенести указателем без промежуточной формы. Координаты
 * меняются прямо у DOM-элемента, чтобы движение не перерисовывало всю сетку.
 * Короткое касание остаётся обычным открытием карточки.
 */
function CalendarEventButton({ event, className, style, onOpen, onMove, resolveDrop, children, ariaLabel }) {
  const button = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const disabled = !!event.cancelledCharged || (!event.personal && !event.clientRow);

  useEffect(() => () => {
    const current = drag.current;
    if (!current) return;
    clearTimeout(current.timer);
    if (current.ready && current.touch) calendarTouchDragging = false;
  }, []);

  const reset = () => {
    const el = button.current;
    if (!el) return;
    el.classList.remove('is-dragging');
    el.style.removeProperty('transform');
    el.style.removeProperty('transition');
  };

  const down = (e) => {
    if (disabled || (e.button !== undefined && e.button !== 0)) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const state = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, active: false, ready: !touch, touch, timer: null };
    if (touch) state.timer = setTimeout(() => {
      if (drag.current === state) {
        state.ready = true;
        calendarTouchDragging = true;
      }
    }, 260);
    drag.current = state;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* старый WebView */ }
  };
  const move = (e) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    g.dx = e.clientX - g.x;
    g.dy = e.clientY - g.y;
    if (!g.ready) {
      // На телефоне перенос начинается после короткого удержания: обычное
      // касание и начатая прокрутка не должны случайно сдвигать событие.
      if (Math.hypot(g.dx, g.dy) >= 7) {
        clearTimeout(g.timer);
        drag.current = null;
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 0);
      }
      return;
    }
    if (!g.active && Math.hypot(g.dx, g.dy) < 7) return;
    g.active = true;
    suppressClick.current = true;
    const el = button.current;
    if (!el) return;
    el.classList.add('is-dragging');
    el.style.transition = 'none';
    el.style.transform = `translate3d(${g.dx}px, ${g.dy}px, 0)`;
  };
  const finish = (e) => {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    clearTimeout(g.timer);
    drag.current = null;
    if (g.ready && g.touch) calendarTouchDragging = false;
    reset();
    if (!g.active || e.type === 'pointercancel') {
      if (e.type === 'pointercancel') suppressClick.current = false;
      return;
    }
    const next = resolveDrop(g.dx, g.dy);
    if (next && next.getTime() !== new Date(event.startsAt).getTime()) onMove(event, next);
    setTimeout(() => { suppressClick.current = false; }, 0);
  };
  const touchMove = (e) => {
    const g = drag.current;
    // До срабатывания удержания браузер и сетка получают обычный жест
    // прокрутки. После — движение принадлежит переносу события.
    if (!g || !g.ready) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <button ref={button} className={className} style={style} aria-label={ariaLabel}
      onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      onTouchMove={touchMove}
      onTouchEnd={(e) => { if (drag.current?.ready) e.stopPropagation(); }}
      onTouchCancel={(e) => { if (drag.current?.ready) e.stopPropagation(); }}
      onClick={(e) => {
        e.stopPropagation();
        if (suppressClick.current) { suppressClick.current = false; return; }
        onOpen(event);
      }}>
      {children}
    </button>
  );
}

/**
 * Раскладка пересекающихся занятий бок о бок, как в Google: жадно по
 * колонкам внутри группы пересечений; ширина — доля от числа колонок группы.
 */
function layoutDay(list) {
  const items = list
    .map((e) => ({ e, s: new Date(e.startsAt).getTime(), f: new Date(e.endsAt).getTime() }))
    .sort((a, b) => a.s - b.s || b.f - a.f);
  const out = [];
  let group = [];
  let groupEnd = 0;
  const flush = () => {
    const cols = [];
    group.forEach((it) => {
      let c = cols.findIndex((end) => end <= it.s);
      if (c === -1) { c = cols.length; cols.push(0); }
      cols[c] = it.f;
      it.col = c;
    });
    group.forEach((it) => { it.cols = cols.length; out.push(it); });
    group = [];
  };
  items.forEach((it) => {
    if (group.length && it.s >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.f);
  });
  if (group.length) flush();
  return out;
}

/** Событие на весь день (день рождения, отпуск): в Google у него дата без
 *  времени, к нам оно приходит сутками и больше. В сетку по часам его не
 *  ставим — оно легло бы блоком через весь день — а показываем строкой под
 *  датами, как Google */
const isAllDay = (e) => new Date(e.endsAt) - new Date(e.startsAt) >= 20 * 3600000;

/** Быстрый взмах листает, даже если протянули мало (порог направления —
 *  SWIPE_LOCK выше, общий с пролистыванием месяца) */
const FLICK = 0.35; // px/мс — быстрый взмах листает, даже если протянули мало

/**
 * Сетка по часам на 1, 3 или 7 дней — как в Google Календаре.
 *
 * Колонки дней лежат лентой: по обе стороны от видимых — ещё столько же
 * дней, уже с занятиями. Смахивание двигает только ленту (шапку дней,
 * строку «весь день» и колонки), колонка часов стоит на месте. Отпустили —
 * лента доезжает до ближайшего дня (у недели — до соседней недели), и
 * тогда меняется опорная дата: onShift(на сколько дней). Вертикальная
 * прокрутка решается по первым 10 px движения и сетку вбок не трогает.
 */
function TimeGrid({ start, days, events, onDay, onEvent, onSlot, onShift, onMove }) {
  const scroller = useRef(null);
  const viewport = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const [drag, setDrag] = useState({ x: 0, animate: false });
  const gesture = useRef(null);
  const settling = useRef(null);
  // Высота часа — щипком. pinch: расстояние между пальцами и время под ними
  // в начале жеста; после перерисовки сетки это время остаётся под пальцами
  const [hour, setHour] = useState(savedHour);
  const pinch = useRef(null);
  const keepScroll = useRef(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settleMs = reduce ? 0 : 220;

  // Лента: N дней до, N видимых, N после
  const strip = Array.from({ length: days * 3 }, (_, i) => addDays(start, i - days));
  const visibleDays = strip.slice(days, days * 2);
  const timed = events.filter((e) => !isAllDay(e));
  const allDay = events.filter(isAllDay);
  // Дата без времени приходит полуночью по UTC: день события — его UTC-дата
  // (у нескольких дней — по день перед концом), а не местные 03:00
  const utcKey = (t) => new Date(t).toISOString().slice(0, 10);
  const allDayOf = (d) => {
    const k = dateValue(d);
    return allDay.filter((e) => utcKey(e.startsAt) <= k && utcKey(new Date(e.endsAt).getTime() - 1) >= k);
  };
  // Строка «весь день» — когда такие события есть в видимых днях; пустой
  // полосы ради соседей за краем не держим
  const hasAllDay = visibleDays.some((d) => allDayOf(d).length);

  // Открываем с самого раннего занятия на экране (на полчаса раньше), без
  // занятий — с утра. С текущего часа вечером утреннее занятие завтрашнего
  // дня уходило за верх сетки, и тренер решал, что его нет (30.09.2026)
  const earliest = timed
    .filter((e) => visibleDays.some((d) => sameDay(new Date(e.startsAt), d)))
    .reduce((m, e) => { const s = new Date(e.startsAt); return Math.min(m, s.getHours() * 60 + s.getMinutes()); }, FIRST_HOUR * 60);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, (earliest - 30) / 60 * hour);
  }, [start.getTime(), days]);

  // Щипок поменял высоту часа — прокрутка так, чтобы время между пальцами
  // осталось на том же месте экрана
  useLayoutEffect(() => {
    const el = scroller.current;
    const k = keepScroll.current;
    if (!el || !k) return;
    keepScroll.current = null;
    el.scrollTop = Math.max(0, (k.minute / 60) * hour - k.y);
  }, [hour]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => clearTimeout(settling.current), []);

  const width = () => (viewport.current && viewport.current.offsetWidth) || 320;

  const pinchGap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const pinchMid = (t) => (t[0].clientY + t[1].clientY) / 2;

  const onTouchStart = (e) => {
    // Два пальца — щипок: высота часа, а не листание дней
    if (e.touches.length === 2 && scroller.current) {
      gesture.current = null;
      setDrag({ x: 0, animate: true });
      const rect = scroller.current.getBoundingClientRect();
      const y = pinchMid(e.touches) - rect.top;
      pinch.current = {
        gap: Math.max(20, pinchGap(e.touches)),
        hour,
        y,
        minute: ((scroller.current.scrollTop + y) / hour) * 60,
      };
      return;
    }
    if (e.touches.length > 1 || settling.current) { gesture.current = null; return; }
    const t = e.touches[0];
    gesture.current = { x: t.clientX, y: t.clientY, t: performance.now(), mode: null, dx: 0, v: 0 };
  };
  const onTouchMove = (e) => {
    const pz = pinch.current;
    if (pz) {
      if (e.touches.length < 2) return;
      const next = Math.round(Math.max(HOUR_MIN, Math.min(HOUR_MAX, pz.hour * (pinchGap(e.touches) / pz.gap))));
      if (next !== hour) {
        keepScroll.current = { minute: pz.minute, y: pz.y };
        setHour(next);
      }
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (!g.mode) {
      if (Math.abs(dx) < SWIPE_LOCK && Math.abs(dy) < SWIPE_LOCK) return;
      g.mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (g.mode !== 'x') return;
    const nowT = performance.now();
    g.v = (dx - g.dx) / Math.max(1, nowT - g.t);
    g.t = nowT;
    g.dx = dx;
    setDrag({ x: dx, animate: false });
  };
  const onTouchEnd = (e) => {
    if (pinch.current) {
      // Подняли оба пальца — масштаб запомнить; один ещё на экране — ждём
      if (e && e.touches && e.touches.length) return;
      pinch.current = null;
      try { localStorage.setItem(HOUR_KEY, String(hour)); } catch (_) {}
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.mode !== 'x') return;
    const col = width() / days;
    // Сколько дней проехали: до ближайшего дня; быстрый взмах — хотя бы на
    // один. Неделя листается неделями
    let shift = Math.round(-g.dx / col);
    if (!shift && Math.abs(g.v) > FLICK) shift = g.v < 0 ? 1 : -1;
    if (days === 7 && shift) shift = shift > 0 ? 7 : -7;
    shift = Math.max(-days, Math.min(days, shift));
    setDrag({ x: -shift * col, animate: true });
    settling.current = setTimeout(() => {
      settling.current = null;
      if (shift) onShift(shift);
      setDrag({ x: 0, animate: false });
    }, settleMs);
  };

  const slot = (d, ev) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const minutes = Math.floor(((ev.clientY - rect.top) / hour) * 2) * 30;
    onSlot({ date: d, minutes: Math.max(0, Math.min(minutes, 23 * 60 + 30)) });
  };

  // Лента втрое шире окна; в покое видна средняя треть
  const track = {
    width: '300%',
    transform: `translate3d(calc(-100% / 3 + ${drag.x}px), 0, 0)`,
    transition: drag.animate && !reduce ? 'transform 220ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
    gridTemplateColumns: `repeat(${days * 3}, minmax(0, 1fr))`,
  };

  return (
    // data-no-swipe: жесты приложения (листание вкладок, «назад») над сеткой
    // не работают — иначе вбок листалась страница, а не календарь (gestures.jsx)
    <div className={'cal-grid cal-grid--' + days} data-no-swipe=""
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="cal-grid__row cal-grid__head">
        <span className="cal-grid__gutter" />
        <div className="cal-grid__viewport" ref={viewport}>
          <div className="cal-grid__track" style={track}>
            {strip.map((d) => {
              const today = sameDay(d, now);
              return (
                <button key={d.getTime()} className={'cal-grid__day' + (today ? ' cal-grid__day--today' : '')} onClick={() => onDay(d)}>
                  <span>{weekdayOf(d)}</span>
                  <strong>{d.getDate()}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {hasAllDay && (
        <div className="cal-grid__row cal-grid__allday">
          <span className="cal-grid__gutter" />
          <div className="cal-grid__viewport">
            <div className="cal-grid__track" style={track}>
              {strip.map((d) => (
                <div key={d.getTime()} className="cal-grid__allcell">
                  {allDayOf(d).map((e) => (
                    <CalendarEventButton key={e.id} event={e} className={eventClass(e) + ' cal-event--chip'} onOpen={onEvent} onMove={onMove}
                      resolveDrop={(dx) => new Date(new Date(e.startsAt).getTime() + Math.round(dx / (width() / days)) * DAY)}>
                      {labelOf(e)}
                    </CalendarEventButton>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="cal-grid__scroll" ref={scroller}>
        <div className="cal-grid__row" style={{ height: 24 * hour, '--hour': hour + 'px' }}>
          <div className="cal-grid__gutter cal-grid__hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * hour }}>{h ? pad(h) + ':00' : ''}</span>
            ))}
          </div>
          <div className="cal-grid__viewport">
            <div className="cal-grid__track cal-grid__body" style={{ ...track, height: 24 * hour }}>
              {strip.map((d) => {
                const ofDay = timed.filter((e) => sameDay(new Date(e.startsAt), d));
                const today = sameDay(d, now);
                return (
                  // Пустое место дня — «новое занятие на это время»
                  <div key={d.getTime()} className="cal-grid__col" onClick={(ev) => slot(d, ev)} role="presentation">
                    {layoutDay(ofDay).map(({ e, s, f, col, cols }) => {
                      const from = new Date(s);
                      const top = (from.getHours() * 60 + from.getMinutes()) / 60 * hour;
                      const height = Math.max(((f - s) / 3600000) * hour - 2, 14);
                      return (
                        <CalendarEventButton
                          key={e.id}
                          event={e}
                          className={eventClass(e)}
                          style={{ top, height, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)` }}
                          onOpen={onEvent}
                          onMove={onMove}
                          resolveDrop={(dx, dy) => gridDropStart(s, dx, dy, width() / days, hour)}
                        >
                          <span className="cal-event__name">{days === 7 ? shortLabelOf(e) : labelOf(e)}</span>
                          {days < 7 && height >= 34 && <span className="cal-event__time">{hm(e.startsAt)}–{hm(e.endsAt)}</span>}
                        </CalendarEventButton>
                      );
                    })}
                    {today && (
                      <span className="cal-grid__now" style={{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * hour }} aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Сетка месяца: 6 недель, в дне — до трёх занятий, остальное «ещё N» */
function MonthGrid({ start, anchor, events, onDay, onEvent, onMove }) {
  const now = new Date();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="cal-month">
      <div className="cal-month__head">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="cal-month__grid">
        {cells.map((d) => {
          const ofDay = events.filter((e) => sameDay(new Date(e.startsAt), d))
            .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
          const other = d.getMonth() !== anchor.getMonth();
          return (
            <div
              key={d.getTime()}
              className={'cal-month__cell' + (other ? ' cal-month__cell--other' : '') + (sameDay(d, now) ? ' cal-month__cell--today' : '')}
              onClick={() => onDay(d)}
              role="button"
              tabIndex={0}
              aria-label={d.getDate() + ' ' + MONTHS[d.getMonth()] + (ofDay.length ? ', занятий: ' + ofDay.length : '')}
              onKeyDown={(ev) => { if (ev.key === 'Enter') onDay(d); }}
            >
              <span className="cal-month__date">{d.getDate()}</span>
              {ofDay.slice(0, 3).map((e) => (
                <CalendarEventButton key={e.id} event={e} className={eventClass(e) + ' cal-event--chip'} ariaLabel={hm(e.startsAt) + ' ' + labelOf(e)}
                  onOpen={onEvent} onMove={onMove}
                  resolveDrop={(dx, dy) => {
                    const grid = document.querySelector('.cal-month__grid');
                    const cell = grid && grid.querySelector('.cal-month__cell');
                    if (!grid || !cell) return new Date(e.startsAt);
                    return monthDropStart(e.startsAt, dx, dy, grid.clientWidth / 7, cell.getBoundingClientRect().height);
                  }}>
                  {shortLabelOf(e)}
                </CalendarEventButton>
              ))}
              {ofDay.length > 3 && <span className="cal-month__more">ещё {ofDay.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Создать, перенести или удалить занятие либо личное событие */
function EventForm({ event, preset, clients, serviceEmail, onDone, onCancel, onCopy }) {
  // Новое — на время, куда нажали в сетке (или 10:00 опорного дня)
  const base = (preset && preset.date) || startOfDay(new Date());
  const presetMinutes = preset && Number.isFinite(preset.minutes) ? preset.minutes : 10 * 60;
  const start = event.startsAt
    ? new Date(event.startsAt)
    : new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(presetMinutes / 60), presetMinutes % 60);
  const initialMinutes = event.startsAt ? Math.round((new Date(event.endsAt) - new Date(event.startsAt)) / 60000) : (event.duration || 60);

  const [clientRow, setClientRow] = useState(event.clientRow || '');
  const [kind, setKind] = useState(event.personal ? 'personal' : 'client');
  const [title, setTitle] = useState(event.title || '');
  const [date, setDate] = useState(dateValue(start));
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  // Шаг подтверждения: 'move' — что это за перенос, 'cancel' — кто отменил
  const [step, setStep] = useState(null);
  const [change, setChange] = useState('');
  const [who, setWho] = useState('');
  const [charge, setCharge] = useState(null); // null — по умолчанию (поздняя → да)
  const [reason, setReason] = useState('');

  const active = clients.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const startsAt = new Date(`${date}T${time}`);
  // Время поменялось — перенос или исправление: спросим, какое из двух
  const moved = !!event.id && startsAt.getTime() !== start.getTime();
  const personal = kind === 'personal';
  // Поздняя отмена — меньше чем за сутки до начала
  const late = !!event.id && start.getTime() - Date.now() < LATE_HOURS * 3600000;
  const charged = who === 'client' && (charge === null ? late : charge);

  const run = async (fn) => {
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      haptic('success');
      onDone();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => apiMutate('trainer.schedule.save', {
    ...(event.id ? { id: event.id } : {}),
    personal,
    ...(personal ? { title: title.trim() } : { clientRow: Number(clientRow) }),
    startsAt: startsAt.toISOString(),
    minutes: Number(minutes),
    ...(moved && !personal ? { change, reason } : {}),
  }));

  const remove = () => run(() => apiMutate('trainer.schedule.delete', {
    id: event.id, who: personal ? 'error' : who, reason, ...(charged ? { charge: true } : {}),
  }));

  // Отменено со списанием: событие в календаре ради денег, править нечего
  if (event.cancelledCharged) {
    return (
      <>
        <button className="button button--ghost library__back" onClick={onCancel}><IconBack size={16} />Расписание</button>
        <Panel pad>
          <div className="library__form">
            <strong>{event.clientName || event.title}</strong>
            <p className="small muted" style={{ margin: 0 }}>
              {new Date(event.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
            <Note tone="info">Отменено клиентом, занятие списано. В календаре оно осталось серым — по нему считаются деньги.</Note>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <>
      <button className="button button--ghost library__back" onClick={onCancel}><IconBack size={16} />Расписание</button>
      <Panel pad>
        <div className="library__form">
          <strong>{event.id ? (personal ? 'Личное событие' : 'Занятие') : event.copyOf ? 'Копия события' : 'Новое событие'}</strong>
          {event.copyOf && (
            <p className="small muted" style={{ margin: 0 }}>Скопированы название или клиент, дата, время и длительность. Проверьте их и нажмите «Добавить».</p>
          )}
          {!event.id && (
            <Options items={[{ value: 'client', label: 'Занятие с клиентом' }, { value: 'personal', label: 'Личное событие' }]}
              value={kind} onChange={setKind} label="Тип события" disabled={busy || !!step} />
          )}
          {personal ? (
            <>
              <Field label="Название события" value={title} onChange={setTitle} placeholder="Например, обед или личная встреча" inputMode="text" />
              <p className="form-hint">Не указывайте данные клиентов, сведения о здоровье и другую чувствительную информацию.</p>
            </>
          ) : (
            <label className="field">
              <span className="field__label">Клиент</span>
              <select className="field__input" value={clientRow} disabled={busy || !!step} onChange={(e) => setClientRow(e.target.value)}>
                <option value="">Выберите клиента</option>
                {active.map((c) => <option key={c.row} value={c.row}>{c.name}</option>)}
              </select>
            </label>
          )}
          <div className="field-row schedule__when">
            <Field label="Дата" type="date" value={date} onChange={(v) => { setDate(v); setStep(null); }} />
            <Field label="Время" type="time" value={time} onChange={(v) => { setTime(v); setStep(null); }} />
          </div>
          <label className="field">
            <span className="field__label">Длительность</span>
            <select className="field__input" value={minutes} disabled={busy || !!step} onChange={(e) => setMinutes(e.target.value)}>
              {DURATIONS.map((m) => <option key={m} value={m}>{m} мин</option>)}
              {!DURATIONS.includes(Number(minutes)) && <option value={minutes}>{minutes} мин</option>}
            </select>
          </label>

          {/* Перенос — не всегда перенос: бывает, просто записали не туда.
              В статистику идёт только настоящий перенос. */}
          {step === 'move' && !personal && (
            <div className="schedule__ask">
              <span className="field__label">Что это?</span>
              <Options
                items={[
                  { value: 'client', label: 'Перенос по просьбе клиента' },
                  { value: 'trainer', label: 'Перенос по моей инициативе' },
                  { value: 'fix', label: 'Исправление — неверно записал' },
                ]}
                value={change}
                onChange={setChange}
                label="Что это"
                disabled={busy}
              />
              {change && change !== 'fix' && (
                <Field label="Причина — по желанию" value={reason} onChange={setReason} placeholder="работа, отпуск, семейные дела…" inputMode="text" />
              )}
            </div>
          )}

          {step === 'cancel' && (
            <div className="schedule__ask">
              <span className="field__label">Кто отменил?</span>
              <Options
                items={[
                  { value: 'client', label: 'Клиент' },
                  { value: 'trainer', label: 'Я (тренер)' },
                  { value: 'error', label: 'Ошибочная запись — просто удалить' },
                ]}
                value={who}
                onChange={setWho}
                label="Кто отменил"
                disabled={busy}
              />
              {late && who && who !== 'error' && (
                <p className="small muted" style={{ margin: 0 }}>Поздняя отмена: меньше чем за {LATE_HOURS} часа до начала.</p>
              )}
              {/* Клиент отменил по своей вине и занятие списывается —
                  событие остаётся в календаре, по нему считаются деньги */}
              {who === 'client' && (
                <label className="library__check">
                  <input type="checkbox" checked={charged} disabled={busy} onChange={(e) => setCharge(e.target.checked)} />
                  Списать занятие — клиент отменил по своей вине
                </label>
              )}
              {who && who !== 'error' && (
                <Field label="Причина — по желанию" value={reason} onChange={setReason} placeholder="работа, отпуск, семейные дела…" inputMode="text" />
              )}
            </div>
          )}

          {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось'}</Note>}

          {step === 'cancel' ? (
            <div className="library__actions">
              <button className="button button--critical" disabled={busy || !who} onClick={remove}>
                {busy ? 'Отменяю…' : who === 'error' ? 'Удалить запись' : charged ? 'Отменить и списать' : 'Отменить занятие'}
              </button>
              <button className="button" disabled={busy} onClick={() => setStep(null)}>Назад</button>
            </div>
          ) : (
            <div className="library__actions">
              <button
                className="button button--primary"
                disabled={busy || (personal ? !title.trim() : !clientRow) || !date || !time || (step === 'move' && !change)}
                onClick={() => (moved && !personal && step !== 'move' ? setStep('move') : save())}
              >
                {busy ? 'Сохраняю…' : event.id ? (moved && step !== 'move' ? 'Перенести…' : 'Сохранить') : 'Добавить'}
              </button>
              <button className="button" disabled={busy} onClick={onCancel}>Отмена</button>
            </div>
          )}

          {event.id && !step && (
            <div className="library__actions" style={{ marginTop: 0 }}>
              <button className="button button--ghost" disabled={busy} onClick={() => onCopy && onCopy(event)}>
                <IconCopy size={16} />Копировать
              </button>
              <button className="button button--ghost" disabled={busy} onClick={() => personal ? remove() : setStep('cancel')}>
                {personal ? 'Удалить событие' : 'Отменить занятие'}
              </button>
            </div>
          )}
          {serviceEmail && (
            <p className="small muted" style={{ margin: 0 }}>
              Запись идёт в ваш Google Календарь от имени {serviceEmail}.
            </p>
          )}
        </div>
      </Panel>
    </>
  );
}

/**
 * Подписка календаря телефона на ленту. webcal:// открывает «Подписаться»
 * в Календаре iPhone; на Android ссылку добавляют в Google Календаре
 * («Другие календари → По URL»), поэтому рядом — «Скопировать».
 */
export function PhoneCalendar({ url, text }) {
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:/, 'webcal:');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      haptic('success');
    } catch (_) {
      window.prompt('Скопируйте ссылку:', url);
    }
  };

  return (
    <Section title="Календарь телефона">
      <Panel pad>
        <p className="small muted" style={{ marginTop: 0 }}>{text}</p>
        <div className="library__actions" style={{ marginTop: 0 }}>
          <a className="button button--primary" href={webcal}>Подписаться</a>
          <button className="button" onClick={copy}><IconCopy size={16} />{copied ? 'Скопировано' : 'Скопировать ссылку'}</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          iPhone: «Подписаться» откроет Календарь. Android: Google Календарь → «Другие календари» → «+» → «По URL» → вставьте ссылку.
        </p>
      </Panel>
    </Section>
  );
}
