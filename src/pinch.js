import { useEffect, useRef } from 'react';
import { haptic } from './telegram.js';

/**
 * Щипок двумя пальцами — свернуть длинный список и обратно.
 *
 * Там, где элементов много и их выделяют, удаляют, копируют (редактор
 * программы и шаблонов — «Свернуть тренировки», тренировка — «Выбрать»),
 * до режима было далеко тянуться кнопкой. Свели пальцы — свёрнутый режим,
 * развели — обычный (27.09.2026, просьба владельца). Как в «Фото» на
 * iPhone: сведение — обзор, разведение — подробно.
 *
 * Чувствительность — как у остальных жестов приложения (gestures.jsx):
 * решает ход на 14% ширины экрана или быстрый взмах от 220 px/с после
 * первых 10 px. Срабатывает один раз за жест. Страница сама не
 * масштабируется (user-scalable=no), поэтому щипок свободен.
 */
const COMMIT = 0.14;   // доля ширины экрана — как BACK_COMMIT и DRAWER_COMMIT
const FLICK = 220;     // px/с — как BACK_FLICK
const LOCK = 10;       // px до того, как скорость что-то решает — как LOCK

export function usePinch({ onIn, onOut, enabled = true }) {
  const handlers = useRef({ onIn, onOut });
  handlers.current = { onIn, onOut };

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let start = 0;
    let last = { gap: 0, at: 0 };
    let speed = 0;
    let fired = false;
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const fire = (closing) => {
      const fn = closing ? handlers.current.onIn : handlers.current.onOut;
      fired = true;
      if (!fn) return;
      haptic();
      fn();
    };

    const begin = (e) => {
      if (e.touches.length !== 2) return;
      start = gap(e.touches);
      last = { gap: start, at: performance.now() };
      speed = 0;
      fired = false;
    };
    const move = (e) => {
      if (e.touches.length !== 2 || !start || fired) return;
      const now = performance.now();
      const g = gap(e.touches);
      const dt = now - last.at;
      if (dt > 0) speed = ((g - last.gap) / dt) * 1000;
      last = { gap: g, at: now };
      const change = g - start;
      if (Math.abs(change) >= COMMIT * window.innerWidth) fire(change < 0);
    };
    const end = (e) => {
      if (e.touches.length >= 2) return;
      // Отпустили раньше порога — решает скорость взмаха
      if (start && !fired && Math.abs(last.gap - start) >= LOCK && Math.abs(speed) >= FLICK) fire(speed < 0);
      start = 0;
    };

    document.addEventListener('touchstart', begin, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
    return () => {
      document.removeEventListener('touchstart', begin);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [enabled]);
}
