/**
 * Что из упражнения программы уходит в plan.save (16.10.2026).
 *
 * Экран держит упражнение вместе со всем, что сервер добавил при чтении:
 * карточкой из базы (техника, тренажёры с фото и регулировками, мышцы),
 * последними выполнениями и начальными весами. Отправлялось всё это назад,
 * и у клиента с программой на 17 тренировок запрос перевалил за предел
 * nginx (64 КБ) — «Не сохранилось». Сервер из упражнения берёт только эти
 * поля (server/src/api/plan-edit-handlers.js), их и шлём.
 */
const SAVED = [
  'name', 'weight', 'prevWeight', 'sets', 'reps', 'rpe', 'supersetGroup', 'technique', 'cardio',
  'exerciseId', 'performers', 'splitWeights', 'splitPrev',
];

export function planExerciseForSave(exercise) {
  const out = {};
  SAVED.forEach((key) => { if (exercise[key] !== undefined) out[key] = exercise[key]; });
  return out;
}
