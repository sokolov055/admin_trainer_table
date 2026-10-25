import React from 'react';
import { lastRunParts, tiredToday } from './effort.js';
import { IconDelta } from './icons.jsx';

/**
 * «Прошлый раз» над подходами (20.10.2026): две короткие строки вместо
 * одной длинной — что было (дата, веса × повторы, оценка) и что сегодня
 * (сдвиг веса со стрелкой или «так же»). В суперсете — с названием.
 * Текст тот же, что в lastRunText (уведомления, часы). tired — сегодня
 * упражнение после другого на те же мышцы, вес на шаг легче (22.10.2026);
 * пока шаг снят — это и есть строка «сегодня» (FT-754).
 * sets — подходы занятия: повторы в них поменяли — «сегодня» по ним
 */
export default function LastRunHint({ last, name = '', tired = null, sets = null }) {
  const p = lastRunParts(last, sets);
  if (!p) return null;
  // Сегодня после упражнения на те же мышцы (FT-754) — одна строка с весом
  // вместо «так же» и ниже «на шаг легче»: две читались как противоречие
  const tiredLine = tiredToday(tired, sets, last.mode === 'assist');
  const up = !tiredLine && p.action === 'up';
  const down = !!tiredLine || p.action === 'down' || p.action === 'scaled';
  const line = tiredLine || p.today;
  const today = line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
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
