import React, { useState } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, Segmented } from '../ui.jsx';
import { IconChevron, IconDelta } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { periodTitle, compareText, metricRows, recordText } from './summaryText.js';

/**
 * Итоги недели и месяца — в «Прогрессе» под «Целями» (08.10.2026, FT-493).
 * Тот же блок тренер видит в карточке клиента.
 *
 * Тренировки, время, тоннаж и шаги со стрелкой к прошлому такому же
 * периоду, ниже — рекорды «было → стало». Идущий период сравнивается с
 * теми же днями прошлого: в среду против всей прошлой недели стрелка была
 * бы вниз у любого, кто идёт по плану.
 *
 * Стрелки листают назад; влево — пока есть данные, вправо — до текущего.
 * Неделя/месяц — переключатель, а не вкладки: это настройка одного блока.
 */

export function Change({ row }) {
  if (row.noCompare) return null;
  const cls = row.diff > 0 ? 'delta--good' : row.diff < 0 ? 'delta--off' : 'delta--flat';
  return (
    <span className={'delta ' + cls}>
      <IconDelta value={row.diff} size={13} />
      {row.diff ? row.diffText(row.diff) : 'так же'}
    </span>
  );
}

export default function Summary({ clientRow }) {
  const [period, setPeriod] = useState('week');
  const [offset, setOffset] = useState(0);
  const params = { period, offset, ...(clientRow ? { clientRow } : {}) };
  const { data } = useData('client.summary', params, [clientRow, period, offset]);

  // Как и «Цели» — блок не главный: пока не доехал, его нет
  if (!data) return null;
  // Пока едет следующий период, виден прежний: useData держит снимок
  const s = data;
  const rows = metricRows(s);

  const go = (d) => { setOffset((o) => Math.max(0, o + d)); haptic(); };

  return (
    <Section title="Итоги" note={compareText(s)}>
      <Panel pad className="summary">
        <Segmented
          label="Период итогов"
          items={[{ value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]}
          value={period}
          onChange={(v) => { setPeriod(v); setOffset(0); }}
        />
        <div className="summary__nav">
          <button
            type="button"
            className="summary__arrow"
            onClick={() => go(1)}
            disabled={!s.older}
            aria-label={period === 'week' ? 'Неделей раньше' : 'Месяцем раньше'}
          >
            <IconChevron size={20} className="summary__chevron summary__chevron--back" />
          </button>
          <div className="summary__title" aria-live="polite">{periodTitle(s)}</div>
          <button
            type="button"
            className="summary__arrow"
            onClick={() => go(-1)}
            disabled={offset === 0}
            aria-label={period === 'week' ? 'Неделей позже' : 'Месяцем позже'}
          >
            <IconChevron size={20} className="summary__chevron summary__chevron--next" />
          </button>
        </div>

        {s.empty ? (
          <p className="summary__empty">За этот период тренировок, шагов и рекордов нет.</p>
        ) : (
          <>
            <dl className="summary__grid">
              {rows.map((r) => (
                <div key={r.id} className="summary__metric">
                  <dt className="summary__label">{r.label}</dt>
                  <dd className="summary__value">
                    {r.value}{r.unit ? <span className="summary__unit"> {r.unit}</span> : null}
                  </dd>
                  <dd className="summary__change"><Change row={r} /></dd>
                </div>
              ))}
            </dl>
            {s.records.length > 0 && (
              <div className="summary__records">
                <div className="summary__records-title">
                  {s.records.length === 1 ? 'Рекорд' : 'Рекорды'}
                </div>
                <ul>
                  {s.records.map((r, i) => (
                    <li key={i} className="summary__record">
                      <span className="summary__record-name">
                        {r.name}{r.machine ? <span className="muted"> · {r.machine}</span> : null}
                      </span>
                      <span className="summary__record-value">{recordText(r)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Panel>
    </Section>
  );
}
