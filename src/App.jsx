import React, { useState, useEffect } from 'react';
import { api, apiBatch, apiStale } from './api.js';
import { isInsideTelegram, getInitData, environmentInfo, diagnoseMissingInitData } from './telegram.js';
import { Loading, ErrorState, Empty } from './ui.jsx';
import { IconPhone } from './icons.jsx';
import ClientApp from './client/ClientApp.jsx';
import TrainerApp from './trainer/TrainerApp.jsx';

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
 */
export default function App() {
  const [state, setState] = useState({ loading: true, me: null, error: null });

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

  useEffect(load, []);

  // Открыли не из Telegram и подменной initData для разработки нет —
  // дальше идти некуда, но сказать об этом надо по-человечески.
  if (!isInsideTelegram() && !getInitData() && import.meta.env.VITE_MOCK !== '1') {
    const info = environmentInfo();
    const reason = diagnoseMissingInitData(info);

    return (
      <div className="app">
        <main className="app__body">
          <Empty
            icon={IconPhone}
            title="Откройте через Telegram"
            text={
              'Это мини-приложение работает внутри Telegram.\n\n' +
              'Откройте бота тренера и нажмите кнопку «Открыть приложение» ' +
              'или отправьте ему команду /app.'
            }
          />

          {/* Техническая справка: без неё непонятно, открыли страницу
              обычной ссылкой или Telegram действительно не дал подпись */}
          <details className="small muted" style={{ maxWidth: 420, margin: '0 auto' }}>
            <summary style={{ cursor: 'pointer', textAlign: 'center' }}>Подробности</summary>
            <div style={{ marginTop: 10, lineHeight: 1.7 }}>
              {reason && <div style={{ marginBottom: 10 }}>{reason}</div>}
              <div>Параметры запуска: {info.hasLaunchParams ? 'получены' : 'нет'}</div>
              <div>Подпись в адресе: {info.fromHash ? 'есть' : 'нет'}</div>
              <div>Длина подписи: {info.initDataLength}</div>
              <div>Платформа: {info.platform}</div>
              <div>Версия: {info.version}</div>
              <div>Скрипт Telegram: {info.sdkLoaded ? 'загружен' : 'не загружен (не обязателен)'}</div>
            </div>
          </details>
        </main>
      </div>
    );
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

  if (me.role === 'trainer') return <TrainerApp me={me} />;

  return <ClientApp me={me} />;
}
