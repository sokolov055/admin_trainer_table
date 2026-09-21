import React, { useEffect, useState } from 'react';

import { enterByAccessLink, inspectAccessLink, removeAccessToken } from './access.js';
import { prepareIosInstallBridge } from './install.js';
import { detectBrowser, androidBrowserUrl, copyCurrentLink } from './browser.js';
import {
  IconAlert, IconCheck, IconCopy, IconExternal, IconKey, IconRefresh, IconShare,
} from './icons.jsx';

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
 *
 * Перед всем этим — проверка, откуда ссылку открыли. Тренер шлёт её в
 * Telegram, а Telegram открывает ссылки у себя внутри, и оттуда приложение
 * на телефон не поставить: человек полистает кабинет, закроет мессенджер и
 * больше приложение не найдёт. Поэтому во встроенном браузере вместо входа
 * стоит указание, как выйти наружу. Вход при этом НЕ расходуется: ссылка
 * останется целой для настоящего браузера.
 */

const SUCCESS_PAUSE_MS = 550;

export default function AccessLogin({ token, onComplete, details }) {
  const [state, setState] = useState({ loading: true, link: null, error: null });
  const [status, setStatus] = useState('idle');
  const [problem, setProblem] = useState('');
  const [anyway, setAnyway] = useState(false);
  const [where] = useState(() => detectBrowser());

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

  // Стена стоит ДО проверки ссылки, а не после: во встроенном браузере она
  // должна появиться мгновенно, и ждать ради неё ответ сервера незачем.
  if (where.deadEnd && !anyway) {
    return <OpenOutside where={where} onAnyway={() => setAnyway(true)} details={details} />;
  }

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

/**
 * Выход из встроенного браузера.
 *
 * Что здесь можно, а чего нельзя, решает не желание, а система.
 *
 * Android отдаёт ссылку наружу сам: схема `intent://` не обрабатывается
 * внутри WebView, и Android открывает её настоящим браузером. Поэтому тут
 * работает кнопка.
 *
 * На iOS такой возможности НЕТ. Передать ссылку в Safari из WKWebView
 * нельзя ничем: публичной схемы для этого не существует, и обойти это
 * нечем. Значит, честный интерфейс — не кнопка, которая может не
 * сработать, а понятные два шага, которые человек делает сам.
 *
 * Внизу — «всё равно войти здесь». Определение браузера живёт на разборе
 * строки User-Agent и однажды ошибётся; ошибка не должна означать, что
 * клиент не попадёт в кабинет и пойдёт звонить тренеру. Пусть лучше
 * человек войдёт во встроенном браузере, чем не войдёт никуда.
 */
function OpenOutside({ where, onAnyway, details }) {
  const [copied, setCopied] = useState(false);
  const android = where.platform === 'android';
  const intentUrl = android ? androidBrowserUrl(window.location.href) : '';

  const copy = async () => {
    const ok = await copyCurrentLink();
    setCopied(ok);
    if (!ok) window.prompt('Скопируйте ссылку вручную:', window.location.href);
  };

  return (
    <AccessShell
      icon={android ? <IconExternal size={26} /> : <IconShare size={26} />}
      title={android ? 'Откройте в браузере' : 'Откройте в Safari'}
      text={
        android
          ? 'Сейчас кабинет открыт внутри Telegram. Отсюда приложение не поставить на телефон — оно исчезнет, как только вы закроете мессенджер.'
          : 'Сейчас кабинет открыт внутри Telegram. Поставить приложение на телефон можно только из Safari — это ограничение iPhone, обойти его нечем.'
      }
    >
      {android ? (
        <a className="button button--primary button--block invite__primary outside__jump" href={intentUrl}>
          <IconExternal size={18} />
          Открыть в браузере
        </a>
      ) : (
        <ol className="outside__steps">
          <li>
            Нажмите <b>•••</b> в правом нижнем углу
          </li>
          <li>
            Выберите <b>«Открыть в Safari»</b>
          </li>
        </ol>
      )}

      <button className="button button--block" onClick={copy}>
        {copied ? <IconCheck size={17} /> : <IconCopy size={17} />}
        {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
      </button>

      <p className="invite__hint">
        {copied
          ? 'Откройте ' + (android ? 'браузер' : 'Safari') + ' и вставьте ссылку в адресную строку.'
          : 'Ссылка останется рабочей: вход отсюда не потрачен.'}
      </p>

      <button className="button button--ghost outside__anyway" onClick={onAnyway}>
        Всё равно войти здесь
      </button>

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
