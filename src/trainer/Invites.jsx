import React, { useEffect, useState } from 'react';

import { copyInviteText, createTrainerInvite, listTrainerInvites, revokeTrainerInvite } from '../invites.js';
import { ErrorState, Loading, Panel, Section, Segmented } from '../ui.jsx';
import { IconCheck, IconCopy, IconLink, IconRefresh, IconSend, IconTrash } from '../icons.jsx';
import { haptic } from '../telegram.js';

const KINDS = [
  { value: 'reusable', label: 'Многоразовая' },
  { value: 'single', label: 'На одного' },
];

export function Invites() {
  const [state, setState] = useState({ loading: true, invites: [], error: null });
  const [kind, setKind] = useState('reusable');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const load = () => {
    setState((value) => ({ ...value, loading: true, error: null }));
    listTrainerInvites()
      .then((data) => setState({ loading: false, invites: data.invites || [], error: null }))
      .catch((error) => setState({ loading: false, invites: [], error }));
  };

  useEffect(load, []);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const invite = await createTrainerInvite(kind, label);
      setState((value) => ({ ...value, invites: [invite, ...value.invites], error: null }));
      setLabel('');
      haptic('success');
      await copy(invite);
    } catch (error) {
      setState((value) => ({ ...value, error }));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (invite) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Приглашение на тренировки', text: 'Откройте ссылку, чтобы создать кабинет', url: invite.url });
        return;
      } catch (error) {
        if (error.name !== 'AbortError') await copyInviteText(invite.url);
        else return;
      }
    } else {
      await copyInviteText(invite.url);
    }
    setCopied(invite.id);
    haptic('success');
    window.setTimeout(() => setCopied(''), 1800);
  };

  const revoke = async (invite) => {
    setBusy(true);
    try {
      await revokeTrainerInvite(invite.id);
      setState((value) => ({ ...value, invites: value.invites.filter((item) => item.id !== invite.id), error: null }));
      haptic();
      setConfirmId('');
    } catch (error) {
      setState((value) => ({ ...value, error }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Пригласить клиента" note="Регистрация привяжет клиента к вам">
      <Panel pad className="invites-card">
        <form className="invites-create" onSubmit={create}>
          <Segmented items={KINDS} value={kind} onChange={setKind} label="Тип приглашения" disabled={busy} />
          <p className="invites-create__hint">
            {kind === 'single' ? 'Ссылка сработает один раз и действует 7 дней.' : 'Подходит для рассылки и действует 90 дней.'}
          </p>
          <label className="field">
            <span className="field__label">Пометка для себя</span>
            <input className="field__input" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="Например, сентябрьская группа" />
          </label>
          <button className="button button--primary button--block" disabled={busy}>
            {busy ? <IconRefresh size={17} /> : <IconLink size={17} />}
            Создать и отправить
          </button>
        </form>
      </Panel>

      {state.error && <div className="invites-error"><ErrorState error={state.error} onRetry={load} /></div>}
      {state.loading && <Loading lead={false} rows={2} />}
      {!state.loading && state.invites.length > 0 && (
        <div className="invites-list">
          {state.invites.map((invite) => (
            <Panel pad className="invite-row" key={invite.id}>
              <div className="invite-row__copy">
                <strong>{invite.label || (invite.kind === 'single' ? 'Одноразовая ссылка' : 'Многоразовая ссылка')}</strong>
                <span>{invite.kind === 'single' ? 'Для одного клиента' : `Использований: ${invite.useCount || 0}`}</span>
                <span>Действует до {new Date(invite.expiresAt).toLocaleDateString('ru-RU')}</span>
              </div>
              <div className="invite-row__actions">
                <button className="button" type="button" onClick={() => copy(invite)} disabled={busy}>
                  {copied === invite.id ? <IconCheck size={16} /> : navigator.share ? <IconSend size={16} /> : <IconCopy size={16} />}
                  {copied === invite.id ? 'Скопировано' : navigator.share ? 'Отправить' : 'Копировать'}
                </button>
                <button
                  className={'button invite-row__revoke' + (confirmId === invite.id ? ' button--critical' : '')}
                  type="button"
                  onClick={() => confirmId === invite.id ? revoke(invite) : setConfirmId(invite.id)}
                  disabled={busy}
                  aria-label={confirmId === invite.id ? 'Подтвердить отзыв ссылки' : 'Отозвать ссылку'}
                >
                  <IconTrash size={16} />
                  {confirmId === invite.id ? 'Подтвердить' : 'Отозвать'}
                </button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
