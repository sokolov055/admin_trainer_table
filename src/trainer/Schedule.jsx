import { useReturnScroll } from '../scroll.js';
import { useBackGesture, onPullRefresh, rubberband, spring } from '../gestures.jsx';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useData } from '../useData.js';
import { apiMutate, apiStale, onMutated } from '../api.js';
import { reloadWidgets } from '../native-widget.js';
import { haptic } from '../telegram.js';
import { Panel, Note, Field, Options, ErrorState, BackButton, Sheet, useLeaveGuard } from '../ui.jsx';
import { usePendingDelete } from '../pendingDelete.jsx';
import { scheduledPlan, sessionQueue, dateKey as dayKey } from '../program-timeline.js';
import { initials } from '../chat/chat-model.js';
import { ChatGlyph, useChatInbox } from '../chat/ChatList.jsx';
import { requestStart } from '../client/start-request.js';
import { IconAlert, IconBack, IconCheck, IconChevron, IconClose, IconCopy, IconMenu, IconPen, IconPlay, IconPlus, IconUser } from '../icons.jsx';
import {
  addDays, dateValue, dropMinutes, durationOf, fetchRanges, mergeRange, mondayOf, movable, moveRequest,
  rangeOf, sameTimeOn, shifted, startOfDay,
} from './calendar-move.js';
import { dayOverview } from './calendar-day.js';
import { BookingColor } from './BookingColor.jsx';
import { BookingDuration } from './BookingDuration.jsx';
import { bookingTime, resizeBooking } from './quick-booking.js';
import QuickBooking, { RepeatFields, weeklyPayload } from './QuickBooking.jsx';
import { dayDots, dayTypeLabels, eventAria, eventKind, eventLines, isAllDay, isLegacyAllDay } from './calendar-look.js';

/**
 * Расписание тренера — по образцу Google Календаря (переделано 19.10.2026).
 *
 * Экран целиком отдан календарю: одна строка сверху (месяц — он же выбор
 * даты, «Сегодня», вид, меню), под ней сетка до нижнего меню, без прокрутки
 * страницы. Виды: список, день, 3 дня, неделя, месяц; выбранный помнится.
 *
 * Листание вбок — ровно на экран (день, три дня, неделя, месяц), сетка едет
 * за пальцем, по вертикали остаётся на том же часе. Событие переносится
 * удержанием: оно приподнимается, ведётся пальцем с шагом 15 минут, у края
 * сетка перелистывается сама. Личное событие переносится сразу (с «Вернуть»),
 * у занятия с клиентом спрашиваем, чей это перенос, — от этого зависит
 * статистика. Нажатие на пустое место открывает быструю запись на это время.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_TITLE = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const DRAFT_ID = 'calendar-booking-draft';
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

// keys — сочетания клавиш на компьютере, латиница и та же клавиша в русской раскладке
const VIEWS = [
  { value: 'list', label: 'Список', keys: ['a', 'ф'] },
  { value: 'day', label: 'День', keys: ['d', 'в'] },
  { value: '3day', label: '3 дня', keys: ['x', 'ч'] },
  { value: 'week', label: 'Неделя', keys: ['w', 'ц'] },
  { value: 'month', label: 'Месяц', keys: ['m', 'ь'] },
];
const VIEW_KEY = 'schedule_view_v1';

/** Отмена позже этого срока до начала — поздняя (как на сервере) */
const LATE_HOURS = 24;

const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const hm = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const clock = (minutes) => pad(Math.floor(minutes / 60) % 24) + ':' + pad(minutes % 60);
const weekdayOf = (d) => WEEKDAYS[(d.getDay() + 6) % 7];
const keyDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
/** «ср 21 окт, 10:15» — куда перенесли */
const whenShort = (d) => weekdayOf(d).toLowerCase() + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ', ' + clock(d.getHours() * 60 + d.getMinutes());

function readView() {
  try { const v = localStorage.getItem(VIEW_KEY); return VIEWS.some((x) => x.value === v) ? v : '3day'; } catch (_) { return '3day'; }
}

/** «Октябрь», «Январь 2027» или «Окт – нояб» для сетки на стыке месяцев */
function titleOf(view, anchor, start, days) {
  const year = (d) => (d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear());
  if (view === 'month' || view === 'list') return MONTHS_TITLE[anchor.getMonth()] + year(anchor);
  const end = addDays(start, days - 1);
  if (start.getMonth() === end.getMonth()) return MONTHS_TITLE[start.getMonth()] + year(start);
  return MONTHS_TITLE[start.getMonth()].slice(0, 3) + ' – ' + MONTHS_TITLE[end.getMonth()].slice(0, 4).toLowerCase() + year(end);
}

/** Короткий отклик пальцу: в Telegram — его вибрация, на Android — своя */
function buzz() {
  haptic('medium');
  try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* нет вибрации */ }
}

/**
 * Слой уходит не одним кадром, а своей анимацией: значение пропало — ещё
 * ms держим последнее и помечаем «уходит» (меню видов, лист «чей перенос»,
 * «Вернуть», выбор даты).
 */
function useLeaving(value, ms = 220) {
  const [kept, setKept] = useState(value || null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (value) { setKept(value); setLeaving(false); return undefined; }
    if (!kept) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setKept(null); setLeaving(false); }, reduceMotion() ? 0 : ms);
    return () => clearTimeout(t);
  }, [value]);
  return [value || kept, !value && !!kept];
}

// onOpenClient(client, раздел) — к карточке клиента занятия (FT-567);
// onMenu — боковое меню приложения: шапки над календарём нет, кнопка в его строке
export default function Schedule({ onOpenClient = null, onMenu = null, active = true }) {
  const [view, setViewState] = useState(readView);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState(null); // null | {} — новое | событие
  const [selectedId, setSelectedId] = useState(null);
  const [formMode, setFormMode] = useState('edit');
  const chat = useChatInbox();
  const [quick, setQuick] = useState(null);
  const [choosingSlot, setChoosingSlot] = useState(false);
  const bookingRequests = useRef(new Map());
  const [quickMinutes, setQuickMinutes] = useState(60);
  const [preset, setPreset] = useState(null); // время нового занятия из сетки
  // Прокрутка по часам ставится заново только по этому счётчику: открыли,
  // сменили вид, «Сегодня», выбрали дату. Листание её не трогает
  const [scrollKey, setScrollKey] = useState(0);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [moves, setMoves] = useState({}); // id → новое время, пока сервер не ответил
  const [ask, setAsk] = useState(null); // перенос занятия ждёт ответа «чей»
  const [undo, setUndo] = useState(null);
  const [failure, setFailure] = useState(null);
  // Сервер ответил, что остаток тренировку уже не покрывает (FT-784)
  const [unpaid, setUnpaid] = useState(false);
  const [agendaDays, setAgendaDays] = useState(28);
  // Лента сетки или месяца: листнуть пружиной и «въехать» после прыжка
  const pager = useRef(null);
  const [menuShown, menuLeaving] = useLeaving(menu, 160);
  const [pickerShown, pickerLeaving] = useLeaving(picker, 300);
  const [undoShown, undoLeaving] = useLeaving(undo, 200);
  useReturnScroll(!!editing);
  // Запись открыта поверх сетки: смахнуть вправо, Back Android и браузера —
  // к расписанию, как кнопка «Расписание» над формой (FT-567). С изменённой
  // формой смахивания нет, а выход спрашивает «Выйти без сохранения?» —
  // раньше набранное пропадало от жеста от края (аудит 24.10.2026)
  const [formDirty, setFormDirty] = useState(false);
  const [delFailure, setDelFailure] = useState(null);
  const closeForm = () => { setEditing(null); setPreset(null); setFormDirty(false); setFormMode('edit'); };
  const formGuard = useLeaveGuard(formDirty, closeForm);
  useBackGesture(formGuard.leave, !!editing, null, { swipe: !formDirty });
  useBackGesture(() => setChoosingSlot(false), choosingSlot);
  const closeQuick = () => { setQuick(null); setChoosingSlot(false); bookingRequests.current.clear(); };
  const bookingRequestId = (payload) => {
    const key = JSON.stringify(payload);
    if (!bookingRequests.current.has(key)) bookingRequests.current.set(key, crypto.randomUUID());
    return bookingRequests.current.get(key);
  };
  const finishBooking = (result) => {
    closeQuick();
    setUnpaid(!!result?.unpaid);
    setTick((t) => t + 1);
  };

  // Личное событие удаляется сразу, с «Вернуть» внизу (pendingDelete.jsx):
  // раньше кнопка «Удалить событие» стирала его без пути назад (аудит 24.10.2026)
  const del = usePendingDelete((e) => apiMutate('trainer.schedule.delete', { id: e.id, who: 'error', reason: '' }), {
    onDone: () => { reloadWidgets(); setTick((t) => t + 1); },
    onError: (err) => setDelFailure(err),
  });

  const setView = (v) => {
    // Смена вида — с того же места: сегодня, если оно на экране, иначе
    // с первого видимого дня (из месяца — с первого числа)
    const { start: s0, days: n0 } = rangeOf(view, anchor);
    const first = view === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : s0;
    const last = view === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) : addDays(s0, view === 'list' ? agendaDays : n0);
    const now = new Date();
    setAnchor(now >= first && now < last ? startOfDay(now) : first);
    setViewState(v);
    setMenu(false);
    setScrollKey((k) => k + 1);
    try { localStorage.setItem(VIEW_KEY, v); } catch (_) { /* не запомнили — не беда */ }
    haptic();
  };

  const { start, days } = rangeOf(view, anchor);
  const shownDays = view === 'list' ? agendaDays : days;

  // Загруженные занятия копятся (mergeRange): вернулись на прошлую неделю —
  // она на месте сразу, а не пустая до ответа сервера
  const [cache, setCache] = useState(() => new Map());
  const [load, setLoad] = useState({ loading: true, error: null });
  const [tick, setTick] = useState(0);
  const loaded = useRef(new Set());
  const ranges = fetchRanges(view, anchor, agendaDays).map((r) => [r.from.toISOString(), r.to.toISOString()]);
  const rangesKey = ranges.map((r) => r.join('|')).join(',');
  useEffect(() => {
    let alive = true;
    let left = ranges.length;
    setLoad((s) => ({ loading: true, error: s.error }));
    ranges.forEach(([fromIso, toIso]) => {
      const key = fromIso + '|' + toIso;
      const { data, promise } = apiStale('trainer.schedule', { from: fromIso, to: toIso, includeOverlaps: true });
      // Сохранённое прежде — только для промежутка, который ещё не видели
      // свежим: после переноса оно старое и вернуло бы событие на старое место
      if (data && data.events && !loaded.current.has(key)) setCache((c) => mergeRange(c, fromIso, toIso, data.events, true));
      promise
        .then((fresh) => {
          loaded.current.add(key);
          setCache((c) => mergeRange(c, fromIso, toIso, fresh && fresh.events, true));
          left -= 1;
          if (alive && !left) {
            setLoad({ loading: false, error: null });
            // Виджеты iPhone «Занятия сегодня» перечитают сейчас, а не через полчаса
            reloadWidgets();
          }
        })
        .catch((error) => { if (alive) setLoad({ loading: false, error }); });
    });
    return () => { alive = false; };
  }, [rangesKey, tick]);
  // Любая запись (в том числе своя форма) — перечитать тихо
  useEffect(() => onMutated(() => setTick((t) => t + 1)), []);
  // «Потянуть вниз» за строку месяца — перечитать
  useEffect(() => onPullRefresh(() => { setTick((t) => t + 1); return new Promise((r) => setTimeout(r, 700)); }), []);

  const clients = useData('trainer.clients', {}, []);

  // Удалённое с «Вернуть» прячется сразу; ключ строкой — чтобы список не
  // пересобирался на каждой отрисовке
  const hiddenKey = [...cache.keys()].filter((id) => del.hidden(id)).join(',');
  const shownEvents = useMemo(() => [...cache.values()]
    .filter((e) => !del.hidden(e.id))
    .map((e) => (moves[e.id] ? { ...e, ...moves[e.id], moving: true } : e)), [cache, moves, hiddenKey]);
  // Занятие программы на запись (FT-788, этап 4) — только у клиентов, у
  // которых тренер выбрал «По записям»; остальные записи как были
  const rowsKey = [...new Set(shownEvents.filter((e) => e.clientRow).map((e) => Number(e.clientRow)))].sort((a, b) => a - b).join(',');
  const programs = useData('trainer.schedule.programs', { rows: rowsKey }, [rowsKey, tick]);
  const events = useMemo(() => withSessions(shownEvents, programs.data && programs.data.programs), [shownEvents, programs.data]);

  // Смена экрана без анимации — её делает лента (палец, пружина)
  function shift(dir) { setAnchor((a) => shifted(view, a, dir)); setPicker(false); }
  // Стрелки и клавиши — та же пружина, что у пальца; в списке ленты нет
  function step(dir) {
    haptic();
    if (view !== 'list' && pager.current) pager.current.page(dir);
    else shift(dir);
  }
  // Прыжок на дату: новое ставим сразу, лента въезжает с той стороны,
  // где эта дата относительно прежней
  const leap = (d) => {
    const target = startOfDay(d);
    const next = rangeOf(view, target).start;
    const dir = next > start ? 1 : next < start ? -1 : 0;
    flushSync(() => { setAnchor(target); setScrollKey((k) => k + 1); setPicker(false); });
    if (dir && pager.current) pager.current.enter(dir);
    haptic();
  };
  function today() { leap(new Date()); }
  const jump = (d) => leap(d);
  const openDay = (d) => { setAnchor(startOfDay(d)); setView('day'); };
  const openEvent = (e) => { if (!e.moving) { setSelectedId(e.id); haptic(); } };

  // Сочетания клавиш на компьютере — как в Google: ←/→, T — сегодня, D/X/W/M/A — вид
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (!active || editing || quick || selectedId || ask || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('.drawer--open, [role="dialog"][aria-modal="true"]')) return;
    const k = String(e.key || '').toLowerCase();
    if (e.key === 'ArrowLeft' || k === 'k' || k === 'л') step(-1);
    else if (e.key === 'ArrowRight' || k === 'j' || k === 'о') step(1);
    else if (k === 't' || k === 'е') today();
    else {
      const v = VIEWS.find((x) => x.keys.includes(k));
      if (!v) return;
      setView(v.value);
    }
    e.preventDefault();
  };
  useEffect(() => {
    const on = (e) => keyRef.current && keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  useEffect(() => {
    if (!unpaid) return undefined;
    const t = setTimeout(() => setUnpaid(false), 10000);
    return () => clearTimeout(t);
  }, [unpaid]);

  useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const clientList = clients.data?.clients || [];
  const selected = events.find((e) => e.id === selectedId);
  const removePersonal = (e) => {
    setSelectedId(null);
    closeForm();
    setUndo(null);
    setDelFailure(null);
    haptic('success');
    del.remove(e.id, e, 'Событие удалено');
  };
  const copy = (e) => {
    const start = new Date(e.startsAt);
    setPreset({ date: startOfDay(start), minutes: start.getHours() * 60 + start.getMinutes() });
    setEditing({ clientRow: e.clientRow || '', personal: !!e.personal, title: e.personal ? e.title : '',
      duration: durationOf(e), color: e.color, copyOf: e.clientName || e.title || '' });
    setFormMode('edit');
    haptic();
  };

  if (editing) {
    return (
      <div className="cal-form">
        <EventForm
          event={editing}
          mode={formMode}
          preset={preset}
          clients={clientList}
          onDone={(res) => { closeForm(); setSelectedId(null); finishBooking(res); }}
          onCancel={formGuard.leave}
          repeatSupported={editing.repeatSupported}
          requestIdFor={bookingRequestId}
          confirm={formGuard.confirm}
          onDirty={setFormDirty}
        />
      </div>
    );
  }

  // Новое событие: из сетки — на нажатое время; кнопкой «+» — на ближайший
  // целый час сегодня, если сегодня на экране, иначе на 10:00 первого дня
  const create = (when) => {
    let at = when;
    if (!at) {
      const now = new Date();
      const todayShown = view !== 'month' && now >= start && now < addDays(start, shownDays);
      at = todayShown && now.getHours() < 23
        ? { date: startOfDay(now), minutes: (now.getHours() + 1) * 60 }
        : { date: view === 'month' ? startOfDay(anchor) : start, minutes: 10 * 60 };
    }
    const next = at.start == null
      ? new Date(at.date.getFullYear(), at.date.getMonth(), at.date.getDate(), 0, at.minutes)
      : new Date(at.start);
    if (!quick) setQuickMinutes(60);
    setQuick((current) => current ? { ...current, at: next }
      : { at: next, row: '', personal: false, title: '', manualMinutes: null, repeat: false, until: '', color: null });
    setChoosingSlot(false);
    haptic();
  };

  const times = (event, next) => ({
    startsAt: next.toISOString(),
    endsAt: new Date(next.getTime() + durationOf(event) * 60000).toISOString(),
  });
  const forget = (id) => setMoves((m) => { const n = { ...m }; delete n[id]; return n; });

  // Сохранить перенос; на экране событие уже стоит на новом месте
  const commitMove = async (event, next, change, scope) => {
    const at = times(event, next);
    setMoves((m) => ({ ...m, [event.id]: at }));
    setFailure(null);
    try {
      const res = await apiMutate('trainer.schedule.save', { ...moveRequest(event, next, change), ...(scope ? { scope } : {}) });
      setUnpaid(!!(res && res.unpaid));
      setCache((c) => {
        const n = new Map(c);
        const old = n.get(event.id);
        if (old) n.set(event.id, { ...old, ...at });
        return n;
      });
      haptic('success');
      return true;
    } catch (err) {
      setFailure(err);
      return false;
    } finally {
      forget(event.id);
    }
  };

  const drop = (event, next) => {
    if (event.id === DRAFT_ID) {
      setQuick((current) => current && { ...current, at: next });
      setChoosingSlot(false);
      return;
    }
    if (next.getTime() === new Date(event.startsAt).getTime()) return;
    setUndo(null);
    // Две плашки «Вернуть» друг на друге не помещаются: ждущее удаление — сразу
    del.flush();
    if (event.personal && !event.weekly) {
      const back = new Date(event.startsAt);
      commitMove(event, next).then((ok) => {
        if (ok) setUndo({ event: { ...event, ...times(event, next) }, back, text: 'Перенесено на ' + whenShort(next) });
      });
      return;
    }
    // Занятие с клиентом: показываем на новом месте и спрашиваем, чей
    // это перенос, — без ответа сервер его не примет, а статистика соврёт
    setMoves((m) => ({ ...m, [event.id]: times(event, next) }));
    setAsk({ event, next });
  };

  const answer = (change, scope) => {
    const a = ask;
    if (!a) return;
    setAsk(null);
    if (!change) { forget(a.event.id); haptic(); return; }
    commitMove(a.event, a.next, change, scope).then((ok) => {
      // Клиент «по записям» (FT-788, этап 4): занятие уехало вместе с записью —
      // просто сообщаем. «Вернуть» не нужно: перенос и так подтверждают в окне
      // (владелец, 14.11.2026)
      if (!ok || !a.event.session) return;
      del.flush();
      setUndo({ info: true, text: `Занятие «${a.event.session.short}» переехало вместе с записью` });
    });
  };

  const title = titleOf(view, anchor, start, days);
  const viewLabel = (VIEWS.find((v) => v.value === view) || VIEWS[0]).label;
  const nowDate = new Date();
  const gridView = view !== 'month' && view !== 'list';
  const draft = quick && {
    id: DRAFT_ID, color: quick.color, startsAt: quick.at.toISOString(), endsAt: new Date(quick.at.getTime() + quickMinutes * 60000).toISOString(),
  };

  return (
    <div className="cal-screen">
      <div className="cal-top">
        <button type="button" className="cal-top__title" aria-expanded={picker} aria-label={title + ', выбрать дату'}
          onClick={() => { setPicker((p) => !p); setMenu(false); haptic(); }}>
          <span>{title}</span>
          <IconChevron size={18} className={picker ? 'cal-top__chev cal-top__chev--open' : 'cal-top__chev'} />
        </button>
        <div className="cal-top__actions">
          <button type="button" className="icon-button cal-top__arrow" aria-label="Назад" onClick={() => step(-1)}><IconBack size={18} /></button>
          <button type="button" className="icon-button cal-top__arrow cal-top__arrow--next" aria-label="Вперёд" onClick={() => step(1)}><IconBack size={18} /></button>
          <button type="button" className="cal-today" aria-label="Сегодня" title="Сегодня (T)" onClick={today}>
            <span>{nowDate.getDate()}</span>
          </button>
          <div className="cal-viewpick">
            <button type="button" className="cal-viewpick__button" aria-haspopup="menu" aria-expanded={menu}
              onClick={() => { setMenu((m) => !m); setPicker(false); haptic(); }}>
              {viewLabel}<IconChevron size={16} />
            </button>
            {menuShown && (
              <>
                {!menuLeaving && <div className="cal-viewpick__scrim" onClick={() => setMenu(false)} aria-hidden="true" />}
                <div className={'cal-viewpick__menu' + (menuLeaving ? ' cal-viewpick__menu--leaving' : '')} role="menu" aria-label="Вид календаря">
                  {VIEWS.map((v) => (
                    <button key={v.value} type="button" role="menuitemradio" aria-checked={v.value === view}
                      className={'cal-viewpick__item' + (v.value === view ? ' cal-viewpick__item--on' : '')}
                      onClick={() => setView(v.value)}>
                      <span>{v.label}</span>
                      {v.value === view && <IconCheck size={16} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {onMenu && (
            <button type="button" className="icon-button cal-top__menu" aria-label="Меню" onClick={onMenu}><IconMenu size={22} /></button>
          )}
        </div>
        <span className={'cal-top__busy' + (load.loading ? ' cal-top__busy--on' : '')} aria-hidden="true" />
      </div>

      {pickerShown && (
        <div className={'cal-mini-wrap' + (pickerLeaving ? ' cal-mini-wrap--leaving' : '')}>
          <MiniMonth anchor={anchor} start={start} days={view === 'month' ? 0 : view === 'list' ? 1 : days} events={events}
            onPick={jump} />
        </div>
      )}

      {unpaid && (
        <div className="cal-note" role="status">
          <Note tone="warning" icon={IconAlert}>Тренировка не оплачена: у клиента кончились оплаченные занятия — напомните ему взять деньги.</Note>
        </div>
      )}
      {failure && (
        <div className="cal-note">
          <Note tone="critical" icon={IconAlert}>Не удалось перенести: {failure.message || 'повторите ещё раз'}</Note>
        </div>
      )}
      {delFailure && (
        <div className="cal-note">
          <Note tone="critical" icon={IconAlert}>Не удалось удалить событие: {delFailure.message || 'повторите ещё раз'}</Note>
        </div>
      )}
      {load.error && !events.length && (
        <div className="cal-note"><ErrorState error={load.error} onRetry={() => setTick((t) => t + 1)} /></div>
      )}

      <div className="cal-main">
        {/* key — вид: сменили вид — новый проявляется (cal-view-in), а не
            подменяет прежний одним кадром */}
        {view === 'month' ? (
          <MonthPager key="month" pager={pager} anchor={anchor} events={events} onDay={openDay} onEvent={openEvent} onShift={shift} onDrop={drop} />
        ) : view === 'list' ? (
          <Agenda key="list" start={start} days={agendaDays} events={events} loading={load.loading}
            onEvent={openEvent} onDay={openDay} onMore={() => setAgendaDays((n) => n + 28)} />
        ) : (
          <TimeGrid key={view} pager={pager} start={start} days={days} events={events} scrollKey={scrollKey} draft={draft} draftOpen={!!quick && !choosingSlot}
            dayReady={!load.error && loaded.current.has(rangesKey)}
            onDay={openDay} onEvent={openEvent} onCreate={create} onShift={shift} onDrop={drop}
            onResize={(patch) => {
              setQuick((current) => current && { ...current, ...patch });
              setQuickMinutes(patch.manualMinutes);
            }} />
        )}
      </div>

      {/* Новое событие — плавающей кнопкой, как в Google: сетка занимает
          экран, а кнопка всегда под пальцем над нижним меню */}
      <button type="button" className="cal-fab" aria-label="Добавить событие" onClick={() => create()}><IconPlus size={24} /></button>

      {choosingSlot && <div className="cal-note cal-quick__slot-tip">
        <button className="button" type="button" onClick={() => setChoosingSlot(false)}>Вернуться к записи</button>
      </div>}
      {quick && !choosingSlot && <QuickBooking draft={quick} clients={clientList} events={events} grid={gridView}
        onDuration={setQuickMinutes} onChange={(patch) => setQuick((current) => ({ ...current, ...patch }))}
        onChooseSlot={() => setChoosingSlot(true)} onClose={closeQuick} onDone={finishBooking} requestIdFor={bookingRequestId}
        onMore={(minutes, repeatSupported) => {
          setPreset({ date: startOfDay(quick.at), minutes: quick.at.getHours() * 60 + quick.at.getMinutes() });
          setEditing({ clientRow: quick.row, personal: quick.personal, title: quick.title,
            duration: minutes, color: quick.color, repeat: quick.repeat, until: quick.until, repeatSupported });
        }} />}
      {selected && active && !chat.open && (
        <EventSheet
          key={selected.id}
          event={selected}
          clients={clientList}
          chat={chat}
          onClose={() => setSelectedId(null)}
          onEdit={(mode) => { setFormMode(mode); setEditing(selected); haptic(); }}
          onCopy={() => copy(selected)}
          onRemovePersonal={() => removePersonal(selected)}
          onOpenClient={onOpenClient}
          onProgramSaved={() => setTick((t) => t + 1)}
        />
      )}
      {ask && <MoveAsk ask={ask} onAnswer={answer} />}
      {del.bar}
      {undoShown && typeof document !== 'undefined' && createPortal(
        <div className={'undo-bar' + (undoLeaving ? ' undo-bar--leaving' : '')} role="status">
          <span>{undoShown.text}</span>
          {!undoShown.info && <button type="button" className="button button--ghost" disabled={undoLeaving} onClick={() => {
            const u = undo;
            if (!u) return;
            setUndo(null);
            commitMove(u.event, u.back);
          }}>Вернуть</button>}
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Чей перенос. Сервер без ответа занятие не перенесёт: в статистику идут
 * переносы клиента и тренера отдельно, а исправление ошибки — никуда.
 *
 * Общий лист приложения (Sheet) — с ручкой, смахиванием и крестиком, как
 * все остальные; три ответа одинаковые: синим «Попросил клиент» подталкивал
 * к одному ответу, а статистике нужен честный (аудит 24.10.2026). Ответ
 * уходит, когда лист доехал вниз; крестик, смахивание, «назад» и касание
 * мимо — то же, что «Не переносить».
 */
function MoveAsk({ ask, onAnswer }) {
  const { event, next } = ask;
  const from = new Date(event.startsAt);
  const closeRef = useRef(null);
  const chosen = useRef(null);
  const [scope, setScope] = useState('one');
  const pick = (change) => {
    chosen.current = { change, scope };
    if (closeRef.current) closeRef.current();
  };
  return (
    <Sheet title="Перенести занятие?" closeRef={closeRef} onClose={() => onAnswer(chosen.current?.change, chosen.current?.scope)}>
      <p className="cal-sheet__text">
        {labelOf(event)}<br />
        <span className="muted">{whenShort(from)}</span> → <b>{whenShort(next)}</b>
      </p>
      {event.weekly && <SeriesScope value={scope} onChange={setScope} />}
      <div className="cal-sheet__options">
        {event.personal ? <button type="button" className="button button--primary" onClick={() => pick('fix')}>Перенести</button> : <>
        <button type="button" className="button" onClick={() => pick('client')}>Попросил клиент</button>
        <button type="button" className="button" onClick={() => pick('trainer')}>По моей инициативе</button>
        <button type="button" className="button" onClick={() => pick('fix')}>Исправление — неверно записал</button>
        </>}
        <button type="button" className="button button--ghost" onClick={() => pick(null)}>Не переносить</button>
      </div>
    </Sheet>
  );
}

/**
 * Выбор даты под строкой месяца, как в Google: месяц сеткой, точки под
 * днями с занятиями, выделены дни на экране. Месяцы — стрелками и смахиванием.
 */
function MiniMonth({ anchor, start, days, events, onPick }) {
  const [month, setMonth] = useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const swipe = useRef(null);
  const first = mondayOf(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const busy = useMemo(() => {
    const s = new Set();
    events.forEach((e) => { if (!e.cancelledCharged) eventDays(e).forEach((key) => s.add(key)); });
    return s;
  }, [events]);
  const now = new Date();
  const end = addDays(start, days);
  const [slide, setSlide] = useState(0);
  const step = (n) => { setSlide(n); setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); haptic(); };
  return (
    <div className="cal-mini" data-no-gestures=""
      onTouchStart={(e) => { const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={(e) => {
        const s = swipe.current;
        swipe.current = null;
        const t = e.changedTouches[0];
        if (!s || !t) return;
        const dx = t.clientX - s.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - s.y)) step(dx < 0 ? 1 : -1);
      }}>
      <div className="cal-mini__head">
        <button type="button" className="icon-button" aria-label="Предыдущий месяц" onClick={() => step(-1)}><IconBack size={16} /></button>
        <strong>{MONTHS_TITLE[month.getMonth()]} {month.getFullYear()}</strong>
        <button type="button" className="icon-button cal-top__arrow--next" aria-label="Следующий месяц" onClick={() => step(1)}><IconBack size={16} /></button>
      </div>
      <div key={month.getTime()} className={'cal-mini__grid' + (slide > 0 ? ' cal-mini__grid--next' : slide < 0 ? ' cal-mini__grid--prev' : '')}>
        {WEEKDAYS.map((w) => <span key={w} className="cal-mini__wd">{w}</span>)}
        {cells.map((d) => {
          const inView = days > 0 && d >= start && d < end;
          const cls = 'cal-mini__day'
            + (d.getMonth() !== month.getMonth() ? ' cal-mini__day--other' : '')
            + (sameDay(d, now) ? ' cal-mini__day--today' : '')
            + (inView ? ' cal-mini__day--in' : '');
          return (
            <button key={d.getTime()} type="button" className={cls} onClick={() => onPick(d)}
              aria-label={d.getDate() + ' ' + MONTHS[d.getMonth()]}>
              <span>{d.getDate()}</span>
              {busy.has(dateValue(d)) && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Название события в сетке: клиент, иначе название */
function Dumbbell() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <rect x="1" y="9" width="4" height="6" rx="1" /><rect x="19" y="9" width="4" height="6" rx="1" />
      <rect x="5" y="7" width="3" height="10" rx="1" /><rect x="16" y="7" width="3" height="10" rx="1" /><rect x="8" y="11" width="8" height="2" />
    </svg>
  );
}

/**
 * Строка «По программе» в окне записи (FT-788, этап 4): что за занятие,
 * «▶ Начать» — сразу тренировка у клиента, «другое ▾» — провести в эту
 * запись другое занятие или ничего (правка недели, как в редакторе недель)
 */
function SessionRow({ item, pair, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const edit = item.edit;
  const choose = async (id) => {
    if (!edit || id === item.id) return;
    const list = edit.layout.map((it) => ({ ...it }));
    const here = list.find((it) => it.day === edit.day);
    if (!id) { if (here) here.day = 0; } else {
      // Выбранное уже стоит в неделе — меняются днями; нет — встаёт вместо
      const there = list.find((it) => it.id === id && it !== here);
      if (there) { const d = there.day; there.day = edit.day; if (here) here.day = d; }
      else if (here) here.id = id;
      else list.push({ id, day: edit.day });
    }
    setBusy(true); setFailure('');
    try {
      await apiMutate('plan.week.edit', { clientRow: edit.row, month: edit.month, rev: edit.rev, weekEdits: { ...edit.edits, [edit.week]: list.map(({ id: x, day, from }) => ({ id: x, day, ...(from ? { from } : {}) })) }, notify: false });
      haptic('success');
      onSaved(null);
    } catch (err) { setFailure(err.message || 'Не сохранилось.'); } finally { setBusy(false); }
  };
  return (
    <div className="schedule__session">
      <span className={'schedule__session-ic' + (item.cardio ? ' is-cardio' : '')} aria-hidden="true">{item.cardio ? '♥' : <Dumbbell />}</span>
      <span className="schedule__session-t">
        <small>{pair && item.name ? item.name + ' · по программе' : 'По программе'}</small>
        <b>{item.title || 'без занятия'}</b>
        {edit && (
          <select aria-label="Другое занятие на эту запись" value="" disabled={busy} onChange={(e) => choose(e.target.value === '-' ? '' : e.target.value)}>
            <option value="">{busy ? 'сохраняю…' : 'другое ▾'}</option>
            {edit.options.filter((o) => o.id !== item.id).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            {item.id && <option value="-">Без занятия программы</option>}
          </select>
        )}
        {failure && <em>{failure}</em>}
      </span>
    </div>
  );
}

function EventSheet({ event, clients, chat, onClose, onEdit, onCopy, onRemovePersonal, onOpenClient, onProgramSaved }) {
  const start = new Date(event.startsAt);
  const title = event.clientName || event.title || 'Занятие';
  const client = clients.find((c) => Number(c.row) === Number(event.clientRow));
  const sessions = event.sessions || [];
  const planned = sessions.filter((s) => s.id);
  const canEdit = !event.cancelledCharged;
  const hasClient = !event.personal && !!event.clientRow;
  const scheduledClients = planned.length ? planned : [{ row: event.clientRow, id: '', title: '', name: '' }];
  const thread = chat.chats?.find((c) => Number(c.clientRow) === Number(event.clientRow) && !c.member);
  const [chatHint, setChatHint] = useState('');
  const write = () => {
    haptic();
    if (chat.enabled && thread) {
      chat.setOpen({ clientRow: thread.clientRow, member: thread.member, name: title });
      return;
    }
    setChatHint(!chat.ready ? 'Чат ещё не загрузился. Попробуйте ещё раз.'
      : chat.enabled ? 'Чат с этим клиентом пока недоступен.' : 'Чаты в приложении пока выключены.');
  };
  const openWorkout = (row, target) => {
    const person = clients.find((c) => Number(c.row) === Number(row)) || { row, name: title };
    requestStart(row, target);
    onOpenClient(person, 'plan');
  };
  const heading = (
    <span className="cal-detail__title">
      {hasClient && <span className="cal-detail__avatar" aria-hidden="true">{initials(title)}</span>}
      <span className="cal-detail__name">{title.split(/(\s+)/).map((part, index) => (
        part.trim() ? <span key={index}>{part}</span> : part
      ))}</span>
    </span>
  );
  const date = start.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });

  return (
    <Sheet title={heading} className="cal-detail" onClose={onClose}>
      <div className="cal-detail__summary">
        <div className="cal-detail__when">
          <div>{date} · {eventTime(event) + (isLegacyAllDay(event) ? '' : ' · ' + durationOf(event) + ' мин')}</div>
          <div className="cal-detail__tools">
            {canEdit && <button type="button" className="icon-button" aria-label="Копировать событие" onClick={onCopy}><IconCopy size={17} /></button>}
          </div>
        </div>
        {event.cancelledCharged && <Note tone="info">Отменено клиентом, занятие списано.</Note>}
        {event.personal && <p className="small muted">Личное событие</p>}
        {event.weekly && <p className="small muted">Повтор каждую неделю</p>}
        {hasClient && !event.cancelledCharged && onOpenClient && (
          event.done
            ? <EventReports event={event} onOpen={openWorkout} />
            : scheduledClients.map((s) => (
              <button key={s.row} type="button" className="button button--primary button--block cal-detail__start"
                onClick={() => openWorkout(s.row, { blockId: s.id })}>
                <IconPlay size={17} />Начать тренировку{s.title && ' · ' + (scheduledClients.length > 1 && s.name ? s.name + ': ' : '') + s.title}
              </button>
            ))
        )}
        <div className="cal-detail__actions">
          {canEdit && <DetailAction icon={IconPen} onClick={() => onEdit('edit')}>Изменить</DetailAction>}
          {canEdit && (event.personal
            ? <DetailAction icon={IconClose} onClick={event.weekly && !event.done && start > new Date() ? () => onEdit('cancel') : onRemovePersonal}>Удалить</DetailAction>
            : <DetailAction icon={IconClose} onClick={() => onEdit('cancel')}>Отменить</DetailAction>)}
          {hasClient && <DetailAction icon={ChatGlyph} onClick={write}>Написать</DetailAction>}
          {hasClient && onOpenClient && (
            <DetailAction icon={IconUser} onClick={() => onOpenClient(client || { row: event.clientRow, name: title }, 'overview')}>Карточка</DetailAction>
          )}
        </div>
        {chatHint && <p className="small muted" role="status">{chatHint}</p>}
        {hasClient && <EventClientDetails key={event.clientRow} row={event.clientRow} unpaid={event.unpaid} />}
        {hasClient && canEdit && (
          <div className="cal-detail__program">
            {sessions.map((s) => (
              <SessionRow key={s.row} item={s} pair={sessions.length > 1} onSaved={onProgramSaved} />
            ))}
            {onOpenClient && <button type="button" className="button button--ghost" onClick={() => onOpenClient(client || { row: event.clientRow, name: title }, 'plan')}>Программа клиента</button>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function DetailAction({ icon: Icon, children, onClick }) {
  return <button type="button" className="button" onClick={onClick}><Icon size={19} />{children}</button>;
}

function EventClientDetails({ row, unpaid }) {
  const overview = useData('client.overview', { clientRow: row }, [row]);
  const wishes = useData('wish.list', { clientRow: row }, [row]);
  const client = overview.data;
  const left = client?.payer ? client.payer.trainingsLeft : client?.trainingsLeft;
  const wish = wishes.data?.wishes?.find((w) => w.status !== 'done' && w.text);
  return (
    <dl className="cal-detail__meta">
      {(unpaid || left != null) && (
        <div><dt>Абонемент</dt><dd className={unpaid ? 'cal-detail__unpaid' : undefined}>
          {unpaid ? 'Не оплачено' : 'Осталось ' + Math.max(0, left) + (client.packageCount ? ' из ' + client.packageCount : '')}
        </dd></div>
      )}
      {client?.lastTrainingDate && (
        <div><dt>Последнее занятие</dt><dd>{new Date(client.lastTrainingDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</dd></div>
      )}
      {wish && <div><dt>Пожелание клиента</dt><dd>{wish.text}</dd></div>}
      {(overview.error || wishes.error) && <div><dd role="status">Не удалось загрузить сведения о клиенте. Откройте карточку занятия ещё раз.</dd></div>}
    </dl>
  );
}

function EventReports({ event, onOpen }) {
  const participants = event.sessions?.length
    ? event.sessions
    : [{ row: event.clientRow }];
  return participants.map((p) => <EventReport key={p.row} event={event} participant={p} named={participants.length > 1} onOpen={onOpen} />);
}

function EventReport({ event, participant, named, onOpen }) {
  const row = participant.row;
  const journal = useData('workout.list', { clientRow: row }, [row]);
  const reports = (journal.data?.sessions || []).filter((s) => {
    const started = Date.parse(s.startedAt);
    return s.status === 'completed' && started >= Date.parse(event.startsAt) && started < Date.parse(event.endsAt);
  });
  const matching = participant.id ? reports.filter((s) => s.sourceBlockId === participant.id) : reports;
  const report = matching.length === 1 ? matching[0] : null;
  return (
    <div className="cal-detail__report">
      {report ? (
        <button type="button" className="button button--primary button--block" onClick={() => onOpen(row, { sessionId: report.id })}>
          Открыть отчёт{named && participant.name ? ' · ' + participant.name : ''}
        </button>
      ) : (
        <p className="small muted" role="status">Проведено · {journal.loading ? 'ищем отчёт…'
          : journal.error ? 'не удалось загрузить отчёт. Откройте карточку ещё раз.'
          : 'отчёт для этой записи не найден'}</p>
      )}
    </div>
  );
}

/**
 * Подписать записи занятием программы (FT-788, этап 4): неделя клиента
 * раскладывается тем же расчётом, что на «Тренировках», а записи берутся
 * с экрана — перенесённая пальцем запись сразу показывает новое занятие
 */
function withSessions(events, programs) {
  if (!programs || !Object.keys(programs).length) return events;
  const last = events.reduce((m, e) => (e.startsAt > m ? e.startsAt : m), '');
  const plans = {};
  Object.entries(programs).forEach(([row, p]) => {
    // Записи участника пары — и на его карточку, и на пару
    const mine = events.filter((e) => (String(e.clientRow) === row || (p.pair && Number(e.clientRow) === Number(p.pair))) && !e.cancelledCharged);
    const shown = new Set(mine.map((e) => e.id));
    const bookings = [...(p.weeks.bookings || []).filter((b) => !shown.has(b.id)), ...mine.map((e) => ({ id: e.id, at: e.startsAt }))];
    try {
      const plan = scheduledPlan({ blocks: p.blocks, sessions: [], month: p.month, cfg: { ...p.weeks, bookings }, until: last ? dayKey(new Date(last)) : '' });
      const queue = sessionQueue(p.blocks);
      const groups = new Map(queue.map((g) => [g[0].id, g]));
      (p.weeks.history || []).forEach((h) => sessionQueue(h.blocks || []).forEach((g) => { if (!groups.has(g[0].id)) groups.set(g[0].id, g); }));
      plans[row] = { row: Number(row), p, weeks: plan.weeks, groups, options: queue.map((g) => ({ id: g[0].id, title: g.map((b) => b.title).join(' + ') })) };
    } catch (_) { /* программа не разложилась — запись без подписи */ }
  });
  // Занятие одного человека на запись: что по плану и чем править неделю
  const sessionOf = (plan, e) => {
    const key = dayKey(new Date(e.startsAt));
    const week = plan.weeks.find((w) => w.start <= key && w.end >= key);
    const booked = week && (week.booked || []).find((b) => b.id === e.id);
    if (!week) return null;
    const slot = booked && week.layout.find((it) => it.day === booked.day);
    const g = slot && plan.groups.get(slot.id);
    const edit = booked && week.editable ? { row: plan.row, month: plan.p.month, rev: Number(plan.p.weeks.weekEditsRev) || 0, edits: plan.p.weeks.weekEdits || {},
      week: week.start, layout: week.layout, day: booked.day, options: plan.options } : null;
    return { id: g ? g[0].id : '', title: g ? g.map((b) => b.title).join(' + ') : '', short: g ? g[0].title : '', cardio: !!g && g.every((b) => b.cardio),
      name: plan.p.name || '', row: plan.row, edit };
  };
  return events.map((e) => {
    if (!e.clientRow) return e;
    const own = plans[String(e.clientRow)] ? [plans[String(e.clientRow)]] : [];
    const members = Object.values(plans).filter((x) => x.p.pair && Number(x.p.pair) === Number(e.clientRow));
    const list = [...own, ...members].map((x) => sessionOf(x, e)).filter(Boolean);
    if (!list.length) return e;
    const found = list.filter((x) => x.id);
    if (!found.length) return { ...e, session: null, sessions: list, sessionNone: true };
    // На плитке одной строкой; у пары — «Олег: B · Света: A»
    const pair = members.length > 0;
    const short = pair ? found.map((x) => `${x.name}: ${x.short}`).join(' · ') : found[0].short;
    return { ...e, session: { ...found[0], short, title: pair ? found.map((x) => `${x.name} — ${x.title}`).join(' · ') : found[0].title }, sessions: list };
  });
}

const labelOf = (e) => e.clientName || e.title || 'Без названия';
/** В узких колонках недели и месяца — только имя, как в Google на телефоне */
const shortLabelOf = (e) => labelOf(e).split(/\s+/)[0];

function eventClass(e) {
  return 'cal-event cal-event--' + eventKind(e)
    + (e.unpaid && !e.cancelledCharged ? ' cal-event--unpaid' : '')
    + (e.cancelledCharged ? ' cal-event--cancelled' : '')
    + (e.personal ? ' cal-event--personal' : '')
    + (e.done && !e.cancelledCharged ? ' cal-event--done' : '')
    + (e.moving ? ' cal-event--moving' : '');
}

/* ------------------------------------------------------------------------
   Жесты сетки: листание вбок, перенос удержанием, щипок
   ------------------------------------------------------------------------ */

/** Палец сдвинулся меньше — ещё не жест, а нажатие или удержание */
const SLOP = 8;
/** Удержание, после которого событие приподнимается (Google — около 300 мс) */
const LIFT_MS = 320;
/** Быстрый взмах листает, даже если протянули мало, px/мс */
const FLICK = 0.35;
/**
 * Пружина листания — как UIScrollView с постраничной прокруткой: без
 * перелёта (damping 1), доезжает примерно за 0,35–0,5 с и подхватывает скорость
 * пальца. До 19.10.2026 был CSS-переход 260 мс, а листание у края при
 * переносе события и стрелки сменяли экран одним кадром.
 */
const PAGE_SPRING = { damping: 1, response: 0.36 };
/** Полоса у края сетки: держим там событие — сетка листается сама */
const EDGE = 22;
const EDGE_MS = 600;

// iPhone отменяет прокрутку только слушателю touchmove, который уже был в
// момент касания. Поэтому он стоит на документе заранее, а блокировка
// включается, лишь когда событие приподнято.
let touchLock = false;
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('touchmove', (event) => {
    if (touchLock && event.cancelable) event.preventDefault();
  }, { passive: false });
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Один обработчик касаний на всю сетку — раньше их было три (лента, событие,
 * документ), они спорили за палец, и на телефоне перенос не срабатывал.
 *
 * api.current: width() и tracks() — что двигать при листании; onPage(dir);
 * canLift(target) и lift(target, x, y) → { move(x, y), drop(), cancel() };
 * необязательные pinchStart/pinchMove/pinchEnd.
 *
 * handle.current получает { page(dir), enter(dir) }: листнуть пружиной
 * (стрелки, клавиши, край при переносе) и «въехать» после прыжка на дату.
 *
 * Лента едет пружиной, и её можно поймать пальцем на лету — как в iOS:
 * жест продолжается с того места, где лента была, без рывка.
 *
 * Слушатели движения ставятся и на сам элемент под пальцем: если при
 * листании во время переноса он уйдёт из разметки, касание всё равно
 * доходит до него, а до сетки — уже нет.
 */
function useCalendarGestures(rootRef, api, handle) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let g = null;
    let pinching = false;
    let last = null;
    let pos = 0; // где лента сейчас, px от покоя
    let anim = null; // { stop(), dir } — пружина в пути

    const setX = (x) => {
      pos = x;
      api.current.tracks().forEach((el) => {
        if (!el) return;
        el.style.transition = 'none';
        el.style.setProperty('--dx', x + 'px');
      });
    };
    const stopAnim = () => {
      if (!anim) return;
      anim.stop();
      anim = null;
    };
    const commit = (dir) => {
      flushSync(() => api.current.onPage(dir));
      setX(0);
    };
    // Доехать до покоя (dir 0) или до соседнего экрана и сменить дату
    const go = (dir, velocity = 0) => {
      stopAnim();
      const to = -dir * api.current.width();
      if (reduceMotion()) { if (dir) commit(dir); else setX(0); return; }
      const run = spring({
        from: pos, to, velocity, ...PAGE_SPRING,
        onFrame: setX,
        onDone: () => { if (anim === run) anim = null; if (dir) commit(dir); },
      });
      anim = run;
      anim.dir = dir;
    };
    // Листнуть, пока прошлое листание ещё едет: прошлое засчитать сразу
    const page = (dir) => {
      if (anim && anim.dir) { const d = anim.dir; stopAnim(); commit(d); }
      go(dir);
    };
    // Прыжок на дату («Сегодня», выбор в календарике): новое уже на месте,
    // лента въезжает с той стороны, откуда пришли. Без проявления: сквозь
    // полупрозрачную ленту моргал рисунок темы
    const enter = (dir) => {
      stopAnim();
      if (!dir || reduceMotion()) { setX(0); return; }
      setX(dir * Math.min(120, api.current.width() * 0.3));
      go(0);
    };
    if (handle) handle.current = { page, enter };

    const detach = (cur) => {
      if (!cur || !cur.target) return;
      cur.target.removeEventListener('touchmove', move);
      cur.target.removeEventListener('touchend', end);
      cur.target.removeEventListener('touchcancel', end);
    };
    const abandon = () => {
      if (!g) return;
      clearTimeout(g.timer);
      detach(g);
      if (g.mode === 'drag') { touchLock = false; g.drag.cancel(); }
      if (g.mode === 'x') go(0);
      g = null;
    };

    function start(e) {
      if (e.target.closest?.('[data-draft-edge]')) return;
      // Поймали ленту на лету — продолжаем с того места, где она была
      const caught = !!anim;
      stopAnim();
      if (e.touches.length === 2 && api.current.pinchStart) {
        abandon();
        if (pos) go(0);
        pinching = true;
        api.current.pinchStart(e.touches);
        return;
      }
      if (e.touches.length !== 1 || pinching) { abandon(); return; }
      const t = e.touches[0];
      const target = e.target;
      const cur = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, mode: caught && pos ? 'x' : null, t: performance.now(), v: 0, dx: 0, base: pos, target, timer: null, drag: null };
      g = cur;
      if (!cur.mode && api.current.canLift && api.current.canLift(target)) {
        cur.timer = setTimeout(() => {
          if (g !== cur || cur.mode || pos) return;
          const session = api.current.lift(target, cur.x, cur.y);
          if (!session) return;
          cur.mode = 'drag';
          cur.drag = session;
          touchLock = true;
          buzz();
        }, LIFT_MS);
      }
      target.addEventListener('touchmove', move, { passive: false });
      target.addEventListener('touchend', end, { passive: false });
      target.addEventListener('touchcancel', end, { passive: false });
    }

    function move(e) {
      if (e === last) return;
      last = e;
      if (pinching) {
        if (e.touches.length >= 2) {
          if (e.cancelable) e.preventDefault();
          api.current.pinchMove(e.touches);
        }
        return;
      }
      const cur = g;
      if (!cur) return;
      const t = e.touches[0];
      cur.x = t.clientX;
      cur.y = t.clientY;
      if (cur.mode === 'drag') {
        if (e.cancelable) e.preventDefault();
        cur.drag.move(cur.x, cur.y);
        return;
      }
      const dx = cur.x - cur.x0;
      const dy = cur.y - cur.y0;
      if (!cur.mode) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        clearTimeout(cur.timer);
        cur.mode = api.current.width && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        // Лента идёт от пальца без скачка на порог в 8 px
        if (cur.mode === 'x') cur.x0 += Math.sign(dx) * SLOP;
      }
      if (cur.mode !== 'x') return;
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const w = api.current.width();
      const raw = cur.base + (cur.x - cur.x0);
      // Дальше соседнего экрана ленты нет — там резина, как у края списка в iOS
      const over = Math.abs(raw) - w;
      const next = over > 0 ? Math.sign(raw) * (w + rubberband(over, w)) : raw;
      cur.v = (next - pos) / Math.max(1, now - cur.t);
      cur.t = now;
      setX(next);
    }

    function end(e) {
      if (e === last) return;
      last = e;
      if (pinching) {
        if (e.touches.length) return;
        pinching = false;
        api.current.pinchEnd();
        return;
      }
      const cur = g;
      if (!cur || e.touches.length) return;
      g = null;
      detach(cur);
      clearTimeout(cur.timer);
      if (cur.mode === 'drag') {
        touchLock = false;
        // Без нажатия после отпускания: иначе открылась бы форма события
        if (e.cancelable) e.preventDefault();
        if (e.type === 'touchcancel') cur.drag.cancel(); else cur.drag.drop();
        return;
      }
      if (cur.mode === 'x') {
        const w = api.current.width();
        // Палец давно стоит — скорости нет, решает только где отпустили
        const v = performance.now() - cur.t > 80 ? 0 : cur.v;
        // Взмах решает направление; взмах назад отменяет листание, как в iOS
        let dir = 0;
        if (Math.abs(v) > FLICK) dir = !pos || Math.sign(v) === Math.sign(pos) ? (v < 0 ? 1 : -1) : 0;
        else if (Math.abs(pos) > w * 0.4) dir = pos < 0 ? 1 : -1;
        go(dir, v * 1000);
      } else if (pos) {
        go(0);
      }
    }

    // Мышь: перенос сразу, без удержания — как в Google на компьютере
    function down(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest?.('[data-draft-edge]')) return;
      if (!api.current.canLift || !api.current.canLift(e.target)) return;
      const m = { x0: e.clientX, y0: e.clientY, target: e.target, drag: null };
      const mm = (ev) => {
        if (!m.drag) {
          if (Math.hypot(ev.clientX - m.x0, ev.clientY - m.y0) < 5) return;
          m.drag = api.current.lift(m.target, m.x0, m.y0);
          if (!m.drag) { up(); return; }
        }
        m.drag.move(ev.clientX, ev.clientY);
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', mm);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!m.drag) return;
        if (ev && ev.type === 'pointerup') m.drag.drop(); else m.drag.cancel();
        // Отпустили над событием — следом придёт нажатие, оно не должно открыть форму
        const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
        root.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => root.removeEventListener('click', stop, { capture: true }), 0);
      };
      window.addEventListener('pointermove', mm);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    // Долгое нажатие на Android открывает меню и выделение — не здесь
    const menuOff = (e) => e.preventDefault();

    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('touchmove', move, { passive: false });
    root.addEventListener('touchend', end, { passive: false });
    root.addEventListener('touchcancel', end, { passive: false });
    root.addEventListener('pointerdown', down);
    root.addEventListener('contextmenu', menuOff);
    return () => {
      abandon();
      stopAnim();
      touchLock = false;
      if (handle) handle.current = null;
      root.removeEventListener('touchstart', start);
      root.removeEventListener('touchmove', move);
      root.removeEventListener('touchend', end);
      root.removeEventListener('touchcancel', end);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('contextmenu', menuOff);
    };
  }, []);
}

/**
 * Пока событие тянут: у верхнего и нижнего края сетка прокручивается сама,
 * у левого и правого — перелистывается на экран (как в Google).
 */
function edgeLoop({ scroller, viewport, point, onFrame, onEdge }) {
  let raf = 0;
  let edgeDir = 0;
  let edgeTimer = null;
  const frame = () => {
    const p = point();
    const sc = scroller && scroller();
    if (sc) {
      const r = sc.getBoundingClientRect();
      const zone = 56;
      let dy = 0;
      if (p.y < r.top + zone) dy = -(r.top + zone - p.y) / 4;
      else if (p.y > r.bottom - zone) dy = (p.y - (r.bottom - zone)) / 4;
      if (dy) sc.scrollTop += Math.max(-16, Math.min(16, dy));
    }
    const vp = viewport().getBoundingClientRect();
    const edge = p.x < vp.left + EDGE ? -1 : p.x > vp.right - EDGE ? 1 : 0;
    if (edge !== edgeDir) {
      edgeDir = edge;
      clearTimeout(edgeTimer);
      if (edge) {
        const flip = () => { onEdge(edgeDir); buzz(); edgeTimer = setTimeout(flip, 900); };
        edgeTimer = setTimeout(flip, EDGE_MS);
      }
    }
    onFrame();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); clearTimeout(edgeTimer); };
}

/**
 * Раскладка пересекающихся занятий бок о бок, как в Google: жадно по
 * колонкам внутри группы пересечений; ширина — доля от числа колонок группы.
 */
function layoutDay(list, day) {
  const next = addDays(day, 1);
  const items = list
    .map((e) => ({ e, s: Math.max(Date.parse(e.startsAt), +day), f: Math.min(Date.parse(e.endsAt), +next) }))
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

const eventTime = (event) => isLegacyAllDay(event)
  ? 'Весь день'
  : bookingTime(new Date(event.startsAt), new Date(event.endsAt));

function eventDays(event) {
  const legacy = isLegacyAllDay(event);
  const keyFor = (time) => legacy ? new Date(time).toISOString().slice(0, 10) : dateValue(new Date(time));
  const first = keyDate(keyFor(event.startsAt));
  const last = keyFor(Date.parse(event.endsAt) - 1);
  const days = [dateValue(first)];
  for (let i = 1; i < 16; i += 1) {
    const key = dateValue(addDays(first, i));
    if (key > last) break;
    days.push(key);
  }
  return days;
}


function dayDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours && hours + ' ч', (rest || !hours) && rest + ' мин'].filter(Boolean).join(' ');
}

function windowTime(window, day) {
  return hm(window.start) + '–' + (window.end === +addDays(day, 1) ? '24:00' : hm(window.end));
}

function DaySummary({ summary, day, onWindow, onEvent }) {
  const [showUnpaid, setShowUnpaid] = useState(false);
  const { count, minutes, unpaid, windows: [next] } = summary;
  const form = new Intl.PluralRules('ru').select(count);
  const unit = { one: 'занятие', few: 'занятия', many: 'занятий' }[form];

  return (
    <div className="cal-day-summary" aria-label="Сводка дня">
      <strong>{count} {unit} · {dayDuration(minutes)}</strong>
      <div className="cal-day-summary__actions">
        {next ? (
          <button type="button" onClick={() => onWindow(next)} aria-label={'Ближайшее окно ' + windowTime(next, day)}>
            Окно {windowTime(next, day)}
          </button>
        ) : <span>Нет доступных окон от 1 ч</span>}
        {unpaid.length > 0 && (
          <button type="button" className="cal-day-summary__unpaid" onClick={() => {
            if (unpaid.length === 1) onEvent(unpaid[0]);
            else setShowUnpaid(true);
          }}>₽ {unpaid.length} не оплачено</button>
        )}
      </div>
      {showUnpaid && (
        <Sheet title="Неоплаченные занятия" onClose={() => setShowUnpaid(false)}>
          <div className="cal-day-unpaid">
            {unpaid.map((event) => (
              <button type="button" className="button" key={event.id} onClick={() => {
                setShowUnpaid(false);
                onEvent(event);
              }}>{eventTime(event)} · {labelOf(event)}</button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

/**
 * Сетка по часам на 1, 3 или 7 дней — как в Google Календаре.
 *
 * Колонки дней лежат лентой: экран и по экрану с каждой стороны, уже с
 * занятиями. Смахивание двигает ленту (шапку дней, строку «весь день» и
 * колонки), колонка часов стоит на месте; отпустили — лента доезжает до
 * соседнего экрана целиком, прокрутка по часам остаётся.
 */
function TimeGrid({ start, days, events, scrollKey, pager, draft, draftOpen, dayReady, onDay, onEvent, onCreate, onShift, onDrop, onResize }) {
  const root = useRef(null);
  const ownPager = useRef(null);
  const handle = pager || ownPager;
  const settleTimer = useRef(null);
  const scroller = useRef(null);
  const viewport = useRef(null);
  const headTrack = useRef(null);
  const allTrack = useRef(null);
  const bodyTrack = useRef(null);
  const resize = useRef(null);
  const [now, setNow] = useState(() => new Date());
  // Приподнятое событие: { id, key, minutes, duration, left, width, settle } —
  // рисуется слоем над лентой, чтобы при листании у края оставаться под пальцем
  const [ghost, setGhost] = useState(null);
  // Высота часа — щипком; время между пальцами остаётся на месте
  const [hour, setHour] = useState(savedHour);
  const pinch = useRef(null);
  const keepScroll = useRef(null);

  // Лента: экран до, экран, экран после
  const strip = Array.from({ length: days * 3 }, (_, i) => addDays(start, i - days));
  const visibleDays = strip.slice(days, days * 2);
  const timed = events.filter((e) => !isAllDay(e));
  const allDay = events.filter(isAllDay);
  const allDayOf = (d) => allDay.filter((e) => eventDays(e).includes(dateValue(d)));
  const hasAllDay = visibleDays.some((d) => allDayOf(d).length);
  const summaries = days === 1 && dayReady
    ? strip.map((d) => dayOverview(events, d, now))
    : [];
  const openWindow = (window) => {
    touched();
    onCreate({ start: window.start });
  };

  const byDay = new Map();
  timed.forEach((e) => eventDays(e).forEach((key) => {
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }));

  // Открываем с самого раннего занятия на экране (на полчаса раньше), без
  // занятий — с утра (30.09.2026). Только при открытии, смене вида,
  // «Сегодня» и выборе даты — листание прокрутку не трогает
  const visibleEvents = visibleDays.flatMap((d) => byDay.get(dateValue(d)) || []);
  const earliest = visibleEvents.reduce((m, e) => { const s = new Date(e.startsAt); return Math.min(m, s.getHours() * 60 + s.getMinutes()); }, FIRST_HOUR * 60);
  const placed = useRef(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const k = scrollKey + ':' + days;
    const p = placed.current;
    // Занятия пришли позже сетки — поставить ещё раз, если сетку не трогали
    if (p && p.k === k && (p.withData || p.touched || !visibleEvents.length)) return;
    el.scrollTop = Math.max(0, (earliest - 30) / 60 * hour);
    placed.current = { k, withData: visibleEvents.length > 0, touched: false };
  });
  const touched = () => { if (placed.current) placed.current.touched = true; };

  useLayoutEffect(() => {
    const el = scroller.current;
    const k = keepScroll.current;
    if (!el || !k) return;
    keepScroll.current = null;
    el.scrollTop = Math.max(0, (k.minute / 60) * hour - k.y);
  }, [hour]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => { clearInterval(t); clearTimeout(settleTimer.current); };
  }, []);

  const live = useRef(null);
  live.current = { days, hour, events, draft, onShift, onDrop };
  const api = useRef(null);
  api.current = {
    width: () => (viewport.current && viewport.current.offsetWidth) || 320,
    tracks: () => [headTrack.current, allTrack.current, bodyTrack.current],
    onPage: (dir) => live.current.onShift(dir),
    canLift: (target) => {
      const el = target.closest && target.closest('[data-cal-event]');
      return !!el && el.dataset.movable === '1';
    },
    lift: (target, x, y) => {
      const el = target.closest('[data-cal-event]');
      const id = el?.dataset.calEvent;
      const ev = id === DRAFT_ID ? live.current.draft : live.current.events.find((e) => e.id === id);
      if (!ev || (id !== DRAFT_ID && (!movable(ev) || isAllDay(ev))) || ev.moving) return null;
      touched();
      clearTimeout(settleTimer.current);
      const rect = el.getBoundingClientRect();
      const s0 = new Date(ev.startsAt);
      const home = { key: dateValue(s0), minutes: s0.getHours() * 60 + s0.getMinutes() };
      const duration = durationOf(ev);
      const grab = Math.max(0, Math.min(duration, ((y - rect.top) / live.current.hour) * 60));
      let point = { x, y };
      let spot = null;
      let at = null;
      // Колонка дня по ключу — где она сейчас на экране относительно окна ленты
      const place = (key) => {
        const body = bodyTrack.current;
        const vp = viewport.current;
        const col = body && [...body.children].find((c) => c.dataset.calDay === key);
        if (!col || !vp) return null;
        const r = col.getBoundingClientRect();
        return { left: Math.round(r.left - vp.getBoundingClientRect().left), width: Math.round(r.width) };
      };
      const locate = () => {
        const body = bodyTrack.current;
        const vp = viewport.current;
        if (!body || !vp) return;
        const v = vp.getBoundingClientRect();
        const cx = Math.max(v.left + 1, Math.min(v.right - 1, point.x));
        for (const col of body.children) {
          const r = col.getBoundingClientRect();
          if (cx >= r.left && cx < r.right) {
            const next = { key: col.dataset.calDay, minutes: dropMinutes(point.y - r.top, live.current.hour, grab, id === DRAFT_ID ? 15 : duration) };
            const pos = { left: Math.round(r.left - v.left), width: Math.round(r.width) };
            const moved = !spot || spot.key !== next.key || spot.minutes !== next.minutes;
            if (moved && spot) haptic('light');
            // Лента едет (листание у края) — колонка под пальцем тоже: копия
            // события едет вместе с ней, а не прыгает в конце
            if (moved || !at || at.left !== pos.left || at.width !== pos.width) {
              spot = next;
              at = pos;
              setGhost({ id: ev.id, duration, ...next, ...pos });
            }
            return;
          }
        }
      };
      // Отпустили: копия опускается на место (или возвращается домой) и
      // гаснет, под ней уже стоит само событие
      const settle = (to) => {
        const pos = to && place(to.key);
        setGhost((g) => (g ? { ...g, ...(to && pos ? { ...to, ...pos } : {}), settle: true } : g));
        settleTimer.current = setTimeout(() => setGhost(null), reduceMotion() ? 0 : 260);
      };
      locate();
      const stop = edgeLoop({
        scroller: () => scroller.current,
        viewport: () => viewport.current,
        point: () => point,
        onFrame: locate,
        // У края — листнуть той же пружиной, что и пальцем
        onEdge: (dir) => { if (handle.current) handle.current.page(dir); },
      });
      return {
        move: (nx, ny) => { point = { x: nx, y: ny }; },
        drop: () => {
          stop();
          if (!spot || (spot.key === home.key && spot.minutes === home.minutes)) { settle(home); return; }
          settle(null);
          const d = keyDate(spot.key);
          live.current.onDrop(ev, new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(spot.minutes / 60), spot.minutes % 60));
        },
        cancel: () => { stop(); settle(home); },
      };
    },
    pinchStart: (touches) => {
      if (!scroller.current) return;
      touched();
      const rect = scroller.current.getBoundingClientRect();
      const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
      const gap = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      pinch.current = { gap: Math.max(20, gap), hour: live.current.hour, y, minute: ((scroller.current.scrollTop + y) / live.current.hour) * 60 };
      // Пока щиплют — события за пальцами без плавного переезда
      if (root.current) root.current.classList.add('is-pinching');
    },
    pinchMove: (touches) => {
      const pz = pinch.current;
      if (!pz) return;
      const gap = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      const next = Math.round(Math.max(HOUR_MIN, Math.min(HOUR_MAX, pz.hour * (gap / pz.gap))));
      if (next !== live.current.hour) {
        keepScroll.current = { minute: pz.minute, y: pz.y };
        setHour(next);
      }
    },
    pinchEnd: () => {
      pinch.current = null;
      if (root.current) root.current.classList.remove('is-pinching');
      try { localStorage.setItem(HOUR_KEY, String(live.current.hour)); } catch (_) { /* не запомнили */ }
    },
  };
  useCalendarGestures(root, api, handle);

  const slot = (d, ev) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const minutes = Math.max(0, Math.min(Math.floor(((ev.clientY - rect.top) / hour) * 2) * 30, 23 * 60 + 30));
    touched();
    onCreate({ date: d, minutes });
  };
  const draftDate = draft && new Date(draft.startsAt);
  const draftMinute = draftDate && draftDate.getHours() * 60 + draftDate.getMinutes();
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || draftMinute == null || resize.current) return;
    const top = draftMinute / 60 * hour;
    const panel = draftOpen && document.querySelector('.cal-quick .sheet__panel');
    const visible = panel ? window.innerHeight - panel.offsetHeight - el.getBoundingClientRect().top : el.clientHeight;
    if (top < el.scrollTop || top > el.scrollTop + visible - hour) {
      el.scrollTop = Math.max(0, top - Math.min(hour, Math.max(0, visible - hour)));
    }
  }, [draftMinute, draftOpen]);

  const draftEnd = draft && new Date(draft.endsAt);
  const startResize = (ev, edge, day) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    const grid = root.current;
    grid.setPointerCapture(ev.pointerId);
    const fixed = edge === 'start' ? draftDate : draftEnd;
    const boundary = day.getTime() === +startOfDay(fixed) ? fixed : addDays(day, 1);
    const minutes = +boundary === +addDays(day, 1) ? 1440 : fixed.getHours() * 60 + fixed.getMinutes();
    const column = ev.currentTarget.closest('[data-cal-day]');
    resize.current = {
      id: ev.pointerId, edge, from: +draftDate, end: +draftEnd,
      offset: ev.clientY - column.getBoundingClientRect().top - minutes / 60 * hour,
    };
  };
  const moveResize = (ev) => {
    const state = resize.current;
    if (!state || state.id !== ev.pointerId) return;
    const column = [...bodyTrack.current.children].find((node) => {
      const rect = node.getBoundingClientRect();
      return ev.clientX >= rect.left && ev.clientX < rect.right;
    });
    if (!column) return;
    const rect = column.getBoundingClientRect();
    const minute = Math.min(1440, Math.max(0, 15 * Math.round((ev.clientY - rect.top - state.offset) / hour * 4)));
    const target = keyDate(column.dataset.calDay);
    target.setMinutes(minute);
    onResize(resizeBooking(state.edge, state.from, state.end, target.getTime()));
  };
  const endResize = (ev) => {
    const state = resize.current;
    if (state?.id !== ev.pointerId) return;
    resize.current = null;
    if (ev.type === 'pointercancel') onResize({ at: new Date(state.from), manualMinutes: (state.end - state.from) / 60000 });
  };
  const sizeKeys = (ev, edge) => {
    if (!['ArrowUp', 'ArrowDown'].includes(ev.key)) return;
    ev.preventDefault();
    const base = edge === 'start' ? +draftDate : +draftEnd;
    onResize(resizeBooking(edge, +draftDate, +draftEnd, base + (ev.key === 'ArrowDown' ? 15 : -15) * 60000));
  };

  return (
    // data-no-gestures: жесты приложения (листание вкладок, «назад»,
    // «потянуть вниз») над сеткой не работают — палец принадлежит календарю
    <div ref={root} className={'cal-grid cal-grid--' + days} data-no-gestures="" data-no-swipe=""
      onPointerMove={moveResize} onLostPointerCapture={endResize} onPointerCancel={endResize}>
      <div className="cal-grid__row cal-grid__head">
        <span className="cal-grid__gutter" />
        <div className="cal-grid__viewport" ref={viewport}>
          <div className="cal-grid__track" ref={headTrack} style={{ gridTemplateColumns: `repeat(${days * 3}, minmax(0, 1fr))` }}>
            {strip.map((d) => {
              const today = sameDay(d, now);
              const dots = dayDots([...(byDay.get(dateValue(d)) || []), ...allDayOf(d)]);
              return (
                <button type="button" key={d.getTime()} className={'cal-grid__day' + (today ? ' cal-grid__day--today' : '')} onClick={() => onDay(d)}
                  aria-label={weekdayOf(d) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + dayTypeLabels(dots)}>
                  <span>{weekdayOf(d)}</span>
                  <strong>{d.getDate()}</strong>
                  {/* Кто будет — точками типов событий, ещё до прокрутки */}
                  <i className="cal-grid__dots" aria-hidden="true">
                    {dots.map((kind) => <b key={kind} className={'cal-grid__dot cal-grid__dot--' + kind} />)}
                  </i>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {summaries[1] && <DaySummary key={+start} summary={summaries[1]} day={start} onWindow={openWindow} onEvent={onEvent} />}

      {hasAllDay && (
        <div className="cal-grid__row cal-grid__allday">
          <span className="cal-grid__gutter" />
          <div className="cal-grid__viewport">
            <div className="cal-grid__track" ref={allTrack} style={{ gridTemplateColumns: `repeat(${days * 3}, minmax(0, 1fr))` }}>
              {strip.map((d) => (
                <div key={d.getTime()} className="cal-grid__allcell">
                  {allDayOf(d).map((e) => (
                    <button type="button" key={e.id} data-event-color={e.color} className={eventClass(e) + ' cal-event--chip'} aria-label={eventAria(e, eventTime(e))} onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}>
                      <span className="cal-event__name">{labelOf(e)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="cal-grid__scroll" ref={scroller} onWheel={touched} onMouseDown={touched}>
        <div className="cal-grid__row" style={{ height: 24 * hour, '--hour': hour + 'px' }}>
          <div className="cal-grid__gutter cal-grid__hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * hour }}>{h ? pad(h) + ':00' : ''}</span>
            ))}
            {/* Время «сейчас» в колонке часов — когда сегодня на экране */}
            {visibleDays.some((d) => sameDay(d, now)) && (
              <b className="cal-grid__nowtime" style={{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * hour }}>{clock(now.getHours() * 60 + now.getMinutes())}</b>
            )}
          </div>
          <div className="cal-grid__viewport">
            <div className="cal-grid__track cal-grid__body" ref={bodyTrack}
              style={{ height: 24 * hour, gridTemplateColumns: `repeat(${days * 3}, minmax(0, 1fr))` }}>
              {strip.map((d, index) => {
                const key = dateValue(d);
                const ofDay = byDay.get(key) || [];
                const today = sameDay(d, now);
                const next = addDays(d, 1);
                const hasDraft = draftDate && draftDate < next && draftEnd > d;
                const startsHere = hasDraft && draftDate >= d;
                const endsHere = hasDraft && draftEnd <= next;
                const endMinute = endsHere && draftEnd < next ? draftEnd.getHours() * 60 + draftEnd.getMinutes() : 1440;
                return (
                  <div key={d.getTime()} className={'cal-grid__col' + (today ? ' cal-grid__col--today' : '')} data-cal-day={key}
                    onClick={(ev) => slot(d, ev)} role="presentation">
                    {summaries[index]?.windows.map((window) => {
                      const begin = new Date(window.start);
                      const end = new Date(window.end);
                      const from = begin.getHours() * 60 + begin.getMinutes();
                      const to = window.end === +next ? 1440 : end.getHours() * 60 + end.getMinutes();
                      const label = 'Свободно ' + dayDuration(window.minutes);
                      return (
                        <div className="cal-free-window" key={window.start}
                          style={{ top: from / 60 * hour, height: Math.max(0, (to - from) / 60 * hour - 2) }}>
                          <button type="button" tabIndex={index === 1 ? undefined : -1}
                            aria-label={label + ' · ' + windowTime(window, d)}
                            onClick={(ev) => { ev.stopPropagation(); openWindow(window); }}>
                            {label}
                          </button>
                        </div>
                      );
                    })}
                    {layoutDay(ofDay, d).map(({ e, s, f, col, cols }) => {
                      const from = new Date(s);
                      const top = (from.getHours() * 60 + from.getMinutes()) / 60 * hour;
                      const endMinute = f === +next ? 1440 : new Date(f).getHours() * 60 + new Date(f).getMinutes();
                      const height = Math.max(endMinute / 60 * hour - top - 2, 14);
                      const lifted = ghost && !ghost.settle && ghost.id === e.id;
                      const lines = eventLines(e, { height });
                      return (
                        <button
                          type="button"
                          key={e.id}
                          data-cal-event={e.id} data-event-color={e.color}
                          data-movable={movable(e) && !e.moving && s === Date.parse(e.startsAt) ? '1' : '0'}
                          className={eventClass(e) + (lifted ? ' is-lifted' : '')}
                          style={{ top, height, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)` }}
                          aria-label={eventAria(e, hm(e.startsAt) + '–' + hm(e.endsAt))}
                          onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}
                        >
                          {/* Неделя на телефоне — только имя, как в Google; на широком экране — целиком */}
                          {days === 7 && <span className="cal-event__name cal-event__short">{shortLabelOf(e)}</span>}
                          <span className={'cal-event__name' + (days === 7 ? ' cal-event__full' : '')}>{labelOf(e)}</span>
                          {/* Под именем — занятие программы, затем время, если хватает высоты. */}
                          {lines.session && <span key={e.session.id + e.startsAt} className="cal-event__sub">{lines.session}</span>}
                          {lines.time && <span className="cal-event__time">{hm(e.startsAt)}–{hm(e.endsAt)}</span>}
                          {e.unpaid && !e.cancelledCharged && <span className="cal-event__rub" aria-hidden="true">₽</span>}
                        </button>
                      );
                    })}
                    {hasDraft && !(ghost?.id === DRAFT_ID && !ghost.settle) && (
                      <div className="cal-draft" data-event-color={draft.color} data-compact={(endMinute - (startsHere ? draftMinute : 0)) / 60 * hour < 26} style={{
                        top: (startsHere ? draftMinute : 0) / 60 * hour,
                        height: Math.max((endMinute - (startsHere ? draftMinute : 0)) / 60 * hour - 2, 10),
                      }}>
                        <button type="button" className="cal-draft__open" data-cal-event={DRAFT_ID}
                          data-movable={startsHere ? '1' : '0'} aria-label={'Заготовка · ' + bookingTime(draftDate, draftEnd)}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onCreate({ date: startOfDay(draftDate), minutes: draftMinute });
                          }}>
                          <IconPlus size={14} /><span>{startsHere ? clock(draftMinute) : 'Продолжение'}</span>
                        </button>
                        {!draftOpen && [startsHere && 'start', endsHere && 'end'].filter(Boolean).map((edge) => (
                          <button key={edge} type="button" data-draft-edge={edge} className={'cal-draft__edge cal-draft__edge--' + edge}
                            aria-label={edge === 'start' ? 'Изменить начало заготовки' : 'Изменить окончание заготовки'}
                            onPointerDown={(ev) => startResize(ev, edge, d)} onKeyDown={(ev) => sizeKeys(ev, edge)}
                            onClick={(ev) => ev.stopPropagation()} />
                        ))}
                      </div>
                    )}
                    {today && (
                      <>
                        {/* Прошедшее сегодня чуть притушено — видно, что осталось */}
                        <span className="cal-grid__past" style={{ height: (now.getHours() * 60 + now.getMinutes()) / 60 * hour }} aria-hidden="true" />
                        <span className="cal-grid__now" style={{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * hour }} aria-hidden="true" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {ghost && (() => {
            const ev = ghost.id === DRAFT_ID ? draft : events.find((x) => x.id === ghost.id);
            const height = Math.max((Math.min(ghost.duration, 1440 - ghost.minutes) / 60) * hour - 2, 18);
            return (
              <div className="cal-grid__ghosts" aria-hidden="true">
                <div data-event-color={ev?.color} className={(ev ? eventClass(ev) : 'cal-event') + ' cal-event--ghost' + (ghost.settle ? ' cal-event--settle' : '')}
                  style={{ top: (ghost.minutes / 60) * hour, height, left: ghost.left + 1, width: ghost.width - 3 }}>
                  {days < 7 && ev && <span className="cal-event__name">{labelOf(ev)}</span>}
                  <span className="cal-event__time cal-event__time--strong">{clock(ghost.minutes)}{days < 7 ? '–' + clock(ghost.minutes + ghost.duration) : ''}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/**
 * Месяц: шесть недель на весь экран, листается вбок ровно на месяц — лента
 * из прошлого, текущего и следующего месяца, все уже с занятиями. Сколько
 * событий помещается в день — по высоте ячейки, остальное «ещё N».
 * Событие тоже переносится удержанием — в другой день, время то же.
 */
function MonthPager({ anchor, events, pager, onDay, onEvent, onShift, onDrop }) {
  const ownPager = useRef(null);
  const handle = pager || ownPager;
  const root = useRef(null);
  const track = useRef(null);
  const ghostEl = useRef(null);
  const [fit, setFit] = useState(3);
  const [hover, setHover] = useState(null);
  const [lifted, setLifted] = useState(null);
  const months = [-1, 0, 1].map((i) => new Date(anchor.getFullYear(), anchor.getMonth() + i, 1));
  const now = new Date();

  const byDay = useMemo(() => {
    const m = new Map();
    events.forEach((e) => eventDays(e).forEach((key) => {
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(e);
    }));
    m.forEach((list) => list.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))));
    return m;
  }, [events]);

  // Сколько строк-событий влезает в ячейку текущей высоты
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const cell = el.querySelector('.cal-month__page--current .cal-month__cell');
      if (!cell) return;
      setFit(Math.max(1, Math.floor((cell.clientHeight - 24) / 17)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const live = useRef(null);
  live.current = { events, onShift, onDrop };
  const api = useRef(null);
  api.current = {
    width: () => (root.current && root.current.offsetWidth) || 320,
    tracks: () => [track.current],
    onPage: (dir) => live.current.onShift(dir),
    canLift: (target) => {
      const el = target.closest && target.closest('[data-cal-event]');
      return !!el && el.dataset.movable === '1';
    },
    lift: (target, x, y) => {
      const el = target.closest('[data-cal-event]');
      const ev = el && live.current.events.find((e) => e.id === el.dataset.calEvent);
      if (!ev || !movable(ev) || ev.moving) return null;
      let point = { x, y };
      let key = null;
      setLifted({ id: ev.id, label: shortLabelOf(ev) + ' ' + hm(ev.startsAt) });
      const place = () => {
        const g = ghostEl.current;
        if (g) g.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -120%)`;
        const hit = document.elementFromPoint(point.x, point.y);
        const cell = hit && hit.closest && hit.closest('.cal-month__page--current [data-cal-day]');
        const next = cell ? cell.dataset.calDay : key;
        if (next !== key) { key = next; setHover(next); haptic('light'); }
      };
      place();
      const stop = edgeLoop({
        viewport: () => root.current,
        point: () => point,
        onFrame: place,
        onEdge: (dir) => { if (handle.current) handle.current.page(dir); },
      });
      const end = () => { stop(); setHover(null); setLifted(null); };
      return {
        move: (nx, ny) => { point = { x: nx, y: ny }; },
        drop: () => { end(); if (key) live.current.onDrop(ev, sameTimeOn(ev.startsAt, keyDate(key))); },
        cancel: end,
      };
    },
  };
  useCalendarGestures(root, api, handle);

  return (
    <div className="cal-month" data-no-gestures="" data-no-swipe="">
      <div className="cal-month__head">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="cal-month__viewport" ref={root}>
        <div className="cal-month__track" ref={track}>
          {months.map((first, i) => {
            const cells = Array.from({ length: 42 }, (_, j) => addDays(mondayOf(first), j));
            return (
              <div key={first.getTime()}
                className={'cal-month__page' + (i === 1 ? ' cal-month__page--current' : '')} aria-hidden={i !== 1 || undefined}>
                {cells.map((d) => {
                  const k = dateValue(d);
                  const list = byDay.get(k) || [];
                  const shown = list.length > fit ? Math.max(0, fit - 1) : list.length;
                  const other = d.getMonth() !== first.getMonth();
                  return (
                    <div
                      key={d.getTime()}
                      data-cal-day={k}
                      className={'cal-month__cell' + (other ? ' cal-month__cell--other' : '') + (sameDay(d, now) ? ' cal-month__cell--today' : '') + (hover === k ? ' cal-month__cell--drop' : '')}
                      onClick={() => onDay(d)}
                      role="button"
                      tabIndex={i === 1 ? 0 : -1}
                      aria-label={d.getDate() + ' ' + MONTHS[d.getMonth()] + (list.length ? ', событий: ' + list.length : '')}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') onDay(d); }}
                    >
                      <span className="cal-month__date">{d.getDate()}</span>
                      {list.slice(0, shown).map((e) => (
                        <button type="button" key={e.id} data-cal-event={e.id} data-event-color={e.color} data-movable={movable(e) && !e.moving ? '1' : '0'}
                          className={eventClass(e) + ' cal-event--chip' + (lifted && lifted.id === e.id ? ' is-lifted' : '')}
                          aria-label={eventAria(e, eventTime(e))} tabIndex={i === 1 ? 0 : -1}
                          onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}>
                          <span className="cal-event__name">{shortLabelOf(e)}</span>
                          {e.unpaid && !e.cancelledCharged && <span className="cal-event__rub" aria-hidden="true">₽</span>}
                        </button>
                      ))}
                      {list.length > shown && <span className="cal-month__more">ещё {list.length - shown}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {lifted && createPortal(
        <div ref={ghostEl} className="cal-event cal-event--chip cal-month__ghost" aria-hidden="true">{lifted.label}</div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Список, как «Расписание» в Google: дни подряд, в дне — занятия по
 * времени. Пустые дни не показываем, сегодня — всегда, даже пустое.
 */
function Agenda({ start, days, events, loading, onEvent, onDay, onMore }) {
  const now = new Date();
  const list = [];
  for (let i = 0; i < days; i += 1) {
    const d = addDays(start, i);
    const k = dateValue(d);
    const ofDay = events
      .filter((e) => eventDays(e).includes(k))
      .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
    if (ofDay.length || sameDay(d, now) || i === 0) list.push({ d, ofDay });
  }
  const empty = !list.some((x) => x.ofDay.length);
  return (
    <div className="cal-agenda">
      {list.map(({ d, ofDay }) => {
        const today = sameDay(d, now);
        return (
          <section key={d.getTime()} className={'cal-agenda__day' + (today ? ' cal-agenda__day--today' : '')}>
            <button type="button" className="cal-agenda__date" onClick={() => onDay(d)}
              aria-label={'Открыть ' + d.getDate() + ' ' + MONTHS[d.getMonth()]}>
              <span>{weekdayOf(d)}</span>
              <strong>{d.getDate()}</strong>
            </button>
            <div className="cal-agenda__items">
              {!ofDay.length && (
                <p className="cal-agenda__empty">
                  {loading ? 'Загружаем…' : empty ? 'Занятий нет до ' + addDays(start, days - 1).getDate() + ' ' + MONTHS[addDays(start, days - 1).getMonth()] : today ? 'Сегодня занятий нет' : 'Занятий нет'}
                </p>
              )}
              {ofDay.map((e) => (
                <button type="button" key={e.id} data-event-color={e.color} className={eventClass(e) + ' cal-agenda__item'} aria-label={eventAria(e, eventTime(e))} onClick={() => onEvent(e)}>
                  <span className="cal-event__name">{labelOf(e)}</span>
                  {e.session?.title && <span className="cal-event__sub">{e.session.title}</span>}
                  <span className="cal-event__time">
                    {eventTime(e)}
                    {e.cancelledCharged ? ' · отменено, списано' : e.personal ? ' · личное' : ''}
                  </span>
                  {e.unpaid && !e.cancelledCharged && <span className="cal-event__rub" aria-hidden="true">₽</span>}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button type="button" className="button button--ghost cal-agenda__more" onClick={onMore}>
        Показать дальше — до {addDays(start, days + 27).getDate()} {MONTHS[addDays(start, days + 27).getMonth()]}
      </button>
    </div>
  );
}

function SeriesScope({ value, onChange, disabled }) {
  return <Options items={[{ value: 'one', label: 'Только это' }, { value: 'following', label: 'Это и следующие' }]}
    value={value} label="Применить к записям" onChange={onChange} disabled={disabled} />;
}

/** Создать, перенести или удалить занятие либо личное событие */
function EventForm({ event, mode, preset, clients, onDone, onCancel, confirm = null, onDirty, repeatSupported, requestIdFor }) {
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
  const [step, setStep] = useState(mode === 'cancel' ? 'cancel' : null);
  const [change, setChange] = useState('');
  const [who, setWho] = useState(event.personal ? 'error' : '');
  const [scope, setScope] = useState('one');
  const [repeat, setRepeat] = useState(!!(event.weekly || event.repeat));
  const [color, setColor] = useState(event.color ?? null);
  const [until, setUntil] = useState(event.weekly?.until || event.until || '');
  const [charge, setCharge] = useState(null); // null — по умолчанию (поздняя → да)
  const [reason, setReason] = useState('');
  // Есть ли что терять при выходе — против значений, с которыми открыли
  const snapshot = JSON.stringify([clientRow, kind, title, date, time, minutes, change, who, charge, reason, scope, repeat, until, color]);
  const [initial] = useState(snapshot);
  const dirty = mode !== 'cancel' && snapshot !== initial;
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty]);

  const active = clients.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const editTime = mode === 'edit';
  const timeChanged = date !== dateValue(start) || time !== hm(start);
  const startsAt = !event.id || timeChanged ? new Date(`${date}T${time}`) : start;
  // Время поменялось — перенос или исправление: спросим, какое из двух
  const moved = !!event.id && startsAt.getTime() !== start.getTime();
  const personal = kind === 'personal';
  // Поздняя отмена — меньше чем за сутки до начала
  const late = !!event.id && start.getTime() - Date.now() < LATE_HOURS * 3600000;
  const canScope = !!event.weekly && !event.done && !event.cancelledCharged && start > new Date();
  const showRepeat = mode === 'edit' && (event.id ? canScope && scope === 'following' : repeatSupported);
  const repeatInvalid = showRepeat && repeat && (startsAt <= new Date() || (until && until < date));
  const charged = who === 'client' && (charge === null ? late : charge);

  const run = async (fn) => {
    setBusy(true);
    setFailure(null);
    try {
      const res = await fn();
      haptic('success');
      onDone(res);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => {
    const payload = {
      ...(event.id ? { id: event.id } : {}),
      personal,
      ...(personal ? { title: title.trim() } : { clientRow: Number(clientRow) }),
      startsAt: startsAt.toISOString(),
      minutes: Number(minutes), color,
      ...(moved && !personal ? { change, reason } : {}),
      ...(canScope && scope === 'following' ? { scope, ...(!repeat ? { stopRepeat: true } : {}) } : {}),
      ...(showRepeat && repeat ? { repeat: { until: until || null, timeZone: event.weekly?.timeZone || weeklyPayload(until).timeZone } } : {}),
    };
    return apiMutate('trainer.schedule.save', { ...payload, ...(!event.id && payload.repeat ? { requestId: requestIdFor(payload) } : {}) });
  });

  const remove = () => run(() => apiMutate('trainer.schedule.delete', {
    id: event.id, who, reason, ...(canScope && scope === 'following' ? { scope } : {}), ...(charged ? { charge: true } : {}),
  }));

  return (
    <>
      <BackButton label={event.id || event.copyOf ? 'К занятию' : 'Расписание'} onClick={onCancel} />
      {confirm}
      <Panel pad>
        <div className="library__form">
          <strong>{mode === 'cancel' ? 'Отмена занятия'
            : event.id ? (personal ? 'Личное событие' : 'Занятие') : event.copyOf ? 'Копия события' : 'Новое событие'}</strong>
          {event.id && (
            <p className="small muted">{event.clientName || event.title} · {start.toLocaleString('ru-RU', {
              day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
            })}</p>
          )}
          {event.copyOf && (
            <p className="small muted" style={{ margin: 0 }}>Скопированы название или клиент, дата, время и длительность. Проверьте их и нажмите «Добавить».</p>
          )}
          {mode === 'edit' && (
            <>
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
            </>
          )}
          {editTime && (
            <div className="field-row schedule__when">
              <Field label="Дата" type="date" value={date} onChange={(v) => { setDate(v); setStep(null); }} />
              <Field label="Время" type="time" value={time} onChange={(v) => { setTime(v); setStep(null); }} />
            </div>
          )}
          {mode === 'edit' && <BookingDuration value={Number(minutes)} presets={DURATIONS}
            onChange={(value) => setMinutes(String(value))} disabled={busy || !!step} />}

          {mode === 'edit' && <BookingColor value={color} onChange={setColor} disabled={busy || !!step}
            preview={(personal ? title.trim() : active.find((client) => Number(client.row) === Number(clientRow))?.name) || 'Событие'} />}
          {canScope && <SeriesScope value={scope} onChange={setScope} disabled={busy} />}
          {showRepeat && <RepeatFields enabled={repeat} until={until} startsOn={date} disabled={busy}
            onToggle={setRepeat} onUntil={setUntil} />}
          {repeatInvalid && <Note tone="warning">Выберите будущее время и дату окончания не раньше начала.</Note>}

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

          {step === 'cancel' && !personal && (
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
                {busy ? 'Отменяем…' : who === 'error' ? 'Удалить запись' : charged ? 'Отменить и списать' : 'Отменить занятие'}
              </button>
              {/* «Отмена» без рамки сразу за главной — одно правило на всё приложение (аудит 24.10.2026) */}
              <button className="button button--ghost" disabled={busy} onClick={onCancel}>Не отменять занятие</button>
            </div>
          ) : (
            <div className="library__actions">
              <button
                className="button button--primary"
                disabled={busy || repeatInvalid || (personal ? !title.trim() : !clientRow) || (editTime && (!date || !time)) || (step === 'move' && !change)}
                onClick={() => (moved && !personal && step !== 'move' ? setStep('move') : save())}
              >
                {busy ? 'Сохраняем…' : event.id ? (moved && step !== 'move' ? 'Перенести…' : 'Сохранить') : 'Добавить'}
              </button>
              <button className="button button--ghost" disabled={busy} onClick={onCancel}>Отмена</button>
            </div>
          )}

        </div>
      </Panel>
    </>
  );
}
