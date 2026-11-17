/**
 * Список программ в «Библиотеке» тренера (макет templates-programs-mockup,
 * согласован 17.11.2026): цель — обложкой, факты — значками, фильтры
 * листом. Чистые функции без React — проверяются node-тестом
 * (scripts/test-program-list.mjs).
 */

/** Цель → вид обложки: ключ цвета (programs-lib.css) и значок. Своя цель — нейтральная */
export const GOAL_LOOK = {
  'Похудение': { key: 'lose', icon: 'flame' },
  'Набор массы': { key: 'mass', icon: 'dumbbell' },
  'Рельеф': { key: 'cut', icon: 'gem' },
  'Сила': { key: 'strength', icon: 'bolt' },
  'Тонус': { key: 'tone', icon: 'wave' },
  'Выносливость': { key: 'endurance', icon: 'heart' },
  'Здоровая спина': { key: 'back', icon: 'spine' },
  'Реабилитация': { key: 'rehab', icon: 'bandage' },
};
export const goalLook = (goal) => GOAL_LOOK[goal] || { key: 'own', icon: 'plan' };

/** Раз в неделю: вписанное тренером или по составу недели 1 (решение 17.11.2026) */
export function daysOf(t) {
  if (t.days) return { n: Number(t.days), auto: false };
  const first = (t.weekSessions || [])[0];
  return first ? { n: first, auto: true } : { n: 0, auto: false };
}

export const LEVEL_TONE = { 'Новичок': 'easy', 'Средний': 'mid', 'Опытный': 'hard' };

/** Пустые фильтры листа */
export const NO_FILTERS = { days: 0, place: '', level: '', show: '', sort: 'recent' };

/** Сколько фильтров включено — число на кнопке «Фильтры» (порядок — не фильтр) */
export function filterCount(f) {
  return ['days', 'place', 'level', 'show'].filter((k) => !!f[k]).length;
}

/** Совпадает ли программа с поиском, целью и фильтрами листа */
export function matches(t, { q = '', goal = '', filters = NO_FILTERS } = {}) {
  const query = q.trim().toLowerCase();
  if (query && !(t.title + ' ' + (t.goal || '')).toLowerCase().includes(query)) return false;
  if (goal && t.goal !== goal) return false;
  if (filters.days && daysOf(t).n !== filters.days) return false;
  if (filters.place && t.place !== filters.place) return false;
  if (filters.level && t.level !== filters.level) return false;
  if (filters.show === 'clients' && !t.forClients) return false;
  if (filters.show === 'assigned' && !(t.clients || []).length) return false;
  if (filters.show === 'shared' && !t.isPublic) return false;
  return true;
}

/** Порядок: недавние (как отдал сервер), чаще назначаю, по алфавиту */
export function sorted(list, sort = 'recent') {
  if (sort === 'uses') return [...list].sort((a, b) => (b.uses || 0) - (a.uses || 0));
  if (sort === 'az') return [...list].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return list;
}

export function shownPrograms(list, opts = {}) {
  return sorted((list || []).filter((t) => matches(t, opts)), (opts.filters || NO_FILTERS).sort);
}

/**
 * Значения для плиток листа — только те, что есть в программах: «Дома»,
 * когда все программы в зале, ничего не отсекает
 */
export function filterValues(list = []) {
  const uniq = (fn) => [...new Set(list.map(fn).filter(Boolean))];
  return {
    days: uniq((t) => daysOf(t).n).sort((a, b) => a - b),
    place: uniq((t) => t.place),
    level: ['Новичок', 'Средний', 'Опытный'].filter((l) => list.some((t) => t.level === l)),
  };
}

/** «Анна Ковалёва» → «АК», «Мария» → «МА» */
export function initials(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Цвет аватарки — по имени, один и тот же везде (6 тонов в programs-lib.css) */
export function avatarTone(name = '') {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}
