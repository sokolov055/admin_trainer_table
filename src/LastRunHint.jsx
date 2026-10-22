import React from 'react';
import { lastRunParts } from './effort.js';
import { IconDelta } from './icons.jsx';

/**
 * «Прошлый раз» над подходами (20.10.2026): две короткие строки вместо
 * одной длинной — что было (дата, веса × повторы, оценка) и что сегодня
 * (сдвиг веса со стрелкой или «так же»). В суперсете — с названием.
 * Текст тот же, что в lastRunText (уведомления, часы). tired — сегодня
 * упражнение после другого на те же мышцы, вес на шаг легче (22.10.2026)
 */
export default function LastRunHint({ last, name = '', tired = null }) {
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
      {tired && tired.after && (
        <p className="workout__last-today workout__last-today--down">
          <IconDelta value={-1} />
          {'Сегодня после «' + tired.after + '» — на шаг легче задуманного, −' + String(tired.step || '').replace('.', ',') + ' кг'}
        </p>
      )}
    </div>
  );
}
