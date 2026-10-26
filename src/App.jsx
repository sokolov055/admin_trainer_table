import React, { useState, useEffect } from 'react';
import { api, apiBatch, apiStale, clearApiCache } from './api.js';
import { getInitData, environmentInfo, diagnoseMissingInitData } from './telegram.js';
import { clearToken, getToken, onTokenChange } from './session.js';
import { readLoginTicket } from './auth-transfer.js';
import { readInviteToken, removeInviteToken } from './invites.js';
import { readAccessToken, removeAccessToken } from './access.js';
import { Loading, ErrorState } from './ui.jsx';
import { InstallHint, TransferLoginScreen } from './AuthTransfer.jsx';
import AppHint from './AppHint.jsx';
import { canOpenInApp } from './open-in-app.js';
import { lazyPage, Deferred, warmUp } from './lazy.js';
import { setOfflineAccount } from './offline-account.js';
import { setRights } from './rights.js';
import { PlusOffer, usePlusLink } from './plus.jsx';
import { refreshThemes } from './remote-themes.js';
import { refreshGamePacks } from './remote-games.js';

// Кабинеты и экраны входа — по требованию (lazy.js): клиенту не нужен
// кабинет тренера, вошедшему — экраны входа
const ClientApp = lazyPage(() => import('./client/ClientApp.jsx'));
const TrainerApp = lazyPage(() => import('./trainer/TrainerApp.jsx'));
const LoginScreen = lazyPage(() => import('./LoginScreen.jsx'));
const AccessLogin = lazyPage(() => import('./AccessLogin.jsx'));
const InviteRegistration = lazyPage(() => import('./InviteRegistration.jsx'));
// Кандидат в тренеры на отборе (FT-548): анкета, тест, этап — без кабинета
const CandidateApp = lazyPage(() => import('./trainer/CandidateApp.jsx'));

/** Что роли понадобится дальше — догружаем в фоне, чтобы работало и без сети */
const LATER = {
  client: [{ preload: () => import('./Workout.jsx') }, { preload: () => import('./nutrition/Ration.jsx') }],
  trainer: [TrainerApp, { preload: () => import('./Workout.jsx') }, { preload: () => import('./trainer/PlanEditor.jsx') }],
  candidate: [],
};

/** Пока часть грузится — тот же скелет, что и при загрузке данных */
const waitingPage = (
  <div className="app">
    <main className="app__body">
      <Loading rows={3} />
    </main>
  </div>
);
import { Gestures } from './gestures.jsx';
import RestLayer from './RestLayer.jsx';
import { PlankAccess } from './plank-access.js';
import { PlankSessionProvider } from './PlankSession.jsx';
import { ScooterSessionProvider } from './ScooterSession.jsx';
import { MatchSessionProvider } from './MatchSession.jsx';
import { BliniSessionProvider } from './BliniSession.jsx';
import { CareerProvider } from './CareerSession.jsx';

/**
 * Корень приложения: спрашивает сервер «кто я» и по ответу показывает
 * панель клиента или панель тренера.
 *
 * Роль приходит С СЕРВЕРА и нигде на клиенте не вычисляется. Всё, что
 * знает фронт, — какую панель рисовать; доступ к данным всё равно
 * проверяется на каждом запросе заново.
 *
 * Про скорость. Каждый поход к Apps Script стоит секунды, поэтому запуск
 * устроен так:
 *
 * — если роль уже известна с прошлого раза, панель рисуется мгновенно,
 *   а проверка уходит в фон;
 * — если человек здесь впервые, «кто я» и данные первого экрана
 *   запрашиваются ОДНИМ запросом вместо двух последовательных. Лишнее
 *   действие в пакете отвалится по правам, не выполняясь, — это дешевле,
 *   чем ещё один поход на сервер.
 *
 * Два способа попасть внутрь. Из Telegram — по подписи мессенджера, она
 * приезжает при каждом запуске. С иконки на рабочем столе подписи нет, и
 * работает ключ, выданный после подтверждения у бота (session.js). Ни то
 * ни другое не даёт прав само по себе: роль всё равно определяет сервер.
 */
export default function App() {
  const [state, setState] = useState({ loading: true, me: null, error: null });
  const [loginTicket, setLoginTicket] = useState(readLoginTicket);
  const [inviteToken, setInviteToken] = useState(readInviteToken);
  const [accessToken, setAccessToken] = useState(readAccessToken);
  const [installReady, setInstallReady] = useState(true);

  // Подпись читается один раз: внутри Telegram она не меняется за запуск,
  // а вот ключ пропадает в тот момент, когда сервер откажет по сроку, —
  // за ним и следим.
  const initData = getInitData();
  const [signedToken, setSignedToken] = useState(getToken);

  useEffect(() => onTokenChange(setSignedToken), []);

  // Права по тарифу (FT-545) приезжают с «кто я»; экраны читают их через useRights
  useEffect(() => { setRights(state.me ? state.me.rights : null); }, [state.me]);
  // Ссылка из письма «Продлить» (?plus) — лист «Плюса» на сайте (FT-768)
  usePlusLink();

  // Кабинет показан — догружаем остальное, пока человек смотрит на него
  const role = state.me && state.me.role;
  useEffect(() => { if (role) warmUp(LATER[role] || LATER.client); }, [role]);
  // Темы оформления из панели владельца (remote-themes.js) — после входа
  useEffect(() => { if (role) refreshThemes(); }, [role]);
  // Наборы для игр — вопросы и уровни из «Управление → Игры» (remote-games.js)
  useEffect(() => { if (role) refreshGamePacks(); }, [role]);

  // Работа без сети (FT-566): чьи данные на телефоне — сразу, как известно,
  // кто вошёл; отправка неотправленных занятий и запас программы — чуть
  // позже и отдельными частями: первому экрану они не нужны
  const known = state.me;
  useEffect(() => {
    // Кандидату без кабинета нечего хранить без сети
    if (!known || !known.role || known.role === 'candidate') return undefined;
    setOfflineAccount(known);
    const timer = setTimeout(() => {
      Promise.all([import('./workout-outbox.js'), import('./offline-prefetch.js')])
        .then(([outbox, prefetch]) => {
          outbox.startOutbox();
          prefetch.prefetchOffline(known);
        })
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [known]);

  const load = () => {
    const cached = apiStale('me', {});
    // Кабинет грузим сразу, параллельно с «кто я»: роль с прошлого раза
    // известна, а новичок почти всегда клиент
    (cached.data && cached.data.role === 'trainer' ? TrainerApp : ClientApp).preload().catch(() => {});

    if (cached.data) {
      // Роль известна — показываем панель немедленно, проверяем в фоне
      setState({ loading: false, me: cached.data, error: null });

      cached.promise
        .then((me) => setState({ loading: false, me, error: null }))
        .catch(() => { /* не достучались — остаёмся на том, что уже показали */ });

      return;
    }

    setState({ loading: true, me: null, error: null });

    apiBatch([
      { action: 'me' },
      { action: 'client.overview' },
      { action: 'trainer.clients' },
    ])
      .then((res) => {
        if (res.me && res.me.ok) {
          setState({ loading: false, me: res.me.data, error: null });
        } else {
          setState({
            loading: false,
            me: null,
            error: (res.me && res.me.error) || new Error('Сервер не ответил, кто вы.'),
          });
        }
      })
      .catch((error) => {
        // Пакет целиком не прошёл — пробуем хотя бы узнать роль
        api('me', {}, { fresh: true })
          .then((me) => setState({ loading: false, me, error: null }))
          .catch(() => setState({ loading: false, me: null, error }));
      });
  };

  const authorized = !!initData || !!signedToken;

  // Загружаемся, только когда есть чем представиться. Иначе первый же
  // запрос вернул бы отказ, и человек увидел бы ошибку вместо входа.
  useEffect(() => {
    if (!authorized) {
      setState({ loading: true, me: null, error: null });
      return;
    }
    load();
  }, [initData, signedToken]);

  // Персональная ссылка от тренера — основной вход в приложение, и она
  // важнее всего остального на этом устройстве. Её открывают и там, где
  // уже был чужой кабинет: молча оставить прежний значило бы показать
  // человеку не его данные.
  if (accessToken) {
    return (
      <Deferred fallback={waitingPage}><AccessLogin
        token={accessToken}
        details={<LaunchDetails />}
        onComplete={() => {
          // Состояние загрузки здесь НЕ сбрасываем. Ключ сохранён ещё в
          // момент входа, и эффект выше уже запустил загрузку кабинета,
          // пока на экране стояло «Готово». Сброс в «загружается» затирал
          // её результат, а новой загрузки никто не запускал: кабинет
          // висел скелетом до ручной перезагрузки страницы.
          removeAccessToken();
          setAccessToken('');
          setInstallReady(true);
        }}
      /></Deferred>
    );
  }

  // Приглашение важнее сохранённой сессии: ссылку могли открыть на общем
  // устройстве, где уже был другой кабинет. Сначала явно регистрируем
  // приглашённого человека, затем возвращаемся в обычный запуск.
  if (inviteToken) {
    return (
      <Deferred fallback={waitingPage}><InviteRegistration
        token={inviteToken}
        details={<LaunchDetails />}
        onComplete={() => {
          // Загрузку не сбрасываем — см. вход по ссылке выше
          removeInviteToken();
          setInviteToken('');
        }}
      /></Deferred>
    );
  }

  // Билет проверяем раньше сохранённой сессии. Ссылка могла быть создана
  // для другого человека на общем устройстве; молча оставить прежний
  // кабинет означало бы показать не того пользователя.
  if (loginTicket) {
    return (
      <TransferLoginScreen
        ticket={loginTicket}
        details={<LaunchDetails />}
        onAlternative={() => {
          clearApiCache();
          clearToken();
          setLoginTicket('');
        }}
        onComplete={(result) => {
          // Загрузку не сбрасываем — см. вход по ссылке выше
          setInstallReady(result.installReady);
          setLoginTicket('');
        }}
      />
    );
  }

  // Ни подписи, ни ключа — приложение открыли снаружи Telegram и на этом
  // устройстве ещё не входили. Это обычное начало, а не тупик.
  if (!authorized) {
    return <Deferred fallback={waitingPage}><LoginScreen details={<LaunchDetails />} /></Deferred>;
  }

  if (state.loading) {
    return (
      <div className="app">
        <main className="app__body">
          <Loading rows={3} />
        </main>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="app">
        <main className="app__body">
          <ErrorState error={state.error} onRetry={load} />
        </main>
      </div>
    );
  }

  const me = state.me;
  // Игры: клиенту — если открыты, владельцу — всегда, из «Моих тренировок»
  // и в отдыхе (22.10.2026); играет он своей карточкой (сервер — selfAsClient)
  const games = (me.role === 'client' && me.plankGameEnabled === true) || (me.role === 'trainer' && me.owner === true);

  return (
    <PlankAccess.Provider value={games}>
    <PlankSessionProvider key={[me.identityType, me.chatId, me.email, me.role, me.member, me.plankGameEnabled].join(':')}>
    <ScooterSessionProvider>
    <MatchSessionProvider>
    <BliniSessionProvider>
    <CareerProvider key={[me.identityType, me.chatId, me.email, me.member].join(':')} id={[me.identityType, me.chatId || me.email || '', me.member || ''].join(':')} sync={games && !me.member}>
      <Deferred fallback={waitingPage}>
        {me.role === 'trainer' ? <TrainerApp me={me} />
          : me.role === 'candidate' ? <CandidateApp me={me} onApproved={load} />
            : <ClientApp me={me} />}
      </Deferred>
      <Gestures />
      <PlusOffer />
      <RestLayer allowGame={games} />
      {/* Подсказка живёт не только сразу после входа. Ставят приложение
          редко с первого раза: человек заходит посмотреть баланс, закрывает
          вкладку и через неделю снова ищет ссылку в переписке. Поэтому она
          показывается, пока её не закроют или пока приложение не окажется
          установленным, — за этим следит installGuidance.

          Внутри Telegram не показываем вовсе: там приложение открыто мини-
          приложением, то есть намеренно, и советовать «смените браузер»
          человеку, который ничего не выбирал, не за что. */}
      {/* На Android вместо ярлыка на экране — настоящее приложение: поставить
          и перенести в него кабинет прямо отсюда (AppHint.jsx) */}
      {canOpenInApp()
        ? <AppHint active={!initData} />
        : <InstallHint active={!initData} installReady={installReady} />}
    </CareerProvider>
    </BliniSessionProvider>
    </MatchSessionProvider>
    </ScooterSessionProvider>
    </PlankSessionProvider>
    </PlankAccess.Provider>
  );
}

/**
 * Техническая справка под экраном входа.
 *
 * Показывается, только когда Telegram приложение всё-таки запустил, но
 * подпись не доехала: тогда вход по коду сработает, а вот причину сбоя
 * без этих строк не найти. При обычном запуске с рабочего стола показывать
 * нечего — и справки нет, экран остаётся спокойным.
 */
function LaunchDetails() {
  const info = environmentInfo();
  if (!info.hasLaunchParams) return null;

  const reason = diagnoseMissingInitData(info);

  return (
    <details className="small muted login__details">
      <summary style={{ cursor: 'pointer', textAlign: 'center' }}>Подробности</summary>
      <div style={{ marginTop: 10, lineHeight: 1.7, textAlign: 'left' }}>
        {reason && <div style={{ marginBottom: 10 }}>{reason}</div>}
        <div>Подпись в адресе: {info.fromHash ? 'есть' : 'нет'}</div>
        <div>Длина подписи: {info.initDataLength}</div>
        <div>Платформа: {info.platform}</div>
        <div>Версия: {info.version}</div>
        <div>Скрипт Telegram: {info.sdkLoaded ? 'загружен' : 'не загружен (не обязателен)'}</div>
      </div>
    </details>
  );
}
