// Три главы одной короткой истории. Цель собирается только при очистке фигур.
export const MATCH_CHAPTERS = Object.freeze([
  Object.freeze({
    title: 'Открыть зал', place: 'Глава 1 из 3', type: 0, count: 6,
    task: 'Гантели на стойку',
    intro: 'Первые ребята уже у дверей, а зал ещё не готов. Расставим гантели и откроем тренировку!',
    halfway: 'Стойка почти готова. Осталось собрать ещё немного инвентаря.',
    won: 'Зал открыт! Команда заходит — теперь ей понадобится энергия.',
    lost: 'До открытия осталось чуть-чуть. Соберём гантели ещё раз.',
  }),
  Object.freeze({
    title: 'Зарядить команду', place: 'Глава 2 из 3', type: 3, count: 7,
    task: 'Яблоки для команды',
    intro: 'Тренировка набирает темп. Подготовь полезный перекус, чтобы у команды хватило сил на главный сет.',
    halfway: 'Команда уже в ритме. Добавь энергии перед финальным подходом.',
    won: 'Энергии хватит всем! Остался последний рывок к рекорду.',
    lost: 'Пока энергии маловато. Попробуем собрать яблоки поумнее.',
  }),
  Object.freeze({
    title: 'Рекордный сет', place: 'Глава 3 из 3', type: 2, count: 8,
    task: 'Диски для штанги',
    intro: 'В зале тихо: все ждут финального подхода. Собери диски для штанги и помоги команде поставить рекорд.',
    halfway: 'Штанга почти собрана. Пора выдать лучший каскад!',
    won: 'Рекорд взят! Зал готов, команда заряжена — и этот день точно запомнят.',
    lost: 'Рекорд близко. Соберём штангу и попробуем ещё раз.',
  }),
]);

export function chapterFor(level) {
  return MATCH_CHAPTERS[Math.max(0, Math.min(MATCH_CHAPTERS.length - 1, level - 1))];
}

export function chapterComplete(game) {
  return (game.collected || 0) >= chapterFor(game.level).count;
}

export function chapterProgress(game) {
  const chapter = chapterFor(game.level);
  return { collected: Math.min(game.collected || 0, chapter.count), required: chapter.count };
}
