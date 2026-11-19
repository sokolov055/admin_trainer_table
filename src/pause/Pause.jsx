import React, { useState, useEffect } from 'react';
import { Sheet } from '../ui.jsx';
import { apiMutate, apiStale } from '../api.js';
import { haptic } from '../telegram.js';
import { IconSnow, IconPlay } from '../icons.jsx';
import {
  CLIENT_MAX_DAYS, REASONS, QUICK, APPROX, reasonOf, today as mskToday, addDays, spanDays,
  dayLong, dayShort, spanText, daysWord, plural, calendar, pickDay,
} from './pause-model.js';
import './pause.css';

/*
 * Пауза в тренировках — заморозка (макет freeze-2026-11-19-v2, согласован
 * владельцем 19.11.2026; сервер — api/pause-handlers.js).
 *
 * Клиент: ClientPause (карточка на «Обзоре») и PauseSheet (просьба).
 * Тренер: TrainerPause (в карточке клиента, «Обзор») и TrainerPauseSheet.
 */

const timeOf = (iso) => new Date(iso).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function Reasons({ value, onChange, who = 'client' }) {
  return (
    <div className="pause-reasons" role="radiogroup" aria-label="Причина паузы">
      {REASONS.map((r) => (
        <button key={r.id} type="button" role="radio" aria-checked={value === r.id}
          className={'pause-reason' + (value === r.id ? ' is-on' : '')} onClick={() => { haptic(); onChange(r.id); }}>
          <b aria-hidden="true">{r.emoji}</b>{r[who]}
        </button>
      ))}
    </div>
  );
}

/** Месяц-полтора квадратами: тап — начало, второй тап — конец */
function Calendar({ range, onPick, min, max = null }) {
  const days = calendar({ first: min, weeks: 6, min, max, from: range.from, to: range.to });
  return (
    <div className="pause-cal" role="grid" aria-label="Дни паузы">
      {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => <span key={d} className="pause-cal__head">{d}</span>)}
      {days.map((d) => (
        <button key={d.day} type="button" disabled={d.off}
          className={'pause-cal__day' + (d.start ? ' is-start' : '') + (d.end ? ' is-end' : '') + (d.in ? ' is-in' : '') + (d.start && !range.to ? ' is-single' : '')}
          aria-pressed={d.start || d.end || d.in} aria-label={dayLong(d.day)}
          onClick={() => onPick(d.day)}>
          {d.month ? <small>{d.month}</small> : null}{d.num}
        </button>
      ))}
    </div>
  );
}

/** Что отменится в эти дни (сервер считает по расписанию); пока дат нет — не спрашиваем */
function usePreview(clientRow, from, to, enabled) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    if (!enabled) { setEvents([]); return undefined; }
    let alive = true;
    const { data, promise } = apiStale('pause.preview', { ...(clientRow ? { clientRow } : {}), from: from || '', to: to || '' });
    const take = (d) => { if (alive) setEvents(d && Array.isArray(d.events) ? d.events : []); };
    if (data) take(data);
    promise.then(take).catch(() => take(null));
    return () => { alive = false; };
  }, [enabled, clientRow, from, to]);
  return events;
}

/* ==================================================================
 * Клиент: просьба о паузе
 * ================================================================== */

export function PauseSheet({ onClose, onSent, startLong = false }) {
  const day0 = mskToday();
  const [long, setLong] = useState(startLong);
  const [reason, setReason] = useState('');
  const [quick, setQuick] = useState('two');
  const [range, setRange] = useState({ from: day0, to: addDays(day0, 13) });
  const [approx, setApprox] = useState('unknown');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const ready = !!reason && (long || (range.from && range.to));
  const events = usePreview(0, range.from, range.to, !long && !!range.to);

  const choose = (q) => { haptic(); setQuick(q.id); if (q.days) setRange({ from: day0, to: addDays(day0, q.days - 1) }); };
  const send = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('pause.request', long ? { reason, long: true, approx } : { reason, from: range.from, to: range.to });
      haptic('success');
      onSent();
    } catch (err) {
      setProblem(err.message || 'Не получилось отправить.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={long ? 'Пауза дольше месяца' : 'Пауза в тренировках'} onClose={onClose} locked={busy} className="pause-sheet">
      {long && <p className="small muted">Условия обсудите с тренером. Он поставит паузу до нужной даты или до разморозки.</p>}
      <div className="pause-label">Почему</div>
      <Reasons value={reason} onChange={setReason} />
      {reason === 'ill' && <p className="pause-hint">Только отметка, без диагноза. Видите вы и тренер; через 90 дней после паузы она стирается.</p>}

      {long ? (
        <>
          <div className="pause-label">Примерно до</div>
          <div className="pause-chips">
            {APPROX.map((a) => (
              <button key={a.id} type="button" className={'pause-chip' + (approx === a.id ? ' is-on' : '')} onClick={() => setApprox(a.id)}>{a.label}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="pause-label">Сколько <span>· до {CLIENT_MAX_DAYS} дней</span></div>
          <div className="pause-chips">
            {QUICK.map((q) => (
              <button key={q.id} type="button" className={'pause-chip' + (quick === q.id ? ' is-on' : '')} onClick={() => choose(q)}>{q.label}</button>
            ))}
            <button type="button" className={'pause-chip' + (quick === 'dates' ? ' is-on' : '')} onClick={() => { setQuick('dates'); setRange({ from: range.from, to: null }); }}>Даты…</button>
          </div>
          {quick === 'dates' && (
            <Calendar range={range} min={day0} onPick={(d) => setRange(pickDay(range, d, CLIENT_MAX_DAYS))} />
          )}
          {range.to && (
            <div className="pause-sum">
              <div>🗓️ <span>{spanText(range.from, range.to)} · {daysWord(spanDays(range.from, range.to))}</span></div>
              <div>🏋️ <span>{events.length
                ? events.length + ' ' + plural(events.length, 'тренировка', 'тренировки', 'тренировок') + ' в эти дни отменится, когда тренер подтвердит'
                : 'Тренировок с тренером в эти дни нет'}</span></div>
              <div>🎟️ <span>Оплаченные не тратятся. Потренироваться самому по приложению можно и в паузе</span></div>
            </div>
          )}
        </>
      )}

      {problem && <p className="small form__error" role="alert">{problem}</p>}
      <button type="button" className="button pause-go" disabled={!ready || busy} onClick={send}>
        {busy ? 'Отправляю…' : long ? 'Попросить долгую паузу' : 'Отправить тренеру'}
      </button>
      {!long && <button type="button" className="pause-more" onClick={() => { setLong(true); haptic(); }}>Нужно дольше месяца?</button>}
    </Sheet>
  );
}

/* ==================================================================
 * Клиент: карточка паузы на «Обзоре»
 * ================================================================== */

function Flakes() {
  return (
    <span className="pause-flakes" aria-hidden="true">
      {[12, 38, 66, 86].map((x, i) => <i key={x} style={{ left: x + '%', '--d': (6 + i) + 's', '--w': -i * 1.7 + 's' }}>❄</i>)}
    </span>
  );
}

/**
 * Просьба ждёт тренера, пауза впереди или идёт. mode — как у карточек
 * главной: 'own' — работает, 'preview' — видно, не нажимается.
 * onTrain — «Потренироваться самому».
 */
export function ClientPause({ pause, mode, onChanged, onTrain }) {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [problem, setProblem] = useState('');
  const live = mode === 'own';
  const r = reasonOf(pause.reason);

  const act = async (action) => {
    setBusy(true);
    setProblem('');
    try { await apiMutate(action, {}); haptic('success'); onChanged(); } catch (err) { setProblem(err.message || 'Не получилось.'); setBusy(false); }
  };

  if (pause.state === 'requested') {
    return (
      <section className="pause-wait enter" aria-label="Пауза ждёт тренера">
        <div className="pause-wait__title">⏳ Пауза ждёт тренера</div>
        <div className="small">
          {r ? r.emoji + ' ' : ''}{pause.kind === 'long' ? 'Дольше месяца — обсудите условия с тренером' : spanText(pause.from, pause.to)}
        </div>
        {problem && <p className="small form__error" role="alert">{problem}</p>}
        <button type="button" className="button button--small" disabled={!live || busy} onClick={() => act('pause.withdraw')}>Отозвать</button>
      </section>
    );
  }

  if (pause.state === 'upcoming') {
    return (
      <section className="pause-soon enter" aria-label="Пауза впереди">
        <IconSnow size={20} />
        <div className="pause-soon__text">
          <strong>Пауза {spanText(pause.from, pause.to)}</strong>
          <span className="small">тренер подтвердил{r ? ' · ' + r.emoji + ' ' + r.client.toLowerCase() : ''}</span>
        </div>
        <button type="button" className="button button--small" disabled={!live || busy}
          onClick={() => (sure ? act('pause.unfreeze') : setSure(true))}>{sure ? 'Да, снять' : 'Снять'}</button>
      </section>
    );
  }

  const total = pause.to ? spanDays(pause.from, pause.to) : 0;
  return (
    <section className="pause-ice enter" aria-label="Пауза в тренировках">
      <Flakes />
      <div className="pause-ice__label">{r ? r.emoji + ' ' + r.client + ' · ' : ''}{pause.to ? 'до ' + dayLong(pause.to) : 'до разморозки'}</div>
      <div className="pause-ice__big">{pause.to ? 'Ещё ' + daysWord(pause.daysLeft) : pause.dayNo + '-й день'}</div>
      {pause.to && total <= 31 ? (
        <div className="pause-ice__dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => <i key={i} className={i < pause.dayNo ? 'is-past' : ''} />)}
        </div>
      ) : !pause.to ? (
        <div className="pause-ice__note">Готовы вернуться — нажмите «Разморозить», тренер получит уведомление и назначит время</div>
      ) : null}
      {problem && <p className="small pause-ice__error" role="alert">{problem}</p>}
      {mode !== 'trainer' && (
        <div className="pause-ice__actions">
          <button type="button" className="pause-ice__go" disabled={!live} onClick={onTrain}><IconPlay size={16} /> Потренироваться самому</button>
          <button type="button" className="pause-ice__ghost" disabled={!live || busy}
            onClick={() => (sure ? act('pause.unfreeze') : setSure(true))}>{sure ? 'Да, разморозить' : 'Разморозить'}</button>
        </div>
      )}
    </section>
  );
}

/* ==================================================================
 * Тренер: в карточке клиента
 * ================================================================== */

/** Галочки «списать» у занятий меньше чем через сутки */
function ChargeList({ events, charge, setCharge }) {
  const late = events.filter((e) => e.late);
  if (!late.length) return null;
  return late.map((e) => (
    <label key={e.id} className="pause-charge">
      <input type="checkbox" checked={charge.has(e.id)}
        onChange={() => setCharge((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })} />
      <span><b>Списать {timeOf(e.at)}</b> — до тренировки меньше суток</span>
    </label>
  ));
}

/** Лист тренера: поставить паузу, подтвердить с другими датами, изменить срок */
export function TrainerPauseSheet({ clientRow, name, pause, online, onClose, onDone }) {
  const day0 = mskToday();
  const started = !!pause && pause.state === 'active';
  const [reason, setReason] = useState(pause?.reason || '');
  const [open, setOpen] = useState(pause ? !pause.to && (pause.state !== 'requested' || pause.kind === 'long') : false);
  const [range, setRange] = useState({ from: started ? pause.from : (pause?.from && pause.from >= day0 ? pause.from : day0), to: pause?.to || null });
  const [cancel, setCancel] = useState(true);
  const [extend, setExtend] = useState(!!online);
  const [charge, setCharge] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const events = usePreview(clientRow, started ? day0 : range.from, open ? '' : range.to, !!range.from && (open || !!range.to));
  const ready = open || !!range.to;

  const pick = (d) => {
    if (started) { setRange({ from: pause.from, to: d }); return; }
    setRange(pickDay(range, d));
  };
  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('pause.confirm', {
        clientRow, from: range.from, to: open ? '' : range.to, reason: reason || null,
        cancel, charge: [...charge], extendOnline: !!online && extend,
      });
      haptic('success');
      onDone();
    } catch (err) {
      setProblem(err.message || 'Не получилось сохранить.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={(started ? 'Срок паузы' : 'Заморозить') + (name ? ' · ' + name.split(' ')[0] : '')} onClose={onClose} locked={busy} className="pause-sheet">
      <Reasons value={reason} onChange={setReason} who="trainer" />
      <div className="pause-label">Срок</div>
      <div className="pause-seg" role="radiogroup">
        <button type="button" role="radio" aria-checked={!open} className={!open ? 'is-on' : ''} onClick={() => setOpen(false)}>До даты</button>
        <button type="button" role="radio" aria-checked={open} className={open ? 'is-on' : ''} onClick={() => setOpen(true)}>До разморозки</button>
      </div>
      {open
        ? <p className="small muted">Снимет тренер или клиент кнопкой «Разморозить».</p>
        : <Calendar range={range} min={started ? day0 : day0} onPick={pick} />}
      {ready && !open && <div className="pause-sum"><div>🗓️ <span>{spanText(range.from, range.to)} · {daysWord(spanDays(range.from, range.to))}</span></div></div>}

      <label className="pause-toggle">
        <span>🗓️ Отменить занятия {open ? 'впереди' : 'в эти дни'}{events.length ? ' · ' + events.length : ''}</span>
        <input type="checkbox" role="switch" checked={cancel} onChange={() => setCancel(!cancel)} />
      </label>
      {online && (
        <label className="pause-toggle">
          <span>🌐 Продлить онлайн-ведение на дни паузы</span>
          <input type="checkbox" role="switch" checked={extend} onChange={() => setExtend(!extend)} />
        </label>
      )}
      {cancel && <ChargeList events={events} charge={charge} setCharge={setCharge} />}

      {problem && <p className="small form__error" role="alert">{problem}</p>}
      <button type="button" className="button pause-go" disabled={!ready || busy} onClick={save}>
        {busy ? 'Сохраняю…' : started ? 'Сохранить срок' : open ? 'Заморозить' : 'Заморозить до ' + dayLong(range.to || range.from)}
      </button>
    </Sheet>
  );
}

/**
 * Пауза в карточке клиента у тренера: просьба (подтвердить / изменить /
 * отклонить), идущая пауза (срок, разморозить) или кнопка «Заморозить».
 * onDiscuss — к «Пожеланиям» клиента (вкладка «Тренировки»).
 */
export function TrainerPause({ pause, clientRow, name, online, onChanged, onDiscuss }) {
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [problem, setProblem] = useState('');
  const [charge, setCharge] = useState(() => new Set());
  const asked = pause && pause.state === 'requested';
  const events = usePreview(clientRow, pause?.from, pause?.to, !!asked && pause.kind !== 'long' && !!pause.to);
  const r = reasonOf(pause?.reason);
  const done = () => { setSheet(false); setBusy(false); onChanged(); };

  const act = async (action, params = {}) => {
    setBusy(true);
    setProblem('');
    try { await apiMutate(action, { clientRow, ...params }); haptic('success'); done(); } catch (err) { setProblem(err.message || 'Не получилось.'); setBusy(false); }
  };

  const sheetEl = sheet && (
    <TrainerPauseSheet clientRow={clientRow} name={name} pause={pause} online={online}
      onClose={() => setSheet(false)} onDone={done} />
  );

  if (!pause) {
    return (
      <>
        <button type="button" className="pause-start" onClick={() => { haptic(); setSheet(true); }}>
          <IconSnow size={18} /> Заморозить
        </button>
        {sheetEl}
      </>
    );
  }

  if (asked) {
    return (
      <section className="pause-ask enter" aria-label="Просьба о паузе">
        <div className="pause-ask__title">❄️ Просит паузу</div>
        <div className="small">
          {r ? r.emoji + ' ' + r.trainer + ' · ' : ''}
          {pause.kind === 'long'
            ? 'дольше месяца · ' + (APPROX.find((a) => a.id === pause.approx)?.label || 'пока не знает').toLowerCase()
            : spanText(pause.from, pause.to) + ' · ' + daysWord(spanDays(pause.from, pause.to))}
        </div>
        {pause.kind !== 'long' && events.length > 0 && (
          <div className="pause-sum">
            <div>🏋️ <span>отменятся: {events.map((e) => timeOf(e.at)).join(', ')}</span></div>
          </div>
        )}
        {pause.kind !== 'long' && <ChargeList events={events} charge={charge} setCharge={setCharge} />}
        {problem && <p className="small form__error" role="alert">{problem}</p>}
        <div className="pause-ask__actions">
          {pause.kind === 'long' ? (
            <>
              {onDiscuss && <button type="button" className="button button--small" onClick={onDiscuss}>💬 Обсудить</button>}
              <button type="button" className="button button--small pause-go--small" onClick={() => setSheet(true)}>Поставить паузу…</button>
            </>
          ) : (
            <>
              <button type="button" className="button button--small pause-go--small" disabled={busy}
                onClick={() => act('pause.confirm', { from: pause.from, to: pause.to, charge: [...charge], extendOnline: !!online })}>Подтвердить</button>
              <button type="button" className="button button--small" onClick={() => setSheet(true)}>Изменить даты</button>
            </>
          )}
          <button type="button" className="button button--small button--ghost" disabled={busy} onClick={() => act('pause.decline')}>Отклонить</button>
        </div>
        {sheetEl}
      </section>
    );
  }

  return (
    <section className="pause-soon enter" aria-label="Пауза">
      <IconSnow size={20} />
      <div className="pause-soon__text">
        <strong>{pause.state === 'upcoming' ? 'Пауза ' + spanText(pause.from, pause.to) : pause.to ? 'На паузе до ' + dayShort(pause.to) : 'На паузе · ' + pause.dayNo + '-й день'}</strong>
        <span className="small">{r ? r.emoji + ' ' + r.trainer : 'без причины'}</span>
      </div>
      <div className="pause-soon__actions">
        <button type="button" className="button button--small" onClick={() => setSheet(true)}>Срок</button>
        <button type="button" className="button button--small" disabled={busy}
          onClick={() => (sure ? act('pause.unfreeze') : setSure(true))}>{sure ? 'Да, разморозить' : 'Разморозить'}</button>
      </div>
      {problem && <p className="small form__error" role="alert">{problem}</p>}
      {sheetEl}
    </section>
  );
}
