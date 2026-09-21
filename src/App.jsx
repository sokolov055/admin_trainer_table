import React, { useState, useEffect } from 'react';
import { api, apiBatch, apiStale, clearApiCache } from './api.js';
import { getInitData, environmentInfo, diagnoseMissingInitData } from './telegram.js';
import { clearToken, getToken, onTokenChange } from './session.js';
import { readLoginTicket } from './auth-transfer.js';
import { readInviteToken, removeInviteToken } from './invites.js';
import { readAccessToken, removeAccessToken } from './access.js';
import AccessLogin from './AccessLogin.jsx';
import InviteRegistration from './InviteRegistration.jsx';
import { Loading, ErrorState } from './ui.jsx';
import { InstallHint, TransferLoginScreen } from './AuthTransfer.jsx';
import ClientApp from './client/ClientApp.jsx';
import TrainerApp from './trainer/TrainerApp.jsx';
import LoginScreen from './LoginScreen.jsx';

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

  const load = () => {
    const cached = apiStale('me', {});

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
      <AccessLogin
        token={accessToken}
        details={<LaunchDetails />}
        onComplete={() => {
          removeAccessToken();
          setAccessToken('');
          setState({ loading: true, me: null, error: null });
          setInstallReady(true);
        }}
      />
    );
  }

  // Приглашение важнее сохранённой сессии: ссылку могли открыть на общем
  // устройстве, где уже был другой кабинет. Сначала явно регистрируем
  // приглашённого человека, затем возвращаемся в обычный запуск.
  if (inviteToken) {
    return (
      <InviteRegistration
        token={inviteToken}
        details={<LaunchDetails />}
        onComplete={() => {
          removeInviteToken();
          setInviteToken('');
          setState({ loading: true, me: null, error: null });
        }}
      />
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
          setState({ loading: true, me: null, error: null });
          setInstallReady(result.installReady);
          setLoginTicket('');
        }}
      />
    );
  }

  // Ни подписи, ни ключа — приложение открыли снаружи Telegram и на этом
  // устройстве ещё не входили. Это обычное начало, а не тупик.
  if (!authorized) {
    return <LoginScreen details={<LaunchDetails />} />;
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

  return (
    <>
      {me.role === 'trainer' ? <TrainerApp me={me} /> : <ClientApp me={me} />}
      {/* Подсказка живёт не только сразу после входа. Ставят приложение
          редко с первого раза: человек заходит посмотреть баланс, закрывает
          вкладку и через неделю снова ищет ссылку в переписке. Поэтому она
          показывается, пока её не закроют или пока приложение не окажется
          установленным, — за этим следит installGuidance.

          Внутри Telegram не показываем вовсе: там приложение открыто мини-
          приложением, то есть намеренно, и советовать «смените браузер»
          человеку, который ничего не выбирал, не за что. */}
      <InstallHint active={!initData} installReady={installReady} />
    </>
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
