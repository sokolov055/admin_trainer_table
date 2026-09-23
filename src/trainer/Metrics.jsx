import React, { useState } from 'react';
import { useData } from '../useData.js';
import {
  Lead, Section, Panel, Rows, Row, Loading, ErrorState, Delta,
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
 * Месяц
 * ================================================================== */

/**
 * Переключатель месяца.
 *
 * Стрелками, а не списком: месяцев бесконечно много, а ходят по ним почти
 * всегда на шаг назад — «а в прошлом сколько было». Вперёд за текущий
 * месяц не пускаем: там заведомо нули, и человек решит, что сломалось.
 */
function MonthPicker({ month, onChange }) {
  const limit = thisMonth();
  const forward = shiftMonth(month, 1);

  const go = (step) => {
    const next = shiftMonth(month, step);
    if (next > limit) return;
    onChange(next);
    haptic();
  };

  return (
    <div className="monthpick">
      <button className="icon-button" onClick={() => go(-1)} aria-label="Предыдущий месяц">
        <IconBack size={18} />
      </button>

      <span className="monthpick__label">{monthLabel(month)}</span>

      <button
        className="icon-button monthpick__next"
        onClick={() => go(1)}
        disabled={forward > limit}
        aria-label="Следующий месяц"
      >
        <IconBack size={18} />
      </button>
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

function signed(value) {
  if (!value) return 'столько же, сколько месяцем раньше';
  return (value > 0 ? '+' : '−') + formatMoney(Math.abs(value)) + ' к прошлому месяцу';
}

/* ==================================================================
 * Финансы
 * ================================================================== */

export function Finance() {
  const [month, setMonth] = useState(thisMonth);
  const { loading, data, error, reload } = useData('trainer.metrics', { month }, [month]);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const now = data.finance.now;
  const before = data.finance.before;
  const past = monthLabel(data.previousMonth).toLowerCase();

  return (
    <>
      <MonthPicker month={data.month} onChange={setMonth} />

      {/* Крупно — прибыль, а не выручка. Выручку тренер и так помнит, а
          прибыль до сих пор нигде не считалась: расходов не было ни в
          базе, ни в таблице, и в месячных архивах её ставили руками. */}
      <Lead
        label={'Прибыль · ' + monthLabel(data.month)}
        tone={now.profit >= 0 ? 'good' : 'critical'}
        value={formatMoney(now.profit)}
        hint={signed(now.profit - before.profit)}
        facts={[
          { label: 'Выручка', value: formatMoney(now.revenue) },
          { label: 'Расходы', value: formatMoney(now.expenses) },
        ]}
      />

      <Section title="Деньги" note={'рядом — изменение к ' + past}>
        <Panel>
          <Rows>
            <Metric label="Выручка" unit="₽" value={now.revenue} before={before.revenue} />
            <Metric label="Расходы" unit="₽" value={now.expenses} before={before.expenses} aim={-1} />
            <Metric label="Прибыль" unit="₽" value={now.profit} before={before.profit} />
            <Metric label="Оплат принято" value={now.payments} before={before.payments} aim={0} />
            <Metric label="Тренировок проведено" value={now.trainings} before={before.trainings} />
          </Rows>
        </Panel>
      </Section>

      <Section title="Сколько приносит работа">
        <Panel>
          <Rows>
            <Metric
              label="Средний чек"
              unit="₽"
              value={now.averageCheck}
              before={before.averageCheck}
              note="оплат не было"
            />
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
        Выручка — оплаты, принятые в этом месяце. Прибыль — выручка минус
        расходы, и больше ничего: налоги и личные траты сюда не входят.
        Доля пяти крупнейших отвечает на вопрос, чем обернётся уход одного
        из них.
      </p>
    </>
  );
}

/* ==================================================================
 * Процессы
 * ================================================================== */

export function Processes() {
  const [month, setMonth] = useState(thisMonth);
  const { loading, data, error, reload } = useData('trainer.metrics', { month }, [month]);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const now = data.process.now;
  const before = data.process.before;
  const past = monthLabel(data.previousMonth).toLowerCase();

  return (
    <>
      <MonthPicker month={data.month} onChange={setMonth} />

      <Lead
        label={'Тренировок · ' + monthLabel(data.month)}
        value={formatNumber(now.trainings, 0)}
        hint={
          now.perClient
            ? 'по ' + formatNumber(now.perClient, 1) + ' на клиента'
            : 'занятий в этом месяце ещё не было'
        }
        facts={[
          { label: 'Клиентов', value: formatNumber(now.activeClients, 0) },
          { label: 'Молчат месяц', value: formatNumber(now.silentClients, 0) },
        ]}
      />

      <Section title="Работа" note={'рядом — изменение к ' + past}>
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
