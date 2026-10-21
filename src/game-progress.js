import { useEffect, useSyncExternalStore } from 'react';
import { apiPrimary } from './api.js';

// Прогресс игр в аккаунте (FT-700, 22.10.2026): «Блины» и карьера продолжаются
// с того же места на любом устройстве — только после отдельного согласия
// (public/game-progress-consent.html). Без него всё живёт на устройстве, как раньше.
// Сохраняет каждая игра сама (saveProgress), здесь — общая очередь и состояние.
export const PROGRESS_CONSENT_VERSION = '2026-10-22';
const SAVE_DELAY = 1500;

let store = { loaded: false, loading: false, enabled: false, states: {}, error: '' };
const subs = new Set();
const pending = new Map(), timers = new Map();
const emit = patch => { store = { ...store, ...patch }; subs.forEach(fn => fn()); };
const getSnapshot = () => store;
const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };

/** Прочитать с сервера: включено ли сохранение и что там лежит. */
export async function loadProgress(force = false) {
  if (store.loading || (store.loaded && !force)) return store;
  emit({ loading: true });
  try {
    const data = await apiPrimary('games.progress', {});
    emit({ loaded: true, loading: false, enabled: !!data.enabled, states: data.states || {}, error: '' });
  } catch (error) {
    emit({ loaded: true, loading: false, error: error?.message || 'Нет связи с сервером' });
  }
  return store;
}

export async function enableProgress() {
  const data = await apiPrimary('games.progress.enable', { accept: true, version: PROGRESS_CONSENT_VERSION });
  emit({ loaded: true, enabled: !!data.enabled, states: data.states || {}, error: '' });
  return data;
}

export async function disableProgress() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear(); pending.clear();
  const data = await apiPrimary('games.progress.disable', {});
  emit({ enabled: false, states: {} });
  return data;
}

async function flush(game) {
  timers.delete(game);
  const entry = pending.get(game);
  if (!entry || !store.enabled) return;
  pending.delete(game);
  try {
    await apiPrimary('games.progress.save', { game, state: entry.state, savedAt: entry.savedAt });
    emit({ states: { ...store.states, [game]: { state: entry.state, savedAt: entry.savedAt } } });
  } catch (_) {
    // Нет связи — вернуть в очередь, если за это время не пришло новее
    if (!pending.has(game)) pending.set(game, entry);
  }
}

/** Поставить состояние игры в очередь на сервер. Пока выключено — ничего не уходит. */
export function saveProgress(game, state, { now = false } = {}) {
  if (!store.enabled) return;
  pending.set(game, { state, savedAt: Date.now() });
  clearTimeout(timers.get(game));
  if (now) flush(game);
  else timers.set(game, setTimeout(() => flush(game), SAVE_DELAY));
}

export function flushAll() { for (const game of [...pending.keys()]) flush(game); }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });
}

/** Состояние сохранения для экранов игр; первый вызов читает сервер. */
export function useGameProgress(active = true) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { if (active) loadProgress(); }, [active]);
  return state;
}

/** Только для тестов: начать с чистого листа. */
export function resetProgressStore() { store = { loaded: false, loading: false, enabled: false, states: {}, error: '' }; pending.clear(); timers.clear(); }
