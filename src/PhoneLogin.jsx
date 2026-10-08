import React, { useEffect, useRef, useState } from 'react';
import { apiPublic, apiPrimary } from './api.js';
import { setToken, describeDevice } from './session.js';
import { ConsentChecks } from './Consent.jsx';
import OtpStage from './OtpStage.jsx';
import { haptic } from './telegram.js';

/**
 * Номер телефона: вход и регистрация (mode 'login', экран входа) или
 * номер для входа в своём кабинете (mode 'attach', «Мои данные»).
 * Сервер — lib/phone-login.js (FT-489).
 *
 * Основной способ — звонок: человек звонит на номер, который выдал SMS.ru,
 * звонок сбрасывается и для него бесплатный. Код переписывать не нужно —
 * экран сам спрашивает сервер, был ли звонок, и, как только был, проходит
 * дальше. СМС с кодом — запасной способ, если у сервиса есть одобренное имя
 * отправителя (options.sms).
 *
 * Сцена проверки (OtpStage) одна на оба способа: для кода — ячейки, для
 * звонка — точки, кружащие, пока ждём звонка.
 */

const POLL_MS = 2500;
const CODE_LENGTH = 6;

/** +7 925 507-06-02 по мере ввода; лишнее отбрасывается */
function formatPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (d && !d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const p = d.slice(1);
  let out = '+7';
  if (p.length) out += ' ' + p.slice(0, 3);
  if (p.length > 3) out += ' ' + p.slice(3, 6);
  if (p.length > 6) out += '-' + p.slice(6, 8);
  if (p.length > 8) out += '-' + p.slice(8, 10);
  return out;
}

const digits = (s) => String(s || '').replace(/\D/g, '');

export default function PhoneLogin({ mode = 'login', options = { call: true, sms: false }, onAttached }) {
  const login = mode === 'login';
  const call = (action, params) => (login ? apiPublic : apiPrimary)(
    login ? 'auth.phone.' + action : 'account.phone.' + action, params,
  );

  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('phone'); // phone → verify → name
  const [check, setCheck] = useState(null);   // { key, method, callPhone, callPhonePretty }
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState('input');
  const [after, setAfter] = useState(null);   // что делать, когда сцена доиграет
  const [name, setName] = useState('');
  const [agree, setAgree] = useState({ consent: false, terms: false });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = () => {
    clearTimeout(timer.current);
    setStep('phone'); setCheck(null); setCode(''); setPhase('input'); setAfter(null);
    setName(''); setAgree({ consent: false, terms: false }); setProblem(''); setBusy(false);
  };

  /** Ответ подтверждения: ждать дальше, спросить имя или войти */
  const settle = (res) => {
    if (res && res.waiting) return false;
    haptic();
    if (res && res.needName) setAfter({ kind: 'name' });
    else if (login) setAfter({ kind: 'token', token: res.token });
    else setAfter({ kind: 'attached', phone: res.phone });
    setPhase('success');
    return true;
  };

  const fail = (error) => {
    clearTimeout(timer.current);
    setProblem(error.message || 'Сервер не отвечает.');
    setPhase('error');
  };

  // Звонок: спрашиваем сервер, пока не позвонят или не выйдет время
  const poll = (key) => {
    timer.current = setTimeout(async () => {
      try {
        const res = await call('confirm', { key, device: describeDevice() });
        if (!settle(res)) poll(key);
      } catch (error) { fail(error); }
    }, POLL_MS);
  };

  const start = async (method) => {
    setBusy(true);
    setProblem('');
    try {
      const res = await call('request', { phone: digits(phone), method });
      setCheck(res);
      setStep('verify');
      setCode('');
      if (res.method === 'call') { setPhase('checking'); poll(res.key); } else setPhase('input');
    } catch (error) {
      setProblem(error.message || 'Сервер не отвечает.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value) => {
    setPhase('checking');
    setProblem('');
    try {
      settle(await call('confirm', { key: check.key, code: value, device: describeDevice() }));
    } catch (error) {
      fail(error);
      // Ряд вернулся и качнулся — можно вводить заново
      setTimeout(() => { setCode(''); setPhase('input'); }, 600);
    }
  };

  const onSettled = () => {
    if (!after) return;
    if (after.kind === 'token') setToken(after.token);
    if (after.kind === 'name') { setStep('name'); setPhase('input'); }
    if (after.kind === 'attached') { reset(); onAttached && onAttached(after.phone); }
  };

  const register = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      const res = await call('confirm', {
        key: check.key, name, consent: agree.consent, terms: agree.terms, device: describeDevice(),
      });
      setToken(res.token);
    } catch (error) {
      setProblem(error.message || 'Сервер не отвечает.');
      setBusy(false);
    }
  };

  if (step === 'name') {
    return (
      <form className="login__email" onSubmit={register}>
        <p className="phone__verified">Номер {formatPhone(phone)} подтверждён.</p>
        <label className="field">
          <span className="field__label">Как вас зовут</span>
          <input className="field__input" autoComplete="name" maxLength={120} value={name}
            onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus />
          <span className="field__hint">Кабинета с этим номером ещё нет — заведём новый.</span>
        </label>
        {/* Согласие — отдельной отметкой, не «нажимая кнопку» (156-ФЗ) */}
        <ConsentChecks value={agree} onChange={setAgree} disabled={busy} />
        {problem && <p className="login__problem" role="alert">{problem}</p>}
        <button className="button button--primary button--block"
          disabled={busy || name.trim().length < 2 || !agree.consent || !agree.terms}>
          {busy ? 'Минуту…' : 'Завести кабинет'}
        </button>
      </form>
    );
  }

  if (step === 'verify' && check) {
    const byCall = check.method === 'call';
    return (
      <div className="phone">
        {byCall ? (
          <>
            <p className="phone__lead">
              Позвоните с номера {formatPhone(phone)} на этот номер — звонок бесплатный
              и сбросится сам. Как только он пройдёт, вы войдёте.
            </p>
            <a className="button button--primary button--block phone__call" href={'tel:' + check.callPhone}>
              Позвонить {check.callPhonePretty}
            </a>
          </>
        ) : (
          <p className="phone__lead">Код из СМС на {formatPhone(phone)}.</p>
        )}

        <OtpStage
          length={byCall ? 4 : CODE_LENGTH}
          readOnly={byCall}
          value={code}
          onChange={setCode}
          onComplete={submitCode}
          phase={phase}
          onSettled={onSettled}
          label="Код из СМС"
          autoFocus
        />

        {byCall && phase === 'checking' && <p className="phone__wait small muted" aria-live="polite">Ждём звонка…</p>}
        {problem && <p className="login__problem" role="alert">{problem}</p>}

        {phase !== 'success' && (
          <button type="button" className="button button--ghost" onClick={reset}>Другой номер</button>
        )}
      </div>
    );
  }

  const ready = digits(phone).length === 11;
  return (
    <form className="login__email" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) start('call'); }}>
      <label className="field">
        <span className="field__label">Телефон</span>
        <input
          className="field__input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 900 000-00-00"
          value={phone}
          onFocus={() => { if (!phone) setPhone('+7'); }}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          disabled={busy}
        />
        {/* В «Моих данных» то же сказано под заголовком блока */}
        {login && <span className="field__hint">Пароль не нужен: подтвердите номер звонком. Кабинета нет — заведём.</span>}
      </label>
      {problem && <p className="login__problem" role="alert">{problem}</p>}
      <button className="button button--primary button--block" disabled={busy || !ready}>
        {busy ? 'Минуту…' : 'Подтвердить звонком'}
      </button>
      {options.sms && (
        <button type="button" className="button button--ghost" disabled={busy || !ready} onClick={() => start('sms')}>
          Прислать код в СМС
        </button>
      )}
    </form>
  );
}
