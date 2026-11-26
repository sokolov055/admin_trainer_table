/**
 * Список блюд «Библиотеки» (этап 2, 26.11.2026): лист «Фильтры» по макету —
 * приём пищи, время готовки, метки. Чистые функции без React — проверяются
 * node-тестом (scripts/test-dish-list.mjs).
 *
 * «Недавние» и «Частые» из макета пока без данных: сервер не отдаёт дату
 * правки блюда и не считает использования — как появятся, вернём порядок.
 */

/** Пустые фильтры листа: время — любое, меток нет, порядок — как отдал сервер */
export const NO_FILTERS = { time: 0, tags: [], sort: 'meal' };

/** Сколько фильтров включено — число на чипе «Фильтры» (порядок — не фильтр) */
export function filterCount(f = NO_FILTERS) {
  return (f.time ? 1 : 0) + (f.tags || []).length;
}

/** Совпадает ли блюдо с поиском, приёмом пищи и фильтрами листа */
export function matches(d, { q = '', meal = '', filters = NO_FILTERS } = {}) {
  const query = q.trim().toLowerCase();
  if (query && !d.name.toLowerCase().includes(query)) return false;
  if (meal && d.meal !== meal) return false;
  if (filters.time && d.minutes > filters.time) return false;
  if ((filters.tags || []).length && !filters.tags.some((t) => (d.tags || []).includes(t))) return false;
  return true;
}

/** Порядок: как отдал сервер (по приёму пищи, внутри по алфавиту) или по алфавиту */
export function sorted(list, sort = 'meal') {
  if (sort === 'az') return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return list;
}

export function shownDishes(list, opts = {}) {
  return sorted((list || []).filter((d) => matches(d, opts)), (opts.filters || NO_FILTERS).sort);
}
