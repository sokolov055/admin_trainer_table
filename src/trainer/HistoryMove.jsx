import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';

/**
 * «Это то же упражнение, переименованное?» (владелец, 16.10.2026). Пока база
 * заполняется, тренер заводит новые карточки упражнений, а клиент старое
 * уже делал — меняя упражнение в его программе, тренер одним касанием
 * переносит веса, «Было» и рекорды этого клиента на новое (сервер,
 * lib/history-move.js). Только у этого клиента; отменить — тут же.
 */
export default function HistoryMove({ clientRow, from, to, onClose }) {
  const [step, setStep] = useState('ask');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const call = async (action, params, next) => {
    setStep('busy');
    setError('');
    try {
      const r = await apiMutate(action, { clientRow, ...params });
      haptic('success');
      if (next === 'done') setResult(r);
      setStep(next);
    } catch (e) {
      setError(e.message);
      setStep(next === 'done' ? 'ask' : 'done');
    }
  };
  const move = () => call('client.exercise.history.move', { fromId: from.id || null, fromName: from.name, toId: to.id }, 'done');
  const undo = () => call('client.exercise.history.undo', { moveId: result.moveId }, 'undone');

  if (step === 'undone') {
    return <div className="history-move" role="status">
      <p className="history-move__text">Перенос отменён — история осталась у «{from.name}».</p>
      <button type="button" className="history-move__link" onClick={onClose}>Закрыть</button>
    </div>;
  }
  if (step === 'done' && result) {
    return <div className="history-move" role="status">
      <p className="history-move__text">{result.moveId
        ? `Перенесено на «${to.name}»: ${result.sessions} ${plural(result.sessions)}${result.notes ? ' и настройка' : ''}. «Было» покажется после сохранения программы.`
        : `Переносить нечего: в журнале клиента нет «${from.name}».`}</p>
      {error && <p className="small danger">{error}</p>}
      <div className="history-move__actions">
        {result.moveId && <button type="button" className="history-move__link" onClick={undo}>Отменить</button>}
        <button type="button" className="history-move__link" onClick={onClose}>Готово</button>
      </div>
    </div>;
  }
  const busy = step === 'busy';
  return <div className="history-move">
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

/** Была ли у строки программы история клиента — тогда и спрашиваем */
export function hadHistory(ex) {
  return !!(ex && (ex.prevWeight || ex.lastWeight || ex.lastRun || (ex.startSets && ex.startSets.length)));
}
