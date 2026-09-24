/**
 * Прокрутить страницу к запомненному месту — но не дальше её конца.
 *
 * Место запоминается при уходе с раздела, а к возвращению страница могла
 * стать короче (пришли другие данные, раздел ещё не дорисован). Safari на
 * iPhone прокрутку за конец выполняет, а потом «отпускает» страницу, и
 * всё закреплённое — нижнее меню, подложка под часами, липкие плашки —
 * съезжает со своих мест, пока приложение не перезапустить.
 */
export function scrollToClamped(y) {
  if (typeof window === 'undefined' || !window.scrollTo) return;
  const doc = document.documentElement;
  const max = Math.max(0, (doc.scrollHeight || 0) - (window.innerHeight || 0));
  window.scrollTo(0, Math.min(Math.max(0, y || 0), max));
}
