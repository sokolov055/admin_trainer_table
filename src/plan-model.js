/**
 * Разбор программы месяца для экрана плана.
 *
 * Здесь нет React: это правила, а не вёрстка, и ошибка в них выглядит не
 * как съехавшая рамка, а как неверная программа на экране. Поэтому они
 * живут отдельно и проверяются напрямую — так же, как workout-model.js.
 */

/**
 * Упражнения подряд с одной группой — один суперсет.
 *
 * В таблице суперсет не подписан словом: тренер объединяет ячейку
 * «Подходы» на несколько строк, и число подходов у них общее. Группу из
 * одного упражнения суперсетом не считаем — объединение могло остаться от
 * оформления, а «суперсет из одного» человека только собьёт.
 */
export function supersets(exercises) {
  const groups = [];

  (exercises || []).forEach((ex) => {
    const last = groups[groups.length - 1];
    if (ex.supersetGroup && last && last.key === ex.supersetGroup) last.items.push(ex);
    else groups.push({ key: ex.supersetGroup || null, items: [ex] });
  });

  return groups.map((g) => ({
    ...g,
    superset: !!g.key && g.items.length > 1,
    sets: g.items[0].sets || '',
  }));
}

/**
 * Проведённые занятия этого блока, свежие сверху.
 *
 * Блок опознаётся по sourceBlock, а не по названию занятия: занятие
 * переименовывают прямо в зале («ноги, спина болит»), и связь с
 * программой от этого не меняется. Месяц нужен потому, что блоки с одним
 * названием есть в каждом месяце, а отметка «проведено» относится к
 * открытому сейчас.
 */
export function blockSessions(sessions, blockTitle, month) {
  return (sessions || [])
    .filter((s) => s.status === 'completed'
      && s.sourceBlock === blockTitle
      && (!month || s.month === month))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
