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

  useLayoutEffect(() => {
    setBox(measure(index));

    // Выбранная кнопка должна быть видна, даже если ряд прокручен
    const el = buttons()[index];
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (_) {}
    }
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
      pill.style.transform = `translate3d(${from.x + (to.x - from.x) * t}px, 0, 0)`;
      pill.style.width = (from.w + (to.w - from.w) * t) + 'px';
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
