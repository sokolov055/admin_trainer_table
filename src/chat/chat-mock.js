/**
 * Демо-переписка (FT-808) для сборки с VITE_MOCK=1 и браузерных проверок.
 * Один чат «Анна К. ↔ Константин»; роль — из mockRole. Сервер настоящий —
 * server/src/lib/chat.js; здесь только то, что нужно экрану.
 */

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

let seq = 7;
let messages = [
  { id: 1, sender: 'trainer', text: 'Как колено после вчерашнего?', at: ago(60 * 26) },
  { id: 2, sender: 'client', text: 'Колено ок, но последние два подхода тяжело', at: ago(60 * 25), edited: true },
  { id: 3, sender: 'trainer', text: 'Супер! В следующий раз жим ногами оставим 120, добавим повтор 👍', at: ago(50), replyTo: 2, reactClient: '🔥' },
  { id: 4, sender: 'trainer', text: '', at: ago(45), deleted: true },
  { id: 5, sender: 'trainer', text: 'Завтра не забудь резинку для ягодичного 😉', at: ago(40), pinned: true },
  { id: 6, sender: 'client', text: '🏋️ Тренировка', at: ago(30), card: { kind: 'workout', ref: 'w1', title: 'Ноги + спина', day: new Date(Date.now() - 86400000).toISOString().slice(0, 10), sets: 18, tonnage: 10200, minutes: 52, skipped: [{ name: 'Жим лёжа', reason: 'тренажёр занят' }] } },
];
const read = { client: 3, trainer: 5 };
let rev = 1;
let muted = { client: null, trainer: null };
let blocked = false;
let prefs = { hideOnline: false, quietFrom: null, quietTo: null };
// Этап 2: закреп и архив у тренера по чатам, у клиента — один чат
let lineState = { 2: { pinned: ago(5) }, 3: {}, 4: { archived: false }, 5: { archived: true }, mine: {} };
const others = {
  3: { clientRow: 3, member: '', name: 'Игорь П.', rev: 1, last: { id: 90, from: 'them', text: 'Можно перенести на пятницу?', at: ago(200), read: true }, unread: 1, muted: false, today: true, peer: { online: false, typing: true } },
  4: { clientRow: 4, member: '', name: 'Мария С.', rev: 1, last: { id: 91, from: 'me', text: 'Отлично, добавим вес', at: ago(60 * 30), read: true }, unread: 0, muted: true, peer: { online: false } },
  5: { clientRow: 5, member: '', name: 'Ольга Л.', rev: 1, last: { id: 92, from: 'them', text: 'Спасибо за всё!', at: ago(60 * 24 * 9), read: true }, unread: 0, muted: false, peer: { online: false } },
};

const DEMO_CARDS = {
  workout: (ref) => ({ kind: 'workout', ref: ref || 'w1', title: 'Ноги + спина', day: new Date(Date.now() - 86400000).toISOString().slice(0, 10), sets: 18, tonnage: 10200, minutes: 52, skipped: [{ name: 'Жим лёжа', reason: 'тренажёр занят' }] }),
  program: () => ({ kind: 'program', ref: 'Ноябрь 2026', title: 'Ноябрь 2026', trainings: 3, exercises: 21, blocks: ['Тренировка 1 — ноги', 'Тренировка 2 — спина', 'Тренировка 3 — верх'] }),
  exercise: (ref) => ({ kind: 'exercise', ref: ref || 1, title: 'Румынская тяга', muscle: 'Задняя поверхность бедра', notes: 'Спина прямая, таз назад, гриф скользит по ногам.', media: true }),
  measures: () => ({ kind: 'measures', ref: '2026-11-18', title: 'Замеры', day: '2026-11-18', values: { weight: 78.5, waist: 88, hips: 98 }, change: { weight: -1.5, waist: -2 }, since: '2026-11-01' }),
  food: (ref) => ({ kind: 'food', ref: ref || '2026-11-19', title: 'Питание за день', day: ref || '2026-11-19', kcal: 1840, protein: 132, fat: 58, carbs: 190, items: 9 }),
};
const CARD_TEXT = { workout: '🏋️ Тренировка', program: '📋 Программа', exercise: '🎯 Упражнение', measures: '📏 Замеры', food: '🥗 Питание' };

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
    ...(m.pinned && !m.deleted ? { pinned: true } : {}),
    ...(m.forwarded ? { forwarded: m.forwarded } : {}),
    ...(m.card && !m.deleted ? { card: m.card } : {}),
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
    pins: messages.filter((m) => m.pinned && !m.deleted && !m[`hidden_${side}`]).map((m) => ({ id: m.id, from: m.sender === side ? 'me' : 'them', text: m.text.slice(0, 160) })),
    pinnedChat: !!(side === 'trainer' ? lineState[2] : lineState.mine).pinned,
    archived: !!(side === 'trainer' ? lineState[2] : lineState.mine).archived,
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
        const chats = [{ clientRow: 2, member: '', name: 'Анна К.', today: true, ...s }, ...Object.values(others)]
          .map((c) => ({ ...c, pinned: lineState[c.clientRow].pinned || null, archived: !!lineState[c.clientRow].archived }));
        chats.sort((a, b) => (!!b.pinned - !!a.pinned) || String(b.last?.at || '').localeCompare(String(a.last?.at || '')));
        return { enabled: true, chats, unread: chats.reduce((n, c) => n + (c.muted || c.archived ? 0 : c.unread), 0), prefs };
      }
      return { enabled: true, chats: [{ trainerName: 'Константин', ...s, pinned: lineState.mine.pinned || null, archived: !!lineState.mine.archived }], unread: s.muted ? 0 : s.unread, prefs };
    }
    case 'chat.pin': {
      const key = side === 'trainer' ? Number(p.clientRow) : 'mine';
      lineState[key] = { ...lineState[key], pinned: p.on !== false ? new Date().toISOString() : null, ...(p.on !== false ? { archived: false } : {}) };
      touch();
      return { pinned: p.on !== false };
    }
    case 'chat.archive': {
      const key = side === 'trainer' ? Number(p.clientRow) : 'mine';
      lineState[key] = { ...lineState[key], archived: p.on !== false, ...(p.on !== false ? { pinned: null } : {}) };
      touch();
      return { archived: p.on !== false };
    }
    case 'chat.pinMessage': { const m = find(p.id); m.pinned = p.on !== false; touch(); return { pinned: m.pinned }; }
    case 'chat.search': {
      const q = String(p.q || '').toLowerCase().trim();
      if (q.length < 2) return { hits: [] };
      return {
        hits: messages.filter((m) => !m.deleted && !m[`hidden_${side}`] && m.text.toLowerCase().includes(q)).reverse()
          .map((m) => ({ id: m.id, clientRow: 2, member: '', from: m.sender === side ? 'me' : 'them', at: m.at, text: m.text })),
      };
    }
    case 'chat.forward': {
      const ids = [].concat(p.ids || p.id).map(Number);
      return { sent: (p.to || []).flatMap((t) => ids.map((id) => ({ clientRow: t.clientRow, member: t.member || '', id: 1000 + id }))) };
    }
    case 'chat.card': {
      const make = DEMO_CARDS[p.kind];
      if (!make) throw Object.assign(new Error('Такой карточки нет.'), { code: 400 });
      const card = make(p.ref);
      const m = { id: seq++, sender: side, text: CARD_TEXT[p.kind], at: new Date().toISOString(), card, localId: p.localId };
      messages.push(m);
      read[side] = m.id;
      touch();
      return { message: shape(m, side) };
    }
    case 'chat.cardOptions': {
      if (p.kind === 'workout') return { options: [{ ref: 'w1', title: 'Ноги + спина', day: '2026-11-19' }, { ref: 'w2', title: 'Верх', day: '2026-11-17' }] };
      if (p.kind === 'food') return { options: [{ ref: '2026-11-19', title: '19.11', note: '9 записей' }, { ref: '2026-11-18', title: '18.11', note: '7 записей' }] };
      const all = [{ ref: 1, title: 'Румынская тяга', note: 'Бедро' }, { ref: 2, title: 'Жим ногами', note: 'Квадрицепс' }, { ref: 3, title: 'Тяга верхнего блока', note: 'Спина' }];
      const q = String(p.q || '').toLowerCase();
      return { options: all.filter((o) => !q || o.title.toLowerCase().includes(q)) };
    }
    case 'chat.prefs': {
      ['hideOnline', 'quietFrom', 'quietTo'].forEach((k) => { if (p[k] !== undefined) prefs[k] = p[k]; });
      return { prefs };
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

export function resetChatMock() {
  muted = { client: null, trainer: null };
  blocked = false;
  prefs = { hideOnline: false, quietFrom: null, quietTo: null };
  lineState = { 2: { pinned: ago(5) }, 3: {}, 4: { archived: false }, 5: { archived: true }, mine: {} };
}
