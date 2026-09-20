import React, { useState, useEffect, useRef, useCallback } from 'react';
import { haptic } from './telegram.js';
import { ART, COVERS } from './storyArt.jsx';
import { IconClose } from './icons.jsx';

/**
 * Версия, в которой вышли эти новости.
 *
 * Не то же самое, что APP_VERSION из version.js, и это намеренно. Там —
 * версия сборки: она поднимается на любой выкладке и нужна тренеру, чтобы
 * понять, та ли это сборка. Здесь — версия последнего обновления ДЛЯ
 * КЛИЕНТА, и поднимается она только когда клиенту есть что рассказать.
 *
 * Слить их в одно число не выйдет: тренерские правки выходят чаще, и общее
 * число обещало бы клиенту новости, которых для него не было.
 */
const NEWS_VERSION = '3.1';

/**
 * ==========================================================================
 * Сторис
 *
 * Приложение растёт быстрее, чем его открывают: клиент заходит раз в неделю
 * посмотреть баланс и не знает, что появилось с прошлого раза. Писать об
 * этом в бота — значит писать людям о том, чего они не просили; прятать в
 * настройки — значит не рассказать вовсе. Кружок вверху экрана попадается
 * на глаза тогда, когда человек и так смотрит, и ничего от него не требует.
 *
 * Кружок — это ТЕМА, а не одна новость. Внутри темы несколько кадров,
 * которые листаются: «что нового в версии» — рассказ из пяти частей, и пять
 * кружков в ряд выглядели бы как пять разных разделов. Дальше темы
 * добавляются сюда же — гид по питанию, марафон, что угодно, — и каждая
 * получает свой кружок со своими кадрами.
 *
 * Тренер видит те же темы, что и клиенты, и намеренно: он должен знать, о
 * чём приложение сейчас им рассказывает, не заходя в чужую роль.
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

/** Просмотренное храним у человека: это его личная отметка, не данные */
const SEEN_KEY = 'stories_seen_v1';

/**
 * Темы, от свежей к старой. Каждая — один кружок.
 *
 * `caption` — строка над кадром, общая для всей темы: она объясняет, что
 * это за подборка, до того как человек начнёт читать первый кадр. Номер
 * версии живёт здесь и только здесь. Это версия РАССКАЗА об обновлении, а
 * не пакета: клиенту нечего знать про package.json, ему нужно понимать,
 * что с прошлого раза прошло одно обновление, а не три.
 *
 * `id` кадра не меняется никогда: по нему хранится «просмотрено», и новый
 * id заставит кружок снова загореться у всех.
 *
 * ПРАВИЛО, КОТОРОЕ НЕ ОБСУЖДАЕТСЯ: каждая новая функция ДЛЯ КЛИЕНТА едет
 * сюда кадром, в том же коммите, что и сама функция. Клиент открывает
 * приложение раз в неделю и иначе про неё не узнает — функция, о которой
 * не рассказали, для него не существует.
 *
 * Тренерские функции сюда НЕ попадают. Скрытие листов, пересчёт по
 * календарю, проведение оплаты — это про работу тренера, и клиенту про них
 * рассказывать нечего: нажать он их всё равно не может. Лента новостей
 * должна состоять из того, что клиент сам может открыть и потрогать, иначе
 * её перестанут читать.
 *
 * Кадр обязан объяснять, КАК этим пользоваться, а не только сообщать, что
 * оно появилось. «Появился выбор темпа» — бесполезная новость; «откройте
 * „Питание“, под нормой три варианта, нажмите подходящий» — полезная.
 *
 * Вместе с кадром поднимается NEWS_VERSION:
 *   обычная функция  — вторая цифра (1.1 → 1.2)
 *   большое обновление — первая (1.4 → 2.0)
 *
 * Тема остаётся одна: новые кадры добавляются в начало `frames`, старые
 * убираются, когда перестали быть новостью. Иначе лента растёт без конца,
 * а кружок обещает пять минут чтения вместо одной.
 */
export const TOPICS = [
  {
    // id темы без номера версии: тема одна и та же, меняется её состав.
    // Номер живёт в подписи и берётся из version.js — того же места, что
    // показывает тренеру строка внизу бокового меню.
    id: 'release',

    // Подпись на плитке — короткая: она стоит поверх картинки, и длинная
    // строка превращает обложку в текстовый блок. Полное название с
    // номером версии живёт в caption, над раскрытым кадром.
    label: 'Что нового',
    cover: 'release',
    caption: 'Что нового в версии ' + NEWS_VERSION,
    frames: [
      {
        id: 'telegram-browser-login',
        date: '20 сентября',
        art: 'install',
        tint: '#f5c65c',
        heading: 'Вход на телефоне — одной кнопкой',
        body: 'Откройте Fit Track в Telegram и нажмите «Добавить на телефон». '
          + 'Браузер откроется уже с выполненным входом — останется добавить '
          + 'иконку на главный экран. Код теперь нужен только как запасной способ.',
      },
      {
        id: 'ration-pantry',
        date: '20 сентября',
        art: 'pantry',
        tint: '#7fd97f',
        heading: 'Рацион из того, что есть дома',
        body: 'Откройте «Питание» и нажмите «Собрать рацион». Отметьте '
          + 'продукты, которые лежат в холодильнике и в шкафу, — приложение '
          + 'подберёт блюда, которые из них готовятся, и покажет, чего '
          + 'не хватает. Чем больше отметите, тем меньше придётся докупать.',
      },
      {
        id: 'ration-swipe',
        date: '20 сентября',
        art: 'swipe',
        tint: '#8ec0f5',
        heading: 'Блюда листаются по одному',
        body: 'Смахните вправо блюдо, которое готовы приготовить, влево — '
          + 'которое не нравится; можно нажимать кнопки под карточкой. '
          + 'Отметьте несколько — и приложение соберёт из них завтрак, обед '
          + 'и ужин ровно под вашу норму калорий, а внизу покажет список '
          + 'покупок с граммами. Не подошло — нажмите «Другой вариант».',
      },
      {
        id: 'workout-journal',
        date: '19 сентября',
        art: 'journal',
        tint: '#8ec0f5',
        heading: 'Тренировка теперь записывается',
        body: 'Откройте «Тренировки» и нажмите «Начать тренировку» у нужного '
          + 'занятия. Вписывайте вес и повторы прямо между подходами, '
          + 'отмечайте сделанное галочкой. Упражнение можно пропустить, '
          + 'добавить свой подход или поменять порядок — это меняет только '
          + 'сегодняшнее занятие, программа месяца остаётся прежней.',
      },
      {
        id: 'workout-draft',
        date: '19 сентября',
        art: 'draft',
        tint: '#7fd97f',
        heading: 'Отвлеклись — ничего не потеряно',
        body: 'Кнопка «Пауза» останавливает время, а записанное сохраняется '
          + 'само, даже если связь пропала: телефон догрузит его, когда сеть '
          + 'вернётся. Выйти из занятия и вернуться можно сколько угодно — '
          + 'оно ждёт на том же месте. Когда закончили, нажмите «Завершить '
          + 'тренировку»: занятие уйдёт в журнал, а тренер увидит ваши веса.',
      },
      {
        id: 'nutrition-pace',
        date: '19 сентября',
        art: 'pace',
        tint: '#7fd97f',
        heading: 'Питание: три варианта вместо одного',
        body: 'Раньше цель сразу означала самый жёсткий темп. Теперь '
          + 'вариантов три — мягкий, ровный и быстрый. Откройте «Питание»: '
          + 'под суточной нормой стоят все три, с калориями и БЖУ каждого. '
          + 'Нажмите на подходящий, и он сразу станет вашей нормой; '
          + 'переключать можно сколько угодно.',
      },
      {
        id: 'next-training',
        date: '19 сентября',
        art: 'schedule',
        tint: '#8ec0f5',
        heading: 'Видно, когда следующая тренировка',
        body: 'Дата и время ближайшего занятия теперь на обзоре — первой '
          + 'строкой. Тренер ставит тренировку в календарь, и она появляется '
          + 'здесь сама: спрашивать и уточнять больше не нужно.',
      },
      {
        id: 'nutrition',
        date: '18 сентября',
        art: 'nutrition',
        tint: '#7fd97f',
        heading: 'Норма калорий по вашей анкете',
        body: 'Откройте «Питание» и заполните анкету: рост, вес, возраст, '
          + 'пол, активность и цель. Приложение посчитает дневную норму '
          + 'вместе с белками, жирами и углеводами. Изменился вес — нажмите '
          + '«Заполнить заново», норма пересчитается.',
      },
      {
        id: 'progress',
        date: '18 сентября',
        art: 'progress',
        tint: '#3987e5',
        heading: 'Замеры и график рядом',
        body: 'Откройте «Прогресс»: вес, талия, бёдра и остальные замеры '
          + 'показываются графиком прямо под цифрами. Видно не только '
          + 'сколько сейчас, но и куда идёт — а это и есть то, ради чего '
          + 'замеры делают.',
      },
      {
        id: 'install',
        date: '18 сентября',
        art: 'install',
        tint: '#f5c65c',
        heading: 'Кабинет ставится иконкой',
        body: 'Приложение открывается не только из Telegram: его можно '
          + 'добавить на домашний экран и заходить одним касанием, как в '
          + 'обычное приложение. Как это сделать — в гиде.',
      },
      {
        id: 'guide',
        date: '18 сентября',
        art: 'guide',
        tint: '#22a97a',
        heading: 'Гид: вход, установка, разделы',
        body: 'Короткая инструкция на одной странице: как войти по ключу, '
          + 'как поставить кабинет на телефон и что лежит в каждом разделе. '
          + 'Ссылку тренер присылает вместе с ключом.',
      },
    ],
  },
];

/* ==========================================================================
   Ряд кружков
   ========================================================================== */

export function Stories() {
  const [seen, setSeen] = useState(readSeen);
  const [at, setAt] = useState(null);

  // Запись отдельно от обновления состояния: обновление обязано быть
  // чистым, иначе в StrictMode оно выполнится дважды.
  useEffect(() => { writeSeen(seen); }, [seen]);

  const markSeen = useCallback((id) => {
    setSeen((prev) => (prev.indexOf(id) === -1 ? prev.concat(id) : prev));
  }, []);

  if (TOPICS.length === 0) return null;

  return (
    <>
      {/* Ряд прокручивается вбок и выходит за поля экрана: обрезанный кружок
          у края — единственное, что честно сообщает, что там есть ещё. */}
      <div className="stories" role="group" aria-label="Истории приложения">
        {TOPICS.map((topic, i) => {
          const Cover = COVERS[topic.cover];

          // Тема прочитана, когда прочитаны все её кадры. Достаточно одного
          // непрочитанного — плитка продолжает звать: человек закрыл её на
          // середине, и вернуться ему есть зачем.
          const isSeen = topic.frames.every((f) => seen.indexOf(f.id) !== -1);

          return (
            <button
              key={topic.id}
              type="button"
              className={'stories__item' + (isSeen ? ' stories__item--seen' : '')}
              onClick={() => { setAt({ topic: i, frame: 0 }); haptic(); }}
              aria-label={topic.caption + ', экранов: ' + topic.frames.length}
            >
              <span className="stories__tile">
                {Cover ? <Cover /> : null}

                {/* Затемнение снизу — не украшение: подпись лежит поверх
                    картинки, и без него белый текст на светлом участке
                    обложки перестал бы читаться. */}
                <span className="stories__shade" />
                <span className="stories__label">{topic.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {at && (
        <StoryViewer
          at={at}
          onAt={setAt}
          onSeen={markSeen}
          onClose={() => setAt(null)}
        />
      )}
    </>
  );
}

/* ==========================================================================
   Полноэкранный просмотр
   ========================================================================== */

function StoryViewer({ at, onAt, onSeen, onClose }) {
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const holdRef = useRef(null);

  const [paused, setPaused] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [shown, setShown] = useState(false);

  const topic = TOPICS[at.topic];
  const frame = topic.frames[at.frame];

  // Свежие значения в обработчиках, которые вешаются один раз
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const atRef = useRef(at);
  atRef.current = at;

  /**
   * Шаг вперёд или назад — сквозь границы тем.
   *
   * Кончилась тема — открывается следующая, а не закрывается просмотр: для
   * человека это одна лента, как в мессенджере. Кончилась последняя —
   * выходим, потому что дальше действительно ничего нет.
   */
  const go = useCallback((delta) => {
    const cur = atRef.current;
    const frames = TOPICS[cur.topic].frames.length;
    const next = cur.frame + delta;

    if (next >= 0 && next < frames) {
      onAt({ topic: cur.topic, frame: next });
      haptic();
      return;
    }

    if (delta > 0) {
      if (cur.topic + 1 >= TOPICS.length) { closeRef.current(); return; }
      onAt({ topic: cur.topic + 1, frame: 0 });
      haptic();
      return;
    }

    // Назад с первого кадра первой темы — некуда, остаёмся на месте
    if (cur.topic === 0) return;
    const prev = cur.topic - 1;
    onAt({ topic: prev, frame: TOPICS[prev].frames.length - 1 });
    haptic();
  }, [onAt]);

  useEffect(() => { onSeen(frame.id); }, [frame.id, onSeen]);

  // Появление разведено с монтажом тем же приёмом, что в Drawer: браузер
  // должен посчитать закрытое положение до того, как появится класс
  // открытия, иначе перехода не будет вовсе.
  useEffect(() => {
    const node = rootRef.current;
    if (node) void node.offsetWidth;
    setShown(true);
  }, []);

  // Клавиатура, фокус и прокрутка под экраном — как у выдвижной панели:
  // просмотр перехватывает экран целиком и обязан вести себя как диалог,
  // а не как картинка поверх страницы.
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
    if (e.target.closest && e.target.closest('.story__close')) return;

    gestureRef.current = { x: e.clientX, y: e.clientY, held: false };
    holdRef.current = setTimeout(() => {
      if (gestureRef.current) gestureRef.current.held = true;
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

  const Picture = ART[frame.art];
  const reduced = prefersReducedMotion();

  return (
    <div
      className={'story' + (shown ? ' story--in' : '')}
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={topic.caption}
      tabIndex={-1}
      style={{
        '--tint': frame.tint,
        ...(dragY ? { transform: 'translateY(' + dragY + 'px)', transition: 'none' } : null),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { clearHold(); gestureRef.current = null; setDragY(0); setPaused(false); }}
    >
      {/* Полоски: сколько кадров в теме, какой идёт и сколько его осталось.
          Только текущая тема: соседние — это соседние кружки, и мешать их
          в одну шкалу значит обещать длину, которой человек не выбирал. */}
      <div className="story__bars">
        {topic.frames.map((f, i) => (
          <span key={f.id} className="story__bar">
            <span
              className={
                'story__fill'
                + (i < at.frame ? ' story__fill--done' : '')
                + (i === at.frame && !reduced ? ' story__fill--run' : '')
              }
              style={
                i === at.frame && !reduced
                  ? { animationDuration: FRAME_MS + 'ms', animationPlayState: paused ? 'paused' : 'running' }
                  : undefined
              }
              onAnimationEnd={i === at.frame ? () => go(1) : undefined}
            />
          </span>
        ))}
      </div>

      {/* Шапка темы: что это за подборка. Стоит над кадром и не меняется,
          пока листаются кадры, — так видно, что это одна история. */}
      <div className="story__top">
        <p className="story__caption">{topic.caption}</p>
        <button
          type="button"
          className="story__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <IconClose size={20} />
        </button>
      </div>

      {/* key на кадре: содержимое въезжает заново при каждом переходе,
          иначе смена текста на месте читается как опечатка, а не как
          следующая новость */}
      <div className="story__frame" key={topic.id + ':' + frame.id}>
        <div className="story__art-box">
          {Picture ? <Picture /> : null}
        </div>
        <p className="story__date">{frame.date}</p>
        <h2 className="story__heading">{frame.heading}</h2>
        <p className="story__body">{frame.body}</p>
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
    // Приватный режим, запрещённые куки, переполнение — не повод прятать
    // новости: просто считаем, что не видели ничего
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
