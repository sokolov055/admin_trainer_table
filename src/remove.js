import { flushSync } from 'react-dom';

/**
 * Удаление строки — как в списках iPhone.
 *
 * Смахнули и удалили: содержимое уезжает влево до конца, красная полоса
 * под ним заполняет строку целиком, потом строка схлопывается по высоте, и
 * всё, что ниже, плавно подъезжает на её место. Удалили без смахивания
 * (выбор, корзина в редакторе): строка уходит влево и гаснет, дальше так
 * же. Движение продолжает то, что начал палец, — влево, туда же, куда
 * смахивали (пространственная согласованность, apple-design §7).
 *
 * Уход — только transform и opacity. Схлопывание — высота одного
 * элемента: подъезд нижних иначе не сделать, React переиспользует их узлы.
 * Разгон и торможение у схлопывания мягкие, длительность — от высоты:
 * резкий старт карточки на полэкрана глаз читает как прыжок.
 *
 * С reduce motion — без движения: короткое угасание.
 */
const EXIT_MS = 240;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.25, 1)';

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return true; }
}

/**
 * Убрать элементы с анимацией, поправить данные и вернуть узлам вид —
 * одним шагом до отрисовки (flushSync): иначе на кадр мелькнула бы
 * соседняя строка, получившая этот же узел. commit — синхронная правка.
 * separators — полоски между карточками, уходящие вместе с ними.
 */
export function vanish(elements, commit, separators = []) {
  const list = (Array.isArray(elements) ? elements : [elements]).filter(Boolean);
  const seps = [...new Set(separators.filter((node) => node && !list.includes(node)))];
  return Promise.all([...list.map(leave), ...seps.map(fold)]).then((cleans) => {
    flushSync(commit);
    cleans.forEach((clean) => clean());
  });
}

/**
 * Разделитель, который уйдёт вместе с элементом: полоска «+ Упражнение /
 * Соединить» между упражнениями. prefer — с какой стороны он принадлежит
 * элементу; у первого или последнего там его нет, тогда берём с другой.
 */
export function separatorOf(el, selector, prefer = 'prev') {
  if (!el) return null;
  const fits = (node) => (node && node.matches(selector) ? node : null);
  const prev = fits(el.previousElementSibling);
  const next = fits(el.nextElementSibling);
  return prefer === 'prev' ? prev || next : next || prev;
}

function shrink(el) {
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const duration = Math.round(Math.min(460, Math.max(240, 200 + box.height * 0.4)));
  el.style.overflow = 'hidden';
  return el.animate(
    [
      { height: box.height + 'px', marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
      { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' },
    ],
    { duration, easing: EASE_IN_OUT, fill: 'forwards' },
  ).finished.catch(() => {});
}

function restore(el) {
  el.style.pointerEvents = '';
  el.style.overflow = '';
  el.getAnimations().forEach((a) => a.cancel());
}

/** Схлопнуть, начав чуть раньше, чем закончится уход: одно движение, а не два */
function thenShrink(el, exit) {
  return new Promise((resolve) => setTimeout(resolve, exit * 0.7)).then(() => shrink(el));
}

function fold(el) {
  if (reduced() || typeof el.animate !== 'function') return Promise.resolve(() => {});
  el.style.pointerEvents = 'none';
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: EXIT_MS * 0.6, fill: 'forwards' });
  return thenShrink(el, EXIT_MS).then(() => () => restore(el));
}

/** Уход одного элемента; обещание отдаёт уборку — её зовут после правки данных */
function leave(el) {
  if (!el || typeof el.animate !== 'function') return Promise.resolve(() => {});
  if (reduced()) {
    return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished
      .catch(() => {}).then(() => () => el.getAnimations().forEach((a) => a.cancel()));
  }
  el.style.pointerEvents = 'none';
  const width = el.getBoundingClientRect().width;

  // Строку смахнули: её содержимое уже сдвинуто пальцем — продолжаем
  // оттуда, а красная полоса растёт следом и заполняет строку
  const content = el.matches('.swipe, .block-order__row') ? el.querySelector(':scope > .swipe__content, :scope > .block-order__content') : null;
  const action = el.querySelector(':scope > .swipe__action, :scope > .block-order__swipe');
  if (content && action && action.style.visibility !== 'hidden' && Number(action.style.opacity || 0) > 0) {
    const from = new DOMMatrixReadOnly(getComputedStyle(content).transform).m41;
    const fromW = action.getBoundingClientRect().width;
    content.style.transition = 'none';
    content.animate(
      [{ transform: `translate3d(${from}px, 0, 0)` }, { transform: `translate3d(${-width}px, 0, 0)` }],
      { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' },
    );
    action.style.transition = 'none';
    action.animate([{ width: fromW + 'px', opacity: 1 }, { width: width + 'px', opacity: 1 }], { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' });
    return thenShrink(el, EXIT_MS).then(() => () => {
      restore(el);
      content.getAnimations().forEach((a) => a.cancel());
      action.getAnimations().forEach((a) => a.cancel());
    });
  }

  // Без смахивания (или смахнули заголовок, а уходит вся карточка):
  // элемент уезжает влево и гаснет
  el.animate(
    [{ transform: 'translate3d(0, 0, 0)', opacity: 1 }, { transform: 'translate3d(-40%, 0, 0)', opacity: 0 }],
    { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' },
  );
  return thenShrink(el, EXIT_MS).then(() => () => restore(el));
}
