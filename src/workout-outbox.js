/**
 * Занятия без сети: очередь отправки и журнал на телефоне (FT-566).
 *
 * Как было. Черновик занятия на телефоне один (Workout.jsx, workout-draft):
 * пока проведённое без связи занятие не ушло на сервер, следующее начать
 * было нельзя — журнал открывал прежнее. Список занятий и сами занятия без
 * сети не читались вовсе: «Выполненные» пустели, тренировка оставалась в
 * «Очереди».
 *
 * Как стало. Черновик — по-прежнему только у открытого занятия. Закрытое
 * (завершённое или отменённое), но не подтверждённое сервером, переезжает
 * сюда, в очередь, и экран свободен для следующего. Очередь:
 *
 * - хранится в IndexedDB (offline-db.js) под меткой человека
 *   (offline-account.js) и карточки клиента — без срока: неотправленное
 *   не удаляется ни по возрасту, ни при истечении входа;
 * - отправляется сама — при запуске, при появлении сети, при возврате в
 *   приложение — тем же workout.save с номером сохранения (requestId):
 *   повтор после потерянного ответа не создаёт второе занятие;
 * - видна сразу: занятия из неё стоят в «Выполненных» с пометкой
 *   «Сохранено на телефоне» и считаются в программе проведёнными.
 *
 * Конфликт (занятие изменили на другом устройстве) и отказ сервера молча
 * не решаются: запись остаётся в очереди с пометкой, открыть её — значит
 * вернуть в черновик, где журнал покажет обычный выбор версии.
 *
 * Тут же — чтение журнала без сети: список (последний ответ сервера плюс
 * очередь) и занятие целиком (очередь или история за 90 дней, которую
 * offline-prefetch.js сохраняет при связи).
 */
import { apiFresh, apiMutate, apiPublic } from './api.js';
import { dbDelete, dbGet, dbList, dbPut, dbReplace } from './offline-db.js';
import { offlineAccount, onOfflineAccount, takeFallbacks } from './offline-account.js';
import { storageKey } from './workout-draft.js';
import { uid } from './workout-model.js';
import { isWorkoutOpen } from './native-activity.js';
import { flushWrites, onWritesChange, pendingWrites } from './offline-writes.js';

const FINISHED = ['completed', 'cancelled'];

/* ==========================================================================
 * Ключи
 * ========================================================================== */

const clientKey = (clientRow) => String(clientRow || 'self');
const scope = (clientRow, account = offlineAccount()) => account + '|' + clientKey(clientRow) + '|';
const paramsOf = (clientRow) => (clientRow ? { clientRow: Number(clientRow) } : {});

/* ==========================================================================
 * Подписка: экран программы перечитывает список при каждом изменении
 * ========================================================================== */

const listeners = new Set();

export function onOutboxChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  listeners.forEach((fn) => { try { fn(); } catch (_) {} });
}

// Стало известно, кто вошёл, — экранам перечитать: очередь теперь видна
onOfflineAccount(() => changed());

/** Подтверждённые сервером за этот запуск — пометка «Синхронизировано» */
const synced = new Set();
export const justSynced = (id) => synced.has(String(id));

/* ==========================================================================
 * Очередь
 * ========================================================================== */

/**
 * Поставить закрытое занятие в очередь. record — запись черновика:
 * { session, revision, serverTitle, edit, pending }. pending сохраняется
 * как есть: если отправка уже уходила и ответ потерялся, повтор пойдёт с
 * тем же номером сохранения.
 *
 * Не вышло записать на телефон — бросает ошибку: вызывающий оставляет
 * черновик на месте и говорит человеку, что сохранить не удалось.
 */
export async function enqueueWorkout(clientRow, record) {
  const account = offlineAccount();
  if (!account) throw new Error('Не знаем, чей это телефон: войдите заново, чтобы сохранить занятие.');
  if (!record || !record.session || !record.session.id) return;
  const key = scope(clientRow, account) + record.session.id;
  const old = await dbGet('outbox', key).catch(() => null);
  await dbPut('outbox', key, {
    clientRow: clientRow ? Number(clientRow) : 0,
    record: {
      session: record.session,
      revision: Number(record.revision) || 0,
      ...(typeof record.serverTitle === 'string' ? { serverTitle: record.serverTitle } : {}),
      edit: record.edit || 0,
      pending: record.pending || null,
    },
    state: 'local',
    error: '',
    savedAt: (old && old.savedAt) || new Date().toISOString(),
  });
  changed();
}

/** Записи очереди этой карточки: [{ sessionId, record, state, error, savedAt }] */
export async function localWorkouts(clientRow) {
  const account = offlineAccount();
  if (!account) return [];
  const prefix = scope(clientRow, account);
  const rows = await dbList('outbox', prefix).catch(() => []);
  return rows.map(({ key, value }) => ({ sessionId: String(key).slice(prefix.length), ...value }));
}

/**
 * Сколько всего ждёт отправки у этого человека — перед выходом из
 * аккаунта: занятия и записи этапа 2 (замеры, настройки тренажёров)
 */
export async function pendingWorkouts() {
  const account = offlineAccount();
  if (!account) return 0;
  const rows = await dbList('outbox', account + '|').catch(() => []);
  return rows.length + await pendingWrites();
}

/**
 * Занятие из очереди — его открыли в журнале и вернут в черновик: дальше
 * его сохраняет журнал своим обычным путём (и покажет конфликт, если он
 * был). Нет в очереди — null. Из очереди убирает dropLocalWorkout — после
 * того, как черновик записан: сбой между шагами не должен потерять занятие.
 */
export async function peekLocalWorkout(clientRow, sessionId) {
  const account = offlineAccount();
  if (!account || !sessionId) return null;
  const entry = await dbGet('outbox', scope(clientRow, account) + sessionId).catch(() => null);
  return entry ? { ...entry.record, dirty: true, tick: Date.now() } : null;
}

export async function dropLocalWorkout(clientRow, sessionId) {
  const account = offlineAccount();
  if (!account || !sessionId) return;
  await dbDelete('outbox', scope(clientRow, account) + sessionId);
  changed();
}

/**
 * Черновик закрытого занятия, оставшийся неотправленным (закрыли экран без
 * связи, «Завершить» нажали на плашке iPhone), — в очередь, а черновик
 * освободить. Пока экран тренировки открыт, черновик принадлежит ему.
 */
export async function adoptFinishedDraft(clientRow) {
  if (isWorkoutOpen() || !offlineAccount()) return false;
  let key;
  let draft = null;
  try {
    key = await storageKey(clientRow || '');
    draft = JSON.parse(localStorage.getItem(key));
  } catch (_) {
    return false;
  }
  if (!draft || !draft.session || !FINISHED.includes(draft.session.status) || !(draft.dirty || draft.pending)) return false;
  await enqueueWorkout(clientRow, draft);
  try { localStorage.removeItem(key); } catch (_) {}
  return true;
}

/**
 * Экран тренировки закрыли: черновик закрытого занятия — в очередь и
 * отправить. После снятия экрана, а не во время: пока он открыт, черновик
 * его (isWorkoutOpen).
 */
export function settleClosed(clientRow) {
  setTimeout(() => {
    adoptFinishedDraft(clientRow).catch(() => false).then(() => flushOutbox()).catch(() => {});
  }, 0);
}

/* ==========================================================================
 * Отправка
 * ========================================================================== */

let flushing = null;

/**
 * Отправить очередь. Последовательно: сервер считает версии занятия, и
 * параллельные записи одного человека ему ни к чему. Нет связи — стоп до
 * следующего повода; отказ по одной записи остальные не держит.
 *
 * Возвращает { sent, left }.
 */
export function flushOutbox() {
  if (flushing) return flushing;
  flushing = run().finally(() => { flushing = null; });
  return flushing;
}

async function run() {
  const account = offlineAccount();
  if (!account) return { sent: 0, left: 0 };
  await adoptFallbacks().catch(() => {});
  await adoptFinishedDraft('').catch(() => {});
  const rows = await dbList('outbox', account + '|').catch(() => []);
  let sent = 0;
  let left = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const { key, value } = rows[i];
    if (value.state === 'conflict') { left += 1; continue; }
    let outcome;
    try {
      outcome = await send(key, value);
    } catch (_) {
      // Нет связи или вход кончился — дальше не пробуем, всё остаётся
      left += rows.length - i;
      break;
    }
    if (outcome === 'sent') sent += 1;
    else left += 1;
  }
  if (sent) changed();
  // Замеры и настройки тренажёров (offline-writes.js) — следом, тем же
  // поводом. Связи нет — workout.save уже это показал, но их проба дешёвая
  const writes = await flushWrites().catch(() => ({ sent: 0, left: 0 }));
  return { sent: sent + writes.sent, left: left + writes.left };
}

/**
 * Одна запись очереди — до конца. Как в журнале (Workout.jsx, save): если
 * связь пропадала посреди тренировки, у записи есть «потерянный» снимок
 * (pending) — например, ещё идущее занятие. Его повторяем первым и тем же
 * номером: он мог дойти до сервера. Принят, а на телефоне с тех пор есть
 * правки (завершение) — следом уходит последняя версия, уже от версии
 * сервера. Удаляется запись, только когда сервер принял последнее.
 */
async function send(key, entry) {
  let current = entry;
  const params = paramsOf(entry.clientRow);
  for (let step = 0; step < 4; step += 1) {
    let record = current.record;
    if (!record.pending) {
      record = {
        ...record,
        pending: {
          session: record.session, revision: record.revision, requestId: uid(), edit: record.edit,
          ...(typeof record.serverTitle === 'string' ? { baseTitle: record.serverTitle } : {}),
        },
      };
      // Номер сохранения — на телефон ДО отправки: ответ может потеряться,
      // и повтор обязан прийти с тем же номером
      current = { ...current, record };
      await dbPut('outbox', key, current);
    }

    let result;
    try {
      result = await apiMutate('workout.save', { ...params, ...record.pending }, { quiet: true });
    } catch (error) {
      // Код 0 — сервер не ответил; 401 — вход кончился. Запись не тронута,
      // номер сохранения тот же: повторим, когда будет связь и вход
      if (!error || !error.code || error.code === 401) throw error;
      // Явный отказ сервера: показать и не повторять тем же снимком
      await dbPut('outbox', key, { ...current, record: { ...record, pending: null }, state: 'error', error: error.message || 'Сервер не принял занятие.' });
      changed();
      return 'error';
    }

    if (result && (result.conflict || result.activeConflict)) {
      await dbPut('outbox', key, { ...current, record, state: 'conflict', error: '' });
      changed();
      return 'conflict';
    }

    const saved = result && result.session;
    if (!saved || record.pending.edit === record.edit) {
      await dbDelete('outbox', key);
      if (saved) {
        synced.add(String(saved.id));
        const prefix = String(key).slice(0, String(key).lastIndexOf('|') + 1);
        await dbPut('sessions', prefix + saved.id, saved).catch(() => {});
      }
      return 'sent';
    }

    // Принят прежний снимок, а последняя версия — на телефоне: она следующая.
    // Связь с программой и месяц ведёт сервер — их берём из его ответа
    current = {
      ...current,
      record: {
        ...record,
        session: {
          ...record.session, startedAt: saved.startedAt, updatedAt: saved.updatedAt,
          sourceBlock: saved.sourceBlock, sourceBlockId: saved.sourceBlockId, month: saved.month,
        },
        revision: saved.revision,
        serverTitle: saved.title,
        pending: null,
      },
    };
    await dbPut('outbox', key, current);
  }
  return 'left';
}

/* ==========================================================================
 * Когда отправлять
 * ========================================================================== */

let started = false;
let timer = null;

/**
 * Запуск отправки по поводам: сейчас, появилась сеть, вернулись в
 * приложение, и раз в минуту, пока в очереди что-то есть. Вызывается из
 * App.jsx, когда известно, кто вошёл.
 */
export function startOutbox() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const kick = () => { flushOutbox().then(({ left }) => schedule(left)).catch(() => {}); };
  const schedule = (left) => {
    clearTimeout(timer);
    if (left) timer = setTimeout(kick, 60000);
  };
  window.addEventListener('online', kick);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'hidden') kick(); });
  }
  onOutboxChange(() => { if (!timer) schedule(1); });
  onWritesChange(() => { if (!timer) schedule(1); });
  onOfflineAccount((next) => { if (next) adoptFallbacks().then(kick).catch(kick); });
  adoptFallbacks().then(kick).catch(kick);
}

/**
 * Временная метка из старого сохранённого ответа сменилась постоянной —
 * это тот же человек: его записи переезжают под постоянную метку.
 */
async function adoptFallbacks() {
  const to = offlineAccount();
  const from = takeFallbacks();
  for (const old of from) {
    for (const store of ['outbox', 'sessions', 'writes']) {
      const rows = await dbList(store, old + '|').catch(() => []);
      for (const { key, value } of rows) {
        await dbPut(store, to + String(key).slice(old.length), value);
        await dbDelete(store, key);
      }
    }
  }
  if (from.length) changed();
}

/* ==========================================================================
 * Журнал без сети
 * ========================================================================== */

/** Что сделано — коротко, как отдаёт сервер в workout.list (lib/workouts.js) */
function doneSets(session) {
  return (session.exercises || []).reduce((n, e) => n + (e.sets || []).filter((s) => s.state === 'done').length, 0);
}

function doneSummary(session) {
  return (session.exercises || [])
    .map((e) => ({
      name: e.name,
      supersetGroup: e.supersetGroup || '',
      ...(e.track ? { track: e.track } : {}),
      sets: (e.sets || [])
        .filter((x) => x.state === 'done' && x.kind !== 'warmup')
        .map(({ state, kind, rpe, raised, own, suggest, ...x }) => ({ ...x, weight: x.weight || '', reps: x.reps || '' })),
    }))
    .filter((e) => e.sets.length > 0);
}

/** Занятие в виде строки списка; local — пометки очереди */
export function listItem(session, local = null) {
  const s = session || {};
  return {
    id: s.id, title: s.title, month: s.month, status: s.status,
    sourceBlock: s.sourceBlockId ? (s.sourceBlock || '') : '', sourceBlockId: s.sourceBlockId || '',
    updatedAt: s.updatedAt || s.finishedAt || s.startedAt, startedAt: s.startedAt, revision: s.revision || 0,
    elapsedMs: s.elapsedMs || 0, done: doneSets(s),
    ...(s.status === 'completed' ? { exercises: doneSummary(s) } : {}),
    ...(local ? { local: local.state || 'local', localError: local.error || '' } : {}),
  };
}

/**
 * Список занятий карточки: с сервера, без связи — последний полученный,
 * поверх — очередь телефона. Возвращает { sessions, offline }.
 */
export async function journalList(clientRow, extra = {}) {
  const params = { ...paramsOf(clientRow), ...extra };
  let sessions = [];
  let offline = false;
  try {
    const read = await apiFresh('workout.list', params);
    sessions = (read.data && read.data.sessions) || [];
    offline = read.offline;
  } catch (error) {
    // Без связи и без сохранённого списка — хотя бы очередь телефона
    if (error && error.code) throw error;
    offline = true;
  }
  if (extra.familyRow) return { sessions, offline };

  await adoptFinishedDraft(clientRow).catch(() => {});
  const local = await localWorkouts(clientRow);
  if (!local.length) return { sessions, offline };
  const mine = new Set(local.map((e) => e.sessionId));
  return {
    sessions: [
      ...local.map((e) => listItem(e.record.session, e)),
      ...sessions.filter((s) => !mine.has(String(s.id))),
    ],
    offline,
  };
}

/**
 * Занятие целиком: сервер, без связи — очередь или сохранённая история.
 * { session, local } — local: занятие из очереди телефона.
 */
export async function journalGet(clientRow, id) {
  try {
    return await apiPublic('workout.get', { ...paramsOf(clientRow), id });
  } catch (error) {
    if (error && error.code) throw error;
    const account = offlineAccount();
    if (account) {
      const entry = await dbGet('outbox', scope(clientRow, account) + id).catch(() => null);
      if (entry) return { session: entry.record.session, local: true };
      const saved = await dbGet('sessions', scope(clientRow, account) + id).catch(() => null);
      if (saved) return { session: saved };
    }
    throw error;
  }
}

/** История с сервера — целиком на телефон (offline-prefetch.js) */
export async function saveRecentWorkouts(clientRow, sessions) {
  const account = offlineAccount();
  if (!account) return;
  const prefix = scope(clientRow, account);
  await dbReplace('sessions', prefix, (sessions || []).filter((s) => s && s.id).map((s) => ({ key: prefix + s.id, value: s })));
}

/** Выход из аккаунта: всё этого человека с телефона */
export async function forgetOfflineAccount(account = offlineAccount()) {
  if (!account) return;
  await Promise.all(['outbox', 'sessions', 'writes'].map((store) => dbReplace(store, account + '|', []).catch(() => {})));
  changed();
}

/* ==========================================================================
 * «Было» по занятиям телефона
 * ========================================================================== */

/**
 * Веса «в прошлый раз» в тренировке программы — с учётом занятий, которые
 * ещё не дошли до сервера. Сервер считает lastWeight по своему журналу, и
 * без связи вторая подряд «Тренировка А» подсказывала бы вес двухнедельной
 * давности, а не вчерашний. Сплит-пары не трогаем: у них веса по участникам.
 */
export function withLocalWeights(block, local) {
  if (!block || !Array.isArray(block.exercises) || !local || !local.length) return block;
  const done = local
    .map((e) => e.record && e.record.session)
    .filter((s) => s && s.status === 'completed')
    .sort((a, b) => String(b.finishedAt || b.startedAt || '').localeCompare(String(a.finishedAt || a.startedAt || '')));
  if (!done.length) return block;
  const same = (a, b) => (a.exerciseId && b.exerciseId ? Number(a.exerciseId) === Number(b.exerciseId) : String(a.name || '').trim().toLowerCase() === String(b.name || '').trim().toLowerCase());
  return {
    ...block,
    exercises: block.exercises.map((ex) => {
      if (ex.performers && ex.performers.length) return ex;
      for (const s of done) {
        const hit = (s.exercises || []).find((x) => same(x, ex) && !(x.sets || []).some((set) => set.who));
        if (!hit) continue;
        const sets = (hit.sets || []).filter((set) => set.state === 'done' && set.kind !== 'warmup' && String(set.weight || '').trim());
        if (!sets.length) continue;
        return { ...ex, lastWeight: String(sets[sets.length - 1].weight).trim() };
      }
      return ex;
    }),
  };
}
