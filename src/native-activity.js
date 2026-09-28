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
export async function takeActions() {
  const la = activity();
  if (!la || !la.takeActions) return [];
  try {
    const r = await la.takeActions();
    return Array.isArray(r && r.actions) ? r.actions.filter((a) => a && a.sessionId && a.kind) : [];
  } catch (_) { return []; }
}

const WEIGHT_RE = /^\d+(\.\d+)?$/;

/** Подходы упражнения того же человека */
const mine = (ex, a) => ex.id === String(a.exerciseId || '');
const whose = (set, a) => (set.who || '') === String(a.who || '');

/**
 * Проиграть нажатое на плашке в занятие:
 *  - weight — вес в текущий и оставшиеся подходы упражнения (у пары — своему);
 *  - done — первый неотмеченный подход упражнения сделан, с весом с плашки;
 *  - rest — отдых до restUntil (если позже нынешнего).
 * Чужое занятие и непонятное пропускаем.
 */
export function applyActions(session, actions, platform = '') {
  let s = session;
  for (const a of actions) {
    if (String(a.sessionId) !== s.id) continue;
    if (a.kind === 'weight' && WEIGHT_RE.test(String(a.value))) {
      s = { ...s, exercises: s.exercises.map((ex) => !mine(ex, a) ? ex : {
        ...ex, sets: ex.sets.map((set) => set.state === 'pending' && whose(set, a) ? { ...set, weight: String(a.value) } : set),
      }) };
    } else if (a.kind === 'done') {
      let marked = false;
      s = { ...s, exercises: s.exercises.map((ex) => !mine(ex, a) || marked ? ex : {
        ...ex, sets: ex.sets.map((set) => {
          if (marked || set.state !== 'pending' || !whose(set, a)) return set;
          marked = true;
          return { ...set, state: 'done', ...(WEIGHT_RE.test(String(a.weight || '')) ? { weight: String(a.weight) } : {}) };
        }),
      }) };
    } else if (a.kind === 'rest' && Number(a.restUntil) > (s.restUntil || 0) && s.status === 'active') {
      s = { ...s, restUntil: Math.round(Number(a.restUntil)), restLocal: platform };
    }
  }
  return s;
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
