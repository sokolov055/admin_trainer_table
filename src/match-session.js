import { MATCH_TUNING, createMatchGame, legalMoves, resolveMove, earnedStars } from './match-model.js';
import { chapterFor, chapterComplete } from './match-story.js';

// Одна очередь анимации на кабинет. Смена сцены и пауза сохраняют её позицию.
export function createMatchSession({ seed = Date.now(), now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
  let snapshot = { game: createMatchGame(seed), mode: 'ready', frame: null, selected: null, hint: null, busy: false, message: '', reason: '', sound: false, serial: 0 };
  const listeners = new Set();
  const owners = [];
  let queue = [], result = null, timer = null, due = 0, remaining = 0;
  const emit = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
  const clearTimer = () => { if (timer != null) cancel(timer); timer = null; };
  const owner = () => owners.at(-1);
  const expired = () => owner()?.expired?.() === true;
  const pause = (reason = 'manual') => {
    if (snapshot.mode !== 'playing') return;
    remaining = timer == null ? remaining : Math.max(0, due - now());
    clearTimer(); emit({ mode: 'paused', reason, selected: null, hint: null });
  };
  const allowed = token => {
    if (token != null && owner()?.token !== token) return false;
    if (expired()) { pause('rest'); return false; }
    return snapshot.mode === 'playing';
  };
  const arm = delay => {
    remaining = delay; due = now() + delay;
    timer = schedule(() => { timer = null; advance(); }, delay);
  };
  const advance = () => {
    if (!allowed()) return;
    const frame = queue.shift();
    if (!frame) {
      const game = result || snapshot.game;
      const mode = game.moves === 0 ? (earnedStars(game) ? 'won' : 'lost') : 'playing';
      result = null; remaining = 0;
      emit({ game, mode, busy: false, frame: null });
      return;
    }
    let message = snapshot.message;
    if (frame.kind === 'clear') {
      const chapter = chapterFor(frame.game.level);
      const halfway = Math.ceil(chapter.count / 2);
      message = frame.storyGain && snapshot.game.collected < halfway && frame.game.collected >= halfway
        ? chapter.halfway
        : chapterComplete(frame.game) && frame.storyGain
        ? `${chapter.task} готовы! +${frame.points} очков`
        : `${frame.combo > 1 ? `Каскад ×${frame.combo}. ` : ''}+${frame.points} очков${frame.storyGain ? ` · ${chapter.task} +${frame.storyGain}` : ''}${frame.creations.length ? ' · Бонус!' : ''}`;
    }
    if (frame.kind === 'reject') message = 'Здесь нет тройки. Ход сохранён.';
    if (frame.kind === 'shuffle') message = 'Новых ходов нет. Перемешиваем бесплатно.';
    emit({ game: frame.game, frame, message, serial: snapshot.serial + 1 });
    arm(frame.duration);
  };
  const move = (a, b, token) => {
    if (!allowed(token) || snapshot.busy) return false;
    const resolved = resolveMove(snapshot.game, a, b);
    if (!resolved.frames.length) return false;
    queue = resolved.frames.slice(); result = resolved.game;
    emit({ selected: null, hint: null, busy: true, message: '' });
    advance(); return resolved.valid;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    owner: () => owner()?.token,
    claim(token, isExpired) {
      pause('scene'); owners.push({ token, expired: isExpired });
      return () => {
        if (owner()?.token === token) pause('exit');
        const at = owners.findIndex(o => o.token === token);
        if (at >= 0) owners.splice(at, 1);
      };
    },
    start(level = snapshot.game.level, token) {
      if (token != null && owner()?.token !== token) return;
      if (expired()) return;
      clearTimer(); queue = []; result = null; remaining = 0;
      emit({ game: createMatchGame((seed + snapshot.serial * 7919 + 1) >>> 0, level), mode: 'playing', frame: null, selected: null, hint: null, busy: false, message: chapterFor(level).task, reason: '', serial: snapshot.serial + 1 });
    },
    pause,
    resume(token) {
      if (token != null && owner()?.token !== token) return;
      if (snapshot.mode !== 'paused' || expired()) return;
      emit({ mode: 'playing', reason: '' });
      if (snapshot.busy) arm(remaining);
    },
    move,
    select(index, token) {
      if (!allowed(token) || snapshot.busy) return;
      const selected = snapshot.selected;
      if (selected === index) { emit({ selected: null }); return; }
    if (selected != null && Math.abs(Math.floor(selected / MATCH_TUNING.size) - Math.floor(index / MATCH_TUNING.size)) + Math.abs(selected % MATCH_TUNING.size - index % MATCH_TUNING.size) === 1) move(selected, index, token);
      else emit({ selected: index, hint: null });
    },
    hint(token) {
      if (!allowed(token) || snapshot.busy) return;
      emit({ hint: legalMoves(snapshot.game.board)[0] || null, selected: null, message: 'Поменяй местами подсвеченные предметы' });
    },
    toggleSound() { emit({ sound: !snapshot.sound }); },
  };
}
