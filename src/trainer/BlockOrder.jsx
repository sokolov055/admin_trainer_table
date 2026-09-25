import React, { useLayoutEffect, useRef, useState } from 'react';
import { haptic } from '../telegram.js';
import { plural } from '../ui.jsx';
import { IconGrip, IconCopy, IconTrash, IconCheck } from '../icons.jsx';
import { dust } from '../dust.js';

/**
 * Порядок тренировок в программе — перетаскиванием.
 *
 * Тренировка в редакторе выше экрана, и тащить её целиком нельзя: палец
 * упирается в край, а цель не видна. Поэтому порядок меняют в свёрнутом
 * виде — одна строка на тренировку. Строка едет за пальцем, соседние
 * расступаются, отпустил — встала на место.
 *
 * Три жеста на одной строке, и они не мешают друг другу: направление
 * решает первое заметное движение пальца.
 *   - вверх-вниз — перестановка;
 *   - влево — из-под строки выезжает красная корзина (как в «Почте»
 *     iPhone); открывается и быстрым смахиванием, не только протяжкой;
 *   - держать, не двигая, — действия: скопировать или удалить.
 *
 * «Выбрать» — отметить несколько тренировок и удалить или скопировать
 * разом. С клавиатуры — стрелки вверх и вниз, Delete — удалить.
 */
const HOLD_MS = 450;
const SLOP = 8;
/** Ширина красной кнопки под строкой */
const ACTION_W = 88;
/** Смахнули быстрее — открываем, даже если протянули недалеко */
const FLICK = 0.11;
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SNAP_MS = 240;

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

export default function BlockOrder({ blocks, onMove, onCopy, onRemove, onOpen, disabled }) {
  const [menu, setMenu] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const holdTimer = useRef(null);
  const listRef = useRef(null);
  const contents = useRef([]);
  const gesture = useRef(null);
  const settle = useRef(false);

  // После перестановки или удаления строки уже на новых местах — сдвиги
  // убираем до отрисовки, иначе на кадр мелькнул бы прежний порядок
  useLayoutEffect(() => {
    if (!listRef.current) return;
    if (settle.current) {
      [...listRef.current.children].forEach((row) => { row.style.transform = ''; });
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.classList.remove('block-order--settle');
        settle.current = false;
      });
    }
    contents.current.forEach((el) => { if (el) { el.style.transition = 'none'; el.style.transform = ''; } });
    setOpenRow(null);
    setSelected((prev) => new Set([...prev].filter((i) => i < blocks.length)));
  }, [blocks]);

  /** Сдвинуть содержимое строки — анимацией или сразу (за пальцем) */
  const slide = (i, x, animate) => {
    const el = contents.current[i];
    if (!el) return;
    el.style.transition = animate && !reduced() ? `transform ${SNAP_MS}ms ${EASE}` : 'none';
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    const action = el.parentElement && el.parentElement.querySelector('.block-order__swipe');
    if (action) {
      const p = Math.min(1, Math.abs(x) / ACTION_W);
      action.style.transition = el.style.transition.replace('transform', 'opacity');
      action.style.opacity = String(p);
    }
  };

  const closeOpen = () => {
    if (openRow !== null) slide(openRow, 0, true);
    setOpenRow(null);
  };

  const start = (e, index) => {
    if (disabled || selecting || gesture.current || (e.button !== undefined && e.button !== 0)) return;
    // Открыты действия — касание их закрывает, а не начинает жест
    if (menu !== null) { setMenu(null); return; }
    const rows = [...listRef.current.children];
    const step = rows.length > 1
      ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top
      : e.currentTarget.offsetHeight;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      from: index, to: index, x0: e.clientX, y0: e.clientY, t0: performance.now(),
      step, rows, id: e.pointerId, axis: null, x: 0, base: openRow === index ? -ACTION_W : 0,
      // Перестановка — только за ручку: остальная строка листает страницу,
      // иначе длинный список не пролистать, положив палец на строку
      grip: !!(e.target.closest && e.target.closest('.block-order__handle')),
    };

    // Держат, не двигая, — это вызов действий
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      const g = gesture.current;
      if (!g || g.axis) return;
      gesture.current = null;
      closeOpen();
      setMenu(index);
      haptic('medium');
    }, HOLD_MS);
  };

  const move = (e) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;

    if (!g.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
      clearTimeout(holdTimer.current);
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'y' && !g.grip) { gesture.current = null; return; }
      if (g.axis === 'y') {
        closeOpen();
        setDragging(g.from);
        haptic('light');
      } else if (openRow !== null && openRow !== g.from) {
        // Открыта другая строка — закрываем её, одна корзина за раз
        slide(openRow, 0, true);
        setOpenRow(null);
      }
    }

    if (g.axis === 'x') {
      // За кнопкой и вправо — с сопротивлением, а не в невидимую стену
      let x = g.base + dx;
      if (x > 0) x *= 0.2;
      if (x < -ACTION_W) x = -ACTION_W + (x + ACTION_W) * 0.3;
      g.x = x;
      slide(g.from, x, false);
      return;
    }

    const last = g.rows.length - 1;
    const shift = Math.max(-g.from * g.step, Math.min((last - g.from) * g.step, dy));
    const to = Math.max(0, Math.min(last, g.from + Math.round(shift / g.step)));

    g.rows[g.from].style.transform = `translate3d(0, ${shift}px, 0)`;
    g.rows.forEach((row, k) => {
      if (k === g.from) return;
      let s = 0;
      if (g.from < to && k > g.from && k <= to) s = -g.step;
      if (g.from > to && k < g.from && k >= to) s = g.step;
      row.style.transform = s ? `translate3d(0, ${s}px, 0)` : '';
    });

    if (to !== g.to) {
      g.to = to;
      haptic('light');
    }
  };

  const end = (e) => {
    clearTimeout(holdTimer.current);
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;

    if (g.axis === 'x') {
      const dx = e.clientX - g.x0;
      const velocity = Math.abs(dx) / Math.max(1, performance.now() - g.t0);
      const flick = velocity > FLICK;
      const open = g.x < -ACTION_W / 2 || (flick && dx < 0);
      const shut = g.base !== 0 && (dx > ACTION_W / 2 || (flick && dx > 0));
      const target = open && !shut ? -ACTION_W : 0;
      slide(g.from, target, true);
      setOpenRow(target ? g.from : null);
      if (target && openRow !== g.from) haptic('light');
      return;
    }

    if (g.axis !== 'y') {
      // Просто касание: открытая корзина закрывается, а если закрывать
      // нечего — открывается сама тренировка
      if (openRow !== null) closeOpen();
      else if (onOpen && !(e.target.closest && e.target.closest('.block-order__handle'))) onOpen(g.from);
      return;
    }

    setDragging(null);
    if (g.to === g.from) {
      g.rows.forEach((row) => { row.style.transform = ''; });
      return;
    }
    listRef.current.classList.add('block-order--settle');
    settle.current = true;
    onMove(g.from, g.to);
    haptic('success');
  };

  /** Удалить с уходом строки влево: строка гаснет и уезжает, потом исчезает */
  const removing = useRef(false);
  const remove = (indices) => {
    if (removing.current || blocks.length - indices.length < 1) return;
    removing.current = true;
    haptic('success');
    const rows = indices.map((i) => listRef.current && listRef.current.children[i]).filter(Boolean);
    const done = () => { removing.current = false; onRemove(indices); setSelected(new Set()); setSelecting(false); };
    // В пыль: тренировка рассыпается и гаснет (dust.js)
    Promise.all(rows.map(dust)).then(done);
  };

  const onKey = (e, index) => {
    if (disabled || selecting) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove([index]); return; }
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

  const toggle = (i) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
    haptic('light');
  };

  const chosen = [...selected].sort((a, b) => a - b);
  const all = selected.size === blocks.length;

  return (
    <>
      <div className="block-order__bar">
        {selecting ? (
          <>
            <button type="button" className="button button--ghost" onClick={() => setSelected(all ? new Set() : new Set(blocks.map((_, i) => i)))}>
              {all ? 'Снять все' : 'Выбрать все'}
            </button>
            <button type="button" className="button button--ghost" onClick={() => { setSelecting(false); setSelected(new Set()); }}>Отмена</button>
          </>
        ) : (
          <button type="button" className="button button--ghost" disabled={disabled} onClick={() => { closeOpen(); setMenu(null); setSelecting(true); }}>
            <IconCheck size={16} />
            Выбрать
          </button>
        )}
      </div>

      <ol className={'block-order' + (selecting ? ' block-order--selecting' : '')} ref={listRef} data-no-gestures aria-label="Порядок тренировок">
        {blocks.map((block, i) => {
          const count = block.exercises.filter((x) => String(x.name || '').trim()).length;
          const picked = selected.has(i);
          const title = block.title || 'Без названия';
          return (
            <li
              key={i}
              className={'block-order__row' + (dragging === i ? ' is-dragging' : '') + (picked ? ' is-picked' : '')}
              tabIndex={0}
              aria-label={selecting
                ? `${i + 1}. ${title} — ${picked ? 'выбрана' : 'не выбрана'}`
                : `${i + 1}. ${title} — стрелками вверх и вниз можно переставить, Delete — удалить`}
              aria-selected={selecting ? picked : undefined}
              onPointerDown={(e) => start(e, i)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onClick={selecting ? () => toggle(i) : undefined}
              onKeyDown={(e) => (selecting && (e.key === ' ' || e.key === 'Enter') ? (e.preventDefault(), toggle(i)) : onKey(e, i))}
            >
              {/* Корзина под строкой: выезжает, когда строку смахивают влево */}
              <div className="block-order__swipe" aria-hidden={openRow !== i}>
                <button
                  type="button"
                  className="block-order__trash"
                  tabIndex={openRow === i ? 0 : -1}
                  aria-label={`Удалить «${title}»`}
                  disabled={blocks.length === 1}
                  onPointerDown={(e) => e.stopPropagation()}
                  /* На отпускание пальца: на iPhone «нажатие» по только что
                     выдвинутой кнопке приходит не всегда */
                  onPointerUp={(e) => { e.stopPropagation(); remove([i]); }}
                  onClick={(e) => { e.stopPropagation(); remove([i]); }}
                >
                  <IconTrash size={22} />
                  <span>Удалить</span>
                </button>
              </div>

              <div className="block-order__content" ref={(el) => { contents.current[i] = el; }}>
                {selecting
                  ? <span className={'block-order__pick' + (picked ? ' is-on' : '')} aria-hidden="true">{picked && <IconCheck size={14} />}</span>
                  : <span className="plan-edit__block-num" aria-hidden="true">{i + 1}</span>}
                <span className="block-order__text">
                  <span className="block-order__title">{title}</span>
                  <span className="block-order__meta">{count} {plural(count, 'упражнение', 'упражнения', 'упражнений')}</span>
                </span>
                {!selecting && <span className="block-order__handle" aria-hidden="true"><IconGrip size={20} className="block-order__grip" /></span>}
                {menu === i && (
                  <div className="block-order__menu" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="button" onClick={() => { setMenu(null); onCopy([i]); haptic('success'); }}>
                      <IconCopy size={16} />
                      Копировать
                    </button>
                    <button
                      className="button button--ghost danger"
                      disabled={blocks.length === 1}
                      onClick={() => { setMenu(null); remove([i]); }}
                    >
                      <IconTrash size={16} />
                      Удалить
                    </button>
                    <button className="button button--ghost" onClick={() => setMenu(null)}>Отмена</button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Действия над выбранными — внизу, под пальцем */}
      {selecting && (
        <div className="block-order__actions" role="toolbar" aria-label="Действия с выбранными">
          <span className="block-order__count">{chosen.length ? 'Выбрано ' + chosen.length : 'Отметьте тренировки'}</span>
          <button type="button" className="button" disabled={!chosen.length} onClick={() => { onCopy(chosen); haptic('success'); setSelected(new Set()); setSelecting(false); }}>
            <IconCopy size={16} />
            Копировать
          </button>
          <button type="button" className="button button--critical" disabled={!chosen.length || all} onClick={() => remove(chosen)}>
            <IconTrash size={16} />
            Удалить
          </button>
        </div>
      )}
    </>
  );
}
