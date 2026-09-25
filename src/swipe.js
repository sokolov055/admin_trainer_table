import { useRef } from 'react';

/**
 * Смахнуть строку влево — из-под неё выезжает действие (красная корзина),
 * как в «Почте» iPhone. Тот же жест, что в порядке тренировок
 * (trainer/BlockOrder.jsx), для строк без перетаскивания: подходов и
 * упражнений на экране тренировки.
 *
 *   - направление решает первое заметное движение: вверх-вниз — страница
 *     листается как обычно, влево — строка едет за пальцем;
 *   - открывается и быстрым смахиванием, не только протяжкой (скорость);
 *   - за кнопкой и вправо строка тянется с сопротивлением, а не в стену;
 *   - открыта одна строка за раз; касание закрывает.
 *
 * Строка помечается data-swipe-left: жесты экрана (gestures.jsx) не
 * листают разделы с неё, а «назад» вправо с неё работает по-прежнему.
 * Двигается только transform; с reduce motion — без анимации.
 */
const SLOP = 8;
const FLICK = 0.11;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SNAP_MS = 240;

let closeOpen = null;
let openEl = null;

/**
 * Открыта ли где-то корзина. Жесты экрана (gestures.jsx) спрашивают: пока
 * она открыта, смахивание вправо — не «назад», а «закрыть корзину»; любое
 * касание мимо строки тоже её закрывает. Выход — следующим смахиванием.
 */
export function openSwipeRow() { return closeOpen ? openEl : null; }
export function closeSwipeRow() { if (closeOpen) closeOpen(); }

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

export function useSwipe({ width = 88, disabled = false } = {}) {
  const content = useRef(null);
  const action = useRef(null);
  const g = useRef(null);
  const open = useRef(false);
  const self = useRef(null);

  const place = (x, animate) => {
    const el = content.current;
    if (!el) return;
    const t = animate && !reduced() ? `${SNAP_MS}ms ${EASE}` : '';
    el.style.transition = t ? 'transform ' + t : 'none';
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    if (action.current) {
      action.current.style.transition = t ? 'opacity ' + t : 'none';
      action.current.style.opacity = String(Math.min(1, Math.abs(x) / width));
      action.current.style.visibility = x ? 'visible' : 'hidden';
    }
  };

  if (!self.current) {
    self.current = () => {
      place(0, true);
      open.current = false;
      if (closeOpen === self.current) closeOpen = null;
    };
  }

  const onPointerDown = (e) => {
    if (disabled || (e.button !== undefined && e.button !== 0)) return;
    // Касание другой строки закрывает открытую
    if (closeOpen && closeOpen !== self.current) closeOpen();
    g.current = { x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId, axis: null, x: 0, base: open.current ? -width : 0, el: e.currentTarget };
  };

  const onPointerMove = (e) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (s.axis === 'y' || (dx > 0 && !open.current)) { g.current = null; return; }
      try { s.el.setPointerCapture(e.pointerId); } catch (_) { /* уже отпустили */ }
      // Поле ввода не должно открыть клавиатуру посреди смахивания
      if (document.activeElement && s.el.contains(document.activeElement)) document.activeElement.blur();
    }
    let x = s.base + dx;
    if (x > 0) x *= 0.2;
    if (x < -width) x = -width + (x + width) * 0.3;
    s.x = x;
    place(x, false);
  };

  const onPointerUp = (e) => {
    const s = g.current;
    g.current = null;
    if (!s || e.pointerId !== s.id) return;
    if (s.axis !== 'x') {
      // Касание по корзине — её дело: закрыть строку значило бы спрятать
      // кнопку до того, как браузер пришлёт по ней «нажатие»
      if (open.current && !(action.current && action.current.contains(e.target))) self.current();
      return;
    }
    const dx = e.clientX - s.x0;
    const flick = Math.abs(dx) / Math.max(1, performance.now() - s.t0) > FLICK;
    const shut = s.base !== 0 && (dx > width / 2 || (flick && dx > 0));
    const opened = !shut && (s.x < -width / 2 || (flick && dx < 0));
    place(opened ? -width : 0, true);
    open.current = opened;
    if (opened) { closeOpen = self.current; openEl = s.el; } else if (closeOpen === self.current) closeOpen = null;
    // Смахивание — не нажатие: кнопки под пальцем срабатывать не должны
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    s.el.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => s.el.removeEventListener('click', stop, { capture: true }), 0);
  };

  return {
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, 'data-swipe-left': '' },
    content,
    action,
    close: () => self.current(),
    // После удаления узел может достаться соседней строке — закрыть сразу
    reset: () => { place(0, false); open.current = false; if (closeOpen === self.current) closeOpen = null; },
  };
}
