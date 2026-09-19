export const uid = () => crypto.randomUUID();
export const blankSet = () => ({ weight: '', reps: '', rpe: '', state: 'pending', kind: 'work' });
export function fromPlan(block, month) {
  return { id: uid(), title: block.title, sourceBlock: block.title, month,
    status: 'active', elapsedMs: 0, restUntil: 0, note: '',
    exercises: block.exercises.slice(0, 30).map(e => ({
      id: uid(), name: e.name, note: '',
      prescription: [e.sets && e.sets + ' × ' + e.reps, e.weight && e.weight + ' кг', e.rpe && 'RPE ' + e.rpe].filter(Boolean).join(' · '),
      sets: Array.from({ length: Math.min(20, Math.max(1, parseInt(e.sets) || 3)) }, () => ({
        ...blankSet(),
        weight: /^\d+([.,]\d+)?$/.test(String(e.weight)) ? String(e.weight).replace(',', '.') : '',
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
