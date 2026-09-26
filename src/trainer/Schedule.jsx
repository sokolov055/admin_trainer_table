import { useReturnScroll } from '../scroll.js';
import React, { useMemo, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { Section, Panel, Loading, ErrorState, Empty, Note, Field, Options } from '../ui.jsx';
import { IconCalendar, IconAlert, IconBack, IconCopy } from '../icons.jsx';

/**
 * Расписание тренера — занятия из его Google Календаря.
 *
 * Календарь остаётся местом, где живут события: заведённое с телефона в
 * Google появляется здесь, заведённое здесь — там, с именем клиента в
 * названии. Поэтому ничего не расходится, и деньги (их пока считает Apps
 * Script по тому же календарю) видят те же занятия.
 */

const DAY = 86400000;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DURATIONS = [45, 60, 75, 90, 120];

/** Отмена позже этого срока до начала — поздняя (как на сервере) */
const LATE_HOURS = 24;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d) => { const x = startOfDay(d); return new Date(x.getTime() - ((x.getDay() + 6) % 7) * DAY); };
const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const hm = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const pad = (n) => String(n).padStart(2, '0');
const dateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function Schedule() {
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState(null); // null | {} — новое | событие
  useReturnScroll(!!editing);

  const params = useMemo(() => ({
    from: week.toISOString(),
    to: new Date(week.getTime() + 7 * DAY).toISOString(),
  }), [week]);
  const { loading, data, error, reload } = useData('trainer.schedule', params, [params.from]);
  const clients = useData('trainer.clients', {}, []);

  const shiftWeek = (n) => {
    const next = new Date(week.getTime() + n * 7 * DAY);
    setWeek(next);
    setDay(next);
    haptic();
  };

  if (editing) {
    return (
      <EventForm
        event={editing}
        day={day}
        clients={(clients.data && clients.data.clients) || []}
        serviceEmail={data && data.serviceEmail}
        onDone={() => { setEditing(null); reload(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const events = (data && data.events) || [];
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY));
  const ofDay = events.filter((e) => sameDay(new Date(e.startsAt), day));

  return (
    <>
      <div className="schedule__week">
        <button className="icon-button" aria-label="Прошлая неделя" onClick={() => shiftWeek(-1)}><IconBack size={18} /></button>
        <span className="schedule__range">
          {days[0].getDate()} {MONTHS[days[0].getMonth()]} — {days[6].getDate()} {MONTHS[days[6].getMonth()]}
        </span>
        <button className="icon-button schedule__next" aria-label="Следующая неделя" onClick={() => shiftWeek(1)}><IconBack size={18} /></button>
      </div>

      <div className="schedule__days" role="tablist">
        {days.map((d, i) => {
          const count = events.filter((e) => sameDay(new Date(e.startsAt), d)).length;
          const active = sameDay(d, day);
          return (
            <button
              key={i}
              role="tab"
              aria-selected={active}
              className={'schedule__day' + (active ? ' schedule__day--active' : '') + (sameDay(d, new Date()) ? ' schedule__day--today' : '')}
              onClick={() => { setDay(d); haptic(); }}
            >
              <span>{WEEKDAYS[i]}</span>
              <strong>{d.getDate()}</strong>
              <em>{count || ''}</em>
            </button>
          );
        })}
      </div>

      <button className="button button--primary button--block schedule__add" onClick={() => setEditing({})}>
        Добавить занятие
      </button>

      {loading && <Loading lead={false} rows={3} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && data && !data.calendar && (
        <Note tone="critical" icon={IconAlert}>Календарь не подключён на сервере.</Note>
      )}

      {!loading && !error && ofDay.length === 0 && (
        <Empty icon={IconCalendar} title="Свободный день" text="Занятий нет. Добавьте здесь или в Google Календаре." />
      )}

      {ofDay.length > 0 && (
        <Section>
          {ofDay.map((e) => (
            <button className={'item' + (e.cancelledCharged ? ' schedule__cancelled' : '')} key={e.id} onClick={() => setEditing(e)}>
              <div className="item__top">
                <span className="item__name">{e.clientName || e.title || 'Без названия'}</span>
                <span className="item__amount">{hm(e.startsAt)}–{hm(e.endsAt)}</span>
              </div>
              <div className="item__meta">
                {!e.clientRow && <span className="schedule__unknown">клиент не узнан</span>}
                {e.cancelledCharged ? <span>отменено клиентом · списано</span> : e.done && <span>прошло</span>}
              </div>
            </button>
          ))}
        </Section>
      )}

      {data && data.feedUrl && (
        <PhoneCalendar url={data.feedUrl} text="Все занятия — в календаре телефона: подпишитесь один раз, дальше он обновляется сам." />
      )}
    </>
  );
}

/** Создать, перенести или отменить занятие */
function EventForm({ event, day, clients, serviceEmail, onDone, onCancel }) {
  const start = event.startsAt
    ? new Date(event.startsAt)
    : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0);
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
              «{event.title}» — клиент не узнан. Выберите его: название события в календаре станет его именем.
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
