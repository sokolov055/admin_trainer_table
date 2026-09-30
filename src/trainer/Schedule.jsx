import { useReturnScroll } from '../scroll.js';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { Section, Panel, Loading, ErrorState, Note, Field, Options, Chips } from '../ui.jsx';
import { IconAlert, IconBack, IconCopy, IconPlus } from '../icons.jsx';

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
  useReturnScroll(!!editing);

  const setView = (v) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch (_) { /* не запомнили — не беда */ }
    haptic();
  };

  const { start, days } = rangeOf(view, anchor);
  const params = useMemo(() => ({
    from: start.toISOString(),
    to: addDays(start, days).toISOString(),
  }), [start.getTime(), days]);
  const { loading, data, error, reload } = useData('trainer.schedule', params, [params.from, params.to]);
  const clients = useData('trainer.clients', {}, []);

  if (editing) {
    return (
      <EventForm
        event={editing}
        preset={preset}
        clients={(clients.data && clients.data.clients) || []}
        serviceEmail={data && data.serviceEmail}
        onDone={() => { setEditing(null); setPreset(null); reload(); }}
        onCancel={() => { setEditing(null); setPreset(null); }}
      />
    );
  }

  const events = (data && data.events) || [];
  const create = (when) => { setPreset(when || { date: startOfDay(anchor), minutes: 10 * 60 }); setEditing({}); haptic(); };
  const openDay = (d) => { setAnchor(startOfDay(d)); setView('day'); };

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

      {/* Новое занятие — плавающей кнопкой, как в Google: сетка занимает
          экран, а кнопка всегда под пальцем над нижним меню */}
      <button className="cal-fab" aria-label="Добавить занятие" onClick={() => create()}><IconPlus size={24} /></button>

      {error && <ErrorState error={error} onRetry={reload} />}

      {/* Google Календарь — только у владельца сервиса; у других тренеров
          расписание живёт в приложении, и предупреждать не о чем */}
      {!loading && !error && data && !data.calendar && data.owner !== false && (
        <Note tone="critical" icon={IconAlert}>Календарь не подключён на сервере.</Note>
      )}

      {!error && (loading && !data ? <Loading lead={false} rows={4} /> : view === 'month'
        ? <MonthGrid start={start} anchor={anchor} events={events} onDay={openDay} onEvent={setEditing} />
        : <TimeGrid start={start} days={days} events={events} onDay={openDay} onEvent={setEditing} onSlot={create} />)}

      {data && data.feedUrl && (
        <PhoneCalendar url={data.feedUrl} text="Все занятия — в календаре телефона: подпишитесь один раз, дальше он обновляется сам." />
      )}
    </>
  );
}

/** Название события в сетке: клиент, иначе название из календаря */
const labelOf = (e) => e.clientName || e.title || 'Без названия';
/** В узких колонках недели и месяца — только имя, как в Google на телефоне */
const shortLabelOf = (e) => labelOf(e).split(/\s+/)[0];

function eventClass(e) {
  return 'cal-event'
    + (e.cancelledCharged ? ' cal-event--cancelled' : '')
    + (!e.clientRow ? ' cal-event--unknown' : '')
    + (e.done && !e.cancelledCharged ? ' cal-event--done' : '');
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

/** Сетка по часам на 1, 3 или 7 дней */
function TimeGrid({ start, days, events, onDay, onEvent, onSlot }) {
  const scroller = useRef(null);
  const [now, setNow] = useState(() => new Date());
  const columns = Array.from({ length: days }, (_, i) => addDays(start, i));

  // Открываем сетку с утра, а не с полуночи; сегодня — ближе к текущему часу
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const today = columns.some((d) => sameDay(d, new Date()));
    const hour = today ? Math.max(FIRST_HOUR, new Date().getHours() - 1) : FIRST_HOUR;
    el.scrollTop = hour * HOUR;
  }, [start.getTime(), days]);

  // Линия «сейчас» двигается сама, раз в минуту
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const slot = (d, ev) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const minutes = Math.floor(((ev.clientY - rect.top) / HOUR) * 2) * 30;
    onSlot({ date: d, minutes: Math.max(0, Math.min(minutes, 23 * 60 + 30)) });
  };

  return (
    <div className={'cal-grid cal-grid--' + days} style={{ '--cols': days }}>
      <div className="cal-grid__head">
        <span />
        {columns.map((d) => {
          const today = sameDay(d, now);
          return (
            <button key={d.getTime()} className={'cal-grid__day' + (today ? ' cal-grid__day--today' : '')} onClick={() => onDay(d)}>
              <span>{weekdayOf(d)}</span>
              <strong>{d.getDate()}</strong>
            </button>
          );
        })}
      </div>

      <div className="cal-grid__scroll" ref={scroller}>
        <div className="cal-grid__body" style={{ height: 24 * HOUR }}>
          <div className="cal-grid__hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR }}>{h ? pad(h) + ':00' : ''}</span>
            ))}
          </div>
          {columns.map((d) => {
            const ofDay = events.filter((e) => sameDay(new Date(e.startsAt), d));
            const today = sameDay(d, now);
            return (
              // Пустое место дня — кнопка «новое занятие на это время»
              <div key={d.getTime()} className="cal-grid__col" onClick={(ev) => slot(d, ev)} role="presentation">
                {layoutDay(ofDay).map(({ e, s, f, col, cols }) => {
                  const from = new Date(s);
                  const top = (from.getHours() * 60 + from.getMinutes()) / 60 * HOUR;
                  const height = Math.max(((f - s) / 3600000) * HOUR - 2, 18);
                  return (
                    <button
                      key={e.id}
                      className={eventClass(e)}
                      style={{ top, height, left: `calc(${(col / cols) * 100}% + 1px)`, width: `calc(${100 / cols}% - 3px)` }}
                      onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}
                    >
                      <span className="cal-event__name">{days === 7 ? shortLabelOf(e) : labelOf(e)}</span>
                      {days < 7 && height >= 34 && <span className="cal-event__time">{hm(e.startsAt)}–{hm(e.endsAt)}</span>}
                    </button>
                  );
                })}
                {today && (
                  <span className="cal-grid__now" style={{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR }} aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Сетка месяца: 6 недель, в дне — до трёх занятий, остальное «ещё N» */
function MonthGrid({ start, anchor, events, onDay, onEvent }) {
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
                <button key={e.id} className={eventClass(e) + ' cal-event--chip'} aria-label={hm(e.startsAt) + ' ' + labelOf(e)} onClick={(ev) => { ev.stopPropagation(); onEvent(e); }}>
                  {shortLabelOf(e)}
                </button>
              ))}
              {ofDay.length > 3 && <span className="cal-month__more">ещё {ofDay.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Создать, перенести или отменить занятие */
function EventForm({ event, preset, clients, serviceEmail, onDone, onCancel }) {
  // Новое — на время, куда нажали в сетке (или 10:00 опорного дня)
  const base = (preset && preset.date) || startOfDay(new Date());
  const presetMinutes = preset && Number.isFinite(preset.minutes) ? preset.minutes : 10 * 60;
  const start = event.startsAt
    ? new Date(event.startsAt)
    : new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(presetMinutes / 60), presetMinutes % 60);
  const initialMinutes = event.startsAt ? Math.round((new Date(event.endsAt) - new Date(event.startsAt)) / 60000) : 60;

  const [clientRow, setClientRow] = useState(event.clientRow || '');
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
    clientRow: Number(clientRow),
    startsAt: startsAt.toISOString(),
    minutes: Number(minutes),
    ...(moved ? { change, reason } : {}),
  }));

  const remove = () => run(() => apiMutate('trainer.schedule.delete', {
    id: event.id, who, reason, ...(charged ? { charge: true } : {}),
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
          <strong>{event.id ? 'Занятие' : 'Новое занятие'}</strong>
          {event.id && !event.clientRow && (
            <p className="small muted" style={{ margin: 0 }}>
              «{event.title}» — клиент не узнан. Выберите его — занятие привяжется к нему, а в Google Календаре останутся только инициалы и номер.
            </p>
          )}
          <label className="field">
            <span className="field__label">Клиент</span>
            <select className="field__input" value={clientRow} disabled={busy || !!step} onChange={(e) => setClientRow(e.target.value)}>
              <option value="">Выберите клиента</option>
              {active.map((c) => <option key={c.row} value={c.row}>{c.name}</option>)}
            </select>
          </label>
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
          {step === 'move' && (
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
                disabled={busy || !clientRow || !date || !time || (step === 'move' && !change)}
                onClick={() => (moved && step !== 'move' ? setStep('move') : save())}
              >
                {busy ? 'Сохраняю…' : event.id ? (moved && step !== 'move' ? 'Перенести…' : 'Сохранить') : 'Добавить'}
              </button>
              <button className="button" disabled={busy} onClick={onCancel}>Отмена</button>
            </div>
          )}

          {event.id && !step && (
            <button className="button button--ghost" disabled={busy} onClick={() => setStep('cancel')}>Отменить занятие</button>
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
