import React, { useRef, useState } from 'react';
import { apiMutate } from '../api.js';
import { Sheet, Field, formatDate } from '../ui.jsx';
import './measure-move.css';

/**
 * Перенос замера на другую дату — касание по дате в таблице замеров.
 *
 * Раньше это был window.prompt «ДД.ММ.ГГГГ» и window.alert при ошибке
 * (аудит 24.10.2026): системное окно поверх приложения, ввод даты руками
 * и ошибка, после которой всё набирать заново. Теперь — лист с родным
 * выбором даты; ошибка — под полем, введённое остаётся.
 *
 * from — дата замера (ISO), sheetName — серия замеров (лист «Показатели»).
 */

// Сегодня по часам телефона, а не по UTC: вечером в Москве UTC — ещё вчера
function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export default function MeasureMove({ from, sheetName, clientRow, onClose, onMoved }) {
  const was = String(from || '').slice(0, 10);
  const [date, setDate] = useState(was);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(null);

  const check = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Выберите дату.';
    if (value === was) return 'Это та же дата — выберите другую.';
    if (value > todayIso()) return 'Дата ещё не наступила.';
    return '';
  };

  const move = async () => {
    const problem = check(date);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      await apiMutate('measure.move', { ...(clientRow ? { clientRow } : {}), sheetName, from: was, to: date });
      setBusy(false);
      onMoved && onMoved();
      if (closeRef.current) closeRef.current(); else onClose();
    } catch (failure) {
      setBusy(false);
      setError(failure.message || 'Не получилось перенести.');
    }
  };

  return (
    <Sheet title="Дата замера" onClose={onClose} locked={busy} dirty={date !== was} closeRef={closeRef}>
      <p className="small muted measure-move__lead">
        Замер за {formatDate(was)} целиком переедет на новую дату — например, если ошиблись годом.
      </p>
      <Field
        label="Правильная дата"
        type="date"
        value={date}
        onChange={(v) => { setDate(v); setError(''); }}
        error={error}
        disabled={busy}
      />
      <button type="button" className="button button--primary button--block sheet__done" onClick={move} disabled={busy}>
        {busy ? 'Переношу…' : 'Перенести'}
      </button>
    </Sheet>
  );
}
