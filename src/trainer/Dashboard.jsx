import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import {
  Section, Panel, Rows, Loading, ErrorState, Empty, Field, Sheet, Segmented,
  formatNumber, formatMoney, plural,
} from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { haptic } from '../telegram.js';
import { IconCheck, IconChevron } from '../icons.jsx';
import { monthLabel, format } from './Metrics.jsx';
import { SIGNALS, SummarySignalSheet } from './SummarySignals.jsx';

/**
 * Обзор — первая вкладка сводки. То, ради чего в неё заглядывают:
 *
 *   1. Темп месяца. Выручка к сегодняшнему числу против того же числа
 *      прошлого месяца. «216 850 против 340 250» в середине месяца —
 *      всегда провал; «к 15-му — на 8 % больше, чем к 15 сентября» —
 *      честная цифра, по которой понятно, идёт месяц или нет.
 *   2. Четыре стороны BSC с целью у каждой — лист «BSC_Дашборд» из
 *      таблицы: деньги, клиенты, процессы, занятия. Строка ведёт на свою
 *      вкладку, где цифра разобрана подробнее.
 *   3. Год к цели: сколько заработано с января и куда выйдем при том же
 *      темпе.
 *   4. Сигналы — ежемесячные дела из листа «Горизонты» («замеры всем, у
 *      кого прошло четыре недели», «разбор клиентов с разрывом»), только
 *      с именами и сразу в карточку клиента, а не пункт, который надо
 *      не забыть первого числа.
 *
 * Цели (норма) задаются здесь же, листом, — это единственное, что в
 * сводке вводится руками: всё остальное сервер считает сам.
 */

/* ==================================================================
 * Цели
 * ================================================================== */

/**
 * Какие цели можно задать и как их показывать. Порядок — как на экране.
 * `aim: -1` — хорошо, когда меньше (доля отмен).
 */
export const GOALS = [
  { id: 'averageCheck', label: 'Средняя оплата', unit: '₽', side: 'finance', group: 'finance', hint: 'за одну оплату' },
  { id: 'revenueYear', label: 'Выручка за год', unit: '₽', side: 'finance', year: true },
  { id: 'retention', label: 'Удержание', unit: '%', side: 'clients', group: 'clients', hint: 'остались с прошлого месяца' },
  { id: 'referralShare', label: 'Доля по рекомендации', unit: '%', side: 'marketing', group: 'marketing', hint: 'из новых с отмеченным источником' },
  { id: 'measuredShare', label: 'Доля с замером', unit: '%', side: 'process', group: 'process', hint: 'из тех, кто ходит' },
  { id: 'cancelShare', label: 'Доля отмен', unit: '%', side: 'process', group: 'process', aim: -1, hint: 'не больше' },
  { id: 'activeClients', label: 'Клиентов в работе', unit: 'чел', side: 'clients', group: 'process' },
];

/** Цели клиентов, занятий и источников ведут в объединённый раздел. */
const SIDES = {
  finance: { label: 'Деньги', pane: 'finance' },
  clients: { label: 'Клиенты', pane: 'clients' },
  marketing: { label: 'Маркетинг', pane: 'clients' },
  process: { label: 'Занятия', pane: 'processes' },
};

/** Насколько цифра дошла до цели: 0…100, у «не больше» — обратный смысл */
function progress(value, target, aim = 1) {
  if (value === null || value === undefined || !target) return null;
  if (aim < 0) return value <= target ? 100 : Math.max(0, Math.round((target / value) * 100));
  return Math.min(100, Math.round((value / target) * 100));
}

function reached(value, target, aim = 1) {
  if (value === null || value === undefined || !target) return false;
  return aim < 0 ? value <= target : value >= target;
}

/** «до цели 954 ₽» / «цель достигнута» / «цель не задана» */
function toGoal(value, target, unit, aim = 1) {
  if (!target) return 'цель не задана';
  if (value === null || value === undefined) return 'цель ' + format(target, unit);
  if (reached(value, target, aim)) return 'цель ' + format(target, unit) + ' — есть';
  const gap = aim < 0 ? value - target : target - value;
  return 'до цели ' + format(gap, unit) + ' из ' + format(target, unit);
}

/**
 * Лист с целями. Пустое поле снимает цель. Отправляется всё разом, одним
 * действием: цели меняют раз в год, и шесть отдельных «сохранить» были бы
 * шестью лишними нажатиями.
 */
function GoalsSheet({ targets, onClose, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(
    GOALS.map((g) => [g.id, targets[g.id] === undefined || targets[g.id] === null ? '' : String(targets[g.id])]),
  ));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      const data = await apiMutate('trainer.metrics.targets.set', { targets: values });
      haptic('success');
      onSaved(data && data.targets ? data.targets : {});
      onClose();
    } catch (err) {
      setProblem(err.message || 'Не получилось сохранить.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Цели" onClose={onClose} onDone={save} done={busy ? 'Сохраняем…' : 'Сохранить'} dirty locked={busy}>
      <p className="small muted goals__intro">
        Норма, с которой сравнивается каждая цифра. Пустое поле — цели нет.
        Месячные цели — на месяц, выручка — на год.
      </p>
      <div className="goals__form">
        {GOALS.map((g) => (
          <Field
            key={g.id}
            label={g.label + (g.unit === '%' ? ', %' : g.unit === '₽' ? ', ₽' : '')}
            inputMode="decimal"
            hint={g.hint}
            value={values[g.id]}
            onChange={(v) => setValues((prev) => ({ ...prev, [g.id]: v }))}
            placeholder="—"
            disabled={busy}
          />
        ))}
      </div>
      {problem && <p className="small form__error" role="alert">{problem}</p>}
    </Sheet>
  );
}

/* ==================================================================
 * Сигналы
 * ================================================================== */

/* ==================================================================
 * Обзор
 * ================================================================== */

/** «к 20-му» и «к 20 сентября»: день в сравнении — с месяцем в родительном падеже */
const byDay = (day) => 'к ' + day + '-му';
const MONTHS_OF = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const dayOf = (day, month) => {
  const m = Number(String(month || '').slice(5, 7));
  return 'к ' + day + (MONTHS_OF[m - 1] ? ' ' + MONTHS_OF[m - 1] : '');
};

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DYNAMICS = [
  { value: 'revenue', label: 'Выручка', group: 'finance', id: 'revenue', format: formatMoney },
  { value: 'clients', label: 'Клиенты', group: 'process', id: 'activeClients', format: (v) => formatNumber(v, 0) },
  { value: 'trainings', label: 'Занятия', group: 'process', id: 'trainings', format: (v) => formatNumber(v, 0) },
];

function shortMonth(key) {
  const month = Number(String(key || '').split('-')[1]);
  return SHORT_MONTHS[month - 1] || key;
}

/** История только из серверного ряда: никаких условных значений из макета. */
function Dynamics() {
  const [metric, setMetric] = useState('revenue');
  const { loading, data, error, reload } = useData('trainer.metrics.series', { by: 'month' }, []);
  const spec = DYNAMICS.find((item) => item.value === metric) || DYNAMICS[0];

  let chart;
  if (loading) chart = <Loading rows={2} />;
  else if (error) chart = <ErrorState error={error} onRetry={reload} />;
  else {
    const points = (data.points || []).slice(-6).map((point) => ({
      key: point.key,
      label: monthLabel(point.key),
      short: shortMonth(point.key),
      partial: point.partial,
      value: point[spec.group] ? point[spec.group][spec.id] : null,
    }));
    const newestFirst = points.slice().reverse();
    const partial = newestFirst.find((point) => point.partial);
    const complete = newestFirst.find((point) => !point.partial && point.value !== null && point.value !== undefined);
    chart = (
      <>
        <BarChart points={points} format={spec.format} label={spec.label} plain compact height={110} highlight={(complete || points.at(-1))?.key} />
        {partial && <p className="small muted overview-chart__note">{monthLabel(partial.key) + ' ещё не закончился — пунктиром.'}</p>}
      </>
    );
  }

  return (
    <Panel pad className="overview-chart">
      <Segmented
        items={DYNAMICS}
        value={metric}
        onChange={(next) => { setMetric(next); haptic(); }}
        label="Показатель графика"
      />
      <div className="overview-chart__plot">{chart}</div>
    </Panel>
  );
}

function deviationScore(value, target, aim) {
  if (!target || value === null || value === undefined || reached(value, target, aim)) return null;
  return Math.abs(value - target) / Math.abs(target);
}

export function Dashboard({ onGo, onOpenClient }) {
  const { loading, data, error, reload } = useData('trainer.metrics.overview', {}, []);
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState(null);
  const [activeSignal, setActiveSignal] = useState(null);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const goals = targets || data.targets || {};
  const f = data.finance.now;
  const c = (data.clients && data.clients.now) || {};
  const p = data.process.now;
  const pace = data.pace || {};
  const profit = format(f.profit, '₽');

  // Темп сравниваем с тем же числом прошлого месяца.
  const diff = pace.revenue ? Math.round(((f.revenue - pace.revenue) / pace.revenue) * 100) : null;
  const then = dayOf(pace.day, pace.month);
  const paceHint = diff === null
    ? (f.revenue ? then + ' занятий не было' : 'занятий в этом месяце ещё не было')
    : diff === 0
      ? 'столько же, сколько ' + then
      : then + ' было ' + format(pace.revenue, '₽');

  // Старые ответы могут не содержать источников клиентов.
  const m = (data.marketing && data.marketing.now) || {};
  const values = { finance: f, clients: c, process: p, marketing: m };

  const year = data.year || {};
  const yearTarget = goals.revenueYear;
  const yearBar = progress(year.revenue, yearTarget);
  const yearDone = reached(year.revenue, yearTarget);

  const signals = SIGNALS.map((s) => ({ ...s, list: (data.signals && data.signals[s.id]) || [] }));
  const signalCount = signals.reduce((sum, signal) => sum + signal.list.length, 0);

  const deviations = GOALS
    .filter((goal) => !goal.year)
    .map((goal) => {
      const value = values[goal.group][goal.id];
      const target = goals[goal.id];
      const aim = goal.aim || 1;
      return { goal, value, target, score: deviationScore(value, target, aim) };
    })
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  return (
    <>
      <div className="overview-head">
        <span className="overview-head__period">{monthLabel(data.month)}</span>
        <button type="button" className="button button--ghost button--small" onClick={() => { setEditing(true); haptic(); }}>
          Цели · изменить
        </button>
      </div>

      <Panel pad className="overview-pace summary-hero summary-hero--accent">
        <div className="overview-pace__head">
          <span className="overview-pace__label">{'Выручка ' + byDay(pace.day || new Date().getDate())}</span>
          {diff !== null && <span className="overview-pace__delta">{diff > 0 ? '↑ ' : diff < 0 ? '↓ ' : ''}{Math.abs(diff)}%</span>}
        </div>
        <strong className="overview-pace__value">{format(f.revenue, '₽')}</strong>
        <p className="overview-pace__hint">{paceHint}</p>
        <div className="overview-pace__facts">
          <span><small>Занятий</small><b>{formatNumber(f.trainings, 0)}</b></span>
          <span><small>Прибыль</small><b className="summary-fact-amount" style={{ '--amount-length': profit.length }}>{profit}</b></span>
          <span><small>Клиентов</small><b>{formatNumber(f.activeClients, 0)}</b></span>
        </div>
      </Panel>

      <Section title="Требуют внимания" note={signalCount ? signalCount + ' ' + plural(signalCount, 'сигнал', 'сигнала', 'сигналов') : 'всё в порядке'}>
        {signalCount ? <div className="overview-signals">
          {signals.map((signal) => (
            <button
              key={signal.id}
              type="button"
              className="overview-signal"
              data-signal={signal.id}
              data-empty={signal.list.length === 0 ? '' : undefined}
              aria-label={signal.label + ': ' + signal.list.length}
              onClick={() => { setActiveSignal(signal.id); haptic(); }}
            >
              <span className="overview-signal__count">{signal.list.length}</span>
              <span className="overview-signal__label">{signal.label}<IconChevron size={14} className="side__chevron" /></span>
            </button>
          ))}
        </div> : <p className="summary-empty">Сейчас нет клиентов, которым требуется внимание.</p>}
      </Section>

      <Section title="Динамика" note="6 месяцев">
        <Dynamics />
      </Section>

      <details className="metrics-more">
        <summary>Цели и годовой итог</summary>
        <Section title="Отклонения от целей" note={deviations.length ? 'главное на сейчас' : 'цели выполнены'}>
          {deviations.length ? (
            <div className="overview-deviations">
              {deviations.map(({ goal, value, target }) => (
                <button key={goal.id} type="button" className="overview-deviation" onClick={() => onGo(SIDES[goal.side].pane)}>
                  <strong>{format(value, goal.unit)}</strong>
                  <span>{goal.label}</span>
                  <small>{'цель ' + (goal.aim < 0 ? 'не больше ' : '') + format(target, goal.unit)}<IconChevron size={14} className="side__chevron" /></small>
                </button>
              ))}
            </div>
          ) : (
            <Panel><Empty icon={IconCheck} title="Цели выполнены" text="Сейчас отклонений по заданным целям нет." /></Panel>
          )}
        </Section>

        <Section title={'Год · ' + year.year} note="выручка с января">
          <Panel pad className="year">
            <div className="year__row">
              <span className="year__value">{formatMoney(year.revenue || 0)}</span>
              {yearTarget ? (
                <span className={'side__goal' + (yearDone ? ' side__goal--done' : '')}>
                  {yearDone && <IconCheck size={12} />}
                  {toGoal(year.revenue, yearTarget, '₽')}
                </span>
              ) : null}
            </div>
            {yearBar !== null && (
              <span className={'bar' + (yearDone ? ' bar--done' : '')} role="progressbar" aria-valuenow={yearBar} aria-valuemin={0} aria-valuemax={100}>
                <span className="bar__fill" style={{ width: yearBar + '%' }} />
              </span>
            )}
            {year.forecast ? (
              <p className="small muted year__forecast">
                {'При том же темпе к концу года — около ' + formatMoney(year.forecast)
                  + (yearTarget ? (year.forecast >= yearTarget ? ': цель по силам.' : ', цель ' + formatMoney(yearTarget) + ' при таком темпе не выйдет.') : '.')}
              </p>
            ) : null}
          </Panel>
        </Section>
      </details>

      {activeSignal && <SummarySignalSheet id={activeSignal} signals={data.signals}
        onOpenClient={onOpenClient} onClose={() => setActiveSignal(null)} />}

      {editing && (
        <GoalsSheet
          targets={goals}
          onClose={() => setEditing(false)}
          onSaved={(saved) => setTargets(saved)}
        />
      )}
    </>
  );
}
