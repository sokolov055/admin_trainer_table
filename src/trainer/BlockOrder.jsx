import React, { useLayoutEffect, useRef, useState } from 'react';
import { haptic } from '../telegram.js';
import { plural } from '../ui.jsx';
import { IconGrip, IconCopy, IconTrash } from '../icons.jsx';

/**
 * Порядок тренировок в программе — перетаскиванием.
 *
 * Тренировка в редакторе выше экрана, и тащить её целиком нельзя: палец
 * упирается в край, а цель не видна. Поэтому порядок меняют в свёрнутом
 * виде — одна строка на тренировку. Строка едет за пальцем, соседние
 * расступаются, отпустил — встала на место.
 *
 * Строки одной высоты (название в одну строку) — по шагу между ними
 * считается, куда встанет тренировка. С клавиатуры — стрелки вверх и
 * вниз на выбранной строке.
 *
 * Долгое нажатие без движения — действия с тренировкой: скопировать
 * (копия встаёт следом) или удалить.
 */
const HOLD_MS = 450;
const HOLD_SLOP = 6;

export default function BlockOrder({ blocks, onMove, onCopy, onRemove, disabled }) {
  const [menu, setMenu] = useState(null);
  const holdTimer = useRef(null);
  const listRef = useRef(null);
  const drag = useRef(null);
  const settle = useRef(false);
  const [dragging, setDragging] = useState(null);

  // После перестановки строки уже на новых местах — сдвиги убираем до
  // отрисовки, иначе на кадр мелькнул бы прежний порядок
  useLayoutEffect(() => {
    if (!settle.current || !listRef.current) return;
    [...listRef.current.children].forEach((row) => { row.style.transform = ''; });
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.classList.remove('block-order--settle');
      settle.current = false;
    });
  }, [blocks]);

  const start = (e, index) => {
    if (disabled || drag.current || (e.button !== undefined && e.button !== 0)) return;
    // Открыты действия — касание их закрывает, а не начинает перетаскивание
    if (menu !== null) { setMenu(null); return; }
    const rows = [...listRef.current.children];
    const step = rows.length > 1
      ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top
      : e.currentTarget.offsetHeight;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { from: index, to: index, y0: e.clientY, step, rows, id: e.pointerId, moved: false };
    setMenu(null);

    // Держат, не двигая, — это не перетаскивание, а вызов действий
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      const d = drag.current;
      if (!d || d.moved) return;
      drag.current = null;
      setDragging(null);
      setMenu(index);
      haptic('medium');
    }, HOLD_MS);
  };

  const move = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved) {
      if (Math.abs(e.clientY - d.y0) < HOLD_SLOP) return;
      d.moved = true;
      clearTimeout(holdTimer.current);
      setDragging(d.from);
      haptic('light');
    }
    const last = d.rows.length - 1;
    // Дальше крайних мест строка не уезжает
    const dy = Math.max(-d.from * d.step, Math.min((last - d.from) * d.step, e.clientY - d.y0));
    const to = Math.max(0, Math.min(last, d.from + Math.round(dy / d.step)));

    d.rows[d.from].style.transform = `translate3d(0, ${dy}px, 0)`;
    d.rows.forEach((row, k) => {
      if (k === d.from) return;
      let shift = 0;
      if (d.from < to && k > d.from && k <= to) shift = -d.step;
      if (d.from > to && k < d.from && k >= to) shift = d.step;
      row.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
    });

    if (to !== d.to) {
      d.to = to;
      haptic('light');
    }
  };

  const end = (e) => {
    clearTimeout(holdTimer.current);
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setDragging(null);
    if (!d.moved) return;

    if (d.to === d.from) {
      // Никуда не переставили — строка плавно возвращается
      d.rows.forEach((row) => { row.style.transform = ''; });
      return;
    }
    listRef.current.classList.add('block-order--settle');
    settle.current = true;
    onMove(d.from, d.to);
    haptic('success');
  };

  const onKey = (e, index) => {
    if (disabled) return;
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : null;
    if (to === null || to < 0 || to >= blocks.length) return;
    e.preventDefault();
    onMove(index, to);
    // Фокус едет вместе с тренировкой
    requestAnimationFrame(() => {
      const row = listRef.current && listRef.current.children[to];
      if (row) row.focus();
    });
  };

  return (
    <ol className="block-order" ref={listRef} data-no-gestures aria-label="Порядок тренировок">
      {blocks.map((block, i) => {
        const count = block.exercises.filter((x) => String(x.name || '').trim()).length;
        return (
          <li
            key={i}
            className={'block-order__row' + (dragging === i ? ' is-dragging' : '')}
            tabIndex={0}
            aria-label={`${i + 1}. ${block.title || 'Без названия'} — стрелками вверх и вниз можно переставить`}
            onPointerDown={(e) => start(e, i)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="plan-edit__block-num" aria-hidden="true">{i + 1}</span>
            <span className="block-order__text">
              <span className="block-order__title">{block.title || 'Без названия'}</span>
              <span className="block-order__meta">{count} {plural(count, 'упражнение', 'упражнения', 'упражнений')}</span>
            </span>
            <IconGrip size={20} className="block-order__grip" />
            {menu === i && (
              <div className="block-order__menu" onPointerDown={(e) => e.stopPropagation()}>
                <button className="button" onClick={() => { setMenu(null); onCopy(i); haptic('success'); }}>
                  <IconCopy size={16} />
                  Копировать
                </button>
                <button
                  className="button button--ghost danger"
                  disabled={blocks.length === 1}
                  onClick={() => {
                    setMenu(null);
                    if (window.confirm(`Удалить «${block.title || 'тренировку'}»?`)) onRemove(i);
                  }}
                >
                  <IconTrash size={16} />
                  Удалить
                </button>
                <button className="button button--ghost" onClick={() => setMenu(null)}>Отмена</button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
