import { getInitData } from './telegram.js';
import { getToken } from './session.js';

// Черновик изолирован по вошедшему пользователю и карточке клиента.
// Подпись Telegram меняется при запуске, поэтому из неё берём только id.
// Отдельным модулем: черновик читает и экран тренировки (Workout.jsx), и
// досохранение «Завершить» с плашки при запуске приложения (live-settle.js)
export async function storageKey(clientRow) {
  const data = new URLSearchParams(getInitData());
  let identity = getToken();
  try { identity = JSON.parse(data.get('user')).id || identity; } catch (_) {}
  if (import.meta.env.VITE_MOCK === '1') identity = 'demo';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(identity)));
  return 'workout_draft_v1:' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('') + ':' + (clientRow || 'self');
}
