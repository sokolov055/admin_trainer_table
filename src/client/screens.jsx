import React, { useState } from 'react';
import { useData } from '../useData.js';
import { LineChart } from '../charts.jsx';
import {
  Lead, Section, Panel, Rows, Row, Loading, ErrorState, Empty, Badge, StatusBadge,
  Chips, Delta, formatNumber, formatMoney, formatDate, relativeDays, daysSince, plural,
} from '../ui.jsx';
import { IconRuler, IconPlan, IconProgress, IconNutrition, IconAlert } from '../icons.jsx';

/* ==================================================================
 * Обзор
 * ================================================================== */

export function Overview({ clientRow }) {
  const { loading, data, error, reload } = useData(
    'client.overview', clientRow ? { clientRow } : {}, [clientRow]
  );

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const sinceTraining = daysSince(data.lastTrainingDate);

  // Главный вопрос клиента — «сколько у меня оплачено вперёд». Отвечаем
  // тренировками, а не рублями: в тренировках человек и думает.
  const leadIsTrainings = data.trainingsLeft !== null && data.balance > 0;

  return (
    <>
      <Lead
        label={leadIsTrainings ? 'Оплачено вперёд' : 'Баланс'}
        value={
          leadIsTrainings
            ? data.trainingsLeft + ' ' + plural(data.trainingsLeft, 'тренировка', 'тренировки', 'тренировок')
            : formatMoney(data.balance)
        }
        tone={data.balance < 0 ? 'critical' : data.balance > 0 ? 'good' : undefined}
        hint={
          leadIsTrainings
            ? formatMoney(data.balance) + ' на балансе'
            : data.balance < 0
              ? 'Нужно пополнить'
              : 'Баланс исчерпан'
        }
        facts={[
          { label: 'Тренировок в этом месяце', value: formatNumber(data.trainingsThisMonth) },
          {
            label: 'Последняя тренировка',
            value: data.lastTrainingDate ? relativeDays(data.lastTrainingDate) : 'не было',
          },
        ]}
      />

      {sinceTraining !== null && sinceTraining > 14 && (
        <Section>
          <Panel pad>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--warning-text)', display: 'flex', flexShrink: 0, marginTop: 1 }}>
                <IconAlert size={18} />
              </span>
              <div className="small">
                Больше двух недель без тренировок — {relativeDays(data.lastTrainingDate)}.
                Напишите тренеру, чтобы вернуться в график.
              </div>
            </div>
          </Panel>
        </Section>
      )}

      <Section title="Занятия">
        <Panel>
          <Rows>
            <Row label="Программа месяца">
              <StatusBadge value={data.monthSheetStatus} fallback="не создана" />
            </Row>
            <Row label="Последний замер">
              <StatusBadge value={data.lastMeasureStatus} fallback="не было" />
            </Row>
            {data.lastTrainingDate && (
              <Row label="Дата последней тренировки">{formatDate(data.lastTrainingDate)}</Row>
            )}
            {data.startDate && <Row label="Занимается с">{formatDate(data.startDate)}</Row>}
          </Rows>
        </Panel>
      </Section>

      {data.balance < 0 && (
        <Section title="Оплата">
          <Panel pad>
            <div className="small">
              По балансу числится долг {formatMoney(Math.abs(data.balance))}.
              Если оплата уже прошла — напишите тренеру, он отметит её в таблице.
            </div>
          </Panel>
        </Section>
      )}
    </>
  );
}

/* ==================================================================
 * Показатели
 * ================================================================== */

export function Measurements({ clientRow }) {
  const { loading, data, error, reload } = useData(
    'client.measurements', clientRow ? { clientRow } : {}, [clientRow]
  );
  const [field, setField] = useState('Вес');

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const series = data.series || [];
  const hasData = series.some((s) => s.rows && s.rows.length > 0);

  if (!hasData) {
    return (
      <Empty
        icon={IconRuler}
        title="Замеров пока нет"
        text={data.note || 'Когда тренер внесёт первый замер, здесь появится динамика по каждому обхвату.'}
      />
    );
  }

  // Одна метрика за раз. Вес и обхваты живут в разных диапазонах: на общей
  // оси линия веса прижмётся к низу, а двух шкал на графике быть не должно.
  const available = (data.fields || []).filter((f) =>
    series.some((s) => (s.rows || []).some((r) => r[f] !== null && r[f] !== undefined))
  );

  const activeField = available.includes(field) ? field : available[0];
  const unit = activeField === 'Вес' ? ' кг' : ' см';

  const chartSeries = series.map((s) => ({
    label: s.label || 'Замеры',
    points: (s.rows || [])
      .filter((r) => r[activeField] !== null && r[activeField] !== undefined)
      .map((r) => ({ x: r.date, y: r[activeField] })),
  }));

  const first = chartSeries[0] && chartSeries[0].points;
  const delta = first && first.length > 1
    ? Math.round((first[first.length - 1].y - first[0].y) * 10) / 10
    : null;

  return (
    <>
      <Chips items={available} value={activeField} onChange={setField} />

      <Lead
        label={activeField}
        value={first && first.length ? formatNumber(first[first.length - 1].y) + unit : '—'}
        hint={
          first && first.length
            ? 'замер от ' + formatDate(first[first.length - 1].x)
            : undefined
        }
        facts={
          delta !== null
            ? [
                { label: 'От первого замера', value: <Delta value={delta} suffix={unit} /> },
                { label: 'Всего замеров', value: formatNumber(first.length) },
              ]
            : undefined
        }
      />

      <Section title="Динамика" note={'по датам замеров,' + unit}>
        <Panel pad>
          <LineChart series={chartSeries} unit={unit} />
        </Panel>
      </Section>

      {series.map((s, i) => (
        <Section key={i} title={s.label ? 'Замеры: ' + s.label : 'Все замеры'}>
          <Panel pad>
            <MeasureTable rows={s.rows} fields={data.fields} />
          </Panel>
        </Section>
      ))}
    </>
  );
}

function MeasureTable({ rows, fields }) {
  if (!rows || rows.length === 0) return <Empty text="Нет записей" />;

  const used = fields.filter((f) => rows.some((r) => r[f] !== null && r[f] !== undefined));
  const recent = rows.slice().reverse();

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="sticky">Дата</th>
            {used.map((f) => <th key={f} className="num">{f}</th>)}
          </tr>
        </thead>
        <tbody>
          {recent.map((r, i) => (
            <tr key={i}>
              <td className="sticky nowrap">{formatDate(r.date)}</td>
              {used.map((f) => (
                <td key={f} className="num">
                  {r[f] === null || r[f] === undefined ? '—' : formatNumber(r[f])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ==================================================================
 * Тренировочный план
 * ================================================================== */

export function Plan({ clientRow }) {
  const [month, setMonth] = useState('');
  const params = { ...(clientRow ? { clientRow } : {}), ...(month ? { month } : {}) };
  const { loading, data, error, reload } = useData('client.plan', params, [clientRow, month]);

  if (loading) return <Loading lead={false} rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const months = data.available || [];
  const blocks = data.blocks || [];

  const totalExercises = blocks.reduce((s, b) => s + b.exercises.length, 0);

  return (
    <>
      {months.length > 1 && (
        <Chips items={months.map((m) => ({ value: m, label: m }))} value={data.month} onChange={setMonth} />
      )}

      {blocks.length === 0 && (
        <Empty
          icon={IconPlan}
          title="Программы пока нет"
          text={data.note || `Лист «${data.month}» ещё не заполнен. Тренер создаёт программу в начале месяца.`}
        />
      )}

      {blocks.map((block, i) => (
        <Section
          key={i}
          title={block.title}
          note={block.exercises.length + ' ' + plural(block.exercises.length, 'упражнение', 'упражнения', 'упражнений')}
        >
          <Panel>
            {block.exercises.map((ex, j) => (
              <div className="exercise" key={j}>
                <div style={{ minWidth: 0 }}>
                  <div className="exercise__name">{ex.name}</div>
                  <div className="exercise__scheme">
                    {[
                      ex.sets && ex.sets + ' × ' + (ex.reps || '?'),
                      ex.rpe && 'RPE ' + ex.rpe,
                    ].filter(Boolean).join('   ·   ') || '—'}
                  </div>
                </div>
                <div className="exercise__weight">
                  <div className="exercise__weight-value">{ex.weight || '—'}</div>
                  {ex.prevWeight && <div className="exercise__weight-prev">было {ex.prevWeight}</div>}
                </div>
              </div>
            ))}
          </Panel>
        </Section>
      ))}

      {totalExercises > 0 && (
        <p className="small muted" style={{ marginTop: 22, textAlign: 'center' }}>
          Рабочие веса заполняет тренер в таблице
        </p>
      )}
    </>
  );
}

/* ==================================================================
 * Дашборд прогресса
 * ================================================================== */

export function Progress({ clientRow }) {
  const { loading, data, error, reload } = useData(
    'client.progress', clientRow ? { clientRow } : {}, [clientRow]
  );

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const series = data.series || [];
  const lifts = data.lifts || [];

  const weightSeries = series
    .map((s) => ({
      label: s.label || 'Вес',
      points: (s.rows || [])
        .filter((r) => r['Вес'] !== null && r['Вес'] !== undefined)
        .map((r) => ({ x: r.date, y: r['Вес'] })),
    }))
    .filter((s) => s.points.length > 0);

  const grew = lifts.filter((l) => l.delta > 0);
  const mainDelta = series[0] && series[0].deltas ? series[0].deltas['Вес'] : null;

  if (weightSeries.length === 0 && lifts.length === 0) {
    return (
      <Empty
        icon={IconProgress}
        title="Данных для прогресса пока мало"
        text="Нужны хотя бы два замера или заполненные рабочие веса в программе месяца."
      />
    );
  }

  return (
    <>
      {mainDelta && (
        <Lead
          label="Вес"
          tone="info"
          value={formatNumber(mainDelta.last) + ' кг'}
          hint={`было ${formatNumber(mainDelta.first)} кг с ${formatDate(mainDelta.firstDate, false)}`}
          facts={[
            { label: 'Изменение', value: <Delta value={mainDelta.delta} suffix=" кг" /> },
            lifts.length
              ? { label: 'Веса выросли', value: grew.length + ' из ' + lifts.length }
              : null,
          ]}
        />
      )}

      {weightSeries.length > 0 && (
        <Section title="Динамика веса" note="килограммы по датам замеров">
          <Panel pad>
            <LineChart series={weightSeries} unit=" кг" />
          </Panel>
        </Section>
      )}

      {series.some((s) => Object.keys(s.deltas || {}).length > 0) && (
        <Section title="Изменения по замерам" note="от первого к последнему">
          <Panel pad>
            {series.map((s, i) => (
              <div key={i} style={{ marginBottom: series.length > 1 && i < series.length - 1 ? 20 : 0 }}>
                {s.label && (
                  <div className="small muted" style={{ marginBottom: 8 }}>{s.label}</div>
                )}
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Показатель</th>
                        <th className="num">Было</th>
                        <th className="num">Стало</th>
                        <th className="num">Изменение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(s.deltas).map((f) => {
                        const d = s.deltas[f];
                        return (
                          <tr key={f}>
                            <td>{f}</td>
                            <td className="num">{formatNumber(d.first)}</td>
                            <td className="num">{formatNumber(d.last)}</td>
                            <td className="num">
                              <Delta value={d.delta} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </Panel>
        </Section>
      )}

      {lifts.length > 0 && (
        <Section title="Рабочие веса" note={`${data.currentMonth} против прошлого месяца`}>
          <Panel pad>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="sticky">Упражнение</th>
                    <th className="num">Было</th>
                    <th className="num">Стало</th>
                    <th className="num">Изменение</th>
                  </tr>
                </thead>
                <tbody>
                  {lifts.map((l, i) => (
                    <tr key={i}>
                      <td className="sticky">{l.name}</td>
                      <td className="num">{formatNumber(l.prevWeight)}</td>
                      <td className="num">{formatNumber(l.weight)}</td>
                      <td className="num"><Delta value={l.delta} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </Section>
      )}
    </>
  );
}

/* ==================================================================
 * Питание
 * ================================================================== */

export function Nutrition({ clientRow }) {
  const { loading, data, error, reload } = useData(
    'client.nutrition', clientRow ? { clientRow } : {}, [clientRow]
  );

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const targets = data.targets || {};
  const withValues = Object.keys(targets).filter((k) => targets[k]);

  if (!data.configured) {
    return (
      <Empty
        icon={IconNutrition}
        title="Раздел готовится"
        text={
          'Здесь появятся нормы КБЖУ и рацион.\n\n' +
          `Чтобы включить: добавьте лист «${data.sheetName}» в личную таблицу ` +
          'или колонки Ккал, Белки, Жиры, Углеводы на лист «Клиенты».'
        }
      />
    );
  }

  const lead = withValues[0];

  return (
    <>
      {lead && (
        <Lead
          label={'Норма · ' + lead}
          value={formatNumber(targets[lead])}
          facts={withValues.slice(1).map((k) => ({ label: k, value: formatNumber(targets[k]) }))}
        />
      )}

      {data.meals && data.meals.length > 0 && (
        <Section title="Рацион">
          <Panel pad>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    {Object.keys(data.meals[0]).map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.meals.map((meal, i) => (
                    <tr key={i}>
                      {Object.keys(data.meals[0]).map((h) => <td key={h}>{meal[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </Section>
      )}
    </>
  );
}
