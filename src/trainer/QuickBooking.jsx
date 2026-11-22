import React, { useEffect, useRef, useState } from 'react';
import { apiMutate } from '../api.js';
import { useData } from '../useData.js';
import { Field, Note, Sheet, Switch } from '../ui.jsx';
import { IconSearch } from '../icons.jsx';
import { initials } from '../chat/chat-model.js';
import { addDays, dateValue, startOfDay } from './calendar-move.js';
import { BookingColor } from './BookingColor.jsx';
import { BookingDuration } from './BookingDuration.jsx';
import { bookingTime, bookingClients, bookingDuration, bookingOverlap, QUICK_DURATIONS } from './quick-booking.js';

export function RepeatFields({ enabled, until, startsOn, disabled, onToggle, onUntil }) {
  return (
    <div className="cal-repeat">
      <Switch checked={enabled} disabled={disabled} onChange={onToggle}>Повторять каждую неделю</Switch>
      {enabled && <label className="field">
        <span className="field__label">До даты (пусто — пока не выключите)</span>
        <input className="field__input" type="date" min={startsOn} value={until} disabled={disabled} onChange={(e) => onUntil(e.target.value)} />
      </label>}
    </div>
  );
}

export function weeklyPayload(until) {
  return { until: until || null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

export default function QuickBooking({ draft, clients, events, grid, onDuration, onChange, onChooseSlot, onClose, onMore, onDone, requestIdFor }) {
  const [search, setSearch] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState(null);
  const [historyEnd] = useState(() => startOfDay(addDays(new Date(), 1)));
  const history = useData('trainer.schedule', {
    from: addDays(historyEnd, -56).toISOString(), to: historyEnd.toISOString(), bookingHints: true,
  }, []);
  const entries = history.data?.events || [];
  const { at, personal, title, row, manualMinutes, repeat, until, color } = draft;
  const minutes = manualMinutes ?? (personal ? 60 : bookingDuration(row, entries, history.data?.lastDurations));
  useEffect(() => { onDuration(minutes); }, [minutes, onDuration]);
  const end = new Date(at.getTime() + minutes * 60000);
  const available = bookingClients(clients, entries, at, search);
  const selected = clients.find((c) => Number(c.row) === Number(row) && !c.archived);
  const visible = all ? available : available.slice(0, 4);
  const conflictDay = dateValue(at);
  const conflicts = useData('trainer.schedule', {
    from: startOfDay(at).toISOString(), to: startOfDay(addDays(at, 15)).toISOString(), includeOverlaps: true,
  }, [conflictDay]);
  const overlapping = bookingOverlap(conflicts.data && !conflicts.stale ? conflicts.data.events : events, at.getTime(), end.getTime());
  const repeatInvalid = repeat && (at <= new Date() || (until && until < dateValue(at)));
  const change = (patch) => { setError(null); onChange(patch); };

  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        personal, ...(personal ? { title: title.trim() } : { clientRow: Number(row) }),
        startsAt: at.toISOString(), minutes, color, ...(repeat ? { repeat: weeklyPayload(until) } : {}),
      };
      const result = await apiMutate('trainer.schedule.save', { ...payload, ...(repeat ? { requestId: requestIdFor(payload) } : {}) });
      onDone(result);
    } catch (failure) {
      setError(failure.message || 'Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet title={personal ? 'Личное событие' : 'Новое занятие'} className="cal-quick" onClose={onClose} locked={busy}
      dirty={!!(row || title || repeat || manualMinutes || color)}>
      <div className="cal-quick__body">
        <div className="cal-quick__when">
          <span>{at.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })} · {bookingTime(at, end)}</span>
          <button type="button" className="option cal-quick__personal" aria-pressed={personal}
            disabled={busy} onClick={() => change({ personal: !personal })}>Личное</button>
        </div>
        {grid && <button type="button" className="button button--ghost cal-quick__move" disabled={busy}
          onClick={onChooseSlot}>Передвинуть в сетке</button>}
        {personal ? (
          <label className="field">
            <span className="field__label">Название события</span>
            <input className="field__input" value={title} maxLength={120} disabled={busy} onChange={(e) => change({ title: e.target.value })} />
          </label>
        ) : (
          <div className="cal-quick__people">
            <div className="field__label">{!all && visible.some((c) => c.usual) ? 'Обычно в это время' : 'Клиенты'}</div>
            {all && <Field label="Поиск клиента" value={search} onChange={setSearch} />}
            <div className={'cal-quick__clients' + (all ? ' cal-quick__clients--expanded' : '')}>
              {visible.map((c, index) => (
                <button type="button" key={c.row} data-avatar-tone={index % 4} aria-label={c.name} aria-pressed={Number(row) === Number(c.row)} disabled={busy}
                  onClick={() => change({ row: c.row })}>
                  <span aria-hidden="true">{initials(c.name)}</span>
                  <b aria-hidden="true">{all ? c.name : c.name.split(' ')[0]}</b>
                  {c.usual && <small>Обычно</small>}
                </button>
              ))}
              <button type="button" disabled={busy} aria-expanded={all} aria-label={all ? 'Свернуть поиск' : 'Все · Поиск'}
                onClick={() => { setAll(!all); setSearch(''); }}>
                <span aria-hidden="true"><IconSearch size={19} /></span><b>{all ? 'Свернуть' : 'Все'}</b>
              </button>
            </div>
            {!visible.length && <p className="small muted">{search ? 'Клиенты не найдены' : 'Нет активных клиентов'}</p>}
          </div>
        )}
        <BookingDuration value={minutes} onChange={(value) => change({ manualMinutes: value })}
          presets={QUICK_DURATIONS} disabled={busy} />
        <BookingColor value={color} onChange={(value) => change({ color: value })} disabled={busy}
          preview={!grid && (personal ? title.trim() : selected?.name || 'Занятие')} />
        {history.data?.weeklyRepeat && <RepeatFields enabled={repeat} until={until} startsOn={dateValue(at)} disabled={busy}
          onToggle={(value) => change({ repeat: value })} onUntil={(value) => change({ until: value })} />}
        {repeatInvalid && <Note tone="warning">Выберите будущее время и дату окончания не раньше начала.</Note>}
        {overlapping && <Note tone="warning">Пересечение: {overlapping.clientName || overlapping.title} · {bookingTime(new Date(overlapping.startsAt), new Date(overlapping.endsAt))}</Note>}
        {error && <Note tone="critical">{error}</Note>}
        <div className="cal-quick__actions">
          <button type="button" className="button" disabled={busy} onClick={() => onMore(minutes, !!history.data?.weeklyRepeat)}>Ещё…</button>
          <button type="button" className="button button--primary" disabled={busy || repeatInvalid || (personal ? !title.trim() : !selected)} onClick={save}>
            {busy ? 'Сохраняем…' : personal ? 'Добавить событие' : selected ? 'Записать · ' + selected.name : 'Записать'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
