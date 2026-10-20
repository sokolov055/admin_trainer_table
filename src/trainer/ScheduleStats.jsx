import React from 'react';
import { useData } from '../useData.js';
import { Section, Panel, Loading, ErrorState, Rows, Row } from '../ui.jsx';

/**
 * Сводка → Процессы → кто отменяет и переносит. По клиентам: у кого больше
 * отмен и переносов — выше; и последние случаи списком — кто отменил,
 * поздно ли (меньше чем за сутки), списано ли; переносы — по чьей просьбе.
 * Исправления ошибок записи сюда не попадают: их тренер отметил как
 * «исправление».
 *
 * Итоговые числа (проведено, отмен, переносов, доля) стоят выше, в
 * строках «Срывы» — они считаются сервером тем же кодом, что и график.
 * Здесь только имена. Период приходит снаружи: тот же, что открыт в сводке.
 */

const when = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ScheduleStats({ range }) {
  const { loading, data, error, reload } = useData('trainer.schedule.stats', range, [range.from, range.to]);

  if (loading) return <Loading lead={false} rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !data.total) return null;

  const troubled = (c) => c.cancelClient + c.cancelTrainer + c.moveClient + c.moveTrainer > 0;
  const clients = (data.clients || []).filter(troubled);
  if (!clients.length && !(data.recent || []).length) return null;

  return (
    <>
      {clients.length > 0 && (
        <Section title="Кто отменяет" note="у кого больше отмен и переносов — выше">
          <Panel>
            <Rows>
              {clients.map((c) => (
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

      {(data.recent || []).length > 0 && (
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
      )}
    </>
  );
}
