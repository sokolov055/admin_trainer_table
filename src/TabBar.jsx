import React from 'react';

/**
 * Нижнее меню — плавающая капсула, как в новом Telegram и iOS 26.
 *
 * Капсула не прибита к краю экрана, а висит над ним: полупрозрачная, с
 * размытием того, что прокручивается под ней, и светлой кромкой сверху
 * вместо жёсткой линии. Так она читается как отдельный слой управления,
 * а не как ещё одна полоса контента.
 *
 * Выбранный раздел отмечен «таблеткой», которая одна на всё меню и
 * переезжает к нажатой вкладке, а не вспыхивает на новом месте: видно,
 * откуда и куда перешли. Её положение — одна переменная `--tab-pos`;
 * при листании разделов пальцем её же двигает gestures.jsx, и таблетка
 * едет вслед за пальцем.
 */
export default function TabBar({ tabs, active, onSelect }) {
  const index = Math.max(0, tabs.findIndex((t) => t.id === active));
  const onTab = tabs.some((t) => t.id === active);

  return (
    <nav
      // На экранах бокового меню («Расходы», «Мои данные») ни одна вкладка
      // не выбрана, и меню висело бы пустой подставкой поверх списка. Там
      // оно уезжает вниз, как в iOS, и возвращается с разделом.
      className={'tabbar' + (onTab ? '' : ' tabbar--hidden')}
      style={{ '--tab-count': tabs.length, '--tab-pos': index }}
      aria-hidden={onTab ? undefined : 'true'}
    >
      <span className={'tabbar__pill' + (onTab ? '' : ' tabbar__pill--off')} aria-hidden="true" />

      {tabs.map((t) => {
        const Icon = t.Icon;
        const current = t.id === active;
        return (
          <button
            key={t.id}
            className={'tabbar__item' + (current ? ' tabbar__item--active' : '')}
            onClick={() => onSelect(t.id)}
            tabIndex={onTab ? undefined : -1}
            aria-current={current ? 'page' : undefined}
          >
            <span className="tabbar__icon"><Icon size={21} /></span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
