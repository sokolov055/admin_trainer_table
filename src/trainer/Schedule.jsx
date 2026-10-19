import { useReturnScroll } from '../scroll.js';
import { useBackGesture, onPullRefresh } from '../gestures.jsx';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useData } from '../useData.js';
import { apiMutate, apiStale, onMutated } from '../api.js';
import { reloadWidgets } from '../native-widget.js';
import { haptic } from '../telegram.js';
import { Panel, Note, Field, Options, ErrorState } from '../ui.jsx';
import { IconAlert, IconBack, IconCheck, IconChevron, IconCopy, IconMenu, IconPlus } from '../icons.jsx';
import {
  addDays, dateValue, dropMinutes, durationOf, fetchRanges, mergeRange, mondayOf, movable, moveRequest,
  rangeOf, sameTimeOn, shifted, startOfDay,
} from './calendar-move.js';

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
 * статистика. Нажатие на пустое место ставит заготовку, второе — открывает
 * новое событие на это время.
 */

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

// onOpenClient(client, раздел) — к карточке клиента занятия (FT-567);
// onMenu — боковое меню приложения: шапки над календарём нет, кнопка в его строке
export default function Schedule({ onOpenClient = null, onMenu = null, active = true }) {
  const [view, setViewState] = useState(readView);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState(null); // null | {} — новое | событие
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
  const [agendaDays, setAgendaDays] = useState(28);
  useReturnScroll(!!editing);
  // Запись открыта поверх сетки: смахнуть вправо, Back Android и браузера —
  // к расписанию, как кнопка «Расписание» над формой (FT-567)
  useBackGesture(() => { setEditing(null); setPreset(null); }, !!editing);

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
      const { data, promise } = apiStale('trainer.schedule', { from: fromIso, to: toIso });
      // Сохранённое прежде — только для промежутка, который ещё не видели
      // свежим: после переноса оно старое и вернуло бы событие на старое место
      if (data && data.events && !loaded.current.has(key)) setCache((c) => mergeRange(c, fromIso, toIso, data.events));
      promise
        .then((fresh) => {
          loaded.current.add(key);
          setCache((c) => mergeRange(c, fromIso, toIso, fresh && fresh.events));
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

  const events = useMemo(() => [...cache.values()].map((e) => (moves[e.id] ? { ...e, ...moves[e.id], moving: true } : e)), [cache, moves]);

  function shift(dir) { setAnchor((a) => shifted(view, a, dir)); setPicker(false); haptic(); }
  function today() { setAnchor(startOfDay(new Date())); setScrollKey((k) => k + 1); setPicker(false); haptic(); }
  const jump = (d) => { setAnchor(startOfDay(d)); setScrollKey((k) => k + 1); setPicker(false); haptic(); };
  const openDay = (d) => { setAnchor(startOfDay(d)); setView('day'); };
  const openEvent = (e) => { if (!e.moving) { setEditing(e); haptic(); } };

  // Сочетания клавиш на компьютере — как в Google: ←/→, T — сегодня, D/X/W/M/A — вид
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (!active || editing || ask || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('.drawer--open, [role="dialog"][aria-modal="true"]')) return;
    const k = String(e.key || '').toLowerCase();
    if (e.key === 'ArrowLeft' || k === 'k' || k === 'л') shift(-1);
    else if (e.key === 'ArrowRight' || k === 'j' || k === 'о') shift(1);
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
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

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
        onOpenClient={onOpenClient}
        onDone={() => { setEditing(null); setPreset(null); setTick((t) => t + 1); }}
        onCancel={() => { setEditing(null); setPreset(null); }}
      />
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
    setPreset(at);
    setEditing({});
    haptic();
  };

  const times = (event, next) => ({
    startsAt: next.toISOString(),
    endsAt: new Date(next.getTime() + durationOf(event) * 60000).toISOString(),
  });
  const forget = (id) => setMoves((m) => { const n = { ...m }; delete n[id]; return n; });

  // Сохранить перенос; на экране событие уже стоит на новом месте
  const commitMove = async (event, next, change) => {
    const at = times(event, next);
    setMoves((m) => ({ ...m, [event.id]: at }));
    setFailure(null);
    try {
      await apiMutate('trainer.schedule.save', moveRequest(event, next, change));
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
    if (next.getTime() === new Date(event.startsAt).getTime()) return;
    setUndo(null);
    if (event.personal) {
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

  const answer = (change) => {
    const a = ask;
    setAsk(null);
    if (!change) { forget(a.event.id); haptic(); return; }
    commitMove(a.event, a.next, change);
  };

  const title = titleOf(view, anchor, start, days);
  const viewLabel = (VIEWS.find((v) => v.value === view) || VIEWS[0]).label;
  const nowDate = new Date();

  return (
    <div className="cal-screen">
      <div className="cal-top">
        <button type="button" className="cal-top__title" aria-expanded={picker} aria-label={title + ', выбрать дату'}
          onClick={() => { setPicker((p) => !p); setMenu(false); haptic(); }}>
          <span>{title}</span>
          <IconChevron size={18} className={picker ? 'cal-top__chev cal-top__chev--open' : 'cal-top__chev'} />
        </button>
        <div className="cal-top__actions">
          <button type="button" className="icon-button cal-top__arrow" aria-label="Назад" onClick={() => shift(-1)}><IconBack size={18} /></button>
          <button type="button" className="icon-button cal-top__arrow cal-top__arrow--next" aria-label="Вперёд" onClick={() => shift(1)}><IconBack size={18} /></button>
          <button type="button" className="cal-today" aria-label="Сегодня" title="Сегодня (T)" onClick={today}>
            <span>{nowDate.getDate()}</span>
          </button>
          <div className="cal-viewpick">
            <button type="button" className="cal-viewpick__button" aria-haspopup="menu" aria-expanded={menu}
              onClick={() => { setMenu((m) => !m); setPicker(false); haptic(); }}>
              {viewLabel}<IconChevron size={16} />
            </button>
            {menu && (
              <>
                <div className="cal-viewpick__scrim" onClick={() => setMenu(false)} aria-hidden="true" />
                <div className="cal-viewpick__menu" role="menu" aria-label="Вид календаря">
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

      {picker && (
        <MiniMonth anchor={anchor} start={start} days={view === 'month' ? 0 : view === 'list' ? 1 : days} events={events}
          onPick={jump} />
      )}

      {failure && (
        <div className="cal-note">
          <Note tone="critical" icon={IconAlert}>Не удалось перенести: {failure.message || 'повторите ещё раз'}</Note>
        </div>
      )}
      {load.error && !events.length && (
        <div className="cal-note"><ErrorState error={load.error} onRetry={() => setTick((t) => t + 1)} /></div>
      )}

      <div className="cal-main">
        {view === 'month' ? (
          <MonthPager anchor={anchor} events={events} onDay={openDay} onEvent={openEvent} onShift={shift} onDrop={drop} />
        ) : view === 'list' ? (
          <Agenda start={start} days={agendaDays} events={events} loading={load.loading}
            onEvent={openEvent} onDay={openDay} onMore={() => setAgendaDays((n) => n + 28)} />
        ) : (
          <TimeGrid start={start} days={days} events={events} scrollKey={scrollKey}
            onDay={openDay} onEvent={openEvent} onCreate={create} onShift={shift} onDrop={drop} />
        )}
      </div>

      {/* Новое событие — плавающей кнопкой, как в Google: сетка занимает
          экран, а кнопка всегда под пальцем над нижним меню */}
      <button type="button" className="cal-fab" aria-label="Добавить событие" onClick={() => create()}><IconPlus size={24} /></button>

      {ask && <MoveAsk ask={ask} onAnswer={answer} />}
      {undo && typeof document !== 'undefined' && createPortal(
        <div className="undo-bar" role="status">
          <span>{undo.text}</span>
          <button type="button" className="button button--ghost" onClick={() => {
            const u = undo;
            setUndo(null);
            commitMove(u.event, u.back);
          }}>Вернуть</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Чей перенос. Сервер без ответа занятие не перенесёт: в статистику идут
 * переносы клиента и тренера отдельно, а исправление ошибки — никуда.
 */
function MoveAsk({ ask, onAnswer }) {
  const { event, next } = ask;
  const from = new Date(event.startsAt);
  useBackGesture(() => onAnswer(null), true);
  return createPortal(
    <div className="cal-sheet" role="dialog" aria-modal="true" aria-label="Перенос занятия">
      <div className="cal-sheet__scrim" onClick={() => onAnswer(null)} aria-hidden="true" />
      <div className="cal-sheet__panel">
        <strong className="cal-sheet__title">Перенести занятие?</strong>
        <p className="cal-sheet__text">
          {labelOf(event)}<br />
          <span className="muted">{whenShort(from)}</span> → <b>{whenShort(next)}</b>
        </p>
        <div className="cal-sheet__options">
          <button type="button" className="button button--primary" onClick={() => onAnswer('client')}>Попросил клиент</button>
          <button type="button" className="button" onClick={() => onAnswer('trainer')}>По моей инициативе</button>
          <button type="button" className="button" onClick={() => onAnswer('fix')}>Исправление — неверно записал</button>
          <button type="button" className="button button--ghost" onClick={() => onAnswer(null)}>Не переносить</button>
        </div>
      </div>
    </div>,
    document.body,
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
    events.forEach((e) => { if (!e.cancelledCharged) s.add(dateValue(new Date(e.startsAt))); });
    return s;
  }, [events]);
  const now = new Date();
  const end = addDays(start, days);
  const step = (n) => { setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1)); haptic(); };
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
      <div className="cal-mini__grid">
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
const labelOf = (e) => e.clientName || e.title || 'Без названия';
/** В узких колонках недели и месяца — только имя, как в Google на телефоне */
const shortLabelOf = (e) => labelOf(e).split(/\s+/)[0];

function eventClass(e) {
  return 'cal-event'
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
const PAGE_MS = 260;
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
 * Слушатели движения ставятся и на сам элемент под пальцем: если при
 * листании во время переноса он уйдёт из разметки, касание всё равно
 * доходит до него, а до сетки — уже нет.
 */
function useCalendarGestures(rootRef, api) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let g = null;
    let pinching = false;
    let settle = null;
    let last = null;

    const setX = (x, animate) => {
      api.current.tracks().forEach((el) => {
        if (!el) return;
        el.style.transition = animate && !reduceMotion() ? `transform ${PAGE_MS}ms cubic-bezier(0.23, 1, 0.32, 1)` : 'none';
        el.style.setProperty('--dx', x + 'px');
      });
    };
    const commitSettle = () => {
      if (!settle) return;
      const s = settle;
      settle = null;
      clearTimeout(s.timer);
      flushSync(() => api.current.onPage(s.dir));
      setX(0, false);
    };
    const page = (dir) => {
      setX(-dir * api.current.width(), true);
      settle = { dir, timer: setTimeout(commitSettle, reduceMotion() ? 0 : PAGE_MS) };
    };

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
      if (g.mode === 'x') setX(0, true);
      g = null;
    };

    function start(e) {
      commitSettle();
      if (e.touches.length === 2 && api.current.pinchStart) {
        abandon();
        pinching = true;
        api.current.pinchStart(e.touches);
        return;
      }
      if (e.touches.length !== 1 || pinching) { abandon(); return; }
      const t = e.touches[0];
      const target = e.target;
      const cur = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, mode: null, t: performance.now(), v: 0, dx: 0, target, timer: null, drag: null };
      g = cur;
      if (api.current.canLift && api.current.canLift(target)) {
        cur.timer = setTimeout(() => {
          if (g !== cur || cur.mode) return;
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
      }
      if (cur.mode !== 'x') return;
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      cur.v = (dx - cur.dx) / Math.max(1, now - cur.t);
      cur.t = now;
      cur.dx = dx;
      setX(dx, false);
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
        let dir = 0;
        if (Math.abs(cur.dx) > w * 0.25) dir = cur.dx < 0 ? 1 : -1;
        else if (Math.abs(cur.v) > FLICK && Math.abs(cur.dx) > 24 && Math.sign(cur.v) === Math.sign(cur.dx)) dir = cur.v < 0 ? 1 : -1;
        if (dir) page(dir); else setX(0, true);
      }
    }

    // Мышь: перенос сразу, без удержания — как в Google на компьютере
    function down(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
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
      if (settle) { clearTimeout(settle.timer); settle = null; }
      touchLock = false;
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

/** Событие на весь день (день рождения, отпуск) приходит сутками и больше.
 *  В сетку по часам его не ставим, а показываем строкой под датами */
const isAllDay = (e) => new Date(e.endsAt) - new Date(e.startsAt) >= 20 * 3600000;

/**
 * Сетка по часам на 1, 3 или 7 дней — как в Google Календаре.
 *
 * Колонки дней лежат лентой: экран и по экрану с каждой стороны, уже с
 * занятиями. Смахивание двигает ленту (шапку дней, строку «весь день» и
 * колонки), колонка часов стоит на месте; отпустили — лента доезжает до
 * соседнего экрана целиком, прокрутка по часам остаётся.
 */
function TimeGrid({ start, days, events, scrollKey, onDay, onEvent, onCreate, onShift, onDrop }) {
  const root = useRef(null);
  const scroller = useRef(null);
  const viewport = useRef(null);
  const headTrack = useRef(null);
  const allTrack = useRef(null);
  const bodyTrack = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const [ghost, setGhost] = useState(null); // приподнятое событие: { id, key, minutes, duration }
  const [draft, setDraft] = useState(null); // заготовка нового: { key, minutes }
  // Высота часа — щипком; время между пальцами остаётся на месте
  const [hour, setHour] = useState(savedHour);
  const pinch = useRef(null);
  const keepScroll = useRef(null);

  // Лента: экран до, экран, экран после
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
  const hasAllDay = visibleDays.some((d) => allDayOf(d).length);

  const byDay = useMemo(() => {
    const m = new Map();
    timed.forEach((e) => {
      const k = dateValue(new Date(e.startsAt));
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    });
    return m;
  }, [events]);

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
    return () => clearInterval(t);
  }, []);
  // Пролистали или сменили вид — заготовка нового события уходит
  useEffect(() => { setDraft(null); }, [start.getTime(), days]);

  const live = useRef(null);
  live.current = { days, hour, events, onShift, onDrop };
  const api = useRef(null);
  api.current = {
    width: () => (viewport.current && viewport.current.offsetWidth) || 320,
    tracks: () => [headTrack.current, allTrack.current, bodyTrack.current],
    onPage: (dir) => { live.current.onShift(dir); setDraft(null); },
    canLift: (target) => {
      const el = target.closest && target.closest('[data-cal-event]');
      return !!el && el.dataset.movable === '1';
    },
    lift: (target, x, y) => {
      const el = target.closest('[data-cal-event]');
      const ev = el && live.current.events.find((e) => e.id === el.dataset.calEvent);
      if (!ev || !movable(ev) || isAllDay(ev) || ev.moving) return null;
      setDraft(null);
      touched();
      const rect = el.getBoundingClientRect();
      const duration = durationOf(ev);
      const grab = Math.max(0, Math.min(duration, ((y - rect.top) / live.current.hour) * 60));
      let point = { x, y };
      let spot = null;
      const locate = () => {
        const body = bodyTrack.current;
        const vp = viewport.current;
        if (!body || !vp) return;
        const v = vp.getBoundingClientRect();
        const cx = Math.max(v.left + 1, Math.min(v.right - 1, point.x));
        for (const col of body.children) {
          const r = col.getBoundingClientRect();
          if (cx >= r.left && cx < r.right) {
            const next = { key: col.dataset.calDay, minutes: dropMinutes(point.y - r.top, live.current.hour, grab, duration) };
            if (!spot || spot.key !== next.key || spot.minutes !== next.minutes) {
              if (spot) haptic('light');
              spot = next;
              setGhost({ id: ev.id, duration, ...next });
            }
            return;
          }
        }
      };
      locate();
      const stop = edgeLoop({
        scroller: () => scroller.current,
        viewport: () => viewport.current,
        point: () => point,
        onFrame: locate,
        onEdge: (dir) => flushSync(() => live.current.onShift(dir)),
      });
      return {
        move: (nx, ny) => { point = { x: nx, y: ny }; },
        drop: () => {
          stop();
          setGhost(null);
          if (!spot) return;
          const d = keyDate(spot.key);
          live.current.onDrop(ev, new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(spot.minutes / 60), spot.minutes % 60));
        },
        cancel: () => { stop(); setGhost(null); },
      };
    },
    pinchStart: (touches) => {
      if (!scroller.current) return;
      touched();
      const rect = scroller.current.getBoundingClientRect();
      const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
      const gap = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      pinch.current = { gap: Math.max(20, gap), hour: live.current.hour, y, minute: ((scroller.current.scrollTop + y) / live.current.hour) * 60 };
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
      try { localStorage.setItem(HOUR_KEY, String(live.current.hour)); } catch (_) { /* не запомнили */ }
    },
  };
  useCalendarGestures(root, api);

  // Нажатие на пустое место: первое ставит заготовку на 15-минутку под
  // пальцем (с округлением до получаса вниз), второе по ней — новое событие
  const slot = (d, ev) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const minutes = Math.max(0, Math.min(Math.floor(((ev.clientY - rect.top) / hour) * 2) * 30, 23 * 60));
    const key = dateValue(d);
    touched();
    if (draft && draft.key === key && draft.minutes === minutes) { onCreate({ date: d, minutes }); return; }
    setDraft({ key, minutes });
    haptic();
  };

  return (
    // data-no-gestures: жесты приложения (листание вкладок, «назад»,
    // «потянуть вниз») над сеткой не работают — палец принадлежит календарю
    <div ref={root} className={'cal-grid cal-grid--' + days} data-no-gestures="" data-no-swipe="">
      <div className="cal-grid__row cal-grid__head">
        <span className="cal-grid__gutter" />
        <div className="cal-grid__viewport" ref={viewport}>
          <div className="cal-grid__track" ref={headTrack} style={{ gridTemplateColumns: `repeat(${days * 3}, minmax(0, 1fr))` }}>
            {strip.map((d) => {
              const today = sameDay(d, now);
              return (
                <button type="button" key={d.getTime()} className={'cal-grid__day' + (today ? ' cal-grid__day--today' : '')} onClick={() => onDay(d)}
                  aria-label={weekdayOf(d) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]}>
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
            <div className="cal-grid__track" ref={allTrack} style={{ gridTemplateColumns: `repeat(${days * 3}, minmax(0, 1fr))` }}>
              {strip.map((d) => (
                <div key={d.getTime()} className="cal-grid__allcell">
                  {allDayOf(d).map((e) => (
                    <button type="button" key={e.id} className={eventClass(e) + ' cal-event--chip'} onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}>
                      {labelOf(e)}
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
          </div>
          <div className="cal-grid__viewport">
            <div className="cal-grid__track cal-grid__body" ref={bodyTrack}
              style={{ height: 24 * hour, gridTemplateColumns: `repeat(${days * 3}, minmax(0, 1fr))` }}>
              {strip.map((d) => {
                const key = dateValue(d);
                const ofDay = byDay.get(key) || [];
                const today = sameDay(d, now);
                return (
                  <div key={d.getTime()} className={'cal-grid__col' + (today ? ' cal-grid__col--today' : '')} data-cal-day={key}
                    onClick={(ev) => slot(d, ev)} role="presentation">
                    {layoutDay(ofDay).map(({ e, s, f, col, cols }) => {
                      const from = new Date(s);
                      const top = (from.getHours() * 60 + from.getMinutes()) / 60 * hour;
                      const height = Math.max(((f - s) / 3600000) * hour - 2, 14);
                      const lifted = ghost && ghost.id === e.id;
                      return (
                        <button
                          type="button"
                          key={e.id}
                          data-cal-event={e.id}
                          data-movable={movable(e) && !e.moving ? '1' : '0'}
                          className={eventClass(e) + (lifted ? ' is-lifted' : '')}
                          style={{ top, height, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)` }}
                          aria-label={hm(e.startsAt) + '–' + hm(e.endsAt) + ' ' + labelOf(e)}
                          onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}
                        >
                          {/* Неделя на телефоне — только имя, как в Google; на широком экране — целиком */}
                          {days === 7 && <span className="cal-event__name cal-event__short">{shortLabelOf(e)}</span>}
                          <span className={'cal-event__name' + (days === 7 ? ' cal-event__full' : '')}>{labelOf(e)}</span>
                          {height >= 30 && <span className="cal-event__time">{hm(e.startsAt)}–{hm(e.endsAt)}</span>}
                        </button>
                      );
                    })}
                    {ghost && ghost.key === key && (() => {
                      const ev = events.find((x) => x.id === ghost.id);
                      const height = Math.max((ghost.duration / 60) * hour - 2, 18);
                      return (
                        <div className={(ev ? eventClass(ev) : 'cal-event') + ' cal-event--ghost'} aria-hidden="true"
                          style={{ top: (ghost.minutes / 60) * hour, height, left: 1, width: 'calc(100% - 3px)' }}>
                          {days < 7 && ev && <span className="cal-event__name">{labelOf(ev)}</span>}
                          <span className="cal-event__time cal-event__time--strong">{clock(ghost.minutes)}{days < 7 ? '–' + clock(ghost.minutes + ghost.duration) : ''}</span>
                        </div>
                      );
                    })()}
                    {draft && draft.key === key && (
                      <button type="button" className="cal-draft" style={{ top: (draft.minutes / 60) * hour, height: Math.max(hour - 2, 22) }}
                        onClick={(ev) => { ev.stopPropagation(); onCreate({ date: d, minutes: draft.minutes }); }}>
                        <IconPlus size={14} /><span>{clock(draft.minutes)}</span>
                      </button>
                    )}
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

/**
 * Месяц: шесть недель на весь экран, листается вбок ровно на месяц — лента
 * из прошлого, текущего и следующего месяца, все уже с занятиями. Сколько
 * событий помещается в день — по высоте ячейки, остальное «ещё N».
 * Событие тоже переносится удержанием — в другой день, время то же.
 */
function MonthPager({ anchor, events, onDay, onEvent, onShift, onDrop }) {
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
    events.forEach((e) => {
      const k = dateValue(new Date(e.startsAt));
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    });
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
        onEdge: (dir) => flushSync(() => live.current.onShift(dir)),
      });
      const end = () => { stop(); setHover(null); setLifted(null); };
      return {
        move: (nx, ny) => { point = { x: nx, y: ny }; },
        drop: () => { end(); if (key) live.current.onDrop(ev, sameTimeOn(ev.startsAt, keyDate(key))); },
        cancel: end,
      };
    },
  };
  useCalendarGestures(root, api);

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
                        <button type="button" key={e.id} data-cal-event={e.id} data-movable={movable(e) && !e.moving ? '1' : '0'}
                          className={eventClass(e) + ' cal-event--chip' + (lifted && lifted.id === e.id ? ' is-lifted' : '')}
                          aria-label={hm(e.startsAt) + ' ' + labelOf(e)} tabIndex={i === 1 ? 0 : -1}
                          onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}>
                          {shortLabelOf(e)}
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
      .filter((e) => dateValue(new Date(e.startsAt)) === k)
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
                  {loading ? 'Загружаю…' : empty ? 'Занятий нет до ' + addDays(start, days - 1).getDate() + ' ' + MONTHS[addDays(start, days - 1).getMonth()] : today ? 'Сегодня занятий нет' : 'Занятий нет'}
                </p>
              )}
              {ofDay.map((e) => (
                <button type="button" key={e.id} className={eventClass(e) + ' cal-agenda__item'} onClick={() => onEvent(e)}>
                  <span className="cal-event__name">{labelOf(e)}</span>
                  <span className="cal-event__time">
                    {isAllDay(e) ? 'Весь день' : hm(e.startsAt) + '–' + hm(e.endsAt)}
                    {e.cancelledCharged ? ' · отменено, списано' : e.personal ? ' · личное' : ''}
                  </span>
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

/** Создать, перенести или удалить занятие либо личное событие */
function EventForm({ event, preset, clients, onDone, onCancel, onCopy, onOpenClient }) {
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
          {/* Из занятия — сразу к человеку (FT-567): раньше путь к его
              программе шёл через «Клиенты» и поиск по списку */}
          {event.id && !personal && onOpenClient && (() => {
            const who = clients.find((c) => c.row === Number(event.clientRow));
            return who ? (
              <div className="schedule__client-links">
                <button type="button" className="button" onClick={() => onOpenClient(who, 'plan')}>Программа клиента</button>
                <button type="button" className="button button--ghost" onClick={() => onOpenClient(who, 'overview')}>Карточка</button>
              </div>
            ) : null;
          })()}
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
        </div>
      </Panel>
    </>
  );
}
