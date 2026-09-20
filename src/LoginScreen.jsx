import React, { useEffect, useRef, useState } from 'react';
import { apiPublic } from './api.js';
import {
  setToken, describeDevice,
  readPendingLogin, writePendingLogin, clearPendingLogin,
} from './session.js';
import { IconSend, IconKey, IconAlert, IconRefresh } from './icons.jsx';

/**
 * Обычный браузер без перенесённой сессии больше не начинает с кода.
 * Основной путь начинается внутри подтверждённого Telegram-кабинета,
 * откуда одна кнопка открывает этот браузер уже с выполненным входом.
 * Старый код остаётся запасным способом для тех, кто не может вернуться
 * в мини-приложение.
 */

const POLL_FAST_MS = 2000;
const POLL_FAST_WINDOW_MS = 30000;
const POLL_SLOW_MS = 5000;

export default function LoginScreen({ details }) {
  const [login, setLogin] = useState(null);
  const [status, setStatus] = useState('idle');
  const [problem, setProblem] = useState('');
  const [alternativeOpen, setAlternativeOpen] = useState(false);
  const restored = useRef(false);

  const requestCode = () => {
    setStatus('starting');
    setProblem('');
    clearPendingLogin();

    apiPublic('auth.request', { device: describeDevice() })
      .then((res) => {
        if (!res || !res.code || !res.link) {
          throw new Error('Бот пока не настроен. Напишите тренеру.');
        }
        const next = { code: res.code, link: res.link, expiresAt: res.expiresAt };
        writePendingLogin(next);
        setLogin(next);
        setStatus('waiting');
      })
      .catch((error) => {
        setProblem(error.message || 'Сервер не отвечает.');
        setStatus('failed');
      });
  };

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readPendingLogin();
    if (!saved) return;
    setLogin(saved);
    setStatus('waiting');
    setAlternativeOpen(true);
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
            setToken(res.token);
            return;
          }
          if (res && res.status === 'pending') {
            schedule();
            return;
          }
          clearPendingLogin();
          setProblem((res && res.message) || 'Код больше не действует.');
          setStatus('stale');
        })
        .catch(() => {
          if (!stopped) schedule();
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
          <div className="login__mark"><IconKey size={28} /></div>
          <h1 className="login__title">Вход в кабинет</h1>
          <p className="login__text">
            Откройте Fit Track в Telegram и нажмите «Добавить на телефон».
            Браузер откроется уже с выполненным входом.
          </p>

          <ol className="login__steps">
            <li>Откройте кабинет кнопкой в чате с ботом.</li>
            <li>Нажмите «Добавить на телефон» на первом экране.</li>
          </ol>

          <details
            className="login__alternative"
            open={alternativeOpen}
            onToggle={(event) => setAlternativeOpen(event.currentTarget.open)}
          >
            <summary>Другой способ входа</summary>
            <div className="login__alternative-body">
              {status === 'waiting' && login
                ? <Waiting login={login} />
                : <CodeStart status={status} problem={problem} onStart={requestCode} />}
            </div>
          </details>
          {details}
        </div>
      </main>
    </div>
  );
}

function Waiting({ login }) {
  return (
    <>
      <p className="login__alternative-text">
        Нажмите кнопку ниже. Бот подтвердит этот браузер без пароля.
      </p>
      <div className="login__code" aria-label={'Код ' + login.code.split('').join(' ')}>
        {login.code}
      </div>
      <p className="login__hint">Код вводить не нужно. Он уже добавлен в ссылку.</p>
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

function CodeStart({ status, problem, onStart }) {
  const loading = status === 'starting';
  const stale = status === 'stale';
  const failed = status === 'failed';

  return (
    <>
      <p className="login__alternative-text">
        {stale
          ? problem + ' Получите новый код и повторите вход.'
          : failed
            ? problem
            : 'Если кнопки в Telegram нет, подтвердите этот браузер одноразовым кодом.'}
      </p>
      {(stale || failed) && <div className="login__inline-alert"><IconAlert size={17} /></div>}
      <button className="button button--block login__cta" onClick={onStart} disabled={loading}>
        {loading ? <IconRefresh size={16} /> : <IconKey size={16} />}
        {loading ? 'Готовим код…' : stale ? 'Получить новый код' : failed ? 'Попробовать снова' : 'Войти через код'}
      </button>
    </>
  );
}
