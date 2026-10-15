import { useEffect } from 'react';

/**
 * Нижняя панель с кнопкой — над экранной клавиатурой (FT-577).
 *
 * На iPhone клавиатура не уменьшает страницу: она ложится сверху, и
 * прижатая к низу «Далее» оказывается под ней и под панелью автозаполнения.
 * Поднимать «прилипшую» панель на высоту клавиатуры ненадёжно: браузер сам
 * прокручивает страницу к полю, и панель отскакивала обратно вниз.
 *
 * Поэтому, пока клавиатура открыта, на <html> висит класс kb-open, а в
 * --vv-bottom — где кончается видимая часть экрана (visualViewport). CSS
 * закрепляет панель ровно по этому краю (onboarding.css); значение
 * пересчитывается при каждом движении видимой области. На Android страница
 * уменьшается сама — клавиатура там «не открыта», панель на обычном месте.
 *
 * Пока клавиатура выезжает или уезжает, видимая область меняется несколько
 * раз подряд, и панель успевала мелькнуть выше нужного (видео владельца
 * 15.10.2026). Поэтому на время движения — класс kb-moving: панель
 * невидима и проявляется, когда край экрана перестал меняться.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const root = document.documentElement;
    let height = vv.height;
    let settle = 0;
    // Положение — сразу, в том же событии: отложенный пересчёт отставал на кадр
    const place = () => {
      const layout = root.clientHeight || window.innerHeight;
      root.style.setProperty('--vv-bottom', Math.round(vv.offsetTop + vv.height) + 'px');
      root.classList.toggle('kb-open', layout - vv.height > 120);
    };
    const resize = () => {
      if (Math.abs(vv.height - height) > 2) {
        height = vv.height;
        root.classList.add('kb-moving');
        clearTimeout(settle);
        settle = setTimeout(() => root.classList.remove('kb-moving'), 160);
      }
      place();
    };
    place();
    vv.addEventListener('resize', resize);
    vv.addEventListener('scroll', place);
    return () => {
      vv.removeEventListener('resize', resize);
      vv.removeEventListener('scroll', place);
      clearTimeout(settle);
      root.classList.remove('kb-open', 'kb-moving');
      root.style.removeProperty('--vv-bottom');
    };
  }, []);
}
