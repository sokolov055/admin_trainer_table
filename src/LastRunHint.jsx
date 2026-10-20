import React from 'react';
import { lastRunParts } from './effort.js';
import { IconDelta } from './icons.jsx';

/**
 * «Прошлый раз» над подходами (20.10.2026): две короткие строки вместо
 * одной длинной — что было (дата, веса × повторы, оценка) и что сегодня
 * (сдвиг веса со стрелкой или «так же»). В суперсете — с названием.
 * Текст тот же, что в lastRunText (уведомления, часы)
 */
export default function LastRunHint({ last, name = '' }) {
  const p = lastRunParts(last);
  if (!p) return null;
  const up = p.action === 'up';
  const down = p.action === 'down' || p.action === 'scaled';
  const today = p.today ? p.today.charAt(0).toUpperCase() + p.today.slice(1) : '';
  return (
    <div className="workout__last" role="note">
      <p className="workout__last-was">
        <span className="workout__last-label">{name ? name + ' · ' : ''}Прошлый раз{p.date ? ' ' + p.date : ''}</span>
        {p.was}
      </p>
      {today && (
        <p className={'workout__last-today' + (up ? ' workout__last-today--up' : down ? ' workout__last-today--down' : '')}>
          {(up || down) && <IconDelta value={up ? 1 : -1} />}
          {today}
        </p>
      )}
    </div>
  );
}
