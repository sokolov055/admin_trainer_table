import React, { useState } from 'react';
import { Overview, Measurements, Plan, Progress, Nutrition } from './screens.jsx';
import { haptic } from '../telegram.js';
import { IconHome, IconPlan, IconProgress, IconRuler, IconNutrition } from '../icons.jsx';

/**
 * Панель клиента.
 *
 * clientRow передаётся, только когда эти же экраны открывает тренер из
 * карточки клиента: тогда все запросы уходят с номером строки. У самого
 * клиента параметра нет, и сервер отдаёт исключительно его данные —
 * подставить чужой номер клиент не может, роутер это отклонит.
 */

const TABS = [
  { id: 'overview', label: 'Обзор', Icon: IconHome, Screen: Overview },
  { id: 'plan', label: 'План', Icon: IconPlan, Screen: Plan },
  { id: 'progress', label: 'Прогресс', Icon: IconProgress, Screen: Progress },
  { id: 'measurements', label: 'Замеры', Icon: IconRuler, Screen: Measurements },
  { id: 'nutrition', label: 'Питание', Icon: IconNutrition, Screen: Nutrition },
];

export default function ClientApp({ me }) {
  const [tab, setTab] = useState('overview');
  const current = TABS.find((t) => t.id === tab) || TABS[0];
  const Screen = current.Screen;

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">{me.name}</h1>
        <p className="app__subtitle">{current.label}</p>
      </header>

      {/* key на контейнере перезапускает появление при смене вкладки:
          экран собирается той же короткой лесенкой, что и при первой
          загрузке, а не подменяется рывком */}
      <main className="app__body" key={tab}>
        <Screen />
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
