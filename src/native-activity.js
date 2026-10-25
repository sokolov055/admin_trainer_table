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
import { trackOf, volumeOf, setText as trackSetText } from './exercise-track.js';
import { closeSets, resultIssue, withSet, withWarmup } from './workout-model.js';
import { rateSet, isDumbbell, stepOf, suggestText, isAssisted, assistStep, settleOrder, tiredText } from './effort.js';

const isEffort = (e) => ['easy', 'ok', 'hard'].includes(e);
/** Подход перед этим у того же человека — для подписи подобранного веса */
function prevOf(ex, set) {
  const own = ex.sets.filter((x) => (x.who || '') === (set.who || ''));
  const prev = own[own.indexOf(set) - 1];
  return prev && prev.state === 'done' ? prev : null;
}

function activity() {
  if (!isNativeApp()) return null;
  const cap = bridge();
  try { if (cap.isPluginAvailable && !cap.isPluginAvailable('WorkoutActivity')) return null; } catch (_) { return null; }
  return plugin('WorkoutActivity');
}

/** «60 кг × 8», «12 повт.», «время 20» — что сделать в подходе */
function setText(set, ex) {
  // Кардио — целиком, главная цель первой: «3000 м · 8 км/ч» (FT-475)
  if (ex && trackOf(ex).kind === 'cardio') return trackSetText(set, trackOf(ex)).replace(/^\?$/, '');
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
    // Суперсет — на часах одним блоком с кругами внутри
    group: ex.supersetGroup || '',
    sets: ex.sets.slice(0, 20).map((x) => x.state || 'pending'),
    who: ex.sets.slice(0, 20).map((x) => x.who || ''),
    // Вес и повторы подходов — правка подхода с часов; у веса помощи — помощь
    weights: ex.sets.slice(0, 20).map((x) => String((isAssisted(ex) ? x.assist : x.weight) || '')),
    ...(isAssisted(ex) ? { assist: true } : {}),
    ...(ex.rest ? { rest: ex.rest } : {}),
    reps: ex.sets.slice(0, 20).map((x) => String(x.reps || '')),
    // Разминочный подход — «разминка» в списке тренера (FT-533)
    kinds: ex.sets.slice(0, 20).map((x) => (x.kind === 'warmup' ? 'warmup' : 'work')),
    // Гантели — шаг колёсика 1 кг, остальное — 1,25 (03.10.2026)
    dumbbell: isDumbbell(ex),
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
      setText(set, ex),
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
    // С какого сохранения на сервере собрано (23.10.2026): часы, которые
    // ведут занятие через сервер, не берут прочитанное раньше их нажатий —
    // иначе «Норм» откатывался и таймер отдыха слетал на первой секунде
    ...(record.revision > 0 ? { revision: record.revision } : {}),
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

/** Сколько подходов вперёд знают часы и плашка: «Отдых» отмечает подход
 *  и переходит к следующему, пока страница спит. Было 12: страница спала,
 *  и после 12 отметок часы показывали «Все подходы отмечены» посреди
 *  тренировки (20.10.2026). Теперь — вся тренировка; плашке iPhone сам
 *  оставляет текущий круг и следующий (WorkoutState.forActivity) */
const QUEUE = 60;

/**
 * Очередь подходов для плашки: текущий и следующие по порядку занятия.
 * У силовых вес отдельно — его меняют кнопки плашки; у остальных — что
 * сделать строкой (amount). Старая сборка очередь не читает.
 */
export function setQueue(s) {
  // Блоки по порядку: отдельное упражнение или суперсет целиком (02.10.2026).
  // Суперсет — кругами: круг 1 — первый подход каждого упражнения подряд,
  // потом круг 2. Так его делают в зале, так ведут и часы, и плашка
  const units = [];
  s.exercises.forEach((ex, ei) => {
    const group = ex.supersetGroup || '';
    const found = group && units.find((u) => u.group === group);
    if (found) found.members.push({ ex, ei });
    else units.push({ group, members: [{ ex, ei }] });
  });
  const pending = (u) => u.members.some(({ ex }) => ex.sets.some((x) => x.state === 'pending'));
  const out = [];
  const item = (ex, set, extra) => {
    const own = set.who ? ex.sets.filter((x) => x.who === set.who) : ex.sets;
    const n = own.indexOf(set) + 1;
    // Вес помощи (гравитрон, FT-628): на часах в поле веса — помощь, «Легко»
    // её убавляет (assist: true для часов)
    const assist = isAssisted(ex) && !!ex.id;
    const strength = (trackOf(ex).kind === 'strength' && !!ex.id) || assist;
    const key = assist ? 'assist' : 'weight';
    return {
      exerciseId: ex.id || '',
      who: set.who || '',
      exercise: ex.name,
      detail: [set.who || '', (trackOf(ex).kind === 'cardio' ? 'Отрезок ' : 'Подход ') + n + ' из ' + own.length
        + (set.kind === 'warmup' ? ', разминка' : '')].filter(Boolean).join(' · '),
      ...(strength ? { weight: String(set[key] || '').trim() } : {}),
      ...(assist ? { assist: true } : {}),
      // Разминка (владелец, 22.10.2026): оценок нет — на часах одна «Готово»
      ...(set.kind === 'warmup' ? { warmup: true } : {}),
      // Для оценки на часах: шаг колёсика (гантели — 1 кг), шаг прибавки и
      // почему у подхода такой вес
      // У разминки шага нет: «Легко» на ней вес не прибавляет (FT-620)
      ...(strength ? { dumbbell: isDumbbell(ex), ...(set.kind !== 'warmup' ? { step: assist ? assistStep(ex) : stepOf(ex, Number(String(set.weight || '').replace(',', '.')) || 0) } : {}) } : {}),
      // Свой вес — и повторы: «+2 повт. · было легко» (22.10.2026)
      ...(suggestText(set, prevOf(ex, set), ex) || tiredText(ex, set) ? { suggest: suggestText(set, prevOf(ex, set), ex) || tiredText(ex, set) } : {}),
      // Отдых после этого подхода, если у упражнения он свой (20.10.2026)
      ...(ex.rest ? { rest: ex.rest } : {}),
      reps: strength ? String(set.reps || '').trim() : '',
      amount: strength ? '' : setText(set, ex),
      exerciseDone: n - 1,
      exerciseTotal: own.length,
      ...extra,
    };
  };
  units.forEach((u, ui) => {
    const after = units.slice(ui + 1).find(pending);
    const next = after ? (after.group ? 'Суперсет: ' + after.members.map(({ ex }) => ex.name).join(' + ') : nextText(after.members[0].ex)) : '';
    if (u.group && u.members.length > 1) {
      const rounds = Math.max(...u.members.map(({ ex }) => ex.sets.length));
      for (let r = 0; r < rounds; r += 1) {
        u.members.forEach(({ ex }) => {
          const set = ex.sets[r];
          if (!set || set.state !== 'pending' || out.length >= QUEUE) return;
          out.push(item(ex, set, {
            detail: 'Круг ' + (r + 1) + ' из ' + rounds + (set.kind === 'warmup' ? ', разминка' : ''),
            group: u.group, round: r, next,
          }));
        });
      }
      return;
    }
    const { ex } = u.members[0];
    ex.sets.forEach((set) => {
      if (set.state !== 'pending' || out.length >= QUEUE) return;
      out.push(item(ex, set, { next }));
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
/** Куда писать вес с часов: у веса помощи — в помощь (FT-628) */
const loadKey = (ex) => (isAssisted(ex) ? 'assist' : 'weight');
const whose = (set, a) => (set.who || '') === String(a.who || '');
/** Подход без подсказки веса — вес вписали с часов */
const omitSuggest = ({ suggest, ...set }) => set;

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
      // Лесенка (03.10.2026): вес текущего подхода и следующих с тем же
      // весом — 100 · 120 · 140 не сливаются в одно число. Вес с часов —
      // свой (own): оценки его больше не двигают
      s = { ...s, exercises: s.exercises.map((ex) => {
        if (!mine(ex, a)) return ex;
        const first = ex.sets.find((set) => set.state === 'pending' && whose(set, a));
        if (!first) return ex;
        const key = loadKey(ex);
        const was = String(first[key] || '');
        return { ...ex, sets: ex.sets.map((set) => set.state === 'pending' && whose(set, a) && (set === first || String(set[key] || '') === was)
          // Подсказка прежнего веса («−1 кг · после …») с ним уже не про
          // этот подход (FT-754)
          ? { ...omitSuggest(set), [key]: String(a.value), own: true } : set) };
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
        // «Отдых» отмечает текущий подход — первый неотмеченный. Часы и
        // iPhone до 1.4 (16) после «Отдыха» сдвигали номер следующих подходов
        // на лишний (07.10.2026): второй подход приходил номером третьего —
        // отмечались 1-й и 3-й. Номер за первым неотмеченным или за концом —
        // значит, первый неотмеченный
        const first = own.find((set) => set.state === 'pending');
        let target = index >= 0 ? own[index] : first;
        if (index >= 0 && (!target || (target.state === 'pending' && own.indexOf(first) < index))) target = first;
        if (!target || target.state !== 'pending') return ex;
        marked = true;
        const next = { ...ex, sets: ex.sets.map((set) => set !== target ? set
          : { ...set, state: 'done', ...(WEIGHT_RE.test(String(a.weight || '')) ? { [loadKey(ex)]: String(a.weight) } : {}) }) };
        // Оценка с часов (03.10.2026): вес следующих подходов — по effort.js
        return isEffort(a.effort) ? rateSet(next, ex.sets.indexOf(target), a.effort).ex : next;
      }) };
    } else if (a.kind === 'rest' && Number(a.restUntil) > Math.max(s.restUntil || 0, now) && s.status === 'active') {
      // Отдых, кончившийся до того, как дошёл (часы без связи отдали его
      // телефону позже, FT-753), — не отдых: «Отдых окончен» от него
      // всплывал на телефоне, где отдых никто не запускал
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
      // effort — отметили подход из списка с оценкой (03.10.2026)
      const effort = isEffort(a.effort) ? a.effort : '';
      if (index >= 0 && (reps !== null || weight !== null || effort)) {
        s = { ...s, exercises: s.exercises.map((ex) => {
          if (!mine(ex, a)) return ex;
          const target = ex.sets.filter((set) => whose(set, a))[index];
          if (!target) return ex;
          const next = { ...ex, sets: ex.sets.map((set) => set !== target ? set
            : { ...(weight !== null ? omitSuggest(set) : set), ...(weight !== null ? { [loadKey(ex)]: weight, own: true } : {}), ...(reps !== null ? { reps } : {}) }) };
          return effort && target.state === 'pending' ? rateSet(next, ex.sets.indexOf(target), effort).ex : next;
        }) };
      }
    } else if (a.kind === 'addSet') {
      // Подход с часов тренера (FT-533): warmup — разминочный перед
      // рабочими, иначе — в конец, как последний. Суперсет и пара — нет
      s = { ...s, exercises: s.exercises.map((ex) => (!mine(ex, a) || ex.supersetGroup ? ex
        : a.warmup ? withWarmup(ex) : withSet(ex))) };
    } else if (a.kind === 'move') {
      // Перетащили в списке на часах. Упражнение — на место index; суперсет
      // (a.group) — целиком: его упражнения подряд, первое — на место index
      // (номер в списке без них)
      const group = String(a.group || '');
      const moving = group ? s.exercises.filter((ex) => ex.supersetGroup === group) : s.exercises.filter((ex) => mine(ex, a));
      const rest = s.exercises.filter((ex) => !moving.includes(ex));
      let to = Math.max(0, Math.min(rest.length, Math.floor(Number(a.index))));
      // Суперсет — одно целое (02.10.2026): его упражнение переставляется
      // только среди своих, чужое (или другой суперсет) не встаёт в середину
      const own = !group && moving.length === 1 ? moving[0].supersetGroup || '' : '';
      if (own) {
        const at = rest.map((ex, i) => (ex.supersetGroup === own ? i : -1)).filter((i) => i >= 0);
        if (at.length) to = Math.max(at[0], Math.min(at[at.length - 1] + 1, to));
      } else {
        while (to > 0 && to < rest.length && rest[to].supersetGroup && rest[to].supersetGroup === rest[to - 1].supersetGroup) to += 1;
      }
      if (moving.length && Number.isFinite(to)) {
        const list = [...rest.slice(0, to), ...moving, ...rest.slice(to)];
        if (list.some((ex, i) => ex !== s.exercises[i])) s = { ...s, exercises: list };
      }
    } else if (a.kind === 'finish') {
      // Ни одного сделанного подхода — занятия не было: отмена, как в приложении
      const any = s.exercises.some((ex) => ex.sets.some((set) => set.state === 'done'));
      // Неотмеченные — пропущены с пометкой closed: «Продолжить» вернёт их
      // finishedAt — когда завершили на самом деле: без сети занятие дойдёт
      // до сервера позже, и время отправки его бы сдвинуло (FT-566)
      // Нажатое в фоне дошло позже — время и конец по нажатию, как на сервере
      // (watch-workout.js, 19.10.2026)
      const ran = s.status === 'active' ? Math.max(0, now - at) : 0;
      s = { ...s, status: any ? 'completed' : 'cancelled', restUntil: 0, finishedAt: new Date(at).toISOString(),
        elapsedMs: Math.max(0, (s.elapsedMs || 0) - ran), exercises: closeSets(s.exercises) };
    }
  }
  // Порядок и усталость (22.10.2026), как на сервере: effort.js settleOrder.
  // Нажатий для этого занятия не было — занятие то же
  if (s === session) return s;
  const settled = settleOrder(s.exercises);
  return settled === s.exercises ? s : { ...s, exercises: settled };
}

/**
 * Нажатия с часов и плашки — как на сервере (watch-handlers.js applyChecked,
 * FT-753): нажатие, после которого занятие не сохранить (подход «Тяжело» без
 * повторов), пропускается, остальные — ложатся. Раньше одна такая отметка с
 * часов останавливала сохранение всего занятия («Не сохранено: Рукоход,
 * подход 1: Введите число повторов»), сервер отставал, и часы, следуя ему,
 * возвращали к прошлому упражнению. Свои прежние ошибки занятия не трогаем
 */
export function applyChecked(session, actions, platform = '', now = Date.now()) {
  const before = resultIssue(session);
  const all = applyActions(session, actions, platform, now);
  if (all === session || !resultIssue(all) || resultIssue(all) === before) return all;
  let s = session;
  for (const a of actions) {
    const next = applyActions(s, [a], platform, now);
    if (next !== s && (!resultIssue(next) || resultIssue(next) === before)) s = next;
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

/**
 * Нажали кнопку будильника отдыха — «+30 с» или «Закрыть» (iPhone и часы,
 * сборка 1.4 (16)+): cb({ sessionId, kind: 'extend' | 'stop' | 'watch', restUntil }).
 * «watch» — нажали на часах или плашке (сборка 1.7+): отдых не трогать, только забрать журнал.
 * Нажатое уже в журнале (takeActions) — экран тренировки забирает его сразу.
 * Возвращает отписку
 */
export function onLiveAction(cb) {
  const la = activity();
  if (!la || !la.addListener) return () => {};
  let handle = null;
  let gone = false;
  Promise.resolve(la.addListener('liveAction', (e) => cb({
    sessionId: String((e && e.sessionId) || ''), kind: e && ['extend', 'watch'].includes(e.kind) ? e.kind : 'stop',
    restUntil: Math.round(Number(e && e.restUntil) || 0),
  }))).then((h) => { if (gone && h && h.remove) h.remove(); else handle = h; }).catch(() => {});
  return () => { gone = true; if (handle && handle.remove) handle.remove(); };
}

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
