/**
 * Плашка идущей тренировки на экране блокировки iPhone (Live Activity).
 *
 * Рисует её расширение приложения (mobile/ios/App/FitTrackActivity), а
 * данные даёт эта страница: тренировка, упражнение, подход, вес и конец
 * отдыха. Секундомер и отсчёт отдыха система ведёт сама — телефон может
 * спать в кармане. Кнопок пока нет (28.09.2026).
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
  if (ei >= 0) {
    const ex = s.exercises[ei];
    const si = ex.sets.findIndex((x) => x.state === 'pending');
    const set = ex.sets[si];
    // У пары — номер подхода у своего человека и его имя
    const own = set.who ? ex.sets.filter((x) => x.who === set.who) : ex.sets;
    const n = own.indexOf(set) + 1;
    exercise = ex.name;
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
    ...(!paused && s.restUntil > Date.now() ? { restUntil: s.restUntil } : {}),
    done,
    total: sets.length,
  };
}

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

/** Занятие завершено или отменено — плашку убрать. sessionId — только
 *  если плашка его; без него — любую */
export function endWorkoutActivity(sessionId) {
  const la = activity();
  if (!la || (sessionId && sessionId !== shown)) return Promise.resolve();
  last = '';
  shown = '';
  return la.end().catch(() => {});
}
