import React, { useEffect, useState } from 'react';

import { enterByAccessLink, inspectAccessLink, removeAccessToken } from './access.js';
import { prepareIosInstallBridge } from './install.js';
import { detectBrowser, androidBrowserUrl, copyCurrentLink } from './browser.js';
import {
  IconAlert, IconCheck, IconCopy, IconExternal, IconKey, IconRefresh,
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
 * Откуда открыли ссылку, на вход НЕ влияет. Раньше во встроенном
 * браузере Telegram, в Chrome и Яндексе на iPhone вместо входа стояла стена
 * «Откройте в Safari» — ради иконки на экране. На деле клиенты читали её
 * как «страница не работает»: кнопки входа не видно, а текст про Telegram
 * показывался и тем, кто открыл ссылку в Chrome. Теперь войти можно
 * откуда угодно, а совет про Safari стоит ниже кнопки — как способ
 * поставить иконку, а не условие попасть в кабинет. Лишний вход не
 * страшен: ссылка пускает пять раз.
 */

const SUCCESS_PAUSE_MS = 550;

/** Через сколько «Проверяем ссылку» перестаёт быть нормой и нужен совет */
const SLOW_MS = 8000;

export default function AccessLogin({ token, onComplete, details }) {
  const [state, setState] = useState({ loading: true, link: null, error: null });
  const [status, setStatus] = useState('idle');
  const [problem, setProblem] = useState('');
  const [slow, setSlow] = useState(false);
  const [where] = useState(() => detectBrowser());

  const load = () => {
    setState({ loading: true, link: null, error: null });
    inspectAccessLink(token)
      .then((link) => setState({ loading: false, link, error: null }))
      .catch((error) => setState({ loading: false, link: null, error }));
  };

  useEffect(load, [token]);

  // Проверка ссылки — один короткий запрос. Если он висит дольше
  // нескольких секунд, дело не в сервере, а в сети или браузере, и
  // человеку нужен выход, а не бесконечное «займёт несколько секунд».
  useEffect(() => {
    if (!state.loading) { setSlow(false); return undefined; }
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [state.loading]);

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
        text={slow
          ? 'Что-то долго. Скорее всего, мешает связь или этот браузер.'
          : 'Это займёт несколько секунд.'}
      >
        {slow && (
          <>
            <button className="button button--block" onClick={load}>
              <IconRefresh size={16} />
              Попробовать ещё раз
            </button>
            {where.deadEnd && <OpenOutside where={where} stuck />}
          </>
        )}
      </AccessShell>
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
        {where.deadEnd && <OpenOutside where={where} stuck />}
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
      {where.deadEnd && <OpenOutside where={where} />}
      {details}
    </AccessShell>
  );
}

/**
 * Совет открыть ссылку в настоящем браузере.
 *
 * Не условие входа, а подсказка под ним: отсюда войти можно, но иконку на
 * экран поставить нельзя (см. browser.js). А если страница здесь не
 * грузится вовсе (`stuck`), тот же совет становится выходом из тупика.
 *
 * Что здесь можно, а чего нельзя, решает система.
 *
 * Android отдаёт ссылку наружу сам: схема `intent://` не обрабатывается
 * внутри WebView, и Android открывает её настоящим браузером. Поэтому тут
 * работает кнопка.
 *
 * На iOS такой возможности НЕТ: передать ссылку в Safari из WKWebView
 * нечем. Во встроенном браузере Telegram есть пункт меню «Открыть в
 * Safari» — его и называем. В Chrome и Яндексе такого пункта нет, там
 * честнее всего скопировать ссылку.
 */
function OpenOutside({ where, stuck }) {
  const [copied, setCopied] = useState(false);
  const android = where.platform === 'android';
  const telegram = where.kind === 'webview';
  const intentUrl = android ? androidBrowserUrl(window.location.href) : '';
  const target = android ? 'браузере' : 'Safari';

  const copy = async () => {
    const ok = await copyCurrentLink();
    setCopied(ok);
    if (!ok) window.prompt('Скопируйте ссылку вручную:', window.location.href);
  };

  const lead = stuck
    ? `Откройте эту же ссылку в ${target} — там кабинет открывается надёжнее.`
    : android
      ? 'Чтобы поставить кабинет иконкой на экран, откройте ссылку в браузере: из Telegram это сделать нельзя.'
      : telegram
        ? 'Чтобы поставить кабинет иконкой на экран, откройте ссылку в Safari: из Telegram на iPhone это сделать нельзя.'
        : 'Иконку на экран iPhone надёжнее всего ставить из Safari. Войти можно и здесь, а потом открыть ту же ссылку в Safari.';

  return (
    <div className="outside">
      <p className="outside__lead">{lead}</p>

      {android && (
        <a className="button button--block" href={intentUrl}>
          <IconExternal size={17} />
          Открыть в браузере
        </a>
      )}

      {!android && telegram && (
        <ol className="outside__steps">
          <li>Откройте меню <b>•••</b></li>
          <li>Выберите <b>«Открыть в Safari»</b></li>
        </ol>
      )}

      <button className="button button--ghost button--block" onClick={copy}>
        {copied ? <IconCheck size={17} /> : <IconCopy size={17} />}
        {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
      </button>

      {copied && (
        <p className="invite__hint">
          Откройте {android ? 'браузер' : 'Safari'} и вставьте ссылку в адресную строку.
        </p>
      )}
    </div>
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
