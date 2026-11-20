import React, { useEffect, useState } from 'react';
import { apiOnce } from '../api.js';
import { Section, Panel, Empty, Loading, ErrorState, formatWhen } from '../ui.jsx';
import './chat.css';

/**
 * «Управление → Тренеры и тарифы → Жалобы» (FT-808). Правило App Store 1.2:
 * на жалобу реагировать в течение 24 часов. Владелец видит только
 * сообщение, на которое пожаловались; каждый просмотр сервер пишет в журнал
 * (chat_report_views). После решения текст из жалобы стирается.
 */
export default function ChatReports() {
  const [state, setState] = useState({ loading: true, list: [], error: null });
  const [busy, setBusy] = useState(0);
  const load = () => apiOnce('chat.reports', {})
    .then((d) => setState({ loading: false, list: d.reports || [], error: null }))
    .catch((error) => setState({ loading: false, list: [], error }));
  useEffect(() => { load(); }, []);

  const handle = async (id, outcome) => {
    setBusy(id);
    try { await apiOnce('chat.report.handle', { id, outcome }); await load(); } finally { setBusy(0); }
  };

  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  const open = state.list.filter((r) => !r.handledAt);
  const done = state.list.filter((r) => r.handledAt);
  return (
    <>
      <Section title="Жалобы на сообщения" note="ответить в течение 24 часов — правило App Store 1.2">
        {!open.length && <Empty title="Новых жалоб нет" text="Жалоба придёт сюда, письмом и уведомлением." />}
        {open.map((r) => (
          <Panel pad key={r.id} className="chat-report">
            <p className="chat-report__meta">{formatWhen(r.at)} · {r.reason} · пожаловался {r.by}</p>
            <p className="chat-report__who">Клиент: {r.client || '—'} · тренер: {r.trainer || '—'}</p>
            <blockquote className="chat-report__text">{r.text || 'Текст недоступен'}</blockquote>
            <div className="chat-layer__actions">
              <button type="button" className="button button--critical" disabled={busy === r.id} onClick={() => handle(r.id, 'removed')}>Удалить сообщение</button>
              <button type="button" className="button button--ghost" disabled={busy === r.id} onClick={() => handle(r.id, 'kept')}>Оставить</button>
            </div>
          </Panel>
        ))}
      </Section>
      {done.length > 0 && (
        <Section title="Рассмотренные">
          {done.map((r) => (
            <Panel pad key={r.id} className="chat-report chat-report--done">
              <p className="chat-report__meta">{formatWhen(r.at)} · {r.reason} · {r.outcome === 'removed' ? 'сообщение удалено' : 'оставлено'}</p>
              <p className="chat-report__who">Клиент: {r.client || '—'} · тренер: {r.trainer || '—'}</p>
            </Panel>
          ))}
        </Section>
      )}
    </>
  );
}
