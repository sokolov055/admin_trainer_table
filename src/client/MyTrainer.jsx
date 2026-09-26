import React, { useEffect, useState } from 'react';
import { Section, Panel, Loading, ErrorState } from '../ui.jsx';
import { IconCopy, IconCheck } from '../icons.jsx';
import { haptic } from '../telegram.js';
import {
  accountState, answerRequest, pendingTrainerLink, inspectTrainerLink, joinTrainer, forgetTrainerLink,
} from '../trainer-link.js';

/**
 * Мой тренер — для тех, кто зарегистрировался сам.
 *
 * Тренера нет — здесь ID, который человек диктует тренеру, и запросы от
 * тренеров. Тренер есть — его имя. Привязка случается только нажатием:
 * тренер увидит замеры, питание и тренировки, и человек должен понимать,
 * на что соглашается, — поэтому это сказано прямо рядом с кнопкой.
 */

const CONSENT = 'Тренер увидит ваши замеры, питание, шаги и тренировки и сможет вести вашу программу.';

export default function MyTrainer({ onChanged }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    accountState()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  };
  useEffect(load, []);

  if (state.loading && !state.data) return <Loading rows={2} />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  const data = state.data;

  if (data.trainer) {
    return (
      <Section title="Мой тренер">
        <Panel pad>
          <p className="my-trainer__name">{data.trainer.name}</p>
          <p className="small muted">Тренер ведёт вашу программу и видит ваш прогресс.</p>
        </Panel>
      </Section>
    );
  }

  const changed = () => { load(); if (onChanged) onChanged(); };

  return (
    <>
      <LinkOffers requests={data.requests} onChanged={changed} />
      <Section title="Мой ID">
        <Panel pad>
          <PublicId value={data.publicId} />
          <p className="small muted">
            Тренера пока нет. Продиктуйте тренеру этот ID или откройте его ссылку —
            привязка случится, только когда вы её подтвердите.
          </p>
        </Panel>
      </Section>
    </>
  );
}

function PublicId({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      haptic('success');
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { /* буфер недоступен — ID и так на экране */ }
  };
  return (
    <div className="my-trainer__id">
      <span className="my-trainer__code">{value}</span>
      <button className="button button--ghost" onClick={copy} aria-label="Скопировать ID">
        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        {copied ? 'Скопирован' : 'Скопировать'}
      </button>
    </div>
  );
}

/**
 * Предложения стать клиентом: запросы по ID и открытая ссылка тренера.
 * Показываются и в «Моём тренере», и на обзоре — человек не должен искать
 * их по меню.
 */
export function LinkOffers({ requests = [], onChanged }) {
  const [token, setToken] = useState(pendingTrainerLink);
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    inspectTrainerLink(token)
      .then((r) => { if (alive) setInvite(r); })
      .catch((error) => {
        if (!alive) return;
        forgetTrainerLink();
        setToken('');
        setProblem(error.message);
      });
    return () => { alive = false; };
  }, [token]);

  const act = async (id, fn) => {
    setBusy(id);
    setProblem('');
    try {
      await fn();
      haptic('success');
      if (onChanged) onChanged();
    } catch (error) {
      setProblem(error.message || 'Не получилось. Попробуйте ещё раз.');
    } finally {
      setBusy(0);
    }
  };

  const offers = [
    ...(invite ? [{ id: 'link', trainerName: invite.trainerName }] : []),
    ...requests,
  ];
  if (!offers.length && !problem) return null;

  return (
    <Section title="Приглашение от тренера">
      {offers.map((offer) => (
        <Panel pad key={offer.id}>
          <p className="my-trainer__offer">
            <strong>{offer.trainerName}</strong>
            {offer.cardName
              ? <> предлагает объединить ваш кабинет с карточкой «{offer.cardName}», которую он ведёт.</>
              : ' приглашает вас стать клиентом.'}
          </p>
          <p className="small muted">
            {offer.cardName
              ? 'Ваша история тренировок, замеров и оплат из этой карточки появится здесь. Входить будете той же почтой.'
              : CONSENT}
          </p>
          <div className="survey__actions">
            <button
              className="button button--primary"
              disabled={!!busy}
              onClick={() => act(offer.id, () => (offer.id === 'link' ? joinTrainer(token) : answerRequest(offer.id, true)))}
            >
              {busy === offer.id ? 'Минуту…' : offer.cardName ? 'Объединить' : 'Привязаться'}
            </button>
            <button
              className="button button--ghost"
              disabled={!!busy}
              onClick={() => (offer.id === 'link'
                ? (forgetTrainerLink(), setToken(''), setInvite(null))
                : act(offer.id, () => answerRequest(offer.id, false)))}
            >
              {offer.id === 'link' ? 'Не сейчас' : 'Отклонить'}
            </button>
          </div>
        </Panel>
      ))}
      {problem && <p className="small muted" role="alert">{problem}</p>}
    </Section>
  );
}
