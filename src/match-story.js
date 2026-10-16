// Три главы одной короткой истории. Цель собирается только при очистке фигур.
export const MATCH_CHAPTERS = Object.freeze([
  Object.freeze({
    title: 'Открыть зал', place: 'Глава 1 из 3', type: 0, count: 12, coverGoal: 6,
    task: 'Гантели на стойку',
    intro: 'Первые ребята уже у дверей. Раскрой закрытые ящики совпадениями рядом и расставь гантели!',
    halfway: 'Стойка почти готова. Осталось собрать ещё немного инвентаря.',
    won: 'Зал открыт! Команда заходит — теперь ей понадобится энергия.',
    lost: 'До открытия осталось чуть-чуть. Соберём гантели ещё раз.',
  }),
  Object.freeze({
    title: 'Зарядить команду', place: 'Глава 2 из 3', type: 3, count: 14, coverGoal: 6,
    task: 'Яблоки для команды',
    intro: 'Тренировка набирает темп. Открой ящики с запасами и подготовь перекус для команды.',
    halfway: 'Команда уже в ритме. Добавь энергии перед финальным подходом.',
    won: 'Энергии хватит всем! Остался последний рывок к рекорду.',
    lost: 'Пока энергии маловато. Попробуем собрать яблоки поумнее.',
  }),
  Object.freeze({
    title: 'Рекордный сет', place: 'Глава 3 из 3', type: 2, count: 16, coverGoal: 6,
    task: 'Диски для штанги',
    intro: 'Все ждут финального подхода. Раскрой ящики, собери диски для штанги и помоги команде поставить рекорд.',
    halfway: 'Штанга почти собрана. Пора выдать лучший каскад!',
    won: 'Рекорд взят! Зал готов, команда заряжена — и этот день точно запомнят.',
    lost: 'Рекорд близко. Соберём штангу и попробуем ещё раз.',
  }),
]);

export function chapterFor(level) {
  return MATCH_CHAPTERS[Math.max(0, Math.min(MATCH_CHAPTERS.length - 1, level - 1))];
}

export function chapterComplete(game) {
  const chapter = chapterFor(game.level);
  return (game.collected || 0) >= chapter.count && (game.uncovered || 0) >= chapter.coverGoal;
}

export function chapterProgress(game) {
  const chapter = chapterFor(game.level);
  return { collected: Math.min(game.collected || 0, chapter.count), required: chapter.count, uncovered: Math.min(game.uncovered || 0, chapter.coverGoal), coversRequired: chapter.coverGoal };
}
