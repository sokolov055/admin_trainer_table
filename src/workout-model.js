export const uid = () => crypto.randomUUID();
export const blankSet = () => ({ weight: '', reps: '', rpe: '', state: 'pending', kind: 'work' });
// members — участники сплита: подходы собираются кругами на каждого, кто
// делает упражнение, с его весом; у подхода — чей он (who)
export function fromPlan(block, month, members = []) {
  const split = members.length > 1;
  const num = (v) => (/^\d+([.,]\d+)?$/.test(String(v)) ? String(v).replace(',', '.') : '');
  return { id: uid(), title: block.title, sourceBlock: block.title, month,
    // restSeconds — сколько отдыхать после отмеченного подхода. Ноль
    // значит «не запускать сам»: пока человек не выбрал длительность,
    // таймер ведёт себя как раньше.
    status: 'active', elapsedMs: 0, restUntil: 0, restSeconds: 0, note: '',
    exercises: block.exercises.slice(0, 30).map(e => ({
      id: uid(), name: e.name, note: '',
      // Вес прошлого месяца — подсказка, а не план: человек в зале решает
      // по ней, добавлять ли сегодня.
      prevWeight: split
        ? doersOf(e, members).map(d => (e.splitPrev && e.splitPrev[d] ? d + ' ' + e.splitPrev[d] : '')).filter(Boolean).join(' · ')
        : String(e.prevWeight || '').trim(),
      // Суперсет приезжает из плана и должен дожить до занятия: человек
      // смотрит в экран между подходами и должен видеть, что следующее
      // упражнение делается сразу, а не после отдыха.
      supersetGroup: e.supersetGroup || '',
      prescription: [e.sets && e.sets + ' × ' + e.reps, e.weight && e.weight + ' кг', e.rpe && 'RPE ' + e.rpe].filter(Boolean).join(' · '),
      sets: split
        // Круг — каждый из делающих по подходу, по очереди: так пара и
        // работает в зале, пока один отдыхает, другой делает
        // (не больше 20 подходов на упражнение — предел сервера)
        ? Array.from({ length: rounds(e, doersOf(e, members).length) })
          .flatMap(() => doersOf(e, members).map(d => ({
            ...blankSet(),
            who: d,
            weight: num(e.splitWeights && e.splitWeights[d]),
            reps: /^\d+$/.test(String(e.reps)) ? String(e.reps) : '',
          })))
        : Array.from({ length: Math.min(20, Math.max(1, parseInt(e.sets) || 3)) }, () => ({
          ...blankSet(),
          weight: num(e.weight),
          reps: /^\d+$/.test(String(e.reps)) ? String(e.reps) : '',
        })),
    })) };
}
export function summary(session) {
  const sets = session.exercises.flatMap(e => e.sets);
  const done = sets.filter(s => s.state === 'done');
  return { done: done.length, total: sets.length,
    volume: done.filter(s => s.kind !== 'warmup').reduce((n, s) => n + (Number(String(s.weight).replace(',', '.')) || 0) * (Number(s.reps) || 0), 0),
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
