import React, { useMemo, useState } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, Loading, ErrorState, Empty, Chips, Rows, Row } from '../ui.jsx';
import { IconCalendar } from '../icons.jsx';

/**
 * Сводка → Занятия: сколько проведено, отменено и перенесено — всего и по
 * клиентам. Отмены — кто отменил, сколько поздних (меньше чем за сутки) и
 * сколько списано; переносы — по чьей просьбе. Исправления ошибок записи
 * сюда не попадают: их тренер отметил как «исправление».
 */

const PERIODS = [
  { value: 'month', label: 'Этот месяц' },
  { value: 'prev', label: 'Прошлый' },
  { value: 'quarter', label: '3 месяца' },
];

function rangeOf(period) {
  const now = new Date();
  const first = (y, m) => new Date(y, m, 1);
  if (period === 'prev') return { from: first(now.getFullYear(), now.getMonth() - 1), to: first(now.getFullYear(), now.getMonth()) };
  if (period === 'quarter') return { from: first(now.getFullYear(), now.getMonth() - 2), to: first(now.getFullYear(), now.getMonth() + 1) };
  return { from: first(now.getFullYear(), now.getMonth()), to: first(now.getFullYear(), now.getMonth() + 1) };
}

const when = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ScheduleStats() {
  const [period, setPeriod] = useState('month');
  const params = useMemo(() => {
    const r = rangeOf(period);
    return { from: r.from.toISOString(), to: r.to.toISOString() };
  }, [period]);
  const { loading, data, error, reload } = useData('trainer.schedule.stats', params, [params.from, params.to]);

  const t = data && data.total;
  const cancels = t ? t.cancelClient + t.cancelTrainer : 0;
  const moves = t ? t.moveClient + t.moveTrainer : 0;

  return (
    <>
      <Chips items={PERIODS} value={period} onChange={setPeriod} />
      {loading && <Loading rows={3} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {t && (
        <>
          <Section>
            <Panel pad>
              <div className="schedule-stats__grid">
                <div><div className="small muted">Проведено</div><div className="schedule-stats__num">{t.done}</div></div>
                <div>
                  <div className="small muted">Отмены</div>
                  <div className="schedule-stats__num">{cancels}</div>
                  <div className="small muted">клиент {t.cancelClient} · тренер {t.cancelTrainer}</div>
                  {(t.cancelLate > 0 || t.cancelCharged > 0) && (
                    <div className="small muted">поздних {t.cancelLate} · списано {t.cancelCharged}</div>
                  )}
                </div>
                <div>
                  <div className="small muted">Переносы</div>
                  <div className="schedule-stats__num">{moves}</div>
                  <div className="small muted">клиент {t.moveClient} · тренер {t.moveTrainer}</div>
                </div>
              </div>
            </Panel>
          </Section>

          {data.clients.some((c) => c.cancelClient + c.cancelTrainer + c.moveClient + c.moveTrainer > 0) && (
            <Section title="По клиентам" note="у кого больше отмен и переносов — выше">
              <Panel>
                <Rows>
                  {data.clients.filter((c) => c.cancelClient + c.cancelTrainer + c.moveClient + c.moveTrainer > 0).map((c) => (
                    <Row key={c.clientRow} label={c.name || 'Клиент ' + c.clientRow}>
                      {[
                        c.done ? 'проведено ' + c.done : '',
                        c.cancelClient + c.cancelTrainer ? 'отмен ' + (c.cancelClient + c.cancelTrainer) + (c.cancelCharged ? ' (списано ' + c.cancelCharged + ')' : '') : '',
                        c.moveClient + c.moveTrainer ? 'переносов ' + (c.moveClient + c.moveTrainer) : '',
                      ].filter(Boolean).join(' · ')}
                    </Row>
                  ))}
                </Rows>
              </Panel>
            </Section>
          )}

          {data.recent.length > 0 ? (
            <Section title="Последние отмены и переносы">
              <Panel>
                <Rows>
                  {data.recent.map((r, i) => (
                    <Row key={i} label={r.clientName || 'Клиент'}>
                      {r.kind === 'cancel'
                        ? 'отмена ' + when(r.fromAt) + ' · ' + (r.who === 'client' ? 'клиент' : 'тренер') + (r.late ? ', поздняя' : '') + (r.charged ? ', списано' : '')
                        : 'перенос ' + when(r.fromAt) + ' → ' + when(r.toAt) + ' · ' + (r.who === 'client' ? 'просьба клиента' : 'тренер')}
                      {r.reason ? ' · ' + r.reason : ''}
                    </Row>
                  ))}
                </Rows>
              </Panel>
            </Section>
          ) : (
            <Empty icon={IconCalendar} title="Отмен и переносов нет" text="Отменяйте и переносите занятия в «Расписании» — они будут собираться здесь." />
          )}
        </>
      )}
    </>
  );
}
