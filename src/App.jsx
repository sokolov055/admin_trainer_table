import React, { useState, useEffect } from 'react';
import { api, clearApiCache } from './api.js';
import { isInsideTelegram, getInitData } from './telegram.js';
import { Loading, ErrorState, Empty } from './ui.jsx';
import { IconPhone } from './icons.jsx';
import ClientApp from './client/ClientApp.jsx';
import TrainerApp from './trainer/TrainerApp.jsx';

/**
 * Корень приложения. Делает ровно одно: спрашивает сервер «кто я» и по
 * ответу показывает панель клиента или панель тренера.
 *
 * Роль приходит С СЕРВЕРА и нигде на клиенте не вычисляется. Всё, что
 * знает фронт, — какую панель рисовать; доступ к данным всё равно
 * проверяется на каждом запросе заново.
 */
export default function App() {
  const [state, setState] = useState({ loading: true, me: null, error: null });

  const load = () => {
    setState({ loading: true, me: null, error: null });
    clearApiCache();
    api('me', {}, { fresh: true })
      .then((me) => setState({ loading: false, me, error: null }))
      .catch((error) => setState({ loading: false, me: null, error }));
  };

  useEffect(load, []);

  // Открыли не из Telegram и подменной initData для разработки нет —
  // дальше идти некуда, но сказать об этом надо по-человечески.
  if (!isInsideTelegram() && !getInitData() && import.meta.env.VITE_MOCK !== '1') {
    return (
      <div className="app">
        <main className="app__body">
          <Empty
            icon={IconPhone}
            title="Откройте через Telegram"
            text={
              'Это мини-приложение работает внутри Telegram.\n\n' +
              'Найдите бота тренера и нажмите кнопку «Открыть приложение» ' +
              'или отправьте ему команду /app.'
            }
          />
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
