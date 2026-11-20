/**
 * Пропуск упражнения целиком и «Позже» (макет progress-skip-chat-2026-11-19,
 * согласован владельцем 20.11.2026). Чистые функции без React — их проверяет
 * scripts/test-workout-skip.mjs.
 *
 * Пропуск — те же «пропущенные» подходы, что и раньше у одиночного подхода,
 * плюс причина у упражнения (skip). Причина — ключ из списка, без текста:
 * «болит» — сведения о здоровье, строка в согласии 2026-11-20
 * (docs/legal/2026-11-20-skip-exercise.md). Сервер принимает только эти ключи.
 */

export const SKIP_OPTIONS = [
  { id: 'busy', text: 'Тренажёр занят' },
  { id: 'nomachine', text: 'Нет тренажёра' },
  { id: 'time', text: 'Не успеваю' },
  { id: 'pain', text: 'Болит' },
  { id: 'other', text: 'Другое' },
];

/** Причина словами для строки «Пропущено · …»; без причины — '' */
export const skipText = (key) => ((SKIP_OPTIONS.find((o) => o.id === key) || {}).text || '');

/** Упражнение можно пропустить или отложить: есть несделанные подходы, не суперсет */
export const canSkip = (ex) => !!ex && !ex.skip && !ex.supersetGroup && (ex.sets || []).some((s) => s.state === 'pending');

/** Пропустить: несделанные подходы — «пропущен», у упражнения — причина */
export function skipExercise(exercises, id, reason = 'yes') {
  const key = SKIP_OPTIONS.some((o) => o.id === reason) ? reason : 'yes';
  return exercises.map((ex) => (ex.id !== id ? ex : {
    ...ex,
    skip: key,
    later: undefined,
    sets: ex.sets.map((s) => (s.state === 'pending' ? { ...s, state: 'skipped' } : s)),
  }));
}

/** Вернуть пропущенное: пропущенные подходы снова ждут, причины нет */
export function unskipExercise(exercises, id) {
  return exercises.map((ex) => {
    if (ex.id !== id) return ex;
    const { skip, ...rest } = ex;
    return { ...rest, sets: ex.sets.map(({ closed, ...s }) => (s.state === 'skipped' ? { ...s, state: 'pending' } : s)) };
  });
}

/** «Позже»: упражнение — в конец списка, с пометкой «отложено» */
export function postponeExercise(exercises, id) {
  const ex = exercises.find((e) => e.id === id);
  if (!ex) return exercises;
  return [...exercises.filter((e) => e.id !== id), { ...ex, later: true }];
}

/** Пропущенные упражнения для итога: «Жим лёжа (тренажёр занят)» */
export function skippedList(exercises) {
  return (exercises || []).filter((e) => e.skip).map((e) => e.name + (skipText(e.skip) ? ' (' + skipText(e.skip).toLowerCase() + ')' : ''));
}

/** Минут шло занятие — по секундомеру экрана; для правила «засчитывается с 15 минут» */
export const COUNT_MIN_MINUTES = 15;
export const sessionMinutes = (s) => Math.floor((Number(s && s.elapsedMs) || 0) / 60000);
