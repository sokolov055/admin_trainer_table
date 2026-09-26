import React, { useEffect, useState } from 'react';

import { inspectInvite, requestInviteEmail, confirmInviteEmail } from './invites.js';
import { IconAlert, IconCheck, IconKey, IconMail, IconRefresh, IconSend } from './icons.jsx';
import { iosApp } from './native-bridge.js';

export default function InviteRegistration({ token, onComplete, details }) {
  const [state, setState] = useState({ loading: true, invite: null, error: null });
  const [emailOpen, setEmailOpen] = useState(false);

  const load = () => {
    setState({ loading: true, invite: null, error: null });
    inspectInvite(token)
      .then((invite) => setState({ loading: false, invite, error: null }))
      .catch((error) => setState({ loading: false, invite: null, error }));
  };

  useEffect(load, [token]);

  if (state.loading) {
    return <InviteShell icon={<IconRefresh size={26} />} title="Проверяем приглашение" text="Это займёт несколько секунд." />;
  }

  if (state.error || !state.invite) {
    return (
      <InviteShell
        icon={<IconAlert size={27} />}
        title="Ссылка не работает"
        text={(state.error && state.error.message) || 'Попросите тренера отправить новое приглашение.'}
      >
        <button className="button button--block" onClick={load}><IconRefresh size={16} />Проверить снова</button>
        {details}
      </InviteShell>
    );
  }

  if (emailOpen && state.invite.methods.email) {
    return <EmailRegistration token={token} onBack={() => setEmailOpen(false)} onComplete={onComplete} />;
  }

  // В приложении для iPhone — без Telegram (см. iosApp в native-bridge.js)
  const telegram = state.invite.methods.telegram && !iosApp();

  return (
    <InviteShell
      icon={<IconKey size={28} />}
      title="Ваш кабинет готов к созданию"
      text={telegram
        ? 'Подтвердите Telegram. Мы создадим карточку клиента и сразу откроем доступ.'
        : 'Подтвердите почту. Мы создадим карточку клиента и сразу откроем доступ.'}
    >
      {telegram && (
        <>
          <a className="button button--primary button--block invite__primary" href={state.invite.telegramUrl}>
            <IconSend size={18} />
            Продолжить в Telegram
          </a>
          <p className="invite__hint">Telegram откроет бота и предложит нажать «Начать». После этого появится кнопка кабинета.</p>
        </>
      )}

      {state.invite.methods.email && (
        <button className="button button--block" onClick={() => setEmailOpen(true)}>
          <IconMail size={17} />
          Продолжить по почте
        </button>
      )}
      {!telegram && !state.invite.methods.email && (
        <div className="invite__error" role="alert"><IconAlert size={17} />Регистрация временно недоступна. Напишите тренеру.</div>
      )}
      {details}
    </InviteShell>
  );
}

function EmailRegistration({ token, onBack, onComplete }) {
  const [form, setForm] = useState({ name: '', email: '', code: '' });
  const [request, setRequest] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const update = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));

  const send = async (event) => {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const result = await requestInviteEmail(token, form.name, form.email);
      setRequest(result);
      setStatus('code');
    } catch (err) {
      setError(err.message || 'Не удалось отправить код.');
      setStatus('idle');
    }
  };

  const confirm = async (event) => {
    event.preventDefault();
    setStatus('confirming');
    setError('');
    try {
      await confirmInviteEmail(request.requestId, form.code);
      setStatus('done');
      onComplete();
    } catch (err) {
      setError(err.message || 'Код не подошёл.');
      setStatus('code');
    }
  };

  if (status === 'done') {
    return <InviteShell icon={<IconCheck size={28} />} title="Готово" text="Открываем ваш кабинет." />;
  }

  return (
    <InviteShell
      icon={<IconMail size={27} />}
      title={request ? 'Введите код из письма' : 'Регистрация по почте'}
      text={request ? `Мы отправили шестизначный код на ${form.email}.` : 'Укажите имя и почту. Пароль придумывать не нужно.'}
    >
      <form className="invite__form" onSubmit={request ? confirm : send}>
        {!request && (
          <>
            <label className="field">
              <span className="field__label">Имя и фамилия</span>
              <input className="field__input" autoComplete="name" value={form.name} onChange={update('name')} required maxLength={120} />
            </label>
            <label className="field">
              <span className="field__label">Почта</span>
              <input className="field__input" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={update('email')} required maxLength={254} />
            </label>
          </>
        )}
        {request && (
          <label className="field">
            <span className="field__label">Код из письма</span>
            <input className="field__input invite__code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={form.code} onChange={update('code')} required maxLength={6} />
          </label>
        )}
        {error && <div className="invite__error" role="alert"><IconAlert size={17} />{error}</div>}
        <button className="button button--primary button--block" disabled={status === 'sending' || status === 'confirming'}>
          {status === 'sending' || status === 'confirming' ? <IconRefresh size={16} /> : request ? <IconCheck size={16} /> : <IconMail size={16} />}
          {status === 'sending' ? 'Отправляем…' : status === 'confirming' ? 'Проверяем…' : request ? 'Подтвердить код' : 'Получить код'}
        </button>
        <button className="button button--ghost button--block" type="button" onClick={request ? () => { setRequest(null); setStatus('idle'); setError(''); } : onBack}>
          {request ? 'Изменить почту' : 'Назад'}
        </button>
      </form>
    </InviteShell>
  );
}

function InviteShell({ icon, title, text, children }) {
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
