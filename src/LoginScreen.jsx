import React, { useEffect, useRef, useState } from 'react';
import { apiPublic } from './api.js';
import {
  setToken, describeDevice,
  readPendingLogin, writePendingLogin, clearPendingLogin,
} from './session.js';
import { IconSend, IconKey, IconAlert, IconRefresh } from './icons.jsx';
import PasteLink from './PasteLink.jsx';
import { ConsentChecks } from './Consent.jsx';
import { isNativeApp, iosApp } from './native-bridge.js';

/**
 * Экран для тех, кто пришёл без ссылки.
 *
 * Персональная ссылка от тренера (access.js) по-прежнему открывает кабинет
 * сразу, и этот экран такой человек не видит. Сюда приходят те, кто скачал
 * приложение сам, у кого кончилась сессия, и те, кто ищет вход руками.
 *
 * Поэтому первое здесь — почта: одна дорога и для входа, и для регистрации
 * (lib/accounts.js на сервере). Заведён ли кабинет, человек помнить не
 * обязан: нет — сервер спросит имя и заведёт. Тренер привяжет его позже по
 * ID или своей ссылкой. Ссылка от тренера и Telegram остались ниже.
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
            Войдите по почте — если кабинета ещё нет, он заведётся. Пароль
            не нужен: придёт код.
          </p>

          <ClientEmailLogin />

          <p className="login__text login__text--second">
            Есть ссылка от тренера? Откройте её — кабинет запустится сразу.
          </p>
          {/* В Android-приложении ссылка из Telegram сама не доходит —
              её вставляют сюда (PasteLink.jsx) */}
          {isNativeApp() && <PasteLink />}

          <details
            className="login__alternative"
            open={alternativeOpen}
            onToggle={(event) => setAlternativeOpen(event.currentTarget.open)}
          >
            <summary>Другой способ входа</summary>
            <div className="login__alternative-body">
              {/* Вход через бота Telegram — не в приложении для iPhone (iosApp) */}
              {iosApp() ? null : status === 'waiting' && login
                ? <Waiting login={login} />
                : <CodeStart status={status} problem={problem} onStart={requestCode} />}

              <TrainerLogin />
            </div>
          </details>
          {details}
        </div>
      </main>
    </div>
  );
}

/**
 * Вход и регистрация клиента по почте.
 *
 * Три шага на одном месте: адрес → код из письма → имя, если кабинета
 * ещё нет. Имя спрашиваем только тогда: знакомому человеку лишний вопрос
 * ни к чему, а сервер, получив код без имени, отвечает needName и код не
 * гасит — тот же код уходит второй раз уже с именем.
 */
function ClientEmailLogin() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState({ consent: false, terms: false });
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setProblem('');
    try { await fn(); } catch (error) { setProblem(error.message || 'Сервер не отвечает.'); } finally { setBusy(false); }
  };

  const ask = () => run(async () => {
    await apiPublic('auth.client.request', { email });
    setStep('code');
  });

  const enter = () => run(async () => {
    const res = await apiPublic('auth.client.confirm', {
      email, code, device: describeDevice(),
      ...(step === 'name' ? { name, consent: agree.consent, terms: agree.terms } : {}),
    });
    if (res && res.needName) { setStep('name'); return; }
    setToken(res.token);
  });

  const submit = (event) => {
    event.preventDefault();
    if (busy) return;
    if (step === 'email') ask(); else enter();
  };

  const ready = step === 'email' ? !!email.trim()
    : step === 'code' ? code.length === 6
      : name.trim().length >= 2 && agree.consent && agree.terms;

  return (
    <form className="login__email" onSubmit={submit}>
      <label className="field">
        <span className="field__label">Почта</span>
        <input
          className="field__input"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy || step !== 'email'}
        />
      </label>

      {step !== 'email' && (
        <label className="field">
          <span className="field__label">Код из письма</span>
          <input
            className="field__input"
            inputMode="text"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            disabled={busy || step === 'name'}
            autoFocus={step === 'code'}
          />
          {step === 'code' && <span className="field__hint">Код живёт 15 минут. Нет письма — загляните в «Спам».</span>}
        </label>
      )}

      {step === 'name' && (
        <label className="field">
          <span className="field__label">Как вас зовут</span>
          <input
            className="field__input"
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <span className="field__hint">Кабинета с этой почтой ещё нет — заведём новый.</span>
        </label>
      )}

      {/* Согласие — отдельной отметкой, не «нажимая кнопку» (156-ФЗ) */}
      {step === 'name' && <ConsentChecks value={agree} onChange={setAgree} disabled={busy} />}

      {problem && <p className="login__problem" role="alert">{problem}</p>}

      <button className="button button--primary button--block" disabled={busy || !ready}>
        {busy ? 'Минуту…' : step === 'email' ? 'Прислать код' : step === 'code' ? 'Войти' : 'Завести кабинет'}
      </button>

      {step !== 'email' && (
        <button
          type="button"
          className="button button--ghost"
          onClick={() => { setStep('email'); setCode(''); setName(''); setAgree({ consent: false, terms: false }); setProblem(''); }}
          disabled={busy}
        >
          Другой адрес
        </button>
      )}
    </form>
  );
}

/**
 * Вход тренера по почте.
 *
 * Спрятан под «другим способом» намеренно: клиенту он не нужен и только
 * мешал бы — его дорога одна, персональная ссылка. А тренер заходит с
 * любого устройства и не должен для этого искать бота: до сих пор
 * потерянный вход означал поход в Telegram, и случалось это почти
 * ежедневно.
 *
 * Пароля нет: доказательством служит доступ к почтовому ящику. Придумывать
 * и восстанавливать нечего, а восстанавливать пароль пришлось бы всё равно
 * по почте.
 */
function TrainerLogin() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const ask = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiPublic('auth.trainer.request', { email });
      setSent(true);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  const enter = async () => {
    setBusy(true);
    setProblem('');
    try {
      const res = await apiPublic('auth.trainer.confirm', { email, code, device: describeDevice() });
      setToken(res.token);
    } catch (error) {
      setProblem(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="button button--ghost login__trainer-toggle" onClick={() => setOpen(true)}>
        Я тренер — войти по почте
      </button>
    );
  }

  return (
    <div className="login__trainer">
      <label className="field">
        <span className="field__label">Почта</span>
        <input
          className="field__input"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy || sent}
        />
      </label>

      {sent && (
        <label className="field">
          <span className="field__label">Код из письма</span>
          <input
            className="field__input"
            inputMode="text"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={busy}
          />
          <span className="field__hint">Код живёт 15 минут. Письмо приходит за несколько секунд.</span>
        </label>
      )}

      {problem && <p className="login__problem">{problem}</p>}

      <button
        className="button button--primary button--block"
        onClick={sent ? enter : ask}
        disabled={busy || (sent ? code.length < 6 : !email)}
      >
        {busy ? 'Минуту…' : sent ? 'Войти' : 'Прислать код'}
      </button>

      {sent && (
        <button className="button button--ghost" onClick={() => { setSent(false); setCode(''); setProblem(''); }} disabled={busy}>
          Другой адрес
        </button>
      )}
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
