import ScheduleStats from './ScheduleStats.jsx';
import { useReturnScroll } from '../scroll.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clients, Lost, Logs, Sheets, Settings, ClientCard } from './screens.jsx';
import { Finance, Processes } from './Metrics.jsx';
import { Expenses } from './Expenses.jsx';
import ClientApp from '../client/ClientApp.jsx';
import { Overview, Plan, Progress, Nutrition } from '../client/screens.jsx';
import { Payments } from './Payments.jsx';
import { Stories } from '../stories.jsx';
import { TelegramTransferCard } from '../AuthTransfer.jsx';
import { APP_VERSION } from '../version.js';
import { Chips, Drawer, Empty, ErrorState, Loading, Search, Section } from '../ui.jsx';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { useBackGesture, useTabGesture, rememberTab, captureScreen } from '../gestures.jsx';
import TabBar from '../TabBar.jsx';
import { useKeptTabs } from '../keptTabs.js';
import { useViewMotion, byOrder } from '../viewMotion.js';
import NavTabs from '../NavTabs.jsx';
import {
  IconUsers, IconChart, IconLog, IconSheet, IconSliders, IconMenu, IconClose, IconBack, IconPhone, IconSearch, IconMoney,
  IconPlan, IconCalendar,
} from '../icons.jsx';
import Library, { LIBRARY_PANES } from './Library.jsx';
import Schedule from './Schedule.jsx';

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

/** Разделы и экраны меню: разделы — по порядку, меню — «глубже», справа */
function screenDirection(order) {
  return (prev, next) => {
    const deep = (v) => v === 'card' || v === 'preview';
    if (deep(next)) return 1;
    if (deep(prev)) return -1;
    const a = order.indexOf(prev);
    const b = order.indexOf(next);
    if (b < 0) return 1;
    if (a < 0) return -1;
    return b >= a ? 1 : -1;
  };
}

const visibleMain = () => document.querySelector('#root .app > main:not([hidden])');

const TABS = [
  { id: 'clients', label: 'Клиенты', Icon: IconUsers },
  // Расписание: занятия из Google Календаря, запись туда же (Schedule.jsx)
  { id: 'schedule', label: 'Расписание', Icon: IconCalendar },
  // Библиотека: шаблоны программ и тренировок, упражнения. Отсюда
  // программы раскладываются клиентам за минуту (Library.jsx).
  { id: 'library', label: 'Шаблоны', Icon: IconPlan },
  { id: 'dashboard', label: 'Сводка', Icon: IconChart },
];

const MENU = [
  { id: 'expenses', label: 'Расходы', note: 'Аренда, реклама — всё, что съедает прибыль', Icon: IconMoney },
  { id: 'client-preview', label: 'Клиентская версия', note: 'Проверить приложение глазами клиента', Icon: IconPhone },
  { id: 'logs', label: 'Логи', note: 'Платежи, пересчёты, переносы', Icon: IconLog },
  { id: 'sheets', label: 'Листы', note: 'Таблица как есть', Icon: IconSheet },
  { id: 'settings', label: 'Настройки', note: 'Тема и уведомления', Icon: IconSliders },
];

const VIEWS = TABS.concat(MENU);

/** Клиенты: работающие и ушедшие — один список людей в двух состояниях,
 *  поэтому это подразделы одного раздела, а не соседние вкладки. */
const CLIENT_PANES = [
  { value: 'active', label: 'Текущие' },
  { value: 'lost', label: 'Ушедшие' },
];

/** Сводка: две половины одного BSC — деньги и процессы за ними */
const DASH_PANES = [
  { value: 'finance', label: 'Финансы' },
  { value: 'processes', label: 'Процессы' },
  { value: 'sessions', label: 'Занятия' },
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
  const [libPane, setLibPane] = useState('program');
  const [menuOpen, setMenuOpen] = useState(false);
  const [openClient, setOpenClient] = useState(null);
  const [previewClient, setPreviewClient] = useState(null);

  // Вкладка, с которой ушли в боковое меню: «назад» из расходов или логов
  // возвращает туда, откуда пришли, а не на первую вкладку.
  const [lastTab, setLastTab] = useState('clients');
  const inMenu = !TABS.some((t) => t.id === view);

  // Смахнуть вправо — назад. Порядок важен только при одновременном
  // открытии: карточка и просмотр глазами клиента перекрывают меню.
  // Назад пальцем — только с экранов бокового меню (на раздел, откуда
  // пришли) и из карточки клиента, открытой внутри раздела. Просмотр
  // глазами клиента ведёт себя как само клиентское приложение: там
  // смахивание листает разделы, а выход — кнопкой «К тренеру».
  useBackGesture(() => setView(lastTab), inMenu && !openClient && !previewClient);

  // Листать «Клиенты» и «Сводку» пальцем — пока открыт раздел, а не
  // карточка или экран меню. Функция перехода объявлена ниже ранних
  // возвратов, поэтому берём её через ref на момент жеста.
  // Разделы, где уже были, не пересобираются — прячутся (см. keptTabs.js)
  const tabs = useKeptTabs(view, TABS.map((t) => t.id));

  const goRef = useRef(null);
  useTabGesture({
    tabs: TABS,
    active: view,
    go: (id) => goRef.current && goRef.current(id),
    // За последним разделом — боковое меню: смахнуть влево открывает его
    openMenu: () => { setMenuOpen(true); haptic(); },
    closeMenu: () => setMenuOpen(false),
    enabled: !inMenu && !openClient && !previewClient,
  });

  // Переходы по нажатию — въезд на 320 мс (viewMotion.js)
  const screen = previewClient ? 'preview' : openClient ? 'card' : view;
  // Из карточки клиента — на то же место в списке клиентов
  useReturnScroll(!!(openClient || previewClient));
  useViewMotion(screen, {
    direction: screenDirection(TABS.map((t) => t.id)),
    target: () => (screen === 'card' || screen === 'preview' ? document.querySelector('#root .app') : visibleMain()),
  });
  const paneTarget = () => { const m = visibleMain(); return m && m.firstElementChild; };
  useViewMotion(clientPane, { direction: byOrder(CLIENT_PANES.map((p) => p.value)), target: paneTarget });
  useViewMotion(dashPane, { direction: byOrder(DASH_PANES.map((p) => p.value)), target: paneTarget });
  useViewMotion(libPane, { direction: byOrder(LIBRARY_PANES.map((p) => p.value)), target: paneTarget });
  const [calendarRevision, setCalendarRevision] = useState(0);
  const calendarRequest = useRef(null);

  // Календарь — источник баланса, тренировок и ближайших занятий. Запускаем
  // его пересчёт сразу после входа тренера, но не ждём перед показом панели:
  // список открывается из зеркала, а свежие числа тихо заменяют его позже.
  // Та же функция срабатывает, когда страницу тянут вниз, поэтому два
  // одновременных запуска склеиваются ещё до серверной защиты от дублей.
  const runCalendarRefresh = useCallback(() => {
    if (calendarRequest.current) return calendarRequest.current;

    const request = apiMutate('calendar.refresh', {}, { quiet: true })
      .then((result) => {
        setCalendarRevision((value) => value + 1);
        return result;
      })
      // Фоновая ошибка не закрывает панель: старые данные полезнее
      // полноэкранного отказа, а повтор — потянуть страницу вниз
      .catch(() => null)
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

  const go = (id) => {
    tabs.leave();
    // Раздел, с которого уходят, запоминаем — его покажет листание
    if (!inMenu && id !== view) rememberTab(view);
    if (TABS.some((t) => t.id === id)) setLastTab(id);
    // Уход с вкладки в экран меню — снимок для жеста «назад»
    else if (!inMenu) captureScreen();
    setView(id);
    setMenuOpen(false);
    haptic();
  };
  goRef.current = go;

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
        {view === 'library' && (
          <div className="app__subnav">
            <Chips items={LIBRARY_PANES} value={libPane} onChange={switchPane(setLibPane)} variant="nav" />
          </div>
        )}
      </header>

      {/* «Клиенты» и «Сводка» — свои страницы, и посещённая не
          пересобирается: спрятанная ждёт с данными и прокруткой, переход
          мгновенный. Внутри раздела подразделы по-прежнему сменяются. */}
      {tabs.shown('clients') && (
        <main
          className="app__body"
          hidden={view !== 'clients'}
          data-kept={tabs.kept('clients') ? '' : undefined}
        >
          <div key={clientPane}>
            {/* Те же сторис и тем же составом, что видят клиенты: тренер
                должен знать, о чём приложение сейчас им рассказывает, не
                заходя в чужую роль и не выспрашивая. Место — список клиентов:
                первый экран панели, ровно как обзор у клиента. */}
            {clientPane === 'active' && <TelegramTransferCard />}
            {/* Приглашения по общей ссылке сняты с экрана: клиент теперь
                заводится из своей карточки персональной ссылкой. Страница,
                на которую ведут уже разосланные приглашения
                (InviteRegistration.jsx), никуда не делась. */}
            {clientPane === 'active' && <Stories />}
            {clientPane === 'active' && (
              <Clients
                onOpenClient={(client) => { captureScreen('client-card'); setOpenClient(client); }}
                onRefresh={runCalendarRefresh}
                refreshRevision={calendarRevision}
              />
            )}
            {clientPane === 'lost' && <Lost />}
          </div>
        </main>
      )}

      {tabs.shown('schedule') && (
        <main
          className="app__body"
          hidden={view !== 'schedule'}
          data-kept={tabs.kept('schedule') ? '' : undefined}
        >
          <Schedule />
        </main>
      )}

      {tabs.shown('dashboard') && (
        <main
          className="app__body"
          hidden={view !== 'dashboard'}
          data-kept={tabs.kept('dashboard') ? '' : undefined}
        >
          <div key={dashPane}>
            {dashPane === 'finance' && <Finance />}
            {dashPane === 'processes' && <Processes />}
            {dashPane === 'sessions' && <ScheduleStats />}
          </div>
        </main>
      )}

      {tabs.shown('library') && (
        <main
          className="app__body"
          hidden={view !== 'library'}
          data-kept={tabs.kept('library') ? '' : undefined}
        >
          <div key={libPane}>
            <Library pane={libPane} />
          </div>
        </main>
      )}

      {inMenu && (
      <main className="app__body" key={view}>
        {view === 'expenses' && <Expenses />}
        {view === 'logs' && <Logs />}
        {view === 'sheets' && <Sheets />}
        {view === 'settings' && <Settings />}
        {view === 'client-preview' && <ClientPreviewPicker onSelect={(client) => { captureScreen('client-preview'); setPreviewClient(client); }} />}
      </main>
      )}

      <TabBar tabs={TABS} active={view} onSelect={go} />

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

/**
 * Карточка клиента.
 *
 * Вкладки карточки стоят в шапке и выглядят переключателем, а не рядом
 * фишек, — намеренно. Раньше они лежали в теле экрана, и на вкладке
 * «Тренировки» под ними вплотную вставали кнопка журнала и ряд месяцев:
 * три ряда одинаковых пилюль подряд, из которых не прочитать, где ты
 * находишься, где действие, а где фильтр. Навигация и содержимое экрана
 * не должны быть одеты одинаково; месяцы остаются фишками в теле, потому
 * что это и есть фильтр.
 */
function ClientDetail({ client, onBack }) {
  const [view, setView] = useState('overview');
  const current = CLIENT_VIEWS.find((v) => v.value === view) || CLIENT_VIEWS[0];
  const ids = CLIENT_VIEWS.map((v) => v.value);

  // Разделы карточки — такая же лента, как нижнее меню: смахивание вбок
  // листает их, посещённые не пересобираются (keptTabs.js). Шапка, бар и
  // блок с балансом общие для всех разделов и стоят на месте — едет только
  // содержимое под баром, а по бару за пальцем переезжает таблетка.
  // Назад к списку — смахиванием вправо с первого раздела.
  const sections = useKeptTabs(view, ids, { keepScroll: false });
  const barRef = useRef(null);

  const open = (id) => {
    if (id === view) return;
    sections.leave();
    rememberTab('card:' + view);
    setView(id);
    haptic();
  };

  useTabGesture({
    // Имена с приставкой: снимки разделов хранятся общим списком, а
    // «Обзор» и «Прогресс» есть и у клиентского приложения
    tabs: CLIENT_VIEWS.map((v) => ({ id: 'card:' + v.value, label: v.label })),
    active: 'card:' + view,
    go: (id) => open(id.replace(/^card:/, '')),
    region: () => document.querySelector('.card-section:not([hidden])'),
    neighbour: (id) => document.querySelector(`.card-section[data-view="${id.replace(/^card:/, '')}"]`),
    drag: (pos) => barRef.current && barRef.current.drag(pos),
    release: () => barRef.current && barRef.current.release(),
  });

  useBackGesture(onBack, view === ids[0], 'client-card');

  useViewMotion(view, {
    direction: byOrder(ids),
    target: () => document.querySelector('.card-section:not([hidden])'),
  });

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
        {/* Сначала — кто это и сколько на балансе, потом разделы: бар
            стоит прямо над тем, что он переключает */}
        <ClientCard client={client} />
        <div className="app__subnav card-bar">
          <NavTabs ref={barRef} items={CLIENT_VIEWS} value={view} onChange={open} />
        </div>
        {CLIENT_VIEWS.map((v) => sections.shown(v.value) && (
          <div
            key={v.value}
            hidden={view !== v.value}
            data-kept={sections.kept(v.value) ? '' : undefined}
            className="card-section"
            data-view={v.value}
            style={{ marginTop: 'var(--space-4)' }}
          >
            {v.value === 'payments'
              ? <Payments client={client} />
              : <v.Screen clientRow={client.row} />}
          </div>
        ))}
      </main>
    </div>
  );
}
