import { useLayoutEffect, useRef } from 'react';

/**
 * Переход между разделами по нажатию — 340 мс, как у бокового меню.
 *
 * Раньше раздел по нажатию сменялся мгновенно, а пальцем — ехал. Одна и та
 * же навигация ощущалась двумя разными. Теперь новый раздел въезжает с той
 * стороны, где он стоит в меню, на небольшое расстояние и проявляется
 * («общая ось»): видно, куда перешли, и глаз не теряет место.
 *
 * Анимация — Web Animations API, только transform: идёт на видеокарте и
 * не мешает загрузке данных. Своё состояние не нужно — элемент тот же,
 * что стоит на экране.
 *
 * Без прозрачности (24.10.2026): раздел проявлялся из нуля, и на первых
 * кадрах сквозь пустой экран проступал рисунок темы — призраки и тыквы
 * «Хэллоуина» вылетали вперёд, экран моргал. Теперь раздел всегда
 * непрозрачный и только доезжает на место.
 *
 * После жеста не играет: страница уже приехала за пальцем, и жест
 * отмечает это классом gesture-landing (gestures.jsx). Тем, кто просил
 * систему меньше двигать, — сразу на месте.
 */

export const VIEW_MS = 340;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'; // --ease-ios
const SHIFT = 48; // px — «рядом», а не «через весь экран»

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

export function playViewIn(el, direction = 1) {
  if (!el || typeof el.animate !== 'function') return;
  if (document.documentElement.classList.contains('gesture-landing') || reduced()) return;

  el.animate([
    { transform: `translate3d(${direction * SHIFT}px, 0, 0)` },
    { transform: 'translate3d(0, 0, 0)' },
  ], { duration: VIEW_MS, easing: EASE });
}

/**
 * Проиграть въезд, когда `key` сменился.
 *
 *   direction(prev, next) — +1 въезд справа, -1 слева;
 *   target()              — что въезжает (вызывается уже после отрисовки).
 */
export function useViewMotion(key, { direction, target }) {
  const previous = useRef(key);
  const opts = useRef(null);
  opts.current = { direction, target };

  useLayoutEffect(() => {
    const was = previous.current;
    previous.current = key;
    if (was === key || typeof document === 'undefined') return;
    const { direction: dir, target: find } = opts.current;
    playViewIn(find(), dir ? dir(was, key) : 1);
  }, [key]);
}

/** Направление по порядку в списке: правее — справа */
export function byOrder(list) {
  return (prev, next) => {
    const a = list.indexOf(prev);
    const b = list.indexOf(next);
    if (a < 0 || b < 0) return 1;
    return b >= a ? 1 : -1;
  };
}
