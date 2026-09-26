import React, { useEffect, useRef, useState } from 'react';
import { Overview, Plan, Progress, Nutrition } from './screens.jsx';
import { Stories } from '../stories.jsx';
import { TelegramTransferCard } from '../AuthTransfer.jsx';
import { haptic } from '../telegram.js';
import { useBackGesture, useTabGesture, rememberTab, captureScreen } from '../gestures.jsx';
import TabBar from '../TabBar.jsx';
import { useKeptTabs } from '../keptTabs.js';
import { useViewMotion } from '../viewMotion.js';
import { IconHome, IconPlan, IconProgress, IconNutrition, IconBack, IconUsers, IconMenu, IconClose, IconSliders, IconPhone, IconLink } from '../icons.jsx';
import { canOpenInApp } from '../open-in-app.js';
import { showAppHint } from '../AppHint.jsx';
import { Drawer, Section, SignOut } from '../ui.jsx';
import { APP_VERSION } from '../version.js';
import Profile from './Profile.jsx';
import PushSetting from '../PushSetting.jsx';
import DeleteAccount from '../DeleteAccount.jsx';
import PrivacyLink from '../PrivacyLink.jsx';
import ThemeSetting from '../ThemeSetting.jsx';
import Family from './Family.jsx';
import { PhoneCalendar } from '../trainer/Schedule.jsx';
import { apiPublic } from '../api.js';
import MyTrainer, { LinkOffers } from './MyTrainer.jsx';
import { accountState, pendingTrainerLink } from '../trainer-link.js';

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

// Семья — в меню, только если тренер открыл её этому человеку и в ней
// есть кого показать. Пустой пункт «Семья» у одиночки только сбивал бы.
const FAMILY = { id: 'family', label: 'Семья', note: 'Тренировки и прогресс близких', Icon: IconUsers };

// Тренер и ID для привязки — только в своём кабинете: у участника пары и
// у тренера, открывшего карточку, привязываться нечему
const TRAINER = { id: 'trainer', label: 'Мой тренер', note: 'ID и привязка к тренеру', Icon: IconLink };

export default function ClientApp({ me, clientRow, preview }) {
  const [view, setView] = useState('overview');

  // Семья — в своём кабинете и в «смотрю как клиент» (тренер проверяет,
  // что увидит клиент). В карточке клиента у тренера её нет: там сами
  // карточки.
  // Не ждём и не показываем ошибок: нет ответа — нет и пункта в меню.
  const [familyMembers, setFamilyMembers] = useState([]);
  useEffect(() => {
    if (clientRow && !preview) return undefined;
    let alive = true;
    apiPublic('family.list', clientRow ? { clientRow } : {})
      .then((r) => { if (alive) setFamilyMembers((r && r.members) || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [clientRow, preview]);
  // Android в браузере — пункт про приложение: вернуть закрытую плашку
  // «Установить / Открыть в приложении» (AppHint.jsx)
  const android = canOpenInApp() ? [{ id: 'android-app', label: 'Приложение для Android', note: 'Шаги и уведомления', Icon: IconPhone, action: showAppHint }] : [];
  const own = !clientRow && !preview && !(me && me.member);
  const menu = [...(familyMembers.length ? [FAMILY] : []), ...MENU, ...(own ? [TRAINER] : []), ...android];
  const VIEWS = TABS.concat(menu);

  // «Мои данные» и «Настройки» открываются из меню поверх вкладок:
  // смахнуть вправо — вернуться на ту вкладку, где был человек
  const [lastTab, setLastTab] = useState('overview');
  useBackGesture(() => setView(lastTab), !TABS.some((t) => t.id === view));

  // Просмотр глазами клиента: лента разделов клиента, а слева от первого —
  // список клиентов тренера, откуда пришли. Смахивание вправо с первого
  // раздела возвращает туда, и список выезжает слева, как при «назад».
  useBackGesture(
    () => preview && preview.onChange(),
    !!preview && view === TABS[0].id,
    'client-preview',
  );

  // Листать разделы нижнего меню пальцем — пока открыт раздел, а не экран
  // поверх него. Функция перехода берётся на момент жеста.
  const goRef = useRef(null);
  useTabGesture({
    tabs: TABS,
    active: view,
    go: (id) => goRef.current && goRef.current(id),
    // За последним разделом — боковое меню: смахнуть влево открывает его
    openMenu: () => { setMenuOpen(true); haptic(); },
    closeMenu: () => setMenuOpen(false),
    enabled: TABS.some((t) => t.id === view),
  });

  // Боковое меню появилось ради «Моих данных»: вкладок внизу четыре, и
  // пятая — про себя, а не про тренировки — сломала бы их ряд. Заодно
  // сюда переехал выход: это конец разговора, а не раздел.
  const [menuOpen, setMenuOpen] = useState(false);
  const current = VIEWS.find((v) => v.id === view) || VIEWS[0];
  const onTab = TABS.some((t) => t.id === view);

  // Разделы, где уже были, не пересобираются — прячутся (см. keptTabs.js)
  const tabs = useKeptTabs(view, TABS.map((t) => t.id));

  // Переход по нажатию — въезд на 320 мс (viewMotion.js): разделы по
  // порядку, экраны меню — «глубже», справа
  useViewMotion(view, {
    direction: (prev, next) => {
      const order = TABS.map((t) => t.id);
      const a = order.indexOf(prev);
      const b = order.indexOf(next);
      if (b < 0) return 1;
      if (a < 0) return -1;
      return b >= a ? 1 : -1;
    },
    target: () => document.querySelector('#root .app > main:not([hidden])'),
  });

  const go = (id) => {
    tabs.leave();
    // Раздел, с которого уходят, запоминаем — его покажет листание
    if (TABS.some((t) => t.id === view) && id !== view) rememberTab(view);
    if (TABS.some((t) => t.id === id)) setLastTab(id);
    // Уход с вкладки в экран меню — снимок для жеста «назад»
    else if (TABS.some((t) => t.id === view)) captureScreen();
    setView(id);
    setMenuOpen(false);
    haptic();
  };
  goRef.current = go;

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
          {menu.map((m) => {
            const Icon = m.Icon;
            const active = m.id === view;
            return (
              <button
                key={m.id}
                className={'menu__item' + (active ? ' menu__item--active' : '')}
                onClick={() => (m.action ? (setMenuOpen(false), m.action()) : go(m.id))}
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
      {/* Каждый раздел — своя страница, и посещённые не пересобираются:
          спрятанный раздел ждёт с данными и прокруткой, переход мгновенный.
          key на странице меню перезапускает появление при её смене. */}
      {TABS.map((t) => tabs.shown(t.id) && (
        <main
          key={t.id}
          className="app__body"
          hidden={view !== t.id}
          data-kept={tabs.kept(t.id) ? '' : undefined}
        >
          {/* Новости об обновлениях — только на обзоре. Экран открывают
              первым, и это единственная вкладка, куда заходят без
              конкретного вопроса; на остальных человек уже занят делом.

              Здесь, а не внутри Overview: тот же экран открывает тренер из
              карточки клиента, и сторис оттуда читались бы как что-то,
              относящееся к этому клиенту. */}
          {t.id === 'overview' && !preview && <TelegramTransferCard />}
          {t.id === 'overview' && own && ((me && me.unlinked) || pendingTrainerLink()) && <OverviewOffers />}
          {t.id === 'overview' && <Stories />}
          <t.Screen clientRow={clientRow} clientView={!!preview} />
        </main>
      ))}

      {!onTab && (
      <main className="app__body" key={view}>
        {view === 'profile' && (
          <>
            <p className="small muted">
              Тренеру это нужно, чтобы связаться с вами и точнее считать норму питания.
              Заполнять всё сразу не обязательно.
            </p>
            <Profile clientRow={clientRow} />
          </>
        )}

        {view === 'family' && <Family members={familyMembers} preview={!!preview} />}

        {view === 'trainer' && <MyTrainer />}

        {view === 'settings' && (
          <>
            <Section title="Внешний вид">
              <ThemeSetting />
            </Section>
            <Section title="Уведомления">
              <PushSetting clientRow={clientRow} />
            </Section>

            <ScheduleFeed clientRow={clientRow} />

            {/* Выход стоит последним: это конец разговора, а не раздел.
                Когда этот же кабинет открывает тренер из карточки клиента,
                выхода быть не должно — он вышел бы из своего. */}
            {!clientRow && <SignOut />}
            {!clientRow && <DeleteAccount />}
            <PrivacyLink />
          </>
        )}
      </main>
      )}

      <TabBar tabs={TABS} active={view} onSelect={go} />
    </div>
  );
}

/**
 * Приглашения тренера на обзоре: запрос по ID или открытая ссылка тренера.
 * Нет ни того ни другого — ничего не рисуем и лишний раз не спрашиваем
 * сервер: у клиента с тренером запросов не бывает.
 */
function OverviewOffers() {
  const [requests, setRequests] = useState([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    accountState()
      .then((r) => { if (alive) setRequests((r && r.requests) || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [revision]);
  if (!requests.length && !pendingTrainerLink()) return null;
  return <LinkOffers requests={requests} onChanged={() => setRevision((n) => n + 1)} />;
}

/**
 * Свои тренировки в календаре телефона — подпиской по ссылке. Нет ключа
 * или сервер не ответил — блока просто нет: это удобство, а не раздел.
 */
function ScheduleFeed({ clientRow }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    apiPublic('client.schedule.feed', clientRow ? { clientRow } : {})
      .then((r) => { if (alive && r && r.url) setUrl(r.url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [clientRow]);

  if (!url) return null;
  return <PhoneCalendar url={url} text="Ваши тренировки — в календаре телефона: подпишитесь один раз, новые занятия появятся сами." />;
}
