import { useEffect } from 'react';

/**
 * Высота экранной клавиатуры — в CSS-переменную --kb (FT-577).
 *
 * На iPhone клавиатура не уменьшает страницу: она ложится сверху, и
 * прижатая к низу кнопка («Далее» в регистрации и анкете) оказывается под
 * ней и под панелью автозаполнения. visualViewport знает, сколько экрана
 * осталось видно, — нижняя панель поднимается ровно на разницу. На Android
 * страница уменьшается сама, разница там ноль.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const root = document.documentElement;
    let shown = false;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const open = inset > 40;
      root.style.setProperty('--kb', open ? inset + 'px' : '0px');
      // Клавиатура только что открылась: браузер поставил поле вплотную к
      // ней, а над клавиатурой теперь панель с кнопкой — ставим поле в
      // середину видимой части, чтобы панель его не закрыла
      if (open && !shown) {
        const el = document.activeElement;
        if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) {
          requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        }
      }
      shown = open;
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--kb');
    };
  }, []);
}
