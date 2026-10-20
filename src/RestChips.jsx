import React from 'react';
import { REST_OPTIONS, restText } from './exercise-track.js';

/**
 * Отдых после подхода упражнения (20.10.2026): чипы одного кегля, как «Как
 * учитывать нагрузку» (ExerciseKind). «Общий» — отдых занятия (в программе
 * — тот, что выберут в занятии). Одни и те же чипы в программе, шаблоне и
 * идущем занятии; в занятии правка — только этого занятия.
 */
export default function RestChips({ value = 0, fallback = 0, onChange, disabled = false, hint = true }) {
  const current = Number(value) || 0;
  const items = [[0, fallback ? 'Общий · ' + restText(fallback) : 'Общий'], ...REST_OPTIONS.map((s) => [s, restText(s)])];
  return (
    <div className="rest-chips">
      <span className="rest-chips__label">Отдых после подхода</span>
      <div className="chips chips--flush chips--wrap rest-chips__row" role="radiogroup" aria-label="Отдых после подхода">
        {items.map(([v, label]) => (
          <button
            type="button"
            key={v}
            role="radio"
            aria-checked={current === v}
            className={'chip' + (current === v ? ' chip--active' : '')}
            disabled={disabled}
            onClick={() => current !== v && onChange(v)}
          >{label}</button>
        ))}
      </div>
      {hint && <p className="rest-chips__hint">Базовым (присед, жим, тяга) — 2–3 минуты, изолирующим — минута-полторы.</p>}
    </div>
  );
}
