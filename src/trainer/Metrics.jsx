import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import {
  Section, Panel, Rows, Row, Loading, ErrorState, Delta, Segmented, Sheet,
  formatNumber, formatMoney, formatDate, plural,
} from '../ui.jsx';
import { BarChart } from '../charts.jsx';
import { haptic } from '../telegram.js';
import { IconBack, IconChevron } from '../icons.jsx';
import ScheduleStats from './ScheduleStats.jsx';
import { SummarySignalSheet } from './SummarySignals.jsx';

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
let remembered = null;

/** Для проверок: каждый экран в них открывается как в первый раз */
export function resetPeriod() {
  remembered = null;
  chosen.finance = 'revenue';
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

export function comparisonLabels(data) {
  const range = data.year && data.throughMonth > 0 && data.throughMonth < 12
    ? ' · янв. — ' + SHORT_MONTHS[data.throughMonth - 1] : '';
  return data.year ? [data.year + range, data.previousYear + range]
    : [monthLabel(data.month), monthLabel(data.previousMonth)];
}

function CompactPeriodBar({ state, update, data }) {
  const [draft, setDraft] = useState(null);
  const isYear = state.period === 'year';
  const currentYear = new Date().getFullYear();
  const canForward = isYear ? state.year < currentYear : shiftMonth(state.month, 1) <= thisMonth();
  const labels = data ? comparisonLabels(data) : null;
  const fallbackPast = isYear ? String(state.year - 1) : monthLabel(shiftMonth(state.month, state.compare === 'year' ? -12 : -1));
  const step = (direction) => {
    if (direction > 0 && !canForward) return;
    update(isYear ? { year: state.year + direction } : { month: shiftMonth(state.month, direction) });
  };
  return <div className="metrics-period">
    <div className="metrics-period__line">
      <button type="button" className="icon-button" onClick={() => step(-1)} aria-label={isYear ? 'Предыдущий год' : 'Предыдущий месяц'}><IconBack size={18} /></button>
      <button type="button" className="metrics-period__choose" aria-haspopup="dialog" onClick={() => setDraft({ ...state })}>
        <strong>{isYear ? state.year : monthLabel(state.month)} <span aria-hidden="true">▾</span></strong>
        <small>Сравнение · {labels ? labels[1] : fallbackPast}</small>
      </button>
      <button type="button" className="icon-button monthpick__next" onClick={() => step(1)} disabled={!canForward}
        aria-label={isYear ? 'Следующий год' : 'Следующий месяц'}><IconBack size={18} /></button>
    </div>
    {draft && <Sheet title="Период и сравнение" onClose={() => setDraft(null)}
      onDone={() => { update(draft); setDraft(null); }} done="Применить">
      <div className="metrics-period__form">
        <label>Показывать<select value={draft.period} onChange={e => setDraft({ ...draft, period: e.target.value })}>
          <option value="month">Месяц</option><option value="year">Год</option>
        </select></label>
        <label>Период{draft.period === 'year'
          ? <input type="number" min="1" max={currentYear} value={draft.year} onChange={e => setDraft({ ...draft, year: Math.max(1, Math.min(currentYear, Math.trunc(Number(e.target.value)) || currentYear)) })} />
          : <input type="month" max={thisMonth()} value={draft.month} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value) && e.target.value <= thisMonth()) setDraft({ ...draft, month: e.target.value }); }} />}</label>
        {draft.period === 'month' && <label>Сравнить<select value={draft.compare} onChange={e => setDraft({ ...draft, compare: e.target.value })}>
          <option value="month">С прошлым месяцем</option><option value="year">С тем же месяцем прошлого года</option>
        </select></label>}
      </div>
    </Sheet>}
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

/** Выбранная для графика цифра — своя у каждой стороны */
const chosen = { finance: 'revenue', clients: 'active', process: 'trainings' };

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
  if (value == null) return '—';
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
  const amountLength = Math.max(...items.map((item) => item.value.length));
  return <div className="metrics-tiles" style={{ '--amount-length': amountLength }}>
    {items.map(({ id, label, value, note, static: fixed }) => {
      const body = <>
        <strong className="summary-tile-amount">{value}</strong>
        <span>{label}</span>{note && <small>{note}</small>}
      </>;
      return fixed
        ? <div key={id} className="metrics-tile">{body}</div>
        : <button key={id} type="button" className={'metrics-tile' + (picked === id ? ' metrics-tile--picked' : '')}
            onClick={() => onPick(id)} aria-pressed={picked === id}>{body}</button>;
    })}
  </div>;
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
  return <Section title="Кого вернуть" note="30 дней без занятий">
    <Panel pad><div className="metrics-people">{people.slice(0, 2).map(personRow)}</div></Panel>
    {people.length > 2 && <details className="metrics-more"><summary>Ещё {people.length - 2}</summary>
      <Panel pad><div className="metrics-people">{people.slice(2).map(personRow)}</div></Panel>
    </details>}
  </Section>;
}

/* ==================================================================
 * Финансы
 * ================================================================== */

function FinanceComparison({ spec, values, labels, controls = null }) {
  const known = values.filter(Number.isFinite);
  const low = Math.min(0, ...known);
  const high = Math.max(0, ...known);
  const span = high - low || 1;
  const zero = 100 * -low / span;

  return (
    <section className="finance-comparison" aria-labelledby="finance-comparison-title" aria-live="polite">
      <h2 id="finance-comparison-title">{controls ? 'Сравнение' : spec.label + ' · сравнение'}</h2>
      {controls}
      {values.map((value, index) => (
        <div key={index} className="finance-comparison__row">
          <div className="finance-comparison__label">
            <span>{labels[index]}</span>
            <strong>{Number.isFinite(value) ? format(value, spec.unit, spec.digits) : 'Нет данных'}</strong>
          </div>
          {Number.isFinite(value) && (
            <div className="finance-comparison__track" aria-hidden="true">
              <span className="finance-comparison__bar" style={{
                insetInlineStart: Math.min(zero, 100 * (value - low) / span) + '%',
                width: 100 * Math.abs(value) / span + '%',
              }} />
              {low < 0 && high > 0 && <span className="finance-comparison__zero" style={{ insetInlineStart: zero + '%' }} />}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export function Finance({ onExpenses }) {
  const [state, update] = usePeriod();
  const [picked, pick] = useChosen('finance');
  const { loading, data, error, reload } = useMetrics(state);

  const top = <CompactPeriodBar state={state} update={update} data={!loading && !error ? data : null} />;

  if (loading) return <>{top}<Loading rows={4} /></>;
  if (error) return <>{top}<ErrorState error={error} onRetry={reload} /></>;

  const now = data.finance?.now || {};
  const before = data.finance?.before || {};
  const period = describe(data);
  const labels = comparisonLabels(data);
  const row = (id, label) => (
    <Metric id={id} spec={FINANCE[id]} now={now} before={before} picked={picked === id} onPick={pick} label={label} />
  );

  return (
    <>
      {top}
      <Panel pad className="summary-hero">
        <span className="overview-pace__label">{data.year ? 'Прибыль за год' : 'Прибыль за месяц'}</span>
        <strong className="overview-pace__value">{format(now.profit, '₽')}</strong>
        <p className="overview-pace__hint">Выручка за занятия минус расходы</p>
      </Panel>

      <Section>
        {!now.trainings && !now.revenue && !now.expenses && !now.cash && !now.bank
          ? <p className="summary-empty">Пока нет занятий, оплат и расходов.</p>
          : <SummaryTiles picked={picked} onPick={pick} items={[
            { id: 'revenue', label: 'Выручка', value: format(now.revenue, '₽'), note: 'за проведённое' },
            { id: 'expenses', label: 'Расходы', value: format(now.expenses, '₽'), note: 'за выбранный период' },
            { id: 'cash', label: 'Касса', value: format(now.cash || 0, '₽'), note: 'получено оплат' },
            { id: 'bank', label: 'Предоплаты', value: format(now.bank || 0, '₽'), note: 'остаток на сегодня', static: true },
          ]} />}
        <FinanceComparison spec={FINANCE[picked]} values={[now[picked], before[picked]]} labels={labels} />
      </Section>

      <details className="metrics-more">
        <summary>История и остальные показатели</summary>
        <p className="small muted metrics__tile-note">Предоплаты — обязательство провести занятия. Это не выручка.</p>
        {now.profit != null && before.profit != null &&
          <p className="small muted">{signed(now.profit - before.profit, period)} · изменение к {period.against}</p>}
        <MetricChart group="finance" id={picked} spec={FINANCE[picked]} state={state} compact />
        {onExpenses && <button type="button" className="button button--ghost" onClick={onExpenses}>Учёт расходов</button>}
        <Panel>
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
        </Panel>
      </details>
    </>
  );
}

/* ==================================================================
 * Клиенты
 * ================================================================== */

export function Clients({ onOpenClient = null }) {
  const [state, update] = usePeriod();
  const [clientMetric, pickClient] = useChosen('clients');
  const [processMetric, pickProcess] = useChosen('process');
  const [historyGroup, setHistoryGroup] = useState('clients');
  const [comparisonMetric, setComparisonMetric] = useState('active');
  const [signal, setSignal] = useState(null);
  const [showCancellations, setShowCancellations] = useState(false);
  const { loading, data, error, reload } = useMetrics(state);
  const overview = useData('trainer.metrics.overview', {}, []);
  const top = <CompactPeriodBar state={state} update={update} data={!loading && !error ? data : null} />;

  if (loading) return <>{top}<Loading rows={4} /></>;
  if (error) return <>{top}<ErrorState error={error} onRetry={reload} /></>;

  const clients = data.clients?.now || {};
  const process = data.process?.now || {};
  const period = describe(data);
  const active = clients.active || 0;
  const isCurrent = state.period === 'month' && state.month === thisMonth();
  const group = historyGroup === 'clients' ? CLIENTS : PROCESS;
  const metric = historyGroup === 'clients' ? clientMetric : processMetric;
  const knowsCancels = process.cancels !== undefined;
  const counts = [
    [clients.newClients, 'новый', 'новых', 'новых'],
    [clients.lost, 'ушёл', 'ушли', 'ушли'],
    [clients.renewals, 'продлил', 'продлили', 'продлили'],
  ].map(([count = 0, ...words]) => formatNumber(count || 0, 0) + ' ' + plural(count || 0, ...words));

  const historyRows = (key, specs, picked, pick) => Object.entries(specs).map(([id, spec]) => (
    <Metric key={id} id={id} spec={spec} now={data[key]?.now || {}} before={data[key]?.before}
      picked={picked === id && historyGroup === key} onPick={(next) => { pick(next); setHistoryGroup(key); }} />
  ));
  const care = [
    { id: 'noPlan', key: 'planShare', label: 'С программой', note: 'Кому нужна программа' },
    { id: 'measureDue', key: 'measuredShare', label: 'С замером', note: 'Кому пора замер' },
  ];
  const canOpenCare = isCurrent && onOpenClient && overview.data;
  const target = overview.data?.targets?.retention;

  return (
    <>
      {top}
      <Panel pad className="summary-hero">
        <span className="overview-pace__label">Клиенты и занятия {data.year ? 'за год' : 'за месяц'}</span>
        <strong className="overview-pace__value">{formatNumber(active, 0)} {plural(active, 'клиент', 'клиента', 'клиентов')}</strong>
        <p className="overview-pace__hint">{counts.join(' · ')}</p>
        <div className="overview-pace__facts">
          <span><small>Проведено</small><b>{formatNumber(process.trainings || 0, 0)}</b></span>
          <span><small>На клиента</small><b>{process.perClient ? formatNumber(process.perClient, 1) : '—'}</b></span>
          <span><small>Удержание</small><b>{format(clients.retention, '%')}</b></span>
        </div>
      </Panel>

      <FinanceComparison
        spec={comparisonMetric === 'trainings' ? PROCESS.trainings : CLIENTS[comparisonMetric]}
        values={comparisonMetric === 'trainings'
          ? [data.process?.now?.trainings, data.process?.before?.trainings]
          : [data.clients?.now?.[comparisonMetric], data.clients?.before?.[comparisonMetric]]}
        labels={comparisonLabels(data)}
        controls={<Segmented items={[
          { value: 'active', label: 'Клиенты' }, { value: 'trainings', label: 'Занятия' }, { value: 'retention', label: 'Удержание' },
        ]} value={comparisonMetric} onChange={setComparisonMetric} label="Показатель сравнения" />} />

      <Section title="Ведение клиентов" note="из занимающихся">
        {!process.trainings && !process.planShare && !process.measuredShare
          ? <p className="summary-empty">Нет занимающихся за выбранный период.</p>
          : <div className="metrics-tiles">
            {care.map(({ id, key, label, note }) => {
              const body = <><strong>{format(process[key], '%')}</strong><span className="summary-care__label">{label}{canOpenCare && <IconChevron size={14} />}</span>{canOpenCare && <small>{note}</small>}</>;
              const props = { className: 'metrics-tile summary-care', 'data-signal': id };
              return canOpenCare
                ? <button key={id} type="button" {...props} onClick={() => { setSignal(id); haptic(); }}>{body}</button>
                : <div key={id} {...props}>{body}</div>;
            })}
          </div>}
      </Section>

      {isCurrent && onOpenClient && <ReturnClients onOpenClient={onOpenClient} {...overview} />}

      <Section title="Отмены и переносы">
        {knowsCancels && !process.cancels && !process.moves
          ? <p className="summary-empty">Отмен и переносов за период нет.</p>
          : <Panel>
            {knowsCancels && <Rows>
              <Row label={<>Отмены{process.cancelShare != null && <small className="summary-row-note">
                {format(process.cancelShare, '%', 1)} от запланированных
              </small>}</>}>{formatNumber(process.cancels, 0)}</Row>
              <Row label="Переносы">{formatNumber(process.moves, 0)}</Row>
            </Rows>}
            <button type="button" className="button button--ghost summary-cancellers"
              onClick={() => { setShowCancellations(true); haptic(); }}>Кто отменял ›</button>
          </Panel>}
      </Section>

      <details className="metrics-more summary-history">
        <summary>Источники, история и все показатели</summary>
        {data.marketing?.now && <Section title="Откуда приходят"><Panel><Rows>
          {['referralShare', 'unknown', ...SOURCES.map((source) => source.value)].map((id) => (
            <Metric key={id} id={id} spec={MARKETING[id]} now={data.marketing.now} before={data.marketing.before} />
          ))}
        </Rows></Panel></Section>}
        <Section title="Динамика" note={'к ' + period.against}>
          <MetricChart group={historyGroup} id={metric} spec={group[metric]} state={state} compact />
        </Section>
        <Section title="Движение и оплаты" note={target ? 'цель ' + format(target, '%') : undefined}>
          <p className="small muted">{clients.retention == null
            ? 'Сравнить не с чем: в прошлом периоде занятий не было.'
            : `${formatNumber(clients.retained || 0, 0)} из ${formatNumber(data.clients?.before?.active || 0, 0)} занимавшихся ${period.before} вернулись`}</p>
          <Panel><Rows>{historyRows('clients', CLIENTS, clientMetric, pickClient)}</Rows></Panel>
        </Section>
        <Section title="Занятия">
          <Panel><Rows>{historyRows('process', PROCESS, processMetric, pickProcess)}</Rows></Panel>
        </Section>
      </details>

      {signal && <SummarySignalSheet id={signal} signals={overview.data?.signals}
        onOpenClient={onOpenClient} onClose={() => setSignal(null)} />}
      {showCancellations && <Sheet title="Кто отменял" onClose={() => setShowCancellations(false)}>
        <div className="summary-cancellations"><ScheduleStats range={rangeOf(state)} /></div>
      </Sheet>}
    </>
  );
}
