import { flushSync } from 'react-dom';

/**
 * Удаление «в пыль» — как после щелчка Таноса: элемент стирается волной
 * от левого края к правому, а с края волны срываются крупные хлопья его
 * цветов и уносятся вправо-вверх, растворяясь.
 *
 * Почему так, а не фильтром. Первая версия гнала пиксели самого элемента
 * через SVG feTurbulence + feDisplacementMap. Красиво, но Safari считает
 * такой фильтр на основном потоке, и на большой карточке упражнения iPhone
 * не отдавал ни кадра три четверти секунды: рассыпание дёргалось, а место
 * схлопывалось одним прыжком. Теперь дорогого нет:
 *   - волна — clip-path элемента, анимацию ведёт сам браузер;
 *   - хлопья — один холст поверх страницы, сотни прямоугольников за кадр
 *     для него пустяк. Цвета — фон, рамка, текст и акцент элемента, так
 *     что пыль «из того же материала».
 * Под конец место схлопывается по высоте: то, что было ниже, плавно
 * подъезжает вверх, а не прыгает, когда элемент уйдёт из данных.
 *
 * Возвращает обещание: удалить из данных — после того, как рассыпался.
 * С reduce motion — короткое угасание без движения.
 */
const WAVE = 680;
/** Сколько живёт хлопье, мс */
const LIFE = [520, 900];
/** Хлопьев на 100 px высоты за 100 мс волны */
const DENSITY = 18;
const EASE_WAVE = 'cubic-bezier(0.45, 0.05, 0.55, 0.95)';

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return true; }
}

/**
 * Рассыпать элементы, убрать их из данных и вернуть узлам вид — одним
 * шагом до отрисовки. React переиспользует узлы строк (подходы — по
 * номеру): уберёшь данные и вернёшь вид в разные моменты — на кадр
 * мелькнёт соседняя строка. commit — синхронная правка данных.
 * separators — полоски между карточками, уходящие вместе с ними.
 */
export function vanish(elements, commit, separators = []) {
  const list = (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
  const seps = [...new Set(separators.filter((node) => node && !list.includes(node)))];
  return Promise.all([...list.map(dust), ...seps.map(fold)]).then((cleans) => {
    flushSync(commit);
    cleans.forEach((clean) => clean());
  });
}

/**
 * Схлопнуть место элемента: высота и отступы — в ноль. Это не transform,
 * но один элемент и одна короткая анимация, а подъезд нижнего иначе не
 * сделать: узлы строк React переиспользует, и следить за ними нельзя.
 */
function shrink(el) {
  const box = el.getBoundingClientRect();
  // Длительность — от высоты: карточка упражнения выше строки подхода, и
  // за одно время ей пришлось бы ехать вдвое быстрее. Разгон и торможение
  // мягкие: резкий старт на полэкрана за два кадра глаз читает как прыжок
  const duration = Math.round(Math.min(520, Math.max(280, 240 + box.height * 0.4)));
  const cs = getComputedStyle(el);
  el.style.overflow = 'hidden';
  return el.animate(
    [
      { height: box.height + 'px', marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
      { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' },
    ],
    { duration, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
  ).finished.catch(() => {});
}

/**
 * Разделитель, который уйдёт вместе с элементом: полоска «+ Упражнение /
 * Соединить» между упражнениями. Без него в конце была ступенька — место
 * карточки схлопнулось, а полоска пропадала уже после, рывком.
 * prefer — с какой стороны разделитель принадлежит элементу; у первого
 * или последнего его там нет, тогда берём с другой.
 */
export function separatorOf(el, selector, prefer = 'prev') {
  if (!el) return null;
  const fits = (node) => (node && node.matches(selector) ? node : null);
  const prev = fits(el.previousElementSibling);
  const next = fits(el.nextElementSibling);
  return prefer === 'prev' ? prev || next : next || prev;
}

/** Разделитель не рассыпается — гаснет и схлопывается вместе с элементом */
function fold(el) {
  if (reduced() || typeof el.animate !== 'function') return Promise.resolve(() => {});
  el.style.pointerEvents = 'none';
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
  return new Promise((resolve) => setTimeout(resolve, WAVE))
    .then(() => shrink(el))
    .then(() => () => {
      el.style.pointerEvents = '';
      el.style.overflow = '';
      el.getAnimations().forEach((a) => a.cancel());
    });
}

/** Цвета, из которых сделан элемент: из них и будет пыль */
function palette(el) {
  const out = [];
  const add = (c) => { if (c && !/rgba\([^)]*,\s*0\)|transparent/.test(c)) out.push(c); };
  let bgNode = el;
  let bg = '';
  while (bgNode && bgNode.nodeType === 1) {
    const c = getComputedStyle(bgNode).backgroundColor;
    if (c && !/rgba\([^)]*,\s*0\)|transparent/.test(c)) { bg = c; break; }
    bgNode = bgNode.parentElement;
  }
  const cs = getComputedStyle(el);
  // Фон — основа хлопьев; текст — вдвое реже, но без него на светлой
  // теме белая пыль не видна на светлой странице; рамка — вкрапления
  add(bg); add(bg); add(bg);
  add(cs.color); add(cs.color);
  add(cs.borderTopColor);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (el.matches('.workout__exercise--current, .is-active') && accent) add(accent);
  return out.length ? out : ['rgb(128,128,128)'];
}

/** Рассыпать; обещание отдаёт уборку — её зовут после правки данных */
export function dust(el) {
  const noop = () => {};
  if (!el || typeof el.animate !== 'function') return Promise.resolve(noop);
  if (reduced()) {
    return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished
      .catch(() => {}).then(() => () => el.getAnimations().forEach((a) => a.cancel()));
  }

  const box = el.getBoundingClientRect();
  const colors = palette(el);
  el.style.pointerEvents = 'none';

  // Холст — поверх элемента, с запасом справа и сверху: туда улетают хлопья
  const PAD_X = 120;
  const PAD_Y = 110;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  const cw = box.width + PAD_X + 20;
  const ch = box.height + PAD_Y + 20;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  Object.assign(canvas.style, {
    position: 'fixed', left: (box.left - 20) + 'px', top: (box.top - PAD_Y) + 'px',
    width: cw + 'px', height: ch + 'px', pointerEvents: 'none', zIndex: '60',
  });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.scale(dpr, dpr);
  const ox = 20;
  const oy = PAD_Y;

  // Волна: левее края элемента уже нет
  const wave = el.animate(
    [{ clipPath: 'inset(-2px -2px -2px 0%)' }, { clipPath: 'inset(-2px -2px -2px 100%)' }],
    { duration: WAVE, easing: EASE_WAVE, fill: 'forwards' },
  );

  const parts = [];
  let raf = 0;
  let last = performance.now();
  let lastEdge = 0;
  let done = false;
  const spawn = (fromX, toX, dt) => {
    const n = Math.round((box.height / 100) * DENSITY * (dt / 100));
    for (let i = 0; i < n; i += 1) {
      const big = Math.random() < 0.24;
      parts.push({
        x: ox + fromX + Math.random() * Math.max(2, toX - fromX),
        y: oy + Math.random() * box.height,
        vx: 40 + Math.random() * 150,
        vy: -(25 + Math.random() * 110),
        s: big ? 6 + Math.random() * 5 : 2 + Math.random() * 3,
        c: colors[(Math.random() * colors.length) | 0],
        born: last,
        life: LIFE[0] + Math.random() * (LIFE[1] - LIFE[0]),
      });
    }
  };
  const frame = (now) => {
    const dt = Math.min(48, now - last);
    last = now;
    const timing = wave.effect && wave.effect.getComputedTiming ? wave.effect.getComputedTiming() : null;
    const p = timing && timing.progress != null ? timing.progress : 1;
    const edge = (done ? 1 : p) * box.width;
    if (edge > lastEdge) spawn(lastEdge, edge, dt);
    lastEdge = edge;
    if (ctx) {
      ctx.clearRect(0, 0, cw, ch);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const q = parts[i];
        const age = (now - q.born) / q.life;
        if (age >= 1) { parts.splice(i, 1); continue; }
        const k = dt / 1000;
        q.x += q.vx * k;
        q.y += q.vy * k;
        q.vx *= 0.985;
        q.vy -= 18 * k; // тянет вверх, как пепел
        ctx.globalAlpha = (1 - age) * (1 - age);
        ctx.fillStyle = q.c;
        const size = q.s * (1 - age * 0.5);
        ctx.fillRect(q.x, q.y, size, size);
      }
    }
    if (!done || parts.length) raf = requestAnimationFrame(frame);
    else canvas.remove();
  };
  raf = requestAnimationFrame(frame);

  return wave.finished.catch(() => {}).then(() => {
    done = true;
    el.style.visibility = 'hidden';
    return shrink(el);
  }).then(() => () => {
    // Уборка — после того как данные поправлены (см. vanish): если React
    // отдал этот узел соседней строке, она получит обычный вид. Хлопья
    // доживают своё на холсте и убирают его сами
    el.style.pointerEvents = '';
    el.style.overflow = '';
    el.style.visibility = '';
    el.getAnimations().forEach((a) => a.cancel());
    if (!parts.length) { cancelAnimationFrame(raf); canvas.remove(); }
  });
}
