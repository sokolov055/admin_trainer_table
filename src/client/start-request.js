/**
 * «▶ Начать тренировку» из записи «Расписания» (FT-788, этап 4): расписание
 * оставляет заявку и открывает карточку клиента на «Тренировках», экран
 * программы забирает её один раз и сразу открывает тренировку. Заявка
 * живёт минуту — чтобы случайно не стартовать через час при другом входе
 */
let pending = null;

export function requestStart(clientRow, blockId) {
  pending = { row: Number(clientRow), blockId: String(blockId || ''), at: Date.now() };
}

export function takeStart(clientRow) {
  if (!pending || pending.row !== Number(clientRow) || Date.now() - pending.at > 60000) return '';
  const id = pending.blockId;
  pending = null;
  return id;
}
