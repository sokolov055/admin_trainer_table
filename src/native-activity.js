/**
 * Плашка идущей тренировки на экране блокировки iPhone (Live Activity).
 *
 * Рисует её расширение приложения (mobile/ios/App/FitTrackActivity), а
 * данные даёт эта страница: тренировка, упражнение, подход, вес и конец
 * отдыха, полоска подходов, следующее упражнение и тема приложения (светлая
 * или тёмная плашка). Секундомер и отсчёт отдыха система ведёт сама —
 * телефон может спать в кармане. Кнопка «Отдых» на плашке запускает отдых
 * без приложения; страница забирает его при возврате (takePendingRest).
 *
 * Модуль WorkoutActivity есть только в сборке приложения с плашкой. В
 * старой сборке, на Android и в браузере всё здесь молча ничего не делает.
 */
import { bridge, isNativeApp, plugin } from './native-bridge.js';
import { trackOf, volumeOf } from './exercise-track.js';

function activity() {
  if (!isNativeApp()) return null;
  const cap = bridge();
  try { if (cap.isPluginAvailable && !cap.isPluginAvailable('WorkoutActivity')) return null; } catch (_) { return null; }
  return plugin('WorkoutActivity');
}

/** «60 кг × 8», «12 повт.», «время 20» — что сделать в подходе */
function setText(set) {
  const out = [];
  const weight = String(set.weight || '').trim();
  const reps = String(set.reps || '').trim();
  if (weight) out.push(weight + ' кг');
  if (reps) out.push((weight ? '× ' : '') + reps + (weight ? '' : ' повт.'));
  if (!weight && !reps && set.time) out.push('время ' + set.time);
  return out.join(' ');
}

/** Упражнения с подходами — список на часах тренера: как exerciseList
 *  сервера (server/src/lib/watch-workout.js) */
export function exerciseList(s) {
  return s.exercises.slice(0, 30).map((ex) => ({
    id: ex.id || '',
    name: ex.name || 'Упражнение',
    sets: ex.sets.slice(0, 20).map((x) => x.state || 'pending'),
    who: ex.sets.slice(0, 20).map((x) => x.who || ''),
    // Вес и повторы подходов — правка подхода с часов
    weights: ex.sets.slice(0, 20).map((x) => String(x.weight || '')),
    reps: ex.sets.slice(0, 20).map((x) => String(x.reps || '')),
  }));
}

/** Карточка самого тренера («Мои тренировки»): её занятие — своё, не клиента */
const SELF_KEY = 'fittrack_self_row';
export function setSelfRow(row) {
  try { if (row) localStorage.setItem(SELF_KEY, String(row)); } catch (_) {}
}
function selfRow() {
  try { return Number(localStorage.getItem(SELF_KEY)) || 0; } catch (_) { return 0; }
}
/** Тренер ведёт клиента: на часах первым — список упражнений */
export function isCoaching(clientRow, clientView = false) {
  return !!clientRow && !clientView && Number(clientRow) !== selfRow();
}

/**
 * Что показать на плашке. record — черновик занятия из Workout.jsx:
 * session и tick (когда elapsedMs последний раз досчитан).
 */
export function activityPayload(record, { coach = false } = {}) {
  const s = record && record.session;
  if (!s || !['active', 'paused'].includes(s.status)) return null;
  const sets = s.exercises.flatMap((e) => e.sets);
  const done = sets.filter((x) => x.state === 'done').length;
  const ei = s.exercises.findIndex((e) => e.sets.some((x) => x.state === 'pending'));
  let exercise = '';
  let detail = '';
  let exerciseDone = 0;
  let exerciseTotal = 0;
  let next = '';
  if (ei >= 0) {
    const ex = s.exercises[ei];
    const si = ex.sets.findIndex((x) => x.state === 'pending');
    const set = ex.sets[si];
    // У пары — номер подхода у своего человека и его имя
    const own = set.who ? ex.sets.filter((x) => x.who === set.who) : ex.sets;
    const n = own.indexOf(set) + 1;
    exercise = ex.name;
    exerciseTotal = own.length;
    exerciseDone = own.filter((x) => x.state !== 'pending').length;
    const after = s.exercises.slice(ei + 1).find((e) => e.sets.some((x) => x.state === 'pending'));
    if (after) next = nextText(after);
    detail = [
      set.who || '',
      (trackOf(ex).kind === 'cardio' ? 'Отрезок ' : 'Подход ') + n + ' из ' + own.length + (set.kind === 'warmup' ? ', разминка' : ''),
      setText(set),
    ].filter(Boolean).join(' · ');
  }
  const paused = s.status !== 'active';
  const tick = record.tick || Date.now();
  return {
    sessionId: s.id,
    title: s.title || 'Тренировка',
    exercise,
    detail,
    // Секундомер идёт от «начала без пауз»: так он совпадает с экраном
    startedAt: Math.round((tick - (s.elapsedMs || 0)) / 1000) * 1000,
    ...(paused ? { pausedSeconds: Math.round((s.elapsedMs || 0) / 1000) } : {}),
    // Отдых остаётся и после конца: плашка считает, насколько он затянулся
    ...(!paused && s.restUntil > Date.now() - REST_OVER_MS ? { restUntil: s.restUntil } : {}),
    done,
    total: sets.length,
    exerciseDone,
    exerciseTotal,
    next,
    dark: darkTheme(),
    sets: setQueue(s),
    // Кнопка «Отдых» на плашке: выбранная длительность, «вручную» — 1:30
    restSeconds: s.restSeconds || 90,
    // Первый экран часов: объём и упражнения
    volume: Math.round(s.exercises.reduce((n, e) => n + e.sets
      .filter((x) => x.state === 'done' && x.kind !== 'warmup')
      .reduce((m, x) => m + volumeOf(x, trackOf(e)), 0), 0)),
    exercisesDone: s.exercises.filter((e) => e.sets.length && !e.sets.some((x) => x.state === 'pending')).length,
    exercisesTotal: s.exercises.length,
    // Часы тренера: список упражнений с подходами (01.10.2026)
    exercises: exerciseList(s),
    coach: !!coach,
  };
}

/** Тема приложения: выбрана вручную (data-theme) или системная */
function darkTheme() {
  try {
    const set = document.documentElement.getAttribute('data-theme');
    if (set) return set === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (_) { return false; }
}

/** «Отжимания на брусьях · 3 × 10» — следующее упражнение */
function nextText(ex) {
  const reps = String((ex.sets[0] && ex.sets[0].reps) || '').trim();
  return ex.name + ' · ' + ex.sets.length + (reps ? ' × ' + reps : ' подх.');
}

/** Сколько подходов вперёд знает плашка: «Отдых» на ней отмечает подход
 *  и переходит к следующему, пока страница спит */
const QUEUE = 12;

/**
 * Очередь подходов для плашки: текущий и следующие по порядку занятия.
 * У силовых вес отдельно — его меняют кнопки плашки; у остальных — что
 * сделать строкой (amount). Старая сборка очередь не читает.
 */
export function setQueue(s) {
  const out = [];
  s.exercises.forEach((ex, ei) => {
    ex.sets.forEach((set) => {
      if (set.state !== 'pending' || out.length >= QUEUE) return;
      const own = set.who ? ex.sets.filter((x) => x.who === set.who) : ex.sets;
      const n = own.indexOf(set) + 1;
      const after = s.exercises.slice(ei + 1).find((e) => e.sets.some((x) => x.state === 'pending'));
      const strength = trackOf(ex).kind === 'strength' && !!ex.id;
      out.push({
        exerciseId: ex.id || '',
        who: set.who || '',
        exercise: ex.name,
        detail: [set.who || '', (trackOf(ex).kind === 'cardio' ? 'Отрезок ' : 'Подход ') + n + ' из ' + own.length
          + (set.kind === 'warmup' ? ', разминка' : '')].filter(Boolean).join(' · '),
        ...(strength ? { weight: String(set.weight || '').trim() } : {}),
        reps: strength ? String(set.reps || '').trim() : '',
        amount: strength ? '' : setText(set),
        exerciseDone: n - 1,
        exerciseTotal: own.length,
        next: after ? nextText(after) : '',
      });
    });
  });
  return out;
}

/** Отдых кончился давно — «+» на плашке уже ничего не говорит */
const REST_OVER_MS = 30 * 60 * 1000;

let last = '';
/** Чья плашка сейчас на экране — чтобы открытое из истории старое
 *  завершённое занятие не убрало плашку идущего */
let shown = '';

/** Чьё занятие на плашке: { sessionId, clientRow } — чтобы при запуске
 *  приложения досохранить «Завершить» с плашки и узнать забытую плашку
 *  (live-settle.js), не открывая экран тренировки */
export const LIVE_KEY = 'fittrack_live_v1';

export function liveOwner() {
  try { return JSON.parse(localStorage.getItem(LIVE_KEY)) || null; } catch (_) { return null; }
}

/** Показать или обновить плашку; повтор того же — без вызова телефона.
 *  clientRow — чьё занятие (у тренера); у клиента — пусто */
export function showWorkoutActivity(record, clientRow, { coach = false } = {}) {
  const la = activity();
  const payload = activityPayload(record, { coach });
  if (!la || !payload) return Promise.resolve(false);
  const sig = JSON.stringify(payload);
  if (sig === last) return Promise.resolve(true);
  last = sig;
  shown = payload.sessionId;
  try { localStorage.setItem(LIVE_KEY, JSON.stringify({ sessionId: shown, clientRow: clientRow || 0 })); } catch (_) {}
  return la.update(payload).then((r) => !!(r && r.shown)).catch(() => { last = ''; return false; });
}

/**
 * Отдых, начатый кнопкой «Отдых» на плашке, пока страница спала:
 * { sessionId, restUntil } или null. Забирается один раз.
 */
export async function takePendingRest() {
  const la = activity();
  if (!la || !la.takePendingRest) return null;
  try {
    const r = await la.takePendingRest();
    return r && r.sessionId && Number(r.restUntil) > 0 ? { sessionId: String(r.sessionId), restUntil: Math.round(Number(r.restUntil)) } : null;
  } catch (_) { return null; }
}

/**
 * Нажатое на плашке, пока страница спала, — по порядку: «Отдых» (подход
 * сделан + отдых), вес. Сборка с очередью подходов (takeActions).
 * Забирается один раз; пусто — [].
 */
export async function takeActions(sessionId) {
  const la = activity();
  if (!la || !la.takeActions) return [];
  try {
    const r = await la.takeActions(sessionId ? { sessionId: String(sessionId) } : {});
    return Array.isArray(r && r.actions) ? r.actions.filter((a) => a && a.sessionId && a.kind) : [];
  } catch (_) { return []; }
}

const WEIGHT_RE = /^\d+(\.\d+)?$/;

/** Подходы упражнения того же человека */
const mine = (ex, a) => ex.id === String(a.exerciseId || '');
const whose = (set, a) => (set.who || '') === String(a.who || '');

/**
 * Проиграть нажатое на плашке и часах в занятие:
 *  - weight — вес в текущий и оставшиеся подходы упражнения (у пары — своему);
 *  - done — первый неотмеченный подход упражнения сделан, с весом с плашки;
 *  - rest — отдых до restUntil (если позже нынешнего); restStop — закончить;
 *  - restSeconds — длительность отдыха;
 *  - skipExercise — оставшиеся подходы упражнения пропущены;
 *  - pause / resume — со временем нажатия: страница спала, а секундомер
 *    должен встать и пойти тогда, когда нажали, а не когда открыли;
 *  - finish — занятие завершено, неотмеченное пропущено.
 * now — когда проигрываем: время занятия уже досчитано до него (change).
 * Чужое занятие и непонятное пропускаем.
 */
export function applyActions(session, actions, platform = '', now = Date.now()) {
  let s = session;
  for (const a of actions) {
    if (String(a.sessionId) !== s.id || !['active', 'paused'].includes(s.status)) continue;
    const at = Math.min(now, Number(a.at) || now);
    if (a.kind === 'weight' && WEIGHT_RE.test(String(a.value))) {
      s = { ...s, exercises: s.exercises.map((ex) => !mine(ex, a) ? ex : {
        ...ex, sets: ex.sets.map((set) => set.state === 'pending' && whose(set, a) ? { ...set, weight: String(a.value) } : set),
      }) };
    } else if (a.kind === 'done') {
      // setIndex — какой по счёту подход (у пары — у своего человека): его и
      // отмечаем, если он ещё не отмечен. Тренер и клиент нажали «Отдых» на
      // одном подходе со своих часов — отметится один, а не два. Без setIndex
      // (старые сборки) — первый неотмеченный
      const index = Number.isInteger(Number(a.setIndex)) && a.setIndex !== '' && a.setIndex !== undefined ? Number(a.setIndex) : -1;
      let marked = false;
      s = { ...s, exercises: s.exercises.map((ex) => {
        if (!mine(ex, a) || marked) return ex;
        const own = ex.sets.filter((set) => whose(set, a));
        const target = index >= 0 ? own[index] : own.find((set) => set.state === 'pending');
        if (!target || target.state !== 'pending') return ex;
        marked = true;
        return { ...ex, sets: ex.sets.map((set) => set !== target ? set
          : { ...set, state: 'done', ...(WEIGHT_RE.test(String(a.weight || '')) ? { weight: String(a.weight) } : {}) }) };
      }) };
    } else if (a.kind === 'rest' && Number(a.restUntil) > (s.restUntil || 0) && s.status === 'active') {
      s = { ...s, restUntil: Math.round(Number(a.restUntil)), restLocal: platform };
    } else if (a.kind === 'restStop' && s.restUntil) {
      s = { ...s, restUntil: 0 };
    } else if (a.kind === 'restSeconds' && Number(a.value) > 0 && Number(a.value) <= 1800) {
      s = { ...s, restSeconds: Math.round(Number(a.value)) };
    } else if (a.kind === 'skipExercise') {
      s = { ...s, exercises: s.exercises.map((ex) => !mine(ex, a) ? ex : {
        ...ex, sets: ex.sets.map((set) => set.state === 'pending' && whose(set, a) ? { ...set, state: 'skipped' } : set),
      }) };
    } else if (a.kind === 'pause' && s.status === 'active') {
      // Время с нажатия до открытия — не тренировка
      s = { ...s, status: 'paused', restUntil: 0, elapsedMs: Math.max(0, (s.elapsedMs || 0) - (now - at)) };
    } else if (a.kind === 'resume' && s.status === 'paused') {
      s = { ...s, status: 'active', elapsedMs: (s.elapsedMs || 0) + (now - at) };
    } else if (a.kind === 'setEdit') {
      // Исправили подход на часах (вес и повторы), сделан он или нет:
      // setIndex — какой по счёту подход у человека who
      const index = Math.floor(Number(a.setIndex));
      const reps = /^\d{1,3}$/.test(String(a.reps ?? '')) ? String(a.reps) : null;
      const weight = WEIGHT_RE.test(String(a.weight ?? '')) ? String(a.weight) : null;
      if (index >= 0 && (reps !== null || weight !== null)) {
        s = { ...s, exercises: s.exercises.map((ex) => {
          if (!mine(ex, a)) return ex;
          const target = ex.sets.filter((set) => whose(set, a))[index];
          if (!target) return ex;
          return { ...ex, sets: ex.sets.map((set) => set !== target ? set
            : { ...set, ...(weight !== null ? { weight } : {}), ...(reps !== null ? { reps } : {}) }) };
        }) };
      }
    } else if (a.kind === 'move') {
      // Перетащили упражнение в списке на часах: на место index
      const from = s.exercises.findIndex((ex) => mine(ex, a));
      const to = Math.max(0, Math.min(s.exercises.length - 1, Math.floor(Number(a.index))));
      if (from >= 0 && Number.isFinite(to) && from !== to) {
        const list = s.exercises.slice();
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        s = { ...s, exercises: list };
      }
    } else if (a.kind === 'finish') {
      // Ни одного сделанного подхода — занятия не было: отмена, как в приложении
      const any = s.exercises.some((ex) => ex.sets.some((set) => set.state === 'done'));
      s = { ...s, status: any ? 'completed' : 'cancelled', restUntil: 0,
        exercises: s.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((set) => set.state === 'pending' ? { ...set, state: 'skipped' } : set) })) };
    }
  }
  return s;
}

/** Занятие завершено или отменено — плашку убрать. sessionId — только
 *  если плашка его; без него — любую.
 *
 *  Чья плашка, помним не только в памяти (shown), но и на диске (LIVE_KEY):
 *  после перезапуска приложения shown пуст, и до 01.10.2026 завершённое
 *  занятие плашку не убирало — она висела часами («Идёт занятие» 3,5 ч) */
export function endWorkoutActivity(sessionId) {
  const la = activity();
  const owner = shown || (liveOwner() || {}).sessionId || '';
  if (!la || (sessionId && owner && sessionId !== owner)) return Promise.resolve();
  last = '';
  shown = '';
  try { localStorage.removeItem(LIVE_KEY); } catch (_) {}
  return la.end().catch(() => {});
}

/** Что на плашке сейчас и что завершили с неё, пока страница спала:
 *  { sessionId, clientRow, updatedAt, finished: [id] } или null */
export async function liveState() {
  const la = activity();
  if (!la || !la.live) return null;
  try { return await la.live(); } catch (_) { return null; }
}

/** Открыт ли экран тренировки (Workout.jsx): тогда нажатое на плашке
 *  забирает он сам */
let workoutOpen = false;
export function setWorkoutOpen(open) { workoutOpen = !!open; }
export function isWorkoutOpen() { return workoutOpen; }

/** Часы ведут тренировку через сервер и что-то в ней поменяли:
 *  cb({ sessionId, clientRow, ended }). Возвращает отписку */
export function onWatchState(cb) {
  const la = activity();
  if (!la || !la.addListener) return () => {};
  let handle = null;
  let gone = false;
  Promise.resolve(la.addListener('watchState', (e) => cb({
    sessionId: String((e && e.sessionId) || ''), clientRow: Number(e && e.clientRow) || 0, ended: !!(e && e.ended),
  }))).then((h) => { if (gone && h && h.remove) h.remove(); else handle = h; }).catch(() => {});
  return () => { gone = true; if (handle && handle.remove) handle.remove(); };
}
