/** Карточка упражнения в библиотеке (Упражнения, этап 2): что показать и что скрыть. Без React. */
import { loadLabel } from './exercise-list-model.js';

/** Строки текста — шаги техники, ошибки, подготовка; пустые строки пропускаем */
export function linesOf(text) {
  return String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/** «1 тренажёр», «2 тренажёра», «5 тренажёров» — подпись к числу */
export function machinesWord(n) {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'тренажёр';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'тренажёра';
  return 'тренажёров';
}

/** Три факта под названием: нагрузка, группа и либо число тренажёров, либо инвентарь */
export function cardFacts(e) {
  const machines = (e.machines || []).length;
  return [
    { value: loadLabel(e), label: 'нагрузка' },
    { value: e.muscle || 'Без группы', label: 'группа' },
    machines
      ? { value: String(machines), label: machinesWord(machines) }
      : { value: e.equipment || '—', label: 'инвентарь' },
  ];
}

/** Подготовка видна клиенту только пока к упражнению не привязан тренажёр (правило из программы) */
export function showSetup(e) {
  return !(e.machines || []).length && !!String(e.setup || '').trim();
}

/** Общее упражнение без своей версии: пояснение о том, что создаст правка */
export function commonNotice(e) {
  return e.mine ? '' : 'Общее упражнение. «Изменить» создаст вашу версию — общая не изменится.';
}

/** Удалить — своё; убрать у себя — общее, его можно вернуть и позже */
export function removeLabel(e) {
  return e.mine ? 'Удалить' : 'Убрать у себя';
}
