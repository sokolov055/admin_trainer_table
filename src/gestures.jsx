import React, { useEffect, useRef } from 'react';
import { haptic } from './telegram.js';
import { IconBack, IconRefresh } from './icons.jsx';

/**
 * Два жеста, которых ждут от приложения на телефоне: потянуть вниз —
 * обновить, смахнуть вправо — назад.
 *
 * Как они ощущаются, решают мелочи (apple-design, «Designing Fluid
 * Interfaces»):
 *
 * — Всё идёт за пальцем 1:1, с первого кадра, а не анимацией по итогу.
 * — Жест выбирается не по первому касанию, а после ~10 px движения, когда
 *   ясно направление. До этого страница прокручивается как обычно.
 * — У края — резина: чем дальше тянут, тем меньше идёт индикатор. Жёсткий
 *   упор читается как «зависло».
 * — Делать или нет, решает скорость на отпускании, а не только пройденный
 *   путь: быстрый короткий взмах — тоже решение.
 * — После отпускания движение продолжается пружиной с той же скоростью, без
 *   шва, и его можно перехватить пальцем на лету.
 *
 * Только `transform` и `opacity`, кадры — через requestAnimationFrame и
 * прямую запись стилей: состояние React на каждый кадр пальца дёргало бы
 * перерисовку всего экрана.
 */

/* ==========================================================================
 * Реестр: кто умеет «назад» и кто хочет знать про «обновить»
 * ========================================================================== */

const backStack = [];
const refreshers = new Set();

/**
 * Экран, из которого можно вернуться, регистрирует здесь свой «назад».
 *
 * Работает последний зарегистрированный: вложенный экран (журнал внутри
 * карточки клиента) открывается позже родителя и перекрывает его. Функция
 * берётся из ref на момент жеста — меняться между кадрами ей можно.
 */
export function useBackGesture(handler, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const entry = { run: () => ref.current && ref.current() };
    backStack.push(entry);
    return () => {
      const at = backStack.indexOf(entry);
      if (at !== -1) backStack.splice(at, 1);
    };
  }, [enabled]);
}

/**
 * Подписка на «потянули вниз». Функция может вернуть обещание — индикатор
 * крутится, пока все обещания не закончатся.
 */
export function onPullRefresh(fn) {
  refreshers.add(fn);
  return () => refreshers.delete(fn);
}

export function usePullRefresh(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onPullRefresh(() => ref.current && ref.current()), []);
}

function runRefresh() {
  const jobs = [...refreshers].map((fn) => {
    try { return Promise.resolve(fn()); } catch (e) { return Promise.resolve(); }
  });
  return Promise.allSettled(jobs);
}

/* ==========================================================================
 * Физика
 * ========================================================================== */

/** Резина у границы: чем дальше за край, тем меньше идёт за пальцем */
export function rubberband(distance, dimension, constant = 0.55) {
  return (distance * dimension * constant) / (dimension + constant * Math.abs(distance));
}

/**
 * Пружина с параметрами Apple: damping — перелёт (1 — без перелёта),
 * response — как быстро доходит до цели, в секундах. Стартует с текущего
 * значения и текущей скорости: перехват на лету не даёт рывка.
 */
function spring({ from, to, velocity = 0, damping = 1, response = 0.35, onFrame, onDone }) {
  const stiffness = Math.pow((2 * Math.PI) / response, 2);
  const friction = (4 * Math.PI * damping) / response;

  let x = from;
  let v = velocity;
  let last = null;
  let raf = 0;
  let stopped = false;

  const step = (now) => {
    if (stopped) return;
    const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 1 / 30);
    last = now;

    // Несколько мелких шагов на кадр: при крупном dt жёсткая пружина
    // интегрируется неустойчиво
    for (let i = 0; i < 4; i += 1) {
      const h = dt / 4;
      const a = -stiffness * (x - to) - friction * v;
      v += a * h;
      x += v * h;
    }

    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 10) {
      onFrame(to);
      if (onDone) onDone();
      return;
    }

    onFrame(x);
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);

  return {
    stop() { stopped = true; cancelAnimationFrame(raf); return x; },
  };
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/* ==========================================================================
 * Слой жестов
 * ========================================================================== */

const LOCK = 10;            // px до выбора направления
const PULL_TRIGGER = 72;    // px видимого хода, после которых отпускание обновляет
const PULL_REST = 56;       // где индикатор ждёт, пока идёт обновление
const PULL_MAX = 140;       // дальше резина почти не пускает
const BACK_COMMIT = 0.35;   // доля ширины, после которой «назад» без скорости
const BACK_FLICK = 500;     // px/с — взмах, который решает сам по себе
const MIN_SPIN_MS = 500;    // короче индикатор не крутится: иначе мелькнёт

/**
 * Начало касания там, где свои жесты важнее: ползунок, поле, в котором
 * сейчас печатают (там палец двигает курсор), горизонтальная прокрутка.
 * Над остальными полями «назад» работает, как в iOS: на экране анкеты
 * иначе было бы негде смахнуть.
 */
function ownsHorizontal(target) {
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el.dataset && el.dataset.noSwipe !== undefined) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' && el.type === 'range') return true;
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && document.activeElement === el) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const style = getComputedStyle(el);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true;
    }
  }
  return false;
}

/** Модальные слои (меню, сторис) блокируют прокрутку страницы — тогда жестов нет */
function blocked() {
  return document.body.style.overflow === 'hidden';
}

/** Что едет при «назад»: всё на экране, кроме закреплённой панели вкладок */
function movingParts() {
  const app = document.querySelector('#root .app');
  if (!app) return [];
  return [...app.children].filter((el) => !el.classList.contains('tabbar'));
}

export function Gestures() {
  const pullRef = useRef(null);
  const pullIconRef = useRef(null);
  const backRef = useRef(null);

  useEffect(() => {
    const pull = pullRef.current;
    const pullIcon = pullIconRef.current;
    const back = backRef.current;

    let g = null;               // текущий жест
    let anim = null;            // текущая пружина
    let pullY = 0;              // видимый ход индикатора
    let backX = 0;              // сдвиг экрана
    let refreshing = false;

    /* ---------------- отрисовка ---------------- */

    const drawPull = (y, spinning = false) => {
      pullY = y;
      const progress = Math.min(y / PULL_TRIGGER, 1);
      pull.style.transform = `translate3d(-50%, ${y - 48}px, 0) scale(${0.6 + 0.4 * progress})`;
      pull.style.opacity = y <= 1 ? '0' : String(Math.min(1, 0.25 + progress));
      pull.classList.toggle('pull--armed', progress >= 1);
      pull.classList.toggle('pull--spinning', spinning);
      if (!spinning) pullIcon.style.transform = `rotate(${progress * 270}deg)`;
      pull.style.setProperty('--pull-progress', String(progress));
    };

    const drawBack = (x) => {
      backX = x;
      const width = window.innerWidth;
      const progress = Math.min(x / (width * BACK_COMMIT), 1);
      const parts = movingParts();
      const reduce = reducedMotion();
      // Уходящий экран чуть тускнеет — видно, что он покидает сцену. При
      // «уменьшить движение» он не едет, остаётся только это затухание.
      const fade = Math.min(x / width, 1);
      parts.forEach((el) => {
        el.style.transform = x && !reduce ? `translate3d(${x}px, 0, 0)` : '';
        el.style.opacity = x ? String(1 - (reduce ? 0.3 * progress : 0.35 * fade)) : '';
      });
      back.style.opacity = x <= 1 ? '0' : String(Math.min(1, progress * 1.2));
      back.style.transform = `translate3d(${Math.min(x * 0.4, 28) - 36}px, -50%, 0) scale(${0.7 + 0.3 * progress})`;
      back.classList.toggle('backhint--armed', progress >= 1);
    };

    const clearBack = () => {
      movingParts().forEach((el) => { el.style.transform = ''; el.style.opacity = ''; });
      backX = 0;
      back.style.opacity = '0';
    };

    /* ---------------- касания ---------------- */

    const onStart = (e) => {
      if (e.touches.length !== 1 || blocked()) { g = null; return; }

      // Перехват на лету: берём текущее положение, а не цель пружины
      if (anim) { anim.stop(); anim = null; }

      const t = e.touches[0];
      g = {
        x0: t.clientX,
        y0: t.clientY,
        mode: null,
        atTop: (window.scrollY || document.documentElement.scrollTop) <= 0,
        canBack: backStack.length > 0 && !ownsHorizontal(e.target),
        startPull: pullY,
        startBack: backX,
        history: [{ x: t.clientX, y: t.clientY, t: performance.now() }],
        armed: false,
      };
    };

    const onMove = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;

      g.history.push({ x: t.clientX, y: t.clientY, t: performance.now() });
      if (g.history.length > 6) g.history.shift();

      if (!g.mode) {
        // Страница наверху и палец пошёл вниз — нативный отскок гасим
        // сразу, иначе он успеет дёрнуть страницу до выбора жеста
        if (g.atTop && !refreshing && dy > 0 && dy >= Math.abs(dx) && e.cancelable) e.preventDefault();

        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;

        if (g.atTop && !refreshing && dy > 0 && dy > Math.abs(dx)) g.mode = 'pull';
        else if (g.canBack && dx > 0 && dx > Math.abs(dy) * 1.2) g.mode = 'back';
        else { g = null; return; }

        // Отсчёт ведём от точки выбора: иначе на выборе индикатор
        // прыгнул бы сразу на порог
        g.x0 = t.clientX - (g.mode === 'back' ? 0 : dx);
        g.y0 = t.clientY - (g.mode === 'pull' ? 0 : dy);
      }

      if (e.cancelable) e.preventDefault();

      if (g.mode === 'pull') {
        const raw = g.startPull + (t.clientY - g.y0);
        const y = rubberband(Math.max(0, raw), PULL_MAX);
        drawPull(y);
        const armed = y >= PULL_TRIGGER;
        if (armed && !g.armed) haptic('light');
        g.armed = armed;
      } else {
        const raw = g.startBack + (t.clientX - g.x0);
        const x = Math.max(0, raw);
        drawBack(x);
        const armed = x >= window.innerWidth * BACK_COMMIT;
        if (armed && !g.armed) haptic('light');
        g.armed = armed;
      }
    };

    /** Скорость по последним точкам, px/с */
    const velocity = (axis) => {
      const h = g.history;
      if (h.length < 2) return 0;
      const a = h[0];
      const b = h[h.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) return 0;
      return (b[axis] - a[axis]) / dt;
    };

    const onEnd = () => {
      if (!g || !g.mode) { g = null; return; }
      const mode = g.mode;

      if (mode === 'pull') {
        const v = velocity('y');
        // Вверх на отпускании — передумали, даже если индикатор за порогом
        const go = pullY >= PULL_TRIGGER && v > -200;
        g = null;

        if (!go) {
          anim = spring({ from: pullY, to: 0, velocity: v * 0.4, onFrame: (y) => drawPull(y), onDone: () => { anim = null; } });
          return;
        }

        refreshing = true;
        haptic('medium');
        anim = spring({ from: pullY, to: PULL_REST, velocity: v * 0.4, damping: 0.8, response: 0.3, onFrame: (y) => drawPull(y, true), onDone: () => { anim = null; } });

        const started = performance.now();
        runRefresh().then(() => {
          const wait = Math.max(0, MIN_SPIN_MS - (performance.now() - started));
          setTimeout(() => {
            if (anim) anim.stop();
            anim = spring({
              from: pullY,
              to: 0,
              onFrame: (y) => drawPull(y, y > 8),
              onDone: () => { anim = null; refreshing = false; drawPull(0); },
            });
          }, wait);
        });
        return;
      }

      // Назад
      const v = velocity('x');
      const width = window.innerWidth;
      const go = v > BACK_FLICK || (backX >= width * BACK_COMMIT && v > -200);
      g = null;

      if (!go) {
        anim = spring({ from: backX, to: 0, velocity: v, onFrame: drawBack, onDone: () => { anim = null; clearBack(); } });
        return;
      }

      haptic('light');
      const top = backStack[backStack.length - 1];

      if (reducedMotion()) {
        clearBack();
        if (top) top.run();
        return;
      }

      // Уезжает тем же путём, каким его тянули, со скоростью пальца —
      // и только потом экран сменяется
      anim = spring({
        from: backX,
        to: width,
        velocity: Math.max(v, 800),
        response: 0.28,
        onFrame: drawBack,
        onDone: () => {
          anim = null;
          if (top) top.run();
          // Новый экран рисуется в том же кадре — снимаем сдвиг, когда он
          // уже на месте, иначе старый мелькнёт в центре
          requestAnimationFrame(clearBack);
        },
      });
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      if (anim) anim.stop();
      clearBack();
    };
  }, []);

  return (
    <>
      <div className="pull" ref={pullRef} aria-hidden="true">
        <svg className="pull__ring" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="17" pathLength="100" />
        </svg>
        <span className="pull__icon" ref={pullIconRef}><IconRefresh size={18} /></span>
      </div>
      <div className="backhint" ref={backRef} aria-hidden="true">
        <IconBack size={20} />
      </div>
    </>
  );
}
