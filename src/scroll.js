/**
 * Прокрутить страницу к запомненному месту — но не дальше её конца.
 *
 * Место запоминается при уходе с раздела, а к возвращению страница могла
 * стать короче (пришли другие данные, раздел ещё не дорисован). Safari на
 * iPhone прокрутку за конец выполняет, а потом «отпускает» страницу, и
 * всё закреплённое — нижнее меню, подложка под часами, липкие плашки —
 * съезжает со своих мест, пока приложение не перезапустить.
 */
export function scrollToClamped(y) {
  if (typeof window === 'undefined' || !window.scrollTo) return;
  const doc = document.documentElement;
  const max = Math.max(0, (doc.scrollHeight || 0) - (window.innerHeight || 0));
  window.scrollTo(0, Math.min(Math.max(0, y || 0), max));
}

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Вернуться в список туда же, откуда ушли в карточку.
 *
 * Карточки открываются подменой экрана (клиент, блюдо, упражнение,
 * шаблон). Жест «назад» уже возвращал прокрутку по снимку экрана, а кнопка
 * «Назад» — нет: список открывался с самого верха, и нужное место
 * приходилось искать заново.
 *
 * detailOpen — открыта ли сейчас карточка. Пока виден список, место
 * запоминается на каждой прокрутке; карточка открывается сверху; при
 * возврате список встаёт на запомненное место. Несколько кадров подряд —
 * пока список дорисовывается и страница добирает высоту.
 */
export function useReturnScroll(detailOpen) {
  const saved = useRef(0);
  const open = useRef(detailOpen);
  const was = useRef(detailOpen);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onScroll = () => { if (!open.current) saved.current = window.scrollY || 0; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    open.current = detailOpen;
    if (typeof window === 'undefined' || !window.scrollTo) { was.current = detailOpen; return; }
    if (detailOpen && !was.current) window.scrollTo(0, 0);
    if (!detailOpen && was.current) {
      const y = saved.current;
      let frames = 0;
      const place = () => {
        scrollToClamped(y);
        if (Math.abs((window.scrollY || 0) - y) > 2 && frames++ < 12) requestAnimationFrame(place);
      };
      place();
    }
    was.current = detailOpen;
  }, [detailOpen]);
}
