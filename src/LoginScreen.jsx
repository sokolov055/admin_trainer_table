import React, { useEffect, useState } from 'react';
import { apiPublic } from './api.js';
import PhoneLogin from './PhoneLogin.jsx';
import { Segmented } from './ui.jsx';
import { setToken, describeDevice } from './session.js';
import { IconKey } from './icons.jsx';
import PasteLink from './PasteLink.jsx';
import { ConsentChecks, TrainerConsentChecks } from './Consent.jsx';
import { isNativeApp } from './native-bridge.js';

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
 * ID или своей ссылкой. Ниже — ссылка от тренера и вход тренера по почте.
 */

export default function LoginScreen({ details }) {
  return (
    <div className="app">
      <main className="login">
        <div className="login__inner">
          <div className="login__mark"><IconKey size={28} /></div>
          <h1 className="login__title">Вход в кабинет</h1>
          <ClientLogin />

          <p className="login__text login__text--second">
            Есть ссылка от тренера? Откройте её — кабинет запустится сразу.
          </p>
          {/* В приложении ссылка из мессенджера сама не доходит — её
              вставляют сюда (PasteLink.jsx) */}
          {isNativeApp() && <PasteLink />}

          {/* Вход через Telegram убран 27.09.2026: приложение живёт без
              мессенджера. Тренер входит по почте — здесь же. */}
          <details className="login__alternative">
            <summary>Вход для тренера</summary>
            <div className="login__alternative-body">
              <TrainerLogin />
            </div>
          </details>
          {details}
          <a className="login__about" href={import.meta.env.BASE_URL + 'site/'}>
            Возможности Fit Track
          </a>
        </div>
      </main>
    </div>
  );
}

/**
 * Почта или телефон (FT-489). Вкладка «Телефон» — только если сервер
 * сказал, что вход по телефону включён (есть ключ SMS.ru): иначе человек
 * ввёл бы номер и упёрся в «не настроено».
 */
function ClientLogin() {
  const [options, setOptions] = useState(null);
  const [way, setWay] = useState('email');

  useEffect(() => {
    let alive = true;
    apiPublic('auth.phone.options', {})
      .then((o) => { if (alive && o && o.call) setOptions(o); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <>
      <p className="login__text">
        {way === 'phone'
          ? 'Войдите по номеру телефона — если кабинета ещё нет, он заведётся.'
          : 'Войдите по почте — если кабинета ещё нет, он заведётся. Пароль не нужен: придёт код.'}
      </p>
      {options && (
        <div className="login__ways">
          <Segmented
            label="Способ входа"
            items={[{ value: 'email', label: 'Почта' }, { value: 'phone', label: 'Телефон' }]}
            value={way}
            onChange={setWay}
          />
        </div>
      )}
      {way === 'phone' && options ? <PhoneLogin mode="login" options={options} /> : <ClientEmailLogin />}
    </>
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
 * Вход тренера по почте — и заявка на кабинет.
 *
 * Спрятан под «другим способом» намеренно: клиенту он не нужен и только
 * мешал бы — его дорога одна, персональная ссылка. А тренер заходит с
 * любого устройства и не должен для этого искать бота.
 *
 * Пароля нет: доказательством служит доступ к почтовому ящику. Если
 * адрес ещё не тренерский и регистрация тренеров включена, сервер после
 * кода отвечает needName — тогда те же поля превращаются в заявку: имя и
 * согласия. Кабинет откроется, когда владелец сервиса её одобрит
 * (ответ pending), и придёт письмо. Выключена регистрация — всё как было.
 */
function TrainerLogin() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState({ consent: false, terms: false });
  const [step, setStep] = useState('email'); // email → code → apply → pending
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setProblem('');
    try { await fn(); } catch (error) { setProblem(error.message); } finally { setBusy(false); }
  };

  const ask = () => run(async () => {
    await apiPublic('auth.trainer.request', { email });
    setStep('code');
  });

  const enter = () => run(async () => {
    const res = await apiPublic('auth.trainer.confirm', {
      email, code, device: describeDevice(),
      ...(step === 'apply' ? { name, consent: agree.consent, terms: agree.terms } : {}),
    });
    if (res && res.needName) { setStep('apply'); return; }
    if (res && res.pending) { setStep('pending'); return; }
    setToken(res.token);
  });

  const reset = () => {
    setStep('email'); setCode(''); setName(''); setAgree({ consent: false, terms: false }); setProblem('');
  };

  if (!open) {
    return (
      <button className="button button--ghost login__trainer-toggle" onClick={() => setOpen(true)}>
        Я тренер — войти по почте
      </button>
    );
  }

  if (step === 'pending') {
    return (
      <div className="login__trainer" role="status">
        <p className="login__text">
          Заявка на кабинет тренера отправлена. Когда её одобрят, на {email} придёт
          письмо — тогда войдите этим же адресом.
        </p>
        <button className="button button--ghost" onClick={reset}>Другой адрес</button>
      </div>
    );
  }

  const ready = step === 'email' ? !!email.trim()
    : step === 'code' ? code.length === 6
      : name.trim().length >= 2 && agree.consent && agree.terms;

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
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={busy || step === 'apply'}
          />
          {step === 'code' && <span className="field__hint">Код живёт 15 минут. Письмо приходит за несколько секунд.</span>}
        </label>
      )}

      {step === 'apply' && (
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
          <span className="field__hint">Кабинета тренера с этой почтой нет — оставьте заявку, её рассмотрят.</span>
        </label>
      )}

      {step === 'apply' && <TrainerConsentChecks value={agree} onChange={setAgree} disabled={busy} />}

      {problem && <p className="login__problem" role="alert">{problem}</p>}

      <button
        className="button button--primary button--block"
        onClick={step === 'email' ? ask : enter}
        disabled={busy || !ready}
      >
        {busy ? 'Минуту…' : step === 'email' ? 'Прислать код' : step === 'code' ? 'Войти' : 'Отправить заявку'}
      </button>

      {step !== 'email' && (
        <button className="button button--ghost" onClick={reset} disabled={busy}>
          Другой адрес
        </button>
      )}
    </div>
  );
}
