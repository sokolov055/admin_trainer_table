/**
 * Чьи данные лежат на телефоне (FT-566).
 *
 * Неотправленные занятия и история принадлежат человеку, а не ключу входа:
 * ключ живёт 90 дней и меняется при каждом входе, а занятие, проведённое
 * без сети, обязано дожить до повторного входа и уйти на сервер. Поэтому
 * метка — по тому, кем сервер назвал человека («me»): роль, id и участник
 * сплита. Другой человек на том же телефоне получает свою метку и чужих
 * записей не видит.
 *
 * Метку ставит App.jsx, как только знает «кто я» — из сохранённого ответа
 * или свежего. Пока её нет, офлайн-хранилище ничего не читает и не пишет.
 */

let current = '';
const listeners = new Set();
/** Временные метки этого запуска — их записи переедут под постоянную */
const fallbacks = new Set();

/** Короткий непрозрачный отпечаток: id человека в ключах базы ни к чему */
function digest(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

export function accountOf(me) {
  if (!me || !me.role) return '';
  // accountId — постоянная метка с сервера (handlers.js, accountIdOf). Её
  // нет только у старого сохранённого ответа: тогда — по тому, что есть
  if (me.accountId) return 'u' + digest(me.role + ':' + me.accountId);
  // Временная метка — до первого свежего ответа (offline-outbox переносит
  // её записи на постоянную, workout-outbox.js, adoptAccount)
  return 'f' + digest(me.role + ':' + [me.chatId, me.email, me.name, me.member].map((x) => String(x || '')).join('|'));
}

/** Метка временная — из старого сохранённого ответа без accountId */
export const isFallbackAccount = (account) => String(account || '').charAt(0) === 'f';

export function setOfflineAccount(me) {
  const next = accountOf(me);
  if (!next) fallbacks.clear();
  if (next === current) return;
  const previous = current;
  current = next;
  if (isFallbackAccount(next)) fallbacks.add(next);
  listeners.forEach((fn) => { try { fn(current, previous); } catch (_) {} });
}

export function offlineAccount() {
  return current;
}

/**
 * Временные метки, которые пора перенести на постоянную: этот запуск начался
 * со старого сохранённого ответа без accountId, а свежий его уже дал. Выход
 * из аккаунта (метка '') список сбрасывает — переносить чужое нельзя.
 */
export function takeFallbacks() {
  if (!current || isFallbackAccount(current)) return [];
  const out = [...fallbacks];
  fallbacks.clear();
  return out;
}

export function onOfflineAccount(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
