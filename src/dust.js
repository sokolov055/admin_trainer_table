/**
 * Удаление «в пыль»: элемент рассыпается на крупинки, они разлетаются и
 * гаснут — как в «Мстителях», только за полсекунды.
 *
 * Без картинок и холста: SVG-фильтр feTurbulence даёт мелкий шум, а
 * feDisplacementMap сдвигает по нему пиксели элемента — чем больше сдвиг,
 * тем мельче «пыль». Сдвиг растёт от 0 до DUST_SCALE, одновременно элемент
 * уплывает вверх-вправо и гаснет. Каждому удалению — свой фильтр, чтобы
 * два удаления подряд не делили одну анимацию.
 *
 * Возвращает обещание: удалить из данных — после того, как рассыпался.
 * С reduce motion — короткое угасание без движения.
 */
const DURATION = 520;
const DUST_SCALE = 70;
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
  svg.innerHTML = `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">`
    + '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="' + (seq % 9) + '" result="n"/>'
    + '<feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"/>'
    + '</filter>';
  document.body.appendChild(svg);
  return { svg, map: svg.querySelector('feDisplacementMap') };
}

export function dust(el) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve();
  if (reduced()) {
    return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).finished.catch(() => {});
  }
  seq += 1;
  const id = 'dust-' + seq;
  const { svg, map } = filterFor(id);
  el.style.filter = `url(#${id})`;
  el.style.pointerEvents = 'none';

  // Сдвиг пикселей — кадрами: у атрибутов SVG-фильтра нет CSS-анимации
  const start = performance.now();
  let raf = 0;
  const step = (now) => {
    const t = Math.min(1, (now - start) / DURATION);
    // Сначала медленно трескается, потом рассыпается быстро
    map.setAttribute('scale', String(DUST_SCALE * t * t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return el.animate(
    [
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      { opacity: 0.85, transform: 'translate3d(4px, -2px, 0)', offset: 0.4 },
      { opacity: 0, transform: 'translate3d(18px, -14px, 0)' },
    ],
    { duration: DURATION, easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)', fill: 'forwards' },
  ).finished.catch(() => {}).then(() => {
    cancelAnimationFrame(raf);
    // Сначала вызывающий убирает элемент из данных (его .then идёт сразу
    // за нашим), а уборка — кадром позже: иначе рассыпавшийся элемент на
    // кадр вернулся бы целым. Если React переиспользовал этот узел под
    // соседнюю строку — уборка вернёт ему вид.
    requestAnimationFrame(() => {
      el.style.filter = '';
      el.style.pointerEvents = '';
      el.getAnimations().forEach((a) => a.cancel());
      svg.remove();
    });
  });
}
