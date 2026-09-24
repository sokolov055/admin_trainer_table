import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

/**
 * Переключатель разделов внутри экрана с переезжающей подсветкой — тот же
 * вид, что у «навигационных» чипов, но выбранный раздел отмечен одной
 * «таблеткой», которая едет к нажатому, как в нижнем меню.
 *
 * Кнопки разной ширины, поэтому положение таблетки меряется по самим
 * кнопкам. При листании пальцем её ведёт gestures.jsx через drag(pos):
 * pos — дробный номер раздела, 1.4 — «сорок процентов пути от второго к
 * третьему». release() отдаёт таблетку обратно выбранному разделу.
 */
const NavTabs = forwardRef(function NavTabs({ items, value, onChange }, ref) {
  const rowRef = useRef(null);
  const pillRef = useRef(null);
  const [box, setBox] = useState(null);

  const buttons = () => (rowRef.current ? [...rowRef.current.querySelectorAll('.chip')] : []);

  const measure = (index) => {
    const el = buttons()[index];
    return el ? { x: el.offsetLeft, w: el.offsetWidth } : null;
  };

  const index = Math.max(0, items.findIndex((item) => item.value === value));

  /**
   * Ряд шире экрана прокручивается так, чтобы таблетка была видна. Раньше
   * это делал scrollIntoView браузера — с задержкой: таблетка уезжала за
   * край, а ряд догонял её через полсекунды. Теперь ряд едет вместе с ней:
   * при нажатии — той же кривой и за то же время, при листании пальцем —
   * в каждом кадре.
   */
  const scrollAnim = useRef(0);
  const scrollFor = (box) => {
    const row = rowRef.current;
    if (!row || !box) return null;
    const max = row.scrollWidth - row.clientWidth;
    if (max <= 0) return null;
    const pad = 28;
    let left = row.scrollLeft;
    if (box.x - pad < left) left = box.x - pad;
    else if (box.x + box.w + pad > left + row.clientWidth) left = box.x + box.w + pad - row.clientWidth;
    return Math.max(0, Math.min(max, left));
  };

  const glide = (target) => {
    const row = rowRef.current;
    cancelAnimationFrame(scrollAnim.current);
    if (!row || target === null || Math.abs(target - row.scrollLeft) < 1) return;
    const from = row.scrollLeft;
    const t0 = performance.now();
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : 340;
    const step = (now) => {
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      // Та же мягкая остановка, что у таблетки (--ease-ios)
      const e = 1 - Math.pow(1 - p, 4);
      row.scrollLeft = from + (target - from) * e;
      if (p < 1) scrollAnim.current = requestAnimationFrame(step);
    };
    scrollAnim.current = requestAnimationFrame(step);
  };

  useLayoutEffect(() => {
    const next = measure(index);
    setBox(next);
    glide(scrollFor(next));
  }, [index, items.length]);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !rowRef.current) return undefined;
    const ro = new ResizeObserver(() => setBox(measure(index)));
    ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, [index]);

  useImperativeHandle(ref, () => ({
    drag(pos) {
      const pill = pillRef.current;
      if (!pill) return;
      const from = measure(Math.floor(pos));
      const to = measure(Math.ceil(pos)) || from;
      if (!from) return;
      const t = pos - Math.floor(pos);
      pill.style.transition = 'none';
      const x = from.x + (to.x - from.x) * t;
      const w = from.w + (to.w - from.w) * t;
      pill.style.transform = `translate3d(${x}px, 0, 0)`;
      pill.style.width = w + 'px';
      // Ряд едет за таблеткой, а не таблетка за край
      cancelAnimationFrame(scrollAnim.current);
      const left = scrollFor({ x, w });
      if (left !== null && rowRef.current) rowRef.current.scrollLeft = left;
    },
    release() {
      const pill = pillRef.current;
      if (!pill) return;
      pill.style.transition = '';
      pill.style.transform = '';
      pill.style.width = '';
    },
  }), [items.length]);

  return (
    <div className="chips chips--nav chips--sliding" role="tablist" ref={rowRef}>
      <span
        className="chips__pill"
        ref={pillRef}
        aria-hidden="true"
        style={box ? { '--pill-x': box.x + 'px', '--pill-w': box.w + 'px' } : { opacity: 0 }}
      />
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={item.value === value}
          className={'chip' + (item.value === value ? ' chip--active' : '')}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});

export default NavTabs;
