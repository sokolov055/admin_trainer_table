import { useRef } from 'react';
import { haptic } from './telegram.js';

/**
 * Смахнуть строку влево — из-под неё выезжает действие (красная корзина),
 * как в «Почте» iPhone. Тот же жест, что в порядке тренировок
 * (trainer/BlockOrder.jsx), для строк без перетаскивания: подходов и
 * упражнений на экране тренировки.
 *
 *   - направление решает первое заметное движение: вверх-вниз — страница
 *     листается как обычно, влево — строка едет за пальцем;
 *   - открывается и быстрым смахиванием, не только протяжкой (скорость);
 *   - вправо строка тянется с сопротивлением, а не в стену;
 *   - полное смахивание, как на iPhone: тянешь дальше кнопки — красная
 *     полоса растёт за пальцем; за порогом заполняет строку, «Удалить»
 *     переезжает к пальцу, щелчок вибрацией. Отпустил там — удалено, то
 *     же, что нажать кнопку. Вернул палец назад — передумал;
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
/** Порог полного смахивания — доля ширины строки, но не ближе двух кнопок */
const FULL_SHARE = 0.55;

export function fullSwipeAt(width, rowWidth) {
  return Math.max(width * 2, rowWidth * FULL_SHARE);
}

/**
 * Нарисовать строку в положении x (отрицательное — влево). Общая для
 * строк тренировки и порядка тренировок в редакторе (BlockOrder.jsx).
 * Красная полоса шире кнопки, когда тянут дальше; armed — за порогом
 * полного смахивания: подпись едет к левому краю полосы, к пальцу.
 */
export function paintSwipe(content, action, x, { width, animate = false, armed = false }) {
  if (!content) return;
  const t = animate && !reduced() ? `${SNAP_MS}ms ${EASE}` : '';
  content.style.transition = t ? 'transform ' + t : 'none';
  content.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
  if (!action) return;
  const w = Math.max(width, -x);
  action.style.transition = t ? `opacity ${t}, width ${t}` : 'none';
  action.style.width = w + 'px';
  action.style.opacity = String(Math.min(1, Math.abs(x) / width));
  action.style.visibility = x ? 'visible' : 'hidden';
  const label = action.firstElementChild && action.firstElementChild.firstElementChild;
  if (label) label.style.transform = armed ? `translate3d(${width - w}px, 0, 0)` : '';
}

/** Сдвиг за пальцем: вправо — сопротивление; влево — до края строки, дальше тоже */
export function followFinger(x, rowWidth, full, width = 88) {
  if (x > 0) return x * 0.2;
  if (!full && x < -width) return -width + (x + width) * 0.3;
  if (x < -rowWidth) return -rowWidth + (x + rowWidth) * 0.2;
  return x;
}

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

export function useSwipe({ width = 88, disabled = false, onFull = null } = {}) {
  const content = useRef(null);
  const action = useRef(null);
  const g = useRef(null);
  const open = useRef(false);
  const self = useRef(null);

  const place = (x, animate, armed = false) => paintSwipe(content.current, action.current, x, { width, animate, armed });

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
    const rowWidth = e.currentTarget.offsetWidth || 320;
    g.current = { x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId, axis: null, x: 0, base: open.current ? -width : 0, el: e.currentTarget, rowWidth, full: fullSwipeAt(width, rowWidth), armed: false };
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
    const x = followFinger(s.base + dx, s.rowWidth, !!onFull, width);
    s.x = x;
    const armed = !!onFull && x <= -s.full;
    if (armed !== s.armed) { s.armed = armed; haptic(armed ? 'medium' : 'light'); }
    place(x, false, armed);
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
    // Смахивание — не нажатие: кнопки под пальцем срабатывать не должны
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    s.el.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => s.el.removeEventListener('click', stop, { capture: true }), 0);
    // Отпустили за порогом — удалить, как кнопкой; строка остаётся где
    // есть, уход продолжится с этого места
    if (s.armed && e.type === 'pointerup') {
      open.current = false;
      if (closeOpen === self.current) closeOpen = null;
      onFull();
      return;
    }
    const dx = e.clientX - s.x0;
    const flick = Math.abs(dx) / Math.max(1, performance.now() - s.t0) > FLICK;
    const shut = s.base !== 0 && (dx > width / 2 || (flick && dx > 0));
    const opened = !shut && (s.x < -width / 2 || (flick && dx < 0));
    place(opened ? -width : 0, true);
    open.current = opened;
    if (opened) { closeOpen = self.current; openEl = s.el; } else if (closeOpen === self.current) closeOpen = null;
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
