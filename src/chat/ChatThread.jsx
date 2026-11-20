import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { apiOnce, apiWait } from '../api.js';
import { haptic } from '../telegram.js';
import { IconBack, IconSend, IconClose, IconArrowDown, IconMore } from '../icons.jsx';
import {
  buildFeed, tickOf, canEdit, peerStatus, initials, timeOf, mergeOutbox, newLocalId,
  chatId, loadDraft, saveDraft, loadOutbox, saveOutbox, REACTIONS, MORE_REACTIONS, REPORT_REASONS, MUTE_OPTIONS,
} from './chat-model.js';
import './chat.css';

/**
 * Переписка тренер ↔ клиент (FT-808, макет messenger-2026-11-20, вкладка 2–3).
 *
 * Правила Telegram: 🕓 / ✓ / ✓✓, «печатает…», «в сети / был(а)», плашка
 * «Непрочитанные сообщения», кнопка ⌄ со счётчиком, ответ с цитатой
 * (смахнуть сообщение влево), долгое нажатие — реакции и меню, двойное
 * касание — 👍, черновик сохраняется, без сети сообщение ждёт с 🕓 и
 * уходит само. Живая доставка — долгий запрос chat.wait (как workout.wait).
 *
 * Сервер — server/src/lib/chat.js, api/chat-handlers.js.
 */

const LONG_PRESS = 450;
const SWIPE_REPLY = 56;
const TYPING_EVERY = 4000;

// Мимо кэша и без записи на телефон: переписка не оседает в localStorage
const send = (action, params) => apiOnce(action, params);

function Ticks({ state }) {
  if (!state) return null;
  if (state === 'pending') return <span className="chat-tick chat-tick--pending" aria-label="Отправляется">🕓</span>;
  if (state === 'failed') return <span className="chat-tick chat-tick--failed" aria-label="Не отправлено">⚠</span>;
  return (
    <span className={'chat-tick' + (state === 'read' ? ' chat-tick--read' : '')} aria-label={state === 'read' ? 'Прочитано' : 'Доставлено'}>
      <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true">
        <path d="M1 6l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {state === 'read' && <path d="M6 6l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  );
}

function Bubble({ msg, peer, tail, tick, flash, onMenu, onReply, onQuote, onReact, onRetry }) {
  const press = useRef(null);
  const start = useRef(null);
  const lastTap = useRef(0);
  const [dx, setDx] = useState(0);
  const mine = msg.from === 'me';

  const clear = () => { clearTimeout(press.current); press.current = null; };
  const down = (e) => {
    if (msg.pending || msg.failed) return;
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    clear();
    press.current = setTimeout(() => { press.current = null; start.current = null; setDx(0); haptic('medium'); onMenu(msg); }, LONG_PRESS);
  };
  const move = (e) => {
    const s = start.current;
    if (!s) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (Math.abs(x) > 8 || Math.abs(y) > 8) { s.moved = true; clear(); }
    // Смахнуть влево — «Ответить», как в Telegram
    if (!msg.deleted && x < 0 && Math.abs(x) > Math.abs(y)) setDx(Math.max(x, -SWIPE_REPLY - 20));
  };
  const up = () => {
    clear();
    const s = start.current;
    start.current = null;
    if (dx <= -SWIPE_REPLY) { haptic(); onReply(msg); }
    setDx(0);
    if (s && !s.moved && !msg.deleted) {
      const now = Date.now();
      if (now - lastTap.current < 300) { lastTap.current = 0; onReact(msg, '👍'); } else lastTap.current = now;
    }
  };

  return (
    <div className={'chat-row' + (mine ? ' chat-row--me' : '') + (tail ? ' chat-row--tail' : '') + (flash ? ' chat-row--flash' : '')} data-mid={msg.id}>
      {dx < -10 && <span className="chat-row__reply" style={{ opacity: Math.min(1, -dx / SWIPE_REPLY) }} aria-hidden="true">↩︎</span>}
      <div
        className={'chat-bubble' + (msg.deleted ? ' chat-bubble--deleted' : '') + (msg.failed ? ' chat-bubble--failed' : '')}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => { clear(); start.current = null; setDx(0); }}
        onContextMenu={(e) => { e.preventDefault(); if (!msg.pending && !msg.failed) onMenu(msg); }}
      >
        {msg.reply && (
          <button type="button" className="chat-quote" onClick={(e) => { e.stopPropagation(); if (!msg.reply.gone) onQuote(msg.reply.id); }}>
            <span className="chat-quote__who">{msg.reply.from === 'me' ? 'Вы' : peer}</span>
            <span className="chat-quote__text">{msg.reply.gone || msg.reply.deleted ? 'Сообщение удалено' : msg.reply.text}</span>
          </button>
        )}
        {msg.deleted
          ? <span className="chat-bubble__text chat-bubble__text--deleted">🚫 Сообщение удалено</span>
          : <span className="chat-bubble__text">{msg.text}</span>}
        <span className="chat-bubble__meta">
          {msg.edited && <span className="chat-bubble__edited">изменено</span>}
          <time>{timeOf(msg.at)}</time>
          <Ticks state={tick} />
        </span>
      </div>
      {msg.reactions && msg.reactions.length > 0 && (
        <div className="chat-reactions">
          {msg.reactions.map((r) => (
            <button key={r.emoji + r.mine} type="button" className={'chat-reaction' + (r.mine ? ' chat-reaction--mine' : '')}
              onClick={() => r.mine && onReact(msg, r.emoji)} aria-label={'Реакция ' + r.emoji}>
              {r.emoji}
            </button>
          ))}
        </div>
      )}
      {msg.failed && (
        <button type="button" className="chat-retry" onClick={() => onRetry(msg)}>Не отправлено · Повторить</button>
      )}
    </div>
  );
}

/** Нижний лист поверх переписки — меню, удаление, жалоба, без звука */
function Layer({ onClose, children, label }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="chat-layer" role="dialog" aria-label={label}>
      <div className="chat-layer__scrim" onClick={onClose} aria-hidden="true" />
      <div className="chat-layer__panel">{children}</div>
    </div>
  );
}

export default function ChatThread({ clientRow = null, member = '', name, onClose, role = 'client' }) {
  const id = chatId(clientRow, member);
  const base = useMemo(() => (clientRow ? { clientRow, member } : {}), [clientRow, member]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [outbox, setOutbox] = useState(() => loadOutbox(id));
  const [older, setOlder] = useState([]);
  const [more, setMore] = useState(false);
  const [text, setText] = useState(() => loadDraft(id));
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [layer, setLayer] = useState(null);
  const [allReactions, setAllReactions] = useState(false);
  const [flash, setFlash] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const [fresh, setFresh] = useState(0);
  const [note, setNote] = useState('');
  const unreadFrom = useRef(null);
  const scroller = useRef(null);
  const field = useRef(null);
  const live = useRef({ rev: null, alive: true, typedAt: 0, lastCount: 0 });
  const firstScroll = useRef(true);

  const apply = useCallback((d) => {
    if (!d || d.same) {
      if (d && d.peer) setData((prev) => (prev ? { ...prev, peer: d.peer } : prev));
      return;
    }
    live.current.rev = d.rev;
    if (unreadFrom.current === null) unreadFrom.current = d.myReadUpTo || 0;
    setData(d);
    setMore((m) => (older.length ? m : d.more));
  }, [older.length]);

  // Первая загрузка и долгий запрос изменений
  useEffect(() => {
    live.current.alive = true;
    let stop = false;
    const loop = async () => {
      try {
        apply(await send('chat.open', base));
        setError('');
      } catch (e) {
        setError(e.message || 'Не получилось открыть чат.');
      }
      while (!stop) {
        try {
          const d = await apiWait('chat.wait', { ...base, rev: live.current.rev });
          if (stop) break;
          apply(d);
          if (d && !d.same && document.visibilityState === 'visible') {
            const last = d.messages.filter((m) => m.from === 'them').at(-1);
            if (last && last.id > (d.myReadUpTo || 0)) send('chat.read', { ...base, upTo: last.id }).catch(() => {});
          }
        } catch (_) {
          if (stop) break;
          await new Promise((r) => setTimeout(r, 4000));
        }
      }
    };
    loop();
    return () => { stop = true; live.current.alive = false; };
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  // Черновик — при каждом изменении поля (не правки чужого текста)
  useEffect(() => { if (!editing) saveDraft(id, text); }, [id, text, editing]);
  useEffect(() => { saveOutbox(id, outbox); }, [id, outbox]);

  const merged = useMemo(() => {
    const page = older.concat(data ? data.messages : []);
    return mergeOutbox(page, outbox).messages;
  }, [older, data, outbox]);

  const feed = useMemo(() => buildFeed(merged, { unreadFrom: unreadFrom.current }), [merged]);
  const readUpTo = data ? data.readUpTo : 0;

  // Открыли — на первое непрочитанное, иначе вниз; пришло новое внизу — вниз
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !data) return;
    if (firstScroll.current) {
      firstScroll.current = false;
      const mark = el.querySelector('.chat-unread');
      if (mark) el.scrollTop = mark.offsetTop - 60;
      else el.scrollTop = el.scrollHeight;
      live.current.lastCount = merged.length;
      return;
    }
    if (merged.length > live.current.lastCount) {
      const added = merged.length - live.current.lastCount;
      if (atBottom || merged.at(-1)?.from === 'me') el.scrollTop = el.scrollHeight;
      else setFresh((n) => n + added);
    }
    live.current.lastCount = merged.length;
  }, [merged.length, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = async () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setFresh(0);
    if (el.scrollTop < 120 && more && !live.current.loadingOld) {
      const first = merged.find((m) => typeof m.id === 'number');
      if (!first) return;
      live.current.loadingOld = true;
      const h = el.scrollHeight;
      try {
        const page = await send('chat.open', { ...base, before: first.id });
        setOlder((o) => page.messages.concat(o));
        setMore(page.more);
        requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop += scroller.current.scrollHeight - h; });
      } catch (_) { /* подгрузим при следующей прокрутке */ }
      live.current.loadingOld = false;
    }
  };

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setFresh(0);
  };

  const jumpTo = (mid) => {
    const el = scroller.current && scroller.current.querySelector(`[data-mid="${mid}"]`);
    if (!el) { setNote('Сообщение выше — прокрутите историю.'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(mid);
    setTimeout(() => setFlash(null), 1400);
  };

  const deliver = async (item) => {
    setOutbox((o) => o.map((m) => (m.localId === item.localId ? { ...m, pending: true, failed: false } : m)));
    try {
      const r = await send('chat.send', { ...base, text: item.text, replyTo: item.replyTo || null, localId: item.localId });
      setData((d) => (d ? { ...d, messages: d.messages.some((m) => m.id === r.message.id) ? d.messages : d.messages.concat(r.message) } : d));
      setOutbox((o) => o.filter((m) => m.localId !== item.localId));
    } catch (e) {
      // Отказ сервера (ограничение, предел) — сказать; обрыв связи — ждать сети
      if (e && e.code && e.code < 500 && e.code !== 429) {
        setOutbox((o) => o.filter((m) => m.localId !== item.localId));
        setNote(e.message || 'Не отправлено.');
        return;
      }
      setOutbox((o) => o.map((m) => (m.localId === item.localId ? { ...m, pending: false, failed: true } : m)));
    }
  };

  // Сеть вернулась — отправить то, что ждёт
  useEffect(() => {
    const retry = () => outbox.filter((m) => m.failed).forEach(deliver);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    if (e) e.preventDefault();
    const body = text.trim();
    if (!body) return;
    haptic();
    if (editing) {
      const target = editing;
      setEditing(null);
      setText(loadDraft(id));
      try {
        const r = await send('chat.edit', { ...base, id: target.id, text: body });
        setData((d) => (d ? { ...d, messages: d.messages.map((m) => (m.id === r.message.id ? r.message : m)) } : d));
      } catch (err) { setNote(err.message || 'Не получилось изменить.'); }
      return;
    }
    const item = {
      localId: newLocalId(), from: 'me', text: body, at: new Date().toISOString(), pending: true,
      ...(replyTo ? { replyTo: replyTo.id, reply: { id: replyTo.id, from: replyTo.from, text: String(replyTo.text || '').slice(0, 160) } } : {}),
    };
    setText('');
    saveDraft(id, '');
    setReplyTo(null);
    setOutbox((o) => o.concat(item));
    send('chat.typing', { ...base, on: false }).catch(() => {});
    deliver(item);
    requestAnimationFrame(() => field.current && field.current.focus());
  };

  const typed = (value) => {
    setText(value);
    const now = Date.now();
    if (!editing && value.trim() && now - live.current.typedAt > TYPING_EVERY) {
      live.current.typedAt = now;
      send('chat.typing', base).catch(() => {});
    }
  };

  const react = async (msg, emoji) => {
    setMenu(null);
    setAllReactions(false);
    try {
      await send('chat.react', { ...base, id: msg.id, emoji });
      const d = await send('chat.open', { ...base, read: false });
      apply(d);
    } catch (e) { setNote(e.message || 'Не получилось.'); }
  };

  const remove = async (msg, forBoth) => {
    setLayer(null);
    try {
      await send('chat.delete', { ...base, id: msg.id, forBoth });
      setOlder((o) => o.filter((m) => m.id !== msg.id));
      apply(await send('chat.open', { ...base, read: false }));
    } catch (e) { setNote(e.message || 'Не получилось удалить.'); }
  };

  const report = async (msg, reason) => {
    setLayer(null);
    try {
      await send('chat.report', { ...base, id: msg.id, reason });
      setNote('Жалоба отправлена. Её рассмотрят в течение 24 часов.');
    } catch (e) { setNote(e.message || 'Не получилось отправить жалобу.'); }
  };

  const mute = async (hours) => {
    setLayer(null);
    try {
      await send('chat.mute', { ...base, hours });
      apply(await send('chat.open', { ...base, read: false }));
    } catch (e) { setNote(e.message || 'Не получилось.'); }
  };

  const block = async (on) => {
    setLayer(null);
    try {
      await send('chat.block', { on });
      apply(await send('chat.open', { read: false }));
      setNote(on ? 'Сообщения тренера ограничены. Он об этом не узнает из чата, владелец сервиса — узнает.' : 'Сообщения тренера снова доставляются.');
    } catch (e) { setNote(e.message || 'Не получилось.'); }
  };

  const copy = (msg) => {
    setMenu(null);
    try { navigator.clipboard.writeText(msg.text); setNote('Скопировано'); } catch (_) { /* старый браузер */ }
  };

  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(''), 3200);
    return () => clearTimeout(t);
  }, [note]);

  const peerLine = data ? peerStatus(data.peer) : '';
  const blocked = data && data.blocked;
  const trainerBlocked = blocked && role === 'trainer';

  return (
    <div className="chat" role="dialog" aria-label={'Чат: ' + name}>
      <header className="chat__head">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Назад"><IconBack size={22} /></button>
        <span className="chat-avatar chat-avatar--sm" aria-hidden="true">{initials(name)}{data?.peer?.online && <i className="chat-avatar__dot" />}</span>
        <span className="chat__who">
          <strong>{name}</strong>
          <span className={'chat__status' + (data?.peer?.typing || data?.peer?.online ? ' chat__status--live' : '')}>
            {data?.muted ? '🔕 ' : ''}{peerLine}
          </span>
        </span>
        <button type="button" className="icon-button" onClick={() => setLayer({ kind: 'chat' })} aria-label="Настройки чата"><IconMore size={22} /></button>
      </header>

      <div className="chat__scroll" ref={scroller} onScroll={onScroll}>
        {!data && !error && <p className="chat__empty">Загружаем переписку…</p>}
        {error && <p className="chat__empty">{error}</p>}
        {data && !merged.length && (
          <div className="chat__empty">
            <strong>Сообщений пока нет</strong>
            <span>{role === 'trainer' ? 'Напишите клиенту — сообщение придёт ему в приложение.' : 'Напишите тренеру: вопрос о тренировке, самочувствии или расписании.'}</span>
          </div>
        )}
        {more && <p className="chat__more">Листайте вверх — загрузим ещё</p>}
        {feed.map((item) => {
          if (item.kind === 'day') return <div key={item.key} className="chat-day"><span>{item.label}</span></div>;
          if (item.kind === 'unread') return <div key={item.key} className="chat-unread"><span>Непрочитанные сообщения</span></div>;
          const m = item.msg;
          return (
            <Bubble key={item.key} msg={m} peer={name} tail={item.tail} tick={tickOf(m, readUpTo)} flash={flash === m.id}
              onMenu={setMenu} onReply={(x) => { setEditing(null); setReplyTo(x); field.current && field.current.focus(); }}
              onQuote={jumpTo} onReact={react} onRetry={deliver} />
          );
        })}
      </div>

      {!atBottom && (
        <button type="button" className="chat__down" onClick={toBottom} aria-label="Вниз">
          <IconArrowDown size={20} />
          {fresh > 0 && <span className="chat-badge">{fresh}</span>}
        </button>
      )}

      {note && <div className="chat__note" role="status">{note}</div>}

      <form className="chat__compose" onSubmit={submit}>
        {(replyTo || editing) && (
          <div className="chat__context">
            <span className="chat__context-bar" aria-hidden="true" />
            <span className="chat__context-text">
              <strong>{editing ? 'Изменить' : 'Ответ ' + (replyTo.from === 'me' ? 'себе' : name)}</strong>
              <span>{(editing || replyTo).text}</span>
            </span>
            <button type="button" className="icon-button" aria-label="Отменить"
              onClick={() => { if (editing) { setEditing(null); setText(loadDraft(id)); } setReplyTo(null); }}>
              <IconClose size={18} />
            </button>
          </div>
        )}
        {trainerBlocked
          ? <p className="chat__blocked">Клиент ограничил сообщения. Новые сообщения не доставляются.</p>
          : (
            <div className="chat__row">
              <textarea
                ref={field}
                className="chat__field"
                rows={1}
                value={text}
                placeholder="Сообщение"
                aria-label="Сообщение"
                maxLength={4000}
                onChange={(e) => typed(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) submit(e); }}
              />
              <button type="submit" className="chat__send" disabled={!text.trim()} aria-label={editing ? 'Сохранить' : 'Отправить'}>
                <IconSend size={20} />
              </button>
            </div>
          )}
      </form>

      {menu && (
        <Layer label="Действия с сообщением" onClose={() => { setMenu(null); setAllReactions(false); }}>
          {!menu.deleted && (
            <div className="chat-menu__reactions">
              {(allReactions ? REACTIONS.concat(MORE_REACTIONS) : REACTIONS).map((e) => (
                <button key={e} type="button" onClick={() => react(menu, e)} aria-label={'Реакция ' + e}>{e}</button>
              ))}
              {!allReactions && <button type="button" onClick={() => setAllReactions(true)} aria-label="Ещё реакции">⌄</button>}
            </div>
          )}
          <p className="chat-menu__preview">{menu.deleted ? 'Сообщение удалено' : menu.text}</p>
          <div className="chat-menu__list">
            {!menu.deleted && <button type="button" onClick={() => { setReplyTo(menu); setEditing(null); setMenu(null); field.current && field.current.focus(); }}>↩︎ Ответить</button>}
            {!menu.deleted && <button type="button" onClick={() => copy(menu)}>📋 Скопировать</button>}
            {canEdit(menu, new Date(), data?.editHours) && (
              <button type="button" onClick={() => { setEditing(menu); setReplyTo(null); setText(menu.text); setMenu(null); field.current && field.current.focus(); }}>✏️ Изменить</button>
            )}
            <button type="button" className="chat-menu__danger" onClick={() => { setLayer({ kind: 'delete', msg: menu }); setMenu(null); }}>
              🗑 {menu.from === 'me' ? 'Удалить' : 'Удалить у себя'}
            </button>
            {menu.from === 'them' && !menu.deleted && (
              <button type="button" className="chat-menu__danger" onClick={() => { setLayer({ kind: 'report', msg: menu }); setMenu(null); }}>⚠️ Пожаловаться</button>
            )}
            {menu.from === 'me' && typeof menu.id === 'number' && (
              <p className="chat-menu__info">{menu.id <= readUpTo ? '✓✓ Прочитано' : '✓ Доставлено, не прочитано'}</p>
            )}
          </div>
        </Layer>
      )}

      {layer && layer.kind === 'delete' && <DeleteLayer msg={layer.msg} name={name} onClose={() => setLayer(null)} onDelete={remove} />}

      {layer && layer.kind === 'report' && (
        <Layer label="Пожаловаться" onClose={() => setLayer(null)}>
          <h2 className="chat-layer__title">Пожаловаться на сообщение</h2>
          <p className="chat-layer__text">Жалобу рассмотрит владелец сервиса в течение 24 часов. Он увидит только это сообщение.</p>
          <div className="chat-menu__list">
            {REPORT_REASONS.map((r) => <button key={r.value} type="button" onClick={() => report(layer.msg, r.value)}>{r.label}</button>)}
          </div>
        </Layer>
      )}

      {layer && layer.kind === 'chat' && (
        <Layer label="Настройки чата" onClose={() => setLayer(null)}>
          <h2 className="chat-layer__title">{name}</h2>
          <div className="chat-menu__list">
            {data?.muted
              ? <button type="button" onClick={() => mute(0)}>🔔 Включить звук</button>
              : MUTE_OPTIONS.map((o) => <button key={o.hours} type="button" onClick={() => mute(o.hours)}>🔕 Без звука {o.label.toLowerCase()}</button>)}
            {role === 'client' && (blocked
              ? <button type="button" onClick={() => block(false)}>✅ Снять ограничение</button>
              : <button type="button" className="chat-menu__danger" onClick={() => setLayer({ kind: 'block' })}>⛔ Ограничить сообщения тренера</button>)}
          </div>
        </Layer>
      )}

      {layer && layer.kind === 'block' && (
        <Layer label="Ограничить сообщения" onClose={() => setLayer(null)}>
          <h2 className="chat-layer__title">Ограничить сообщения тренера?</h2>
          <p className="chat-layer__text">Новые сообщения тренера перестанут приходить. Владелец сервиса получит уведомление и разберётся. Снять ограничение можно здесь же.</p>
          <div className="chat-layer__actions">
            <button type="button" className="button button--critical" onClick={() => block(true)}>Ограничить</button>
            <button type="button" className="button button--ghost" onClick={() => setLayer(null)}>Отмена</button>
          </div>
        </Layer>
      )}
    </div>
  );
}

function DeleteLayer({ msg, name, onClose, onDelete }) {
  const [both, setBoth] = useState(true);
  const mine = msg.from === 'me' && !msg.deleted;
  return (
    <Layer label="Удалить сообщение" onClose={onClose}>
      <h2 className="chat-layer__title">Удалить сообщение?</h2>
      {mine && (
        <label className="chat-layer__check">
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
          <span>Также удалить для {name}<small>У собеседника останется «Сообщение удалено»</small></span>
        </label>
      )}
      <div className="chat-layer__actions">
        <button type="button" className="button button--critical" onClick={() => onDelete(msg, mine && both)}>Удалить</button>
        <button type="button" className="button button--ghost" onClick={onClose}>Отмена</button>
      </div>
    </Layer>
  );
}
