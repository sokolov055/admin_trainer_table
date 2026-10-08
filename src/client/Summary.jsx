import React, { useRef, useState } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, Segmented, plural } from '../ui.jsx';
import { IconChevron, IconDelta } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { periodTitle, compareText, metricRows, recordText, localPeriod, backText } from './summaryText.js';

/**
 * Итоги недели и месяца — в «Прогрессе» под «Целями» (08.10.2026, FT-493).
 * Тот же блок тренер видит в карточке клиента.
 *
 * Как и остальные показатели приложения — один ведущий и факты под ним
 * (Lead в ui.jsx), а не сетка одинаковых плиток: главный вопрос блока —
 * «сколько я тренировался», он и стоит крупно, рядом с целью. Время,
 * поднятый вес и шаги — уточнения. У каждого стрелка к прошлому такому же
 * периоду; идущий сравнивается с теми же днями прошлого, и подпись об этом
 * стоит прямо под ведущим числом.
 *
 * Листание — стрелками и свайпом вбок по блоку. Название периода меняется
 * в момент нажатия (границы считаются на устройстве), цифры прежнего
 * периода приглушаются, пока едут новые: нажатие видно сразу. Ушли назад —
 * название становится кнопкой возврата к текущему.
 */

const SWIPE_PX = 50;

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
  const touch = useRef(null);
  const params = { period, offset, ...(clientRow ? { clientRow } : {}) };
  const { data } = useData('client.summary', params, [clientRow, period, offset]);

  // Пока едет первый ответ или сервер не ответил — блока нет, как у
  // «Целей»: замеры ниже от него не зависят
  if (!data) return null;

  const s = data;
  // Ответ ещё за прошлый период — приглушаем его до нового
  const pending = s.period !== period || s.offset !== offset;
  const shown = localPeriod(period, offset);
  const older = pending ? true : s.older;
  const rows = metricRows(s);
  const lead = rows[0];
  const facts = rows.slice(1);

  const go = (d) => {
    const next = Math.max(0, offset + d);
    if (next === offset || (d > 0 && !older)) return;
    setOffset(next);
    haptic();
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const st = touch.current;
    touch.current = null;
    if (!st) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Вправо — в прошлое, как листают календарь
    go(dx > 0 ? 1 : -1);
  };

  const unit = period === 'week' ? 'неделю' : 'месяц';

  return (
    <Section title="Итоги">
      <Panel pad className="summary">
        {/* data-no-swipe: свайп вбок здесь листает периоды, а не вкладки */}
        <div data-no-swipe="" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="summary__swipe">
          <div className="summary__bar">
            <div className="summary__nav">
              <button
                type="button"
                className="summary__arrow"
                onClick={() => go(1)}
                disabled={!older}
                aria-label={period === 'week' ? 'Неделей раньше' : 'Месяцем раньше'}
              >
                <IconChevron size={20} className="summary__chevron summary__chevron--back" />
              </button>
              {offset > 0 ? (
                <button
                  type="button"
                  className="summary__title summary__title--back"
                  onClick={() => { setOffset(0); haptic(); }}
                  aria-label={periodTitle(shown) + ', вернуться ' + backText(period)}
                >
                  <span>{periodTitle(shown)}</span>
                  <span className="summary__back">{backText(period)}</span>
                </button>
              ) : (
                <div className="summary__title" aria-live="polite">{periodTitle(shown)}</div>
              )}
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
            <div className="summary__period">
              <Segmented
                label="Период итогов"
                items={[{ value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]}
                value={period}
                onChange={(v) => { if (v !== period) { setPeriod(v); setOffset(0); haptic(); } }}
              />
            </div>
          </div>

          <div className={'summary__body' + (pending ? ' summary__body--pending' : '')} aria-busy={pending}>
            {s.empty ? (
              <p className="summary__empty">
                {s.current
                  ? 'Проведите тренировку — итоги ' + (period === 'week' ? 'недели' : 'месяца') + ' появятся здесь.'
                  : 'За этот период тренировок, шагов и рекордов нет.'}
              </p>
            ) : (
              <>
                <div className="summary__lead">
                  <div className="summary__label">Тренировки</div>
                  <div className="summary__lead-row">
                    <span className="summary__lead-value">{lead.value}</span>
                    <span className="summary__lead-goal">
                      из {s.target} по цели на {unit}
                    </span>
                  </div>
                  <div className="summary__compare">
                    <Change row={lead} />
                    <span>{compareText(s)}</span>
                  </div>
                </div>

                <dl className="summary__facts">
                  {facts.map((r) => (
                    <div key={r.id} className="summary__fact">
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
                      {s.records.length === 1
                        ? 'Рекорд'
                        : s.records.length + ' ' + plural(s.records.length, 'рекорд', 'рекорда', 'рекордов')}
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
          </div>
        </div>
      </Panel>
    </Section>
  );
}
