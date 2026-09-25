import React from 'react';
import { useSwipe } from './swipe.js';
import { IconTrash } from './icons.jsx';

/**
 * Строка, которую можно смахнуть влево: из-под неё выезжает красная
 * корзина (см. swipe.js). disabled — жеста нет (последний подход удалить
 * нельзя, в кругах суперсета подходы удаляются кругом).
 */
export default function SwipeRow({ className = '', children, onDelete, label, disabled = false, ...rest }) {
  const sw = useSwipe({ disabled });
  return (
    <div className={'swipe ' + className} {...(disabled ? {} : sw.bind)} {...rest}>
      {!disabled && (
        <div className="swipe__action" ref={sw.action} style={{ visibility: 'hidden' }}>
          <button
            type="button"
            className="swipe__trash"
            aria-label={label}
            onClick={(e) => { e.stopPropagation(); sw.close(); onDelete(); }}
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
