import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import {
  Lead, Section, Panel, Rows, Loading, ErrorState, Delta, Segmented, Field, Sheet,
  formatNumber, formatMoney, formatDate, plural,
} from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { haptic } from '../telegram.js';
import { IconBack } from '../icons.jsx';
import ScheduleStats from './ScheduleStats.jsx';

/**
 * Показатели: финансы, клиенты и процессы — три стороны одного BSC.
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
 * только соседняя колонка. Главное на сегодня — цели и кому позвонить —
 * на «Обзоре» (Dashboard.jsx); здесь — глубже, по каждой стороне.
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

/** «к сентябрю» — без года: на обзоре сравнивают с соседним месяцем */
export function toMonthWord(month) {
  const m = Number(String(month || '').slice(5, 7));
  return MONTHS_TO[m - 1] ? 'к ' + MONTHS_TO[m - 1] : '';
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
 * Выбор общий для всех трёх сторон и переживает переход между ними:
 * переключив на год, человек ждёт года и на соседней вкладке.
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
  chosen.clients = 'active';
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
      before: 'в ' + data.previousYear + ' году',
    };
  }

  const past = monthTo(data.previousMonth);
  return {
    label: monthLabel(data.month),
    against: past,
    short: data.compare === 'year' ? 'к ' + past : 'к прошлому месяцу',
    same: data.compare === 'year' ? 'сколько год назад' : 'сколько месяцем раньше',
    before: data.compare === 'year' ? 'год назад' : 'в прошлом месяце',
  };
}

/** Границы открытого периода — для статистики занятий, у которой свой запрос */
function rangeOf(state) {
  if (state.period === 'year') {
    return { from: new Date(state.year, 0, 1).toISOString(), to: new Date(state.year + 1, 0, 1).toISOString() };
  }
  const [y, m] = state.month.split('-').map(Number);
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
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

function CompactPeriodBar({ state, update }) {
  const isYear = state.period === 'year';
  const canForward = isYear ? state.year < new Date().getFullYear() : shiftMonth(state.month, 1) <= thisMonth();
  const step = (direction) => {
    if (direction > 0 && !canForward) return;
    update(isYear ? { year: state.year + direction } : { month: shiftMonth(state.month, direction) });
  };
  return <div className="metrics-period">
    <div className="metrics-period__line">
      <button type="button" className="icon-button" onClick={() => step(-1)} aria-label={isYear ? 'Предыдущий год' : 'Предыдущий месяц'}><IconBack size={18} /></button>
      <strong>{isYear ? state.year : monthLabel(state.month)}</strong>
      <button type="button" className="icon-button monthpick__next" onClick={() => step(1)} disabled={!canForward}
        aria-label={isYear ? 'Следующий год' : 'Следующий месяц'}><IconBack size={18} /></button>
    </div>
    <details className="metrics-period__options">
      <summary>{isYear ? 'Год' : 'Месяц'} · {isYear ? 'к прошлому году' : state.compare === 'year' ? 'к году назад' : 'к прошлому месяцу'}<span>Изменить</span></summary>
      <Segmented items={PERIODS} value={state.period} onChange={(period) => update({ period })} label="Период" />
      {!isYear && <Segmented items={COMPARES} value={state.compare} onChange={(compare) => update({ compare })} label="Сравнить" />}
    </details>
  </div>;
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
export const FINANCE = {
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

/**
 * Клиенты — то, чем в таблице был пустой лист «Продажи»: кто пришёл, кто
 * остался, кто ушёл, кто продлил. Удержание — доля тех, кто занимался в
 * прошлом периоде и занимается в этом; ушедший — был в прошлом, в этом
 * не был и вперёд не записан.
 */
export const CLIENTS = {
  active: { label: 'Занимались' },
  newClients: { label: 'Пришли впервые' },
  retained: { label: 'Остались с прошлого периода' },
  lost: { label: 'Ушли', aim: -1 },
  retention: { label: 'Удержание', unit: '%', note: 'прошлый период пуст' },
  renewals: { label: 'Продлений' },
  newPayers: { label: 'Первых оплат' },
};

export const PROCESS = {
  trainings: { label: 'Тренировок проведено' },
  perClient: { label: 'Тренировок на клиента', digits: 1, note: 'занятий не было' },
  activeClients: { label: 'Клиентов в работе', chart: false },
  measuredClients: { label: 'Сняты замеры' },
  measuredShare: { label: 'Доля с замером', unit: '%', note: 'занятий не было' },
  withPlan: { label: 'Есть программа' },
  planShare: { label: 'Доля с программой', unit: '%', note: 'занятий не было' },
  cancels: { label: 'Отмен', aim: -1 },
  cancelsLate: { label: 'Из них поздних', aim: -1 },
  moves: { label: 'Переносов', aim: -1 },
  cancelShare: { label: 'Доля отмен', unit: '%', aim: -1, note: 'занятий не было' },
  silentClients: { label: 'Не приходили месяц', aim: -1, chart: false },
};

/**
 * Маркетинг — откуда приходят новые. Источник ставит тренер в карточке
 * клиента («Откуда пришёл»); «не отмечен» — тоже цифра: по ней видно, что
 * карточки не заполняют. Цель из листов — половина по рекомендации.
 */
export const SOURCES = [
  { value: 'referral', label: 'По рекомендации' },
  { value: 'gym', label: 'Подошёл в зале' },
  { value: 'club', label: 'От клуба' },
  { value: 'social', label: 'Из соцсетей' },
  { value: 'site', label: 'С сайта или из приложения' },
  { value: 'other', label: 'Другое' },
];

export const MARKETING = {
  newClients: { label: 'Новых клиентов' },
  referralShare: { label: 'Доля по рекомендации', unit: '%', note: 'источник не отмечен' },
  ...Object.fromEntries(SOURCES.map((s) => [s.value, { label: s.label }])),
  unknown: { label: 'Источник не отмечен', aim: -1 },
};

/** Развитие — часы обучения из журнала и свои тренировки */
export const DEVELOPMENT = {
  learningHours: { label: 'Часов обучения', unit: 'ч', digits: 1 },
  learningEntries: { label: 'Записей в журнале', aim: 0 },
  ownWorkouts: { label: 'Своих тренировок' },
};

/** Выбранная для графика цифра — своя у каждой стороны */
const chosen = { finance: 'profit', clients: 'active', process: 'trainings' };

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
                suffix={deltaUnit(spec.unit)}
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
// Единица — через неразрывный пробел: «3 500 ₽» в узкой строке цели
// переносилось, и «₽» оставался один на следующей строке (аудит 24.10.2026)
const NBSP = ' ';

export function format(value, unit, digits) {
  if (unit === '₽') return formatMoney(value).replace(/ ₽$/, NBSP + '₽');
  if (unit === '%') return formatNumber(value, digits) + '%';
  if (unit === 'мес.') return formatNumber(value, digits) + NBSP + 'мес.';
  if (unit === 'ч') return formatNumber(value, digits) + NBSP + 'ч';
  return formatNumber(value, digits);
}

/** Единица после изменения: «↓ 21 850» без «₽» читалось как что угодно */
export function deltaUnit(unit) {
  if (unit === '%') return '%';
  if (unit === '₽' || unit === 'ч' || unit === 'мес.') return NBSP + unit;
  return '';
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
function MetricChart({ group, id, spec, state, compact = false }) {
  const defaultBy = state.period === 'year' ? 'year' : 'month';
  const [grain, setGrain] = useState({ period: state.period, by: compact ? defaultBy : grainRemembered });
  const by = compact && grain.period !== state.period ? defaultBy : grain.by;

  useEffect(() => {
    if (compact && grain.period !== state.period) setGrain({ period: state.period, by: defaultBy });
  }, [compact, defaultBy, grain.period, state.period]);

  const changeBy = (next) => {
    grainRemembered = next;
    setGrain({ period: state.period, by: next });
    haptic();
  };

  return (
    <Panel pad className="chart-card">
      <div className="chart-card__head">
        <h2 className="chart-card__title">{spec.label}</h2>
      </div>
      {!compact && <Segmented items={GRAINS} value={by} onChange={changeBy} label="Разбивка графика" />}
      <div className={compact ? 'metrics-chart__plot' : undefined} style={compact ? undefined : { marginTop: 'var(--space-3)' }}>
        <MetricChartData key={by} group={group} id={id} spec={spec} state={state} compact={compact} by={by} />
      </div>
      {compact && <details className="metrics-chart-options"><summary>Разбивка: {GRAINS.find((grain) => grain.value === by)?.label}</summary>
        <Segmented items={GRAINS} value={by} onChange={changeBy} label="Разбивка графика" />
      </details>}
    </Panel>
  );
}

function MetricChartData({ group, id, spec, state, compact, by }) {
  // Смена разбивки создаёт новый загрузчик: поздний ответ старой разбивки
  // не должен перезаписать данные выбранного периода.
  const { loading, data, error, reload } = useData('trainer.metrics.series', { by }, [by]);

  let chart;
  if (loading) chart = <Loading rows={2} />;
  else if (error) chart = <ErrorState error={error} onRetry={reload} />;
  else {
    const allPoints = (data.points || []).map((p) => ({
      key: p.key,
      ...pointLabels(p, data.by),
      value: p[group] ? p[group][id] : null,
      partial: p.partial,
    }));
    const selectedKey = compact ? highlightFor(state, by) : null;
    const selectedIndex = selectedKey ? allPoints.findIndex((point) => point.key === selectedKey) : -1;
    const points = compact
      ? state.period === 'year' && by !== 'year'
        ? allPoints.filter((point) => point.key.startsWith(`${state.year}-`))
        : state.period === 'year' && selectedIndex < 0
          ? []
          : allPoints.slice(Math.max(0, (selectedIndex < 0 ? allPoints.length : selectedIndex + 1) - 8), selectedIndex < 0 ? undefined : selectedIndex + 1)
      : allPoints;
    if (compact && by === 'month') points.forEach((point) => { point.short = SHORT_MONTHS[Number(point.key.slice(5, 7)) - 1] || point.short; });

    const chartHighlight = compact && by === 'month' && state.period === 'month' && state.month === thisMonth()
      ? points.slice().reverse().find((point) => !point.partial && point.value !== null && point.value !== undefined)?.key
      : highlightFor(state, data.by);
    chart = (
      <>
      <BarChart
        points={points}
        aim={spec.aim === undefined ? 1 : spec.aim}
        format={(v) => format(v, spec.unit, spec.digits)}
        highlight={chartHighlight}
        label={spec.label}
        plain={compact && spec.aim !== -1}
        compact={compact}
      />
      {compact && by === 'month' && points.some((point) => point.partial) &&
        <p className="small muted metrics-chart__note">{monthLabel(points.find((point) => point.partial).key)} ещё идёт, данные неполные.</p>}
      </>
    );
  }

  return chart;
}

function SummaryTiles({ items, picked, onPick }) {
  return <div className="metrics-tiles">{items.map(({ id, label, value, note, static: fixed }) => {
    const body = <><strong>{value}</strong><span>{label}</span>{note && <small>{note}</small>}</>;
    return fixed
      ? <div key={id} className="metrics-tile">{body}</div>
      : <button key={id} type="button" className={'metrics-tile' + (picked === id ? ' metrics-tile--picked' : '')}
          onClick={() => onPick(id)} aria-pressed={picked === id}>{body}</button>;
  })}</div>;
}

function ReturnClients({ onOpenClient, loading, data, error, reload }) {
  if (loading) return <Loading rows={1} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const people = (data && data.signals && data.signals.silent) || [];
  if (!people.length) return null;
  const personRow = (person) => {
    const note = (person.days === null ? 'занятий не было' : person.days + ' дн. без занятий')
      + (person.nextAt ? ' · записан на ' + formatDate(person.nextAt, false) : '');
    const initials = String(person.name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
    return <button type="button" className="metrics-person" key={person.row}
        aria-label={person.name + ': ' + note}
        onClick={() => onOpenClient({ row: person.row, name: person.name }, 'overview')}>
        <span className="metrics-person__avatar" aria-hidden="true">{initials}</span>
        <span className="metrics-person__body"><strong>{person.name}{person.split ? ' · сплит' : ''}</strong><small>{note}</small></span>
        <span className="metrics-person__chevron" aria-hidden="true">›</span>
      </button>;
  };
  return <Section title="Кого вернуть" note="месяц без занятий">
    <div className="metrics-people">{people.slice(0, 2).map(personRow)}</div>
    {people.length > 2 && <details className="metrics-more"><summary>Ещё {people.length - 2}</summary>
      <div className="metrics-people">{people.slice(2).map(personRow)}</div>
    </details>}
  </Section>;
}

/* ==================================================================
 * Финансы
 * ================================================================== */

export function Finance() {
  const [state, update] = usePeriod();
  const [picked, pick] = useChosen('finance');
  const { loading, data, error, reload } = useMetrics(state);

  const top = <CompactPeriodBar state={state} update={update} />;

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
      <Lead
        label={'Прибыль · ' + period.label}
        value={formatMoney(now.profit)}
        hint={<>{signed(now.profit - before.profit, period)}<br />
          Выручка {formatMoney(now.revenue)} − расходы {formatMoney(now.expenses)}</>}
      />

      <Section title="Откуда сумма" note={'изменение к ' + period.against}>
        <Panel pad className="metrics-breakdown">
          <SummaryTiles picked={picked} onPick={pick} items={[
            { id: 'revenue', label: 'Выручка за проведённое', value: formatMoney(now.revenue) },
            { id: 'expenses', label: 'Расходы', value: formatMoney(now.expenses) },
            { id: 'cash', label: data.year ? 'Касса за год' : 'Касса за месяц', value: formatMoney(now.cash || 0), note: 'получено оплат' },
            { id: 'bank', label: 'Оплачено вперёд', value: formatMoney(now.bank || 0), static: true },
          ]} />
          <p className="small muted metrics__tile-note">Оплачено вперёд — обязательство провести занятия, не выручка.</p>
        </Panel>
      </Section>

      <Section title="Динамика">
        <MetricChart group="finance" id={picked} spec={FINANCE[picked]} state={state} compact />
      </Section>

      <Section title="Ещё показатели" note="нажмите строку для графика">
        <details className="metrics-more"><summary>Все показатели</summary><Panel>
          <Rows>
            {row('profit')}
            {row('revenue')}
            {row('expenses')}
            {row('cash', data.year ? 'Касса за год' : 'Касса за месяц')}
            {row('trainings')}
            {row('perTraining')}
            {row('perClient')}
            {row('topShare')}
            {row('payments')}
            {row('averageCheck')}
            {row('bank')}
            {row('bankCover')}
          </Rows>
        </Panel></details>
      </Section>

      <p className="small muted metrics__foot">Прибыль — выручка минус расходы; налоги и личные траты сюда не входят. Предоплаты и запас предоплат показаны на сегодня.</p>
    </>
  );
}

/* ==================================================================
 * Клиенты
 * ================================================================== */

export function Clients({ onOpenClient = null }) {
  const [state, update] = usePeriod();
  const [picked, pick] = useChosen('clients');
  const { loading, data, error, reload } = useMetrics(state);
  const overview = useData('trainer.metrics.overview', {}, []);

  const top = <CompactPeriodBar state={state} update={update} />;

  if (loading) return <>{top}<Loading rows={4} /></>;
  if (error) return <>{top}<ErrorState error={error} onRetry={reload} /></>;

  // Старый сервер стороны «Клиенты» не знает — тогда экран честно пуст
  const now = (data.clients && data.clients.now) || {};
  const before = (data.clients && data.clients.before) || {};
  const period = describe(data);
  const row = (id) => (
    <Metric id={id} spec={CLIENTS[id]} now={now} before={before} picked={picked === id} onPick={pick} />
  );

  const activeBefore = before.active || 0;
  const retentionKnown = now.retention !== null && now.retention !== undefined;
  const target = overview.data && overview.data.targets && overview.data.targets.retention;
  const isCurrent = state.period === 'month' && state.month === thisMonth();

  return (
    <>
      {top}

      <Lead
        label={'Клиентов · ' + period.label}
        value={formatNumber(now.active || 0, 0)}
        hint={`${formatNumber(now.newClients || 0, 0)} ${plural(now.newClients || 0, 'новый', 'новых', 'новых')} · ${formatNumber(now.lost || 0, 0)} ${plural(now.lost || 0, 'ушёл', 'ушли', 'ушли')} · ${formatNumber(now.renewals || 0, 0)} ${plural(now.renewals || 0, 'продлил', 'продлили', 'продлили')}`}
      />

      <Section title="Удержание" note={target ? 'цель ' + formatNumber(target) + '%' : undefined}>
        <Panel pad className="metrics-retention">
          <strong>{retentionKnown ? format(now.retention, '%') : '—'}</strong>
          <div className="metrics-retention__track" role="meter" aria-label="Удержание" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={retentionKnown ? Math.max(0, Math.min(100, now.retention)) : undefined}>
            <span style={{ width: (retentionKnown ? Math.max(0, Math.min(100, now.retention)) : 0) + '%' }} />
          </div>
          <p className="small muted">{retentionKnown
            ? `${formatNumber(now.retained || 0, 0)} из ${formatNumber(activeBefore, 0)} занимавшихся ${period.before} вернулись`
            : 'Сравнить не с чем: в прошлом периоде занятий не было.'}</p>
        </Panel>
      </Section>

      {isCurrent && onOpenClient && <ReturnClients onOpenClient={onOpenClient} {...overview} />}

      <Section title="Динамика">
        <MetricChart group="clients" id={picked} spec={CLIENTS[picked]} state={state} compact />
      </Section>

      <Section title="Движение и оплаты" note={'изменение к ' + period.against}>
        <details className="metrics-more"><summary>Все показатели</summary><Panel>
          <Rows>
            {row('active')}
            {row('newClients')}
            {row('retained')}
            {row('lost')}
            {row('retention')}
            {row('renewals')}
            {row('newPayers')}
          </Rows>
        </Panel></details>
      </Section>

      {data.marketing && data.marketing.now && (
        <Section title="Откуда приходят" note="источник отмечают в карточке клиента">
          <Panel>
            <Rows>
              <Metric id="referralShare" spec={MARKETING.referralShare} now={data.marketing.now} before={data.marketing.before} />
              <Metric id="unknown" spec={MARKETING.unknown} now={data.marketing.now} before={data.marketing.before} />
            </Rows>
          </Panel>
          <details className="metrics-more"><summary>Все источники</summary><Panel><Rows>
              {SOURCES.map((s) => (
                <Metric key={s.value} id={s.value} spec={MARKETING[s.value]} now={data.marketing.now} before={data.marketing.before} />
              ))}
            </Rows></Panel></details>
        </Section>
      )}

      <p className="small muted metrics__foot">Ушёл — был в прошлом периоде, сейчас не занимается и вперёд не записан. Новый — впервые занимался в этом периоде. Продление — повторная оплата.</p>
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

  const top = <CompactPeriodBar state={state} update={update} />;

  if (loading) return <>{top}<Loading rows={4} /></>;
  if (error) return <>{top}<ErrorState error={error} onRetry={reload} /></>;

  const now = data.process.now;
  const before = data.process.before;
  const period = describe(data);
  const row = (id) => (
    <Metric id={id} spec={PROCESS[id]} now={now} before={before} picked={picked === id} onPick={pick} />
  );
  const knowsCancels = now.cancels !== undefined;

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

      />

      <Section title="Как ведём клиентов" note="среди занимающихся за выбранный период">
        <Panel><Rows>
          <Metric id="planShare" spec={PROCESS.planShare} now={now} before={before} label="С программой" />
          <Metric id="measuredShare" spec={PROCESS.measuredShare} now={now} before={before} label="С замером" />
        </Rows></Panel>
      </Section>

      {knowsCancels && <Section title="Срывы">
        <SummaryTiles picked={picked} onPick={pick} items={[
          { id: 'cancels', label: 'Отмены', value: formatNumber(now.cancels, 0), note: now.cancelShare == null ? 'нет доли за период' : 'доля ' + formatNumber(now.cancelShare, 1) + '%', static: true },
          { id: 'moves', label: 'Переносы', value: formatNumber(now.moves, 0), static: true },
        ]} />
        <details className="metrics-more metrics-cancellations">
          <summary>Кто отменял</summary>
          <ScheduleStats range={rangeOf(state)} />
        </details>
      </Section>}
      {!knowsCancels && <ScheduleStats range={rangeOf(state)} />}

      {data.development && data.development.now && (
        <Development state={state} now={data.development.now} before={data.development.before} onChanged={reload} />
      )}
      <details className="metrics-more metrics-process-details">
        <summary>Все показатели и история</summary>
        <MetricChart group="process" id={picked} spec={PROCESS[picked]} state={state} compact />
        <Panel><Rows>{Object.keys(PROCESS).filter(id => knowsCancels || !['cancels', 'cancelsLate', 'moves', 'cancelShare'].includes(id)).map(id => <React.Fragment key={id}>{row(id)}</React.Fragment>)}</Rows></Panel>
        <p className="small muted">Не приходили месяц — за последние 30 дней на сегодня. Имена и переходы к замерам и программам — в «Обзоре».</p>
      </details>

    </>
  );
}

/* ==================================================================
 * Развитие
 * ================================================================== */

/**
 * Часы обучения — единственное в сводке, что вписывают руками, кроме
 * расходов и целей: лист «Развитие» иначе не посчитать. Запись — лист с
 * часами и парой слов; свои тренировки берутся с карточки тренера сами.
 */
function LearningSheet({ onClose, onSaved }) {
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('trainer.learning.add', { hours, note, day });
      haptic('success');
      onSaved();
      onClose();
    } catch (err) {
      setProblem(err.message || 'Не получилось сохранить.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Записать обучение" onClose={onClose} onDone={save} done={busy ? 'Сохраняем…' : 'Записать'} dirty={!!hours} locked={busy} focus="input">
      <div className="goals__form">
        <Field label="Часов" inputMode="decimal" value={hours} onChange={setHours} placeholder="1,5" disabled={busy} />
        <Field label="Что это было" inputMode="text" value={note} onChange={setNote} placeholder="Семинар, курс, книга" disabled={busy} />
        <Field label="Дата" type="date" value={day} onChange={setDay} disabled={busy} />
      </div>
      {problem && <p className="small form__error" role="alert">{problem}</p>}
    </Sheet>
  );
}

function Development({ state, now, before, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [revision, setRevision] = useState(0);
  const [problem, setProblem] = useState('');
  const month = state.period === 'year' ? null : state.month;
  const { data, reload } = useData('trainer.learning.list', { month: month || thisMonth() }, [month, revision]);

  const remove = async (id) => {
    try {
      await apiMutate('trainer.learning.delete', { id });
      haptic();
      setProblem('');
      setRevision((v) => v + 1);
      onChanged();
    } catch (err) {
      setProblem(err.message || 'Не получилось удалить запись. Попробуйте ещё раз.');
      reload();
    }
  };

  const entries = month && data && data.entries ? data.entries : [];
  const row = (id) => <Metric id={id} spec={DEVELOPMENT[id]} now={now} before={before} />;

  return (
    <>
      <Section
        title="Моё развитие"
        note="за выбранный период"
        action={(
          <button type="button" className="button button--ghost button--small" onClick={() => { setAdding(true); haptic(); }}>
            Записать
          </button>
        )}
      >
        <Panel>
          <Rows>
            {row('learningHours')}
            {row('ownWorkouts')}
            <details className="metrics-more"><summary>Журнал обучения</summary>{row('learningEntries')}</details>
          </Rows>
        </Panel>
        {problem && <p className="form__error" role="alert">{problem}</p>}
        {entries.length > 0 && (
          <Panel className="learning">
            <Rows>
              {entries.map((e) => (
                <div className="rows__item learning__item" key={e.id}>
                  <span className="rows__label learning__what">
                    {formatDate(e.day, false)}{e.note ? ' · ' + e.note : ''}
                  </span>
                  <span className="rows__value learning__hours">
                    {formatNumber(e.hours, 1)} ч
                    <button type="button" className="button button--ghost button--small" onClick={() => remove(e.id)} aria-label={'Удалить запись ' + formatDate(e.day, false)}>
                      Удалить
                    </button>
                  </span>
                </div>
              ))}
            </Rows>
          </Panel>
        )}
      </Section>
      {adding && <LearningSheet onClose={() => setAdding(false)} onSaved={() => { setRevision((v) => v + 1); onChanged(); }} />}
    </>
  );
}
