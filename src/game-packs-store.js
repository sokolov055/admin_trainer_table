/**
 * Наборы для игр на устройстве (22.10.2026): вопросы «Тренера в планке» и
 * уровни «Блинов» из «Управление → Игры». Без зависимостей — игры грузятся
 * по требованию и подписываются сами (plank-game.js, blini-model.js), а
 * свежий ответ сервера кладёт remote-games.js.
 *
 * Последний ответ лежит здесь (PACKS_KEY): наборы действуют сразу и без сети.
 * Владельцу сервер отдаёт и закрытые (trial) — их он включает у себя кнопкой
 * «Примерить у себя» (TRY_KEY, только это устройство); людям закрытые не
 * приходят вовсе.
 */
export const PACKS_KEY = 'app_game_packs_v1';
export const TRY_KEY = 'app_game_packs_try_v1';

const read = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
};

/** Какие наборы действуют: открытые и примеряемые владельцем */
export function activePacks(doc, tried = []) {
  const on = new Set(tried);
  const packs = doc && Array.isArray(doc.packs) ? doc.packs : [];
  return packs.filter((p) => p && (!p.closed || (doc.trial && on.has(p.id))));
}

const listeners = new Set();
/** Наборы игры game сейчас — и при каждой смене; возвращает отписку */
export function onGamePacks(game, fn) {
  const run = () => fn(activePacks(read(PACKS_KEY, null), read(TRY_KEY, [])).filter((p) => p.game === game));
  listeners.add(run);
  run();
  return () => listeners.delete(run);
}
const changed = () => listeners.forEach((run) => run());

/** Свежий ответ сервера (app.gamepacks) */
export function setGamePacks(doc) {
  write(PACKS_KEY, { packs: (doc && doc.packs) || [], ...(doc && doc.trial ? { trial: true } : {}) });
  changed();
}

export function isTried(id) {
  return read(TRY_KEY, []).includes(id);
}

/** Примерка владельца: набор включён на этом устройстве, хоть и закрыт для людей */
export function setTried(id, on) {
  const list = read(TRY_KEY, []).filter((x) => x !== id);
  write(TRY_KEY, on ? [...list, id] : list);
  changed();
}
