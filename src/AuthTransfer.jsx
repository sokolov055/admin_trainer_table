import React, { useEffect, useRef, useState } from 'react';
import {
  consumeTransferTicket, createTransferUrl, friendlyTransferError,
  removeLoginTicketFromUrl,
} from './auth-transfer.js';
import {
  dismissInstallHint, installGuidance, onInstallPromptChange, prepareIosInstallBridge,
  requestInstall,
} from './install.js';
import { isInsideTelegram, tg } from './telegram.js';
import {
  IconAlert, IconCheck, IconClose, IconPhone, IconRefresh, IconSend,
} from './icons.jsx';

const SUCCESS_PAUSE_MS = 550;

export function TransferLoginScreen({ ticket, onComplete, onAlternative, details }) {
  const [status, setStatus] = useState('loading');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let active = true;
    let timer = null;
    removeLoginTicketFromUrl();
    setStatus('loading');
    setProblem('');

    consumeTransferTicket(ticket)
      .then(async () => {
        if (!active) return;
        let installReady = true;
        try { await prepareIosInstallBridge(); } catch (_) { installReady = false; }
        if (!active) return;
        setStatus('success');
        timer = setTimeout(() => {
          if (active) onComplete({ installReady });
        }, SUCCESS_PAUSE_MS);
      })
      .catch((error) => {
        if (!active) return;
        setProblem(friendlyTransferError(error));
        setStatus('error');
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ticket]);

  return (
    <div className="app">
      <main className="login">
        <div className="login__inner" role="status" aria-live="polite">
          {status === 'loading' && (
            <>
              <div className="login__mark"><IconPhone size={28} /></div>
              <h1 className="login__title">Открываем ваш кабинет</h1>
              <p className="login__text">Проверяем безопасную ссылку из Telegram.</p>
              <div className="login__wait">
                <span className="login__pulse" aria-hidden="true" />
                Это займёт несколько секунд
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="login__mark login__mark--success"><IconCheck size={28} /></div>
              <h1 className="login__title">Вход выполнен</h1>
              <p className="login__text">Кабинет готов. Сейчас откроем его автоматически.</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="login__mark"><IconAlert size={28} /></div>
              <h1 className="login__title">Ссылка не сработала</h1>
              <p className="login__text">{problem}</p>
              <button
                className="button button--primary button--block login__cta"
                onClick={onAlternative}
              >
                <IconSend size={16} />
                Войти другим способом
              </button>
              <p className="login__hint login__recovery">
                Для новой безопасной ссылки вернитесь в Telegram и нажмите «Добавить на телефон» ещё раз.
              </p>
            </>
          )}

          {details}
        </div>
      </main>
    </div>
  );
}

export function TelegramTransferCard() {
  const [state, setState] = useState({ status: 'idle', error: '', url: '' });
  const running = useRef(false);

  if (!isInsideTelegram()) return null;

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setState({ status: 'loading', error: '', url: '' });

    try {
      const transfer = await createTransferUrl();
      const app = tg();

      if (app && typeof app.openLink === 'function') {
        app.openLink(transfer.url);
        setState({ status: 'opened', error: '', url: '' });
      } else {
        // SDK иногда не загружается у провайдера. Обычная ссылка остаётся
        // рабочим запасным путём и требует осознанного второго нажатия.
        setState({ status: 'ready', error: '', url: transfer.url });
      }
    } catch (error) {
      setState({
        status: 'error',
        error: (error && error.message) || 'Не удалось создать ссылку. Попробуйте снова.',
        url: '',
      });
    } finally {
      running.current = false;
    }
  };

  const busy = state.status === 'loading';

  return (
    <section className="transfer-card enter" aria-labelledby="transfer-title">
      <div className="transfer-card__icon"><IconPhone size={22} /></div>
      <div className="transfer-card__body">
        <h2 className="transfer-card__title" id="transfer-title">Добавить на телефон</h2>
        <p className="transfer-card__text">
          Откроем браузер уже с выполненным входом. Там можно добавить Fit Track на главный экран.
        </p>
        {state.status === 'error' && <p className="transfer-card__error" role="alert">{state.error}</p>}
        {state.status === 'opened' && <p className="transfer-card__status" role="status">Браузер открыт. Продолжите установку там.</p>}

        {state.status === 'ready' ? (
          <a className="button transfer-card__button" href={state.url} target="_blank" rel="noopener noreferrer">
            <IconSend size={16} />
            Открыть в браузере
          </a>
        ) : (
          <button className="button transfer-card__button" onClick={start} disabled={busy}>
            <IconPhone size={16} />
            {busy ? 'Готовим ссылку…' : state.status === 'opened' ? 'Создать новую ссылку' : 'Добавить на телефон'}
          </button>
        )}
      </div>
    </section>
  );
}

export function InstallHint({ active, installReady = true }) {
  const [, redraw] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(installReady);
  const [problem, setProblem] = useState('');

  useEffect(() => onInstallPromptChange(() => redraw((value) => value + 1)), []);

  if (!active || hidden) return null;
  const kind = installGuidance();
  if (!kind) return null;

  const close = () => {
    dismissInstallHint();
    setHidden(true);
  };

  const install = async () => {
    setBusy(true);
    try { await requestInstall(); } finally { setHidden(true); }
  };

  const retryBridge = async () => {
    setBusy(true);
    setProblem('');
    try {
      await prepareIosInstallBridge();
      setBridgeReady(true);
    } catch (_) {
      setProblem('Не удалось подготовить вход после установки. Проверьте связь и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="install-hint" aria-labelledby="install-hint-title">
      <button className="install-hint__close" onClick={close} aria-label="Закрыть подсказку">
        <IconClose size={18} />
      </button>
      <div className="install-hint__icon"><IconCheck size={20} /></div>
      <div className="install-hint__body">
        <h2 className="install-hint__title" id="install-hint-title">Кабинет готов</h2>
        <p className="install-hint__text">
          {kind === 'ios'
            ? 'В браузере нажмите «Поделиться», затем «На экран Домой».'
            : 'Добавьте Fit Track на экран телефона, чтобы открывать кабинет одним нажатием.'}
        </p>
        {kind === 'ios' && !bridgeReady && (
          <p className="install-hint__error" role="alert">{problem || 'Перед установкой нужно ещё раз подготовить безопасный вход.'}</p>
        )}
        {kind === 'prompt' && (
          <button className="button button--primary install-hint__action" onClick={install} disabled={busy}>
            <IconPhone size={16} />
            {busy ? 'Открываем…' : 'Добавить на экран'}
          </button>
        )}
        {kind === 'ios' && bridgeReady && (
          <button className="button install-hint__action" onClick={close}>Понятно</button>
        )}
        {kind === 'ios' && !bridgeReady && (
          <button className="button button--primary install-hint__action" onClick={retryBridge} disabled={busy}>
            <IconRefresh size={16} />
            {busy ? 'Подготавливаем…' : 'Подготовить установку'}
          </button>
        )}
      </div>
    </aside>
  );
}
