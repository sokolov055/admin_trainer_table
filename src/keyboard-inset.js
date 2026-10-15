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
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const root = document.documentElement;
    let open = false;
    let frame = 0;
    const update = () => {
      frame = 0;
      const layout = root.clientHeight || window.innerHeight;
      const bottom = vv.offsetTop + vv.height;
      const now = layout - vv.height > 120;
      root.style.setProperty('--vv-bottom', Math.round(bottom) + 'px');
      root.classList.toggle('kb-open', now);
      // Клавиатура только что открылась: браузер поставил поле вплотную к
      // ней, а над ней теперь панель с кнопкой — ставим поле в середину
      if (now && !open) {
        const el = document.activeElement;
        if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) setTimeout(() => el.scrollIntoView({ block: 'center' }), 60);
      }
      open = now;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
      root.classList.remove('kb-open');
      root.style.removeProperty('--vv-bottom');
    };
  }, []);
}
