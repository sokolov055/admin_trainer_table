import React, { useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import {
  Lead, Section, Panel, Rows, Row, Loading, ErrorState, Empty, Badge, Chips, Segmented, Search,
  SignOut, DataTable, Delta, formatNumber, formatMoney, formatDate, formatWhen, relativeDays, daysSince, plural,
} from '../ui.jsx';
import { getThemeMode, setThemeMode } from '../telegram.js';
import {
  IconUsers, IconSearch, IconDeparted, IconLog, IconSheet, IconRefresh, IconBack, IconChart,
} from '../icons.jsx';

/* ==================================================================
 * Клиенты
 * ================================================================== */

export function Clients({ onOpenClient }) {
  const { loading, data, error, reload } = useData('trainer.clients', {}, []);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [refresh, setRefresh] = useState({ busy: false, error: null, done: null });

  // Пересчёт по календарю — та же галочка «Обновить», что в таблице. Раньше
  // ради неё надо было открыть таблицу на компьютере, и данные в приложении
  // жили своей жизнью, пока тренер до неё не дойдёт.
  //
  // Ответ идёт десятки секунд: скрипт читает календарь и переписывает лист.
  // Поэтому кнопка блокируется на время работы — второе нажатие не ускорит
  // пересчёт, а только заставит ждать ещё и очереди на стороне таблицы.
  const runRefresh = async () => {
    setRefresh({ busy: true, error: null, done: null });

    try {
      const res = await apiMutate('calendar.refresh', {});
      setRefresh({ busy: false, error: null, done: res });
      reload();
    } catch (err) {
      setRefresh({ busy: false, error: err, done: null });
    }
  };

  if (loading) return <Loading rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const s = data.summary;

  const needsAttention = data.clients.filter((c) => {
    const days = daysSince(c.lastTrainingDate);
    return c.balance < 0 || days === null || days > s.staleDays;
  });

  // Клиенты с назначенным занятием впереди. Прошедшие сюда не попадают:
  // сервер отдаёт дату, только пока занятие не кончилось.
  const upcoming = data.clients.filter((c) => c.nextTrainingDate);

  const filters = [
    { value: 'all', label: `Все · ${data.clients.length}` },
    { value: 'next', label: `Ближайшие · ${upcoming.length}` },
    { value: 'attention', label: `Требуют внимания · ${needsAttention.length}` },
    { value: 'debt', label: `Долг · ${s.negativeBalance}` },
    { value: 'nomeasure', label: 'Без замера' },
  ];

  const filtered = data.clients.filter((c) => {
    if (query && c.name.toLowerCase().indexOf(query.toLowerCase()) === -1) return false;

    if (filter === 'next') return !!c.nextTrainingDate;
    if (filter === 'attention') return needsAttention.indexOf(c) !== -1;
    if (filter === 'debt') return c.balance < 0;
    if (filter === 'nomeasure') return String(c.lastMeasureStatus || '').indexOf('✅') !== 0;
    return true;
  });

  // «Ближайшие» — единственный фильтр, который ещё и сортирует: список
  // отвечает на вопрос «кто следующий», а на него нельзя ответить порядком
  // строк в таблице. Даты в ISO сравниваются как строки — этого достаточно,
  // они одного формата и одного пояса.
  const shown = filter === 'next'
    ? [...filtered].sort((a, b) => String(a.nextTrainingDate).localeCompare(String(b.nextTrainingDate)))
    : filtered;

  return (
    <>
      <Lead
        label={'Выручка · ' + s.currentMonth}
        tone={s.profit >= 0 ? 'good' : 'critical'}
        value={formatMoney(s.totalRevenue)}
        hint={`${s.totalTrainings} ${plural(s.totalTrainings, 'тренировка', 'тренировки', 'тренировок')} у ${s.count} ${plural(s.count, 'клиента', 'клиентов', 'клиентов')}`}
        facts={[
          { label: 'Прибыль после аренды', value: formatMoney(s.profit, { compact: true }) },
          { label: 'Касса', value: formatMoney(s.cash, { compact: true }) },
          {
            label: 'Требуют внимания',
            value: needsAttention.length ? needsAttention.length + ' из ' + s.count : 'нет',
          },
        ]}
      />

      <Section
        note={refreshNote(refresh)}
        action={
          <button
            className="button button--ghost"
            onClick={runRefresh}
            disabled={refresh.busy}
          >
            <IconRefresh size={16} />
            {refresh.busy ? 'Обновляю…' : 'Обновить'}
          </button>
        }
      >
        <Search value={query} onChange={setQuery} placeholder="Поиск по имени" />
        <Chips items={filters} value={filter} onChange={setFilter} />

        {shown.length === 0 && (
          <Empty icon={IconSearch} title="Никого не нашлось" text="Попробуйте другой фильтр или запрос." />
        )}

        {shown.map((c) => {
          // «Нет данных» и «давно не приходил» — разные вещи, и лечатся
          // по-разному: первое чинит пересчёт календаря, второе — звонок
          // клиенту. Раньше оба показывались одним словом «пропал», которое
          // вдобавок путалось с листом «Пропащие» — а туда клиент попадает
          // только вручную и означает это совсем другое.
          const days = daysSince(c.lastTrainingDate);
          const noData = days === null;
          const isStale = !noData && days > s.staleDays;

          return (
            <button className="item" key={c.row} onClick={() => onOpenClient(c)}>
              <div className="item__top">
                <span className="item__name">{c.name}</span>
                <span
                  className="item__amount"
                  style={{
                    color: c.balance < 0
                      ? 'var(--critical-text)'
                      : c.balance > 0 ? 'var(--text)' : 'var(--text-muted)',
                  }}
                >
                  {formatMoney(c.balance)}
                </span>
              </div>
              <div className="item__meta">
                <span>
                  {c.trainings} {plural(c.trainings, 'тренировка', 'тренировки', 'тренировок')} · {formatMoney(c.revenue)}
                </span>
                <span>
                  {c.lastTrainingDate ? relativeDays(c.lastTrainingDate) : 'тренировок не было'}
                </span>

                {/* Когда следующая — не значок состояния, а обычный факт,
                    поэтому обычной строкой. Значком он спорил бы за
                    внимание с «не был N дней», а это разные новости. */}
                {c.nextTrainingDate && <span>дальше {formatWhen(c.nextTrainingDate)}</span>}
                {noData && <Badge>нет данных</Badge>}
                {isStale && (
                  <Badge kind="warn">
                    не был {days} {plural(days, 'день', 'дня', 'дней')}
                  </Badge>
                )}
                {!c.chatId && <Badge>без Telegram</Badge>}
                {!c.hasLink && <Badge>без таблицы</Badge>}
              </div>
            </button>
          );
        })}
      </Section>
    </>
  );
}

/**
 * Подпись у кнопки обновления.
 *
 * Пока ничего не нажимали — говорим, что именно произойдёт: «обновить» само
 * по себе не объясняет, откуда возьмутся данные. После пересчёта показываем
 * итог цифрами: тренер видит, что работа действительно была сделана, а не
 * просто мигнула кнопка.
 */
function refreshNote(state) {
  if (state.busy) return 'Читаю календарь — это занимает до минуты';
  if (state.error) return 'Не получилось: ' + (state.error.message || 'таблица не ответила');

  if (state.done) {
    const d = state.done;
    const tail = d.mirrorUpdated === false ? ' · данные подтянутся в ближайшие минуты' : '';
    return `Обновлено: ${d.trainings} ${plural(d.trainings, 'тренировка', 'тренировки', 'тренировок')} у ${d.clients} ${plural(d.clients, 'клиента', 'клиентов', 'клиентов')}${tail}`;
  }

  return 'Пересчитать тренировки и долг по календарю';
}

/* ==================================================================
 * Шапка карточки клиента
 * ================================================================== */

export function ClientCard({ client }) {
  return (
    <Panel pad className="enter">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center' }}>
        <Badge kind={client.balance < 0 ? 'bad' : client.balance > 0 ? 'good' : undefined}>
          Баланс {formatMoney(client.balance)}
        </Badge>
        <Badge>{formatMoney(client.price)} за тренировку</Badge>
        {client.payer && <Badge>платит {client.payer}</Badge>}
        {!client.chatId && <Badge kind="warn">нет Telegram</Badge>}
      </div>

      <div className="small muted" style={{ marginTop: 10 }}>
        {client.clientKey && <>Ключ <code>{client.clientKey}</code> · </>}
        строка {client.row}
      </div>
    </Panel>
  );
}

/* ==================================================================
 * Финансы
 * ================================================================== */

export function Finance() {
  const { loading, data, error, reload } = useData('trainer.finance', {}, []);
  const [showYears, setShowYears] = useState(false);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const all = data.columns || [];
  const columns = all.filter((c) => showYears || !c.isYearTotal);

  if (columns.length === 0) {
    return <Empty icon={IconChart} title="Нет месяцев" text="В шапке листа BSC_Финансы не найдено ни одного месяца." />;
  }

  // Свежие месяцы первыми: до правого края широкой таблицы на телефоне
  // ещё нужно долистать, а интересует обычно последний.
  const ordered = columns.slice().reverse();
  const latest = all.filter((c) => !c.isYearTotal).slice(-1)[0];

  const metricBy = (label) => (data.metrics || []).find((m) => m.label === label);
  const revenue = metricBy('Выручка');
  const profit = metricBy('Прибыль');
  const trainings = metricBy('Тренировок проведено');

  return (
    <>
      {latest && revenue && (
        <Lead
          label={'Выручка · ' + latest.label}
          tone="good"
          value={revenue.values[latest.label] || '—'}
          hint={revenue.unit ? 'в ' + revenue.unit : undefined}
          facts={[
            profit ? { label: 'Прибыль', value: profit.values[latest.label] || '—' } : null,
            trainings ? { label: 'Тренировок', value: trainings.values[latest.label] || '—' } : null,
          ]}
        />
      )}

      <Section title={data.sheet} note="значения как в таблице">
        <Chips
          items={[
            { value: 'months', label: 'Месяцы' },
            { value: 'all', label: 'С итогами года' },
          ]}
          value={showYears ? 'all' : 'months'}
          onChange={(v) => setShowYears(v === 'all')}
        />

        <Panel pad>
          <MetricTable metrics={data.metrics} columns={ordered} />
        </Panel>
      </Section>
    </>
  );
}

/* ==================================================================
 * Процессы
 * ================================================================== */

export function Processes() {
  const { loading, data, error, reload } = useData('trainer.processes', {}, []);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const columns = (data.columns || []).filter((c) => !c.isYearTotal).slice().reverse();

  if (columns.length === 0) {
    return <Empty icon={IconChart} title="Нет снимков" text="В шапке листа BSC_Процессы не найдено ни одного месяца." />;
  }

  return (
    <Section title={data.sheet} note="снимки по месяцам">
      <Panel pad>
        <MetricTable metrics={data.metrics} columns={columns} />
      </Panel>
    </Section>
  );
}

function MetricTable({ metrics, columns }) {
  if (!metrics || metrics.length === 0) return <Empty text="Нет метрик" />;

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="sticky">Метрика</th>
            {columns.map((c) => (
              <th key={c.label} className="num">
                {c.isYearTotal ? <strong>{c.label}</strong> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, i) => (
            <tr key={i}>
              <td className="sticky" style={{ fontWeight: 560 }}>
                {m.label}
                {m.unit && <span className="muted small">, {m.unit}</span>}
              </td>
              {columns.map((c) => (
                <td key={c.label} className="num nowrap">{m.values[c.label] || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ==================================================================
 * Ушедшие
 * ================================================================== */

export function Lost() {
  const { loading, data, error, reload } = useData('trainer.lost', {}, []);

  if (loading) return <Loading lead={false} rows={3} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.clients || data.clients.length === 0) {
    return <Empty icon={IconDeparted} title="Список пуст" text="Никто не ушёл — это хорошая новость." />;
  }

  const unsettled = data.clients.filter((c) => c.balance !== 0);

  // Заголовок не повторяет название подраздела, оно уже в шапке —
  // здесь полезно другое: сколько их и сколько долгов осталось.
  return (
    <Section
      title={`${data.clients.length} ${plural(data.clients.length, 'человек', 'человека', 'человек')}`}
      note={unsettled.length ? `${unsettled.length} с незакрытым балансом` : 'все балансы закрыты'}
    >
      {data.clients.map((c) => (
        <div className="item item--static" key={c.row}>
          <div className="item__top">
            <span className="item__name">{c.name}</span>
            <span className="muted small nowrap">{formatDate(c.moveDate)}</span>
          </div>
          <div className="item__meta">
            <span>
              {c.trainings} {plural(c.trainings, 'тренировка', 'тренировки', 'тренировок')} · {formatMoney(c.revenue)}
            </span>
            {c.balance !== 0 && (
              <Badge kind={c.balance < 0 ? 'bad' : 'warn'}>
                баланс {formatMoney(c.balance)}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </Section>
  );
}

/* ==================================================================
 * Логи
 * ================================================================== */

export function Logs() {
  const { loading, data, error, reload } = useData('trainer.logs', { limit: 150 }, []);

  if (loading) return <Loading lead={false} rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.entries || data.entries.length === 0) {
    return <Empty icon={IconLog} title="Лог пуст" text="Здесь появятся записи о платежах, пересчётах и переносах." />;
  }

  return (
    <Section
      title="Последние события"
      note={`${data.entries.length} из ${data.total}`}
      action={
        <button className="button button--ghost" onClick={reload}>
          <IconRefresh size={15} />
          Обновить
        </button>
      }
    >
      {data.entries.map((e, i) => {
        const result = String(e.result || '');
        const kind = result.indexOf('❌') === 0 ? 'bad'
          : result.indexOf('⚠️') === 0 ? 'warn'
          : result.indexOf('✅') === 0 ? 'good' : undefined;

        return (
          <div className="item item--static" key={i}>
            <div className="item__top">
              <span className="item__name">{e.action}</span>
              <Badge kind={kind}>{result.replace(/^[✅❌⚠️]+\s*/, '') || 'без статуса'}</Badge>
            </div>
            <div className="item__meta">
              <span>{e.at}</span>
              {e.client && <span>{e.client}</span>}
            </div>
            {e.details && (
              <div className="small muted" style={{ marginTop: 5 }}>{e.details}</div>
            )}
          </div>
        );
      })}
    </Section>
  );
}

/* ==================================================================
 * Листы таблицы
 * ================================================================== */

export function Sheets() {
  const list = useData('trainer.sheets', {}, []);
  const [selected, setSelected] = useState(null);

  if (list.loading) return <Loading lead={false} rows={5} />;
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />;

  if (selected) return <SheetView name={selected} onBack={() => setSelected(null)} />;

  return (
    <Section title={list.data.spreadsheetName} note="любой лист таблицы, как есть">
      {list.data.sheets.map((sh) => (
        <button className="item" key={sh.name} onClick={() => setSelected(sh.name)}>
          <div className="item__top">
            <span className="item__name">{sh.name}</span>
            <span className="muted small nowrap">
              {sh.rows} {plural(sh.rows, 'строка', 'строки', 'строк')}
            </span>
          </div>
        </button>
      ))}
    </Section>
  );
}

function SheetView({ name, onBack }) {
  const { loading, data, error, reload } = useData('trainer.sheet', { name, limit: 300 }, [name]);

  return (
    <>
      <button className="button button--ghost" style={{ marginBottom: 12 }} onClick={onBack}>
        <IconBack size={16} />
        К списку листов
      </button>

      {loading && <Loading lead={false} rows={4} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && (
        <Section
          title={data.name}
          note={
            data.truncated
              ? `первые ${data.rows.length} из ${data.total} строк`
              : `${data.total} ${plural(data.total, 'строка', 'строки', 'строк')}`
          }
        >
          <Panel pad>
            <DataTable headers={data.headers} rows={data.rows} />
          </Panel>
        </Section>
      )}
    </>
  );
}

/* ==================================================================
 * Настройки
 * ================================================================== */

const THEME_ITEMS = [
  { value: 'auto', label: 'Авто' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

const THEME_HINTS = {
  auto: 'Как в Telegram: приложение переключается вместе с мессенджером, а вне его — вместе с системой.',
  light: 'Всегда светлая, даже если Telegram в тёмной теме.',
  dark: 'Всегда тёмная, даже если Telegram в светлой теме.',
};

/**
 * Настройки приложения.
 *
 * Пока здесь одна вещь — тема. Раздел всё равно нужен: тренер открывает
 * приложение и в зале при верхнем свете, и вечером дома, а тема Telegram
 * к этому отношения не имеет.
 */
export function Settings() {
  // Читаем один раз при первом рендере: значение уже применено к странице
  // в telegram.js, и спрашивать хранилище на каждый рендер незачем.
  const [mode, setMode] = useState(getThemeMode);

  return (
    <>
      <Section title="Внешний вид">
        <Panel pad>
          <div className="setting">
            <div className="setting__label">Тема</div>
            <Segmented
              items={THEME_ITEMS}
              value={mode}
              label="Тема оформления"
              onChange={(next) => setMode(setThemeMode(next))}
            />
            <div className="setting__note">{THEME_HINTS[mode]}</div>
          </div>
        </Panel>
      </Section>

      {/* Выход стоит последним и сам прячется внутри Telegram: там выходить
          не из чего, см. SignOut */}
      <SignOut />
    </>
  );
}
