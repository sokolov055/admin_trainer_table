import { trackOf, byTime, planScheme, planSet, volumeOf, techniqueOf, planOneSide, missing } from './exercise-track.js';
import { wasSet, scaleTo, isAssisted } from './effort.js';

export const uid = () => crypto.randomUUID();
export const blankSet = () => ({ weight: '', reps: '', rpe: '', state: 'pending', kind: 'work' });
// members — участники сплита: подходы собираются кругами на каждого, кто
// делает упражнение, с его весом; у подхода — чей он (who)
export function fromPlan(block, month, members = []) {
  const split = members.length > 1;
  // «+5» у подтягиваний — добавка к своему весу: в поле идёт 5
  const num = (v) => { const x = String(v || '').replace(/^\+\s*/, ''); return /^\d+([.,]\d+)?$/.test(x) ? x.replace(',', '.') : ''; };
  // sourceBlockId — id тренировки программы: по нему занятие видно в её
  // «Выполненных», какое бы название ни носили она и занятие
  // startedAt — когда начали на телефоне: начатое без связи сервер получит
  // позже и возьмёт это время, а не время сохранения (02.10.2026)
  return { id: uid(), title: block.title, sourceBlock: block.title, sourceBlockId: block.id || '', month,
    startedAt: new Date().toISOString(),
    // restSeconds — сколько отдыхать после отмеченного подхода. Ноль
    // значит «не запускать сам»: пока человек не выбрал длительность,
    // таймер ведёт себя как раньше.
    status: 'active', elapsedMs: 0, restUntil: 0, restSeconds: 0, note: '',
    exercises: block.exercises.slice(0, 30).map(e => withTechnique(e, {
      id: uid(), name: e.name, note: '',
      // Упражнение из базы: по нему сервер ведёт историю весов клиента
      ...(e.exerciseId ? { exerciseId: e.exerciseId } : {}),
      // Тренажёр, на котором делали в прошлый раз (FT-478): вес — по нему.
      // У пары у каждого свой тренажёр и свой вес на нём (FT-488)
      ...(e.machine && !split ? { machine: { uid: e.machine.uid, name: e.machine.name || '', ...(e.machine.step > 0 ? { step: e.machine.step } : {}) } } : {}),
      ...(split && e.splitMachines ? { machines: pairMachines(e.splitMachines, doersOf(e, members)) } : {}),
      // Тип учёта — что записывать в подходе; снимок, в занятии правится
      // только для этого занятия
      ...(e.track || e.cardio ? { track: trackOf(e) } : {}),
      // Кардио-план: цели, режим, интервалы — для подсказки и таймера
      ...(e.cardio && trackOf(e).kind === 'cardio' ? { cardio: e.cardio } : {}),
      // «Было» — подсказка, а не план: человек в зале решает по ней,
      // добавлять ли сегодня. Из журнала клиента по упражнению (lastWeight,
      // сервер); нет истории — число из программы
      prevWeight: split
        ? doersOf(e, members).map(d => { const w = splitLastOf(e, d); return w ? d + ' ' + w : ''; }).filter(Boolean).join(' · ')
        : String(e.lastWeight || e.prevWeight || '').trim(),
      // Суперсет приезжает из плана и должен дожить до занятия: человек
      // смотрит в экран между подходами и должен видеть, что следующее
      // упражнение делается сразу, а не после отдыха.
      supersetGroup: e.supersetGroup || '',
      prescription: prescription(e),
      // Отдых после подхода этого упражнения из программы (20.10.2026):
      // занятие берёт его вместо общего restSeconds
      ...(techniqueOf(e.technique).rest ? { rest: techniqueOf(e.technique).rest } : {}),
      // Отдых после подхода этого упражнения из программы (20.10.2026):
      // занятие берёт его вместо общего restSeconds
      ...(techniqueOf(e.technique).rest ? { rest: techniqueOf(e.technique).rest } : {}),
      // Для оценки подхода (effort.js): группа и снаряд дают шаг веса,
      // план повторов — «не добил», lastRun — «последний раз вы делали…»
      ...extrasOf(e, split),
      sets: split
        // Круг — каждый из делающих по подходу, по очереди: так пара и
        // работает в зале, пока один отдыхает, другой делает
        // (не больше 20 подходов на упражнение — предел сервера)
        ? Array.from({ length: rounds(e, doersOf(e, members).length) })
          .flatMap(() => doersOf(e, members).map(d => ({
            ...blankSet(),
            who: d,
            // Начальный вес — прошлый у этого человека (на его тренажёре,
            // FT-488), нет — из программы
            weight: num(splitLastOf(e, d)) || num(e.splitWeights && e.splitWeights[d]),
            ...planSet(e, trackOf(e)),
          })))
        // Кардио по умолчанию — один отрезок, а не три подхода
        // Как в последний раз у клиента: лесенкой, с разминкой, сдвинуто
        // по оценкам (сервер, lib/effort.js). Нет истории — из программы
        : startSets(e) || Array.from({ length: Math.min(20, Math.max(1, parseInt(e.sets) || (trackOf(e).kind === 'cardio' ? 1 : 3))) }, () => ({
          ...blankSet(),
          // Начальный вес (решение владельца 28.09.2026): прошлый рабочий
          // вес клиента в упражнении, нет — из программы, нет и там — пусто
          // Вес помощи (гравитрон, FT-628): число программы — помощь
          [isAssisted(e) ? 'assist' : 'weight']: byTime(trackOf(e)) && trackOf(e).kind === 'cardio' ? '' : num(e.lastWeight) || num(e.weight),
          ...planSet(e, trackOf(e)),
        })),
    })) };
}

/**
 * Другой тренажёр в идущем занятии (07.10.2026, FT-478): на разных
 * тренажёрах веса несравнимы, поэтому неотмеченные рабочие подходы берут
 * вес с прошлого раза на выбранном (history — ответ workout.exercise.history
 * с machineUid). Не делали на нём — веса пустые: подход без веса не
 * отмечается, человек впишет сам. Отмеченное не трогаем. machine = null —
 * без тренажёра.
 */
export function withMachine(ex, machine, history = null) {
  const out = { ...ex };
  // Шаг тренажёра (FT-626): у сервера он в machine.step ответа истории
  const step = Number((history && history.machine && history.machine.step) || (machine && machine.step)) || 0;
  if (machine) out.machine = { uid: machine.uid, name: machine.name || '', ...(step > 0 ? { step } : {}) };
  else delete out.machine;
  const { step: _, ...load } = ex.load || {};
  if (step > 0) out.load = { ...load, step };
  else if (ex.load) out.load = load;
  if (!history || (ex.sets || []).some((s) => s.who) || trackOf(ex).kind === 'cardio') return out;

  out.prevWeight = String(history.lastWeight || '');
  if (history.lastRun) out.lastRun = history.lastRun;
  else delete out.lastRun;
  if (history.otherRun) out.otherRun = history.otherRun;
  else delete out.otherRun;
  // Вес помощи (FT-628) — двигается помощь
  const key = trackOf(ex).weightMode === 'assistance' ? 'assist' : 'weight';
  const starts = (history.startSets || []).filter((s) => s.kind !== 'warmup');
  const warms = (history.startSets || []).filter((s) => s.kind === 'warmup');
  // Прошлый раз теперь другой — подходы заново связываются с его подходами
  // (FT-621): k-й рабочий с k-м рабочим, k-я разминка с k-й разминкой
  const link = (s, from) => {
    const { was: _was, ...rest } = s;
    return from && Number.isInteger(from.was) ? { ...rest, was: from.was } : rest;
  };
  let work = -1;
  let warm = -1;
  out.sets = ex.sets.map((s) => {
    if (s.kind === 'warmup') { warm += 1; return link(s, warms[warm]); }
    work += 1;
    if (s.state !== 'pending') return link(s, null);
    const from = starts[Math.min(work, starts.length - 1)];
    return link({ ...s, [key]: String((from && from[key]) || (key === 'weight' ? history.lastWeight : '') || '') }, work < starts.length ? from : null);
  });
  return out;
}

/**
 * Сплит-пара (FT-488): один из пары выбрал другой тренажёр — его
 * неотмеченные подходы берут его вес с прошлого раза на этом тренажёре
 * (history — workout.exercise.history с member). Подходы другого не
 * трогаем. machine = null — без тренажёра.
 */
export function withMemberMachine(ex, who, machine, history = null) {
  const machines = { ...(ex.machines || {}) };
  if (machine) machines[who] = { uid: machine.uid, name: machine.name || '' };
  else delete machines[who];
  const out = { ...ex, machines };
  if (!Object.keys(machines).length) delete out.machines;
  if (!history || trackOf(ex).kind === 'cardio') return out;
  const w = String(history.lastWeight || '');
  out.sets = ex.sets.map((s) => (s.who === who && s.state === 'pending' && s.kind !== 'warmup' ? { ...s, weight: w } : s));
  return out;
}

/** Схема текущего упражнения, которую сохраняем при замене его названия */
export function replacementPlan(exercise) {
  const work = (exercise.sets || []).filter((s) => s.kind !== 'warmup').length;
  const withReps = (exercise.sets || []).find((s) => String(s.reps || '').trim());
  return {
    sets: String(Math.max(1, work || (exercise.sets || []).length || 3)),
    reps: String(exercise.target || (withReps && withReps.reps) || ''),
  };
}

/**
 * Заменить упражнение в идущем занятии снимком истории нового упражнения.
 * Старые подходы намеренно не смешиваются с новыми: если истории нет,
 * веса пустые; если есть — fromPlan применяет обычные startSets/lastRun.
 */
export function replaceWorkoutExercise(current, picked, history = null) {
  const plan = replacementPlan(current);
  const source = {
    ...(history || {}),
    ...picked,
    name: picked.name,
    exerciseId: picked.exerciseId || null,
    sets: plan.sets,
    reps: plan.reps,
    weight: '',
    prevWeight: '',
  };

  // У сплита история общих весов не применяется: сохраняем очередь людей,
  // но очищаем веса прежнего упражнения.
  if ((current.sets || []).some((s) => s.who)) {
    return {
      id: current.id,
      name: source.name,
      ...(source.exerciseId ? { exerciseId: source.exerciseId } : {}),
      ...(source.track ? { track: source.track } : {}),
      note: current.note || '',
      supersetGroup: current.supersetGroup || '',
      prescription: planScheme(source),
      sets: current.sets.map((s) => ({
        ...blankSet(), who: s.who, reps: plan.reps || String(s.reps || ''), kind: s.kind === 'warmup' ? 'warmup' : 'work',
      })),
    };
  }

  const made = fromPlan({ title: '', exercises: [source] }, '', []).exercises[0];
  // Сделанные подходы остаются (20.10.2026, аудит): тренер исправил название
  // после двух подходов — результат не теряется. Новые — только вместо
  // неотмеченных, столько же, сколько их было
  const kept = (current.sets || []).filter((s) => s.state !== 'pending');
  const open = (current.sets || []).length - kept.length;
  const fresh = made.sets.filter((s) => s.kind !== 'warmup').slice(0, Math.max(0, open));
  while (kept.length && fresh.length < open && made.sets.length) fresh.push(cloneSet(made.sets[made.sets.length - 1]));
  return {
    ...made,
    id: current.id,
    note: current.note || '',
    supersetGroup: current.supersetGroup || '',
    ...(kept.length ? { sets: [...kept, ...fresh] } : {}),
  };
}
export function summary(session) {
  const sets = session.exercises.flatMap(e => e.sets);
  const done = sets.filter(s => s.state === 'done');
  return { done: done.length, total: sets.length,
    volume: session.exercises.reduce((n, e) => n + e.sets
      .filter(s => s.state === 'done' && s.kind !== 'warmup')
      .reduce((m, s) => m + volumeOf(s, trackOf(e)), 0), 0),
    pending: sets.filter(s => s.state === 'pending').length };
}

/** Выполненный подход без результата блокирует сохранение всего занятия (FT-565). */
export function resultIssue(session) {
  for (const ex of session.exercises) {
    const track = trackOf(ex);
    for (let si = 0; si < ex.sets.length; si += 1) {
      const set = ex.sets[si];
      if (set.state !== 'done') continue;
      // В старых занятиях вес мог быть пустым; сервер требует результат,
      // но не заставляет дописывать вес в уже выполненные подходы.
      const lack = missing(set, track, { requireWeight: false });
      if (lack) return `${ex.name}, подход ${setLabel(ex.sets, si)}: ${lack.replace(/ перед отметкой( подхода)?/, '')}`;
    }
  }
  return '';
}
/**
 * «Завершить»: неотмеченные подходы — пропущены с пометкой closed. По ней
 * «Продолжить» отличает их от пропущенных руками (09.10.2026). Прежние
 * пометки снимаются: после прошлого «Продолжить» подход могли пропустить
 * уже сами. Копия — server/src/lib/watch-workout.js (closeSets)
 */
export function closeSets(exercises) {
  return exercises.map(e => ({ ...e, sets: e.sets.map(({ closed, ...x }) => (x.state === 'pending' ? { ...x, state: 'skipped', closed: true } : x)) }));
}

/**
 * «Продолжить тренировку» в завершённом (владелец, 09.10.2026: нажали
 * «Завершить» по ошибке): занятие снова идёт, пропущенные при завершении
 * подходы — снова в работе, и экран встаёт на первый из них. Пропущенные
 * руками остаются пропущенными. В занятиях до пометки closed отличить
 * нельзя — возвращаются все пропущенные
 */
export function reopenSession(session) {
  const marked = session.exercises.some(e => e.sets.some(x => x.closed));
  // finishedAt — время завершения с телефона (FT-566): снова идёт — его нет
  const { finishedAt, ...open } = session;
  return { ...open, status: 'active', restUntil: 0,
    exercises: session.exercises.map(e => ({ ...e, sets: e.sets.map(({ closed, ...x }) => (
      x.state === 'skipped' && (closed || !marked) ? { ...x, state: 'pending' } : x)) })) };
}

export function clock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

/** Кто из пары делает упражнение: отмеченные, а если никто не отмечен — все */
export function doersOf(exercise, members) {
  return exercise.performers && exercise.performers.length ? members.filter(m => exercise.performers.includes(m)) : members;
}

/** Номер подхода у своего человека: «Екатерина · 2», а не общий пятый */
export function setLabel(sets, si) {
  const set = sets[si];
  if (!set.who) return String(si + 1);
  const n = sets.slice(0, si + 1).filter(x => x.who === set.who).length;
  return set.who + ' · ' + n;
}

function rounds(exercise, people) {
  return Math.max(1, Math.min(parseInt(exercise.sets) || 3, Math.floor(20 / Math.max(1, people))));
}

/** План строкой: «3 × 12 на сторону · 20 кг», у кардио — «20 мин · 8 км/ч». RPE убран 03.10.2026 */
function prescription(e) {
  const track = trackOf(e);
  const weight = track.kind === 'cardio' ? '' : e.weight && (/^[+-]?\d/.test(String(e.weight)) ? e.weight + (track.perSide ? ' кг/стор.' : ' кг') : e.weight);
  return [planScheme(e), weight].filter(Boolean).join(' · ');
}

/**
 * Дропсет в программе — у последнего подхода: там уже заготовлен первый
 * сброс, чтобы в зале не искать, куда его вписать.
 */
/** Подходы как в последний раз у клиента (startSets с сервера); нет — null */
function startSets(e) {
  if (!Array.isArray(e.startSets) || !e.startSets.length || trackOf(e).kind === 'cardio') return null;
  return e.startSets.slice(0, 20).map(s => ({
    ...blankSet(), weight: String(s.weight || ''), reps: String(s.reps || ''), kind: s.kind === 'warmup' ? 'warmup' : 'work',
    // Вес помощи (FT-628) и какой это подход прошлого раза (FT-621): «было»
    // не сдвигается от добавленной разминки или удалённого подхода
    ...(s.assist !== undefined ? { assist: String(s.assist) } : {}),
    ...(Number.isInteger(s.was) ? { was: s.was } : {}),
  }));
}

/** Для оценок подходов: шаг веса (группа, снаряд), план повторов, прошлый раз */
/** Вес участника пары с прошлого раза: из журнала (FT-488), нет — «было» программы */
function splitLastOf(e, who) {
  return (e.splitLast && e.splitLast[who]) || (e.splitPrev && e.splitPrev[who]) || '';
}

function pairMachines(all, doers) {
  const out = {};
  doers.forEach((d) => { if (all[d]) out[d] = { uid: all[d].uid, name: all[d].name || '' }; });
  return out;
}

function extrasOf(e, split) {
  return {
    ...((e.exercise && (e.exercise.muscle || e.exercise.equipment)) || (!split && e.machine && e.machine.step > 0)
      ? { load: {
        muscle: (e.exercise && e.exercise.muscle) || '', equipment: (e.exercise && e.exercise.equipment) || '',
        // Шаг тренажёра (FT-626): прибавки по его плиткам
        ...(!split && e.machine && e.machine.step > 0 ? { step: e.machine.step } : {}),
      } } : {}),
    ...(/^\d{1,3}/.test(String(e.reps || '')) ? { target: String(e.reps).match(/^\d{1,3}/)[0] } : {}),
    // План повторов целиком, «8–12» (FT-624): по нему следующий раз отличит
    // смену схемы тренером от недобора
    ...(/^\d{1,3}(\s*[-–—]\s*\d{1,3})?$/.test(String(e.reps || '').trim()) ? { planReps: String(e.reps).trim() } : {}),
    ...(!split && e.lastRun ? { lastRun: e.lastRun } : {}),
    // На этом тренажёре ещё не делали — что было на прежнем (16.10.2026)
    ...(!split && e.otherRun ? { otherRun: e.otherRun } : {}),
  };
}

function withTechnique(e, ex) {
  const tech = techniqueOf(e.technique);
  // Вес на одну сторону — у каждого подхода свой, начальный — из программы
  // (07.10.2026); пришедшие с прошлого раза подходы несут свой
  if (trackOf(e).kind === 'strength' && ex.sets.length) {
    const side = planOneSide(e) ? 'one' : 'two';
    ex = { ...ex, sets: ex.sets.map(s => (s.side ? s : { ...s, side })) };
  }
  if (!ex.sets.length || ex.sets.some(x => x.who)) return ex;
  let sets = ex.sets.slice();
  // Разминочные из программы — в начало, если подходы не взяты с прошлого
  // раза (там разминка своя): половина рабочего веса, кратно 2,5
  const kind = trackOf(e).kind;
  const fromHistory = Array.isArray(e.startSets) && e.startSets.length > 0;
  if (tech.warmup && !fromHistory && !sets.some(x => x.kind === 'warmup') && (kind === 'strength' || kind === 'bodyweight')) {
    const first = sets[0];
    sets = [...Array.from({ length: tech.warmup }, () => ({ ...first, weight: warmupWeight(first.weight), kind: 'warmup' })), ...sets];
  }
  if (tech.dropset) sets[sets.length - 1] = { ...sets[sets.length - 1], drops: [{ weight: '', reps: '' }] };
  return { ...ex, sets };
}

/** Вес разминки — половина рабочего, кратно 2,5; меньше 2,5 — как у рабочего */
function warmupWeight(weight) {
  const w = Number(String(weight || '').replace(',', '.'));
  const half = w > 0 ? Math.floor(w / 2 / 2.5) * 2.5 : 0;
  return half > 0 ? String(half) : weight || '';
}

/**
 * «Добавить разминочный подход» в занятии (FT-532, 10.10.2026): после уже
 * стоящих разминочных, перед рабочими. Повторы — как у первого рабочего,
 * вес — по тому же правилу, что разминка из программы
 */
export function withWarmup(ex) {
  if (ex.sets.length >= 20 || ex.sets.some(x => x.who)) return ex;
  const found = ex.sets.findIndex(x => x.kind !== 'warmup');
  const at = found < 0 ? ex.sets.length : found;
  // sid — номер подхода на сервере (server/src/lib/workout-merge.js): у нового свой
  const { effort, suggest, raised, own, drops, closed, was, sid, ...source } = ex.sets[at] || ex.sets[ex.sets.length - 1] || blankSet();
  const set = { ...source, weight: warmupWeight(source.weight), state: 'pending', kind: 'warmup' };
  return { ...ex, sets: [...ex.sets.slice(0, at), set, ...ex.sets.slice(at)] };
}

/**
 * Упражнение, добавленное в идущее занятие. У сплита — по подходу каждому
 * участнику, дальше «Добавить круг»; без этого второе упражнение свободной
 * тренировки пары оказывалось на одного (10.10.2026). Участников занятие не
 * хранит — они видны по подходам уже записанных упражнений.
 */
export function newExercise(session) {
  const whos = [...new Set((session?.exercises || []).flatMap(e => e.sets.map(x => x.who)).filter(Boolean))];
  return { id: uid(), name: 'Новое упражнение', note: '', prescription: '', prevWeight: '',
    sets: whos.length ? whos.map(who => ({ ...blankSet(), who })) : [blankSet()] };
}

/**
 * Копия подхода для нового, неотмеченного: без оценки и того, что она
 * сдвинула, без «было» (was — свой подход прошлого раза, у нового его нет),
 * без own (вес был вписан руками в тот подход, не в этот) и без sid (номер
 * подхода на сервере). До 20.10.2026 четыре места копировали подход как
 * есть — два подхода делили один «было» и двигались как один
 */
export function cloneSet(set) {
  const { effort, suggest, raised, lowered, capped, moved, own, closed, was, sid, ...rest } = set || blankSet();
  return { ...rest, state: 'pending' };
}

/** Подход в конец с часов тренера (FT-533) — как последний, неотмеченный */
export function withSet(ex) {
  if (ex.sets.length >= 20 || ex.sets.some(x => x.who)) return ex;
  return { ...ex, sets: [...ex.sets, { ...cloneSet(ex.sets[ex.sets.length - 1]), kind: 'work' }] };
}

/**
 * Правка поля подхода si в занятии (из Workout.jsx, чтобы проверять тестом).
 *
 * Вписали вес (у веса помощи — помощь) — он свой (own): оценки этот подход
 * больше не двигают. Следующим рабочим подходам без прошлого раза — тот же
 * вес (владелец, 03.10.2026): у них нет своей истории. Но не из разминки и
 * не в разминку (FT-620, 19.10.2026): разминку делают с пустым грифом или
 * без веса — это не рабочий вес остальных подходов.
 *
 * Поменяли повторы — вес этого подхода пересчитать от прошлого раза (тот же
 * подход, его вес и повторы), если вес не вписан руками.
 */
export function editSetField(ex, si, key, value) {
  const valueKey = isAssisted(ex) ? 'assist' : 'weight';
  const source = ex.sets[si];
  const sets = ex.sets.map((s, k) => {
    if (k !== si) return s;
    const { suggest, ...rest } = s;
    const mine = key === valueKey;
    const next = { ...rest, [key]: value, ...(!mine && suggest ? { suggest } : {}), ...(mine ? { own: true } : {}) };
    const was = key === 'reps' && valueKey === 'weight' && !s.own && wasSet(ex, si);
    if (was && was.weight && Number(value) > 0 && Number(was.reps) > 0) {
      const w = scaleTo(ex, Number(String(was.weight).replace(',', '.')), Number(was.reps), Number(value));
      if (w > 0) next.weight = String(Math.round(w * 100) / 100);
    }
    return next;
  });
  if (key === valueKey && source.kind !== 'warmup') {
    const old = source[valueKey] || '';
    for (let k = si + 1; k < sets.length; k += 1) {
      const s = sets[k];
      if ((s.who || '') !== (source.who || '') || s.kind === 'warmup' || s.state !== 'pending' || s.own || wasSet(ex, k)) continue;
      if (s[valueKey] && s[valueKey] !== old) break;
      sets[k] = { ...s, [valueKey]: value };
    }
  }
  return { ...ex, sets };
}

/**
 * С какого момента досчитывать время занятия, взятого с сервера: его
 * elapsedMs досчитан до updatedAt (как у сервера, watch-workout.js), и
 * идущее занятие с тех пор шло дальше. Отсчёт «с открытия» терял всё
 * между сохранением и открытием — телефон в кармане, ведут часы: 45 минут
 * вместо 60 (22.10.2026). Не дальше 3 часов назад (забытое занятие не растёт сутками) и не в будущем
 */
export const serverTick = (session, now = Date.now()) => {
  const at = Date.parse((session && session.updatedAt) || '');
  return session && session.status === 'active' && at > 0 ? Math.min(now, Math.max(at, now - 3 * 3600000)) : now;
};
