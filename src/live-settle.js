/**
 * Плашка тренировки на iPhone при запуске приложения и возврате в него
 * (01.10.2026).
 *
 * 1. «Завершить» нажали на плашке (или на часах), а экран тренировки не
 *    открывали: занятие закрываем здесь — с подходами, отмеченными на
 *    плашке, — и сохраняем на сервер. Не вышло (нет связи) — черновик
 *    остаётся несохранённым, его сохранит экран тренировки.
 * 2. Забытая плашка: занятие уже закрыто (на другом телефоне, у тренера, на
 *    часах), а плашка висит — убираем. Не знаем, чьё оно, — убираем, если
 *    плашка не менялась больше 4 часов.
 *
 * Экран тренировки открыт — ничего не делаем: нажатое забирает он сам.
 */
import { apiMutate, apiPublic } from './api.js';
import { storageKey } from './workout-draft.js';
import { uid } from './workout-model.js';
import { applyActions, endWorkoutActivity, isWorkoutOpen, liveOwner, liveState, takeActions } from './native-activity.js';

const FORGOTTEN_MS = 4 * 60 * 60 * 1000;
const OPEN = ['active', 'paused'];

let running = false;

function rowOf(info, sessionId) {
  const own = info && info.owner;
  if (own && String(own.sessionId) === sessionId) return Number(own.clientRow) || 0;
  const mine = liveOwner();
  if (mine && String(mine.sessionId) === sessionId) return Number(mine.clientRow) || 0;
  return null;
}

const paramsOf = (row) => (row ? { clientRow: row } : {});

/** Закрыть занятие, завершённое на плашке: черновик и сервер */
export async function finishFromLive(sessionId, row) {
  const params = paramsOf(row);
  const key = await storageKey(row || '');
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(key)); } catch (_) {}
  const own = draft && draft.session && draft.session.id === sessionId ? draft : null;

  // Несохранённое на этом телефоне свежее сервера; иначе — с сервера (там
  // и то, что сделали часы)
  let base;
  if (own && (own.dirty || own.pending)) {
    const ran = own.session.status === 'active' ? Math.max(0, Date.now() - (own.tick || Date.now())) : 0;
    base = { session: { ...own.session, elapsedMs: Math.min(604800000, (own.session.elapsedMs || 0) + ran) },
      revision: own.revision, serverTitle: own.serverTitle };
  } else {
    const r = await apiPublic('workout.get', { ...params, id: sessionId });
    base = { session: r.session, revision: r.session.revision, serverTitle: r.session.title };
  }

  const actions = await takeActions(sessionId);
  if (!OPEN.includes(base.session.status)) return false;
  let session = applyActions(base.session, actions, 'ios');
  if (OPEN.includes(session.status)) session = applyActions(session, [{ kind: 'finish', sessionId }]);

  const edit = ((own && own.edit) || 0) + 1;
  const record = { session, revision: base.revision, serverTitle: base.serverTitle, dirty: true, tick: Date.now(), edit, pending: null };
  try { localStorage.setItem(key, JSON.stringify(record)); } catch (_) {}

  const result = await apiMutate('workout.save', { ...params, session, revision: base.revision, requestId: uid(), edit,
    ...(typeof base.serverTitle === 'string' ? { baseTitle: base.serverTitle } : {}) });
  if (result && !result.conflict && !result.activeConflict && result.session) {
    try {
      localStorage.setItem(key, JSON.stringify({ session: result.session, revision: result.session.revision,
        serverTitle: result.session.title, dirty: false, tick: Date.now(), pending: null }));
    } catch (_) {}
  }
  return true;
}

export async function settleLive(now = Date.now()) {
  if (running || isWorkoutOpen()) return;
  running = true;
  try {
    const info = await liveState();
    if (!info) return;
    const finished = [...new Set((info.finished || []).map(String).filter(Boolean))];
    for (const id of finished) {
      const row = rowOf(info, id);
      if (row === null) continue;
      try { await finishFromLive(id, row); } catch (_) { /* экран тренировки досохранит */ }
    }

    const current = info.sessionId ? String(info.sessionId) : '';
    if (!current || finished.includes(current)) return;
    const row = rowOf(info, current);
    const old = Number(info.updatedAt) > 0 && now - Number(info.updatedAt) > FORGOTTEN_MS;
    if (row === null) {
      if (old) await endWorkoutActivity();
      return;
    }
    try {
      const r = await apiPublic('workout.get', { ...paramsOf(row), id: current });
      if (!OPEN.includes(r.session.status)) await endWorkoutActivity();
    } catch (_) {
      if (old) await endWorkoutActivity();
    }
  } finally {
    running = false;
  }
}
