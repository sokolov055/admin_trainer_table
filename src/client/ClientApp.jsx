import React, { useState } from 'react';
import { Overview, Plan, Progress, Nutrition } from './screens.jsx';
import { Stories } from '../stories.jsx';
import { TelegramTransferCard } from '../AuthTransfer.jsx';
import { haptic } from '../telegram.js';
import { IconHome, IconPlan, IconProgress, IconNutrition, IconBack, IconUsers, IconMenu, IconClose, IconSliders } from '../icons.jsx';
import { Drawer, Section, SignOut } from '../ui.jsx';
import { APP_VERSION } from '../version.js';
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
 * Пункты бокового меню — тем же списком, что у тренера: каждый открывает
 * свой экран в основном окне.
 *
 * Раньше анкета рисовалась прямо в выезжающей панели, а над ней стоял
 * переключатель «Профиль / Настройки». Панель уже экрана, форма в неё не
 * помещалась и на телефоне наезжала на переключатель. Отдельный экран
 * снимает это целиком: у формы вся ширина, а меню остаётся меню.
 *
 * «Кто я» и «как приложение себя ведёт» по-прежнему разные пункты:
 * зашедший включить уведомления не должен листать свой рост и телефон.
 */
const MENU = [
  { id: 'profile', label: 'Мои данные', note: 'Рост, телефон, Telegram', Icon: IconUsers },
  { id: 'settings', label: 'Настройки', note: 'Тема и уведомления', Icon: IconSliders },
];

const VIEWS = TABS.concat(MENU);

export default function ClientApp({ me, clientRow, preview }) {
  const [view, setView] = useState('overview');

  // Боковое меню появилось ради «Моих данных»: вкладок внизу четыре, и
  // пятая — про себя, а не про тренировки — сломала бы их ряд. Заодно
  // сюда переехал выход: это конец разговора, а не раздел.
  const [menuOpen, setMenuOpen] = useState(false);
  const current = VIEWS.find((v) => v.id === view) || VIEWS[0];
  const Screen = current.Screen;

  const go = (id) => {
    setView(id);
    setMenuOpen(false);
    haptic();
  };

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

      <header className="app__header">
        <div className="app__bar">
          <div className="app__headline">
            <h1 className="app__title">{me.name}</h1>
            <p className="app__subtitle">{current.label}</p>
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
      </header>

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

        <p className="menu__version">Версия {APP_VERSION}</p>
      </Drawer>

      {/* key на контейнере перезапускает появление при смене вкладки:
          экран собирается той же короткой лесенкой, что и при первой
          загрузке, а не подменяется рывком */}
      <main className="app__body" key={view}>
        {/* Новости об обновлениях — только на обзоре. Экран открывают
            первым, и это единственная вкладка, куда заходят без
            конкретного вопроса; на остальных человек уже занят делом.

            Здесь, а не внутри Overview: тот же экран открывает тренер из
            карточки клиента, и сторис оттуда читались бы как что-то,
            относящееся к этому клиенту. */}
        {view === 'overview' && !preview && <TelegramTransferCard />}
        {view === 'overview' && <Stories />}
        {Screen && <Screen clientRow={clientRow} clientView={!!preview} />}

        {view === 'profile' && (
          <>
            <p className="small muted">
              Тренеру это нужно, чтобы связаться с вами и точнее считать норму питания.
              Заполнять всё сразу не обязательно.
            </p>
            <Profile clientRow={clientRow} />
          </>
        )}

        {view === 'settings' && (
          <>
            <Section title="Внешний вид">
              <ThemeSetting />
            </Section>
            <Section title="Уведомления">
              <PushSetting clientRow={clientRow} />
            </Section>

            {/* Выход стоит последним: это конец разговора, а не раздел.
                Когда этот же кабинет открывает тренер из карточки клиента,
                выхода быть не должно — он вышел бы из своего. */}
            {!clientRow && <SignOut />}
          </>
        )}
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
    </div>
  );
}
