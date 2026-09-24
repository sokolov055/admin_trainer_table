import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Разделы нижнего меню живут, пока приложение открыто.
 *
 * Раньше каждое переключение раздела строило экран заново: разметка,
 * данные из кэша, лесенка появления, а на медленном запросе — заглушки
 * загрузки. На телефоне это читалось как задержка при каждом переходе.
 * В iOS и Telegram вкладка, где уже был, открывается мгновенно и там же,
 * где её оставили. Так и здесь: посещённый раздел не уничтожается, а
 * прячется, и место прокрутки у каждого своё.
 *
 * Возвращает:
 *   shown(id) — рисовать ли раздел (был открыт хоть раз или открыт сейчас);
 *   kept(id)  — раздел уже прятали: при повторном показе лесенка появления
 *               не нужна (браузер проиграл бы её заново при каждом показе);
 *   leave()   — запомнить прокрутку раздела, с которого уходят; вызывать
 *               до смены раздела.
 */
export function useKeptTabs(view, tabIds) {
  const isTab = (id) => tabIds.includes(id);

  const [visited, setVisited] = useState(() => (isTab(view) ? [view] : []));
  const [hiddenOnce, setHiddenOnce] = useState([]);
  const scrolls = useRef({});
  const previous = useRef(view);

  useLayoutEffect(() => {
    const was = previous.current;
    if (was === view) return;
    previous.current = view;

    if (isTab(view) && !visited.includes(view)) setVisited((list) => [...list, view]);
    if (isTab(was)) setHiddenOnce((list) => (list.includes(was) ? list : [...list, was]));

    // До отрисовки: раздел встаёт сразу на своём месте, без прыжка
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, scrolls.current[view] || 0);
  }, [view]);

  return {
    shown: (id) => id === view || visited.includes(id),
    kept: (id) => hiddenOnce.includes(id),
    leave: () => {
      scrolls.current[previous.current] = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
    },
  };
}
