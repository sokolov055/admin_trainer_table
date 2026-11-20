import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Мессенджер (FT-808): подписи времени и статуса, лента, галочки, очередь */
const m = await import('../src/chat/chat-model.js');

const NOW = new Date('2026-11-20T15:00:00');
const at = (s) => new Date(s).toISOString();

test('разделители дней и подписи времени', () => {
  assert.equal(m.dayLabel(at('2026-11-20T09:00:00'), NOW), 'Сегодня');
  assert.equal(m.dayLabel(at('2026-11-19T23:00:00'), NOW), 'Вчера');
  assert.equal(m.dayLabel(at('2026-11-02T10:00:00'), NOW), '2 ноября');
  assert.equal(m.dayLabel(at('2025-12-31T10:00:00'), NOW), '31 декабря 2025');
  assert.equal(m.listTime(at('2026-11-20T12:40:00'), NOW), '12:40');
  assert.equal(m.listTime(at('2026-11-17T12:40:00'), NOW), 'вт');
  assert.equal(m.listTime(at('2026-11-02T12:40:00'), NOW), '02.11');
});

test('статус собеседника, как в Telegram', () => {
  assert.equal(m.peerStatus({ typing: true, online: true }, NOW), 'печатает…');
  assert.equal(m.peerStatus({ online: true }, NOW), 'в сети');
  assert.equal(m.peerStatus({ seenAt: at('2026-11-20T12:40:00') }, NOW), 'был(а) в 12:40');
  assert.equal(m.peerStatus({ seenAt: at('2026-11-19T21:05:00') }, NOW), 'был(а) вчера в 21:05');
  assert.equal(m.peerStatus({ seenAt: null }, NOW), 'был(а) недавно');
});

test('лента: дни, «Непрочитанные» перед первым чужим новым, хвостики', () => {
  const list = [
    { id: 1, from: 'them', text: 'a', at: at('2026-11-19T10:00:00') },
    { id: 2, from: 'me', text: 'b', at: at('2026-11-20T10:00:00') },
    { id: 3, from: 'them', text: 'c', at: at('2026-11-20T10:01:00') },
    { id: 4, from: 'them', text: 'd', at: at('2026-11-20T10:02:00') },
  ];
  const feed = m.buildFeed(list, { myReadUpTo: 2, now: NOW });
  assert.deepEqual(feed.map((x) => x.kind), ['day', 'msg', 'day', 'msg', 'unread', 'msg', 'msg']);
  assert.equal(feed[5].tail, false, 'подряд от того же — без хвостика');
  assert.equal(feed[6].tail, true);
  assert.ok(!m.buildFeed(list, { myReadUpTo: 4 }).some((x) => x.kind === 'unread'));
});

test('галочки и правка 48 часов', () => {
  assert.equal(m.tickOf({ from: 'them', id: 1 }, 5), null);
  assert.equal(m.tickOf({ from: 'me', pending: true }, 5), 'pending');
  assert.equal(m.tickOf({ from: 'me', failed: true }, 5), 'failed');
  assert.equal(m.tickOf({ from: 'me', id: 6 }, 5), 'sent');
  assert.equal(m.tickOf({ from: 'me', id: 5 }, 5), 'read');
  assert.equal(m.canEdit({ from: 'me', id: 1, at: at('2026-11-19T16:00:00') }, NOW), true);
  assert.equal(m.canEdit({ from: 'me', id: 1, at: at('2026-11-18T14:00:00') }, NOW), false);
  assert.equal(m.canEdit({ from: 'them', id: 1, at: at('2026-11-20T14:00:00') }, NOW), false);
});

test('очередь без сети: отправленное уходит из очереди', () => {
  const page = [{ id: 7, localId: 'l1', from: 'me' }];
  const r = m.mergeOutbox(page, [{ localId: 'l1', from: 'me' }, { localId: 'l2', from: 'me', failed: true }]);
  assert.equal(r.messages.length, 2);
  assert.deepEqual(r.outbox.map((x) => x.localId), ['l2']);
  assert.equal(m.previewOf({ from: 'me', text: 'Ок\nдо завтра' }), 'Вы: Ок до завтра');
  assert.equal(m.previewOf({ from: 'them', deleted: true }), 'Сообщение удалено');
  assert.equal(m.initials('Анна Котова'), 'АК');
});
