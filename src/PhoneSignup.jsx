import React, { useEffect, useRef, useState } from 'react';
import { apiPublic } from './api.js';
import { setToken, describeDevice } from './session.js';
import { ConsentChecks } from './Consent.jsx';
import OtpStage from './OtpStage.jsx';
import { BackButton } from './ui.jsx';
import { haptic } from './telegram.js';
import { useBackGesture } from './gestures.jsx';
import { useKeyboardInset } from './keyboard-inset.js';
import { markSignupLead } from './login-route.js';
import { linkTarget } from './access.js';
import { pendingTrainerLink, forgetTrainerLink, rememberTrainerLink } from './trainer-link.js';
import { MarketingLabel } from './plus.jsx';
import { IconLink, IconUserPlus } from './icons.jsx';
import { digits, formatPhone, looksLikeEmail, parseTrainerLink } from './phone-format.js';

export { formatPhone, looksLikeEmail };

/**
 * Регистрация и вход по номеру «как в Робокассе» (FT-769, макет согласован
 * владельцем 26.10.2026). Сервер — lib/phone-login.js.
 *
 *   номер → код из СМС (звонок — запасной)
 *     номер уже открывает кабинет → кабинет
 *     нет → почта по желанию → код из письма
 *       почта открывает кабинет → «Нашли ваш кабинет» → номер к нему
 *       нет или пропустил → «У меня есть тренер» / «Начать самому»
 *         → имя, согласия (реклама — отдельной галочкой, FT-768) → кабинет
 *
 * Проверка номера на сервере живёт до последнего шага: почта, найденный
 * кабинет и регистрация идут с тем же ключом (check.key).
 *
 * phone — номер, введённый на вкладке «Вход» («Номер или почта»): код
 * уходит сразу, без второго нажатия.
 */

const POLL_MS = 2500;
const RESEND_SEC = 60;

export default function PhoneSignup({ options = { call: true, sms: true }, phone: initial = '', onBack, onStep }) {
  const [phone, setPhone] = useState(initial ? formatPhone(initial) : '');
  const [step, setStep] = useState('phone'); // phone → code → email → mailcode → found | start → trainer → name
  const [check, setCheck] = useState(null);
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState('input');
  const after = useRef(null);
  const [email, setEmail] = useState('');
  const [found, setFound] = useState(null);
  const [link, setLink] = useState('');
  const [trainer, setTrainer] = useState(null); // { token, name }
  const [name, setName] = useState('');
  const [agree, setAgree] = useState({ consent: false, terms: false });
  const [ads, setAds] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const timer = useRef(null);
  useKeyboardInset();

  useEffect(() => () => clearTimeout(timer.current), []);
  // Экран входа прячет шапку и вкладки после первого шага (макет FT-769)
  useEffect(() => { if (onStep) onStep(step); }, [step]);

  const go = (next) => { setStep(next); setProblem(''); setCode(''); setPhase('input'); };

  const run = async (fn) => {
    setBusy(true); setProblem('');
    try { await fn(); } catch (error) { setProblem((error && error.message) || 'Сервер не отвечает.'); } finally { setBusy(false); }
  };

  /* ---------- номер ---------- */

  const confirm = (extra = {}) => apiPublic('auth.phone.confirm', {
    key: check.key, device: describeDevice(), ...(trainer ? { trainer: trainer.token } : {}), ...extra,
  });

  // Ответ на подтверждённый номер: кабинет есть — вход; нет — почта
  const settle = (res) => {
    if (res && res.waiting) return false;
    haptic();
    after.current = res;
    setPhase('success');
    return true;
  };

  const fail = (error) => {
    clearTimeout(timer.current);
    setProblem((error && error.message) || 'Сервер не отвечает.');
    setPhase('error');
  };

  const poll = (key) => {
    timer.current = setTimeout(async () => {
      try {
        const res = await apiPublic('auth.phone.confirm', { key, device: describeDevice() });
        if (!settle(res)) poll(key);
      } catch (error) { fail(error); }
    }, POLL_MS);
  };

  const start = (method) => run(async () => {
    clearTimeout(timer.current);
    const res = await apiPublic('auth.phone.request', { phone: digits(phone), method });
    setCheck(res);
    setSentAt(Date.now());
    go('code');
    if (res.method === 'call') { setPhase('checking'); poll(res.key); }
  });

  // С вкладки «Вход» номер пришёл готовым — код сразу
  const started = useRef(false);
  useEffect(() => {
    if (initial && !started.current && digits(phone).length === 11) { started.current = true; start(options.sms ? 'sms' : 'call'); }
  }, []);

  const submitCode = async (value) => {
    setPhase('checking'); setProblem('');
    try { settle(await confirm({ code: value })); } catch (error) { fail(error); }
  };

  const onSettled = (kind) => {
    if (kind === 'error') { setCode(''); setPhase('input'); return; }
    const res = after.current;
    after.current = null;
    if (!res) return;
    if (res.token) { setToken(res.token); return; }
    if (res.needName) { setQuiz(!!res.questionnaire); go('email'); }
  };

  /* ---------- почта ---------- */

  const askMail = () => run(async () => {
    await apiPublic('auth.phone.email.request', { key: check.key, email: email.trim() });
    setSentAt(Date.now());
    go('mailcode');
  });

  const checkMail = async (value) => {
    setPhase('checking'); setProblem('');
    try {
      const res = await apiPublic('auth.phone.email.confirm', { key: check.key, email: email.trim(), code: value });
      haptic();
      after.current = res;
      setPhase('success');
    } catch (error) { fail(error); }
  };

  const mailSettled = (kind) => {
    if (kind === 'error') { setCode(''); setPhase('input'); return; }
    const res = after.current;
    after.current = null;
    if (!res) return;
    if (res.found) { setFound(res.found); go('found'); } else toStart();
  };

  // Пришёл по ссылке тренера — выбор «тренер или сам» не нужен
  const toStart = () => {
    const pending = pendingTrainerLink();
    if (pending) {
      apiPublic('auth.trainer.link.inspect', { token: pending })
        .then((r) => { setTrainer({ token: pending, name: r.trainerName }); go('name'); })
        .catch(() => go('start'));
      return;
    }
    go('start');
  };

  const attach = () => run(async () => {
    const res = await confirm({ attach: true });
    setToken(res.token);
  });

  /* ---------- тренер ---------- */

  const checkLink = () => run(async () => {
    const parsed = parseTrainerLink(link);
    if (!parsed) throw new Error('Это не похоже на ссылку тренера. Скопируйте её из сообщения целиком.');
    if (parsed.open) {
      // Персональная ссылка — карточка уже заведена тренером: открываем её
      const target = linkTarget(parsed.open, window.location.href);
      if (target) { window.location.replace(target); return; }
    }
    const r = await apiPublic('auth.trainer.link.inspect', { token: parsed.token });
    setTrainer({ token: parsed.token, name: r.trainerName });
  });

  /* ---------- имя и согласия ---------- */

  const create = (event) => {
    event.preventDefault();
    if (!ready) return;
    run(async () => {
      const res = await confirm({ name: name.trim(), consent: agree.consent, terms: agree.terms, marketing: ads });
      if (trainer) {
        // Не привязался (у тренера нет мест) — предложение останется на обзоре
        if (res.trainerError) rememberTrainerLink(trainer.token); else forgetTrainerLink();
      } else if (res.created && quiz) {
        markSignupLead();
      }
      setToken(res.token);
    });
  };

  /* ---------- назад ---------- */

  const BACK = { code: 'phone', email: 'phone', mailcode: 'email', found: 'email', start: 'email', trainer: 'start', name: 'start' };
  const back = () => {
    if (busy || phase === 'checking' || phase === 'success') return;
    if (step === 'trainer' && trainer) { setTrainer(null); return; }
    if (step === 'name' && trainer) setTrainer(null);
    const prev = BACK[step];
    if (prev === 'phone') { clearTimeout(timer.current); setCheck(null); }
    if (prev) go(prev); else if (onBack) onBack();
  };
  useBackGesture(back, step !== 'phone');

  const left = useCountdown(sentAt, RESEND_SEC);
  const ready = step === 'name' && name.trim().length >= 2 && agree.consent && agree.terms;
  const dots = { email: 1, mailcode: 1, found: 2, start: 2, trainer: 2, name: 3 }[step];

  return (
    <div className="phone-signup">
      {step !== 'phone' && <BackButton label="Назад" onClick={back} />}
      {dots != null && (
        <div className="phone-signup__dots" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <i key={i} className={i <= dots ? 'is-on' : ''} />)}
        </div>
      )}

      {step === 'phone' && (
        <form className="signin__step" onSubmit={(e) => { e.preventDefault(); if (digits(phone).length === 11 && !busy) start(options.sms ? 'sms' : 'call'); }}>
          <label className="field">
            <span className="field__label">Номер телефона</span>
            <input className="field__input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00"
              value={phone} onFocus={() => { if (!phone) setPhone('+7'); }}
              onChange={(e) => setPhone(formatPhone(e.target.value))} disabled={busy} autoFocus />
            <span className="field__hint">Пришлём код в СМС. Номер уже есть у нас — просто войдёте в свой кабинет.</span>
          </label>
          {problem && <p className="login__problem" role="alert">{problem}</p>}
          <button className="button button--primary button--block signin__submit" disabled={busy || digits(phone).length !== 11}>
            {busy ? 'Минуту…' : 'Получить код'}
          </button>
        </form>
      )}

      {step === 'code' && check && (
        <div className="signin__step">
          {check.method === 'call' ? (
            <>
              <h2 className="phone-signup__title">Позвоните на номер</h2>
              <p className="signin__lead">С номера {formatPhone(phone)} — звонок бесплатный и сбросится сам.</p>
              <a className="button button--primary button--block phone__call" href={'tel:' + check.callPhone}>Позвонить {check.callPhonePretty}</a>
            </>
          ) : (
            <>
              <h2 className="phone-signup__title">Код из СМС</h2>
              <p className="signin__lead">Отправили на {formatPhone(phone)}</p>
            </>
          )}
          <div className="field signin__otp">
            <OtpStage length={check.method === 'call' ? 4 : 6} readOnly={check.method === 'call'} value={code} onChange={setCode}
              onComplete={submitCode} phase={phase} onSettled={onSettled} label="Код из СМС" doneLabel="Номер подтверждён" autoFocus />
          </div>
          {check.method === 'call' && phase === 'checking' && <p className="small muted" aria-live="polite">Ждём звонка…</p>}
          {problem && <p className="login__problem" role="alert">{problem}</p>}
          {check.method === 'sms' && phase !== 'success' && (
            <button type="button" className="signin__resend" onClick={() => start('sms')} disabled={busy || phase === 'checking' || left > 0}>
              {left > 0 ? <>Отправить снова через <span className="signin__timer">{clock(left)}</span></> : 'Отправить код ещё раз'}
            </button>
          )}
          {check.method === 'sms' && options.call && phase !== 'success' && (
            <button type="button" className="signin__resend" onClick={() => start('call')} disabled={busy || phase === 'checking'}>
              Не приходит? Позвонить вместо СМС
            </button>
          )}
        </div>
      )}

      {step === 'email' && (
        <form className="signin__step" onSubmit={(e) => { e.preventDefault(); if (looksLikeEmail(email) && !busy) askMail(); }}>
          <h2 className="phone-signup__title">Привяжите почту</h2>
          <p className="signin__lead">По ней вы войдёте, если смените номер, и найдём кабинет, если он у вас уже был. Туда же придут чеки.</p>
          <label className="field">
            <span className="field__label">Почта</span>
            <input className="field__input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </label>
          {problem && <p className="login__problem" role="alert">{problem}</p>}
          <button className="button button--primary button--block" disabled={busy || !looksLikeEmail(email)}>{busy ? 'Минуту…' : 'Получить код'}</button>
          <button type="button" className="button button--ghost button--block" disabled={busy} onClick={toStart}>Пропустить</button>
        </form>
      )}

      {step === 'mailcode' && (
        <div className="signin__step">
          <h2 className="phone-signup__title">Код из письма</h2>
          <div className="signin__sent">
            <span>Отправили на <strong>{email.trim()}</strong>. Письма нет — загляните в «Спам».</span>
            <button type="button" className="signin__change" onClick={back} disabled={busy || phase === 'checking'}>Изменить</button>
          </div>
          <div className="field signin__otp">
            <OtpStage value={code} onChange={setCode} onComplete={checkMail} phase={phase} onSettled={mailSettled}
              label="Код из письма" doneLabel="Почта подтверждена" autoFocus />
          </div>
          {problem && <p className="login__problem" role="alert">{problem}</p>}
          {phase !== 'success' && (
            <button type="button" className="signin__resend" onClick={askMail} disabled={busy || phase === 'checking' || left > 0}>
              {left > 0 ? <>Прислать код ещё раз через <span className="signin__timer">{clock(left)}</span></> : 'Прислать код ещё раз'}
            </button>
          )}
        </div>
      )}

      {step === 'found' && found && (
        <div className="signin__step">
          <h2 className="phone-signup__title">Нашли ваш кабинет</h2>
          <div className="phone-signup__card">
            <span className="phone-signup__ava" aria-hidden="true">{(found.name || '?').trim()[0]}</span>
            <span><strong>{found.name}</strong><span className="small muted">{found.trainerName ? `Тренер — ${found.trainerName}` : 'Свой кабинет, без тренера'}</span></span>
          </div>
          <p className="signin__lead">
            Привяжем номер {formatPhone(phone)} к этому кабинету — дальше входите по нему.
            {found.hasPhone && ' Прежний номер кабинета больше не будет его открывать.'}
          </p>
          {problem && <p className="login__problem" role="alert">{problem}</p>}
          <button type="button" className="button button--primary button--block" disabled={busy} onClick={attach}>{busy ? 'Минуту…' : 'Да, это мой кабинет'}</button>
          <button type="button" className="button button--ghost button--block" disabled={busy} onClick={toStart}>Нет, завести новый</button>
        </div>
      )}

      {step === 'start' && (
        <div className="signin__step">
          <h2 className="phone-signup__title">Как начнём?</h2>
          {email && !found && <p className="signin__lead">По почте {email.trim()} кабинета нет.</p>}
          <button type="button" className="phone-signup__choice" onClick={() => go('trainer')}>
            <span className="phone-signup__icon" aria-hidden="true"><IconLink size={20} /></span>
            <span><strong>У меня есть тренер</strong><span className="small muted">Вставьте ссылку или код, который он прислал</span></span>
          </button>
          <button type="button" className="phone-signup__choice" onClick={() => { setTrainer(null); go('name'); }}>
            <span className="phone-signup__icon" aria-hidden="true"><IconUserPlus size={20} /></span>
            <span><strong>Начать самому</strong><span className="small muted">Новый кабинет, программу подберём по анкете</span></span>
          </button>
        </div>
      )}

      {step === 'trainer' && (
        <form className="signin__step" onSubmit={(e) => { e.preventDefault(); if (trainer) go('name'); else if (link.trim() && !busy) checkLink(); }}>
          <h2 className="phone-signup__title">Ссылка от тренера</h2>
          {!trainer ? (
            <>
              <label className="field">
                <span className="field__label">Ссылка или код</span>
                <input className="field__input" inputMode="url" autoCapitalize="none" spellCheck={false} value={link}
                  onChange={(e) => { setLink(e.target.value); setProblem(''); }} disabled={busy} autoFocus />
                <span className="field__hint">Зажмите ссылку в сообщении тренера → «Копировать» — и вставьте сюда.</span>
              </label>
              {problem && <p className="login__problem" role="alert">{problem}</p>}
              <button className="button button--primary button--block" disabled={busy || !link.trim()}>{busy ? 'Минуту…' : 'Проверить'}</button>
            </>
          ) : (
            <>
              <div className="phone-signup__card">
                <span className="phone-signup__ava" aria-hidden="true">{(trainer.name || '?').trim()[0]}</span>
                <span><strong>{trainer.name}</strong><span className="small muted">Тренер увидит ваши тренировки, замеры и питание</span></span>
              </div>
              <button className="button button--primary button--block">Подключиться</button>
            </>
          )}
        </form>
      )}

      {step === 'name' && (
        <form className="signin__step" onSubmit={create} noValidate>
          <h2 className="phone-signup__title">Как вас зовут?</h2>
          {trainer && <p className="signin__lead">Кабинет сразу подключится к тренеру: {trainer.name}.</p>}
          <label className="field">
            <span className="field__label">Имя</span>
            <input className="field__input" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus />
          </label>
          {/* Согласие — отдельными отметками, не «нажимая кнопку» (156-ФЗ);
              реклама — своей галочкой, не отмечена и не условие (FT-768) */}
          <ConsentChecks value={agree} onChange={setAgree} disabled={busy} />
          <label className="consent__line phone-signup__ads">
            <input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} disabled={busy} />
            <span><MarketingLabel /></span>
          </label>
          {problem && <p className="login__problem" role="alert">{problem}</p>}
          <button className="button button--primary button--block" disabled={busy || !ready}>{busy ? 'Минуту…' : 'Создать кабинет'}</button>
        </form>
      )}
    </div>
  );
}

/** Секунд до повтора кода; тикает раз в секунду, пока не дойдёт до нуля */
function useCountdown(from, seconds) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!from) return undefined;
    setNow(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= from + seconds * 1000) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [from]);
  return from ? Math.min(seconds, Math.max(0, Math.ceil((from + seconds * 1000 - Math.max(now, from)) / 1000))) : 0;
}

const clock = (sec) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
