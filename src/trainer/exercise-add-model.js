/**
 * Лист «＋ Упражнения» (этап 5, шаг 3, 18.11.2026, FT-798) — без React,
 * чтобы проверялось node-тестом: какие упражнения показать в сетке
 * (поиск, «Недавние», плашки мышц), порядок отмеченных, подпись кнопки и
 * строки, которые встают в тренировку.
 */
import { GROUP_REGIONS } from '../muscles/regions.js';

/** Плашки мышц — в таком порядке; «Всё тело» и «Кардио» не группа для поиска глазами */
export const ADD_GROUPS = ['Спина', 'Грудь', 'Ноги', 'Ягодицы', 'Плечи', 'Руки', 'Пресс'];
export const CHIP_ALL = 'all';
export const CHIP_RECENT = 'recent';
/** Сколько недавних показывать и сколько картинок в сетке до «Показать ещё» */
export const RECENT_MAX = 12;
export const PAGE = 48;
/** Схема новых строк — та, что на кнопке; правят потом в карточке */
export const ADD_SETS = '3';
export const ADD_REPS = '12';

export const searchKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.,()]/g, ' ').replace(/\s+/g, ' ').trim();

/** Группы мышц упражнения: из основных мышц карты и из поля «мышца» базы */
export function groupsOf(ex) {
  const out = new Set();
  if (!ex) return out;
  if (ADD_GROUPS.includes(ex.muscle)) out.add(ex.muscle);
  const primary = (ex.muscles && ex.muscles.primary) || [];
  for (const g of ADD_GROUPS) if (GROUP_REGIONS[g].some((r) => primary.includes(r))) out.add(g);
  return out;
}

const byName = (a, b) => searchKey(a.name).localeCompare(searchKey(b.name), 'ru');
const byUses = (a, b) => (b.uses || 0) - (a.uses || 0) || byName(a, b);

/** Есть что показать в «Недавних» — с них лист и открывается */
export const hasRecent = (base) => base.some((e) => (e.uses || 0) > 0);
export const startChip = (base) => (hasRecent(base) ? CHIP_RECENT : CHIP_ALL);

/** Плашки, у которых в базе есть упражнения: пустые не показываем */
export function chipsOf(base) {
  const chips = [];
  if (hasRecent(base)) chips.push({ id: CHIP_RECENT, label: 'Недавние' });
  chips.push({ id: CHIP_ALL, label: 'Все' });
  for (const g of ADD_GROUPS) if (base.some((e) => groupsOf(e).has(g))) chips.push({ id: g, label: g });
  return chips;
}

/**
 * Что в сетке. Поиск — по всем словам в любом порядке и по всей базе,
 * какая бы плашка ни была выбрана: при «Ногах» вписали «тяга» — тяги
 * спины тоже нужны, «Ничего не нашлось» тут только путает.
 * «Недавние» — чаще поставленные; группа — сначала частые, потом по алфавиту.
 */
export function shownOf(base, { q = '', chip = CHIP_ALL } = {}) {
  const words = searchKey(q).split(' ').filter(Boolean);
  const named = base.filter((e) => String(e.name || '').trim());
  if (words.length) {
    const head = searchKey(q);
    return named
      .filter((e) => { const k = searchKey(e.name); return words.every((w) => k.includes(w)); })
      .sort((a, b) => Number(!searchKey(a.name).startsWith(head)) - Number(!searchKey(b.name).startsWith(head)) || byUses(a, b));
  }
  if (chip === CHIP_RECENT) return named.filter((e) => (e.uses || 0) > 0).sort(byUses).slice(0, RECENT_MAX);
  if (chip === CHIP_ALL) return named.slice().sort(byName);
  return named.filter((e) => groupsOf(e).has(chip)).sort(byUses);
}

/** «＋ Новое: „…“» — вписали то, чего в базе нет (как в поиске «Заменить»: от трёх букв) */
export function newName(base, q) {
  const name = String(q || '').trim().replace(/\s+/g, ' ');
  if (searchKey(name).length < 3) return '';
  return base.some((e) => searchKey(e.name) === searchKey(name)) ? '' : name;
}

/** Отметить / снять: номер в кружке — место в этом списке (+1) */
export function togglePick(picked, id) {
  return picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
}

export function addLabel(n) {
  return n > 0 ? `Добавить ${n} · по ${ADD_SETS} × ${ADD_REPS}` : 'Отметьте упражнения';
}

/**
 * Строки для тренировки — в порядке отметки. blank — пустая строка
 * редактора, cardio(machine) — план кардио: упражнение базы с видом
 * «кардио» встаёт кардио-отрезком, как «＋ Кардио».
 */
export function rowsOf(picked, base, { blank, cardio }) {
  return picked.map((id) => base.find((e) => e.id === id)).filter(Boolean).map((e) => {
    const isCardio = e.track && e.track.kind === 'cardio';
    return {
      ...blank(),
      name: e.name,
      exerciseId: e.id,
      exercise: e,
      track: e.track || undefined,
      muscles: e.muscles,
      musclesCustom: !!e.musclesCustom,
      ...(isCardio
        ? { sets: '1', reps: '', cardio: cardio(e.track.machine || 'treadmill') }
        : { sets: ADD_SETS, reps: ADD_REPS }),
    };
  });
}
