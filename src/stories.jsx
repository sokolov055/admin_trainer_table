import React, { useState, useEffect, useRef, useCallback } from 'react';
import { haptic } from './telegram.js';
import {
  IconPlan, IconNutrition, IconProgress, IconPhone, IconKey, IconClose,
} from './icons.jsx';

/**
 * ==========================================================================
 * Сторис об обновлениях приложения
 *
 * Приложение растёт быстрее, чем клиент успевает его открывать: человек
 * заходит раз в неделю посмотреть баланс и не знает, что с прошлого раза
 * появилось. Рассказывать об этом сообщением в бота — значит писать людям
 * о том, чего они не просили; прятать в «Настройки» — значит не рассказать
 * вовсе. Кружки вверху обзора — единственное место, где новость попадается
 * на глаза ровно тогда, когда человек и так смотрит на экран, и не требует
 * от него ничего.
 *
 * Тренер видит те же самые сторис, что и клиенты, и намеренно: он должен
 * знать, что именно им сейчас показывают, не переключаясь в чужую роль.
 *
 * Текст лежит здесь, а не в таблице. Новость про функцию рождается вместе
 * с самой функцией и едет тем же релизом — разъехаться они не могут по
 * устройству. Цена — правка текста требует коммита; она того стоит.
 * ==========================================================================
 */

/**
 * Сколько показывается один кадр. Шесть секунд — время на два-три
 * предложения вслух про себя, с запасом на то, что человек отвлёкся.
 * Меньше — приходится догонять, больше — палец сам тянется вперёд.
 */
const FRAME_MS = 6000;

/** Насколько долгое нажатие считается «придержал, чтобы дочитать» */
const HOLD_MS = 220;

/** Сдвиг, после которого движение пальца — жест, а не промах по кнопке */
const SWIPE_PX = 60;

/** Просмотренные храним у человека: это его личная отметка, не данные */
const SEEN_KEY = 'stories_seen_v1';

/**
 * Обновления, от свежего к старому.
 *
 * Новость живёт здесь, пока функция остаётся новой для тех, кто давно не
 * заходил. Список правится сверху: добавили функцию — добавили кадр,
 * унесли из приложения — унесли и кадр, иначе сторис начнут врать.
 *
 * id больше не меняется никогда: по нему хранится «просмотрено», и новый
 * id заставит кружок снова загореться у всех.
 */
export const STORIES = [
  {
    id: 'next-training',
    label: 'Расписание',
    date: '19 сентября',
    Icon: IconPlan,
    heading: 'Видно, когда следующая тренировка',
    body: 'Дата и время ближайшего занятия теперь на обзоре — первой строкой. '
      + 'Тренер ставит тренировку в календарь, и она появляется здесь сама: '
      + 'спрашивать и уточнять больше не нужно.',
  },
  {
    id: 'nutrition',
    label: 'Питание',
    date: '18 сентября',
    Icon: IconNutrition,
    heading: 'Норма калорий по вашей анкете',
    body: 'Шесть чисел о себе — рост, вес, возраст, пол, активность и цель — '
      + 'и приложение считает дневную норму вместе с белками, жирами и '
      + 'углеводами. Анкета в разделе «Питание», меняется в любой момент.',
  },
  {
    id: 'progress',
    label: 'Прогресс',
    date: '18 сентября',
    Icon: IconProgress,
    heading: 'Замеры и график рядом',
    body: 'Вес, талия, бёдра и остальные замеры показываются графиком прямо '
      + 'под цифрами. Видно не только сколько сейчас, но и куда идёт — '
      + 'а это и есть то, ради чего замеры делают.',
  },
  {
    id: 'install',
    label: 'На телефон',
    date: '18 сентября',
    Icon: IconPhone,
    heading: 'Кабинет ставится иконкой',
    body: 'Приложение открывается не только из Telegram: его можно добавить '
      + 'на домашний экран и заходить одним касанием, как в обычное '
      + 'приложение. Как это сделать — в гиде.',
  },
  {
    id: 'guide',
    label: 'Гид',
    date: '18 сентября',
    Icon: IconKey,
    heading: 'Гид: вход, установка, разделы',
    body: 'Короткая инструкция на одной странице: как войти по ключу, как '
      + 'поставить кабинет на телефон и что лежит в каждом разделе. '
      + 'Ссылку тренер присылает вместе с ключом.',
  },
];

/* ==========================================================================
   Ряд кружков
   ========================================================================== */

export function Stories() {
  const [seen, setSeen] = useState(readSeen);
  const [index, setIndex] = useState(-1);

  const open = (i) => {
    setIndex(i);
    haptic();
  };

  // Кадр считается просмотренным, как только его показали: человек его
  // увидел, и загораться второй раз кружок не должен. Отметка ставится на
  // каждом шаге, а не при закрытии, — иначе закрывший на середине получил
  // бы «непрочитано» у того, что уже прочёл.
  const markSeen = useCallback((id) => {
    setSeen((prev) => (prev.indexOf(id) === -1 ? prev.concat(id) : prev));
  }, []);

  // Запись отдельно от обновления состояния: обновление обязано быть
  // чистым, иначе в StrictMode оно выполнится дважды.
  useEffect(() => { writeSeen(seen); }, [seen]);

  if (STORIES.length === 0) return null;

  return (
    <>
      {/* Ряд прокручивается вбок и выходит за поля экрана: обрезанный
          последний кружок у края — единственное, что честно сообщает, что
          там есть ещё. Полоса прокрутки для этого не нужна. */}
      <div className="stories" role="group" aria-label="Что нового в приложении">
        {STORIES.map((story, i) => {
          const Icon = story.Icon;
          const isSeen = seen.indexOf(story.id) !== -1;
          return (
            <button
              key={story.id}
              type="button"
              className={'stories__item' + (isSeen ? ' stories__item--seen' : '')}
              onClick={() => open(i)}
              aria-label={'Что нового: ' + story.heading}
            >
              <span className="stories__ring">
                <span className="stories__face">
                  <Icon size={24} />
                </span>
              </span>
              <span className="stories__label">{story.label}</span>
            </button>
          );
        })}
      </div>

      {index >= 0 && (
        <StoryViewer
          index={index}
          onIndex={setIndex}
          onSeen={markSeen}
          onClose={() => setIndex(-1)}
        />
      )}
    </>
  );
}

/* ==========================================================================
   Полноэкранный просмотр
   ========================================================================== */

function StoryViewer({ index, onIndex, onSeen, onClose }) {
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const holdRef = useRef(null);

  const [paused, setPaused] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [shown, setShown] = useState(false);

  const story = STORIES[index];

  // Свежие значения в обработчиках, которые вешаются один раз
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const indexRef = useRef(index);
  indexRef.current = index;

  const go = useCallback((delta) => {
    const next = indexRef.current + delta;
    if (next < 0) return;
    if (next >= STORIES.length) {
      closeRef.current();
      return;
    }
    onIndex(next);
    haptic();
  }, [onIndex]);

  useEffect(() => { onSeen(story.id); }, [story.id, onSeen]);

  // Появление разведено с монтажом тем же приёмом, что в Drawer: браузер
  // должен посчитать закрытое положение до того, как появится класс
  // открытия, иначе перехода не будет вовсе.
  useEffect(() => {
    const node = rootRef.current;
    if (node) void node.offsetWidth;
    setShown(true);
  }, []);

  // Клавиатура, фокус и прокрутка под экраном — ровно как у выдвижной
  // панели: просмотр перехватывает экран целиком и обязан вести себя как
  // диалог, а не как картинка поверх страницы.
  useEffect(() => {
    const returnTo = document.activeElement;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };

    document.addEventListener('keydown', onKey);

    const node = rootRef.current;
    if (node) { try { node.focus({ preventScroll: true }); } catch (_) {} }

    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      if (returnTo && returnTo.focus) {
        try { returnTo.focus({ preventScroll: true }); } catch (_) {}
      }
    };
  }, [go]);

  const clearHold = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };

  const onPointerDown = (e) => {
    // Нажатие на кнопку закрытия — не жест по кадру
    if (e.target.closest('.story__close')) return;

    gestureRef.current = { x: e.clientX, y: e.clientY, held: false };
    holdRef.current = setTimeout(() => {
      gestureRef.current = gestureRef.current && { ...gestureRef.current, held: true };
      setPaused(true);
    }, HOLD_MS);
  };

  const onPointerMove = (e) => {
    const st = gestureRef.current;
    if (!st) return;

    const dy = e.clientY - st.y;
    const dx = e.clientX - st.x;

    // Палец поехал — это уже не удержание
    if (Math.abs(dy) > 8 || Math.abs(dx) > 8) clearHold();

    // Тянем кадр только вниз и только если движение вертикальное: иначе
    // переход между кадрами вбок превращался бы в дрожание по вертикали.
    if (dy > 0 && Math.abs(dy) > Math.abs(dx)) setDragY(dy);
  };

  const onPointerUp = (e) => {
    const st = gestureRef.current;
    gestureRef.current = null;
    clearHold();

    const dropped = dragY;
    setDragY(0);

    if (!st) return;

    // Удержание — это «дай дочитать», а не команда. Отпустили — просто
    // продолжаем с того же места, никуда не листая.
    if (st.held) { setPaused(false); return; }

    if (dropped > SWIPE_PX) { closeRef.current(); return; }

    const dx = e.clientX - st.x;
    if (dx < -SWIPE_PX) { go(1); return; }
    if (dx > SWIPE_PX) { go(-1); return; }

    // Обычное касание: левая треть — назад, остальное — вперёд. Треть, а
    // не половина: вперёд листают почти всегда, и промахнуться в прошлое
    // на широком экране обиднее, чем не попасть в узкую зону возврата.
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  const Icon = story.Icon;
  const reduced = prefersReducedMotion();

  return (
    <div
      className={'story' + (shown ? ' story--in' : '')}
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={'Что нового: ' + story.heading}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { clearHold(); gestureRef.current = null; setDragY(0); setPaused(false); }}
      style={dragY ? { transform: 'translateY(' + dragY + 'px)', transition: 'none' } : undefined}
    >
      {/* Полоски: сколько кадров всего, какой идёт и сколько его осталось.
          Без них сторис — это картинка без конца, и человек не знает,
          стоит ли ждать. */}
      <div className="story__bars">
        {STORIES.map((s, i) => (
          <span key={s.id} className="story__bar">
            <span
              className={
                'story__fill'
                + (i < index ? ' story__fill--done' : '')
                + (i === index && !reduced ? ' story__fill--run' : '')
              }
              style={
                i === index && !reduced
                  ? { animationDuration: FRAME_MS + 'ms', animationPlayState: paused ? 'paused' : 'running' }
                  : undefined
              }
              onAnimationEnd={i === index ? () => go(1) : undefined}
            />
          </span>
        ))}
      </div>

      <button
        type="button"
        className="story__close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        <IconClose size={20} />
      </button>

      {/* key на кадре: содержимое въезжает заново при каждом переходе,
          иначе смена текста на месте читается как опечатка, а не как
          следующая новость */}
      <div className="story__frame" key={story.id}>
        <span className="story__icon"><Icon size={30} /></span>
        <p className="story__date">{story.date}</p>
        <h2 className="story__heading">{story.heading}</h2>
        <p className="story__body">{story.body}</p>
      </div>

      <p className="story__hint">
        {reduced ? 'Касанием — вперёд' : 'Придержите, чтобы дочитать'}
      </p>
    </div>
  );
}

/* ==========================================================================
   Просмотренное
   ========================================================================== */

function readSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
  } catch (_) {
    // Приватный режим, запрещённые куки, переполнение — не повод
    // прятать новости: просто считаем, что не видели ничего
    return [];
  }
}

function writeSeen(list) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch (_) {}
}

/**
 * Автолистание — это движение, которого человек не просил. Кто отключил
 * анимации в системе, листает сам касанием: полоски тогда показывают
 * место в ленте, а не утекающее время.
 */
function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}
