import React, { useRef } from 'react';
import { useSwipe } from './swipe.js';
import { vanish } from './remove.js';
import { IconTrash } from './icons.jsx';

/**
 * Строка, которую можно смахнуть влево: из-под неё выезжает красная
 * корзина (см. swipe.js). disabled — жеста нет (последний подход удалить
 * нельзя, в кругах суперсета подходы удаляются кругом).
 *
 * Удаление — как на iPhone (remove.js): строка уезжает влево, место
 * схлопывается. Если задан removeClosest — уходит ближайший такой предок
 * (заголовок упражнения удаляет всю карточку). Тянуть дальше кнопки до
 * порога и отпустить — то же, что нажать её (полное смахивание).
 *
 * contentClassName — разметка самой строки (сетка, отступы): она должна
 * ехать вместе с содержимым, а не стоять на месте поверх корзины.
 * actionText — подпись на кнопке: «Удалить», «Убрать».
 */
export default function SwipeRow({
  className = '', contentClassName = '', children, onDelete, label, actionText = 'Удалить',
  disabled = false, removeClosest = '', removeWith = null, ...rest
}) {
  const root = useRef(null);
  const firing = useRef(false);
  const fire = (e) => {
    if (e) e.stopPropagation();
    if (firing.current) return;
    firing.current = true;
    const el = (removeClosest && root.current && root.current.closest(removeClosest)) || root.current;
    // removeWith — что уходит вместе с ней (полоска между карточками)
    vanish(el, () => { onDelete(); sw.reset(); }, removeWith ? removeWith(el) : []).then(() => { firing.current = false; });
  };
  // Полное смахивание — то же, что кнопка
  const sw = useSwipe({ disabled, onFull: () => fire() });
  return (
    <div className={'swipe ' + className} ref={root} {...(disabled ? {} : sw.bind)} {...rest}>
      {!disabled && (
        <div className="swipe__action" ref={sw.action} style={{ visibility: 'hidden' }}>
          <button
            type="button"
            className="swipe__trash"
            aria-label={label}
            /* На отпускание пальца, а не на «нажатие»: на iPhone «нажатие» по
               кнопке, которую только что выдвинули смахиванием, приходит не
               всегда. onClick — для клавиатуры; дважды не сработает */
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={fire}
            onClick={fire}
          >
            <span className="swipe__label">
              <IconTrash size={20} />
              <span>{actionText}</span>
            </span>
          </button>
        </div>
      )}
      <div className={'swipe__content' + (contentClassName ? ' ' + contentClassName : '')} ref={sw.content}>{children}</div>
    </div>
  );
}
