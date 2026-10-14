import { makeDeck, judgeAnswer, pauseRound, resumeRound, ROUND_MS } from './plank-game.js';

// Одна партия на авторизованный кабинет. Только память: без API, localStorage
// и пользовательских данных. Живёт дольше экранов меню и отдыха.
export function createPlankSession() {
  let state = { round: null, seen: [], best: 0, category: 'all', level: 0, effects: false, music: false, owner: null };
  const listeners = new Set();
  const update = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const seen = q => [...new Set([...state.seen, q.id])];
  const api = {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    configure(patch) { update(patch); },
    claim(owner, now = Date.now()) {
      if (state.owner === owner) return;
      update({ owner, round: pauseRound(state.round, now, 'screen') });
    },
    release(owner, now = Date.now(), stopAt = Infinity) {
      if (state.owner !== owner) return;
      update({ owner: null, round: pauseRound(state.round, now, now >= stopAt ? 'rest' : 'screen', stopAt) });
    },
    pause(reason = 'manual', now = Date.now(), stopAt = Infinity) { update({ round: pauseRound(state.round, now, reason, stopAt) }); },
    resume(now = Date.now()) { update({ round: resumeRound(state.round, now) }); },
    start(now = Date.now(), random = Math.random) {
      const deck = makeDeck(state.category, state.level, random, state.seen);
      if (!deck.length) return;
      if (deck.every(q => state.seen.includes(q.id))) {
        const recycled = new Set(deck.map(q => q.id));
        state = { ...state, seen: state.seen.filter(id => !recycled.has(id)) };
      }
      update({ seen: seen(deck[0]), round: { deck, index: 0, score: 0, points: 0, status: deck[0].audio ? 'listening' : 'playing', deadline: now + ROUND_MS } });
    },
    tick(now = Date.now(), stopAt = Infinity) {
      const r = state.round;
      if (now >= stopAt) return api.pause('rest', now, stopAt);
      if (r?.status === 'playing' && now >= r.deadline) update({ round: { ...r, status: 'lost', reason: 'timeout' } });
    },
    answer(index, now = Date.now(), stopAt = Infinity) {
      api.tick(now, stopAt);
      const r = state.round;
      if (r?.status !== 'playing') return;
      const result = judgeAnswer(r.deck[r.index], index, r.deadline, now);
      if (result !== 'correct') { update({ round: { ...r, status: 'lost', reason: result, selected: index } }); return; }
      const earned = 100 + Math.ceil(Math.max(0, r.deadline - now) / 1000) * 10;
      const points = r.points + earned;
      update({ best: Math.max(state.best, points), round: { ...r, score: r.score + 1, points, earned, status: 'feedback', selected: index } });
    },
    next(now = Date.now()) {
      const r = state.round;
      if (r?.status !== 'feedback') return;
      if (r.index + 1 >= r.deck.length) { update({ round: { ...r, status: 'won' } }); return; }
      const q = r.deck[r.index + 1];
      update({ seen: seen(q), round: { ...r, index: r.index + 1, status: q.audio ? 'listening' : 'playing', deadline: now + ROUND_MS, selected: undefined } });
    },
    listened(expectedRound, now = Date.now()) {
      if (state.round === expectedRound && expectedRound.status === 'listening') update({ round: { ...expectedRound, status: 'playing', deadline: now + ROUND_MS } });
    },
    home() { update({ round: null }); },
  };
  return api;
}
