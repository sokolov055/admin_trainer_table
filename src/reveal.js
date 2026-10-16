import { useEffect, useRef } from 'react';

/**
 * Экран — к тому, что появилось после действия (FT-595, владелец 16.10.2026:
 * «если я что-то делаю, то экран сдвигается к этой рабочей зоне»).
 *
 * Раскрыли список, выбрали из него, открыли форму, пришёл ответ или
 * ошибка — блок поменял высоту, и нужное оказывалось за краем экрана:
 * вопрос «Да, перенести» уезжал вверх, кнопки формы — под нижнее меню.
 *
 * Прокручиваем ровно настолько, чтобы блок встал в видимую часть, как
 * scrollIntoView({ block: 'nearest' }), но с учётом того, что закрывает
 * экран: липкая шапка занятия и полоса просмотра сверху, строка состояния
 * iPhone, нижнее меню и плавающие панели снизу. Блок и так виден — экран
 * не трогаем. Блок выше экрана — встаёт началом под шапку. Без анимации,
 * если в системе «уменьшить движение».
 */

// Сверху: липкие полосы. Их высота в счёт, даже пока они ещё не прилипли:
// прокрутим вниз — прилипнут и закроют начало блока
const TOP_BARS = '.client-preview, .workout__header, [data-reveal-top]';
// Снизу: панели, приклеенные над нижним меню (само меню — в --float-bottom)
const BOTTOM_BARS = '.plan__block-actions, .plan-edit__footer, .plan-edit__float, .workout__pick-bar, '
  + '.workout__undo, .workout__rest--float, .rest-pill, .undo-bar, [data-reveal-bottom]';
// Воздух между блоком и краем видимой части
const GAP = 12;

function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

function touch() {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch (_) { return false; }
}

/** Поле ввода в фокусе — на телефоне это открытая или открывающаяся клавиатура */
function typing() {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !/^(button|checkbox|radio|range|submit|reset|file|color|image|hidden)$/i.test(el.type || '');
}

/**
 * Где прокручивать: ближайшая прокручиваемая обёртка (шторка, полноэкранный
 * слой) или окно (null). Блок в закреплённом слое без своей прокрутки —
 * false: окно двигать бессмысленно, сдвинулась бы страница под слоем
 */
function scrollBox(el) {
  for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    if (cs.position === 'fixed') return false;
  }
  return null;
}

/** Строка состояния iPhone и зона нижнего меню — из тех же переменных, что у CSS */
function insets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;box-sizing:content-box;'
    + 'padding-top:env(safe-area-inset-top,0px);height:var(--float-bottom,0px)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const top = parseFloat(cs.paddingTop) || 0;
  const bottom = parseFloat(cs.height) || 0;
  probe.remove();
  return { top, bottom };
}

function visible(bar) {
  const cs = getComputedStyle(bar);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  const r = bar.getBoundingClientRect();
  return r.height ? { r, cs } : null;
}

/**
 * Видимая часть экрана, где блоку можно стоять: [top, bottom] в координатах
 * getBoundingClientRect
 */
function frame(el, box) {
  if (box) {
    const b = box.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom };
  }
  const vv = window.visualViewport;
  const vTop = vv ? vv.offsetTop : 0;
  const vBottom = vTop + (vv ? vv.height : window.innerHeight);
  // Клавиатура открыта — нижнее меню под ней, край один: край клавиатуры
  const keyboard = vv && (document.documentElement.clientHeight || window.innerHeight) - vv.height > 120;
  const pad = insets();
  let top = vTop + pad.top;
  let bottom = keyboard ? vBottom : Math.min(vBottom, window.innerHeight - pad.bottom);
  document.querySelectorAll(TOP_BARS).forEach((bar) => {
    if (bar.contains(el) || el.contains(bar)) return;
    const v = visible(bar);
    if (!v || (v.cs.position !== 'sticky' && v.cs.position !== 'fixed')) return;
    top = Math.max(top, vTop + (parseFloat(v.cs.top) || 0) + v.r.height);
  });
  if (!keyboard) {
    const eTop = el.getBoundingClientRect().top;
    document.querySelectorAll(BOTTOM_BARS).forEach((bar) => {
      if (bar.contains(el) || el.contains(bar)) return;
      const v = visible(bar);
      if (!v) return;
      // Липкая панель ниже блока прилипнет к низу, когда к нему прокрутим;
      // выше блока — останется позади и ничего не закроет
      const stuck = v.cs.position === 'fixed' || v.r.top >= eTop;
      if (stuck) bottom = Math.min(bottom, window.innerHeight - pad.bottom - v.r.height);
    });
  }
  return { top, bottom };
}

/**
 * На сколько пикселей сдвинуть, чтобы rect встал в [top, bottom].
 * Не влезает целиком — показываем начало. Чистая функция: её и проверяет тест
 */
export function revealShift(rect, top, bottom, gap = GAP) {
  if (rect.top < top + gap) return rect.top - top - gap;
  if (rect.bottom > bottom - gap) return Math.max(0, Math.min(rect.bottom - bottom + gap, rect.top - top - gap));
  return 0;
}

/** Прокрутить к элементу, если он не целиком на виду. Возвращает сдвиг */
export function reveal(el, { smooth = true } = {}) {
  if (typeof window === 'undefined' || !el || !el.isConnected || !el.getBoundingClientRect) return 0;
  const rect = el.getBoundingClientRect();
  if (!rect.height && !rect.width) return 0;
  const box = scrollBox(el);
  if (box === false) return 0;
  const { top, bottom } = frame(el, box);
  // Дальше начала и конца страницы не уедешь — и не пытаемся
  const scroller = box || document.scrollingElement || document.documentElement;
  const at = box ? box.scrollTop : (window.scrollY || 0);
  const room = Math.max(0, scroller.scrollHeight - (box ? box.clientHeight : window.innerHeight) - at);
  const shift = Math.max(-at, Math.min(room, Math.round(revealShift(rect, top, bottom))));
  if (Math.abs(shift) < 2) return 0;
  const behavior = smooth && !reduced() ? 'smooth' : 'auto';
  try {
    if (box) box.scrollBy({ top: shift, behavior });
    else window.scrollBy({ top: shift, behavior });
  } catch (_) {
    // Старый браузер без параметров прокрутки
    if (box) box.scrollTop += shift; else window.scrollBy(0, shift);
  }
  return shift;
}

/**
 * Отложенная прокрутка: после отрисовки (два кадра — успевают подгрузиться
 * высоты и начаться анимации появления). На телефоне с полем в фокусе
 * сначала выезжает клавиатура и система сама подводит к полю — ждём, пока
 * видимая часть перестанет меняться, и только потом довинчиваем до кнопок
 * формы; keyboard: false — при клавиатуре не трогать вовсе (общее правило:
 * экраны входа с полем кода держат прокрутку сами). Человек сам взялся
 * листать — не мешаем. Возвращает отмену
 */
export function revealSoon(get, options = {}) {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') return () => {};
  let done = false;
  let frameId = 0;
  let timer = 0;
  const vv = window.visualViewport;
  const stop = () => {
    done = true;
    cancelAnimationFrame(frameId);
    clearTimeout(timer);
    window.removeEventListener('touchstart', stop, true);
    window.removeEventListener('wheel', stop, true);
    if (vv) vv.removeEventListener('resize', wait);
  };
  const run = () => { if (!done) { const el = get(); stop(); reveal(el, options); } };
  // Клавиатура выезжает — каждый сдвиг видимой части откладывает прокрутку
  function wait() { clearTimeout(timer); timer = setTimeout(run, 180); }
  window.addEventListener('touchstart', stop, { capture: true, passive: true });
  window.addEventListener('wheel', stop, { capture: true, passive: true });
  frameId = requestAnimationFrame(() => {
    frameId = requestAnimationFrame(() => {
      if (done) return;
      if (touch() && typing()) {
        if (options.keyboard === false) { stop(); return; }
        if (vv) vv.addEventListener('resize', wait);
        timer = setTimeout(run, 450);
      } else run();
    });
  });
  return stop;
}

/**
 * Хук: ref на блок, который надо держать на экране. Каждый раз, когда key
 * становится новым непустым значением (раскрыли, загрузилось, следующий
 * шаг, ошибка), блок подводится на экран. Пустой key — ничего не делать
 */
export function useReveal(key, options) {
  const ref = useRef(null);
  useEffect(() => {
    if (!key) return undefined;
    return revealSoon(() => ref.current, options);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

// Сколько после касания или клавиши новое сообщение считается ответом на
// действие: запрос по мобильной сети идёт и пару секунд
const ACTION_MS = 6000;
const SHOWN = '[role="alert"], [data-reveal]';
let installed = false;

/** Новое сообщение-ответ — само или внутри добавленного блока */
export function revealTargetIn(node) {
  if (!node || node.nodeType !== 1) return null;
  const hit = node.matches(SHOWN) ? node : node.querySelector(SHOWN);
  if (!hit || hit.closest('[data-reveal="off"]')) return null;
  return hit;
}

/**
 * Правило для всего приложения: появилось сообщение об ошибке
 * (role="alert") или итог действия (Note, data-reveal) в течение нескольких
 * секунд после касания — подводим его на экран. Нажали «Сохранить» внизу
 * длинной формы, а ошибка встала над ней — человек её не видел. То, что
 * приходит без действия (фоновая загрузка), экран не трогает. Отключить у
 * блока — data-reveal="off"
 */
export function installActionReveal() {
  if (installed || typeof window === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) return;
  installed = true;
  let until = 0;
  let observer = null;
  let timer = 0;
  const off = () => { if (observer) { observer.disconnect(); observer = null; } };
  const added = (records) => {
    if (Date.now() > until) { off(); return; }
    for (const record of records) {
      for (const node of record.addedNodes) {
        const hit = revealTargetIn(node);
        if (hit) { revealSoon(() => hit, { keyboard: false }); return; }
      }
    }
  };
  const mark = () => {
    until = Date.now() + ACTION_MS;
    if (!observer) {
      observer = new MutationObserver(added);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    clearTimeout(timer);
    timer = setTimeout(off, ACTION_MS);
  };
  window.addEventListener('pointerdown', mark, { capture: true, passive: true });
  window.addEventListener('keydown', mark, true);
}
