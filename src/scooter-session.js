import { createGame, pause, RULES_VERSION } from './scooter-model.js';
import { apiPrimary } from './api.js';

// Меню и отдых разделяют одну поездку; личность сбрасывается провайдером кабинета.
export function createScooterSession() {
  const game = createGame(), owners = [], listeners = new Set();
  let run = null, boardRequest = 0;
  const sending = new Set();
  const session = {
    game, profile: null, board: [], rankStatus: '', loading: false, voice: false,
    owner: () => owners.at(-1), pause: () => pause(game),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify() { listeners.forEach(fn => fn()); },
    async leaderboard(difficulty = game.difficulty) {
      const request = ++boardRequest;
      const data = await apiPrimary('scooter.board', { difficulty });
      if (request !== boardRequest) return data;
      session.profile = data.profile; session.board = data.entries; session.notify(); return data;
    },
    async join() {
      const data = await apiPrimary('scooter.join', { accept: true, version: '2026-10-17' });
      session.profile = data; session.notify();
    },
    async withdraw() {
      await apiPrimary('scooter.leave'); run = null;
      session.profile = null; session.board = []; session.rankStatus = ''; session.notify();
    },
    async start(difficulty = game.difficulty) {
      session.loading = true; session.notify();
      try {
        let seed = (Math.random() * 4294967296) >>> 0;
        run = null; session.rankStatus = '';
        if (session.profile?.enabled) {
          run = await apiPrimary('scooter.start', { difficulty });
          if (run.rules !== RULES_VERSION) { run = null; throw new Error('Правила игры обновились. Закрой и заново открой приложение.'); }
          seed = run.seed;
        }
        Object.assign(game, createGame(seed, difficulty));
      } finally { session.loading = false; session.notify(); }
    },
    async finish() {
      if (!run || sending.has(run.id) || game.phase !== 'lost') return;
      const completed = run;
      sending.add(completed.id); session.rankStatus = 'Проверяем рекорд…'; session.notify();
      try {
        const data = await apiPrimary('scooter.finish', { runId: completed.id, ticks: game.ticks, inputs: [...game.inputs] });
        if (run === completed) {
          run = null; session.profile = data.profile;
          session.rankStatus = data.improved ? 'Новый рекорд! Место: ' + data.rank : 'Результат сохранён. Место: ' + data.rank;
        }
      } catch (error) {
        console.warn('Не удалось сохранить заезд:', error);
        if (run === completed) session.rankStatus = error.message + ' Нажми «Сохранить ещё раз».';
      } finally { sending.delete(completed.id); session.notify(); }
    },
    claim(owner) {
      pause(game); owners.push(owner);
      return () => { const index = owners.indexOf(owner); if (index < 0) return;
        if (owners.at(-1) === owner) pause(game); owners.splice(index, 1); };
    },
  };
  return session;
}
