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
 *
 * Возвращает обещание: удалить из данных — после того, как рассыпался.
 * С reduce motion — короткое угасание без движения.
 */
const DURATION = 1400;
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

export function dust(el) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve();
  if (reduced()) {
    return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished.catch(() => {});
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

  return el.animate(
    [
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      { opacity: 0.9, transform: 'translate3d(10px, -6px, 0)', offset: 0.45 },
      { opacity: 0, transform: 'translate3d(46px, -34px, 0)' },
    ],
    { duration: DURATION, easing: 'cubic-bezier(0.45, 0, 0.8, 0.4)', fill: 'forwards' },
  ).finished.catch(() => {}).then(() => {
    cancelAnimationFrame(raf);
    // Сначала вызывающий убирает элемент из данных (его .then идёт сразу
    // за нашим), а уборка — кадром позже: иначе рассыпавшийся элемент на
    // кадр вернулся бы целым. Если React переиспользовал этот узел под
    // соседнюю строку — уборка вернёт ему вид.
    requestAnimationFrame(() => {
      el.style.filter = '';
      el.style.pointerEvents = '';
      mask(el, '');
      el.getAnimations().forEach((a) => a.cancel());
      svg.remove();
    });
  });
}
