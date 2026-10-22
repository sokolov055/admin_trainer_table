import { apiStale } from './api.js';
import { setGamePacks } from './game-packs-store.js';

/**
 * Наборы для игр из «Управление → Игры» (22.10.2026): после входа — свежий
 * список с сервера (app.gamepacks); до ответа действует сохранённый на
 * устройстве (game-packs-store.js).
 */
export function refreshGamePacks() {
  try {
    apiStale('app.gamepacks').promise.then((data) => { if (data) setGamePacks(data); }).catch(() => {});
  } catch (_) {}
}
