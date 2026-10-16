import React, { useState } from 'react';
import { apiMutate, apiPublic } from '../api.js';
import { haptic } from '../telegram.js';
import { useReveal } from '../reveal.js';

/**
 * «Это то же упражнение, переименованное?» (владелец, 16.10.2026). Пока база
 * заполняется, тренер заводит новые карточки упражнений, а клиент старое
 * уже делал — меняя упражнение в его программе, тренер одним касанием
 * переносит веса, «Было» и рекорды этого клиента на новое (сервер,
 * lib/history-move.js). Только у этого клиента; отменить — тут же.
 */
export default function HistoryMove({ clientRow, from, to, onClose, onMoved, after = '«Было» покажется после сохранения программы.' }) {
  const [step, setStep] = useState('ask');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  // Вопрос, ответ, ошибка — на экран: выбрали из длинного списка внизу, а
  // вопрос встал выше экрана (FT-595)
  const ref = useReveal(step + (error ? ':' + error : ''));

  const call = async (action, params, next) => {
    setStep('busy');
    setError('');
    try {
      const r = await apiMutate(action, { clientRow, ...params });
      haptic('success');
      if (next === 'done') setResult(r);
      setStep(next);
      if (onMoved) onMoved(r);
    } catch (e) {
      setError(e.message);
      setStep(next === 'done' ? 'ask' : 'done');
    }
  };
  const move = () => call('client.exercise.history.move', { fromId: from.id || null, fromName: from.name, toId: to.id }, 'done');
  const undo = () => call('client.exercise.history.undo', { moveId: result.moveId }, 'undone');

  if (step === 'undone') {
    return <div className="history-move" role="status" ref={ref}>
      <p className="history-move__text">Перенос отменён — история осталась у «{from.name}».</p>
      <button type="button" className="history-move__link" onClick={onClose}>Закрыть</button>
    </div>;
  }
  if (step === 'done' && result) {
    return <div className="history-move" role="status" ref={ref}>
      <p className="history-move__text">{result.moveId
        ? `Перенесено на «${to.name}»: ${result.sessions} ${plural(result.sessions)}${result.notes ? ' и настройка' : ''}.${after ? ' ' + after : ''}`
        : `Переносить нечего: в журнале клиента нет «${from.name}».`}</p>
      {error && <p className="small danger">{error}</p>}
      <div className="history-move__actions">
        {result.moveId && <button type="button" className="history-move__link" onClick={undo}>Отменить</button>}
        <button type="button" className="history-move__link" onClick={onClose}>Готово</button>
      </div>
    </div>;
  }
  const busy = step === 'busy';
  return <div className="history-move" ref={ref}>
    <p className="history-move__text">Клиент уже делал «{from.name}». Это то же упражнение, только под новым названием?</p>
    <p className="small muted">Тогда его веса, «Было» и рекорды перейдут на «{to.name}». У других клиентов ничего не поменяется.</p>
    {error && <p className="small danger">{error}</p>}
    <div className="history-move__actions">
      <button type="button" className="button" disabled={busy} onClick={move}>{busy ? 'Переношу…' : 'Да, перенести силовые'}</button>
      <button type="button" className="button button--ghost" disabled={busy} onClick={onClose}>Нет, это другое</button>
    </div>
  </div>;
}

function plural(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'занятие';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'занятия';
  return 'занятий';
}

/**
 * В занятии (владелец, 16.10.2026): упражнение уже новое, а клиент делал
 * его под старым названием — тренер выбирает его из журнала клиента, и
 * веса с настройкой переезжают сюда (HistoryMove). Только тренеру.
 */
export function HistoryPick({ clientRow, to, onOpen, onClose, onMoved, after = '«Было» и веса — уже в программе.' }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(null);
  const [query, setQuery] = useState('');
  // Раскрыли — список на экран; журнал пришёл — ещё раз, он стал длиннее
  const ref = useReveal(open && !from && (error ? 'error' : list ? 'list' : 'loading'));

  const show = async () => {
    setOpen(true);
    setError('');
    if (onOpen) onOpen();
    try {
      const r = await apiPublic('client.exercise.history.list', { clientRow });
      setList(r.exercises || []);
    } catch (e) {
      setError(e.message);
    }
  };
  const close = () => { setOpen(false); setFrom(null); setQuery(''); if (onClose) onClose(); };

  if (from) return <HistoryMove clientRow={clientRow} from={from} to={to} onClose={close} onMoved={onMoved} after={after} />;
  if (!open) {
    return <button type="button" className="history-move__link" onClick={show}>Клиент делал это под другим названием?</button>;
  }
  const words = query.trim().toLowerCase();
  const items = (list || [])
    .filter((x) => !(x.exerciseId && x.exerciseId === to.id) && x.name !== to.name)
    .filter((x) => !words || x.name.toLowerCase().includes(words));
  return <div className="history-move" ref={ref}>
    <p className="history-move__text">Что из журнала клиента — это «{to.name}»?</p>
    {error && <p className="small danger">{error}</p>}
    {!list && !error && <p className="small muted">Загружаю журнал…</p>}
    {list && list.length > 8 && <input className="field__input" type="search" placeholder="Найти по названию" aria-label="Найти упражнение в журнале"
      value={query} onChange={(e) => setQuery(e.target.value)} />}
    {list && !items.length && <p className="small muted">{words ? 'Ничего не нашлось.' : 'В журнале клиента других упражнений нет.'}</p>}
    {items.slice(0, 40).map((x) => (
      <button type="button" key={(x.exerciseId || '') + x.name} className="workout__alts-item" onClick={() => setFrom({ id: x.exerciseId, name: x.name })}>
        {x.name}<span className="small muted">{'  ·  ' + dayText(x.date) + (x.sessions > 1 ? ', ' + x.sessions + ' ' + plural(x.sessions) : '')}</span>
      </button>
    ))}
    <button type="button" className="history-move__link" onClick={close}>Закрыть</button>
  </div>;
}

function dayText(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.slice(8, 10) + '.' + date.slice(5, 7) : '';
}

/** Была ли у строки программы история клиента — тогда и спрашиваем */
export function hadHistory(ex) {
  return !!(ex && (ex.prevWeight || ex.lastWeight || ex.lastRun || (ex.startSets && ex.startSets.length)));
}
