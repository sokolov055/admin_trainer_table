import React, { useState } from 'react';
import { useData } from '../useData.js';
import {
  Lead, Section, Panel, Rows, Row, Loading, ErrorState, Delta, Segmented,
  formatNumber, formatMoney,
} from '../ui.jsx';
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
 * Строка показателя
 * ================================================================== */

/**
 * Одна цифра и её изменение.
 *
 * `aim` — в какую сторону хорошо: у расходов и у молчащих клиентов рост
 * плохой, и красить его зелёным значило бы врать. Ноль вместо `aim` —
 * «сторона не определена»; такие есть: число оплат само по себе ни хорошо,
 * ни плохо.
 *
 * Прочерк на месте цифры не молчит, а объясняется подписью: «оплат не
 * было» читается иначе, чем просто пустое место, за которым человек
 * подозревает поломку.
 */
function Metric({ label, value, before, unit, aim = 1, digits, note }) {
  const known = value !== null && value !== undefined;
  const comparable = known && before !== null && before !== undefined && before !== value;

  return (
    <Row label={label}>
      {known ? (
        <span className="metric">
          <span className="metric__value">{format(value, unit, digits)}</span>
          {comparable && (
            <Delta value={value - before} suffix={unit === '%' ? '%' : ''} digits={digits} aim={aim} />
          )}
        </span>
      ) : (
        <span className="muted small">{note || '—'}</span>
      )}
    </Row>
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
  return formatNumber(value, digits);
}

function signed(value, period) {
  if (!value) return 'столько же, ' + period.same;
  return (value > 0 ? '+' : '−') + formatMoney(Math.abs(value)) + ' ' + period.short;
}

/* ==================================================================
 * Финансы
 * ================================================================== */

export function Finance() {
  const [state, update] = usePeriod();
  const { loading, data, error, reload } = useMetrics(state);

  const bar = <PeriodBar state={state} update={update} />;

  if (loading) return <>{bar}<Loading rows={4} /></>;
  if (error) return <>{bar}<ErrorState error={error} onRetry={reload} /></>;

  const now = data.finance.now;
  const before = data.finance.before;
  const period = describe(data);

  return (
    <>
      {bar}

      {/* Крупно — прибыль, а не выручка. Выручку тренер и так помнит, а
          прибыль до сих пор нигде не считалась: расходов не было ни в
          базе, ни в таблице, и в месячных архивах её ставили руками.

          Выручка — отработанное, та же цифра, что на экране клиентов.
          Касса стоит отдельно и в прибыль не входит: это деньги, которые
          ещё предстоит отработать. */}
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
            <Metric label="Выручка" unit="₽" value={now.revenue} before={before.revenue} />
            <Metric label="Расходы" unit="₽" value={now.expenses} before={before.expenses} aim={-1} />
            <Metric label="Прибыль" unit="₽" value={now.profit} before={before.profit} />
            <Metric label="Тренировок проведено" value={now.trainings} before={before.trainings} />
          </Rows>
        </Panel>
      </Section>

      <Section title="Сколько приносит работа">
        <Panel>
          <Rows>
            <Metric
              label="Выручка на тренировку"
              unit="₽"
              value={now.perTraining}
              before={before.perTraining}
              note="занятий не было"
            />
            <Metric
              label="Выручка на клиента"
              unit="₽"
              value={now.perClient}
              before={before.perClient}
              note="занятий не было"
            />
          </Rows>
        </Panel>
      </Section>

      <Section
        title="Деньги вперёд"
        note="предоплаты — ещё не заработок, а обязательство отработать"
      >
        <Panel>
          <Rows>
            <Metric label={data.year ? 'Касса за год' : 'Касса за месяц'} unit="₽" value={now.cash} before={before.cash} aim={0} />
            <Metric label="Оплат принято" value={now.payments} before={before.payments} aim={0} />
            <Metric
              label="Средняя оплата"
              unit="₽"
              value={now.averageCheck}
              before={before.averageCheck}
              note="оплат не было"
            />
            <Metric label="В банке" unit="₽" value={now.bank} before={before.bank} aim={0} />
            <Metric
              label="Хватит месяцев"
              value={now.bankCover}
              before={before.bankCover}
              digits={2}
              aim={0}
              note="выручки не было — не с чем сравнивать"
            />
            <Metric
              label="Доля пяти крупнейших"
              unit="%"
              value={now.topShare}
              before={before.topShare}
              aim={-1}
              note="оплат не было"
            />
          </Rows>
        </Panel>
      </Section>

      <p className="small muted metrics__foot">
        Выручка — проведённые тренировки по цене клиента, как на экране
        клиентов. Прибыль — выручка минус расходы, и больше ничего: налоги и
        личные траты сюда не входят. Касса — оплаты, принятые в этом месяце:
        это ещё не заработок, а тренировки, которые предстоит провести. В
        банке — всё, что клиенты оплатили вперёд и ещё не отходили.
      </p>
    </>
  );
}

/* ==================================================================
 * Процессы
 * ================================================================== */

export function Processes() {
  const [state, update] = usePeriod();
  const { loading, data, error, reload } = useMetrics(state);

  const bar = <PeriodBar state={state} update={update} />;

  if (loading) return <>{bar}<Loading rows={4} /></>;
  if (error) return <>{bar}<ErrorState error={error} onRetry={reload} /></>;

  const now = data.process.now;
  const before = data.process.before;
  const period = describe(data);

  return (
    <>
      {bar}

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
            <Metric label="Клиентов в работе" value={now.activeClients} before={before.activeClients} />
            <Metric label="Тренировок проведено" value={now.trainings} before={before.trainings} />
            <Metric
              label="Тренировок на клиента"
              value={now.perClient}
              before={before.perClient}
              digits={1}
              note="занятий не было"
            />
          </Rows>
        </Panel>
      </Section>

      {/* Две проверки того, что работу ведут, а не просто ходят: замер и
          программа. И то и другое делает тренер, и по этим долям видно,
          до кого руки не дошли. */}
      <Section title="Ведение">
        <Panel>
          <Rows>
            <Metric label="Сняты замеры" value={now.measuredClients} before={before.measuredClients} />
            <Metric label="Доля с замером" unit="%" value={now.measuredShare} before={before.measuredShare} />
            <Metric label="Есть программа" value={now.withPlan} before={before.withPlan} />
            <Metric label="Доля с программой" unit="%" value={now.planShare} before={before.planShare} />
          </Rows>
        </Panel>
      </Section>

      <Section title="Кому позвонить" note="месяц без занятий — это ещё не уход, но уже повод">
        <Panel>
          <Rows>
            <Metric
              label="Не приходили месяц"
              value={now.silentClients}
              before={before.silentClients}
              aim={-1}
            />
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
