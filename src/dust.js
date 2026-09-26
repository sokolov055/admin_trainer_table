import { flushSync } from 'react-dom';

/**
 * Удаление «в пыль» — как после щелчка Таноса: элемент рассыпается
 * волной от левого края к правому, крупными хлопьями, и они уносятся
 * вправо-вверх, растворяясь.
 *
 * Без картинок и холста:
 *   - SVG feTurbulence с низкой частотой даёт крупный шум — хлопья;
 *   - feDisplacementMap сдвигает по нему пиксели элемента, и сдвиг растёт
 *     кадрами — хлопья отрываются всё дальше;
 *   - маска с мягким краем идёт слева направо — рассыпание не разом, а
 *     волной, как у героев в кино;
 *   - сам элемент уплывает вправо-вверх.
 * Каждому удалению — свой фильтр, два подряд не делят одну анимацию.
 * Под конец место схлопывается по высоте: то, что было ниже, плавно
 * подъезжает вверх, а не прыгает, когда элемент уйдёт из данных.
 *
 * Возвращает обещание: удалить из данных — после того, как рассыпался.
 * С reduce motion — короткое угасание без движения.
 */
const DURATION = 900;
/** Место удалённого схлопывается — нижнее плавно подъезжает; начинается,
 *  когда пыль почти развеялась, чтобы движения слились в одно */
const COLLAPSE = 300;
const COLLAPSE_AT = 0.68;
const DUST_SCALE = 150;
/** Ширина мягкого края волны, % ширины элемента */
const EDGE = 35;
let seq = 0;

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return true; }
}

function filterFor(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="${id}" x="-30%" y="-60%" width="170%" height="220%">`
    + '<feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves="1" seed="' + (seq % 9) + '" result="n"/>'
    + '<feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"/>'
    + '</filter>';
  document.body.appendChild(svg);
  return { svg, map: svg.querySelector('feDisplacementMap') };
}

function mask(el, value) {
  el.style.maskImage = value;
  el.style.webkitMaskImage = value;
}

/**
 * Рассыпать элементы, убрать их из данных и вернуть узлам вид — одним
 * шагом до отрисовки. React переиспользует узлы строк (подходы — по
 * номеру): уберёшь данные и вернёшь вид в разные моменты — на кадр
 * мелькнёт соседняя строка. commit — синхронная правка данных.
 */
export function vanish(elements, commit) {
  const list = (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
  return Promise.all(list.map(dust)).then((cleans) => {
    flushSync(commit);
    cleans.forEach((clean) => clean());
  });
}

/** Рассыпать; обещание отдаёт уборку — её зовут после правки данных */
export function dust(el) {
  const noop = () => {};
  if (!el || typeof el.animate !== 'function') return Promise.resolve(noop);
  if (reduced()) {
    return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished
      .catch(() => {}).then(() => () => el.getAnimations().forEach((a) => a.cancel()));
  }
  seq += 1;
  const id = 'dust-' + seq;
  const { svg, map } = filterFor(id);
  el.style.filter = `url(#${id})`;
  el.style.pointerEvents = 'none';

  // Сдвиг пикселей и волна маски — кадрами: у атрибутов SVG-фильтра и у
  // градиента маски нет плавной CSS-анимации
  const start = performance.now();
  let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    // Сначала трещит, потом рвётся: сдвиг растёт с ускорением
    map.setAttribute('scale', String(DUST_SCALE * t * t));
    // Волна: левее края — уже пыль (прозрачно), правее — ещё целое
    const edge = -EDGE + t * (100 + 2 * EDGE);
    mask(el, `linear-gradient(to right, transparent ${edge - EDGE}%, #000 ${edge + EDGE}%)`);
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  // Схлопнуть место: высота и отступы — в ноль. Это не transform, но
  // один элемент и одна короткая анимация, а подъезд нижнего иначе не
  // сделать: узлы строк React переиспользует, и следить за ними нельзя
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const collapse = new Promise((resolve) => {
    setTimeout(() => {
      el.style.overflow = 'hidden';
      el.animate(
        [
          { height: box.height + 'px', marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
          { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' },
        ],
        { duration: COLLAPSE, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
      ).finished.catch(() => {}).then(resolve);
    }, DURATION * COLLAPSE_AT);
  });

  const scatter = el.animate(
    [
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      { opacity: 0.9, transform: 'translate3d(10px, -6px, 0)', offset: 0.45 },
      { opacity: 0, transform: 'translate3d(46px, -34px, 0)' },
    ],
    { duration: DURATION, easing: 'cubic-bezier(0.45, 0, 0.8, 0.4)', fill: 'forwards' },
  ).finished.catch(() => {});

  return Promise.all([scatter, collapse]).then(() => {
    cancelAnimationFrame(raf);
    // Уборка — после того как данные поправлены (см. vanish): если React
    // отдал этот узел соседней строке, она получит обычный вид
    return () => {
      el.style.filter = '';
      el.style.pointerEvents = '';
      el.style.overflow = '';
      mask(el, '');
      el.getAnimations().forEach((a) => a.cancel());
      svg.remove();
    };
  });
}
