import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiPrimary } from '../api.js';
import { Section, Panel, formatMoney, formatDate, plural } from '../ui.jsx';
import { haptic } from '../telegram.js';

/**
 * Сверка денег перед отказом от Google-таблицы.
 *
 * С 23.09 сервер ведёт свою книгу рядом с таблицей: остаток на день снимка,
 * плюс оплаты, минус проведённые занятия по цене (server/src/lib/ledger.js).
 * Переключиться на сервер можно, только когда по каждому клиенту решено,
 * чья цифра верна. Здесь тренер это и решает:
 *
 *  - «Верна таблица» — сервер записывает поправку ровно на разницу;
 *  - «Верен сервер» — ничего не меняется, расхождение помечается
 *    разобранным: при переходе останется цифра сервера.
 *
 * Показывается, только пока есть неразобранное: сошлось — блока нет.
 */
export default function LedgerCheck() {
  const { loading, data, error, reload } = useData('trainer.ledger', {}, []);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');

  if (loading || error || !data || !data.state || !data.state.open) return null;
  const open = data.rows.filter((r) => !r.settled);
  if (!open.length) return null;

  const settle = async (row, decision) => {
    setBusy(row + decision);
    setProblem('');
    try {
      await apiPrimary('trainer.ledger.settle', { clientRow: row, decision });
      haptic('success');
      reload();
    } catch (err) {
      setProblem(err.message || 'Не получилось сохранить.');
    } finally {
      setBusy('');
    }
  };

  return (
    <Section
      title="Сверка денег"
      note={`${data.state.matched} из ${data.state.clients} сошлись · таблица против сервера с ${formatDate(data.state.since, false)}`}
    >
      <Panel pad>
        <p className="small">
          Перед отказом от Google-таблицы решите по каждому клиенту, чья цифра верна.
          Пока это не сделано, деньги по-прежнему считает таблица.
        </p>
      </Panel>
      {open.map((r) => (
        <Panel pad key={r.row} className="ledger-check">
          <p className="ledger-check__name">{r.name}</p>
          <div className="ledger-check__pair">
            <span>В таблице<strong>{formatMoney(r.inSheet || 0)}</strong></span>
            <span>На сервере<strong>{formatMoney(r.ours)}</strong></span>
          </div>
          <p className="small muted">
            Сервер считал так: остаток {formatMoney(r.opening)} на {formatDate(r.openedAt, false)}
            {' + '}оплаты {formatMoney(r.paid)}
            {' − '}{r.trainings} {plural(r.trainings, 'занятие', 'занятия', 'занятий')} × {formatMoney(r.price || 0)}
            {r.adjusted ? ' + поправки ' + formatMoney(r.adjusted) : ''}.
            {' '}На сервере на {formatMoney(Math.abs(r.diff))} {r.diff < 0 ? 'меньше' : 'больше'}.
          </p>
          <div className="add-client__actions">
            <button className="button" disabled={!!busy} onClick={() => settle(r.row, 'sheet')}>
              {busy === r.row + 'sheet' ? 'Сохраняю…' : 'Верна таблица'}
            </button>
            <button className="button button--ghost" disabled={!!busy} onClick={() => settle(r.row, 'server')}>
              {busy === r.row + 'server' ? 'Сохраняю…' : 'Верен сервер'}
            </button>
          </div>
        </Panel>
      ))}
      {problem && <p className="small muted" role="alert">{problem}</p>}
      <div className="ledger-check__gap" aria-hidden="true" />
    </Section>
  );
}
