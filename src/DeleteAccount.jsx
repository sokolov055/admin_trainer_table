import React, { useState } from 'react';
import { apiMutate, clearApiCache } from './api.js';
import { clearToken, hasToken } from './session.js';
import { Section, Panel } from './ui.jsx';

/**
 * Удалить аккаунт — в «Настройках» клиента, последним пунктом.
 *
 * Требование App Store: аккаунт, заведённый в приложении, удаляется в нём
 * же. Сразу пропадают все входы, персональные ссылки, шаги и уведомления;
 * карточку с тренировками и оплатами удаляет тренер — ему приходит
 * уведомление (server/src/api/account-handlers.js). Так и написано рядом с
 * кнопкой: человек должен знать, что останется у тренера.
 *
 * Подтверждение — на месте, а не окном браузера: окно в приложении выглядит
 * чужим, а это решение без пути назад.
 */
export default function DeleteAccount() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  if (!hasToken()) return null;

  const remove = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('account.delete', {});
      clearApiCache();
      clearToken();
    } catch (error) {
      setProblem(error.message || 'Не получилось удалить аккаунт. Проверьте связь и попробуйте ещё раз.');
      setBusy(false);
    }
  };

  return (
    <Section title="Удаление аккаунта">
      <Panel pad>
        <div className="setting">
          <div className="setting__note">
            Удалятся ваш вход на всех устройствах, персональная ссылка, шаги и уведомления.
            Карточку с тренировками и оплатами ведёт тренер — он получит сообщение и удалит её.
          </div>
          {asking ? (
            <div className="delete-account__confirm" role="alert">
              <strong>Удалить аккаунт навсегда?</strong>
              <div className="delete-account__actions">
                <button className="button button--critical" onClick={remove} disabled={busy}>
                  {busy ? 'Удаляем…' : 'Удалить навсегда'}
                </button>
                <button className="button" onClick={() => setAsking(false)} disabled={busy}>Отмена</button>
              </div>
            </div>
          ) : (
            <button className="button danger" onClick={() => setAsking(true)}>Удалить аккаунт</button>
          )}
          {problem && <div className="setting__note" role="alert">{problem}</div>}
        </div>
      </Panel>
    </Section>
  );
}
