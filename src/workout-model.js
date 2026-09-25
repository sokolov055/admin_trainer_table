import { trackOf, byTime, planScheme, planSet, volumeOf } from './exercise-track.js';

export const uid = () => crypto.randomUUID();
export const blankSet = () => ({ weight: '', reps: '', rpe: '', state: 'pending', kind: 'work' });
// members — участники сплита: подходы собираются кругами на каждого, кто
// делает упражнение, с его весом; у подхода — чей он (who)
export function fromPlan(block, month, members = []) {
  const split = members.length > 1;
  // «+5» у подтягиваний — добавка к своему весу: в поле идёт 5
  const num = (v) => { const x = String(v || '').replace(/^\+\s*/, ''); return /^\d+([.,]\d+)?$/.test(x) ? x.replace(',', '.') : ''; };
  return { id: uid(), title: block.title, sourceBlock: block.title, month,
    // restSeconds — сколько отдыхать после отмеченного подхода. Ноль
    // значит «не запускать сам»: пока человек не выбрал длительность,
    // таймер ведёт себя как раньше.
    status: 'active', elapsedMs: 0, restUntil: 0, restSeconds: 0, note: '',
    exercises: block.exercises.slice(0, 30).map(e => withTechnique(e, {
      id: uid(), name: e.name, note: '',
      // Тип учёта — что записывать в подходе; снимок, в занятии правится
      // только для этого занятия
      ...(e.track || e.cardio ? { track: trackOf(e) } : {}),
      // Кардио-план: цели, режим, интервалы — для подсказки и таймера
      ...(e.cardio && trackOf(e).kind === 'cardio' ? { cardio: e.cardio } : {}),
      // Вес прошлого месяца — подсказка, а не план: человек в зале решает
      // по ней, добавлять ли сегодня.
      prevWeight: split
        ? doersOf(e, members).map(d => (e.splitPrev && e.splitPrev[d] ? d + ' ' + e.splitPrev[d] : '')).filter(Boolean).join(' · ')
        : String(e.prevWeight || '').trim(),
      // Суперсет приезжает из плана и должен дожить до занятия: человек
      // смотрит в экран между подходами и должен видеть, что следующее
      // упражнение делается сразу, а не после отдыха.
      supersetGroup: e.supersetGroup || '',
      prescription: prescription(e),
      sets: split
        // Круг — каждый из делающих по подходу, по очереди: так пара и
        // работает в зале, пока один отдыхает, другой делает
        // (не больше 20 подходов на упражнение — предел сервера)
        ? Array.from({ length: rounds(e, doersOf(e, members).length) })
          .flatMap(() => doersOf(e, members).map(d => ({
            ...blankSet(),
            who: d,
            weight: num(e.splitWeights && e.splitWeights[d]),
            ...planSet(e, trackOf(e)),
          })))
        // Кардио по умолчанию — один отрезок, а не три подхода
        : Array.from({ length: Math.min(20, Math.max(1, parseInt(e.sets) || (trackOf(e).kind === 'cardio' ? 1 : 3))) }, () => ({
          ...blankSet(),
          weight: byTime(trackOf(e)) && trackOf(e).kind === 'cardio' ? '' : num(e.weight),
          ...planSet(e, trackOf(e)),
        })),
    })) };
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

/** План строкой: «3 × 12 на сторону · 20 кг · RPE 8», у кардио — «20 мин · 8 км/ч» */
function prescription(e) {
  const track = trackOf(e);
  const weight = track.kind === 'cardio' ? '' : e.weight && (/^[+-]?\d/.test(String(e.weight)) ? e.weight + (track.perSide ? ' кг/стор.' : ' кг') : e.weight);
  return [planScheme(e), weight, e.rpe && 'RPE ' + e.rpe].filter(Boolean).join(' · ');
}

/**
 * Дропсет в программе — у последнего подхода: там уже заготовлен первый
 * сброс, чтобы в зале не искать, куда его вписать.
 */
function withTechnique(e, ex) {
  if (e.technique !== 'dropset' || !ex.sets.length || ex.sets.some(x => x.who)) return ex;
  const sets = ex.sets.slice();
  sets[sets.length - 1] = { ...sets[sets.length - 1], drops: [{ weight: '', reps: '' }] };
  return { ...ex, sets };
}
