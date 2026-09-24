import React, { useState } from 'react';
import { Overview, Plan, Progress, Nutrition } from './screens.jsx';
import { Stories } from '../stories.jsx';
import { TelegramTransferCard } from '../AuthTransfer.jsx';
import { haptic } from '../telegram.js';
import { IconHome, IconPlan, IconProgress, IconNutrition, IconBack, IconUsers, IconMenu } from '../icons.jsx';
import { Chips, Drawer, SignOut } from '../ui.jsx';
import Profile from './Profile.jsx';
import PushSetting from '../PushSetting.jsx';
import ThemeSetting from '../ThemeSetting.jsx';

/**
 * Панель клиента.
 *
 * clientRow передаётся, только когда эти же экраны открывает тренер для
 * выбранного клиента: тогда все запросы уходят с номером строки. preview
 * отдельно включает клиентскую видимость — выбранные данные остаются теми
 * же, но тренерские детали не приезжают и не показываются. У самого клиента
 * clientRow нет, и подставить чужой номер он не может: роутер это отклонит.
 */

const TABS = [
  { id: 'overview', label: 'Обзор', Icon: IconHome, Screen: Overview },
  { id: 'plan', label: 'Тренировки', Icon: IconPlan, Screen: Plan },
  // Прогресс и замеры — один экран: это один и тот же разговор, от
  // «что изменилось» к «какие были цифры», и разводить его по двум
  // вкладкам значило заставлять человека складывать их в голове.
  { id: 'progress', label: 'Прогресс', Icon: IconProgress, Screen: Progress },
  { id: 'nutrition', label: 'Питание', Icon: IconNutrition, Screen: Nutrition },
];

/**
 * Разделы бокового меню.
 *
 * Анкета и настройки лежали одной простынёй, и выходило, что человек,
 * зашедший включить уведомления, сначала пролистывал свой рост и телефон.
 * Это разные разговоры: «кто я» и «как приложение себя ведёт».
 */
const MENU_PANES = [
  { value: 'profile', label: 'Профиль' },
  { value: 'settings', label: 'Настройки' },
];

export default function ClientApp({ me, clientRow, preview }) {
  const [tab, setTab] = useState('overview');

  // Боковое меню появилось ради «Моих данных»: вкладок внизу четыре, и
  // пятая — про себя, а не про тренировки — сломала бы их ряд. Заодно
  // сюда переехал выход: это конец разговора, а не раздел.
  const [menu, setMenu] = useState(false);
  const [pane, setPane] = useState('profile');
  const current = TABS.find((t) => t.id === tab) || TABS[0];
  const Screen = current.Screen;

  return (
    <div className="app">
      {preview && (
        <aside className="client-preview" aria-label="Режим просмотра клиента">
          <div className="client-preview__identity">
            <span className="client-preview__icon"><IconUsers size={19} /></span>
            <span>
              <strong>Вы смотрите как клиент</strong>
              <span className="client-preview__name">{me.name}</span>
            </span>
          </div>
          <div className="client-preview__actions">
            <button className="button button--ghost client-preview__change" onClick={preview.onChange}>
              Сменить
            </button>
            <button className="button client-preview__exit" onClick={preview.onExit}>
              <IconBack size={16} />
              К тренеру
            </button>
          </div>
        </aside>
      )}

      <header className="app__header app__header--menu">
        <div>
          <h1 className="app__title">{me.name}</h1>
          <p className="app__subtitle">{current.label}</p>
        </div>

        <button className="app__menu" aria-label="Меню" onClick={() => setMenu(true)}>
          <IconMenu size={22} />
        </button>
      </header>

      <Drawer open={menu} onClose={() => setMenu(false)} label="Меню">
        <Chips items={MENU_PANES} value={pane} onChange={(next) => { setPane(next); haptic(); }} />

        {pane === 'profile' && (
          <div className="menu__pane" key="profile">
            <h2>Мои данные</h2>
            <p className="small muted">
              Тренеру это нужно, чтобы связаться с вами и точнее считать норму питания.
              Заполнять всё сразу не обязательно.
            </p>

            <Profile clientRow={clientRow} />
          </div>
        )}

        {pane === 'settings' && (
          <div className="menu__pane" key="settings">
            <h2>Настройки</h2>

            <PushSetting clientRow={clientRow} />
            <ThemeSetting />

            {/* Выход стоит последним: это конец разговора, а не раздел.
                Когда этот же кабинет открывает тренер из карточки клиента,
                выхода быть не должно — он вышел бы из своего. */}
            {!clientRow && <SignOut />}
          </div>
        )}
      </Drawer>

      {/* key на контейнере перезапускает появление при смене вкладки:
          экран собирается той же короткой лесенкой, что и при первой
          загрузке, а не подменяется рывком */}
      <main className="app__body" key={tab}>
        {/* Новости об обновлениях — только на обзоре. Экран открывают
            первым, и это единственная вкладка, куда заходят без
            конкретного вопроса; на остальных человек уже занят делом.

            Здесь, а не внутри Overview: тот же экран открывает тренер из
            карточки клиента, и сторис оттуда читались бы как что-то,
            относящееся к этому клиенту. */}
        {tab === 'overview' && !preview && <TelegramTransferCard />}
        {tab === 'overview' && <Stories />}
        <Screen clientRow={clientRow} clientView={!!preview} />
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
