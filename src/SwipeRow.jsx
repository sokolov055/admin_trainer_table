import React, { useRef } from 'react';
import { useSwipe } from './swipe.js';
import { vanish } from './dust.js';
import { IconTrash } from './icons.jsx';

/**
 * Строка, которую можно смахнуть влево: из-под неё выезжает красная
 * корзина (см. swipe.js). disabled — жеста нет (последний подход удалить
 * нельзя, в кругах суперсета подходы удаляются кругом).
 *
 * Удаление — «в пыль» (dust.js): рассыпается сама строка, а если задан
 * dustClosest — ближайший такой предок (заголовок упражнения удаляет всю
 * карточку, и рассыпаться должна карточка).
 */
export default function SwipeRow({ className = '', children, onDelete, label, disabled = false, dustClosest = '', ...rest }) {
  const sw = useSwipe({ disabled });
  const root = useRef(null);
  const firing = useRef(false);
  const fire = (e) => {
    e.stopPropagation();
    if (firing.current) return;
    firing.current = true;
    const el = (dustClosest && root.current && root.current.closest(dustClosest)) || root.current;
    vanish(el, () => { onDelete(); sw.reset(); }).then(() => { firing.current = false; });
  };
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
            <IconTrash size={20} />
            <span>Удалить</span>
          </button>
        </div>
      )}
      <div className="swipe__content" ref={sw.content}>{children}</div>
    </div>
  );
}
