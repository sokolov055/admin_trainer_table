import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiOnce, apiWait } from '../api.js';
import { haptic } from '../telegram.js';
import { Chips, Search } from '../ui.jsx';
import { lazyPage, Deferred } from '../lazy.js';
import { listTime, previewOf, initials } from './chat-model.js';
import './chat.css';

const ChatThread = lazyPage(() => import('./ChatThread.jsx'));

/**
 * Список чатов и значок непрочитанных (FT-808, макет messenger-2026-11-20,
 * вкладка 1). У тренера — вкладка «Чаты»: клиенты, последнее сообщение,
 * время, ✓✓, счётчик (серый, если без звука), «печатает…», точка «в сети».
 * У клиента — 💬 в шапке и карточка тренера на «Обзоре».
 *
 * Данные одни на всё приложение (ChatInbox): список + долгий запрос
 * chat.wait { scope: 'list' }, чтобы значок и список жили сами.
 */

const Inbox = createContext(null);

function useInboxState(enabled) {
  const [state, setState] = useState({ enabled: false, chats: [], unread: 0, ready: false });
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let stop = false;
    const load = async () => {
      try {
        const d = await apiOnce('chat.list', {});
        if (!stop) setState({ ...d, ready: true });
        return d.enabled;
      } catch (_) { return false; }
    };
    (async () => {
      if (!(await load())) return;
      while (!stop) {
        try {
          const r = await apiWait('chat.wait', { scope: 'list' });
          if (stop) break;
          if (r && r.changed) await load();
        } catch (_) {
          if (stop) break;
          await new Promise((res) => setTimeout(res, 8000));
        }
      }
    })();
    // Вернулись в приложение — перечитать сразу
    const doc = typeof document !== 'undefined' ? document : null;
    const wake = () => { if (doc && doc.visibilityState === 'visible') load(); };
    if (doc) doc.addEventListener('visibilitychange', wake);
    return () => { stop = true; if (doc) doc.removeEventListener('visibilitychange', wake); };
  }, [enabled]);

  // Пуш «Новое сообщение» ведёт сюда: ?tab=chat (клиент), ?tab=chats&client=N (тренер)
  useEffect(() => {
    if (!enabled || !state.ready) return;
    if (typeof window === 'undefined' || !window.location) return;
    const q = new URLSearchParams(window.location.search);
    const tab = q.get('tab');
    if (tab !== 'chat' && tab !== 'chats') return;
    const row = Number(q.get('client')) || null;
    const c = row ? state.chats.find((x) => x.clientRow === row) : state.chats[0];
    if (c) setOpen(row ? { clientRow: row, member: c.member || '', name: c.name } : { name: c.trainerName });
    q.delete('tab'); q.delete('client');
    const rest = q.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash);
  }, [enabled, state.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, open, setOpen };
}

/** Обёртка роли: держит список и открытую переписку поверх всего */
export function ChatInbox({ enabled = true, role, children }) {
  const inbox = useInboxState(enabled);
  return (
    <Inbox.Provider value={inbox}>
      {children}
      {inbox.open && (
        <Deferred>
          <ChatThread
            role={role}
            clientRow={inbox.open.clientRow || null}
            member={inbox.open.member || ''}
            name={inbox.open.name || 'Чат'}
            onClose={() => { haptic(); inbox.setOpen(null); }}
          />
        </Deferred>
      )}
    </Inbox.Provider>
  );
}

export const useChatInbox = () => useContext(Inbox) || { enabled: false, chats: [], unread: 0, setOpen: () => {} };

function Avatar({ name, online }) {
  return (
    <span className="chat-avatar" aria-hidden="true">
      {initials(name)}
      {online && <i className="chat-avatar__dot" />}
    </span>
  );
}

function ChatLine({ c, title, who = title, onOpen }) {
  const last = c.last;
  return (
    <button type="button" className="chat-line" onClick={onOpen}>
      <Avatar name={who} online={c.peer && c.peer.online} />
      <span className="chat-line__body">
        <span className="chat-line__top">
          <strong className="chat-line__name">{title}{c.muted && <span className="chat-line__muted" aria-label="Без звука"> 🔕</span>}</strong>
          {last && (
            <span className="chat-line__time">
              {last.from === 'me' && <span className={'chat-line__tick' + (last.read ? ' chat-line__tick--read' : '')}>{last.read ? '✓✓' : '✓'}</span>}
              {listTime(last.at)}
            </span>
          )}
        </span>
        <span className="chat-line__bottom">
          <span className={'chat-line__preview' + (c.peer && c.peer.typing ? ' chat-line__preview--live' : '')}>
            {c.peer && c.peer.typing ? 'печатает…' : last ? previewOf(last) : 'Нет сообщений'}
          </span>
          {c.unread > 0 && <span className={'chat-badge' + (c.muted ? ' chat-badge--muted' : '')}>{c.unread}</span>}
        </span>
      </span>
    </button>
  );
}

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'unread', label: 'Непрочитанные' },
];

/** Тренер: вкладка «Чаты» */
export function TrainerChats() {
  const inbox = useChatInbox();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const unreadChats = inbox.chats.filter((c) => c.unread > 0).length;
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inbox.chats.filter((c) => (filter !== 'unread' || c.unread > 0)
      && (!q || String(c.name).toLowerCase().includes(q) || (c.last && String(c.last.text || '').toLowerCase().includes(q))));
  }, [inbox.chats, query, filter]);

  if (inbox.ready && !inbox.enabled) {
    return <div className="chat-empty-tab"><strong>Чаты скоро появятся</strong><span>Сервер ещё не готов к переписке.</span></div>;
  }
  return (
    <div className="chat-list">
      <Search value={query} onChange={setQuery} placeholder="Поиск по клиентам и сообщениям" />
      <Chips items={FILTERS.map((f) => (f.value === 'unread' && unreadChats ? { ...f, label: `${f.label} ${unreadChats}` } : f))}
        value={filter} onChange={setFilter} label="Фильтр чатов" />
      {!inbox.ready && <p className="chat__empty">Загружаем…</p>}
      {inbox.ready && !list.length && (
        <div className="chat-empty-tab">
          <strong>{filter === 'unread' ? 'Всё прочитано' : 'Пока пусто'}</strong>
          <span>{filter === 'unread' ? 'Новых сообщений нет.' : 'Здесь появятся переписки с вашими клиентами.'}</span>
        </div>
      )}
      <div className="chat-list__rows">
        {list.map((c) => (
          <ChatLine key={c.clientRow + '#' + c.member} c={c} title={c.name}
            onOpen={() => { haptic(); inbox.setOpen({ clientRow: c.clientRow, member: c.member, name: c.name }); }} />
        ))}
      </div>
    </div>
  );
}

/** Клиент: 💬 в шапке со счётчиком */
export function ChatButton() {
  const inbox = useChatInbox();
  const chat = inbox.chats[0];
  if (!inbox.enabled || !chat) return null;
  return (
    <button type="button" className="icon-button chat-entry" aria-label={inbox.unread ? `Чат с тренером, непрочитанных: ${inbox.unread}` : 'Чат с тренером'}
      onClick={() => { haptic(); inbox.setOpen({ name: chat.trainerName }); }}>
      <ChatGlyph />
      {inbox.unread > 0 && <span className="chat-badge chat-entry__badge">{inbox.unread}</span>}
    </button>
  );
}

/** Клиент: карточка тренера на «Обзоре» — последнее сообщение и счётчик */
export function TrainerChatCard() {
  const inbox = useChatInbox();
  const chat = inbox.chats[0];
  if (!inbox.enabled || !chat) return null;
  return (
    <div className="chat-card">
      <ChatLine c={chat} title={`${chat.trainerName} — ваш тренер`} who={chat.trainerName} onOpen={() => { haptic(); inbox.setOpen({ name: chat.trainerName }); }} />
    </div>
  );
}

export function ChatGlyph({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12.2c0 4.2-3.6 7.3-8 7.3-1.1 0-2.2-.2-3.1-.6L4 20l1.3-3.7C4.5 15.1 4 13.7 4 12.2 4 8 7.6 4.8 12 4.8s8 3.2 8 7.4Z" />
    </svg>
  );
}

/** Значок вкладки «Чаты» — как остальные иконки таб-бара */
export const IconChats = ({ size = 21 }) => <ChatGlyph size={size} />;

/** Счётчик для вкладки: число или ничего */
export function useChatBadge() {
  const inbox = useChatInbox();
  return inbox.enabled ? inbox.unread : 0;
}

