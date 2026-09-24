import React, { useEffect, useRef } from 'react';
import { haptic } from './telegram.js';

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
 * Снимок экрана, с которого сейчас уходят.
 *
 * При «назад» за уходящим экраном должен сразу быть виден предыдущий — как
 * в iOS. Но предыдущий экран к этому моменту уже размонтирован: карточка
 * клиента заменяет список, а не ложится поверх. Поэтому в момент перехода
 * вперёд снимаем копию разметки вместе с местом прокрутки, а при жесте
 * показываем её под уходящим экраном. Копия неживая, и ей не нужно быть
 * живой: на неё смотрят треть секунды, пока палец тянет, а после возврата
 * встаёт настоящий экран из того же кэша данных.
 *
 * Снимок забирает первый экран с «назад», который появится сразу после
 * перехода. Если такого нет (переключили вкладку), снимок протухает.
 */
let pendingSnapshot = null;
const SNAPSHOT_FRESH_MS = 1500;

export function captureScreen() {
  if (typeof document === 'undefined') return;
  const app = document.querySelector('#root .app');
  if (!app) return;
  pendingSnapshot = {
    node: app.cloneNode(true),
    scrollY: window.scrollY || document.documentElement.scrollTop || 0,
    at: Date.now(),
  };
}

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

    const fresh = pendingSnapshot && Date.now() - pendingSnapshot.at < SNAPSHOT_FRESH_MS;
    const entry = {
      run: () => ref.current && ref.current(),
      snapshot: fresh ? pendingSnapshot : null,
    };
    if (fresh) pendingSnapshot = null;

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
 * Сцена «назад»: предыдущий экран под уходящим
 * ========================================================================== */

/**
 * Страница-копия, прокрученная туда же, где стояла настоящая.
 *
 * Панель вкладок из копии вынимаем: настоящая остаётся поверх сцены и
 * стоит на месте, как в iOS, пока страницы едут под ней. Плашку «Вы
 * смотрите как клиент» прижимаем к верху — у живой страницы она липкая.
 */
function page(source, scrollY) {
  const clone = source.cloneNode(true);
  // Панель вкладок стоит отдельно (см. выше), а меню, из которого ушли на
  // экран, в момент снимка ещё открыто — в копии его быть не должно
  clone.querySelectorAll('.tabbar, .drawer').forEach((el) => el.remove());
  clone.querySelectorAll('.client-preview').forEach((el) => {
    el.style.position = 'relative';
    el.style.top = scrollY + 'px';
  });

  const wrap = document.createElement('div');
  wrap.className = 'swipeback__page';
  wrap.style.transform = `translate3d(0, ${-scrollY}px, 0)`;
  wrap.appendChild(clone);
  return wrap;
}

function buildScene(entry) {
  const app = document.querySelector('#root .app');
  if (!app) return null;

  const scene = document.createElement('div');
  scene.className = 'swipeback';
  scene.setAttribute('aria-hidden', 'true');

  const prev = document.createElement('div');
  prev.className = 'swipeback__prev';
  if (entry && entry.snapshot) {
    prev.appendChild(page(entry.snapshot.node, entry.snapshot.scrollY));

    // Если у уходящего экрана нет своей панели вкладок (карточка клиента),
    // а у предыдущего была, — её показывает копия: иначе список выехал бы
    // без нижней панели и мигнул ею на возврате.
    if (!app.querySelector('.tabbar')) {
      const bar = entry.snapshot.node.querySelector('.tabbar');
      if (bar) prev.appendChild(bar.cloneNode(true));
    }
  }

  const shade = document.createElement('div');
  shade.className = 'swipeback__shade';
  prev.appendChild(shade);

  const cur = document.createElement('div');
  cur.className = 'swipeback__cur';
  cur.appendChild(page(app, window.scrollY || document.documentElement.scrollTop || 0));

  scene.append(prev, cur);
  document.body.appendChild(scene);

  return { scene, prev, cur, shade };
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
const PARALLAX = 0.3;       // насколько предыдущий экран сдвинут влево в начале
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

/**
 * Что съезжает вниз при «потянуть»: весь экран, кроме закреплённой панели
 * вкладок и меню. Сдвигаем части, а не корень: у корня внутри панель с
 * position: fixed, и под transform родителя она уехала бы вместе с ним.
 */
function pullParts() {
  const app = document.querySelector('#root .app');
  if (!app) return [];
  return [...app.children].filter((el) => !el.matches('.tabbar, .drawer'));
}

/**
 * Блины штанги: [x левого, ширина, высота]. Первым надевают самый большой
 * — он ближе всех к грифу, — последним маленький, как при загрузке веса.
 */
const PLATES = [
  [13, 4, 20],
  [8.5, 3.5, 15],
  [4.5, 3, 10],
];
const BAR_W = 48;

export function Gestures() {
  const pullRef = useRef(null);

  useEffect(() => {
    const pull = pullRef.current;
    const plates = [...pull.querySelectorAll('.pull__plate')];

    let g = null;               // текущий жест
    let anim = null;            // текущая пружина
    let pullY = 0;              // видимый ход индикатора
    let backX = 0;              // сдвиг уходящего экрана
    let scene = null;           // сцена «назад», пока жест идёт
    let refreshing = false;

    /* ---------------- отрисовка ---------------- */

    /**
     * Как в iOS и Telegram, страница съезжает за пальцем, а в открывшемся
     * сверху зазоре — штанга. Пока тянут, на неё с обеих сторон наезжают
     * блины, от большого к маленькому: вес загружен целиком — можно
     * отпускать. Пока идёт обновление, штангу «жмут» — она ходит вверх и
     * вниз, как на повторе.
     */
    const drawPull = (y, spinning = false) => {
      pullY = y;
      const progress = Math.min(y / PULL_TRIGGER, 1);
      const reduce = reducedMotion();

      pullParts().forEach((el) => {
        el.style.transform = y > 0.5 && !reduce ? `translate3d(0, ${y}px, 0)` : '';
      });

      // Штанга — посередине открывшегося зазора
      pull.style.transform = `translate3d(-50%, ${Math.max(y / 2, 0) - 18}px, 0)`;
      pull.style.opacity = y <= 1 ? '0' : String(Math.min(1, progress * 2));
      pull.classList.toggle('pull--spinning', spinning);
      pull.classList.toggle('pull--loaded', progress >= 1);

      const pairs = PLATES.length;
      plates.forEach((plate) => {
        const k = Number(plate.dataset.k);
        const side = Number(plate.dataset.side);
        // Каждая пара блинов доезжает за свою треть хода
        const t = spinning ? 1 : Math.min(Math.max(progress * pairs - k, 0), 1);
        plate.style.opacity = String(t);
        plate.style.transform = `translate3d(${side * (1 - t) * 8}px, 0, 0)`;
      });
    };

    const drawBack = (x) => {
      backX = x;
      if (!scene) return;
      const width = window.innerWidth;
      const p = Math.min(Math.max(x / width, 0), 1);

      if (reducedMotion()) {
        // Без езды: уходящий экран растворяется, под ним проступает прежний
        scene.cur.style.opacity = String(1 - p);
        return;
      }

      scene.cur.style.transform = `translate3d(${x}px, 0, 0)`;
      scene.prev.style.transform = `translate3d(${-width * PARALLAX * (1 - p)}px, 0, 0)`;
      scene.shade.style.opacity = String(0.14 * (1 - p));
    };

    const dropScene = () => {
      if (scene) scene.scene.remove();
      scene = null;
      backX = 0;
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

        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK && !scene) return;

        if (scene) g.mode = 'back';
        else if (g.atTop && !refreshing && dy > 0 && dy > Math.abs(dx)) g.mode = 'pull';
        else if (g.canBack && dx > 0 && dx > Math.abs(dy) * 1.2) g.mode = 'back';
        else { g = null; return; }

        if (g.mode === 'pull') {
          // Индикатор стартует с нуля в точке выбора, а не прыгает на
          // 10 px: резина всё равно сгладила бы ход
          g.y0 = t.clientY;
        } else if (!scene) {
          scene = buildScene(backStack[backStack.length - 1]);
        }
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
        // Экран приклеен к пальцу с самого касания: отсчёт от точки, где
        // палец лёг, а не от точки выбора жеста — иначе экран отставал бы
        // от пальца на эти 10 px, и это читается как торможение
        const x = Math.max(0, g.startBack + dx);
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
        anim = spring({
          from: backX,
          to: 0,
          velocity: v,
          onFrame: drawBack,
          onDone: () => { anim = null; dropScene(); },
        });
        return;
      }

      haptic('light');
      const top = backStack[backStack.length - 1];
      const restoreTo = top && top.snapshot ? top.snapshot.scrollY : null;

      // Экран уходит тем же путём, каким его тянули, со скоростью пальца;
      // прежний доезжает на место. Только потом меняется настоящий экран.
      const finish = () => {
        anim = null;
        if (top) top.run();
        // Новый экран рисуется в следующем кадре. Возвращаем прокрутку туда,
        // где человек был, и только потом убираем сцену — иначе мелькнёт
        // верх списка вместо того места, откуда уходили.
        requestAnimationFrame(() => {
          if (restoreTo !== null) window.scrollTo(0, restoreTo);
          requestAnimationFrame(dropScene);
        });
      };

      if (reducedMotion()) {
        drawBack(width);
        finish();
        return;
      }

      anim = spring({
        from: backX,
        to: width,
        velocity: Math.max(v, 800),
        response: 0.3,
        onFrame: drawBack,
        onDone: finish,
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
      dropScene();
      drawPull(0);
    };
  }, []);

  return (
    <div className="pull" ref={pullRef} aria-hidden="true">
      <svg viewBox={`0 0 ${BAR_W} 28`}>
        <g className="pull__lift">
          <rect className="pull__bar" x="2" y="12.75" width={BAR_W - 4} height="2.5" rx="1.25" />
          <rect className="pull__collar" x="17.5" y="10.5" width="2" height="7" rx="1" />
          <rect className="pull__collar" x={BAR_W - 19.5} y="10.5" width="2" height="7" rx="1" />
          {PLATES.map(([x, w, h], k) => (
            <React.Fragment key={k}>
              <rect className="pull__plate" data-k={k} data-side="-1" x={x} y={14 - h / 2} width={w} height={h} rx="1.2" />
              <rect className="pull__plate" data-k={k} data-side="1" x={BAR_W - x - w} y={14 - h / 2} width={w} height={h} rx="1.2" />
            </React.Fragment>
          ))}
        </g>
      </svg>
    </div>
  );
}
