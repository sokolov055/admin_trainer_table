import React, { useEffect, useState } from 'react';

import { enterByAccessLink, inspectAccessLink, removeAccessToken } from './access.js';
import { prepareIosInstallBridge } from './install.js';
import { IconAlert, IconCheck, IconKey, IconRefresh } from './icons.jsx';

/**
 * Первый экран клиента: вход по ссылке, которую прислал тренер.
 *
 * Здесь нет ни формы, ни кода, ни выбора способа — только имя и одна
 * кнопка. Имя показывается специально: человек должен понимать, в чей
 * кабинет он входит, особенно если открыл ссылку на общем устройстве.
 *
 * Сам вход происходит по нажатию, а не при открытии страницы. Ссылку до
 * человека успевают открыть предпросмотр мессенджера и антивирус почты, и
 * автоматический вход расходовался бы на них (см. access.js).
 */

const SUCCESS_PAUSE_MS = 550;

export default function AccessLogin({ token, onComplete, details }) {
  const [state, setState] = useState({ loading: true, link: null, error: null });
  const [status, setStatus] = useState('idle');
  const [problem, setProblem] = useState('');

  const load = () => {
    setState({ loading: true, link: null, error: null });
    inspectAccessLink(token)
      .then((link) => setState({ loading: false, link, error: null }))
      .catch((error) => setState({ loading: false, link: null, error }));
  };

  useEffect(load, [token]);

  useEffect(() => {
    if (status !== 'success') return undefined;
    const timer = setTimeout(() => onComplete(), SUCCESS_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const enter = async () => {
    setStatus('busy');
    setProblem('');
    try {
      await enterByAccessLink(token);

      // Адрес чистим сразу после входа: дальше токен в нём не нужен, а в
      // истории браузера и подсказках адресной строки ему не место.
      removeAccessToken();

      // iOS не копирует localStorage в установленное приложение, поэтому
      // ключ входа мостится через короткую cookie. Не вышло — не беда:
      // в браузере кабинет уже открыт, а иконку можно поставить позже.
      try { await prepareIosInstallBridge(); } catch (_) {}

      setStatus('success');
    } catch (error) {
      setProblem(friendlyError(error));
      setStatus('idle');
    }
  };

  if (state.loading) {
    return (
      <AccessShell
        icon={<IconRefresh size={26} />}
        title="Проверяем ссылку"
        text="Это займёт несколько секунд."
      />
    );
  }

  if (state.error || !state.link) {
    return (
      <AccessShell
        icon={<IconAlert size={27} />}
        title="Ссылка не работает"
        text={friendlyError(state.error)}
      >
        <button className="button button--block" onClick={load}>
          <IconRefresh size={16} />
          Проверить снова
        </button>
        {details}
      </AccessShell>
    );
  }

  if (status === 'success') {
    return (
      <AccessShell
        icon={<IconCheck size={28} />}
        title="Готово"
        text="Открываем ваш кабинет."
      />
    );
  }

  return (
    <AccessShell
      icon={<IconKey size={28} />}
      title={state.link.name}
      text="Это ваш личный кабинет: программа тренировок, прогресс и питание."
    >
      <button className="button button--primary button--block invite__primary" onClick={enter} disabled={status === 'busy'}>
        {status === 'busy' ? <IconRefresh size={17} /> : <IconCheck size={18} />}
        {status === 'busy' ? 'Входим…' : 'Войти в кабинет'}
      </button>
      {problem && <div className="invite__error" role="alert"><IconAlert size={17} />{problem}</div>}
      <p className="invite__hint">
        Пароль не нужен. После входа приложение можно поставить на домашний экран —
        подскажем, как только откроется кабинет.
      </p>
      {details}
    </AccessShell>
  );
}

function friendlyError(error) {
  const code = error && error.code;
  if (code === 404 || code === 410) {
    return 'Ссылка больше не действует. Попросите тренера прислать новую — это одна кнопка в его приложении.';
  }
  return (error && error.message) || 'Не удалось открыть кабинет. Проверьте связь и попробуйте ещё раз.';
}

function AccessShell({ icon, title, text, children }) {
  return (
    <div className="app">
      <main className="login invite">
        <div className="login__inner invite__inner">
          <div className="login__mark">{icon}</div>
          <h1 className="login__title">{title}</h1>
          <p className="login__text">{text}</p>
          <div className="invite__body">{children}</div>
        </div>
      </main>
    </div>
  );
}
