import { useEffect, useRef } from 'react';
import { haptic } from './telegram.js';

/**
 * Щипок двумя пальцами — свернуть длинный список и обратно.
 *
 * Там, где элементов много и их выделяют, удаляют, копируют (редактор
 * программы и шаблонов — «Свернуть тренировки», тренировка — «Выбрать»),
 * до режима было далеко тянуться кнопкой. Свели пальцы — свёрнутый режим,
 * развели — обычный (27.09.2026, просьба владельца).
 *
 * Как зум фото на iPhone: список следует за пальцами — сжимается при
 * сведении и растягивается при разведении, с точкой опоры между пальцами
 * и «резиной» у краёв. Решение — при отпускании: ход больше 28% ширины
 * экрана (вдвое длиннее прочих жестов — щипок не должен срабатывать от
 * случайного касания двумя пальцами) или быстрый взмах от 220 px/с. Не
 * дотянули — список пружиной возвращается на место. Только transform:
 * раскладка не пересчитывается, движение идёт на видеокарте.
 */
const COMMIT = 0.28;   // доля ширины экрана — вдвое больше BACK_COMMIT
const FLICK = 220;     // px/с — как BACK_FLICK
const LOCK = 10;       // px до того, как скорость что-то решает — как LOCK
const SPRING = 'transform 320ms cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Отклик под пальцами — лёгкий, не больше 4%: весь экран, увеличенный
 * вслед за пальцами, выглядел как сломанный зум (27.09.2026). Сам переход
 * между видами — после отпускания (enter).
 */
const HINT = 0.04;
function rubber(ratio) {
  const d = (ratio - 1) * 0.25;
  return 1 + Math.max(-HINT, Math.min(HINT, d));
}

/**
 * Вход в новый вид: проявляется и «доезжает» до места — свернули —
 * из чуть большего, развернули — из чуть меньшего, как смена вида в «Фото».
 */
function enter(node, closing) {
  if (!node || !node.animate) return;
  node.animate(
    [{ opacity: 0.35, transform: `scale(${closing ? 1.04 : 0.96})` }, { opacity: 1, transform: 'scale(1)' }],
    { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  );
}

export function usePinch({ onIn, onOut, enabled = true, target = null }) {
  const handlers = useRef({ onIn, onOut, target });
  handlers.current = { onIn, onOut, target };

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let start = 0;
    let last = { gap: 0, at: 0 };
    let speed = 0;
    let el = null;
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

    const release = () => {
      if (!el) return;
      const node = el;
      el = null;
      node.style.transition = reduced() ? '' : SPRING;
      node.style.transform = '';
      const clean = () => { node.style.transition = ''; node.style.transformOrigin = ''; node.style.willChange = ''; };
      node.addEventListener('transitionend', clean, { once: true });
      setTimeout(clean, 400);
    };

    const begin = (e) => {
      if (e.touches.length !== 2) return;
      start = gap(e.touches);
      last = { gap: start, at: performance.now() };
      speed = 0;
      const pick = handlers.current.target;
      el = (typeof pick === 'function' ? pick() : pick) || null;
      if (el && !reduced()) {
        const box = el.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - box.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - box.top;
        el.style.transition = '';
        el.style.willChange = 'transform';
        el.style.transformOrigin = `${cx}px ${cy}px`;
      } else {
        el = null;
      }
    };
    const move = (e) => {
      if (e.touches.length !== 2 || !start) return;
      const now = performance.now();
      const g = gap(e.touches);
      const dt = now - last.at;
      if (dt > 0) speed = ((g - last.gap) / dt) * 1000;
      last = { gap: g, at: now };
      if (el) el.style.transform = `scale(${rubber(g / start).toFixed(4)})`;
    };
    const end = (e) => {
      if (e.touches.length >= 2 || !start) return;
      const change = last.gap - start;
      const far = Math.abs(change) >= COMMIT * window.innerWidth;
      const flick = Math.abs(change) >= LOCK && Math.abs(speed) >= FLICK;
      start = 0;
      const node = el;
      if (!far && !flick) { release(); return; }
      const closing = far ? change < 0 : speed < 0;
      const fn = closing ? handlers.current.onIn : handlers.current.onOut;
      if (!fn) { release(); return; }
      // Сброс отклика без пружины — сразу новый вид со своей анимацией входа
      if (node) { node.style.transition = ''; node.style.transform = ''; node.style.willChange = ''; }
      el = null;
      haptic();
      fn();
      if (node && !reduced()) requestAnimationFrame(() => enter(node, closing));
    };

    document.addEventListener('touchstart', begin, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
    return () => {
      release();
      document.removeEventListener('touchstart', begin);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [enabled]);
}
