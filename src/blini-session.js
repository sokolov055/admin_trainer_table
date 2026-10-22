import { createBlini, advance, drain, shoot, swap, aim, secondsOf, dangerOf, levelRules, missionRules, serializeGame, restoreGame, medalOf, LEVELS, TICK_MS, EASE_STEPS } from './blini-model.js';

// Одна партия «Блинов» на кабинет: меню, отдых и карьера видят одну и ту же.
// Пауза и смена экрана сохраняют её целиком. Открытые уровни и незаконченная
// партия свободной игры лежат на устройстве, а по согласию — ещё и в аккаунте
// (onPersist → game-progress.js): продолжить можно с того же места.
const PROGRESS = 'ft.blini.v1';
const MAX_TICKS = 25; // кадр позже 250 мс (фон, медленный телефон) не прокручивает партию рывком

const clampLevel = n => Number.isInteger(n) ? Math.max(0, Math.min(LEVELS.length - 1, n)) : 0;
const EMPTY = Object.freeze({ unlocked: 0, level: 0, game: null, savedAt: 0, fails: {}, medals: {} });
// Неудачи подряд на уровне — для подстройки сложности (по мотивам DDS Zuma's Revenge)
function cleanFails(value) {
  const out = {};
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    const level = Number(k), n = Number(v);
    if (Number.isInteger(level) && level >= 0 && level < LEVELS.length && Number.isInteger(n) && n > 0) out[level] = Math.min(EASE_STEPS, n);
  }
  return out;
}
// Лучшая медаль уровня: 1 — бронза, 2 — серебро, 3 — золото
function cleanMedals(value) {
  const out = {};
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    const level = Number(k), n = Number(v);
    if (Number.isInteger(level) && level >= 0 && level < LEVELS.length && Number.isInteger(n) && n > 0) out[level] = Math.min(3, n);
  }
  return out;
}
const bestOf = (a, b) => { const out = { ...a }; for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v); return out; };
/** Сохранение: открытые уровни, выбранный уровень, медали и незаконченная партия. */
export function readSaved(value) {
  if (!value || typeof value !== 'object') return null;
  const unlocked = clampLevel(value.unlocked);
  return { unlocked, level: Math.min(unlocked, clampLevel(value.level ?? unlocked)), game: value.game || null, savedAt: Number(value.savedAt) || 0, fails: cleanFails(value.fails), medals: cleanMedals(value.medals) };
}
function loadProgress() {
  try { return readSaved(JSON.parse(localStorage.getItem(PROGRESS))) || EMPTY; } catch (_) { return EMPTY; }
}
function saveProgress(progress) {
  try { localStorage.setItem(PROGRESS, JSON.stringify(progress)); } catch (_) { /* приватный режим */ }
}

/** То, что видно в верхней панели: меняется редко, поэтому экран перерисовывает HUD только по нему. */
function hudOf(game) {
  return {
    score: game.score, target: game.rules.target, full: game.full, current: game.current, next: game.next,
    lives: game.lives, danger: Math.round(dangerOf(game) * 20) / 20, streak: game.streak,
    negative: game.negative > 0, pause: game.pause > 0, technique: game.technique > 0, ramp: game.ramp,
    seconds: Math.floor(secondsOf(game)),
  };
}
const sameHud = (a, b) => Object.keys(a).every(k => a[k] === b[k]);

export function createBliniSession({ seed = Date.now(), now = () => Date.now() } = {}) {
  const progress = loadProgress();
  let serial = 0, savedAt = progress.savedAt, lastPersist = 0, fails = { ...progress.fails }, medals = { ...progress.medals };
  const free = level => levelRules(level, fails[level] || 0);
  // Незаконченная партия с прошлого раза — на паузе «Партия сохранена»
  const restored = restoreGame(progress.game);
  const resumed = !!restored && restored.mode === 'playing';
  let game = resumed ? restored : createBlini(seed, free(progress.level));
  let snapshot = { mode: resumed ? 'paused' : 'ready', level: progress.level, unlocked: progress.unlocked, medals, mission: null, reason: resumed ? 'saved' : '', sound: false, serial: 0, hud: hudOf(game), result: null };
  const listeners = new Set(), persisters = new Set();
  const owners = [];
  let carry = 0, last = now();
  const emit = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); };
  // Партия свободной игры сохраняется целиком; задание карьеры — нет: оно живёт, пока открыта карьера
  const persist = () => {
    savedAt = Date.now(); lastPersist = savedAt;
    const data = { v: 1, unlocked: snapshot.unlocked, level: snapshot.mission ? snapshot.unlocked : snapshot.level, savedAt, fails, medals,
      game: !snapshot.mission && ['playing', 'paused'].includes(snapshot.mode) && game.mode === 'playing' ? serializeGame(game) : null };
    saveProgress(data);
    persisters.forEach(fn => { try { fn(data); } catch (_) { /* сеть повторит сама */ } });
  };
  const owner = () => owners.at(-1);
  const expired = () => owner()?.expired?.() === true;
  const mine = token => token == null || owner()?.token === token;
  const fresh = (rules, patch = {}) => {
    serial++; carry = 0; last = now();
    game = createBlini((seed + serial * 7919) >>> 0, rules);
    emit({ hud: hudOf(game), result: null, reason: '', serial, ...patch });
  };
  const pause = (reason = 'manual') => {
    if (snapshot.mode !== 'playing') return;
    emit({ mode: 'paused', reason });
    persist();
  };
  const finish = () => {
    const won = game.mode === 'won', seconds = secondsOf(game);
    const result = { won, seconds, ace: won && seconds <= game.rules.par, score: game.score, bestChain: game.bestChain, bestStreak: game.bestStreak, cleared: game.cleared };
    // Медаль — за свободную игру; в задании карьеры она показывается, но не записывается
    result.medal = medalOf(result, game.rules);
    result.newMedal = !snapshot.mission && result.medal > (medals[snapshot.level] || 0);
    if (result.newMedal) medals = { ...medals, [snapshot.level]: result.medal };
    let unlocked = snapshot.unlocked;
    if (won && !snapshot.mission && snapshot.level >= unlocked && snapshot.level < LEVELS.length - 1) unlocked = snapshot.level + 1;
    // Проиграл — в следующий раз уровень чуть мягче; выиграл — снова обычный
    if (!snapshot.mission) {
      fails = { ...fails };
      if (won) delete fails[snapshot.level]; else fails[snapshot.level] = Math.min(EASE_STEPS, (fails[snapshot.level] || 0) + 1);
    }
    emit({ mode: won ? 'won' : 'lost', result, unlocked, medals, hud: hudOf(game) });
    persist();
  };
  const rulesNow = () => snapshot.mission ? missionRules(snapshot.mission.goal, snapshot.mission.boost) : free(snapshot.level);

  return {
    getSnapshot: () => snapshot,
    /** Ступень облегчения уровня свободной игры: 0 — обычный. */
    easeOf: level => fails[level] || 0,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Сама партия — для рисования на холсте каждый кадр, мимо React. */
    game: () => game,
    owner: () => owner()?.token,
    /** Подписка на сохранения — экран отправляет их в аккаунт, если сохранение включено. */
    onPersist(fn) { persisters.add(fn); return () => persisters.delete(fn); },
    /** Сохранить прямо сейчас — например, сразу после включения сохранения в аккаунте. */
    save: () => persist(),
    savedAt: () => savedAt,
    /** Сохранение из аккаунта новее этого устройства — взять его. Идущую партию не прерывает. */
    hydrate(value) {
      const saved = readSaved(value);
      if (!saved || saved.savedAt <= savedAt) return false;
      savedAt = saved.savedAt;
      const unlocked = Math.max(snapshot.unlocked, saved.unlocked);
      // Медали не теряются ни с одной стороны: берётся лучшая по каждому уровню
      medals = bestOf(medals, saved.medals);
      if (snapshot.mode === 'playing' || snapshot.mission) {
        emit({ unlocked, medals }); saveProgress({ ...loadProgress(), unlocked, savedAt, medals }); return true;
      }
      const next = restoreGame(saved.game);
      if (next && next.mode === 'playing') {
        serial++; carry = 0; last = now(); game = next;
        emit({ mode: 'paused', reason: 'saved', unlocked, level: saved.level, medals, result: null, hud: hudOf(game), serial });
      } else {
        snapshot = { ...snapshot, unlocked, level: saved.level, medals };
        fails = { ...saved.fails };
        fresh(free(saved.level), { mode: 'ready', level: saved.level, unlocked });
      }
      saveProgress({ ...saved, unlocked, medals });
      return true;
    },
    claim(token, isExpired) {
      pause('scene'); owners.push({ token, expired: isExpired });
      return () => {
        if (owner()?.token === token) pause('exit');
        const at = owners.findIndex(o => o.token === token);
        if (at >= 0) owners.splice(at, 1);
      };
    },
    /** Задание карьеры: свой уровень и план; null — вернуться к свободной игре. Те же правила — партия не сбрасывается. */
    mission(mission = null) {
      if (JSON.stringify(mission) === JSON.stringify(snapshot.mission)) return;
      const level = mission ? mission.goal.level : snapshot.unlocked;
      snapshot = { ...snapshot, mission, level };
      fresh(rulesNow(), { mode: 'ready' });
    },
    /** Выбрать уровень свободной игры (только открытый) — партия ещё не идёт. */
    choose(level, token) {
      if (!mine(token) || snapshot.mission || snapshot.mode === 'playing') return;
      const at = Math.max(0, Math.min(snapshot.unlocked, level));
      snapshot = { ...snapshot, level: at };
      fresh(free(at), { mode: 'ready', level: at });
      persist();
    },
    start(token) {
      if (!mine(token) || expired()) return;
      fresh(rulesNow(), { mode: 'playing' });
    },
    /** После победы — следующий уровень, готовый к старту. */
    nextLevel(token) {
      if (!mine(token) || snapshot.mission) return;
      const at = Math.min(snapshot.unlocked, snapshot.level + 1);
      snapshot = { ...snapshot, level: at };
      fresh(free(at), { mode: 'ready', level: at });
      persist();
    },
    pause,
    resume(token) {
      if (!mine(token) || snapshot.mode !== 'paused' || expired()) return;
      carry = 0; last = now();
      emit({ mode: 'playing', reason: '' });
    },
    /** Кадр экрана: прокрутить партию на прошедшее время. Возвращает события для звука и вспышек. */
    frame(token) {
      if (!mine(token) || snapshot.mode !== 'playing') { last = now(); return []; }
      if (expired()) { pause('rest'); return []; }
      const t = now();
      carry += Math.max(0, t - last); last = t;
      const ticks = Math.min(MAX_TICKS, Math.floor(carry / TICK_MS));
      carry = ticks === MAX_TICKS ? 0 : carry - ticks * TICK_MS;
      advance(game, ticks);
      const events = drain(game);
      if (game.mode !== 'playing') { finish(); return events; }
      const hud = hudOf(game);
      if (!sameHud(hud, snapshot.hud)) emit({ hud });
      // Раз в 10 секунд игры — на случай, если приложение закроют без паузы
      if (Date.now() - lastPersist > 10000) persist();
      return events;
    },
    aim(x, y, token) { if (mine(token) && snapshot.mode === 'playing') aim(game, x, y); },
    shoot(x, y, token) {
      if (!mine(token) || snapshot.mode !== 'playing' || expired()) return false;
      const ok = shoot(game, x, y);
      if (ok) emit({ hud: hudOf(game) });
      return ok;
    },
    swap(token) {
      if (!mine(token) || snapshot.mode !== 'playing') return false;
      const ok = swap(game);
      if (ok) emit({ hud: hudOf(game) });
      return ok;
    },
    toggleSound() { emit({ sound: !snapshot.sound }); },
  };
}
