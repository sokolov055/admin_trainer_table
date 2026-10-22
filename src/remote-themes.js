import { apiStale } from './api.js';
import { setRemoteThemes } from './palettes.js';
import { refreshTheme } from './telegram.js';

/**
 * Темы из «Управление → Вид» (22.10.2026): после входа — свежий список с
 * сервера (app.themes). До ответа действует то, что уже лежит на
 * устройстве; закрытая владельцем тема у человека сменится на
 * «Стандартный» сразу, а с ней и тема, если та была «всегда тёмная».
 */
export function refreshThemes() {
  const apply = (data) => {
    if (!data) return;
    if (setRemoteThemes(data)) refreshTheme();
  };
  // Только свежий ответ: прошлый уже лежит на устройстве (palettes.js,
  // THEMES_KEY), а старый ответ из кеша вернул бы на миг закрытую тему
  try {
    apiStale('app.themes').promise.then(apply).catch(() => {});
  } catch (_) {}
}
