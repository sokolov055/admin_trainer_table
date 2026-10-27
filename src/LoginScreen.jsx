import React, { useEffect, useRef, useState } from 'react';
import { apiPublic } from './api.js';
import PhoneLogin from './PhoneLogin.jsx';
import PhoneSignup, { looksLikeEmail, formatPhone } from './PhoneSignup.jsx';
import OtpStage from './OtpStage.jsx';
import { haptic } from './telegram.js';
import { Segmented, BackButton } from './ui.jsx';
import { setToken, describeDevice } from './session.js';
import { IconKey, IconUsers, IconUserPlus, IconCheck, IconChevron, IconMail, IconCopy, IconBack } from './icons.jsx';
import { useKeyboardInset } from './keyboard-inset.js';
import StageBar from './client/StageBar.jsx';
import { STAGES, SIGNUP_STAGE } from './client/onboarding-model.js';
import PasteLink from './PasteLink.jsx';
import { ConsentChecks, TrainerConsentChecks } from './Consent.jsx';
import { isNativeApp } from './native-bridge.js';
import { useBackGesture } from './gestures.jsx';
import { initialLoginPage, setLoginPath, leaveLoginPath, rememberRole, isTrainerPath, markSignupLead } from './login-route.js';
import './client/onboarding.css';
import './brand-type.css';
import './login.css';

/**
 * Экран для тех, кто пришёл без ссылки (FT-574).
 *
 * Персональная ссылка от тренера (access.js) по-прежнему открывает кабинет
 * сразу, и этот экран такой человек не видит. Сюда приходят те, кто скачал
 * приложение сам, у кого кончилась сессия, и те, кто ищет вход руками.
 *
 * Две страницы: клиент — корень, тренер — /trainer (login-route.js). Раньше
 * обе формы стояли на одном экране друг под другом, одинаковые, и было
 * непонятно, какая твоя и что вход и регистрация — одна дорога.
 *
 * У клиента дорога одна для входа и регистрации (lib/accounts.js на
 * сервере): почта → код из письма → имя и согласия, только если кабинета
 * ещё нет. Шаги видны сверху, каждый — свой экран. Помнить, заведён ли
 * кабинет, человек не обязан.
 */

const SUPPORT_EMAIL = 'sokolovk055@yandex.ru';

/**
 * Код из письма — шесть цифр (сервер, 14.10.2026). Исключение — демо для
 * проверяющего App Store: его постоянный код задан раньше и может быть с
 * буквами (mobile/APP_STORE.md), для этой почты поле принимает и буквы.
 */
const REVIEW_EMAIL = 'appreview@fittrack.demo';

/** Проверка видна целиком: круг встаёт, разгоняется и делает пару оборотов */
const CHECK_MIN_MS = 1800;

/** Повторный код — не чаще раза в минуту (так же считает сервер) */
const RESEND_SEC = 60;

function tgTest() {
  try { return new URLSearchParams(window.location.search).has('tgtest'); } catch (_) { return false; }
}

export default function LoginScreen({ details }) {
  const [page, setPage] = useState(initialLoginPage);
  // На страницу тренера пришли с клиентской — тогда «назад» ведёт обратно
  const [fromClient, setFromClient] = useState(false);
  const [prefill, setPrefill] = useState('');
  // Кабинета нет — после кода регистрация во весь экран, как анкета
  const [registering, setRegistering] = useState(false);
  const pageRef = useRef(page);
  pageRef.current = page;

  useEffect(() => { setLoginPath(page); }, [page]);

  // Back браузера снимает страховочную запись истории (history-back.js) и
  // может встать на запись со старым адресом — адрес следует за страницей
  useEffect(() => {
    const sync = () => setLoginPath(pageRef.current);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const toTrainer = (email = '') => {
    setPrefill(email);
    setRegistering(false);
    setFromClient(true);
    setPage('trainer');
    window.scrollTo(0, 0);
  };
  const toClient = () => {
    setRegistering(false);
    setFromClient(false);
    setPage('client');
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <main className={registering ? 'onboarding signin-register' : 'login login--signin'}>
        {page === 'trainer'
          ? <TrainerPage key="trainer" email={prefill} onBack={fromClient ? toClient : null} onClient={toClient} onRegister={setRegistering} details={details} />
          : <ClientPage key="client" onTrainer={toTrainer} onRegister={setRegistering} details={details} />}
      </main>
    </div>
  );
}

/* ==========================================================================
 * Клиент
 * ========================================================================== */

function ClientPage({ onTrainer, onRegister, details }) {
  const [options, setOptions] = useState(null);
  const [way, setWay] = useState('email');
  const [step, setStepOnly] = useState('email');
  const setStep = (next) => { setStepOnly(next); onRegister(next === 'name'); };

  // Вкладка «Телефон» (FT-489) — только если сервер сказал, что вход по
  // телефону включён (есть ключ SMS.ru): иначе человек ввёл бы номер и
  // упёрся в «не настроено»
  useEffect(() => {
    let alive = true;
    apiPublic('auth.phone.options', {})
      // ?tgtest — проба кода в Telegram до РКН: сервер шлёт его только номерам
      // из TG_GATEWAY_ONLY, остальным — звонок, как без этого
      .then((o) => { if (alive && o && o.call) setOptions(tgTest() ? { ...o, tg: true } : o); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const phone = way === 'phone' && options;
  const first = step === 'email';

  // Регистрация по номеру (FT-769) — когда есть код: в СМС (одобрено имя
  // отправителя SMS.ru) или в Telegram. Только звонок — прежний экран
  if (options && (options.sms || options.tg)) return <TabbedClient options={options} onTrainer={onTrainer} onRegister={onRegister} details={details} />;

  return (
    <div className="login__inner signin">
      {step !== 'name' && <header className="signin__head">
        <span className="signin__mark" aria-hidden="true"><IconKey size={22} /></span>
        <h1 className="login__title">Войти или создать кабинет</h1>
      </header>}

      {options && first && (
        <div className="login__ways">
          <Segmented
            label="Способ входа"
            items={[{ value: 'email', label: 'Почта' }, { value: 'phone', label: 'Телефон' }]}
            value={way}
            onChange={setWay}
          />
        </div>
      )}

      {phone
        ? <>
          <p className="signin__lead">Были у нас или впервые — неважно. Если кабинета ещё нет, он заведётся.</p>
          <PhoneLogin mode="login" options={options} />
        </>
        : <EmailFlow role="client" onStep={setStep} onTrainerEmail={onTrainer} />}

      {first && (
        <div className="signin__more">
          <section className="signin__aside" aria-label="Ссылка от тренера">
            <span className="signin__aside-icon" aria-hidden="true"><IconMail size={18} /></span>
            <p>
              <strong>Пришла ссылка от тренера?</strong>
              Откройте её — кабинет откроется сразу, без кода.
            </p>
          </section>
          {/* В приложении ссылка из мессенджера сама не доходит — её
              вставляют сюда (PasteLink.jsx) */}
          {isNativeApp() && <PasteLink />}
          <button type="button" className="signin__switch" onClick={() => onTrainer()}>
            <span><span className="signin__switch-q">Вы тренер?</span> Вход для тренеров</span>
            <IconChevron size={18} />
          </button>
        </div>
      )}

      {step !== 'name' && details}
      {first && (
        <a className="login__about" href={import.meta.env.BASE_URL + 'site/'}>
          Возможности Fit Track
        </a>
      )}
    </div>
  );
}

/* ==========================================================================
 * Клиент: «Вход» и «Регистрация» (FT-769, как в Робокассе)
 *
 * «Вход» — одно поле «Номер или почта»: номер — код в СМС, почта — код
 * письмом (прежний EmailFlow). «Регистрация» — по номеру. Перепутал вкладку
 * — не страшно: номер, у которого уже есть кабинет, просто входит в него.
 * ========================================================================== */

function TabbedClient({ options, onTrainer, onRegister, details }) {
  const [tab, setTab] = useState('signup');
  const [typed, setTyped] = useState('');
  const [via, setVia] = useState(null); // { kind: 'phone' | 'email', value }
  const [step, setStepOnly] = useState('email');
  const setStep = (next) => { setStepOnly(next); onRegister(next === 'name'); };
  const [inner, setInner] = useState('phone'); // шаг PhoneSignup
  const digitsOnly = typed.replace(/\D/g, '');
  const ready = looksLikeEmail(typed) || digitsOnly.length >= 10;
  // Первый экран — шапка, вкладки, «Вы тренер?»; дальше только шаг
  const first = !via && (tab === 'signin' || inner === 'phone');

  const go = (event) => {
    event.preventDefault();
    if (!ready) return;
    setVia(looksLikeEmail(typed) ? { kind: 'email', value: typed.trim() } : { kind: 'phone', value: typed });
  };

  return (
    <div className="login__inner signin">
      {first && <header className="signin__head">
        <span className="signin__mark" aria-hidden="true"><IconKey size={22} /></span>
        <h1 className="login__title">{tab === 'signup' ? 'Регистрация' : 'Вход'}</h1>
      </header>}

      {first && (
        <div className="login__ways">
          <Segmented label="Вход или регистрация" items={[{ value: 'signin', label: 'Вход' }, { value: 'signup', label: 'Регистрация' }]}
            value={tab} onChange={setTab} />
        </div>
      )}

      {tab === 'signup' && !via && <PhoneSignup key="signup" options={options} onStep={setInner} />}

      {tab === 'signin' && !via && (
        <form className="signin__step" onSubmit={go} noValidate>
          <label className="field">
            <span className="field__label">Номер или почта</span>
            <input className="field__input" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
              placeholder="+7 900 000-00-00 или почта" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            <span className="field__hint">Номер — код в СМС, почта — код в письме. Пароль не нужен.</span>
          </label>
          <button className="button button--primary button--block signin__submit" disabled={!ready}>Получить код</button>
        </form>
      )}

      {via && via.kind === 'phone' && (
        <PhoneSignup key="signin-phone" options={options} phone={formatPhone(via.value)} onBack={() => setVia(null)} />
      )}
      {via && via.kind === 'email' && (
        <>
          {step === 'email' && <BackButton label="Назад" onClick={() => setVia(null)} />}
          <EmailFlow role="client" initialEmail={via.value} autoAsk onStep={setStep} onTrainerEmail={onTrainer} />
        </>
      )}

      {first && (
        <div className="signin__more">
          {isNativeApp() && <PasteLink />}
          <button type="button" className="signin__switch" onClick={() => onTrainer()}>
            <span><span className="signin__switch-q">Вы тренер?</span> Вход для тренеров</span>
            <IconChevron size={18} />
          </button>
        </div>
      )}
      {step !== 'name' && details}
      {first && (
        <a className="login__about" href={import.meta.env.BASE_URL + 'site/'}>
          Возможности Fit Track
        </a>
      )}
    </div>
  );
}

/* ==========================================================================
 * Тренер
 *
 * Пароля нет: доказательством служит доступ к почтовому ящику. Адрес ещё не
 * тренерский и регистрация тренеров включена — после кода сервер отвечает
 * needName, и та же форма становится заявкой: имя и условия для тренеров.
 * После заявки — вход кандидата (FT-548, CandidateApp.jsx): анкета, тест,
 * созвон; кабинет откроется, когда владелец одобрит. Старый сервер вместо
 * входа отвечает pending — для него остался экран «заявка отправлена». Пока
 * регистрация выключена, письмо приходит только на адреса тренеров — так
 * форма не выдаёт, кто здесь тренер (trainer-auth-handlers.js).
 * ========================================================================== */

function TrainerPage({ email, onBack, onClient, onRegister, details }) {
  const [step, setStepOnly] = useState('email');
  const setStep = (next) => { setStepOnly(next); onRegister(next === 'name'); };
  // «Назад» на страницу клиента — только если пришли с неё. Шаги формы
  // ставят свой «назад» поверх, он срабатывает первым
  useBackGesture(() => onBack && onBack(), !!onBack);
  const first = step === 'email';

  return (
    <div className="login__inner signin signin--trainer">
      {onBack && first && <BackButton label="Вход для клиентов" onClick={onBack} />}
      {step !== 'name' && <header className="signin__head">
        <span className="signin__mark" aria-hidden="true"><IconUsers size={22} /></span>
        <h1 className="login__title">Кабинет тренера</h1>
      </header>}

      <EmailFlow role="trainer" initialEmail={email} onStep={setStep} />

      {first && (
        <div className="signin__more">
          <section className="signin__aside" aria-label="Подключиться тренером">
            <span className="signin__aside-icon" aria-hidden="true"><IconMail size={18} /></span>
            <p>
              <strong>Хотите вести клиентов в Fit Track?</strong>
              Напишите нам — расскажем, как подключиться:{' '}
              <a href={'mailto:' + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>
            </p>
          </section>
          {!onBack && (
            <button type="button" className="signin__switch" onClick={onClient}>
              <span><span className="signin__switch-q">Вы клиент?</span> Вход для клиентов</span>
              <IconChevron size={18} />
            </button>
          )}
        </div>
      )}
      {step !== 'name' && details}
    </div>
  );
}

/* ==========================================================================
 * Почта → код → имя
 *
 * Без имени сервер отвечает needName и код НЕ гасит — тот же код уходит
 * второй раз уже с именем и согласиями. Вернувшемуся человеку лишний вопрос
 * ни к чему: после кода сразу кабинет.
 * ========================================================================== */

function EmailFlow({ role, initialEmail = '', autoAsk = false, onStep, onTrainerEmail }) {
  const trainer = role === 'trainer';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState({ consent: false, terms: false });
  const [step, setStep] = useState('email'); // email → code → name → pending (заявка тренера)
  const [back, setBack] = useState(false);   // направление перехода — для движения
  const [reg, setReg] = useState(0);          // регистрация: 0 — имя, 1 — согласия
  const heading = useRef(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [trainerEmail, setTrainerEmail] = useState(false);
  const [quiz, setQuiz] = useState(false);   // после регистрации — анкета подбора программы (FT-552)
  useKeyboardInset();
  const [sentAt, setSentAt] = useState(0);
  const left = useCountdown(sentAt, RESEND_SEC);
  const review = email.trim().toLowerCase() === REVIEW_EMAIL;

  const go = (next, backwards = false) => {
    setBack(backwards);
    setStep(next);
    setProblem('');
    onStep && onStep(next);
  };

  const stepBack = () => {
    if (busy || phase === 'checking' || phase === 'success') return;
    if (step === 'name' && reg === 1) { setBack(true); setReg(0); setProblem(''); return; }
    if (step === 'name') { go('code', true); return; }
    setCode('');
    setName('');
    setAgree({ consent: false, terms: false });
    go('email', true);
  };
  // «Назад» на шагах — тот же, что жест, Back Android и браузера (FT-567)
  useBackGesture(stepBack, step === 'code' || step === 'name');

  const run = async (fn) => {
    setBusy(true);
    setProblem('');
    try {
      await fn();
    } catch (error) {
      // Почта тренера в клиентской форме: сервер говорит 409 — до кода,
      // если адрес в списке тренеров, или после верного кода (FT-574)
      if (!trainer && error && error.code === 409) setTrainerEmail(true);
      else setProblem((error && error.message) || 'Сервер не отвечает.');
    } finally {
      setBusy(false);
    }
  };

  const request = () => apiPublic(trainer ? 'auth.trainer.request' : 'auth.client.request', { email: email.trim() });

  const ask = () => run(async () => {
    setTrainerEmail(false);
    await request();
    setSentAt(Date.now());
    go('code');
  });

  // Почта пришла с вкладки «Вход» (FT-769) — код сразу, без второго нажатия
  const asked = useRef(false);
  useEffect(() => {
    if (autoAsk && !asked.current && /\S+@\S+\.\S+/.test(email.trim())) { asked.current = true; ask(); }
  }, []);

  const resend = () => run(async () => {
    await request();
    setSentAt(Date.now());
    setCode('');
  });

  const confirm = (typed, extra = {}) => apiPublic(trainer ? 'auth.trainer.confirm' : 'auth.client.confirm', {
    email: email.trim(), code: typed, device: describeDevice(), ...extra,
  });

  // Ответ на верный код: регистрация, заявка тренера или кабинет
  const finish = (res) => {
    if (res && res.needName) { setQuiz(!trainer && !!res.questionnaire); setReg(0); go('name'); return; }
    if (res && res.pending) { go('pending'); return; }
    rememberRole(role);
    // Новый кабинет — анкета продолжит счёт шагов регистрации
    if (!trainer && res.created && quiz) markSignupLead();
    // В кабинет — с адреса приложения, а не /trainer
    if (isTrainerPath()) leaveLoginPath();
    setToken(res.token);
  };

  /*
   * Код — та же сцена, что у кода из СМС (OtpStage, FT-489): шестой знак —
   * ячейки уходят в круг и кружат, пока сервер проверяет; верно — зеленеют
   * и собираются в галочку, и только потом кабинет или регистрация; нет —
   * возвращаются в ряд и качаются, поле очищается для новой попытки.
   */
  const [phase, setPhase] = useState('input');
  const answer = useRef(null);
  const checking = phase === 'checking' || phase === 'success';

  const check = async (typed) => {
    if (checking) return;
    setPhase('checking');
    setProblem('');
    setTrainerEmail(false);
    // Сервер отвечает за доли секунды, и круг мелькал незаметно (владелец,
    // 14.10.2026): кружение показываем не меньше одного оборота
    const shown = new Promise((resolve) => setTimeout(resolve, CHECK_MIN_MS));
    try {
      const res = await confirm(typed);
      await shown;
      answer.current = res;
      haptic();
      setPhase('success');
    } catch (error) {
      await shown;
      // Почта тренера (тренер из базы) — сервер говорит это после верного кода
      if (!trainer && error && error.code === 409) { setTrainerEmail(true); setPhase('input'); return; }
      setProblem((error && error.message) || 'Сервер не отвечает.');
      // Красный круг и крестик; пустой ряд — когда сцена доиграет (settled)
      setPhase('error');
    }
  };

  // Код из буфера обмена: в письме он часто внутри фразы («Ваш код: 123456»)
  const paste = async () => {
    if (checking) return;
    setProblem('');
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (_) { /* браузер не дал */ }
    const found = review
      ? (String(text).toUpperCase().match(/[A-Z0-9]{6}/) || [])[0]
      : (String(text).match(/\d{6}/) || [])[0] || String(text).replace(/\D/g, '').slice(0, 6);
    if (!found || found.length < 6) {
      setProblem(text
        ? 'В скопированном нет кода из шести цифр. Скопируйте код из письма.'
        : 'Не получилось прочитать скопированное. Нажмите на ячейки и удерживайте — «Вставить».');
      return;
    }
    setCode(found);
    check(found);
  };

  const settled = (kind) => {
    const res = answer.current;
    answer.current = null;
    if (kind === 'error') setCode('');
    setPhase('input');
    if (kind !== 'error' && res) finish(res);
  };

  // Регистрация: тот же код ещё раз — уже с именем и согласиями
  const enter = () => run(async () => {
    finish(await confirm(code, { name, consent: agree.consent, terms: agree.terms }));
  });

  const submit = (event) => {
    event.preventDefault();
    if (busy || !ready) return;
    if (step === 'name' && reg === 0) { setBack(false); setReg(1); return; }
    if (step === 'email') ask();
    else if (step === 'code') check(code);
    else enter();
  };

  const ready = step === 'email' ? /\S+@\S+\.\S+/.test(email.trim())
    : step === 'code' ? code.length === 6 && !checking
      : reg === 0 ? name.trim().length >= 2 : agree.consent && agree.terms;

  // На согласиях фокус — на заголовок, чтобы читалка экрана начала с него;
  // на имени фокус у поля (клавиатура)
  useEffect(() => { if (step === 'name' && reg === 1) heading.current?.focus({ preventScroll: true }); }, [step, reg]);

  if (step === 'pending') {
    return (
      <div className="signin__step" role="status">
        <div className="signin__done"><IconCheck size={22} /></div>
        <p className="signin__lead">
          Заявка на кабинет тренера отправлена. Когда её одобрят, на <strong>{email.trim()}</strong> придёт
          письмо — тогда войдите этим же адресом.
        </p>
        <button type="button" className="button button--ghost button--block" onClick={stepBack}>Другой адрес</button>
      </div>
    );
  }

  // Кабинета нет — регистрация во весь экран, по шагам, как анкета
  // (Onboarding.jsx): имя, затем согласия. После неё — кабинет и, если
  // включена, анкета подбора программы (FT-552) тем же языком
  if (step === 'name') {
    // Анкета включена — регистрация её первые два шага: счёт и значки общие
    // с Onboarding.jsx (цель, опыт, место, график, программа)
    const icons = [IconUserPlus, IconCheck];
    const title = reg === 0 ? 'Как вас зовут?' : trainer ? 'Условия для тренеров' : 'Осталось подтвердить';
    const intro = reg === 0
      ? (trainer
        ? <>Кабинета тренера с почтой <strong>{email.trim()}</strong> нет — оставьте заявку. Дальше анкета, тест и созвон; кабинет откроется после одобрения.</>
        : <>Кабинета с почтой <strong>{email.trim()}</strong> ещё нет — создадим новый.{quiz
          ? ' Ещё несколько коротких вопросов — и подберём программу под вашу цель и график.'
          : ' Имя увидит ваш тренер.'}</>)
      : (trainer
        ? 'Отметьте оба пункта, чтобы отправить заявку.'
        : 'Отметьте оба пункта — без них кабинет не сможет хранить ваши тренировки, замеры и питание.');
    return (
      <form key="register" className="signin__register" onSubmit={submit} noValidate>
        {/* Анкета включена — регистрация первый раздел её полосы, верх как
            в анкете (FT-577) */}
        {quiz && !trainer
          ? <div className="ob__top"><StageBar stages={[SIGNUP_STAGE, ...STAGES]} current={0} label="Регистрация и подбор программы" /></div>
          : <>
          <p className="onboarding__progress-text">
            {'Шаг ' + (reg + 1) + ' из ' + icons.length + ' · ' + (reg === 0 ? 'Имя' : trainer ? 'Условия' : 'Согласия')}
          </p>
          <div className="onboarding__progress" role="progressbar" aria-label={trainer ? 'Заявка тренера' : 'Регистрация'}
            aria-valuemin={1} aria-valuemax={icons.length} aria-valuenow={reg + 1}>
            {icons.map((Icon, i) => (
              <span key={i} className={'onboarding__step' + (i <= reg ? ' onboarding__step--active' : '')} aria-hidden="true"><Icon size={18} /></span>
            ))}
          </div>
          </>}
        <div key={reg} className={'onboarding__content signin__step' + (back ? ' signin__step--back' : '')}>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          <p className="onboarding__intro">{intro}</p>
          {reg === 0 && (
            <label className="field">
              <span className="field__label">Имя</span>
              <input
                className="field__input"
                autoComplete="name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                autoFocus
              />
            </label>
          )}
          {/* Согласие — отдельной отметкой, не «нажимая кнопку» (156-ФЗ) */}
          {reg === 1 && (trainer
            ? <TrainerConsentChecks value={agree} onChange={setAgree} disabled={busy} />
            : <ConsentChecks value={agree} onChange={setAgree} disabled={busy} />)}
          {problem && <p className="login__problem" role="alert">{problem}</p>}
        </div>
        {/* Низ — как в анкете (Onboarding.jsx): круглая «Назад» и одна
            ведущая кнопка на одном месте на всех шагах; над клавиатурой
            его закрепляет keyboard-inset.js */}
        <footer className="ob__footer">
          <button type="button" className="ob__back" aria-label="Назад" disabled={busy} onClick={stepBack}><IconBack size={20} /></button>
          <button className="button button--primary ob__next" disabled={busy || !ready}>
            {busy ? 'Минуту…' : reg === 0 ? 'Далее' : trainer ? 'Отправить заявку' : 'Создать кабинет'}
            <span className="ob__arrow" aria-hidden="true"><IconBack size={18} /></span>
          </button>
        </footer>
      </form>
    );
  }

  return (
    <form key="login" className="signin__form" onSubmit={submit} noValidate>
      {step !== 'email' && <BackButton label="Назад" onClick={stepBack} />}
      <Steps labels={['Почта', 'Код']} current={step === 'email' ? 0 : 1} />

      <div key={step} className={'signin__step' + (back ? ' signin__step--back' : '')}>
        {step === 'email' && <>
          <p className="signin__lead">
            {trainer
              ? 'Вход по рабочей почте. Пароль не нужен — придёт код.'
              : 'Были у нас или впервые — неважно: введите почту. Пароль не нужен — придёт код.'}
          </p>
          <label className="field">
            <span className="field__label">Почта</span>
            <input
              className="field__input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setTrainerEmail(false); }}
              disabled={busy}
            />
          </label>
        </>}

        {step === 'code' && <>
          <div className="signin__sent">
            <span>Код отправлен на <strong>{email.trim()}</strong></span>
            <button type="button" className="signin__change" onClick={stepBack} disabled={busy || checking}>Изменить</button>
          </div>
          <div className="field signin__otp">
            <span className="field__label">Код из письма</span>
            {/* Шестой знак — проверка уходит сама, кнопка «Войти» тут лишняя */}
            <OtpStage charset={review ? 'alnum' : 'digits'} value={code} onChange={setCode} onComplete={check} phase={phase} onSettled={settled}
              label="Код из письма" doneLabel="Код подтверждён" autoFocus />
            {!checking && (
              <button type="button" className="signin__paste" onClick={paste}>
                <IconCopy size={16} />Вставить код
              </button>
            )}
            <span className="field__hint">
              {trainer
                ? 'Письмо приходит, только если адрес открывает кабинет тренера. Нет письма — проверьте адрес и «Спам».'
                : 'Код действует 15 минут. Нет письма — загляните в «Спам».'}
            </span>
          </div>
        </>}

        {trainerEmail && (
          <div className="signin__notice" role="alert">
            <p><strong>Это почта тренера.</strong> У тренеров свой вход — с ним откроется кабинет тренера.</p>
            <button type="button" className="button button--primary button--block" onClick={() => onTrainerEmail && onTrainerEmail(email.trim())}>
              Войти как тренер
            </button>
          </div>
        )}

        {problem && <p className="login__problem" role="alert">{problem}</p>}

        {/* Почта тренера — главное действие «Войти как тренер», не код */}
        {!trainerEmail && step === 'email' && <button className="button button--primary button--block signin__submit" disabled={busy || !ready}>
          {busy ? 'Минуту…' : 'Прислать код'}
        </button>}

        {step === 'code' && phase !== 'success' && (
          <button type="button" className="signin__resend" onClick={resend} disabled={busy || checking || left > 0}>
            {left > 0 ? <>Прислать код ещё раз через <span className="signin__timer">{clock(left)}</span></> : 'Прислать код ещё раз'}
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * Шаги сверху: пройденный — галочка, текущий — залитый номер. Последний
 * шаг клиента («Имя») — только для нового кабинета, это сказано под ним:
 * вернувшийся человек не должен ждать третьего шага.
 */
function Steps({ labels, current }) {
  return (
    <ol className="signin__steps" aria-label={'Шаг ' + (current + 1) + ' из ' + labels.length}>
      {labels.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'next';
        return (
          <li key={label} className={'signin__stepper-item is-' + state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="signin__dot">{state === 'done' ? <IconCheck size={13} /> : i + 1}</span>
            <span className="signin__label">{label}</span>
          </li>
        );
      })}
    </ol>
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
