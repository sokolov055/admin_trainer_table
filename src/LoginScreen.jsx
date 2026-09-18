import React, { useEffect, useRef, useState } from 'react';
import { apiPublic } from './api.js';
import {
  setToken, describeDevice,
  readPendingLogin, writePendingLogin, clearPendingLogin,
} from './session.js';
import { IconSend, IconKey, IconAlert, IconRefresh } from './icons.jsx';

/**
 * Экран входа — для запуска вне Telegram: с иконки на рабочем столе или
 * из обычного браузера.
 *
 * Это первое, что человек здесь видит, причём в момент, когда он ещё не
 * уверен, что всё работает. Поэтому на экране один путь вперёд — большая
 * кнопка — и ни одного слова из машинного словаря. Пароля в этой схеме
 * нет вовсе: личность подтверждает бот, который и так знает, кто ему
 * написал.
 *
 * Код показывается не для того, чтобы его куда-то вводить: ссылка
 * подставляет его сама. Он нужен, чтобы человек сверил его с тем, что
 * увидит в чате, и убедился, что открывает свой кабинет, а не чужой.
 */

/**
 * Как часто спрашиваем сервер, подтверждён ли вход.
 *
 * Первые полминуты человек, скорее всего, ещё в этом действии: нажал
 * кнопку, увидел бота, подтвердил. Здесь стоит спрашивать чаще — разница
 * между «открылось сразу» и «подождал пять секунд» ощущается именно тут.
 * Дальше он мог отвлечься, а код живёт пятнадцать минут; частый опрос на
 * этом отрезке греет сервер впустую, и лишние секунды уже незаметны.
 *
 * Считать по-настоящему помогает не интервал, а возврат: подтверждение
 * уводит в Telegram, и в момент, когда человек вернулся, вероятность
 * «уже подтверждено» близка к единице. Поэтому на возврат спрашиваем
 * сразу, не дожидаясь очередного срока.
 */
const POLL_FAST_MS = 2000;
const POLL_FAST_WINDOW_MS = 30000;
const POLL_SLOW_MS = 5000;

export default function LoginScreen({ details }) {
  const [login, setLogin] = useState(null);
  const [status, setStatus] = useState('starting');
  const [problem, setProblem] = useState('');
  const started = useRef(false);

  const requestCode = () => {
    setStatus('starting');
    setProblem('');
    clearPendingLogin();

    apiPublic('auth.request', { device: describeDevice() })
      .then((res) => {
        if (!res || !res.code || !res.link) {
          throw new Error('Бот пока не настроен — напишите тренеру.');
        }

        const next = { code: res.code, link: res.link, expiresAt: res.expiresAt };
        writePendingLogin(next);
        setLogin(next);
        setStatus('waiting');
      })
      .catch((err) => {
        setProblem(err.message || 'Сервер не отвечает.');
        setStatus('failed');
      });
  };

  // Незаконченный вход переживает перезапуск: подтверждение уводит в
  // Telegram, и приложение с рабочего стола система может за это время
  // выгрузить. Возврат должен продолжать начатое, а не начинать заново.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const saved = readPendingLogin();
    if (saved) {
      setLogin(saved);
      setStatus('waiting');
      return;
    }

    requestCode();
  }, []);

  useEffect(() => {
    if (status !== 'waiting' || !login) return undefined;

    let stopped = false;
    let timer = null;
    const since = Date.now();

    const schedule = () => {
      if (stopped) return;
      const delay = Date.now() - since < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
      timer = setTimeout(ask, delay);
    };

    const ask = () => {
      if (stopped) return;

      apiPublic('auth.poll', { code: login.code })
        .then((res) => {
          if (stopped) return;

          if (res && res.status === 'confirmed') {
            clearPendingLogin();
            // Ключ принят — корень приложения увидит это сам и покажет
            // кабинет; отдельного перехода отсюда не нужно
            setToken(res.token);
            return;
          }

          if (res && res.status === 'pending') {
            schedule();
            return;
          }

          // Истёк, уже использован, не найден — у сервера на каждый случай
          // свой человеческий текст, и придумывать свой незачем
          clearPendingLogin();
          setProblem((res && res.message) || 'Код больше не действует.');
          setStatus('stale');
        })
        .catch(() => {
          if (stopped) return;
          // Связь пропала — молчим. Человек в этот момент, скорее всего, в
          // Telegram, и мигать сообщением об ошибке поверх ожидания значит
          // пугать его ровно тогда, когда всё идёт по плану.
          schedule();
        });
    };

    const onReturn = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      ask();
    };

    schedule();
    document.addEventListener('visibilitychange', onReturn);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [status, login && login.code]);

  return (
    <div className="app">
      <main className="login">
        <div className="login__inner">
          {status === 'waiting' && login
            ? <Waiting login={login} />
            : <Problem
                status={status}
                problem={problem}
                onRetry={requestCode}
              />}

          {details}
        </div>
      </main>
    </div>
  );
}

function Waiting({ login }) {
  return (
    <>
      <div className="login__mark"><IconKey size={28} /></div>

      <h1 className="login__title">Вход в приложение</h1>
      <p className="login__text">
        Подтвердите вход в Telegram — бот узнает вас и откроет кабинет.
        Придумывать и вспоминать пароль не нужно.
      </p>

      <div className="login__code" aria-label={'Код ' + login.code.split('').join(' ')}>
        {login.code}
      </div>
      <p className="login__hint">
        Этот же код появится в переписке с ботом. Совпал — значит вы
        открываете свой кабинет.
      </p>

      {/* Ссылка, а не кнопка: она уводит в другое приложение, и это тот
          редкий случай, когда системное «открыть в Telegram» уместнее
          любого нашего обработчика */}
      <a className="button button--primary button--block login__cta" href={login.link}>
        <IconSend size={17} />
        Подтвердить в Telegram
      </a>

      <div className="login__wait">
        <span className="login__pulse" aria-hidden="true" />
        Ждём подтверждения
      </div>
    </>
  );
}

function Problem({ status, problem, onRetry }) {
  if (status === 'starting') {
    return (
      <>
        <div className="login__mark"><IconKey size={28} /></div>
        <h1 className="login__title">Вход в приложение</h1>
        <p className="login__text">Готовим код…</p>
      </>
    );
  }

  const stale = status === 'stale';

  return (
    <>
      <div className="login__mark"><IconAlert size={28} /></div>

      <h1 className="login__title">
        {stale ? 'Время кода вышло' : 'Не получилось начать вход'}
      </h1>
      <p className="login__text">
        {stale
          ? problem + ' Новый код выдаётся сразу — ничего восстанавливать не придётся.'
          : problem}
      </p>

      <button className="button button--primary button--block login__cta" onClick={onRetry}>
        <IconRefresh size={16} />
        {stale ? 'Получить новый код' : 'Попробовать снова'}
      </button>
    </>
  );
}
