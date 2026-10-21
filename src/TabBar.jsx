import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconPlus } from './icons.jsx';
import './tabbar-action.css';

/**
 * Нижнее меню — плавающая капсула, как в новом Telegram и iOS 26.
 *
 * Капсула не прибита к краю экрана, а висит над ним: полупрозрачная, с
 * размытием того, что прокручивается под ней, и светлой кромкой сверху
 * вместо жёсткой линии. Так она читается как отдельный слой управления,
 * а не как ещё одна полоса контента.
 *
 * Выбранный раздел отмечен «таблеткой», которая одна на всё меню и
 * переезжает к нажатой вкладке, а не вспыхивает на новом месте: видно,
 * откуда и куда перешли. Её положение — одна переменная `--tab-pos`;
 * при листании разделов пальцем её же двигает gestures.jsx, и таблетка
 * едет вслед за пальцем.
 *
 * action — круглая кнопка посередине (у клиента — «+» быстрой записи,
 * пункт 13 плана 21.10.2026). Она не вкладка: раздел не выбирает, таблетка
 * её перепрыгивает. Без action меню прежнее — так у тренера.
 * action.open — лист открыт, «+» повёрнут в крестик; action.raised — лист
 * на экране (и пока уходит): меню стоит над его затемнением, и крестик
 * виден там же, где был плюс.
 */
export default function TabBar({ tabs, active, onSelect, action = null }) {
  const index = Math.max(0, tabs.findIndex((t) => t.id === active));
  const onTab = tabs.some((t) => t.id === active);
  const nav = useRef(null);
  const { slots, ready } = useSlots(nav, !!action, tabs.length);
  const hint = usePlusHint(action && action.open);

  const item = (t) => {
    const Icon = t.Icon;
    const current = t.id === active;
    return (
      <button
        key={t.id}
        data-tab={t.id}
        className={'tabbar__item' + (current ? ' tabbar__item--active' : '')}
        onClick={() => onSelect(t.id)}
        tabIndex={onTab ? undefined : -1}
        aria-current={current ? 'page' : undefined}
      >
        <span className="tabbar__icon"><Icon size={21} /></span>
        {t.label}
      </button>
    );
  };

  // Кнопка — ровно между половинами: слева две вкладки, справа две
  const half = Math.ceil(tabs.length / 2);

  return (
    <nav
      ref={nav}
      // На экранах бокового меню («Расходы», «Мои данные») ни одна вкладка
      // не выбрана, и меню висело бы пустой подставкой поверх списка. Там
      // оно уезжает вниз, как в iOS, и возвращается с разделом.
      className={'tabbar' + (action ? ' tabbar--action' : '') + (action && action.raised ? ' tabbar--raised' : '') + (ready ? ' tabbar--ready' : '') + (onTab ? '' : ' tabbar--hidden')}
      style={{ '--tab-count': tabs.length, '--tab-pos': index }}
      aria-hidden={onTab ? undefined : 'true'}
    >
      <span
        className={'tabbar__pill' + (onTab ? '' : ' tabbar__pill--off')}
        style={action && slots ? pillTrack(slots) : undefined}
        aria-hidden="true"
      />

      {action ? (
        <>
          <div className="tabbar__group">{tabs.slice(0, half).map(item)}</div>
          <button
            type="button"
            className={'tabbar__action' + (hint && onTab ? ' tabbar__action--hint' : '')}
            aria-label={action.label}
            aria-haspopup="dialog"
            aria-expanded={!!action.open}
            onClick={action.onClick}
            tabIndex={onTab ? undefined : -1}
          >
            <span className="tabbar__action-disc">
              <span className="tabbar__action-glyph"><IconPlus size={26} strokeWidth={2.4} /></span>
            </span>
          </button>
          <div className="tabbar__group">{tabs.slice(half).map(item)}</div>
        </>
      ) : tabs.map(item)}
    </nav>
  );
}

/**
 * Подсказка «здесь можно записать»: одно кольцо расходится от «+» при
 * запуске, пока человек ни разу его не открыл. Одно, а не пульс по кругу:
 * медленное мигание без конца раздражает и укачивает (apple-design,
 * «Reduced motion»), а новичку хватает одного взгляда. Открыл лист — больше
 * не показываем. Память — на устройстве; нет её (приватный режим) — кольцо
 * просто покажется ещё раз.
 */
const PLUS_SEEN = 'fittrack_plus_seen_v1';
function usePlusHint(open) {
  const [hint, setHint] = useState(() => {
    try { return !window.localStorage.getItem(PLUS_SEEN); } catch (_) { return false; }
  });
  useEffect(() => {
    if (!open || !hint) return;
    setHint(false);
    try { window.localStorage.setItem(PLUS_SEEN, '1'); } catch (_) { /* без памяти — покажем ещё раз */ }
  }, [open, hint]);
  return hint;
}

/**
 * Места вкладок [слева, ширина] — только в меню с кнопкой посередине.
 *
 * Там вкладки шириной по подписи, а не поровну: пятый элемент на 360 px
 * не оставлял бы «Тренировкам» места, и подпись обрезалась бы. Поэтому
 * таблетке нужны настоящие места, и они перемеряются, когда меняется
 * ширина экрана или крупность шрифта.
 *
 * ready — через два кадра после первого замера: до него у таблетки нет
 * перехода, иначе на запуске она ехала бы из места «поровну» в своё.
 */
function useSlots(nav, on, count) {
  const [slots, setSlots] = useState(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const bar = nav.current;
    if (!on || !bar) return undefined;
    const measure = () => {
      const next = [...bar.querySelectorAll('.tabbar__item')].map((b) => [b.offsetLeft, b.offsetWidth]);
      setSlots((prev) => (prev && prev.join() === next.join() ? prev : next));
    };
    measure();
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setReady(true)); });
    const stop = () => cancelAnimationFrame(frame);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => { stop(); window.removeEventListener('resize', measure); };
    }
    const watch = new ResizeObserver(measure);
    watch.observe(bar);
    bar.querySelectorAll('.tabbar__item').forEach((b) => watch.observe(b));
    return () => { stop(); watch.disconnect(); };
  }, [nav, on, count]);
  return { slots, ready };
}

/**
 * Место и ширина таблетки по --tab-pos. Позиция бывает дробной — палец
 * тянет таблетку между вкладками (gestures.jsx), — поэтому это ломаная:
 * каждое слагаемое добавляет шаг к следующей вкладке ровно настолько,
 * насколько он пройден. Целое --tab-pos даёт ровно место вкладки.
 */
function pillTrack(slots) {
  const line = (k) => slots.slice(1).reduce(
    (expr, slot, i) => `${expr} + ${slot[k] - slots[i][k]}px * clamp(0, var(--tab-pos) - ${i}, 1)`,
    `${slots[0][k]}px`,
  );
  return { width: `calc(${line(1)})`, transform: `translate3d(calc(${line(0)}), 0, 0)` };
}
