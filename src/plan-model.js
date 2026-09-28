import { setsLine, trackOf } from './exercise-track.js';

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
 * Проведённые занятия этой тренировки, свежие сверху.
 *
 * Тренировка опознаётся по id (sourceBlockId), а не по названию: в месяце
 * бывает несколько одноимённых («Грудь, трицепс» дважды в неделю), и
 * название меняют и в программе, и в журнале (28.09.2026). Занятия,
 * заведённые до id, — по названию тренировки (sourceBlock), как раньше.
 * Месяц нужен им же: одноимённые блоки есть в каждом месяце.
 */
export function blockSessions(sessions, block, month) {
  const { id, title } = typeof block === 'string' ? { id: '', title: block } : (block || {});
  return (sessions || [])
    .filter((s) => s.status === 'completed'
      && (s.sourceBlockId ? s.sourceBlockId === id : s.sourceBlock === title)
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
export function doneLine(sets, track) {
  return setsLine(sets, trackOf({ track }), true);
}

/**
 * Подход суперсета без числа кругов: круги стоят у скобки, и «4 × 15» у
 * каждого упражнения повторяло бы их. «15 повт. · 10 кг», а если подходы
 * разные — каждый: «10 кг × 12, 12 кг × 10».
 */
export function roundLine(sets, track) {
  return setsLine(sets, trackOf({ track }), false);
}
