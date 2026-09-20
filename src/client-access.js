import { apiPrimary, clearApiCache } from './api.js';

/**
 * Сброс доступа всегда идёт только на основной сервер: именно там лежат
 * сессии, коды и билеты входа. Автоповтор здесь опасен, а fallback не
 * способен честно выполнить половину операции.
 */
export async function resetClientAccess(clientRow, unlinkTelegram = false, deps = {}) {
  const row = Math.floor(Number(clientRow));
  if (!row || row < 2) throw new Error('Не указан клиент');

  const request = deps.request || apiPrimary;
  const clear = deps.clearCache || clearApiCache;
  const result = await request('trainer.client.access.reset', {
    clientRow: row,
    unlinkTelegram: unlinkTelegram === true,
  });
  clear();
  return result;
}
