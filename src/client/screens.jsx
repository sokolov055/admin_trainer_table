import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../useData.js';
import Ration from '../nutrition/Ration.jsx';
import { apiBatch, apiMutate, apiPublic } from '../api.js';
import { LineChart } from '../charts.jsx';
import {
  Lead, Section, Panel, Rows, Row, Loading, ErrorState, Empty, Badge, StatusBadge,
  Chips, Segmented, Options, Field, Note, Delta,
  formatNumber, formatMoney, formatDate, formatTime, formatWhen, relativeDays, daysSince, plural,
} from '../ui.jsx';
import { IconRuler, IconPlan, IconProgress, IconNutrition, IconAlert, IconCheck } from '../icons.jsx';
import { haptic } from '../telegram.js';
import WorkoutJournal from '../Workout.jsx';
import { supersets, blockSessions } from '../plan-model.js';

/* ==================================================================
 * Обзор
 * ================================================================== */

export function Overview({ clientRow, clientView = false }) {
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
          // Ближайшее занятие стоит первым фактом намеренно: чаще всего
          // приложение открывают именно с этим вопросом, и ответ не должен
          // требовать прокрутки.
          {
            label: 'Следующая тренировка',
            // «Не назначена» и «расписание недоступно» — разные новости.
            // Первая значит «занятий впереди нет, напишите тренеру»,
            // вторая — «мы просто не знаем»; путать их нельзя.
            //
            // Сравниваем с true, а не с false: поля может не быть вовсе —
            // например, API отвечает кодом, который про расписание ещё не
            // знает. Отсутствие ответа — это «не знаем», а не «занятий нет».
            value: data.nextTrainingDate
              ? formatWhen(data.nextTrainingDate)
              : data.scheduleKnown !== true ? 'нет данных' : 'не назначена',
          },
          { label: 'Тренировок в этом месяце', value: formatNumber(data.trainingsThisMonth) },
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
            <Row label="Следующая тренировка">
              {data.nextTrainingDate
                ? formatDate(data.nextTrainingDate) + ', ' + formatTime(data.nextTrainingDate)
                : data.scheduleKnown !== true
                  ? 'расписание временно недоступно'
                  : 'не назначена'}
            </Row>
            {data.lastTrainingDate && (
              <Row label="Дата последней тренировки">{formatDate(data.lastTrainingDate)}</Row>
            )}
            {clientRow && !clientView && data.startDate && <Row label="Занимается с">{formatDate(data.startDate)}</Row>}
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

      {/* Выход переехал в боковое меню, к «Моим данным»: он про себя, а
          не про тренировки, и на обзоре стоял только потому, что меню не
          было. */}
    </>
  );
}

/* ==================================================================
 * Тренировочный план
 * ================================================================== */

export function Plan({ clientRow, clientView = false }) {
  const [workout, setWorkout] = useState(null);
  const [month, setMonth] = useState('');
  const params = {
    ...(clientRow ? { clientRow } : {}),
    ...(clientView ? { clientView: true } : {}),
    ...(month ? { month } : {}),
  };
  const { loading, data, error, reload } = useData('client.plan', params, [clientRow, clientView, month]);

  // Незакрытое занятие. Раньше о нём не было видно ничего: «К программе»
  // выглядит как выход, а занятие продолжает идти, и человек узнавал об
  // этом, только когда не мог начать следующее — оно молча открывало
  // старое.
  // Журнал занятий: из него берутся и незакрытое занятие, и отметка
  // «тренировка проведена» у блоков программы.
  const [sessions, setSessions] = useState([]);

  // Журнал живёт в таблице и отвечает секундами, поэтому экран его не
  // ждёт: программа рисуется сразу, строка про занятие появляется, когда
  // придёт ответ. Перечитываем после выхода из журнала — там занятие
  // могли завершить или отменить.
  useEffect(() => {
    let alive = true;
    apiPublic('workout.list', clientRow ? { clientRow } : {})
      .then((r) => {
        if (!alive) return;
        setSessions((r && r.sessions) || []);
      })
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, [clientRow, workout]);

  if (workout) return <WorkoutJournal key={clientRow || 'self'} clientRow={clientRow} clientView={clientView} launch={workout.block || workout.sessionId ? workout : null} onClose={() => setWorkout(null)} />;

  if (loading || error) return <>
    <button className="button button--block plan__journal" onClick={() => setWorkout({})}>Текущее занятие и журнал тренировок</button>
    {loading ? <Loading lead={false} rows={4} /> : <ErrorState error={error} onRetry={reload} />}
  </>;

  const months = data.available || [];
  const blocks = data.blocks || [];
  const running = sessions.find((x) => x.status === 'active' || x.status === 'paused') || null;

  // Пока занятие не закрыто, новое начать нельзя: журнал всё равно откроет
  // текущее. Поэтому вместо «Начать тренировку» у блоков показывается одна
  // строка про идущее занятие — обещать кнопкой то, чего она не сделает,
  // хуже, чем её не показывать.
  const runningLine = running && (
    <Section>
      <Panel pad>
        <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {running.status === 'active' ? 'Идёт занятие' : 'Занятие на паузе'}
          {' «' + running.title + '»'}
          {running.done ? ' · ' + running.done + ' ' + plural(running.done, 'подход', 'подхода', 'подходов') : ''}.
          {' '}Новое можно начать, когда это завершено или отменено.
        </p>
        <button className="button button--primary button--block" onClick={() => setWorkout({})}>
          Вернуться к занятию
        </button>
      </Panel>
    </Section>
  );

  // Скрытые месяцы приезжают только тренеру: клиент про них не знает и
  // знать не должен, иначе появится вопрос «а что там».
  const hiddenMonths = data.hidden || [];
  const isHidden = hiddenMonths.indexOf(data.month) !== -1;

  const totalExercises = blocks.reduce((s, b) => s + b.exercises.length, 0);

  return (
    <>
      <button className="button button--block plan__journal" onClick={() => setWorkout({})}>Текущее занятие и журнал тренировок</button>

      {/* Сразу под входом в журнал: если занятие не закрыто, это первое,
          что человек должен узнать на этом экране. */}
      {runningLine}

      {months.length > 1 && (
        <Chips
          items={months.map((m) => ({
            value: m,
            // Пометка прямо в подписи, а не значком: тренер листает месяцы
            // глазами, и «скрыт» должно читаться, не требуя расшифровки.
            label: hiddenMonths.indexOf(m) !== -1 ? m + ' · скрыт' : m,
          }))}
          value={data.month}
          onChange={setMonth}
        />
      )}

      {data.canHide && data.month && (
        <MonthVisibility
          month={data.month}
          hidden={isHidden}
          clientRow={clientRow}
          onChanged={reload}
        />
      )}

      {blocks.length === 0 && (
        <Empty
          icon={IconPlan}
          title="Программы пока нет"
          text={data.note || (data.month
            ? `Лист «${data.month}» ещё не заполнен. Тренер создаёт программу в начале месяца.`
            : 'Тренер ещё не создал ни одного листа с программой.')}
        />
      )}

      {blocks.map((block, i) => {
        const past = blockSessions(sessions, block.title, data.month);

        return (
        <Section
          key={i}
          title={block.title}
          note={block.exercises.length + ' ' + plural(block.exercises.length, 'упражнение', 'упражнения', 'упражнений')}
        >
          <Panel>
            {/* Веса живут в журнале, а не в программе: лист месяца — это
                план, и занятие его не переписывает. Поэтому здесь не
                «сколько ты поднял», а «эту тренировку ты уже провёл» и
                прямая дорога к тому, с чем провёл. */}
            {past.length > 0 && (
              <div className="plan__done">
                <div>
                  <strong>Тренировка проведена</strong>
                  <span>
                    {formatDate(past[0].updatedAt)}
                    {past[0].done ? ' · ' + past[0].done + ' ' + plural(past[0].done, 'подход', 'подхода', 'подходов') : ''}
                    {past.length > 1 ? ' · всего занятий: ' + past.length : ''}
                  </span>
                </div>
                <button className="button" onClick={() => setWorkout({ sessionId: past[0].id })}>Посмотреть веса</button>
              </div>
            )}
            {!running && <button className="button button--primary button--block" onClick={() => setWorkout({ block, month: data.month })}>Начать тренировку</button>}
            {supersets(block.exercises).map((group, j) => (
              group.superset
                ? (
                  <div className="superset" key={j}>
                    <div className="superset__head">
                      Суперсет{group.sets ? ' · ' + group.sets + ' ' + plural(Number(group.sets), 'круг', 'круга', 'кругов') : ''}
                      <span className="superset__hint">подряд, без отдыха между упражнениями</span>
                    </div>
                    {group.items.map((ex, k) => <ExerciseRow ex={ex} inSuperset key={k} />)}
                  </div>
                )
                : <ExerciseRow ex={group.items[0]} key={j} />
            ))}
          </Panel>
        </Section>
        );
      })}

      {totalExercises > 0 && (
        <p className="small muted" style={{ marginTop: 22, textAlign: 'center' }}>
          Откройте тренировку, чтобы записывать подходы и рабочие веса
        </p>
      )}
    </>
  );
}

/**
 * Строка упражнения: название, подходы и повторы. Веса здесь нет
 * намеренно.
 *
 * В листе месяца «Вес» — это план тренера, и занятие его не переписывает:
 * лист остаётся шаблоном. Показанное рядом с упражнением число выглядело
 * как «твой рабочий вес» и жило своей жизнью — человек поднял больше, а в
 * программе всё то же самое. Настоящие веса лежат в журнале, и путь к ним
 * один: отметка «тренировка проведена» над списком.
 *
 * Внутри суперсета число подходов не повторяем у каждого: оно общее и
 * стоит в заголовке группы, а дважды написанное рядом читается как
 * «у каждого свои».
 */
function ExerciseRow({ ex, inSuperset }) {
  const scheme = [
    inSuperset ? (ex.reps && ex.reps + ' повт.') : (ex.sets && ex.sets + ' × ' + (ex.reps || '?')),
    ex.rpe && 'RPE ' + ex.rpe,
  ].filter(Boolean).join('   ·   ');

  return (
    <div className="exercise" style={{ minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div className="exercise__name">{ex.name}</div>
        <div className="exercise__scheme">{scheme || '—'}</div>
      </div>
    </div>
  );
}

/**
 * Скрыть месяц от клиента или вернуть его.
 *
 * Листы копятся годами: старые программы, месяцы без занятий, программа на
 * отпуск. Удалять их жалко — в них история, — а клиенту показывать незачем.
 * Раньше выбор был только такой: либо всё это у него в приложении, либо
 * лист удалён насовсем.
 *
 * Кнопка прячет саму вкладку в таблице клиента, а не отметку где-то рядом.
 * Поэтому и обратная сторона работает сама собой: скрыл вкладку руками в
 * таблице — месяц пропал и в приложении. Одно состояние, одно место.
 *
 * Только у тренера: сервер не пустит клиента в это действие по роли, но и
 * кнопки у него нет — решение, какие месяцы показывать, принимает не он.
 */
function MonthVisibility({ month, hidden, clientRow, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const toggle = async () => {
    setBusy(true);
    setFailure(null);
    haptic();

    try {
      await apiMutate('plan.month.visibility', { clientRow, month, hidden: !hidden });
      onChanged();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section>
      <Panel pad>
        <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {hidden
            ? `Лист «${month}» скрыт в таблице — клиент этот месяц не видит.`
            : `Лист «${month}» виден клиенту. Скрытый останется в таблице со всем содержимым.`}
        </p>

        <button className="button button--block" onClick={toggle} disabled={busy}>
          {busy ? 'Меняю…' : hidden ? 'Показать клиенту' : 'Скрыть от клиента'}
        </button>

        {failure && (
          <Note tone="critical" icon={IconAlert}>
            {failure.message || 'Не получилось изменить видимость листа'}
          </Note>
        )}
      </Panel>
    </Section>
  );
}

/* ==================================================================
 * Прогресс и замеры
 * ================================================================== */

/**
 * Прогресс и замеры — один экран и один поход на сервер.
 *
 * Данные лежат в трёх действиях: client.progress считает дельты и рост
 * рабочих весов, client.measurements отдаёт сами замеры и канонический
 * список показателей, client.nutrition — анкету, из которой нужна одна
 * цель: без неё изменение веса нечем оценить. Спрашивать их по очереди
 * нельзя: у Apps Script платит время сам факт обращения, и три запроса —
 * это три паузы подряд, а не втрое больше данных. Поэтому все действия
 * уезжают одним пакетом.
 *
 * Отказ одного действия не роняет экран: пакет отвечает по каждому
 * отдельно, и того, что доехало, хватает на большую часть страницы.
 * Незаполненная анкета — не отказ, а обычное состояние: экран тогда
 * показывает изменения без окраски.
 */
function useProgressBundle(clientRow) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const params = clientRow ? { clientRow } : {};

    setState({ loading: true, data: null, error: null });

    apiBatch([
      { action: 'client.progress', params },
      { action: 'client.measurements', params },
      { action: 'client.nutrition', params },
    ])
      .then((res) => {
        if (!alive) return;

        const progress = res['client.progress'];
        const measurements = res['client.measurements'];
        const nutrition = res['client.nutrition'];
        const okProgress = progress && progress.ok;
        const okMeasurements = measurements && measurements.ok;

        // Показывать нечего только когда не удалось ничего
        if (!okProgress && !okMeasurements) {
          setState({
            loading: false,
            data: null,
            error: (progress && progress.error)
              || (measurements && measurements.error)
              || new Error('Сервер не ответил.'),
          });
          return;
        }

        setState({
          loading: false,
          error: null,
          data: {
            progress: okProgress ? progress.data : null,
            measurements: okMeasurements ? measurements.data : null,
            goal: (nutrition && nutrition.ok && nutrition.data
              && nutrition.data.survey && nutrition.data.survey.goal) || null,
          },
        });
      })
      .catch((error) => {
        if (alive) setState({ loading: false, data: null, error });
      });

    return () => { alive = false; };
  }, [clientRow, attempt]);

  return { ...state, reload: () => setAttempt((n) => n + 1) };
}

export function Progress({ clientRow }) {
  const { loading, data, error, reload } = useProgressBundle(clientRow);
  const [field, setField] = useState('Вес');

  // Форма нового замера. Открыта или нет — состояние экрана, а не данных:
  // после записи закрывается сама и просит перечитать замеры.
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(null);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const progress = data.progress;
  const measurements = data.measurements;
  const goal = data.goal;

  // Оба действия читают одни и те же листы «Показатели» и в одном
  // порядке, поэтому дельты ложатся на замеры по позиции серии.
  const measureSeries = (measurements && measurements.series) || [];
  const progressSeries = (progress && progress.series) || [];
  const base = measureSeries.length ? measureSeries : progressSeries;

  const series = base.map((s, i) => ({
    label: s.label || '',
    rows: s.rows || [],
    deltas: (progressSeries[i] && progressSeries[i].deltas) || s.deltas || {},
  }));

  const lifts = (progress && progress.lifts) || [];
  const grew = lifts.filter((l) => l.delta > 0);
  const hasRows = series.some((s) => s.rows.length > 0);

  // Замер вносят с телефона сразу после весов, поэтому вход в форму стоит
  // первым на экране, а не под таблицами: до низа в этот момент не листают.
  const addMeasure = adding
    ? (
      <Section title="Новый замер">
        <MeasureForm
          fields={measureFields(measurements, series)}
          series={series.map((x, i) => ({
            label: x.label,
            sheetName: (measurements && measurements.series && measurements.series[i]
              && measurements.series[i].sheetName) || '',
          }))}
          clientRow={clientRow}
          onSaved={(result) => { setAdding(false); setAdded(result); reload(); }}
          onCancel={() => setAdding(false)}
        />
      </Section>
    )
    : (
      <Section>
        <Panel pad>
          {added && (
            <Note tone="good" icon={IconRuler}>
              {added.replaced
                ? 'Замер за ' + formatDate(added.date) + ' обновлён.'
                : 'Замер за ' + formatDate(added.date) + ' записан.'}
            </Note>
          )}
          <button className="button button--primary button--block" onClick={() => { setAdded(null); setAdding(true); }}>
            Записать замер
          </button>
        </Panel>
      </Section>
    );

  if (!hasRows && lifts.length === 0) {
    return (
      <>
        {addMeasure}
        <Empty
          icon={IconProgress}
          title="Прогресс пока не из чего собрать"
          text={
            (measurements && measurements.note)
            || 'Запишите первый замер — и здесь появятся динамика, изменения и таблица замеров. '
               + 'Рабочие веса подтянутся из программы месяца.'
          }
        />
      </>
    );
  }

  // Одна метрика за раз. Вес и обхваты живут в разных диапазонах: на общей
  // оси линия веса прижмётся к низу, а двух шкал на графике быть не должно.
  const fields = measureFields(measurements, series);
  const available = fields.filter((f) =>
    series.some((s) => s.rows.some((r) => r[f] !== null && r[f] !== undefined))
  );

  const activeField = available.indexOf(field) !== -1 ? field : available[0];
  const unit = activeField === 'Вес' ? ' кг' : ' см';

  const chartSeries = series.map((s) => ({
    label: s.label || 'Замеры',
    points: s.rows
      .filter((r) => r[activeField] !== null && r[activeField] !== undefined)
      .map((r) => ({ x: r.date, y: r[activeField] })),
  }));

  // Ведущая серия — первая: у сольного клиента она единственная, у
  // сплит-пары крупная цифра всё равно может быть только чья-то одна.
  const points = (chartSeries[0] && chartSeries[0].points) || [];
  const first = points.length ? points[0] : null;
  const last = points.length ? points[points.length - 1] : null;
  const change = points.length > 1 ? Math.round((last.y - first.y) * 10) / 10 : null;

  const facts = [
    change !== null
      ? {
          label: 'Изменение',
          value: <Delta value={change} suffix={unit} aim={measureAim(activeField, goal)} />,
        }
      : null,
    lifts.length
      ? { label: 'Веса выросли', value: grew.length + ' из ' + lifts.length }
      : (points.length ? { label: 'Всего замеров', value: formatNumber(points.length) } : null),
  ].filter(Boolean);

  const hasDeltas = series.some((s) => Object.keys(s.deltas).length > 0);

  return (
    <>
      {addMeasure}

      {available.length > 1 && <Chips items={available} value={activeField} onChange={setField} />}

      {hasRows ? (
        <Lead
          label={activeField}
          value={last ? formatNumber(last.y) + unit : '—'}
          hint={
            change !== null
              ? 'было ' + formatNumber(first.y) + unit + ' с ' + formatDate(first.x, false)
              : last ? 'замер от ' + formatDate(last.x) : undefined
          }
          facts={facts.length ? facts : undefined}
        />
      ) : (
        // Замеров нет, но программа месяца заполнена — вести экран нечем,
        // кроме роста весов, и это честный ответ на «что изменилось».
        <Lead
          label="Рабочие веса"
          value={grew.length + ' из ' + lifts.length}
          hint="упражнений прибавили с прошлого месяца"
          facts={progress && progress.currentMonth
            ? [{ label: 'Месяц', value: progress.currentMonth }]
            : undefined}
        />
      )}

      {hasRows && (
        <Section title="Динамика" note={'по датам замеров,' + unit}>
          <Panel pad>
            <LineChart series={chartSeries} unit={unit} />
          </Panel>
        </Section>
      )}

      {hasDeltas && (
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
                            <td className="num"><Delta value={d.delta} aim={measureAim(f, goal)} /></td>
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
        <Section
          title="Рабочие веса"
          note={(progress && progress.currentMonth ? progress.currentMonth : 'этот месяц') + ' против прошлого месяца'}
        >
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

      {/* Сырые замеры — в самом низу: до них доходят, когда нужна не
          картина, а конкретная цифра за конкретную дату */}
      {hasRows
        ? series.map((s, i) => (
            <Section key={i} title={s.label ? 'Замеры: ' + s.label : 'Замеры'}>
              <Panel pad>
                <MeasureTable rows={s.rows} fields={fields} />
              </Panel>
            </Section>
          ))
        : (
          <Section title="Замеры">
            <Panel pad>
              <Empty
                icon={IconRuler}
                text={(measurements && measurements.note)
                  || 'Замеров пока нет. Появятся, как только тренер внесёт первый.'}
              />
            </Panel>
          </Section>
        )}
    </>
  );
}

/**
 * Форма замера.
 *
 * Раньше лист «Показатели» заполнял только тренер, а приложение его
 * показывало: человек вставал на весы дома, запоминал число и ждал
 * встречи. Половина замеров так и не доезжала.
 *
 * Пустое поле здесь значит «не мерил», а не ноль, и таких полей будет
 * большинство: обхваты снимают раз в месяц, а на весы встают чаще.
 * Поэтому ничего не обязательно, кроме одного любого значения.
 *
 * Пределы вменяемости («вес 7 кг» — это 70) проверяет сервер: они уже
 * живут в двух местах, и третья копия здесь однажды разошлась бы с
 * обеими. Отказ приходит текстом, который можно показать как есть.
 */
function MeasureForm({ fields, series, clientRow, onSaved, onCancel }) {
  // Локальный день, а не UTC: в Москве после трёх ночи toISOString отдал
  // бы вчерашнее число, и замер лёг бы не в тот день.
  const today = (() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  })();

  const [date, setDate] = useState(today);

  // Лист выбирается только у сплит-пары: там серий две, а строка клиента
  // на двоих одна, и понять, кто сейчас на весах, может только человек.
  const named = series.filter((x) => x.sheetName);
  const [sheetName, setSheetName] = useState(named.length === 1 ? named[0].sheetName : '');

  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const list = (fields && fields.length ? fields : ['Вес']);
  const filled = list.filter((f) => String(values[f] || '').trim());

  const set = (name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setFailure(null);
  };

  const submit = async () => {
    if (!filled.length) {
      setFailure(new Error('Введите хотя бы один показатель.'));
      return;
    }

    if (named.length > 1 && !sheetName) {
      setFailure(new Error('Выберите, чей это замер.'));
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const payload = {};
      filled.forEach((f) => { payload[f] = String(values[f]).trim(); });

      const result = await apiMutate('measure.create', {
        ...(clientRow ? { clientRow } : {}),
        ...(sheetName ? { sheetName } : {}),
        date,
        values: payload,
      });

      onSaved(result);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad>
      <div className="survey">
        {named.length > 1 && (
          <div className="survey__group">
            <div className="survey__legend">Чей замер</div>
            <Segmented
              items={named.map((x) => ({ value: x.sheetName, label: x.label || x.sheetName }))}
              value={sheetName}
              onChange={setSheetName}
              label="Чей замер"
              disabled={busy}
            />
          </div>
        )}

        <div className="survey__group">
          <label className="field">
            <span className="field__label">Дата замера</span>
            <input
              className="field__input"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
            />
            <span className="field__hint">
              {date === today
                ? 'Сегодня. Если взвешивались раньше — поставьте тот день.'
                : 'Замер за прошедший день. Запишется этой датой.'}
            </span>
          </label>
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Показатели
            <span className="survey__legend-note">
              достаточно одного — например, только веса. Пустые поля не записываются
              и прежние значения в этой строке не трогают
            </span>
          </div>
          <div className="field-row">
            {list.map((f) => (
              <Field
                key={f}
                label={f + (f === 'Вес' ? ', кг' : ', см')}
                inputMode="decimal"
                value={values[f] || ''}
                onChange={(v) => set(f, v)}
                disabled={busy}
              />
            ))}
          </div>
        </div>
      </div>

      {failure && (
        <Note tone="critical" icon={IconAlert}>
          {failure.message || 'Не получилось записать замер'}
        </Note>
      )}

      <div className="survey__actions">
        {/* Кнопка не гаснет на незаполненной форме: погасшая кнопка не
            объясняет, чего от человека ждут, а отказ объясняет. */}
        <button className="button button--primary" onClick={submit} disabled={busy}>
          {busy ? 'Записываю…' : 'Записать'}
        </button>
        <button className="button" onClick={onCancel} disabled={busy}>Отмена</button>
      </div>
    </Panel>
  );
}

/**
 * Куда показателю полагается двигаться при выбранной цели.
 *
 * 1 — вверх, -1 — вниз, 0 — оценивать нечем. Ноль здесь не отговорка, а
 * честный ответ: выросшая рука у человека на похудении — не провал, а
 * подросшая талия на наборе массы — не то, за что стоит хвалить, и в обоих
 * случаях приложению лучше промолчать, чем назначить цвет наугад.
 *
 * «Поддержание формы» не оценивается вовсе: там любое движение в пределах
 * пары килограммов — колебание воды, а не результат.
 */
const MEASURE_AIM = {
  lose: { 'Вес': -1, 'Талия': -1 },
  gain: { 'Вес': 1, 'Грудь': 1, 'Рука': 1, 'Плечи': 1, 'Ягодицы': 1, 'Бедро': 1 },
};

function measureAim(field, goal) {
  const table = goal ? MEASURE_AIM[goal] : null;
  return (table && table[field]) || 0;
}

/**
 * Список показателей. Обычно приходит с сервера готовым — в нём и порядок,
 * и метрики, которых у клиента ещё нет. Если ответ с замерами не доехал,
 * собираем список из самих строк: ключи там в том же порядке.
 */
function measureFields(measurements, series) {
  if (measurements && measurements.fields && measurements.fields.length) return measurements.fields;

  const out = [];
  series.forEach((s) => s.rows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (k !== 'date' && out.indexOf(k) === -1) out.push(k);
    });
  }));

  return out;
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

/* Карточка клиента у тренера пока разводит «Прогресс» и «Замеры» по
   разным пунктам. Псевдоним держит её сборку живой до тех пор, пока
   пункты там не сведены в один; после этого его надо убрать. */

/* ==================================================================
 * Питание
 * ================================================================== */


/**
 * Анкета питания и посчитанная по ней норма.
 *
 * Раздел до сих пор был витриной без данных, и дело не в вёрстке: норму
 * некому было посчитать. Тренер не станет считать её вручную восемнадцати
 * клиентам, а клиент не полезет в таблицу. Поэтому здесь клиент отвечает
 * на шесть вопросов о себе, а считает и записывает таблица.
 *
 * Два состояния, и оба полноценные:
 *
 * — анкеты нет: сначала короткое объяснение, зачем это, и сразу форма.
 *   Пустое состояние с одной кнопкой «заполнить» добавило бы лишнее
 *   нажатие ровно там, где человек уже готов отвечать;
 * — анкета есть: крупно норма (ради неё и приходят), под ней ответы, по
 *   которым она получена, и дата. Без ответов рядом число нечем
 *   проверить, а вес меняется каждый месяц.
 *
 * СЧИТАЕМ НЕ ЗДЕСЬ. Формула живёт в Apps Script (src/150_OpsApi.js) — там
 * же, где строка клиента. Вторая её копия во фронте однажды разошлась бы
 * с первой, причём молча. Отсюда же правило про справочники: уровни
 * активности и цели приезжают ответом сервера, а не лежат в этом файле,
 * потому что это часть той же шкалы, по которой идёт расчёт.
 *
 * Этот же экран тренер открывает в карточке клиента — тогда приезжает
 * clientRow, и анкету можно заполнить за того, кто приложением не
 * пользуется.
 */
export function Nutrition({ clientRow, clientView = false }) {
  const { loading, data, error, reload } = useData(
    'client.nutrition', clientRow ? { clientRow } : {}, [clientRow]
  );

  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(null);
  const [ration, setRation] = useState(false);

  // Тренер переключается между клиентами в одной и той же карточке, и
  // экран при этом не размонтируется. Без сброса «норма записана» осталось
  // бы висеть над анкетой следующего клиента — сообщение о чужом действии
  // на чужих цифрах.
  useEffect(() => {
    setSaved(null);
    setEditing(false);
    setRation(false);
  }, [clientRow]);

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  // clientRow выбирает данные, но не должен сам по себе менять интерфейс:
  // в предпросмотре тренер работает с выбранным клиентом именно как клиент.
  const byTrainer = !!clientRow && !clientView;
  const configured = !!data.configured;
  const options = data.options;
  const survey = data.survey || null;
  const targets = data.targets || {};

  // Варианты нормы считает таблица и присылает готовыми. Пусто — значит
  // анкету заполнили до того, как появился выбор темпа: показываем норму
  // без переключателя, ровно как раньше, и ничего не выдумываем.
  const plans = Array.isArray(data.plans) ? data.plans : [];

  // Ответ без справочников — это либо очень старый кэш, либо развёртывание
  // Apps Script, отставшее от кода. Рисовать форму нечем: список уровней
  // активности придумывать здесь нельзя, он часть расчёта.
  if (!options || !options.activity || !options.goal) {
    return (
      <Empty
        icon={IconNutrition}
        title="Анкета недоступна"
        text={'Сервер не прислал варианты для формы.\n\nОбновите приложение или проверьте развёртывание Apps Script.'}
      />
    );
  }

  const showForm = editing || !configured;

  // Экран рациона занимает всё место: это отдельная работа в три шага, и
  // норма над ней превратилась бы в шапку, которую человек прокручивает
  // мимо. Возврат — кнопкой «К норме» внутри самого экрана.
  //
  // В режиме просмотра он не открывается совсем (см. ниже про clientView):
  // открытый, он показал бы тренеру его собственный холодильник под именем
  // клиента.
  if (ration && configured && !clientView) {
    return <Ration targets={targets} onClose={() => setRation(false)} />;
  }

  const onSaved = (result) => {
    setSaved(result);
    setEditing(false);
    // Перечитываем с сервера, а не правим показанное на месте: тренер
    // вправе поправить норму в таблице руками, и экран обязан показывать
    // её, а не то, что следует из формулы.
    reload();
  };

  return (
    <>
      {configured && (
        <Lead
          label="Суточная норма"
          value={formatNumber(targets.kcal) + ' ккал'}
          hint={survey && survey.goalLabel ? survey.goalLabel : undefined}
          facts={[
            { label: 'Белки', value: grams(targets.protein) },
            { label: 'Жиры', value: grams(targets.fat) },
            { label: 'Углеводы', value: grams(targets.carbs) },
          ]}
        />
      )}

      {saved && !editing && (
        <Section>
          <Note tone="good">
            Норма посчитана и записана в таблицу
            {saved.clientName ? ' — ' + saved.clientName : ''}.
            {byTrainer ? '' : ' Тренер получил уведомление.'}
          </Note>
        </Section>
      )}

      {/* Поправки расчёта приезжают только в ответе на запись: по ним видно,
          почему получилось не ровно то, что следует из цели. Промолчать о
          них значило бы оставить человека с необъяснимым числом. */}
      {saved && !editing && saved.notes && saved.notes.length > 0 && (
        <Section>
          <Note tone="info">
            {saved.notes.map((text, i) => <div key={i}>{text}</div>)}
          </Note>
        </Section>
      )}

      {/* Выбор темпа — сразу под нормой: именно он её и определяет.
          Одного варианта не показываем: у поддержания формы темпа нет, и
          одинокая карточка притворялась бы выбором. */}
      {configured && !editing && plans.length > 1 && (
        <PaceChooser
          plans={plans}
          pace={data.pace}
          clientRow={clientRow}
          onChanged={onSaved}
        />
      )}

      {/* Рацион открывает только сам клиент. Продукты и «нравится» лежат в
          хранилище УСТРОЙСТВА, а не в таблице: это черновик, который человек
          меняет каждый день.

          Отсюда два разных случая, и путать их нельзя.

          В карточке клиента у тренера (byTrainer) раздела нет вовсе: там
          тренер работает с чужими данными, и кнопка обещала бы то, чего
          сделать не может.

          В режиме просмотра (clientView) блок показывается — тренер должен
          видеть, что у клиента здесь есть раздел, в этом и смысл режима, —
          но не открывается. Открытый, он брал бы продукты и выбор блюд с
          устройства ТРЕНЕРА и показывал их как рацион клиента: экран из
          чужой еды, посчитанный под чужую норму. */}
      {configured && !editing && !byTrainer && (
        <Section>
          <Panel pad>
            <h3 style={{ margin: '0 0 6px', fontSize: 'var(--text-md)', fontWeight: 640 }}>
              Что приготовить из того, что дома
            </h3>
            <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
              Отметьте продукты, которые есть, — приложение подберёт блюда,
              соберёт из них день под вашу норму и покажет, что докупить.
            </p>
            {clientView ? (
              <Note tone="info">
                Отсюда клиент открывает подбор блюд. В режиме просмотра он не
                откроется: продукты и выбранные блюда хранятся на устройстве
                клиента, а не в таблице.
              </Note>
            ) : (
              <button className="button button--block button--primary" onClick={() => setRation(true)}>
                Собрать рацион
              </button>
            )}
          </Panel>
        </Section>
      )}

      {configured && !editing && survey && (
        <Section title="Анкета" note="по этим ответам посчитана норма">
          <Panel>
            <Rows>
              <Row label="Возраст">
                {survey.age} {plural(survey.age, 'год', 'года', 'лет')}
              </Row>
              <Row label="Вес">{formatNumber(survey.weight)} кг</Row>
              <Row label="Рост">{formatNumber(survey.height)} см</Row>
              <Row label="Пол">{survey.sex === 'm' ? 'мужской' : 'женский'}</Row>
              <Row label="Активность">{survey.activityLabel || survey.activity}</Row>
              <Row label="Цель">{survey.goalLabel || survey.goal}</Row>
              {survey.paceLabel && <Row label="Темп">{survey.paceLabel}</Row>}
              {data.filledAt && (
                <Row label="Заполнено">
                  {formatDate(data.filledAt)} · {relativeDays(data.filledAt)}
                </Row>
              )}
            </Rows>
          </Panel>
        </Section>
      )}

      {configured && !editing && (
        <Section>
          <Panel pad>
            <p className="small muted" style={{ marginTop: 0, marginBottom: 12 }}>
              Изменился вес или цель — заполните анкету заново, норма пересчитается.
            </p>
            <button className="button button--block" onClick={() => setEditing(true)}>
              Заполнить заново
            </button>
          </Panel>
        </Section>
      )}

      {!configured && !editing && (
        <Section>
          <Note tone="info" icon={IconNutrition}>
            {byTrainer
              ? 'Клиент ещё не заполнил анкету. Её можно заполнить за него — норма посчитается и ляжет в таблицу так же, как если бы он сделал это сам.'
              : 'Шесть ответов о себе — и вы увидите суточную норму калорий и БЖУ. Считает её таблица, тренер получит результат сразу.'}
          </Note>
        </Section>
      )}

      {showForm && (
        <Section title={configured ? 'Заполнить заново' : 'Анкета'}>
          <NutritionForm
            options={options}
            survey={survey}
            clientRow={clientRow}
            onSaved={onSaved}
            onCancel={configured ? () => setEditing(false) : null}
          />
        </Section>
      )}
    </>
  );
}

/**
 * Выбор темпа: три варианта нормы.
 *
 * До этого цель сразу означала край шкалы — «Похудение» выдавало минус
 * пятую часть расхода, самый жёсткий вариант из возможных. Человек видел
 * одно число и не догадывался, что у него есть выбор; не выдержав, он
 * бросал не темп, а питание целиком.
 *
 * Числа не считаем: они приезжают готовыми из таблицы, посчитанные тем же
 * кодом, что и сама норма. Здесь только показ и отправка выбора.
 *
 * Выбор уходит сразу по нажатию, без кнопки «Сохранить»: вариантов три,
 * выбор один, и подтверждать тут нечего. Пока запрос в пути, список
 * заблокирован целиком — иначе нетерпеливый палец отправит два выбора
 * подряд, и в таблицу ляжет тот, что ответил последним.
 */
function PaceChooser({ plans, pace, clientRow, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);

  const choose = async (id) => {
    if (busy || id === pace) return;

    setBusy(id);
    setFailure(null);
    haptic();

    try {
      const result = await apiMutate('nutrition.pace', {
        ...(clientRow ? { clientRow } : {}),
        pace: id,
      });
      onChanged(result);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Темп" note="насколько быстро идём к цели">
      <div className="options" role="radiogroup" aria-label="Темп">
        {plans.map((plan) => {
          const active = plan.id === pace;

          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={'option option--pace' + (active ? ' option--active' : '')}
              onClick={() => choose(plan.id)}
              disabled={!!busy}
            >
              <span className="option__mark">{active && <IconCheck size={12} />}</span>
              <span className="option__body">
                <span className="option__top">
                  <span>{plan.label}{plan.note ? ' · ' + plan.note : ''}</span>
                  <span className="option__kcal">
                    {busy === plan.id ? '…' : formatNumber(plan.kcal) + ' ккал'}
                  </span>
                </span>
                <span className="option__hint">
                  Б {plan.protein} · Ж {plan.fat} · У {plan.carbs} г
                  {plan.hint ? ' — ' + plan.hint : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {failure && (
        <Note tone="critical" icon={IconAlert}>
          {failure.message || 'Не получилось сменить темп'}
        </Note>
      )}
    </Section>
  );
}

/** «169 г» — единица прижата к числу: иначе ряд фактов читается как
 *  список голых чисел, и белки от углеводов отличает только подпись */
function grams(value) {
  return value === null || value === undefined ? '—' : formatNumber(value) + ' г';
}

/**
 * Форма анкеты.
 *
 * Проверка здесь — вежливость, а не защита: сервер и Apps Script проверяют
 * то же самое у себя, и окончательный отказ всегда их. Смысл местной
 * проверки в том, чтобы про «рост 1,75» человек узнал сразу, а не через
 * несколько секунд ожидания Apps Script, и чтобы мусор не уезжал в таблицу
 * вовсе.
 *
 * Границы полей берём из ответа сервера (options.limits), а не пишем
 * числами здесь: разойдись они — форма начнёт обещать то, чего сервер не
 * примет. Границ в ответе нет — местная проверка их просто не делает, и
 * последнее слово остаётся за сервером.
 */
function NutritionForm({ options, survey, clientRow, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    age: survey && survey.age ? String(survey.age) : '',
    weight: survey && survey.weight ? String(survey.weight) : '',
    height: survey && survey.height ? String(survey.height) : '',
    sex: (survey && survey.sex) || '',
    activity: (survey && survey.activity) || '',
    goal: (survey && survey.goal) || '',
  }));

  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const inputs = useRef({});
  const limits = options.limits || {};

  // До первой попытки отправить молчим: подчёркивать красным поле, в
  // которое человек ещё не дописал, — значит ругаться на него за то, что
  // он печатает. После неё, наоборот, пересчитываем на каждый знак: он
  // уже знает про ошибку и сейчас её чинит.
  const set = (field, value) => {
    const next = { ...form, [field]: value };
    setForm(next);
    if (attempted) setErrors(validateSurvey(next, limits));
    setFailure(null);
  };

  const submit = async () => {
    const found = validateSurvey(form, limits);

    setAttempted(true);
    setErrors(found);
    setFailure(null);

    const bad = Object.keys(found);
    if (bad.length) {
      // Ошибка может оказаться выше края экрана — уводим к ней сами,
      // иначе нажатие выглядит как «кнопка не работает»
      const node = inputs.current[bad[0]];
      if (node && node.focus) node.focus();
      return;
    }

    setBusy(true);
    try {
      const result = await apiMutate('nutrition.save', {
        ...(clientRow ? { clientRow } : {}),
        age: form.age,
        weight: form.weight,
        height: form.height,
        sex: form.sex,
        activity: form.activity,
        goal: form.goal,
      });
      onSaved(result);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel pad>
      <div className="survey">
        <div className="survey__group">
          <div className="field-row">
            <Field
              label="Возраст, лет"
              placeholder="34"
              value={form.age}
              onChange={(v) => set('age', v)}
              error={errors.age}
              disabled={busy}
              inputRef={(el) => { inputs.current.age = el; }}
            />
            <Field
              label="Вес, кг"
              placeholder="76,9"
              inputMode="decimal"
              value={form.weight}
              onChange={(v) => set('weight', v)}
              error={errors.weight}
              disabled={busy}
              inputRef={(el) => { inputs.current.weight = el; }}
            />
            <Field
              label="Рост, см"
              placeholder="175"
              value={form.height}
              onChange={(v) => set('height', v)}
              error={errors.height}
              disabled={busy}
              inputRef={(el) => { inputs.current.height = el; }}
            />
          </div>
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Пол
            <span className="survey__legend-note">
              без него основной обмен не считается
            </span>
          </div>
          <Segmented
            items={options.sexes || []}
            value={form.sex}
            onChange={(v) => set('sex', v)}
            label="Пол"
            disabled={busy}
          />
          {errors.sex && <span className="field__error">{errors.sex}</span>}
        </div>

        <div className="survey__group">
          <div className="survey__legend">
            Уровень активности
            <span className="survey__legend-note">
              считайте все тренировки за неделю, не только с тренером
            </span>
          </div>
          <Options
            items={options.activity}
            value={form.activity}
            onChange={(v) => set('activity', v)}
            label="Уровень активности"
            disabled={busy}
          />
          {errors.activity && <span className="field__error">{errors.activity}</span>}
        </div>

        <div className="survey__group">
          <div className="survey__legend">Цель</div>
          <Options
            items={options.goal}
            value={form.goal}
            onChange={(v) => set('goal', v)}
            label="Цель"
            disabled={busy}
          />
          {errors.goal && <span className="field__error">{errors.goal}</span>}
        </div>

        {/* Отказ сервера показываем его же словами: он называет и поле, и
            что с ним не так. Переписывать это здесь значило бы завести
            второй словарь ошибок, который однажды отстанет от первого. */}
        {failure && <Note tone="critical">{failure.message}</Note>}

        <div className="survey__actions">
          <button
            className="button button--primary button--block"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Считаем…' : 'Посчитать норму'}
          </button>

          {onCancel && (
            <button className="button button--block" onClick={onCancel} disabled={busy}>
              Отмена
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * Проверка анкеты до отправки.
 *
 * Повторяет серверную (server/src/lib/nutrition.js) по существу, но не
 * дословно: под полем на телефоне помещается строка, а не предложение.
 * Совпадать обязано то, ЧТО отклоняется, а не какими словами.
 */
function validateSurvey(form, limits) {
  const found = {};

  const age = parseField(form.age);
  if (age === null) found.age = 'Укажите возраст';
  else if (Number.isNaN(age) || age <= 0) found.age = 'Нужно число';
  else if (outOfRange(age, limits.age)) found.age = range(limits.age, 'лет');

  const weight = parseField(form.weight);
  if (weight === null) found.weight = 'Укажите вес';
  else if (Number.isNaN(weight) || weight <= 0) found.weight = 'Нужно число';
  else if (outOfRange(weight, limits.weight)) found.weight = range(limits.weight, 'кг');

  const height = parseField(form.height);
  if (height === null) found.height = 'Укажите рост';
  else if (Number.isNaN(height) || height <= 0) found.height = 'Нужно число';
  // Самая частая опечатка формы: в телефоне привычнее «1,75». Молча
  // умножать на сто нельзя — подмена однажды угадает неправильно, а
  // перепроверять посчитанную норму никто не станет.
  else if (height > 1.2 && height < 2.3) found.height = 'В сантиметрах: 175, а не 1,75';
  else if (outOfRange(height, limits.height)) found.height = range(limits.height, 'см');

  if (!form.sex) found.sex = 'Выберите пол';
  if (!form.activity) found.activity = 'Выберите уровень активности';
  if (!form.goal) found.goal = 'Выберите цель';

  return found;
}

/** null — пусто, NaN — не число, иначе само число. Запятая как у сервера */
function parseField(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw).replace(',', '.').trim();
  if (!s) return null;
  return Number(s);
}

function outOfRange(value, limit) {
  if (!limit || limit.min === undefined || limit.max === undefined) return false;
  return value < limit.min || value > limit.max;
}

function range(limit, unit) {
  return 'От ' + limit.min + ' до ' + limit.max + ' ' + unit;
}
