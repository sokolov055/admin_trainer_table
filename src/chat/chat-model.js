/**
 * Мессенджер (FT-808) — чистые функции без React: подписи времени и
 * статуса, разбивка по дням, галочки, черновики и очередь без сети.
 * Проверяются scripts/test-chat.mjs.
 */

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function timeOf(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Разделитель дней: «Сегодня», «Вчера», «19 ноября», другой год — с годом */
export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === today) return 'Сегодня';
  if (dayKey(d) === dayKey(y)) return 'Вчера';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

/** Время в списке чатов, как в Telegram: сегодня — 12:40, неделя — «пн», раньше — 12.11 */
export function listTime(iso, now = new Date()) {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return timeOf(iso);
  const days = (now - d) / 86400000;
  if (days < 6) return WEEKDAYS[d.getDay()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}${d.getFullYear() !== now.getFullYear() ? '.' + String(d.getFullYear()).slice(2) : ''}`;
}

/** Строка под именем: печатает… / в сети / был(а) в 12:40 / был(а) недавно */
export function peerStatus(peer, now = new Date()) {
  if (!peer) return '';
  if (peer.typing) return 'печатает…';
  if (peer.online) return 'в сети';
  if (!peer.seenAt) return 'был(а) недавно';
  const d = new Date(peer.seenAt);
  if (dayKey(d) === dayKey(now)) return `был(а) в ${timeOf(peer.seenAt)}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return `был(а) вчера в ${timeOf(peer.seenAt)}`;
  if ((now - d) / 86400000 < 30) return `был(а) ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  return 'был(а) давно';
}

/**
 * Лента: разделители дней, «Непрочитанные сообщения» перед первым чужим
 * непрочитанным и признак «подряд от того же» (хвостик только у последнего).
 */
export function buildFeed(messages, { myReadUpTo = 0, unreadFrom = null, now = new Date() } = {}) {
  const out = [];
  let lastDay = '';
  let unreadPut = false;
  const from = unreadFrom === null ? myReadUpTo : unreadFrom;
  messages.forEach((m, i) => {
    const day = dayKey(new Date(m.at));
    if (day !== lastDay) {
      out.push({ kind: 'day', key: 'd' + day, label: dayLabel(m.at, now) });
      lastDay = day;
    }
    if (!unreadPut && from !== null && m.from === 'them' && typeof m.id === 'number' && m.id > from) {
      out.push({ kind: 'unread', key: 'unread' });
      unreadPut = true;
    }
    const next = messages[i + 1];
    const tail = !next || next.from !== m.from || dayKey(new Date(next.at)) !== day
      || new Date(next.at) - new Date(m.at) > 5 * 60 * 1000;
    out.push({ kind: 'msg', key: 'm' + (m.id || m.localId), msg: m, tail });
  });
  return out;
}

/** Галочки своего: pending 🕓, failed ⚠, sent ✓, read ✓✓ */
export function tickOf(m, readUpTo) {
  if (m.from !== 'me') return null;
  if (m.failed) return 'failed';
  if (m.pending) return 'pending';
  return typeof m.id === 'number' && m.id <= readUpTo ? 'read' : 'sent';
}

export const EDIT_HOURS = 48;

export function canEdit(m, now = new Date(), hours = EDIT_HOURS) {
  return m.from === 'me' && !m.deleted && !m.pending && !m.failed && typeof m.id === 'number'
    && now - new Date(m.at) < hours * 3600 * 1000;
}

/* ---------- список: фильтры-папки (этап 2) ---------- */

/** Чаты под фильтром: «Все» — без архива; архив — отдельной папкой */
export function filterChats(chats, filter = 'all', query = '') {
  const q = String(query || '').trim().toLowerCase().replace(/ё/g, 'е');
  const named = (c) => !q || String(c.name || '').toLowerCase().replace(/ё/g, 'е').includes(q);
  return chats.filter((c) => {
    if (!named(c)) return false;
    if (filter === 'archive') return !!c.archived;
    if (c.archived) return false;
    if (filter === 'unread') return c.unread > 0;
    if (filter === 'today') return !!c.today;
    return true;
  });
}

export function chatFilters(chats) {
  const live = chats.filter((c) => !c.archived);
  const unread = live.filter((c) => c.unread > 0).length;
  const today = live.filter((c) => c.today).length;
  const archived = chats.length - live.length;
  return [
    { value: 'all', label: 'Все' },
    { value: 'unread', label: unread ? `Непрочитанные ${unread}` : 'Непрочитанные' },
    ...(today ? [{ value: 'today', label: `Сегодня тренировка ${today}` }] : []),
    ...(archived ? [{ value: 'archive', label: `Архив ${archived}` }] : []),
  ];
}

/** Подсветка найденного: [до, найденное, после] */
export function splitHit(text, query) {
  const t = String(text || '');
  const q = String(query || '').trim();
  if (!q) return [t, '', ''];
  const at = t.toLowerCase().replace(/ё/g, 'е').indexOf(q.toLowerCase().replace(/ё/g, 'е'));
  if (at < 0) return [t, '', ''];
  return [t.slice(0, at), t.slice(at, at + q.length), t.slice(at + q.length)];
}

/** Превью в строке списка */
export function previewOf(last) {
  if (!last) return '';
  const text = last.deleted ? 'Сообщение удалено' : String(last.text || '').replace(/\s+/g, ' ');
  return (last.from === 'me' ? 'Вы: ' : '') + text;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/** Слить пришедшую страницу с тем, что ждёт отправки (pending/failed) */
export function mergeOutbox(messages, outbox) {
  const sent = new Set(messages.map((m) => m.localId).filter(Boolean));
  const waiting = outbox.filter((o) => !sent.has(o.localId));
  return { messages: messages.concat(waiting), outbox: waiting };
}

export function newLocalId() {
  return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- черновики и очередь: localStorage, по чату ---------- */

const store = (() => {
  try { return window.localStorage; } catch (_) { return null; }
})();

export const chatId = (clientRow, member = '') => (clientRow ? `t${clientRow}${member ? '#' + member : ''}` : 'mine');

export function loadDraft(id) {
  try { return store ? store.getItem('fit:chat-draft:' + id) || '' : ''; } catch (_) { return ''; }
}

export function saveDraft(id, text) {
  try {
    if (!store) return;
    if (String(text || '').trim()) store.setItem('fit:chat-draft:' + id, text);
    else store.removeItem('fit:chat-draft:' + id);
  } catch (_) { /* место кончилось — черновик не главное */ }
}

export function loadOutbox(id) {
  try {
    const list = JSON.parse((store && store.getItem('fit:chat-outbox:' + id)) || '[]');
    return Array.isArray(list) ? list.map((m) => ({ ...m, pending: false, failed: true })) : [];
  } catch (_) { return []; }
}

export function saveOutbox(id, list) {
  try {
    if (!store) return;
    if (list.length) store.setItem('fit:chat-outbox:' + id, JSON.stringify(list.map(({ localId, text, at, reply, replyTo }) => ({ localId, text, at, reply, replyTo, from: 'me' }))));
    else store.removeItem('fit:chat-outbox:' + id);
  } catch (_) { /* не страшно */ }
}

export const REACTIONS = ['👍', '❤️', '🔥', '💪', '😂', '😮', '🙏'];
export const MORE_REACTIONS = ['👏', '🎉', '😢', '🤔', '👌'];
export const REPORT_REASONS = [
  { value: 'spam', label: 'Спам' },
  { value: 'abuse', label: 'Оскорбления' },
  { value: 'inappropriate', label: 'Неприемлемое' },
  { value: 'other', label: 'Другое' },
];
export const QUIET_DEFAULT = { quietFrom: '22:00', quietTo: '08:00' };
export const MAX_FORWARD = 20;

export const MUTE_OPTIONS = [
  { hours: 1, label: 'На 1 час' },
  { hours: 8, label: 'На 8 часов' },
  { hours: 48, label: 'На 2 дня' },
  { hours: 'forever', label: 'Навсегда' },
];
