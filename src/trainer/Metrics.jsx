import React, { useState } from 'react';
import { useData } from '../useData.js';
import {
  Lead, Section, Panel, Rows, Loading, ErrorState, Delta, Segmented,
  formatNumber, formatMoney,
} from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { haptic } from '../telegram.js';
import { IconBack } from '../icons.jsx';

/**
 * Показатели: финансы и процессы.
 *
 * Раньше этот экран показывал листы BSC как есть — широкую таблицу
 * «метрика × месяц», которую на телефоне надо листать вбок. Беда была не в
 * ширине: из семи листов заполнялся один, потому что единственный считался
 * кодом. Остальные требовали ручного ввода, и за год его не случилось ни
 * разу, так что таблица честно показывала пустоту.
 *
 * Теперь всё считает сервер из данных, которые в системе уже есть: оплаты,
 * расходы, календарь, замеры, программы. Отсюда и вид экрана — один месяц
 * крупно, а не сетка за три года: цифру смотрят, чтобы принять решение
 * сегодня, и «сколько было в марте» к этому решению отношения не имеет.
 *
 * Рядом с каждой цифрой — изменение к прошлому месяцу. Число без сравнения
 * ничего не значит: «выручка 336 400» — это много или мало? Ответ даёт
 * только соседняя колонка.
 */

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** «к августу 2026»: после «к» месяц стоит в дательном падеже */
const MONTHS_TO = [
  'январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню',
  'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю',
];

function monthTo(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m || !MONTHS_TO[m - 1]) return String(month || '');
  return MONTHS_TO[m - 1] + ' ' + year;
}

export function monthLabel(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m || !MONTHS[m - 1]) return String(month || '');
  return MONTHS[m - 1] + ' ' + year;
}

export function shiftMonth(month, step) {
  const [year, m] = String(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + step, 1));
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}

export function thisMonth(now = new Date()) {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

/* ==================================================================
 * Период
 * ================================================================== */

/**
 * Что смотрим и с чем сравниваем.
 *
 * Месяц сравнивают двумя способами. С прошлым месяцем — чтобы видеть, куда
 * идёт дело прямо сейчас. С тем же месяцем год назад — потому что у зала
 * есть сезон: сентябрь после лета всегда выглядит ростом к августу, и
 * только сентябрь к сентябрю говорит, стало ли лучше на самом деле.
 *
 * Год сравнивается с прошлым годом, а текущий, ещё не кончившийся, — с
 * теми же месяцами прошлого (это считает сервер, здесь только подпись).
 *
 * Выбор общий для «Финансов» и «Процессов» и переживает переход между
 * ними: переключив на год, человек ждёт года и на соседней вкладке.
 */
const PERIODS = [
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
];

const COMPARES = [
  { value: 'month', label: 'К прошлому месяцу' },
  { value: 'year', label: 'К году назад' },
];

let remembered = null;

/** Для проверок: каждый экран в них открывается как в первый раз */
export function resetPeriod() {
  remembered = null;
  chosen.finance = 'profit';
  chosen.process = 'trainings';
  grainRemembered = 'month';
}

function usePeriod() {
  const [state, setState] = useState(() => remembered || {
    period: 'month',
    compare: 'month',
    month: thisMonth(),
    year: new Date().getFullYear(),
  });

  const update = (patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      remembered = next;
      return next;
    });
    haptic();
  };

  return [state, update];
}

function useMetrics(state) {
  const params = state.period === 'year'
    ? { year: state.year }
    : { month: state.month, compare: state.compare };

  return useData('trainer.metrics', params, [state.period, state.month, state.year, state.compare]);
}

/** Подписи периода и того, с чем сравниваем, — из ответа сервера */
function describe(data) {
  if (data.year) {
    const partial = data.throughMonth && data.throughMonth < 12;
    const range = partial ? ' (январь — ' + MONTHS[data.throughMonth - 1].toLowerCase() + ')' : '';
    return {
      label: String(data.year),
      against: data.previousYear + ' году' + range,
      short: 'к ' + data.previousYear + ' году',
      same: 'сколько в ' + data.previousYear + ' году',
    };
  }

  const past = monthTo(data.previousMonth);
  return {
    label: monthLabel(data.month),
    against: past,
    short: data.compare === 'year' ? 'к ' + past : 'к прошлому месяцу',
    same: data.compare === 'year' ? 'сколько год назад' : 'сколько месяцем раньше',
  };
}

/**
 * Шапка периода: месяц или год, стрелки и способ сравнения.
 *
 * Стрелками, а не списком: ходят почти всегда на шаг назад — «а в прошлом
 * сколько было». Вперёд за текущий период не пускаем: там заведомо нули,
 * и человек решит, что сломалось.
 */
function PeriodBar({ state, update }) {
  const yearNow = new Date().getFullYear();
  const isYear = state.period === 'year';

  const label = isYear ? String(state.year) : monthLabel(state.month);
  const canForward = isYear ? state.year < yearNow : shiftMonth(state.month, 1) <= thisMonth();

  const step = (dir) => {
    if (dir > 0 && !canForward) return;
    if (isYear) update({ year: state.year + dir });
    else update({ month: shiftMonth(state.month, dir) });
  };

  return (
    <div className="period">
      <Segmented items={PERIODS} value={state.period} onChange={(period) => update({ period })} label="Период" />

      <div className="monthpick">
        <button className="icon-button" onClick={() => step(-1)} aria-label={isYear ? 'Предыдущий год' : 'Предыдущий месяц'}>
          <IconBack size={18} />
        </button>

        <span className="monthpick__label">{label}</span>

        <button
          className="icon-button monthpick__next"
          onClick={() => step(1)}
          disabled={!canForward}
          aria-label={isYear ? 'Следующий год' : 'Следующий месяц'}
        >
          <IconBack size={18} />
        </button>
      </div>

      {!isYear && (
        <Segmented items={COMPARES} value={state.compare} onChange={(compare) => update({ compare })} label="Сравнить" />
      )}
    </div>
  );
}

/* ==================================================================
 * Показатели и график
 * ================================================================== */

/**
 * Что умеет каждая цифра сводки: как её писать, в какую сторону хорошо и
 * можно ли её показать на графике.
 *
 * `aim` — в какую сторону хорошо: у расходов и у молчащих клиентов рост
 * плохой, и красить его зелёным значило бы врать. Ноль — «сторона не
 * определена»: число оплат само по себе ни хорошо, ни плохо.
 *
 * `chart: false` — цифры «на сегодня», а не за период: остаток предоплат,
 * число клиентов в работе. У них нет истории по месяцам, и график из
 * одинаковых столбиков только сбивал бы с толку.
 */
const FINANCE = {
  profit: { label: 'Прибыль', unit: '₽' },
  revenue: { label: 'Выручка', unit: '₽' },
  expenses: { label: 'Расходы', unit: '₽', aim: -1 },
  trainings: { label: 'Тренировок проведено' },
  perTraining: { label: 'Выручка на тренировку', unit: '₽', note: 'занятий не было' },
  perClient: { label: 'Выручка на клиента', unit: '₽', note: 'занятий не было' },
  topShare: { label: 'Доля пяти крупнейших', unit: '%', aim: -1, note: 'занятий не было' },
  cash: { label: 'Касса', unit: '₽', aim: 0 },
  payments: { label: 'Оплат принято', aim: 0 },
  averageCheck: { label: 'Средняя оплата', unit: '₽', note: 'оплат не было' },
  bank: { label: 'Оплачено вперёд', unit: '₽', aim: 0, chart: false },
  bankCover: { label: 'Отработать это займёт', unit: 'мес.', digits: 1, aim: 0, chart: false, note: 'выручки не было' },
};

const PROCESS = {
  trainings: { label: 'Тренировок проведено' },
  perClient: { label: 'Тренировок на клиента', digits: 1, note: 'занятий не было' },
  activeClients: { label: 'Клиентов в работе', chart: false },
  measuredClients: { label: 'Сняты замеры' },
  measuredShare: { label: 'Доля с замером', unit: '%' },
  withPlan: { label: 'Есть программа', chart: false },
  planShare: { label: 'Доля с программой', unit: '%', chart: false },
  silentClients: { label: 'Не приходили месяц', aim: -1, chart: false },
};

/** Выбранная для графика цифра — своя у финансов и у процессов */
const chosen = { finance: 'profit', process: 'trainings' };

function useChosen(group) {
  const [key, setKey] = useState(chosen[group]);
  const choose = (next) => {
    chosen[group] = next;
    setKey(next);
    haptic();
  };
  return [key, choose];
}

/**
 * Одна цифра и её изменение. Если у цифры есть история, строка —
 * кнопка: нажатие переводит на неё график наверху.
 *
 * Прочерк на месте цифры не молчит, а объясняется подписью: «оплат не
 * было» читается иначе, чем просто пустое место, за которым человек
 * подозревает поломку.
 */
function Metric({ id, spec, now, before, picked, onPick, label }) {
  const value = now[id];
  const was = before ? before[id] : null;
  const known = value !== null && value !== undefined;
  const comparable = spec.chart !== false && known && was !== null && was !== undefined && was !== value;

  const body = (
    <>
      <span className="rows__label">{label || spec.label}</span>
      <span className="rows__value">
        {known ? (
          <span className="metric">
            <span className="metric__value">{format(value, spec.unit, spec.digits)}</span>
            {comparable && (
              <Delta
                value={value - was}
                suffix={spec.unit === '%' ? '%' : ''}
                digits={spec.digits}
                aim={spec.aim === undefined ? 1 : spec.aim}
              />
            )}
          </span>
        ) : (
          <span className="muted small">{spec.note || '—'}</span>
        )}
      </span>
    </>
  );

  if (spec.chart === false || !onPick) return <div className="rows__item">{body}</div>;

  return (
    <button
      type="button"
      className={'rows__item rows__item--pick' + (picked ? ' rows__item--picked' : '')}
      aria-pressed={picked}
      onClick={() => onPick(id)}
    >
      {body}
    </button>
  );
}

/**
 * Число знаков не задаём без нужды: `formatNumber` сам не рисует «60,0%»
 * там, где доля ровная, и не округляет 8,9 до 9. Лишняя цифра после
 * запятой в доле — это шум, который читается как точность, которой нет.
 */
function format(value, unit, digits) {
  if (unit === '₽') return formatMoney(value);
  if (unit === '%') return formatNumber(value, digits) + '%';
  if (unit === 'мес.') return formatNumber(value, digits) + ' мес.';
  return formatNumber(value, digits);
}

function signed(value, period) {
  if (!value) return 'столько же, ' + period.same;
  return (value > 0 ? '+' : '−') + formatMoney(Math.abs(value)) + ' ' + period.short;
}

const GRAINS = [
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
];

let grainRemembered = 'month';

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Подпись столбика: полная — над графиком, короткая — под осью */
function pointLabels(point, by) {
  if (by === 'month') {
    const [y, m] = point.key.split('-').map(Number);
    return { label: monthLabel(point.key), short: SHORT_MONTHS[m - 1] + ' ' + String(y).slice(2) };
  }
  if (by === 'quarter') {
    const [y, q] = point.key.split('-Q');
    return { label: point.label, short: ['I', 'II', 'III', 'IV'][Number(q) - 1] + ' ' + y.slice(2) };
  }
  return { label: point.label, short: point.label };
}

/** Какой столбик подсветить: тот, что соответствует открытому периоду сводки */
function highlightFor(state, by) {
  const month = state.period === 'year' ? `${state.year}-12` : state.month;
  const [y, m] = month.split('-').map(Number);
  if (by === 'year') return String(y);
  if (by === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
  return state.period === 'year' ? null : month;
}

/**
 * График выбранной цифры по периодам.
 *
 * Разбивка — месяц, квартал или год — своя у графика и не зависит от
 * того, какой период открыт в сводке: смотреть «сентябрь» и видеть рядом
 * всю историю по кварталам — обычное желание.
 */
function MetricChart({ group, id, spec, state }) {
  const [by, setBy] = useState(grainRemembered);
  const { loading, data, error, reload } = useData('trainer.metrics.series', { by }, [by]);

  const changeBy = (next) => {
    grainRemembered = next;
    setBy(next);
    haptic();
  };

  let chart;
  if (loading) chart = <Loading rows={2} />;
  else if (error) chart = <ErrorState error={error} onRetry={reload} />;
  else {
    const points = (data.points || []).map((p) => ({
      key: p.key,
      ...pointLabels(p, data.by),
      value: p[group] ? p[group][id] : null,
      partial: p.partial,
    }));

    chart = (
      <BarChart
        points={points}
        aim={spec.aim === undefined ? 1 : spec.aim}
        format={(v) => format(v, spec.unit, spec.digits)}
        highlight={highlightFor(state, data.by)}
        label={spec.label}
      />
    );
  }

  return (
    <Panel pad className="chart-card">
      <div className="chart-card__head">
        <h2 className="chart-card__title">{spec.label}</h2>
      </div>
      <Segmented items={GRAINS} value={by} onChange={changeBy} label="Разбивка графика" />
      <div style={{ marginTop: 'var(--space-3)' }}>{chart}</div>
    </Panel>
  );
}

/* ==================================================================
 * Финансы
 * ================================================================== */

export function Finance() {
  const [state, update] = usePeriod();
  const [picked, pick] = useChosen('finance');
  const { loading, data, error, reload } = useMetrics(state);

  const top = (
    <>
      <PeriodBar state={state} update={update} />
      <MetricChart group="finance" id={picked} spec={FINANCE[picked]} state={state} />
    </>
  );

  if (loading) return <>{top}<Loading rows={4} /></>;
  if (error) return <>{top}<ErrorState error={error} onRetry={reload} /></>;

  const now = data.finance.now;
  const before = data.finance.before;
  const period = describe(data);
  const row = (id, label) => (
    <Metric id={id} spec={FINANCE[id]} now={now} before={before} picked={picked === id} onPick={pick} label={label} />
  );

  return (
    <>
      {top}

      {/* Крупно — прибыль, а не выручка. Выручка — отработанное, та же
          цифра, что на экране клиентов. Касса стоит отдельно и в прибыль
          не входит: это деньги, которые ещё предстоит отработать. */}
      <Lead
        label={'Прибыль · ' + period.label}
        tone={now.profit >= 0 ? 'good' : 'critical'}
        value={formatMoney(now.profit)}
        hint={signed(now.profit - before.profit, period)}
        facts={[
          { label: 'Выручка', value: formatMoney(now.revenue) },
          { label: 'Расходы', value: formatMoney(now.expenses) },
        ]}
      />

      <Section title="Деньги" note={'рядом — изменение к ' + period.against}>
        <Panel>
          <Rows>
            {row('revenue')}
            {row('expenses')}
            {row('profit')}
            {row('trainings')}
          </Rows>
        </Panel>
      </Section>

      <Section title="Сколько приносит работа">
        <Panel>
          <Rows>
            {row('perTraining')}
            {row('perClient')}
            {row('topShare')}
          </Rows>
        </Panel>
      </Section>

      <Section title="Касса" note="деньги, которые пришли за период">
        <Panel>
          <Rows>
            {row('cash', data.year ? 'Касса за год' : 'Касса за месяц')}
            {row('payments')}
            {row('averageCheck')}
          </Rows>
        </Panel>
      </Section>

      {/* Раньше здесь стояли «В банке» и «Хватит месяцев», и что они
          значат, было не понять. Это одна мысль в двух числах: сколько
          клиенты заплатили вперёд и ещё не отходили — то есть сколько
          тренер им должен, — и на сколько месяцев работы этого хватит. */}
      <Section title="Долг перед клиентами" note="на сегодня: оплачено вперёд, но ещё не отработано">
        <Panel>
          <Rows>
            {row('bank')}
            {row('bankCover')}
          </Rows>
        </Panel>
      </Section>

      <p className="small muted metrics__foot">
        Выручка — проведённые тренировки по цене клиента, как на экране
        клиентов. Прибыль — выручка минус расходы, и больше ничего: налоги и
        личные траты сюда не входят. Касса — оплаты, принятые за период:
        это ещё не заработок, а тренировки, которые предстоит провести.
        Нажмите на любую строку — график наверху покажет её историю.
      </p>
    </>
  );
}

/* ==================================================================
 * Процессы
 * ================================================================== */

export function Processes() {
  const [state, update] = usePeriod();
  const [picked, pick] = useChosen('process');
  const { loading, data, error, reload } = useMetrics(state);

  const top = (
    <>
      <PeriodBar state={state} update={update} />
      <MetricChart group="process" id={picked} spec={PROCESS[picked]} state={state} />
    </>
  );

  if (loading) return <>{top}<Loading rows={4} /></>;
  if (error) return <>{top}<ErrorState error={error} onRetry={reload} /></>;

  const now = data.process.now;
  const before = data.process.before;
  const period = describe(data);
  const row = (id) => (
    <Metric id={id} spec={PROCESS[id]} now={now} before={before} picked={picked === id} onPick={pick} />
  );

  return (
    <>
      {top}

      <Lead
        label={'Тренировок · ' + period.label}
        value={formatNumber(now.trainings, 0)}
        hint={
          now.perClient
            ? 'по ' + formatNumber(now.perClient, 1) + ' на клиента'
            : 'занятий за этот период ещё не было'
        }
        facts={[
          { label: 'Клиентов', value: formatNumber(now.activeClients, 0) },
          { label: 'Молчат месяц', value: formatNumber(now.silentClients, 0) },
        ]}
      />

      <Section title="Работа" note={'рядом — изменение к ' + period.against}>
        <Panel>
          <Rows>
            {row('activeClients')}
            {row('trainings')}
            {row('perClient')}
          </Rows>
        </Panel>
      </Section>

      {/* Две проверки того, что работу ведут, а не просто ходят: замер и
          программа. И то и другое делает тренер, и по этим долям видно,
          до кого руки не дошли. */}
      <Section title="Ведение">
        <Panel>
          <Rows>
            {row('measuredClients')}
            {row('measuredShare')}
            {row('withPlan')}
            {row('planShare')}
          </Rows>
        </Panel>
      </Section>

      <Section title="Кому позвонить" note="месяц без занятий — это ещё не уход, но уже повод">
        <Panel>
          <Rows>
            {row('silentClients')}
          </Rows>
        </Panel>
      </Section>

      <p className="small muted metrics__foot">
        {now.silentClients > 0
          ? 'Молчащие — те, у кого за последние тридцать дней нет ни одного проведённого занятия. Считается от сегодняшнего дня, а не от выбранного месяца.'
          : 'Все, кто в работе, за последний месяц приходили хотя бы раз.'}
      </p>
    </>
  );
}
