import React, { useState } from 'react';
import { Clients, Finance, Processes, Lost, Logs, Sheets, ClientCard } from './screens.jsx';
import { Overview, Measurements, Plan, Progress, Nutrition } from '../client/screens.jsx';
import { Payments } from './Payments.jsx';
import { Chips } from '../ui.jsx';
import { haptic } from '../telegram.js';
import {
  IconUsers, IconMoney, IconProcess, IconDeparted, IconLog, IconSheet, IconBack,
} from '../icons.jsx';

/**
 * Панель тренера.
 *
 * Карточка клиента переиспользует ЭКРАНЫ КЛИЕНТА, передавая им clientRow.
 * Второй набор «то же, но для тренера» пришлось бы править дважды, и рано
 * или поздно две версии разошлись бы.
 */

const TABS = [
  { id: 'clients', label: 'Клиенты', Icon: IconUsers },
  { id: 'finance', label: 'Финансы', Icon: IconMoney },
  { id: 'processes', label: 'Процессы', Icon: IconProcess },
  { id: 'lost', label: 'Ушедшие', Icon: IconDeparted },
  { id: 'logs', label: 'Логи', Icon: IconLog },
  { id: 'sheets', label: 'Листы', Icon: IconSheet },
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
  { value: 'plan', label: 'План', Screen: Plan },
  { value: 'progress', label: 'Прогресс', Screen: Progress },
  { value: 'measurements', label: 'Замеры', Screen: Measurements },
  { value: 'nutrition', label: 'Питание', Screen: Nutrition },
];

export default function TrainerApp({ me }) {
  const [tab, setTab] = useState('clients');
  const [openClient, setOpenClient] = useState(null);

  if (openClient) {
    return <ClientDetail client={openClient} onBack={() => setOpenClient(null)} />;
  }

  const current = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">{current.label}</h1>
        <p className="app__subtitle">Панель тренера · {me.name}</p>
      </header>

      <main className="app__body" key={tab}>
        {tab === 'clients' && <Clients onOpenClient={setOpenClient} />}
        {tab === 'finance' && <Finance />}
        {tab === 'processes' && <Processes />}
        {tab === 'lost' && <Lost />}
        {tab === 'logs' && <Logs />}
        {tab === 'sheets' && <Sheets />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => {
          const Icon = t.Icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              className={'tabbar__item' + (active ? ' tabbar__item--active' : '')}
              onClick={() => { setTab(t.id); haptic(); }}
              aria-current={active ? 'page' : undefined}
            >
              <span className="tabbar__icon"><Icon size={21} /></span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
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
