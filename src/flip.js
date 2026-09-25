import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Перелёт элементов между двумя раскладками (FLIP).
 *
 * Суперсет разъединили — подход «Круг 2 · Выпады» становится вторым
 * подходом отдельного упражнения. Без анимации строки просто
 * перепрыгивают, и не видно, куда что делось. Здесь каждая строка
 * улетает с прежнего места на новое: круги разлетаются по упражнениям,
 * а при соединении слетаются обратно.
 *
 * Элементы помечаются data-flip="ключ" — один и тот же ключ в обеих
 * раскладках. data-flip-delay — задержка в мс (круги летят по очереди).
 * Новые элементы с data-flip-enter проявляются на месте.
 *
 * capture(anchor) зовут в обработчике до изменения данных: он запоминает,
 * где всё стоит, а после отрисовки новой раскладки каждый элемент
 * запускается из старой точки в новую. anchor — ключ элемента, который
 * должен остаться на месте экрана: без него браузер после перестройки
 * прокручивает страницу, и глаз теряет то, на что только что нажали.
 */
const DURATION = 560;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function scrollParent(el) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const y = getComputedStyle(node).overflowY;
    if ((y === 'auto' || y === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return window;
}

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return true; }
}

export function useFlip(rootRef) {
  const before = useRef(null);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const old = before.current;
    before.current = null;
    const root = rootRef.current;
    if (!old || !root) return;
    const anchor = old.anchor && root.querySelector(`[data-flip="${old.anchor}"]`);
    const was = anchor && old.get(old.anchor);
    if (was) {
      // Браузер сам «держит» прокрутку за какой-нибудь элемент, а тот при
      // перестройке пропал — возвращаем прежнюю и сдвигаем уже от неё
      const box = scrollParent(anchor);
      if (box === window) window.scrollTo(0, old.scroll); else box.scrollTop = old.scroll;
      const shift = anchor.getBoundingClientRect().top - was.top;
      if (box === window) window.scrollBy(0, shift); else box.scrollTop += shift;
    }
    root.querySelectorAll('[data-flip], [data-flip-enter]').forEach((el) => {
      if (typeof el.animate !== 'function') return;
      const delay = Number(el.dataset.flipDelay) || 0;
      const from = el.dataset.flip && old.get(el.dataset.flip);
      if (from) {
        const to = el.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) + Math.abs(dy) < 1) return;
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: `translate(${dx * 0.1}px, ${dy * 0.1}px) scale(1.02)`, offset: 0.7 },
            { transform: 'none' },
          ],
          { duration: DURATION, easing: EASE, delay, fill: 'backwards' },
        );
      } else if (el.hasAttribute('data-flip-enter')) {
        el.animate(
          [{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'none' }],
          { duration: 320, easing: 'ease-out', delay, fill: 'backwards' },
        );
      }
    });
  }, [tick]);

  return function capture(anchor) {
    const root = rootRef.current;
    if (!root || reduced()) return;
    const map = new Map();
    root.querySelectorAll('[data-flip]').forEach((el) => {
      const r = el.getBoundingClientRect();
      map.set(el.dataset.flip, { left: r.left, top: r.top });
    });
    map.anchor = anchor;
    const first = anchor && root.querySelector(`[data-flip="${anchor}"]`);
    const box = first ? scrollParent(first) : window;
    map.scroll = box === window ? window.scrollY : box.scrollTop;
    before.current = map;
    setTick((t) => t + 1);
  };
}
