import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { apiPublic, apiMutate } from '../api.js';
import { resetClientAccess } from '../client-access.js';
import { createClient } from '../access.js';
import { ClientInviteLink } from './InviteLink.jsx';
import {
  Lead, Section, Panel, Rows, Row, Loading, ErrorState, Empty, Badge, Chips, Segmented, Search,
  SignOut, DataTable, Delta, Field, Note, formatNumber, formatMoney, formatDate, formatWhen, relativeDays, daysSince, plural,
} from '../ui.jsx';
import { getThemeMode, haptic, setThemeMode } from '../telegram.js';
import { IconUsers, IconUserPlus, IconSearch, IconDeparted, IconLog, IconSheet, IconRefresh, IconBack, IconChart, IconKey, IconAlert, IconCheck } from '../icons.jsx';

/* ==================================================================
 * Клиенты
 * ================================================================== */

export function Clients({ onOpenClient, refresh, onRefresh, refreshRevision }) {
  const { loading, data, error, reload } = useData('trainer.clients', {}, [refreshRevision]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [pendingRow, setPendingRow] = useState(0);

  // Заведённая карточка открывается сама, но только после того, как
  // список перечитан: карточке нужны цифры из зеркала, а не одно имя из
  // формы. Секунда ожидания честнее, чем полупустой экран.
  useEffect(() => {
    if (!pendingRow) return;
    const created = (data && data.clients ? data.clients : []).find((c) => c.row === pendingRow);
    if (!created) return;
    setPendingRow(0);
    onOpenClient(created);
  }, [pendingRow, data]);

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
            onClick={onRefresh}
            disabled={refresh.busy}
          >
            <IconRefresh size={16} />
            {refresh.busy ? 'Обновляю…' : 'Обновить'}
          </button>
        }
      >
        {/* Заведение клиента — первое действие тренера с новым человеком,
            поэтому живёт над списком, а не в меню: искать его не должно
            приходиться. Открывается по нажатию, чтобы форма не занимала
            место в те дни, когда никого не заводят. */}
        <AddClient
          onCreated={(client) => {
            setPendingRow(client.row);
            reload();
          }}
        />

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
                {/* Не приглашён — это задача тренера, а не свойство
                    клиента: ни ссылки, ни Telegram у человека нет, и в
                    кабинет он войти не может. */}
                {!c.chatId && !c.invited && <Badge kind="warn">не приглашён</Badge>}
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
 * Заведение клиента.
 *
 * Спрашиваем только ФИО. Цена, пакет и расписание появятся в таблице
 * своим чередом, а сейчас нужно другое: чтобы у человека как можно
 * быстрее был кабинет и ссылка в него. Всё остальное — потом.
 *
 * Строка создаётся в Google Таблице: она остаётся источником истины, и
 * ключ клиента выдаёт она же. Поэтому кнопка думает несколько секунд —
 * это поход в таблицу, а не задумчивость приложения.
 */
function AddClient({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (!value || busy) return;

    setBusy(true);
    setError(null);
    try {
      const created = await createClient(value);
      haptic('success');
      setName('');
      setOpen(false);
      onCreated(created);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="button button--primary button--block add-client__open" onClick={() => { setOpen(true); haptic(); }}>
        <IconUserPlus size={17} />
        Добавить клиента
      </button>
    );
  }

  return (
    <Panel pad className="add-client">
      <form onSubmit={submit}>
        <label className="field">
          <span className="field__label">ФИО клиента</span>
          <input
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Иван Иванов"
            autoComplete="off"
            autoFocus
            maxLength={120}
            required
          />
        </label>

        {error && (
          <div className="access-reset__error" role="alert">
            {error.message || 'Не получилось завести клиента'}
          </div>
        )}

        <div className="add-client__actions">
          <button className="button button--primary" disabled={busy || !name.trim()}>
            {busy ? <IconRefresh size={16} /> : <IconUserPlus size={16} />}
            {busy ? 'Завожу в таблице…' : 'Создать карточку'}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            disabled={busy}
          >
            Отмена
          </button>
        </div>

        <p className="add-client__hint">
          Дальше в карточке будет кнопка «Пригласить в приложение» — она даст
          ссылку, по которой клиент войдёт в свой кабинет.
        </p>
      </form>
    </Panel>
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
  const [access, setAccess] = useState({
    confirming: false,
    unlinkTelegram: false,
    busy: false,
    error: null,
    done: null,
    linked: !!client.chatId,
  });

  const resetAccess = async () => {
    if (access.busy) return;
    setAccess((s) => ({ ...s, busy: true, error: null, done: null }));

    try {
      const result = await resetClientAccess(client.row, access.unlinkTelegram);
      setAccess((s) => ({
        ...s,
        busy: false,
        confirming: false,
        error: null,
        done: result,
        linked: s.unlinkTelegram ? false : s.linked,
        unlinkTelegram: false,
      }));
    } catch (error) {
      setAccess((s) => ({ ...s, busy: false, error, done: null }));
    }
  };

  return (
    <Panel pad className="enter">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px', alignItems: 'center' }}>
        <Badge kind={client.balance < 0 ? 'bad' : client.balance > 0 ? 'good' : undefined}>
          Баланс {formatMoney(client.balance)}
        </Badge>
        <Badge>{formatMoney(client.price)} за тренировку</Badge>
        {client.payer && <Badge>платит {client.payer}</Badge>}
      </div>

      <div className="small muted" style={{ marginTop: 10 }}>
        {client.clientKey && <>Ключ <code>{client.clientKey}</code> · </>}
        строка {client.row}
      </div>

      <ClientContacts clientRow={client.row} />

      <ClientEdit client={client} />

      {/* Приглашение стоит выше сброса доступа намеренно: выдать вход —
          повседневное действие, отобрать — редкое. */}
      <ClientInviteLink client={client} />

      {access.done && (
        <div className="access-reset__result" role="status">
          Доступ сброшен. Все устройства выйдут при следующем запросе.
          {access.done.revokedLinks > 0 && ' Ссылка входа отозвана — выдайте новую, когда понадобится.'}
          {access.done.unlinked && ' Telegram отвязан.'}
        </div>
      )}

      {access.error && (
        <div className="access-reset__error" role="alert">
          Не получилось сбросить доступ: {access.error.message || 'сервер не ответил'}
        </div>
      )}

      {/* Кнопка доступна всегда: войти можно не только через Telegram, а
          закрыть надо уметь любой вход — и ссылку, и открытые кабинеты. */}
      {!access.confirming && (
        <button
          className="button button--ghost access-reset__trigger"
          onClick={() => setAccess((s) => ({ ...s, confirming: true, error: null, done: null }))}
          disabled={access.busy}
        >
          <IconKey size={16} />
          Сбросить доступ
        </button>
      )}

      {access.confirming && (
        <div className="access-reset">
          <div className="small">
            Ссылка входа перестанет работать, все открытые браузеры и ярлыки
            выйдут из кабинета. Тренировки, замеры и оплаты останутся без
            изменений.
          </div>

          {/* Отвязка нужна только тем, у кого Telegram вообще привязан:
              остальные заходят по ссылке, и галочка им ничего не даёт. */}
          {access.linked && (
            <label className={'access-reset__option' + (!client.clientKey ? ' access-reset__option--disabled' : '')}>
              <input
                type="checkbox"
                checked={access.unlinkTelegram}
                disabled={access.busy || !client.clientKey}
                onChange={(event) => setAccess((s) => ({ ...s, unlinkTelegram: event.target.checked }))}
              />
              <span>
                <strong>Отвязать Telegram</strong>
                <span>
                  Старый вход через бота перестанет работать. Дальше клиент
                  заходит по ссылке, как все новые.
                  {!client.clientKey && ' Сначала создайте ключ приглашения в таблице.'}
                </span>
              </span>
            </label>
          )}

          <div className="access-reset__actions">
            <button className="button button--critical" onClick={resetAccess} disabled={access.busy}>
              {access.busy ? 'Сбрасываю…' : 'Да, сбросить'}
            </button>
            <button
              className="button button--ghost"
              onClick={() => setAccess((s) => ({ ...s, confirming: false, unlinkTelegram: false, error: null }))}
              disabled={access.busy}
            >
              Не надо
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ==================================================================
 * Финансы
 * ================================================================== */

/**
 * Правка карточки: имя, цена, размер пакета, плательщик, архив.
 *
 * Последнее, ради чего тренер открывал таблицу с телефона. Форма
 * свёрнута: открывают её редко, а карточку читают постоянно, и
 * развёрнутый набор полей отодвинул бы вниз всё, ради чего заходят.
 *
 * Отправляем только изменённое. Это не экономия запроса: на той стороне
 * отсутствующее поле значит «не трогай», и форма, где поправили одну
 * цену, не должна обнулить остальное.
 */
function ClientEdit({ client }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [saved, setSaved] = useState(false);

  const initial = {
    name: client.name || '',
    price: client.price === null || client.price === undefined ? '' : String(client.price),
    packageCount: client.packageCount === null || client.packageCount === undefined ? '' : String(client.packageCount),
    payer: client.payer || '',
  };

  const [form, setForm] = useState(initial);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFailure(null);
    setSaved(false);
  };

  const save = async () => {
    const changes = {};
    Object.keys(initial).forEach((field) => {
      if (String(form[field]).trim() !== String(initial[field]).trim()) changes[field] = form[field];
    });

    if (!Object.keys(changes).length) {
      setFailure(new Error('Ничего не изменилось.'));
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      await apiMutate('trainer.client.update', { clientRow: client.row, ...changes });
      setSaved(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="client-edit__toggle">
        <button className="button button--ghost" onClick={() => setOpen(true)}>Изменить карточку</button>
      </div>
    );
  }

  return (
    <div className="client-edit">
      <Field label="ФИО" inputMode="text" value={form.name} onChange={(v) => set('name', v)} disabled={busy} />

      <div className="field-row">
        <Field label="Цена за тренировку" inputMode="numeric" value={form.price} onChange={(v) => set('price', v)} disabled={busy} />
        <Field label="Размер пакета" inputMode="numeric" value={form.packageCount} onChange={(v) => set('packageCount', v)} disabled={busy} />
      </div>

      <Field
        label="Плательщик"
        hint="Если за клиента платит другой человек — впишите его ФИО"
        inputMode="text"
        value={form.payer}
        onChange={(v) => set('payer', v)}
        disabled={busy}
      />

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}
      {saved && !failure && <Note tone="good" icon={IconCheck}>Сохранено. Изменения появятся в карточке через несколько секунд.</Note>}

      <div className="client-edit__actions">
        <button className="button button--primary" onClick={save} disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="button" onClick={() => { setOpen(false); setForm(initial); setFailure(null); }} disabled={busy}>
          Отмена
        </button>
      </div>
    </div>
  );
}

/**
 * Контакты клиента из его профиля.
 *
 * Профиль заполняет сам клиент, и заполняет он его ради этой минуты:
 * тренеру нужно позвонить или написать. Поэтому здесь не форма, а
 * готовые ссылки — нажал и попал в разговор.
 *
 * Пусто — так и говорим: тренер должен понимать, что это не поломка, а
 * «клиент ещё не заполнил».
 */
function ClientContacts({ clientRow }) {
  const [state, setState] = useState({ loading: true, profile: null, age: null });

  useEffect(() => {
    let alive = true;

    apiPublic('profile.get', { clientRow })
      .then((r) => { if (alive) setState({ loading: false, profile: r.profile, age: r.age }); })
      .catch(() => { if (alive) setState({ loading: false, profile: null, age: null }); });

    return () => { alive = false; };
  }, [clientRow]);

  if (state.loading) return null;

  const p = state.profile || {};

  return (
    <div className="client-contacts">
      {(p.phone || p.telegramUrl || p.email) ? (
        <>
          {p.phone && <a className="button button--ghost" href={'tel:' + p.phone}>{p.phone}</a>}
          {p.telegramUrl && (
            <a className="button button--ghost" href={p.telegramUrl} target="_blank" rel="noreferrer">Telegram</a>
          )}
          {p.email && <a className="button button--ghost" href={'mailto:' + p.email}>{p.email}</a>}
          {state.age ? <span className="small muted">{state.age} лет</span> : null}
        </>
      ) : (
        <span className="small muted">Контактов нет — клиент заполняет их у себя, в «Моих данных».</span>
      )}
    </div>
  );
}

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
