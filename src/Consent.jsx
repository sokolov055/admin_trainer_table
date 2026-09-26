import React, { useState } from 'react';
import { apiPrimary, clearApiCache } from './api.js';
import { describeDevice } from './session.js';
import { SignOut } from './ui.jsx';

/**
 * Согласие на обработку персональных данных и пользовательское соглашение.
 *
 * С 01.09.2025 согласие оформляется ОТДЕЛЬНО от прочих документов (ст. 9
 * ч. 1 152-ФЗ, ред. 156-ФЗ): не «регистрируясь, вы соглашаетесь…», а своя
 * отметка со ссылкой на свой текст. Поэтому здесь две галочки, обе пустые
 * по умолчанию, и кнопка неактивна, пока не отмечены обе. Сервер записывает
 * версию и способ подтверждения (server/src/lib/consents.js).
 */

const BASE = 'https://sokolov055.github.io/admin_trainer_table/';

export function ConsentChecks({ value, onChange, disabled }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.checked });
  return (
    <div className="consent">
      <label className="consent__line">
        <input type="checkbox" checked={!!value.consent} onChange={set('consent')} disabled={disabled} />
        <span>
          Даю <a href={BASE + 'consent.html'} target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных</a>,
          включая рост, вес, обхваты, питание и шаги
        </span>
      </label>
      <label className="consent__line">
        <input type="checkbox" checked={!!value.terms} onChange={set('terms')} disabled={disabled} />
        <span>
          Принимаю <a href={BASE + 'terms.html'} target="_blank" rel="noopener noreferrer">пользовательское соглашение</a>
        </span>
      </label>
      <p className="consent__note">
        Как обрабатываются данные — в <a href={BASE + 'privacy.html'} target="_blank" rel="noopener noreferrer">политике</a>.
      </p>
    </div>
  );
}

/**
 * Для тех, кто уже пользовался приложением, когда согласие брали иначе
 * (или вовсе не брали), и для новой версии текста. Кабинет открывается
 * после подтверждения; не хочет — может выйти или удалить аккаунт.
 */
export function ConsentGate({ onDone }) {
  const [value, setValue] = useState({ consent: false, terms: false });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const accept = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiPrimary('consent.accept', { consent: true, terms: true, device: describeDevice() });
      clearApiCache();
      onDone();
    } catch (error) {
      setProblem(error.message || 'Не получилось сохранить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <main className="login">
        <div className="login__inner consent-gate">
          <h1 className="login__title">Подтвердите согласие</h1>
          <p className="login__text">
            С сентября 2025 года согласие на обработку персональных данных оформляется
            отдельно. Отметьте оба пункта, чтобы продолжить — без этого кабинет
            работать не сможет.
          </p>
          <ConsentChecks value={value} onChange={setValue} disabled={busy} />
          {problem && <p className="login__problem" role="alert">{problem}</p>}
          <button
            className="button button--primary button--block"
            disabled={busy || !value.consent || !value.terms}
            onClick={accept}
          >
            {busy ? 'Минуту…' : 'Продолжить'}
          </button>
          <SignOut />
        </div>
      </main>
    </div>
  );
}
