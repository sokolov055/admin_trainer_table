import { apiStale } from './api.js';
import { setStickerPack } from './setup-stickers-search.js';

/**
 * Стикерпак из «Управление → Контент → Стикеры» (16.11.2026): загруженные
 * файлом стикеры и скрытые встроенные. До ответа сервера — сохранённый на
 * устройстве список, чтобы шаги тренажёров офлайн были с теми же стикерами.
 */
const KEY = 'fit.stickers.v1';

try {
  const raw = typeof localStorage !== 'undefined' && localStorage.getItem(KEY);
  if (raw) setStickerPack(JSON.parse(raw));
} catch (_) { /* старый или битый кэш */ }

export function applyStickers(data) {
  if (!data) return;
  setStickerPack(data);
  try { localStorage.setItem(KEY, JSON.stringify({ stickers: data.stickers || [], hidden: data.hidden || [] })); } catch (_) {}
}

export function refreshStickers() {
  try {
    apiStale('app.stickers').promise.then(applyStickers).catch(() => {});
  } catch (_) {}
}
