/**
 * Демо-переписка (FT-808) для сборки с VITE_MOCK=1 и браузерных проверок.
 * Один чат «Анна К. ↔ Константин»; роль — из mockRole. Сервер настоящий —
 * server/src/lib/chat.js; здесь только то, что нужно экрану.
 */

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

let seq = 6;
let messages = [
  { id: 1, sender: 'trainer', text: 'Как колено после вчерашнего?', at: ago(60 * 26) },
  { id: 2, sender: 'client', text: 'Колено ок, но последние два подхода тяжело', at: ago(60 * 25), edited: true },
  { id: 3, sender: 'trainer', text: 'Супер! В следующий раз жим ногами оставим 120, добавим повтор 👍', at: ago(50), replyTo: 2, reactClient: '🔥' },
  { id: 4, sender: 'trainer', text: '', at: ago(45), deleted: true },
  { id: 5, sender: 'trainer', text: 'Завтра не забудь резинку для ягодичного 😉', at: ago(40) },
];
const read = { client: 3, trainer: 5 };
let rev = 1;
let muted = { client: null, trainer: null };
let blocked = false;

const sideOf = (p) => (p.__role === 'trainer' ? 'trainer' : 'client');

function shape(m, side) {
  const q = m.replyTo ? messages.find((x) => x.id === m.replyTo) : null;
  const reactions = [];
  if (m.reactClient) reactions.push({ emoji: m.reactClient, mine: side === 'client' });
  if (m.reactTrainer) reactions.push({ emoji: m.reactTrainer, mine: side === 'trainer' });
  return {
    id: m.id, from: m.sender === side ? 'me' : 'them', text: m.deleted ? '' : m.text, at: m.at,
    ...(m.localId ? { localId: m.localId } : {}),
    ...(m.edited ? { edited: true } : {}), ...(m.deleted ? { deleted: true } : {}),
    ...(reactions.length ? { reactions } : {}),
    ...(q ? { reply: { id: q.id, from: q.sender === side ? 'me' : 'them', text: q.deleted ? '' : q.text.slice(0, 160), deleted: !!q.deleted } } : {}),
  };
}

function history(side) {
  const other = side === 'client' ? 'trainer' : 'client';
  return {
    rev,
    messages: messages.filter((m) => !(m[`hidden_${side}`])).map((m) => shape(m, side)),
    more: false,
    readUpTo: read[other],
    myReadUpTo: read[side],
    peer: { online: side === 'client', seenAt: ago(12), typing: false },
    muted: muted[side],
    blocked,
    editHours: 48,
  };
}

function summary(side) {
  const other = side === 'client' ? 'trainer' : 'client';
  const visible = messages.filter((m) => !m[`hidden_${side}`]);
  const last = visible.at(-1);
  const unread = visible.filter((m) => m.sender === other && m.id > read[side] && !m.deleted).length;
  return {
    rev,
    last: last ? { id: last.id, from: last.sender === side ? 'me' : 'them', text: last.deleted ? '' : last.text, deleted: !!last.deleted, at: last.at, read: last.sender === side ? read[other] >= last.id : true } : null,
    unread,
    muted: !!muted[side],
    blocked,
    peer: { online: side === 'client', seenAt: ago(12), typing: false },
  };
}

const find = (id) => {
  const m = messages.find((x) => x.id === Number(id));
  if (!m) throw Object.assign(new Error('Сообщение не найдено.'), { code: 404 });
  return m;
};

export function chatMock(action, p) {
  const side = sideOf(p);
  const touch = () => { rev += 1; };
  switch (action) {
    case 'chat.list': {
      const s = summary(side);
      if (side === 'trainer') {
        return {
          enabled: true,
          chats: [
            { clientRow: 2, member: '', name: 'Анна К.', ...s },
            { clientRow: 3, member: '', name: 'Игорь П.', rev: 1, last: { id: 90, from: 'them', text: 'Можно перенести на пятницу?', at: ago(200), read: true }, unread: 1, muted: false, peer: { online: false, typing: true } },
            { clientRow: 4, member: '', name: 'Мария С.', rev: 1, last: { id: 91, from: 'me', text: 'Отлично, добавим вес', at: ago(60 * 30), read: true }, unread: 0, muted: true, peer: { online: false } },
          ],
          unread: s.unread + 1,
        };
      }
      return { enabled: true, chats: [{ trainerName: 'Константин', ...s }], unread: s.muted ? 0 : s.unread };
    }
    case 'chat.open': {
      const h = history(side);
      if (!p.before && p.read !== false) { read[side] = messages.at(-1).id; touch(); }
      return h;
    }
    case 'chat.wait':
      return new Promise((r) => setTimeout(() => r(p.scope === 'list' ? { changed: false } : { same: true, rev, peer: history(side).peer }), Math.min(Number(p.ms) || 20000, 20000)));
    case 'chat.send': {
      const dup = p.localId && messages.find((m) => m.localId === p.localId);
      if (dup) return { message: shape(dup, side), duplicate: true };
      const text = String(p.text || '').trim();
      if (!text) throw Object.assign(new Error('Пустое сообщение.'), { code: 400 });
      const m = { id: seq++, sender: side, text, at: new Date().toISOString(), replyTo: p.replyTo || null, localId: p.localId };
      messages.push(m);
      read[side] = m.id;
      touch();
      return { message: shape(m, side) };
    }
    case 'chat.edit': {
      const m = find(p.id);
      m.text = String(p.text || '').trim();
      m.edited = true;
      touch();
      return { message: shape(m, side) };
    }
    case 'chat.delete': {
      const m = find(p.id);
      if (p.forBoth) { m.deleted = true; m.text = ''; }
      m[`hidden_${side}`] = true;
      touch();
      return { removed: 1 };
    }
    case 'chat.react': {
      const m = find(p.id);
      const key = side === 'client' ? 'reactClient' : 'reactTrainer';
      m[key] = m[key] === p.emoji ? null : p.emoji;
      touch();
      return { emoji: m[key] };
    }
    case 'chat.read': read[side] = Math.max(read[side], Number(p.upTo) || 0); return { readUpTo: read[side] };
    case 'chat.typing': return { ok: true };
    case 'chat.mute': muted[side] = p.hours ? 'x' : null; touch(); return { muted: muted[side] };
    case 'chat.block': blocked = p.on !== false; touch(); return { blocked };
    case 'chat.report': return { reported: true, id: 1 };
    case 'chat.reports': return { reports: [{ id: 1, at: ago(30), reason: 'Спам', by: 'клиент', client: 'Анна К.', trainer: 'Константин', text: 'Купите курс', handledAt: null, outcome: '' }] };
    case 'chat.report.handle': return { handled: true };
    default: throw Object.assign(new Error('Нет демо-данных для ' + action), { code: 404 });
  }
}

export function resetChatMock() { muted = { client: null, trainer: null }; blocked = false; }
