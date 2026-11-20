import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiOnce, apiWait } from '../api.js';
import { haptic } from '../telegram.js';
import { Chips, Search } from '../ui.jsx';
import { lazyPage, Deferred } from '../lazy.js';
import { listTime, previewOf, initials, filterChats, chatFilters, splitHit, loadDraft, chatId } from './chat-model.js';
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
  const [state, setState] = useState({ enabled: false, chats: [], unread: 0, prefs: null, ready: false });
  const [open, setOpen] = useState(null);
  const loader = useRef(() => {});
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
    loader.current = load;
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

  const reload = useCallback(() => loader.current(), []);
  useEffect(() => {
    if (!state.note) return undefined;
    const t = setTimeout(() => setState((st) => ({ ...st, note: '' })), 3200);
    return () => clearTimeout(t);
  }, [state.note]);
  // Действие со строкой (закреп, архив, без звука, прочитано) — и перечитать список
  const act = useCallback(async (action, c, extra = {}) => {
    haptic();
    const target = c.clientRow ? { clientRow: c.clientRow, member: c.member || '' } : {};
    try { await apiOnce(action, { ...target, ...extra }); } catch (e) { setState((st) => ({ ...st, note: e.message || 'Не получилось.' })); }
    reload();
  }, [reload]);
  const setPrefs = useCallback(async (change) => {
    const r = await apiOnce('chat.prefs', change);
    setState((st) => ({ ...st, prefs: r.prefs }));
    return r.prefs;
  }, []);
  return { ...state, open, setOpen, reload, act, setPrefs };
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
            key={(inbox.open.clientRow || 'mine') + '#' + (inbox.open.member || '') + '#' + (inbox.open.jump || '')}
            role={role}
            clientRow={inbox.open.clientRow || null}
            member={inbox.open.member || ''}
            name={inbox.open.name || 'Чат'}
            jump={inbox.open.jump || null}
            onClose={() => { haptic(); inbox.setOpen(null); inbox.reload(); }}
          />
        </Deferred>
      )}
    </Inbox.Provider>
  );
}

const NO_INBOX = { enabled: false, chats: [], unread: 0, prefs: null, setOpen: () => {}, reload: () => {}, act: () => {}, setPrefs: async () => null };
export const useChatInbox = () => useContext(Inbox) || NO_INBOX;

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
  const draft = loadDraft(chatId(c.clientRow || null, c.member || ''));
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
            {c.peer && c.peer.typing
              ? 'печатает…'
              : draft ? <><span className="chat-line__draft">Черновик:</span> {draft.replace(/\s+/g, ' ')}</>
                : last ? previewOf(last) : 'Нет сообщений'}
          </span>
          {c.unread > 0
            ? <span className={'chat-badge' + (c.muted ? ' chat-badge--muted' : '')}>{c.unread}</span>
            : c.pinned && <span className="chat-line__pin" aria-label="Закреплён">📌</span>}
        </span>
      </span>
    </button>
  );
}

const SWIPE_LEFT = 216;
const SWIPE_RIGHT = 88;

/**
 * Строка со свайпами, как в Telegram: влево — «Прочитано», «Закрепить»,
 * «Без звука»; вправо до конца — «В архив» (в архиве — «Вернуть»).
 */
function SwipeLine({ c, inbox, children }) {
  const [dx, setDx] = useState(0);
  const [held, setHeld] = useState(false);
  const start = useRef(null);
  const moved = useRef(false);
  const down = (e) => { start.current = { x: e.clientX - dx, y: e.clientY, lock: null }; moved.current = false; };
  const move = (e) => {
    const s0 = start.current;
    if (!s0) return;
    const x = e.clientX - s0.x;
    const y = e.clientY - start.current.y;
    if (!s0.lock && (Math.abs(x) > 8 || Math.abs(y) > 8)) s0.lock = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
    if (s0.lock !== 'x') return;
    moved.current = true;
    setHeld(true);
    setDx(Math.max(-SWIPE_LEFT - 24, Math.min(SWIPE_RIGHT + 24, x)));
  };
  const up = () => {
    const s0 = start.current;
    start.current = null;
    setHeld(false);
    if (!s0 || s0.lock !== 'x') return;
    if (dx >= SWIPE_RIGHT) { setDx(0); inbox.act('chat.archive', c, { on: !c.archived }); return; }
    setDx(dx < -SWIPE_LEFT / 2 ? -SWIPE_LEFT : 0);
  };
  const close = () => setDx(0);
  const actionsOpen = dx <= -SWIPE_LEFT;
  return (
    <div className="chat-swipe">
      <div className="chat-swipe__right" style={{ opacity: dx > 10 ? 1 : 0 }} aria-hidden={dx <= 10}>
        <span>{c.archived ? '↩︎ Вернуть' : '🗄 В архив'}</span>
      </div>
      <div className="chat-swipe__left" style={{ visibility: dx < -10 ? 'visible' : 'hidden' }}>
        <button type="button" className="chat-swipe__btn chat-swipe__btn--read" tabIndex={actionsOpen ? 0 : -1}
          onClick={() => { close(); inbox.act('chat.read', c); }}>✓<span>Прочитано</span></button>
        <button type="button" className="chat-swipe__btn chat-swipe__btn--pin" tabIndex={actionsOpen ? 0 : -1}
          onClick={() => { close(); inbox.act('chat.pin', c, { on: !c.pinned }); }}>📌<span>{c.pinned ? 'Открепить' : 'Закрепить'}</span></button>
        <button type="button" className="chat-swipe__btn chat-swipe__btn--mute" tabIndex={actionsOpen ? 0 : -1}
          onClick={() => { close(); inbox.act('chat.mute', c, { hours: c.muted ? 0 : 'forever' }); }}>{c.muted ? '🔔' : '🔕'}<span>{c.muted ? 'Со звуком' : 'Без звука'}</span></button>
      </div>
      <div
        className={'chat-swipe__content' + (held ? ' chat-swipe__content--held' : '')}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => { start.current = null; setHeld(false); setDx(0); }}
        onClickCapture={(e) => {
          // Клик сразу после смахивания — не открывать чат; по открытой строке — закрыть кнопки
          if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; return; }
          if (dx) { e.stopPropagation(); e.preventDefault(); close(); }
        }}
      >
        {children}
      </div>
    </div>
  );
}

function useMessageSearch(query) {
  const [hits, setHits] = useState([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return undefined; }
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiOnce('chat.search', { q });
        if (!stop) setHits(r.hits || []);
      } catch (_) { if (!stop) setHits([]); }
    }, 300);
    return () => { stop = true; clearTimeout(t); };
  }, [query]);
  return hits;
}

/** Тренер: вкладка «Чаты» */
export function TrainerChats() {
  const inbox = useChatInbox();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const filters = useMemo(() => chatFilters(inbox.chats), [inbox.chats]);
  const active = filters.some((f) => f.value === filter) ? filter : 'all';
  const list = useMemo(() => filterChats(inbox.chats, active, query), [inbox.chats, active, query]);
  const hits = useMessageSearch(query);
  const names = useMemo(() => Object.fromEntries(inbox.chats.map((c) => [c.clientRow + '#' + c.member, c.name])), [inbox.chats]);

  if (inbox.ready && !inbox.enabled) {
    return <div className="chat-empty-tab"><strong>Чаты скоро появятся</strong><span>Сервер ещё не готов к переписке.</span></div>;
  }
  const empty = {
    unread: ['Всё прочитано', 'Новых сообщений нет.'],
    today: ['Сегодня занятий нет', 'Здесь будут чаты клиентов, у которых сегодня тренировка.'],
    archive: ['Архив пуст', 'Смахните чат вправо, чтобы убрать его сюда.'],
  }[active] || ['Пока пусто', 'Здесь появятся переписки с вашими клиентами.'];
  return (
    <div className="chat-list">
      <Search value={query} onChange={setQuery} placeholder="Поиск по клиентам и сообщениям" />
      <Chips items={filters} value={active} onChange={setFilter} label="Фильтр чатов" />
      {active === 'archive' && <p className="chat-list__hint">Клиенты, которых вы больше не ведёте, попадают сюда сами. Переписка сохраняется.</p>}
      {!inbox.ready && <p className="chat__empty">Загружаем…</p>}
      {inbox.ready && !list.length && !hits.length && (
        <div className="chat-empty-tab">
          <strong>{query.trim() ? 'Ничего не нашли' : empty[0]}</strong>
          <span>{query.trim() ? 'Попробуйте другое слово.' : empty[1]}</span>
        </div>
      )}
      <div className="chat-list__rows">
        {list.map((c) => (
          <SwipeLine key={c.clientRow + '#' + c.member} c={c} inbox={inbox}>
            <ChatLine c={c} title={c.name}
              onOpen={() => { haptic(); inbox.setOpen({ clientRow: c.clientRow, member: c.member, name: c.name }); }} />
          </SwipeLine>
        ))}
      </div>
      {hits.length > 0 && (
        <>
          <h3 className="chat-list__section">Сообщения</h3>
          <div className="chat-list__rows">
            {hits.map((x) => {
              const name = names[x.clientRow + '#' + x.member] || 'Клиент';
              const [a, b, z] = splitHit(x.text, query);
              return (
                <button key={x.id} type="button" className="chat-line"
                  onClick={() => { haptic(); inbox.setOpen({ clientRow: x.clientRow, member: x.member, name, jump: x.id }); }}>
                  <Avatar name={name} />
                  <span className="chat-line__body">
                    <span className="chat-line__top">
                      <strong className="chat-line__name">{name}</strong>
                      <span className="chat-line__time">{listTime(x.at)}</span>
                    </span>
                    <span className="chat-line__bottom">
                      <span className="chat-line__preview">{x.from === 'me' ? 'Вы: ' : ''}{a}<mark className="chat-hit">{b}</mark>{z}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {inbox.note && <p className="chat-list__hint" role="status">{inbox.note}</p>}
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

