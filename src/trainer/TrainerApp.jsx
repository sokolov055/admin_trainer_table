import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clients, Finance, Processes, Lost, Logs, Sheets, Settings, ClientCard } from './screens.jsx';
import ClientApp from '../client/ClientApp.jsx';
import { Overview, Plan, Progress, Nutrition } from '../client/screens.jsx';
import { Payments } from './Payments.jsx';
import { Stories } from '../stories.jsx';
import { TelegramTransferCard } from '../AuthTransfer.jsx';
import { Invites } from './Invites.jsx';
import { APP_VERSION } from '../version.js';
import { Chips, Drawer, Empty, ErrorState, Loading, Search, Section } from '../ui.jsx';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import {
  IconUsers, IconChart, IconLog, IconSheet, IconSliders, IconMenu, IconClose, IconBack, IconPhone, IconSearch,
} from '../icons.jsx';

/**
 * Панель тренера.
 *
 * Карточка клиента переиспользует ЭКРАНЫ КЛИЕНТА, передавая им clientRow.
 * Второй набор «то же, но для тренера» пришлось бы править дважды, и рано
 * или поздно две версии разошлись бы.
 *
 * Навигация разложена по частоте обращения, а не по количеству экранов.
 * Внизу — то, что открывают каждый день: список клиентов и показатели.
 * Остальное живёт в боковом меню: логи и листы нужны, когда что-то не
 * сошлось, настройки — один раз. Шесть равноправных вкладок внизу делали
 * вид, что всё это одинаково срочно, и переполняли панель.
 */

const TABS = [
  { id: 'clients', label: 'Клиенты', Icon: IconUsers },
  { id: 'dashboard', label: 'Dashboard', Icon: IconChart },
];

const MENU = [
  { id: 'client-preview', label: 'Клиентская версия', note: 'Проверить приложение глазами клиента', Icon: IconPhone },
  { id: 'logs', label: 'Логи', note: 'Платежи, пересчёты, переносы', Icon: IconLog },
  { id: 'sheets', label: 'Листы', note: 'Таблица как есть', Icon: IconSheet },
  { id: 'settings', label: 'Настройки', note: 'Тема приложения', Icon: IconSliders },
];

const VIEWS = TABS.concat(MENU);

/** Клиенты: работающие и ушедшие — один список людей в двух состояниях,
 *  поэтому это подразделы одного раздела, а не соседние вкладки. */
const CLIENT_PANES = [
  { value: 'active', label: 'Текущие' },
  { value: 'lost', label: 'Ушедшие' },
];

/** Dashboard: две половины одного BSC — деньги и процессы за ними */
const DASH_PANES = [
  { value: 'finance', label: 'Финансы' },
  { value: 'processes', label: 'Процессы' },
];

/**
 * Разделы карточки клиента.
 *
 * «Оплаты» есть только здесь, в панели тренера: это единственное место,
 * где данные меняются, и клиенту такой экран не нужен и не должен быть
 * доступен. Права всё равно проверяет сервер, но и показывать кнопку,
 * которая заведомо откажет, незачем.
 */
const CLIENT_VIEWS = [
  { value: 'overview', label: 'Обзор', Screen: Overview },
  { value: 'payments', label: 'Оплаты', Screen: null },
  { value: 'plan', label: 'Тренировки', Screen: Plan },
  { value: 'progress', label: 'Прогресс', Screen: Progress },
  { value: 'nutrition', label: 'Питание', Screen: Nutrition },
];

export default function TrainerApp({ me }) {
  const [view, setView] = useState('clients');
  const [clientPane, setClientPane] = useState('active');
  const [dashPane, setDashPane] = useState('finance');
  const [menuOpen, setMenuOpen] = useState(false);
  const [openClient, setOpenClient] = useState(null);
  const [previewClient, setPreviewClient] = useState(null);
  const [calendarRefresh, setCalendarRefresh] = useState({ busy: false, error: null, done: null });
  const [calendarRevision, setCalendarRevision] = useState(0);
  const calendarRequest = useRef(null);

  // Календарь — источник баланса, тренировок и ближайших занятий. Запускаем
  // его пересчёт сразу после входа тренера, но не ждём перед показом панели:
  // список открывается из зеркала, а свежие числа тихо заменяют его позже.
  // Та же функция обслуживает ручную кнопку, поэтому два одновременных
  // запуска склеиваются ещё до серверной защиты от дублей.
  const runCalendarRefresh = useCallback(() => {
    if (calendarRequest.current) return calendarRequest.current;

    setCalendarRefresh({ busy: true, error: null, done: null });

    const request = apiMutate('calendar.refresh', {})
      .then((result) => {
        setCalendarRefresh({ busy: false, error: null, done: result });
        setCalendarRevision((value) => value + 1);
        return result;
      })
      .catch((error) => {
        // Фоновая ошибка не закрывает панель: старые данные полезнее
        // полноэкранного отказа, а рядом остаётся ручной повтор.
        setCalendarRefresh({ busy: false, error, done: null });
        return null;
      })
      .finally(() => { calendarRequest.current = null; });

    calendarRequest.current = request;
    return request;
  }, []);

  useEffect(() => { runCalendarRefresh(); }, [runCalendarRefresh]);

  if (previewClient) {
    return (
      <ClientApp
        me={{ ...me, name: previewClient.name }}
        clientRow={previewClient.row}
        preview={{
          onChange: () => { setPreviewClient(null); haptic(); },
          onExit: () => { setPreviewClient(null); setView('clients'); haptic(); },
        }}
      />
    );
  }

  if (openClient) {
    return <ClientDetail client={openClient} onBack={() => setOpenClient(null)} />;
  }

  const current = VIEWS.find((v) => v.id === view) || VIEWS[0];
  const pane = view === 'clients' ? clientPane : view === 'dashboard' ? dashPane : '';

  const go = (id) => {
    setView(id);
    setMenuOpen(false);
    haptic();
  };

  const switchPane = (setter) => (value) => {
    setter(value);
    haptic();
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__bar">
          <div className="app__headline">
            <h1 className="app__title">{current.label}</h1>
            <p className="app__subtitle">Панель тренера · {me.name}</p>
          </div>
          <button
            className="icon-button"
            onClick={() => { setMenuOpen(true); haptic(); }}
            aria-label="Меню"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
          >
            <IconMenu size={22} />
          </button>
        </div>

        {/* Переключатель подразделов живёт в шапке, а не в теле экрана:
            ниже у списков свои фильтры, и два одинаковых ряда подряд
            читались бы как один длинный набор кнопок. */}
        {view === 'clients' && (
          <div className="app__subnav">
            <Chips items={CLIENT_PANES} value={clientPane} onChange={switchPane(setClientPane)} variant="nav" />
          </div>
        )}
        {view === 'dashboard' && (
          <div className="app__subnav">
            <Chips items={DASH_PANES} value={dashPane} onChange={switchPane(setDashPane)} variant="nav" />
          </div>
        )}
      </header>

      <main className="app__body" key={view + ':' + pane}>
        {/* Те же сторис и тем же составом, что видят клиенты: тренер
            должен знать, о чём приложение сейчас им рассказывает, не
            заходя в чужую роль и не выспрашивая. Место — список клиентов:
            первый экран панели, ровно как обзор у клиента. */}
        {view === 'clients' && clientPane === 'active' && <TelegramTransferCard />}
        {view === 'clients' && clientPane === 'active' && <Invites />}
        {view === 'clients' && clientPane === 'active' && <Stories />}
        {view === 'clients' && clientPane === 'active' && (
          <Clients
            onOpenClient={setOpenClient}
            refresh={calendarRefresh}
            onRefresh={runCalendarRefresh}
            refreshRevision={calendarRevision}
          />
        )}
        {view === 'clients' && clientPane === 'lost' && <Lost />}
        {view === 'dashboard' && dashPane === 'finance' && <Finance />}
        {view === 'dashboard' && dashPane === 'processes' && <Processes />}
        {view === 'logs' && <Logs />}
        {view === 'sheets' && <Sheets />}
        {view === 'settings' && <Settings />}
        {view === 'client-preview' && <ClientPreviewPicker onSelect={setPreviewClient} />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => {
          const Icon = t.Icon;
          const active = t.id === view;
          return (
            <button
              key={t.id}
              className={'tabbar__item' + (active ? ' tabbar__item--active' : '')}
              onClick={() => go(t.id)}
              aria-current={active ? 'page' : undefined}
            >
              <span className="tabbar__icon"><Icon size={21} /></span>
              {t.label}
            </button>
          );
        })}
      </nav>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} label="Меню">
        <div className="menu__head">
          <span className="menu__title">Ещё</span>
          <button className="icon-button" onClick={() => { setMenuOpen(false); haptic(); }} aria-label="Закрыть меню">
            <IconClose size={20} />
          </button>
        </div>

        <div className="menu__list">
          {MENU.map((m) => {
            const Icon = m.Icon;
            const active = m.id === view;
            return (
              <button
                key={m.id}
                className={'menu__item' + (active ? ' menu__item--active' : '')}
                onClick={() => go(m.id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className="menu__icon"><Icon size={20} /></span>
                <span className="menu__text">
                  <span className="menu__label">{m.label}</span>
                  <span className="menu__note">{m.note}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Версия — внизу меню, самой тихой строкой.
            Она нужна не каждый день, а в один конкретный момент: когда
            что-то не показывается и надо понять, та ли это сборка.
            Поэтому место — последнее, а вид — приглушённый. */}
        <p className="menu__version">Версия {APP_VERSION}</p>
      </Drawer>
    </div>
  );
}

function ClientPreviewPicker({ onSelect }) {
  const { loading, data, error, reload } = useData('trainer.clients', {}, []);
  const [query, setQuery] = useState('');

  if (loading) return <Loading lead={false} rows={5} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const clients = (data.clients || []).filter((client) => (
    !query || client.name.toLowerCase().includes(query.trim().toLowerCase())
  ));

  return (
    <Section
      title="Выберите клиента"
      note="Откроется его настоящий интерфейс, но вы останетесь тренером"
    >
      <Search value={query} onChange={setQuery} placeholder="Поиск по имени" />
      {clients.length === 0 && (
        <Empty icon={IconSearch} title="Клиент не найден" text="Проверьте имя или очистите поиск." />
      )}
      {clients.map((client) => (
        <button
          className="item client-preview-picker__item"
          key={client.row}
          onClick={() => { onSelect(client); haptic(); }}
        >
          <span className="item__top">
            <span className="item__name">{client.name}</span>
            <IconPhone size={18} />
          </span>
          <span className="item__meta">Открыть клиентское приложение</span>
        </button>
      ))}
    </Section>
  );
}

function ClientDetail({ client, onBack }) {
  const [view, setView] = useState('overview');
  const current = CLIENT_VIEWS.find((v) => v.value === view) || CLIENT_VIEWS[0];
  const Screen = current.Screen;
  const isPayments = current.value === 'payments';

  return (
    <div className="app">
      <header className="app__header">
        <button className="button button--ghost" style={{ marginBottom: 8 }} onClick={onBack}>
          <IconBack size={16} />
          К списку
        </button>
        <h1 className="app__title">{client.name}</h1>
        <p className="app__subtitle">Карточка клиента · {current.label}</p>
      </header>

      <main className="app__body app__body--plain">
        <ClientCard client={client} />
        <div style={{ marginTop: 14 }}>
          <Chips items={CLIENT_VIEWS} value={view} onChange={setView} />
        </div>
        <div key={view}>
          {isPayments
            ? <Payments client={client} />
            : <Screen clientRow={client.row} />}
        </div>
      </main>
    </div>
  );
}
