import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import {
  Lead, Section, Panel, Rows, Loading, ErrorState, Empty, Delta, Field, Sheet, Tag,
  formatNumber, formatMoney, formatDate, plural,
} from '../ui.jsx';
import { haptic } from '../telegram.js';
import { IconCheck, IconPhone, IconMoney, IconRuler, IconPlan, IconChevron } from '../icons.jsx';
import { monthLabel, format } from './Metrics.jsx';

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
  { id: 'learningHours', label: 'Часов обучения', unit: 'ч', side: 'development', group: 'development', hint: 'за месяц' },
  { id: 'activeClients', label: 'Клиентов в работе', unit: 'чел', side: 'clients', group: 'process' },
];

/** Пять сторон BSC из листов; «Маркетинг» живёт на вкладке клиентов,
 *  «Развитие» — на процессах */
const SIDES = {
  finance: { label: 'Деньги', pane: 'finance' },
  clients: { label: 'Клиенты', pane: 'clients' },
  marketing: { label: 'Маркетинг', pane: 'clients' },
  process: { label: 'Процессы', pane: 'processes' },
  development: { label: 'Развитие', pane: 'processes' },
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
 * Стороны
 * ================================================================== */

/**
 * Одна сторона: ключевая цифра, изменение к прошлому месяцу и полоса до
 * цели. Строка — кнопка на вкладку стороны. Полоса есть только у цифры с
 * целью: без цели мерить нечем, и пустая полоса читалась бы как ноль.
 */
function SideRow({ goal, value, was, target, onGo }) {
  const unit = goal.unit;
  const known = value !== null && value !== undefined;
  const aim = goal.aim || 1;
  const done = reached(value, target, aim);
  const bar = progress(value, target, aim);

  return (
    <button type="button" className="rows__item rows__item--pick side" onClick={() => onGo(SIDES[goal.side].pane)}>
      <span className="side__text">
        <span className="side__who">{SIDES[goal.side].label}</span>
        <span className="side__what">{goal.label}</span>
        <span className={'side__goal' + (done ? ' side__goal--done' : '')}>
          {done && <IconCheck size={12} />}
          {toGoal(known ? value : null, target, unit, aim)}
        </span>
        {bar !== null && (
          <span className={'bar' + (done ? ' bar--done' : '')} role="progressbar" aria-valuenow={bar} aria-valuemin={0} aria-valuemax={100}>
            <span className="bar__fill" style={{ width: bar + '%' }} />
          </span>
        )}
      </span>
      <span className="side__value">
        {known ? (
          <span className="metric">
            <span className="metric__value">{format(value, unit)}</span>
            {was !== null && was !== undefined && was !== value && (
              <Delta value={value - was} suffix={unit === '%' ? '%' : ''} aim={aim} />
            )}
          </span>
        ) : <span className="muted small">пока нет</span>}
        <IconChevron size={16} className="side__chevron" />
      </span>
    </button>
  );
}

/* ==================================================================
 * Сигналы
 * ================================================================== */

const dayWord = (n) => n + ' ' + plural(n, 'день', 'дня', 'дней');

/**
 * Список людей, по которому можно нажать: имя и в чём дело. Пара сплита —
 * одной строкой с меткой: занятия, деньги и программа у неё общие.
 */
function People({ list, note, onOpen, at }) {
  return (
    <Panel>
      <Rows>
        {list.map((c) => (
          <button type="button" key={c.row} className="rows__item rows__item--pick person" onClick={() => onOpen({ row: c.row, name: c.name }, at)}>
            <span className="rows__label person__name">{c.name}{c.split && <Tag>сплит</Tag>}</span>
            <span className="rows__value person__note">{note(c)}<IconChevron size={16} className="side__chevron" /></span>
          </button>
        ))}
      </Rows>
    </Panel>
  );
}

const SIGNALS = [
  {
    id: 'silent', Icon: IconPhone, at: 'overview',
    title: (n) => 'Молчат · ' + n,
    note: 'месяц без занятий — пора позвонить',
    line: (c) => (c.days === null ? 'занятий не было' : dayWord(c.days) + ' без занятий') + (c.nextAt ? ' · записан на ' + formatDate(c.nextAt, false) : ''),
  },
  {
    id: 'packages', Icon: IconMoney, at: 'payments',
    title: (n) => 'Пакет кончается · ' + n,
    note: 'осталось одно занятие или уже долг',
    // Деньги у плательщика (семья, пара) — так и пишем: звонить ему
    line: (c) => (c.payer ? 'платит ' + c.payer + ' · ' : '')
      + (c.balance < 0 ? 'долг ' + formatMoney(-c.balance) : c.left <= 0 ? 'занятий не осталось' : 'осталось 1 занятие'),
  },
  {
    id: 'measureDue', Icon: IconRuler, at: 'progress',
    title: (n) => 'Пора снять замер · ' + n,
    note: 'ходят, а замера не было четыре недели',
    line: (c) => (c.days === null ? 'замера ещё не было' : 'замер ' + dayWord(c.days) + ' назад'),
  },
  {
    id: 'noPlan', Icon: IconPlan, at: 'plan',
    title: (n) => 'Нет программы на месяц · ' + n,
    note: 'ходят, а расклада на этот месяц нет',
    line: () => 'программы нет',
  },
];

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

export function Dashboard({ onGo, onOpenClient }) {
  const { loading, data, error, reload } = useData('trainer.metrics.overview', {}, []);
  const [editing, setEditing] = useState(false);
  const [targets, setTargets] = useState(null);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const goals = targets || data.targets || {};
  const f = data.finance.now;
  const fb = data.finance.before;
  const c = (data.clients && data.clients.now) || {};
  const cb = (data.clients && data.clients.before) || {};
  const p = data.process.now;
  const pb = data.process.before;
  const pace = data.pace || {};

  // Темп: к тому же числу прошлого месяца. Выше — зелёным; ниже — без
  // цвета: в середине месяца это ещё не провал, и красить рано
  const diff = pace.revenue ? Math.round(((f.revenue - pace.revenue) / pace.revenue) * 100) : null;
  const then = dayOf(pace.day, pace.month);
  const paceHint = diff === null
    ? (f.revenue ? then + ' занятий не было' : 'занятий в этом месяце ещё не было')
    : diff === 0
      ? 'столько же, сколько ' + then
      : (diff > 0 ? 'на ' + diff + '% больше' : 'на ' + (-diff) + '% меньше') + ', чем ' + then + ' (' + formatMoney(pace.revenue) + ')';

  // Старый сервер сторон «Маркетинг» и «Развитие» не знает — строки
  // покажут «пока нет», а не упадут
  const m = (data.marketing && data.marketing.now) || {};
  const mb = (data.marketing && data.marketing.before) || {};
  const d = (data.development && data.development.now) || {};
  const dbf = (data.development && data.development.before) || {};
  const values = { finance: f, clients: c, process: p, marketing: m, development: d };
  const befores = { finance: fb, clients: cb, process: pb, marketing: mb, development: dbf };

  const year = data.year || {};
  const yearTarget = goals.revenueYear;
  const yearBar = progress(year.revenue, yearTarget);
  const yearDone = reached(year.revenue, yearTarget);

  const signals = SIGNALS.map((s) => ({ ...s, list: (data.signals && data.signals[s.id]) || [] })).filter((s) => s.list.length);
  const quiet = !signals.length;

  return (
    <>
      <Lead
        label={'Выручка · ' + monthLabel(data.month) + ', ' + byDay(pace.day || new Date().getDate())}
        tone={diff !== null && diff > 0 ? 'good' : undefined}
        value={formatMoney(f.revenue)}
        hint={paceHint}
        facts={[
          { label: 'Тренировок', value: formatNumber(f.trainings, 0) + (pace.trainings ? ' · было ' + formatNumber(pace.trainings, 0) : '') },
          { label: 'Прибыль', value: formatMoney(f.profit) },
          { label: 'Клиентов', value: formatNumber(f.activeClients, 0) },
        ]}
      />

      <Section
        title="Пять сторон"
        note="ключевая цифра каждой — к цели и к прошлому месяцу"
        action={(
          <button type="button" className="button button--ghost button--small" onClick={() => { setEditing(true); haptic(); }}>
            Цели
          </button>
        )}
      >
        <Panel>
          <Rows>
            {GOALS.filter((g) => !g.year).map((g) => (
              <SideRow
                key={g.id}
                goal={g}
                value={values[g.group][g.id]}
                was={befores[g.group][g.id]}
                target={goals[g.id]}
                onGo={onGo}
              />
            ))}
          </Rows>
        </Panel>
      </Section>

      <Section title={'Год · ' + year.year} note={yearTarget ? 'выручка с января к цели на год' : 'выручка с января и куда выйдем при этом темпе'}>
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

      {quiet ? (
        <Section title="Сделать на этой неделе">
          <Panel>
            <Empty
              icon={IconCheck}
              title="Всё на месте"
              text="Никто не молчит, пакеты оплачены, замеры свежие, программы на месяц у всех."
            />
          </Panel>
        </Section>
      ) : signals.map((s) => (
        <Section key={s.id} title={s.title(s.list.length)} note={s.note}>
          <People list={s.list} note={s.line} onOpen={onOpenClient} at={s.at} />
        </Section>
      ))}

      <p className="small muted metrics__foot">
        Всё считается из календаря, оплат, замеров и программ — вписывать
        ничего не нужно. Молчит — тридцать дней без проведённого занятия;
        пора снять замер — четыре недели с последнего. Нажмите на человека —
        откроется нужный раздел его карточки.
      </p>

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
