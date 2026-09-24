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

function snapshotOf(app) {
  return {
    node: app.cloneNode(true),
    scrollY: window.scrollY || document.documentElement.scrollTop || 0,
    at: Date.now(),
  };
}

/**
 * Снимки под именем — для «назад», который бывает не сразу после
 * перехода. Из просмотра глазами клиента возвращаются к списку клиентов с
 * первого раздела — а до этого человек мог походить по разделам, и
 * обычный снимок давно бы протух.
 */
const namedSnapshots = new Map();

export function captureScreen(name) {
  if (typeof document === 'undefined') return;
  const app = document.querySelector('#root .app');
  if (!app) return;
  pendingSnapshot = snapshotOf(app);
  if (name) namedSnapshots.set(name, pendingSnapshot);
}

/**
 * Экран, из которого можно вернуться, регистрирует здесь свой «назад».
 *
 * Работает последний зарегистрированный: вложенный экран (журнал внутри
 * карточки клиента) открывается позже родителя и перекрывает его. Функция
 * берётся из ref на момент жеста — меняться между кадрами ей можно.
 */
export function useBackGesture(handler, enabled = true, snapshotName = null) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;

    const named = snapshotName ? namedSnapshots.get(snapshotName) : null;
    const fresh = !named && pendingSnapshot && Date.now() - pendingSnapshot.at < SNAPSHOT_FRESH_MS;
    const entry = {
      run: () => ref.current && ref.current(),
      snapshot: named || (fresh ? pendingSnapshot : null),
    };
    if (fresh || named) pendingSnapshot = null;

    backStack.push(entry);
    return () => {
      const at = backStack.indexOf(entry);
      if (at !== -1) backStack.splice(at, 1);
    };
  }, [enabled]);
}

/**
 * Разделы нижнего меню, между которыми листают жестом.
 *
 * Регистрирует оболочка (клиента или тренера), пока открыт один из
 * разделов, а не экран поверх них. Снимки разделов копятся по мере
 * хождения: при листании соседний раздел въезжает уже нарисованным — таким,
 * каким его оставили. Где ещё не были, въезжает заготовка с названием, а
 * настоящий раздел встаёт после жеста из кэша данных.
 *
 * За последним разделом — боковое меню: лента одна. Смахивание влево с
 * последнего раздела открывает меню (оно и так выезжает справа), а с
 * экранов меню смахивание вправо возвращает на раздел — это «назад».
 */
let tabHost = null;
const tabSnapshots = new Map();

export function rememberTab(id) {
  if (typeof document === 'undefined' || !id) return;
  const app = document.querySelector('#root .app');
  if (app) tabSnapshots.set(id, snapshotOf(app));
}

export function useTabGesture({ tabs, active, go, openMenu = null, closeMenu = null, enabled = true }) {
  const ref = useRef(null);
  ref.current = { tabs, active, go, openMenu, closeMenu };

  useEffect(() => {
    if (!enabled) return undefined;
    const host = { get: () => ref.current };
    tabHost = host;
    return () => { if (tabHost === host) tabHost = null; };
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
function spring({ from, to, velocity = 0, damping = 1, response = 0.34, onFrame, onDone }) {
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
 * Сцена: соседний экран под пальцем
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

/**
 * Сцена на время жеста: нижняя страница и верхняя, которая по ней едет.
 *
 * Назад: внизу — снимок прежнего экрана, сверху — копия нынешнего; верхняя
 * уезжает вправо, открывая нижнюю. Вперёд — наоборот: внизу нынешний,
 * сверху снимок того, куда возвращаемся; он выезжает справа и ложится
 * поверх. Верхняя страница всегда с тенью по левому краю — она лежит на
 * нижней.
 */
function buildScene(direction, snapshot) {
  const app = document.querySelector('#root .app');
  if (!app) return null;

  const scene = document.createElement('div');
  scene.className = 'swipeback swipeback--live';
  scene.setAttribute('aria-hidden', 'true');

  // Под настоящей страницей — снимок прежнего экрана
  const under = document.createElement('div');
  under.className = 'swipeback__prev';
  if (snapshot) under.appendChild(page(snapshot.node, snapshot.scrollY));

  // Настоящая панель вкладок стоит поверх всего. Если у уходящего экрана
  // своей панели нет, а у прежнего была, — копия панели едет вместе с
  // прежней страницей, иначе она мигнула бы в конце.
  if (!app.querySelector('.tabbar:not(.tabbar--hidden)') && snapshot) {
    const bar = snapshot.node.querySelector('.tabbar:not(.tabbar--hidden)');
    if (bar) under.appendChild(bar.cloneNode(true));
  }

  const shade = document.createElement('div');
  shade.className = 'swipeback__shade';
  under.appendChild(shade);

  // Тень по левому краю уходящей страницы — она лежит на прежней
  const edge = document.createElement('div');
  edge.className = 'swipeback__edge';

  scene.append(under, edge);
  document.body.appendChild(scene);
  goLive();

  return { direction, scene, under, shade, edge };
}

/**
 * Едет настоящая страница, а не её копия.
 *
 * Копию нынешнего экрана Safari на iPhone рисует не сразу, а кусками, и
 * первые кадры жеста сквозь недорисованную копию проступала настоящая
 * страница — верх экрана «не съезжал сразу». Настоящая страница уже
 * нарисована, ей задержке неоткуда взяться. Копия нужна только соседнему
 * экрану, который выезжает из-за края, — там запоздалая дорисовка не видна.
 *
 * Сцена с соседом лежит ПОД страницей (z-index -1), а части страницы на
 * время жеста получают сплошной фон, чтобы сосед не просвечивал сквозь
 * их прозрачные места.
 */
function liveParts() {
  const app = document.querySelector('#root .app');
  if (!app) return [];
  return [...app.children].filter((el) => !el.matches('.tabbar, .drawer'));
}

function goLive() {
  document.documentElement.classList.add('live-moving');
}

function moveLive(x, fade = null) {
  liveParts().forEach((el) => {
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : '';
    el.style.opacity = fade === null ? '' : String(fade);
  });
}

function stopLive() {
  liveParts().forEach((el) => { el.style.transform = ''; el.style.opacity = ''; });
  document.documentElement.classList.remove('live-moving');
}

/**
 * Дождаться, пока настоящий экран дорисуется, — и только потом убирать
 * снимок.
 *
 * Снимок уже показывает экран целиком. Если под ним настоящий экран ещё
 * грузится (стоят заглушки), растворение снимка открывало заглушки на
 * кадр-другой, а потом приходили данные — это и читалось как мигание.
 * Держим снимок, пока заглушки не уйдут, но не дольше полутора секунд:
 * если данные не приходят, честнее показать загрузку, чем старую копию.
 */
const DRAWN_WAIT_MS = 1500;

function whenDrawn(done) {
  const started = performance.now();
  const check = () => {
    const loading = document.querySelector('#root .app .skeleton');
    if (!loading || performance.now() - started > DRAWN_WAIT_MS) done();
    else requestAnimationFrame(check);
  };
  check();
}

/**
 * Возвращённый экран встаёт без анимации появления.
 *
 * Разделы экрана при монтировании собираются лесенкой из прозрачности. После
 * жеста это выглядело как мигание: снимок уже показал экран целиком, сцена
 * исчезла, а настоящий экран на долю секунды стал пустым и проявился снова.
 */
const LANDING_MS = 600;
let landingTimer = 0;

/**
 * Два кадра отрисовки: первый — браузер раскладывает и рисует настоящий
 * экран под сценой, второй — он уже на экране. Сцену снимаем после, иначе
 * под ней может оказаться ещё не дорисованная страница.
 */
function afterPaint(done) {
  requestAnimationFrame(() => requestAnimationFrame(done));
}

/** Блоки, которые уже на экране, больше не проявляются — ни сейчас, ни потом */
function settleEntered() {
  document.querySelectorAll('#root .enter').forEach((el) => { el.style.animation = 'none'; });
}

function landQuietly() {
  document.documentElement.classList.add('gesture-landing');
  clearTimeout(landingTimer);
  landingTimer = setTimeout(() => {
    // Снять класс просто так нельзя: браузер увидит, что у элемента снова
    // есть анимация, и проиграет её с нуля — на уже видимом экране. Так
    // «мигали» отдельные блоки через полсекунды после возврата. Поэтому
    // тем, кто уже на экране, анимацию выключаем насовсем, и только
    // потом снимаем класс. Появившиеся позже анимируются как обычно.
    settleEntered();
    document.documentElement.classList.remove('gesture-landing');
  }, LANDING_MS);
}

/**
 * Лента разделов: нынешний и соседний лежат рядом и едут вместе, как
 * страницы, — без теней и притемнения, это не «глубже», а «рядом».
 */
function buildPager(target, side, at) {
  const app = document.querySelector('#root .app');
  if (!app) return null;

  const scene = document.createElement('div');
  scene.className = 'swipeback swipeback--pager swipeback--live';
  scene.setAttribute('aria-hidden', 'true');

  // Снимок нынешнего раздела — только в память, на экран он не идёт
  const now = snapshotOf(app);

  let next = null;
  if (target) {
    next = document.createElement('div');
    next.className = 'swipeback__cur';
    const snap = tabSnapshots.get(target.id);
    if (snap) {
      next.appendChild(page(snap.node, snap.scrollY));
    } else {
      // Раздела ещё не видели — заготовка с его названием на месте шапки
      const blank = document.createElement('div');
      blank.className = 'swipeback__blank';
      const title = document.createElement('div');
      title.className = 'swipeback__blank-title';
      title.textContent = target.label;
      blank.appendChild(title);
      for (let i = 0; i < 3; i += 1) {
        const bar = document.createElement('div');
        bar.className = 'swipeback__blank-card';
        blank.appendChild(bar);
      }
      next.appendChild(blank);
    }
    scene.appendChild(next);
  }

  document.body.appendChild(scene);
  goLive();

  return { direction: 'tabs', scene, next, side, at, target, now, snapshot: target ? tabSnapshots.get(target.id) : null };
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
const DRAWER_COMMIT = 0.3;  // доля ширины меню, вытянутая пальцем, чтобы оно осталось открытым
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

/**
 * Боковое меню под пальцем.
 *
 * Меню открывается по-настоящему в момент жеста, но его панель держит
 * палец: пока класс `drawer-held` на корне, положение панели и затемнение
 * задают переменные, а собственные переходы выключены. На отпускании класс
 * снимаем — и меню само доезжает (или уезжает) своим переходом от того
 * места, где его оставил палец, без рывка.
 */
let drawerPulled = 0;

function drawerWidth() {
  const panel = document.querySelector('.drawer__panel');
  return (panel && panel.offsetWidth) || Math.min(320, window.innerWidth * 0.84);
}

function holdDrawer() {
  drawerPulled = 0;
  const root = document.documentElement;
  root.style.setProperty('--drawer-pull', '100%');
  root.style.setProperty('--drawer-fade', '0');
  root.classList.add('drawer-held');
}

function drawDrawer(pulled, width) {
  drawerPulled = pulled;
  const root = document.documentElement;
  root.style.setProperty('--drawer-pull', (width - pulled) + 'px');
  root.style.setProperty('--drawer-fade', String(pulled / width));
}

function releaseDrawer() {
  const root = document.documentElement;
  root.classList.remove('drawer-held');
  root.style.removeProperty('--drawer-pull');
  root.style.removeProperty('--drawer-fade');
  drawerPulled = 0;
}

export function Gestures() {
  const pullRef = useRef(null);

  useEffect(() => {
    const pull = pullRef.current;
    const plates = [...pull.querySelectorAll('.pull__plate')];

    let g = null;               // текущий жест
    let anim = null;            // текущая пружина
    let pullY = 0;              // видимый ход индикатора
    let slideX = 0;             // ход сцены «назад/вперёд»
    let pagerX = 0;             // сдвиг ленты разделов, со знаком
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

    /**
     * Ход сцены: x — сколько пальцем пройдено в сторону жеста.
     * Назад: верхняя страница уезжает вправо, нижняя выезжает из-под неё.
     * Вперёд: верхняя приезжает справа, нижняя уходит под неё влево.
     */
    const drawSlide = (x) => {
      slideX = x;
      if (!scene) return;
      const width = window.innerWidth;
      const p = Math.min(Math.max(x / width, 0), 1);

      if (reducedMotion()) {
        // Без езды: страница растворяется, под ней проступает прежняя
        moveLive(0, 1 - p);
        return;
      }

      moveLive(x);
      scene.under.style.transform = `translate3d(${-width * PARALLAX * (1 - p)}px, 0, 0)`;
      scene.shade.style.opacity = String(0.14 * (1 - p));
      scene.edge.style.transform = `translate3d(${x - 24}px, 0, 0)`;
      scene.edge.style.opacity = String(1 - p);
    };

    /** Лента разделов: нынешний сдвинут на offset, соседний — рядом с ним */
    const drawPager = (offset) => {
      pagerX = offset;
      if (!scene) return;
      const width = window.innerWidth;

      if (reducedMotion()) {
        const p = Math.min(Math.abs(offset) / width, 1);
        moveLive(0, 1 - p);
        return;
      }

      moveLive(offset);
      if (scene.next) scene.next.style.transform = `translate3d(${offset + scene.side * width}px, 0, 0)`;

      // Таблетка нижнего меню едет вслед за пальцем — видно, в какой
      // раздел листаешь, ещё до того, как отпустил
      const bar = document.querySelector('.tabbar');
      const pill = bar && bar.querySelector('.tabbar__pill');
      if (pill) {
        bar.classList.add('tabbar--dragging');
        pill.style.setProperty('--tab-pos', String(scene.at - offset / width));
      }
    };

    /** Отдать таблетку обратно меню: дальше её положение ведёт React */
    const releasePill = () => {
      const bar = document.querySelector('.tabbar');
      if (!bar) return;
      bar.classList.remove('tabbar--dragging');
      const pill = bar.querySelector('.tabbar__pill');
      if (pill) pill.style.removeProperty('--tab-pos');
    };

    /**
     * Убрать сцену — мгновенно. Раньше после жеста она растворялась, но на
     * iPhone растворение большого слоя заставляет Safari перерисовать его,
     * и на кадр куски страницы становились белыми — «моргание». Растворять
     * и незачем: к этому моменту снимок и настоящий экран уже совпадают.
     */
    const dropScene = () => {
      const gone = scene;
      scene = null;
      slideX = 0;
      pagerX = 0;
      stopLive();
      if (gone && gone.direction === 'tabs') releasePill();
      if (gone) gone.scene.remove();
    };

    /**
     * Жест состоялся: сцена со снимком того, куда пришли, встаёт поверх
     * страницы. Под ней настоящая страница меняется, возвращается на место
     * и дорисовывается, и только потом сцена уходит.
     */
    const coverWith = (done) => {
      if (done) done.scene.classList.add('swipeback--cover');
    };

    /* ---------------- касания ---------------- */

    const onStart = (e) => {
      if (e.touches.length !== 1 || blocked()) { g = null; return; }

      // Перехват на лету: берём текущее положение, а не цель пружины
      if (anim) { anim.stop(); anim = null; }

      const t = e.touches[0];
      const free = !ownsHorizontal(e.target);
      g = {
        x0: t.clientX,
        y0: t.clientY,
        mode: null,
        atTop: (window.scrollY || document.documentElement.scrollTop) <= 0,
        canBack: backStack.length > 0 && free,
        canTabs: !!tabHost && free,
        startPull: pullY,
        startSlide: slideX,
        startPager: pagerX,
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

        const sideways = Math.abs(dx) > Math.abs(dy) * 1.2;

        if (scene) {
          // Перехватили сцену на лету — продолжаем её же
          g.mode = scene.direction === 'tabs' ? 'pager' : 'slide';
        } else if (g.atTop && !refreshing && dy > 0 && dy > Math.abs(dx)) {
          g.mode = 'pull';
          // Индикатор стартует с нуля в точке выбора, а не прыгает на
          // 10 px: резина всё равно сгладила бы ход
          g.y0 = t.clientY;
        } else if (g.canBack && dx > 0 && sideways) {
          const top = backStack[backStack.length - 1];
          scene = buildScene('back', top && top.snapshot);
          g.mode = scene ? 'slide' : null;
        } else if (g.canTabs && sideways) {
          // Листание разделов: влево — следующий, вправо — предыдущий
          const host = tabHost.get();
          const at = host.tabs.findIndex((tab) => tab.id === host.active);
          const side = dx < 0 ? 1 : -1;
          const target = at === -1 ? null : host.tabs[at + side] || null;

          if (at !== -1 && !target && side > 0 && host.openMenu) {
            // За последним разделом — боковое меню. Страница стоит на
            // месте, а меню открывается сразу и выезжает из-за правого
            // края за пальцем.
            holdDrawer();
            host.openMenu();
            g.menuHost = host;
            g.mode = 'menu';
          } else {
            scene = at === -1 ? null : buildPager(target, side, at);
            g.mode = scene ? 'pager' : null;
          }
        }

        if (!g.mode) { g = null; return; }
      }

      if (e.cancelable) e.preventDefault();

      if (g.mode === 'pull') {
        const raw = g.startPull + (t.clientY - g.y0);
        const y = rubberband(Math.max(0, raw), PULL_MAX);
        drawPull(y);
        const armed = y >= PULL_TRIGGER;
        if (armed && !g.armed) haptic('light');
        g.armed = armed;
      } else if (g.mode === 'menu') {
        const width = drawerWidth();
        const pulled = Math.min(Math.max(-dx, 0), width);
        drawDrawer(pulled, width);
        const armed = pulled >= width * DRAWER_COMMIT;
        if (armed && !g.armed) haptic('light');
        g.armed = armed;
      } else if (g.mode === 'pager') {
        const width = window.innerWidth;
        // Только в сторону выбранного соседа; назад через ноль не пускаем
        let raw = g.startPager + dx;
        raw = scene.side > 0 ? Math.min(raw, 0) : Math.max(raw, 0);
        // Соседа нет (крайний раздел) — резина, а не пустота
        const offset = scene.target ? Math.max(-width, Math.min(width, raw)) : rubberband(raw, width * 0.5);
        drawPager(offset);
        const armed = !!scene.target && Math.abs(offset) >= width * BACK_COMMIT;
        if (armed && !g.armed) haptic('light');
        g.armed = armed;
      } else {
        // Экран приклеен к пальцу с самого касания: отсчёт от точки, где
        // палец лёг, а не от точки выбора жеста — иначе экран отставал бы
        // от пальца на эти 10 px, и это читается как торможение
        const along = scene.direction === 'back' ? dx : -dx;
        const x = Math.max(0, g.startSlide + along);
        drawSlide(x);
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

      if (mode === 'menu') {
        const width = drawerWidth();
        const v = -velocity('x');
        const pulled = drawerPulled;
        const host = g.menuHost;
        g = null;
        const keep = v > BACK_FLICK || (pulled >= width * DRAWER_COMMIT && v > -200);
        if (keep) haptic('light');
        else if (host && host.closeMenu) host.closeMenu();
        // Дальше меню ведёт свой переход — от того места, где его отпустили
        releaseDrawer();
        return;
      }

      if (mode === 'pager') {
        const width = window.innerWidth;
        const side = scene ? scene.side : 1;
        const v = velocity('x') * -side;
        const go = scene && scene.target
          && (v > BACK_FLICK || (Math.abs(pagerX) >= width * BACK_COMMIT && v > -200));
        g = null;

        if (!go) {
          anim = spring({ from: pagerX, to: 0, velocity: -v * side, onFrame: drawPager, onDone: () => { anim = null; dropScene(); } });
          return;
        }

        haptic('light');
        const host = tabHost ? tabHost.get() : null;
        const done = scene;

        const finish = () => {
          anim = null;
          coverWith(done);
          landQuietly();
          // Уходящий раздел запоминаем таким, каким его оставили
          if (host) tabSnapshots.set(host.active, done.now);
          if (host) host.go(done.target.id);
          requestAnimationFrame(() => {
            window.scrollTo(0, done.snapshot ? done.snapshot.scrollY : 0);
            stopLive();
            requestAnimationFrame(() => whenDrawn(() => { settleEntered(); afterPaint(() => dropScene()); }));
          });
        };

        if (reducedMotion()) {
          drawPager(-side * width);
          finish();
          return;
        }

        anim = spring({
          from: pagerX,
          to: -side * width,
          velocity: -Math.max(v, 0) * side,
          response: 0.34,
          onFrame: drawPager,
          onDone: finish,
        });
        return;
      }

      // Назад или вперёд
      const back = scene && scene.direction === 'back';
      const v = velocity('x') * (back ? 1 : -1);
      const width = window.innerWidth;
      const go = v > BACK_FLICK || (slideX >= width * BACK_COMMIT && v > -200);
      g = null;

      if (!go || !scene) {
        anim = spring({
          from: slideX,
          to: 0,
          velocity: v,
          onFrame: drawSlide,
          onDone: () => { anim = null; dropScene(); },
        });
        return;
      }

      haptic('light');

      const top = backStack[backStack.length - 1];
      const restoreTo = top && top.snapshot ? top.snapshot.scrollY : null;
      const change = () => { if (top) top.run(); };

      // Экран доезжает тем же путём, каким его тянули, со скоростью пальца;
      // только потом меняется настоящий экран
      const done = scene;
      const finish = () => {
        anim = null;
        coverWith(done);
        landQuietly();
        change();
        // Новый экран рисуется в следующем кадре. Возвращаем прокрутку туда,
        // где человек был, ставим страницу на место — всё под сценой — и
        // только потом убираем сцену.
        requestAnimationFrame(() => {
          if (restoreTo !== null) window.scrollTo(0, restoreTo);
          stopLive();
          requestAnimationFrame(() => whenDrawn(() => { settleEntered(); afterPaint(() => dropScene()); }));
        });
      };

      if (reducedMotion()) {
        drawSlide(width);
        finish();
        return;
      }

      anim = spring({
        from: slideX,
        to: width,
        velocity: Math.max(v, 0),
        response: 0.34,
        onFrame: drawSlide,
        onDone: finish,
      });
    };

    /**
     * Элемент под пальцем может исчезнуть посреди жеста: React заменил
     * экран (сменилась вкладка, пришли данные). События касания продолжают
     * приходить ему, но от оторванного элемента до документа они уже не
     * всплывают — и жест глох на полпути. Поэтому слушаем ещё и сам
     * элемент, а берём оттуда только то, что до документа не дойдёт.
     */
    let held = null;
    const detached = (fn) => (e) => { if (!e.currentTarget.isConnected) fn(e); };
    const heldMove = detached(onMove);
    const heldEnd = detached((e) => { onEnd(e); letGo(); });

    const letGo = () => {
      if (!held) return;
      held.removeEventListener('touchmove', heldMove);
      held.removeEventListener('touchend', heldEnd);
      held.removeEventListener('touchcancel', heldEnd);
      held = null;
    };

    const start = (e) => {
      letGo();
      held = e.target;
      if (held && held.addEventListener) {
        held.addEventListener('touchmove', heldMove, { passive: false });
        held.addEventListener('touchend', heldEnd, { passive: true });
        held.addEventListener('touchcancel', heldEnd, { passive: true });
      }
      onStart(e);
    };
    const end = (e) => { onEnd(e); letGo(); };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });

    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
      letGo();
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
