import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Барабан и нижнее окно для чисел анкеты (FT-577) — как у ONLYFITS:
 * рост, вес и возраст выбираются большим пальцем, без клавиатуры.
 *
 * Прокрутка — родная, с привязкой к строкам (scroll-snap): инерция и
 * «щелчки» достаются от системы и одинаковы на iPhone и Android. Для
 * читалки экрана и клавиатуры это обычное поле-счётчик (spinbutton):
 * стрелки меняют на единицу, PageUp/PageDown — на десять, Home/End — края.
 */

const ROW = 44;
const VISIBLE = 5;

export function Wheel({ values, value, onChange, label, format = (v) => String(v), width }) {
  const box = useRef(null);
  const index = Math.max(0, values.indexOf(value));
  const [shown, setShown] = useState(index);
  const settle = useRef(null);
  const frame = useRef(0);

  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = index * ROW;
    setShown(index);
  }, []);

  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = box.current;
      if (!el) return;
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW)));
      setShown(i);
      // Значение отдаём, когда барабан остановился: иначе каждый кадр
      // инерции пересчитывал бы весь экран
      clearTimeout(settle.current);
      settle.current = setTimeout(() => { if (values[i] !== value) onChange(values[i]); }, 90);
    });
  };
  useEffect(() => () => { clearTimeout(settle.current); cancelAnimationFrame(frame.current); }, []);

  const go = (i) => {
    const next = Math.max(0, Math.min(values.length - 1, i));
    const el = box.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: next * ROW, behavior: reduce ? 'auto' : 'smooth' });
  };
  const key = (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[e.key];
    if (step) { e.preventDefault(); go(shown + step); }
    if (e.key === 'Home') { e.preventDefault(); go(0); }
    if (e.key === 'End') { e.preventDefault(); go(values.length - 1); }
  };

  return (
    <div className="wheel" style={width ? { flex: width } : undefined}>
      <div className="wheel__band" aria-hidden="true" />
      <div ref={box} className="wheel__list" onScroll={onScroll} onKeyDown={key} tabIndex={0}
        role="spinbutton" aria-label={label} aria-valuemin={values[0]} aria-valuemax={values[values.length - 1]}
        aria-valuenow={values[shown]} aria-valuetext={format(values[shown])}
        style={{ height: ROW * VISIBLE, paddingBlock: ROW * 2 }}>
        {values.map((v, i) => {
          const d = Math.abs(i - shown);
          return (
            <div key={v} className={'wheel__item' + (d === 0 ? ' is-on' : '')} aria-hidden="true"
              style={{ opacity: d === 0 ? 1 : d === 1 ? 0.5 : d === 2 ? 0.24 : 0.1 }}
              onClick={() => go(i)}>
              {format(v)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Нижнее окно с FT-643 общее — Sheet в ui.jsx */

export const range = (min, max, step = 1) => Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step);
