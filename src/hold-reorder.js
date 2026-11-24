import { haptic } from './telegram.js';

/**
 * Перестановка удержанием (03.10.2026): подержали ~0,45 с — строка едет за
 * пальцем, соседи расступаются, отпустили — встала. Сдвинули палец раньше —
 * это прокрутка, перестановки нет.
 *
 * Слушатель touchmove с preventDefault висит постоянно: iPhone отменяет
 * прокрутку только тому, кто слушал с начала касания.
 */
let dragging = false;
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('touchmove', (ev) => { if (dragging) ev.preventDefault(); }, { passive: false });
}

const EDGE = 90;
const MAX_STEP = 16;

/** Что прокручивается под списком: ближайший прокручиваемый предок, иначе страница */
function scrollerOf(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement || document.documentElement;
}

/**
 * e — pointerdown на строке; rows() — строки списка по порядку; onDrop(from,
 * to) — куда переставили. Нажатие сразу после перетаскивания гасится —
 * иначе отпущенный палец «нажимал» кнопку под собой
 */
export function holdToReorder(e, { rows, onDrop, onStart, row: targetRow = null }) {
  if (dragging || (e.button !== undefined && e.button !== 0)) return;
  const row = targetRow || e.currentTarget;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const id = e.pointerId;
  const off = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', early);
    window.removeEventListener('pointerup', off);
    window.removeEventListener('pointercancel', off);
  };
  const early = (ev) => { if (ev.pointerId === id && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) off(); };
  const timer = setTimeout(() => { off(); begin(); }, 450);
  window.addEventListener('pointermove', early);
  window.addEventListener('pointerup', off);
  window.addEventListener('pointercancel', off);

  function begin() {
    const list = rows();
    const from = list.indexOf(row);
    if (from < 0) return;
    if (onStart) onStart();
    haptic('medium');
    dragging = true;
    try { row.setPointerCapture && row.setPointerCapture(id); } catch (_) { /* старый браузер */ }
    const rects = list.map((r) => r.getBoundingClientRect());
    const mid = (r) => r.top + r.height / 2;
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 8;
    let to = from;
    row.classList.add('is-lifted');
    // У края экрана список едет сам: чем ближе палец к краю, тем быстрее
    const scroller = scrollerOf(row);
    const top0 = scroller.scrollTop;
    const viewport = () => {
      const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
      return isPage ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    };
    let lastY = y0;
    let raf = 0;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const update = () => {
      const dy = lastY - y0 + (scroller.scrollTop - top0);
      const center = mid(rects[from]) + dy;
      let next = from;
      rects.forEach((r, k) => {
        if (k > from && center >= mid(r)) next = Math.max(next, k);
        if (k < from && center <= mid(r)) next = Math.min(next, k);
      });
      const shift = rects[from].height + gap;
      list.forEach((el, k) => {
        if (k === from) { el.style.transform = `translate3d(0, ${dy}px, 0)`; return; }
        let s = 0;
        if (from < next && k > from && k <= next) s = -shift;
        if (from > next && k >= next && k < from) s = shift;
        el.style.transform = s ? `translate3d(0, ${s}px, 0)` : '';
      });
      if (next !== to) { to = next; haptic('light'); }
    };
    const tick = () => {
      const v = viewport();
      const up = Math.max(0, EDGE - (lastY - v.top));
      const down = Math.max(0, EDGE - (v.bottom - lastY));
      const step = Math.round((down - up) / EDGE * MAX_STEP * (reduce ? 0.5 : 1));
      if (step) { scroller.scrollTop += step; update(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      lastY = ev.clientY;
      update();
    };
    const finish = (ev) => {
      if (ev.pointerId !== id) return;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      list.forEach((el) => { el.style.transform = ''; el.classList.remove('is-lifted'); });
      dragging = false;
      const swallow = (c) => { c.preventDefault(); c.stopPropagation(); };
      window.addEventListener('click', swallow, true);
      setTimeout(() => window.removeEventListener('click', swallow, true), 400);
      if (ev.type === 'pointerup' && to !== from) onDrop(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }
}
