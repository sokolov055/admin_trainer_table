import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { haptic } from './telegram.js';

/**
 * Щипок двумя пальцами — свернуть длинный список и обратно.
 *
 * Там, где элементов много и их выделяют, удаляют, копируют (редактор
 * программы и шаблонов — «Свернуть тренировки», тренировка — «Выбрать»),
 * свели пальцы — свёрнутый режим, развели — обычный (27.09.2026).
 *
 * Как в «Фото» на iPhone — переход идёт вслед за пальцами. Сводите —
 * каждая карточка ужимается по высоте до своей заголовочной строки, а
 * содержимое гаснет: список на глазах становится строками. Отпустили,
 * дотянув, — включается свёрнутый вид (он выглядит ровно так, во что
 * карточки сжались) и мягко проявляется. Не дотянули — карточки пружиной
 * разворачиваются обратно. Разводите над свёрнутым — строки чуть
 * раздвигаются, после отпускания — развёрнутый вид.
 *
 * Решение — при отпускании: ход 28% ширины экрана (вдвое длиннее прочих
 * жестов — щипок не должен срабатывать от случайного касания двумя
 * пальцами) или быстрый взмах от 220 px/с. Страница сама не
 * масштабируется (user-scalable=no), поэтому щипок свободен.
 *
 * morph: { items: () => элементы-карточки, head: селектор строки,
 * которая остаётся } — для развёрнутого вида; collapsed — сейчас свёрнуто.
 */
const COMMIT = 0.28;   // доля ширины экрана — вдвое больше BACK_COMMIT
const FLICK = 220;     // px/с — как BACK_FLICK
const LOCK = 10;       // px до того, как скорость что-то решает — как LOCK
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
// Медленнее по просьбе владельца (27.09.2026): пружина и вход — мягче,
// ужимание за пальцами — на четверть длиннее хода до порога
const BACK_MS = 650;
const ENTER_MS = 550;
const FOLLOW = 1.45;

const nextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/** Новый вид проявляется и доезжает до места — как смена вида в «Фото» */
function enter(node, closing) {
  if (!node || !node.animate || reduced()) return;
  node.animate(
    [{ opacity: 0.5, transform: `scale(${closing ? 1.02 : 0.98})` }, { opacity: 1, transform: 'scale(1)' }],
    { duration: ENTER_MS, easing: EASE },
  );
}

export function usePinch({ onIn, onOut, enabled = true, target = null, morph = null, collapsed = false }) {
  const opts = useRef({ onIn, onOut, target, morph, collapsed });
  opts.current = { onIn, onOut, target, morph, collapsed };

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    let start = 0;
    let last = { gap: 0, at: 0 };
    let speed = 0;
    let cards = [];   // { el, full, row, rest: [элементы, которые гаснут] }
    let rows = [];    // строки свёрнутого вида — раздвигаются при разведении
    // Якорь: элемент под пальцами. После смены вида он остаётся на том же
    // месте экрана — иначе короткий свёрнутый список «съезжал» к концу
    let anchor = null; // { index, top }
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const pick = (v) => (typeof v === 'function' ? v() : v);

    const clearCards = (animateBack) => {
      const list = cards;
      cards = [];
      list.forEach(({ el, full, rest }) => {
        const done = () => {
          el.style.height = ''; el.style.overflow = ''; el.style.transition = '';
          rest.forEach((r) => { r.style.opacity = ''; r.style.transition = ''; });
        };
        if (animateBack && !reduced()) {
          el.style.transition = `height ${BACK_MS}ms ${EASE}`;
          el.style.height = full + 'px';
          rest.forEach((r) => { r.style.transition = `opacity ${BACK_MS}ms ${EASE}`; r.style.opacity = '1'; });
          setTimeout(done, BACK_MS + 40);
        } else {
          done();
        }
      });
    };
    const clearRows = (animateBack) => {
      const list = rows;
      rows = [];
      list.forEach((el) => {
        if (animateBack && !reduced()) {
          el.style.transition = `margin ${BACK_MS}ms ${EASE}`;
          el.style.marginBottom = '';
          setTimeout(() => { el.style.transition = ''; }, BACK_MS + 40);
        } else {
          el.style.marginBottom = ''; el.style.transition = '';
        }
      });
    };

    const begin = (e) => {
      if (e.touches.length !== 2) return;
      start = gap(e.touches);
      last = { gap: start, at: performance.now() };
      speed = 0;
      cards = [];
      rows = [];
      anchor = null;
      const { morph: m, collapsed: folded, target: t } = opts.current;
      if (m) {
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const list = [...((folded ? (pick(t) && pick(t).querySelectorAll(m.rows)) : pick(m.items)) || [])];
        let best = -1; let bestD = Infinity;
        list.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const d = midY < r.top ? r.top - midY : midY > r.bottom ? midY - r.bottom : 0;
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best >= 0) anchor = { index: best, el: list[best], top: 0 };
      }
      if (reduced()) return;
      if (m && !folded) {
        // Запоминаем высоты: полная карточка и её строка-заголовок
        [...(pick(m.items) || [])].forEach((el) => {
          const head = el.querySelector(m.head);
          if (!head) return;
          const top = el.getBoundingClientRect().top;
          const headBottom = head.getBoundingClientRect().bottom;
          const pad = parseFloat(getComputedStyle(el).paddingBottom) || 12;
          const row = Math.max(40, headBottom - top + pad);
          const full = el.offsetHeight;
          const rest = [...el.children].filter((c) => !c.contains(head) && c !== head);
          cards.push({ el, full, row, rest });
        });
        cards.forEach(({ el, full }) => { el.style.height = full + 'px'; el.style.overflow = 'hidden'; el.style.transition = ''; });
      } else if (folded) {
        const root = pick(t);
        const sel = m && m.rows;
        if (root && sel) rows = [...root.querySelectorAll(sel)];
      }
    };
    const move = (e) => {
      if (e.touches.length !== 2 || !start) return;
      const now = performance.now();
      const g = gap(e.touches);
      const dt = now - last.at;
      if (dt > 0) speed = ((g - last.gap) / dt) * 1000;
      last = { gap: g, at: now };
      const change = g - start;
      const span = COMMIT * window.innerWidth;
      if (cards.length) {
        // Сводим — карточки ужимаются до строк; дальше порога — чуть туже
        const raw = Math.max(0, -change / (span * FOLLOW));
        const p = raw <= 1 ? raw : 1 + (raw - 1) * 0.15;
        cards.forEach(({ el, full, row, rest }) => {
          el.style.height = Math.max(row * 0.9, full - (full - row) * Math.min(p, 1.1)) + 'px';
          const fade = String(Math.max(0, 1 - Math.min(p, 1) * 1.4));
          rest.forEach((r) => { r.style.opacity = fade; });
        });
      } else if (rows.length) {
        // Разводим над свёрнутым — строки раздвигаются
        const p = Math.max(0, Math.min(1.2, change / (span * FOLLOW)));
        rows.forEach((el) => { el.style.marginBottom = (p * 18).toFixed(1) + 'px'; });
      }
    };
    const end = (e) => {
      if (e.touches.length >= 2 || !start) return;
      const change = last.gap - start;
      const far = Math.abs(change) >= COMMIT * window.innerWidth;
      const flick = Math.abs(change) >= LOCK && Math.abs(speed) >= FLICK;
      start = 0;
      const closing = far ? change < 0 : speed < 0;
      const { onIn: fnIn, onOut: fnOut, target: t } = opts.current;
      const fn = (far || flick) ? (closing ? fnIn : fnOut) : null;
      if (!fn) { clearCards(true); clearRows(true); return; }
      const { morph: m } = opts.current;
      // Место якоря — в момент отпускания, а не касания: пока сводили
      // пальцы, карточки выше ужались, и он уехал вверх. Возвращать его на
      // место касания значило сдвигать экран вниз (27.09.2026)
      const hold = anchor;
      if (hold && hold.el) hold.top = hold.el.getBoundingClientRect().top;
      haptic();
      // Новый вид — сразу (flushSync), и в том же кадре — поправка
      // прокрутки: иначе React перерисовывал позже, а поправка считалась
      // по старому экрану
      flushSync(fn);
      clearCards(false);
      clearRows(false);
      if (hold && m) {
        const root = pick(t);
        const list = closing ? (root && root.querySelectorAll(m.rows)) : pick(m.items);
        const el = list && list[Math.min(hold.index, list.length - 1)];
        if (el && typeof window.scrollBy === 'function') window.scrollBy(0, el.getBoundingClientRect().top - hold.top);
      }
      nextFrame(() => enter(pick(t), closing));
    };

    document.addEventListener('touchstart', begin, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
    return () => {
      clearCards(false);
      clearRows(false);
      document.removeEventListener('touchstart', begin);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [enabled]);
}
