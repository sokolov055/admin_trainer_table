/**
 * Плашка идущей тренировки на экране блокировки iPhone (Live Activity).
 *
 * Рисует её расширение приложения (mobile/ios/App/FitTrackActivity), а
 * данные даёт эта страница: тренировка, упражнение, подход, вес и конец
 * отдыха, полоска подходов, следующее упражнение и тема приложения (светлая
 * или тёмная плашка). Секундомер и отсчёт отдыха система ведёт сама —
 * телефон может спать в кармане. Кнопки «Отдых» и вес ±2,5 / ±10 кг на
 * плашке работают без приложения; страница забирает нажатое при возврате
 * (takePending).
 *
 * Модуль WorkoutActivity есть только в сборке приложения с плашкой. В
 * старой сборке, на Android и в браузере всё здесь молча ничего не делает.
 */
import { bridge, isNativeApp, plugin } from './native-bridge.js';
import { trackOf } from './exercise-track.js';

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

/**
 * Что показать на плашке. record — черновик занятия из Workout.jsx:
 * session и tick (когда elapsedMs последний раз досчитан).
 */
export function activityPayload(record) {
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
  // Силовое — вес отдельно: его меняют кнопки на плашке (±2,5 / ±10 кг)
  let weightFields = {};
  let amount = '';
  let exerciseId = '';
  let who = '';
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
    ].filter(Boolean).join(' · ');
    exerciseId = ex.id || '';
    who = set.who || '';
    if (trackOf(ex).kind === 'strength' && exerciseId) {
      weightFields = { weight: String(set.weight || '').trim(), reps: String(set.reps || '').trim() };
    } else {
      amount = setText(set);
    }
  }
  const paused = s.status !== 'active';
  const tick = record.tick || Date.now();
  return {
    sessionId: s.id,
    title: s.title || 'Тренировка',
    exercise,
    detail,
    amount,
    ...weightFields,
    exerciseId,
    who,
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
    // Кнопка «Отдых» на плашке: выбранная длительность, «вручную» — 1:30
    restSeconds: s.restSeconds || 90,
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

/** Отдых кончился давно — «+» на плашке уже ничего не говорит */
const REST_OVER_MS = 30 * 60 * 1000;

let last = '';
/** Чья плашка сейчас на экране — чтобы открытое из истории старое
 *  завершённое занятие не убрало плашку идущего */
let shown = '';

/** Показать или обновить плашку; повтор того же — без вызова телефона */
export function showWorkoutActivity(record) {
  const la = activity();
  const payload = activityPayload(record);
  if (!la || !payload) return Promise.resolve(false);
  const sig = JSON.stringify(payload);
  if (sig === last) return Promise.resolve(true);
  last = sig;
  shown = payload.sessionId;
  return la.update(payload).then((r) => !!(r && r.shown)).catch(() => { last = ''; return false; });
}

/**
 * Что нажали на плашке, пока страница спала: { rest: { sessionId,
 * restUntil }, weight: { sessionId, exerciseId, who, value } } — любое из
 * двух или ничего (null). Забирается один раз.
 */
export async function takePending() {
  const la = activity();
  if (!la || !la.takePending) return null;
  try {
    const r = (await la.takePending()) || {};
    const rest = r.rest && r.rest.sessionId && Number(r.rest.restUntil) > 0
      ? { sessionId: String(r.rest.sessionId), restUntil: Math.round(Number(r.rest.restUntil)) } : null;
    const weight = r.weight && r.weight.sessionId && r.weight.exerciseId && /^\d+(\.\d+)?$/.test(String(r.weight.value))
      ? { sessionId: String(r.weight.sessionId), exerciseId: String(r.weight.exerciseId), who: String(r.weight.who || ''), value: String(r.weight.value) } : null;
    return rest || weight ? { rest, weight } : null;
  } catch (_) { return null; }
}

/**
 * Вес с плашки — в занятие: текущий и все неотмеченные подходы
 * упражнения (у пары — только того, чей подход)
 */
export function applyWeight(session, weight) {
  return {
    ...session,
    exercises: session.exercises.map((ex) => ex.id !== weight.exerciseId ? ex : {
      ...ex,
      sets: ex.sets.map((set) => set.state === 'pending' && (set.who || '') === weight.who ? { ...set, weight: weight.value } : set),
    }),
  };
}

/** Занятие завершено или отменено — плашку убрать. sessionId — только
 *  если плашка его; без него — любую */
export function endWorkoutActivity(sessionId) {
  const la = activity();
  if (!la || (sessionId && sessionId !== shown)) return Promise.resolve();
  last = '';
  shown = '';
  return la.end().catch(() => {});
}
