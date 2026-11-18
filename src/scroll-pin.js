/**
 * Удержать элемент на том же месте экрана, пока под ним меняется страница
 * (18.11.2026): после «＋ Упражнения → Добавить» на iPhone в первый раз
 * страница прыгала вверх к расписанию — сохранение и перечитывание месяца
 * на миг меняют высоту. Пока держим, каждое изменение высоты гасится
 * прокруткой; любое касание, колесо или клавиша — отпускаем: дальше
 * страница в руках человека. Возвращает «отпустить сейчас».
 */
const INPUT = ['touchstart', 'pointerdown', 'wheel', 'keydown'];

export function pinInView(el, ms = 3000) {
  if (!el || typeof window === 'undefined' || !el.getBoundingClientRect) return () => {};
  const top = el.getBoundingClientRect().top;
  const end = performance.now() + ms;
  let raf = 0;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    INPUT.forEach((type) => window.removeEventListener(type, stop, true));
  };
  INPUT.forEach((type) => window.addEventListener(type, stop, { capture: true, passive: true }));
  const tick = () => {
    if (done) return;
    if (!el.isConnected || performance.now() > end) { stop(); return; }
    const shift = el.getBoundingClientRect().top - top;
    if (Math.abs(shift) > 1) window.scrollBy(0, shift);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
