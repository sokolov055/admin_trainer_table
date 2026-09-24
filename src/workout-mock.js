import { summary } from './workout-model.js';

// Один журнал демо на клиента: переживает перезагрузку и доступен обеим
// ролям. Конфликт версий воспроизводится двумя вкладками, как в проде.
export function workoutMock(action, params) {
  const owner = params.__role === 'trainer' ? Number(params.clientRow) : 3;
  if (!owner) throw new Error('Укажите клиента');
  const key = 'workout_demo_server:' + owner;
  const sessions = JSON.parse(localStorage.getItem(key) || '[]');
  if (action === 'workout.list') return { owner: String(owner), sessions: sessions.map(s => ({ ...s, done: summary(s).done,
    // Как на сервере (doneSummary): у завершённого — только сделанное
    exercises: s.status === 'completed'
      ? s.exercises.map(e => ({ name: e.name, supersetGroup: e.supersetGroup || '',
        sets: e.sets.filter(x => x.state === 'done' && x.kind !== 'warmup').map(x => ({ weight: x.weight || '', reps: x.reps || '', ...(x.who ? { who: x.who } : {}) })) }))
        .filter(e => e.sets.length)
      : undefined })).reverse() };
  const previous = sessions.find(s => s.id === (params.id || params.session?.id));

  // Удаление: запись пропадает целиком, как и в таблице. Право тренера —
  // проверяем и здесь, иначе демо показывало бы кнопку, которой в бою нет.
  if (action === 'workout.delete') {
    if (params.__role !== 'trainer') throw new Error('Удалять занятия может только тренер');
    if (!previous) throw new Error('Занятие не найдено');
    localStorage.setItem(key, JSON.stringify(sessions.filter(v => v.id !== previous.id)));
    return { deleted: previous.id };
  }

  if (action === 'workout.get') {
    if (!previous) throw new Error('Занятие не найдено');
    return { session: previous };
  }
  if (previous?.requestId === params.requestId) return { session: previous };
  if ((previous?.revision || 0) !== params.revision) return { conflict: true, session: previous };
  const s = params.session;
  const other = sessions.find(v => v.id !== s.id && ['active', 'paused'].includes(v.status));
  if (other && ['active', 'paused'].includes(s.status)) return { activeConflict: true, session: other };
  if (!s.title.trim() || !s.exercises.length || s.exercises.some(e => !e.name.trim())) throw new Error('Укажите название занятия и упражнений');
  for (const e of s.exercises) for (const set of e.sets) {
    if (set.weight && (!/^\d+([.,]\d{1,3})?$/.test(set.weight) || Number(set.weight.replace(',', '.')) > 1500)) throw new Error('Вес: от 0 до 1500 кг');
    if (set.reps && (!/^\d+$/.test(set.reps) || +set.reps < 1 || +set.reps > 1000)) throw new Error('Повторы: от 1 до 1000');
    if (set.rpe && (!(+set.rpe >= 1) || +set.rpe > 10)) throw new Error('RPE: от 1 до 10');
  }
  if (s.status === 'completed' && (!summary(s).done || summary(s).pending)) throw new Error('Отметьте подходы');
  const result = { ...s, revision: params.revision + 1, requestId: params.requestId,
    startedAt: previous?.startedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  localStorage.setItem(key, JSON.stringify([...sessions.filter(s => s.id !== result.id), result]));
  return { session: result };
}
