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

/**
 * Сделанное на занятии — строкой, как в программе: «3 × 15 · 20 кг», а если
 * подходы разные — каждый: «20 кг × 12, 22.5 кг × 10».
 *
 * Для вкладки «Выполненные»: упражнение, заменённое в зале, живёт только в
 * журнале, и показывать там блок программы значило показывать не то, что
 * человек делал.
 */
export function doneLine(sets) {
  const list = sets || [];
  if (!list.length) return '';
  const same = list.every((x) => x.weight === list[0].weight && x.reps === list[0].reps);
  if (same) {
    return list.length + ' × ' + (list[0].reps || '?') + (list[0].weight ? ' · ' + list[0].weight + ' кг' : '');
  }
  return list.map((x) => (x.weight ? x.weight + ' кг × ' : '') + (x.reps || '?')).join(', ');
}

/**
 * Подход суперсета без числа кругов: круги стоят у скобки, и «4 × 15» у
 * каждого упражнения повторяло бы их. «15 повт. · 10 кг», а если подходы
 * разные — каждый: «10 кг × 12, 12 кг × 10».
 */
export function roundLine(sets) {
  const list = sets || [];
  if (!list.length) return '';
  const same = list.every((x) => x.weight === list[0].weight && x.reps === list[0].reps);
  if (same) return (list[0].reps || '?') + ' повт.' + (list[0].weight ? ' · ' + list[0].weight + ' кг' : '');
  return list.map((x) => (x.weight ? x.weight + ' кг × ' : '') + (x.reps || '?')).join(', ');
}
