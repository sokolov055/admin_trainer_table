import React, { useState, useEffect, useRef, useCallback } from 'react';
import { haptic } from './telegram.js';
import { ART, COVERS } from './storyArt.jsx';
import { IconClose } from './icons.jsx';
import { detectBrowser } from './browser.js';

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
 * Тем две (владелец, 03.10.2026). «Что нового» — только эта версия:
 * вышла следующая — её кадры заменяют прежние целиком. «Как пользоваться»
 * — мини-инструкция по всему приложению: новая функция, исправленный баг
 * или другая кнопка правят её кадр в том же коммите, чтобы инструкция не
 * врала. Иначе лента растёт без конца, а кружок обещает пять минут чтения.
 */
export const TOPICS = [
  {
    // id темы без номера версии: тема одна и та же, меняется её состав.
    // Только то, что вышло в этой версии (владелец, 03.10.2026): старые
    // кадры убираются, как только вышла следующая. Что умеет приложение
    // вообще — соседняя тема «Как пользоваться».
    id: 'release',

    // Подпись на плитке — короткая: она стоит поверх картинки, и длинная
    // строка превращает обложку в текстовый блок. Полное название с
    // номером версии живёт в caption, над раскрытым кадром.
    label: 'Что нового',
    cover: 'release',
    caption: 'Что нового в версии ' + NEWS_VERSION,
    frames: [
      {
        id: 'rest-fold',
        date: '3 октября',
        art: 'rest',
        tint: '#8ec0f5',
        heading: 'Отдых можно свернуть',
        body: 'Во время отдыха нажмите «Свернуть таймер» под кнопками — таймер '
          + 'станет плашкой внизу, а приложение свободно: листайте, открывайте '
          + 'другие разделы. Нажмите плашку — таймер снова на весь экран. Время '
          + 'выйдет — «Отдых окончен» всплывёт, где бы вы ни были.',
        bodyIos: 'Во время отдыха нажмите «Свернуть таймер» под кнопками — таймер '
          + 'станет капсулой вверху, у выреза экрана, а приложение свободно: '
          + 'листайте, открывайте другие разделы. Нажмите капсулу — таймер снова '
          + 'на весь экран. Закрыли будильник крестиком — экран отдыха закроется сам.',
      },
      {
        id: 'was-per-set',
        date: '3 октября',
        art: 'ladder',
        tint: '#f5c65c',
        heading: '«Было» — у каждого подхода',
        body: 'Под каждым подходом мелко написано, что вы делали в этом же '
          + 'подходе в прошлый раз: «было 6 кг × 10». Поменяйте повторы — вес '
          + 'пересчитается сам. Впишите вес — следующие подходы, которых в прошлый '
          + 'раз не было, получат его же.',
      },
      {
        id: 'last-set',
        date: '3 октября',
        art: 'effort',
        tint: '#7fd97f',
        heading: 'Последний подход — и готово',
        body: 'Отметили последний подход тренировки — отдых не начнётся, вверху '
          + 'сразу «Завершить тренировку?». «Завершить» и «Отменить» теперь всегда '
          + 'вверху, рядом со временем, — листать вниз не нужно.',
      },
      {
        id: 'next-superset',
        date: '3 октября',
        art: 'rest',
        tint: '#c9a4f0',
        heading: 'Дальше суперсет — видно весь круг',
        body: 'На экране отдыха в карточке «Дальше» — все упражнения следующего '
          + 'круга суперсета, у каждого свой вес и повторы. У сделанного '
          + 'упражнения в круге видно, как оно прошло: легко, нормально или тяжело.',
      },
      {
        id: 'watch-list-mark',
        // Apple Watch — только у iPhone
        only: 'ios',
        date: '3 октября',
        art: 'watch',
        tint: '#f0a4a4',
        heading: 'Часы: подход — прямо из списка',
        body: 'В списке упражнений на часах нажмите подход: вес и повторы — '
          + 'барабанами, внизу «Легко», «Норм», «Тяжело» — подход сразу '
          + 'отмечен. Шаг веса меняется касанием на экране с настройками: '
          + 'сам, 1, 1,25, 2,5 или 5 кг.',
      },
    ],
  },
  {
    // Мини-инструкция (владелец, 03.10.2026): что приложение умеет вообще.
    // Держать актуальной — новая функция или изменённый экран правят свой
    // кадр здесь в том же коммите, а не только добавляют новость выше
    id: 'guide',
    label: 'Инструкция',
    cover: 'guide',
    caption: 'Как пользоваться Fit Track',
    frames: [
      {
        id: 'guide-enter',
        art: 'install',
        tint: '#f5c65c',
        heading: 'Вход',
        body: 'Откройте ссылку от тренера — и вы в своём кабинете, без пароля. '
          + 'Можно и самому: на экране входа укажите почту — придёт код. '
          + 'Выйти или удалить аккаунт — в меню.',
      },
      {
        id: 'guide-plan',
        art: 'schedule',
        tint: '#8ec0f5',
        heading: 'Программа — во вкладке «Тренировки»',
        body: 'Каждая тренировка месяца — свой блок с упражнениями, подходами '
          + 'и повторами. Суперсет стоит одной группой. Проведённая '
          + 'тренировка отмечается зелёным, «Посмотреть веса» открывает, '
          + 'что вы тогда записали.',
      },
      {
        id: 'guide-workout',
        art: 'effort',
        tint: '#7fd97f',
        heading: 'Тренировка в зале',
        body: 'Нажмите «Начать тренировку». Веса уже подставлены по прошлому '
          + 'разу, под подходом — что было тогда. Сделали подход — нажмите '
          + '«Легко», «Норм» или «Тяжело»: начнётся отдых, его можно свернуть. '
          + 'После последнего подхода — «Завершить» вверху, тренер увидит всё у себя.',
      },
      {
        id: 'guide-progress',
        art: 'progress',
        tint: '#c9a4f0',
        heading: 'Прогресс',
        body: 'Во вкладке «Прогресс» — замеры с графиком: «Записать замер» '
          + 'добавляет новый, хоть один показатель. Там же «Подключить шаги» — '
          + 'шаги из телефона и браслета придут сами, и тренировки с часов.',
        bodyIos: 'Во вкладке «Прогресс» — замеры с графиком: «Записать замер» '
          + 'добавляет новый, хоть один показатель. Там же «Подключить шаги» — '
          + 'шаги и тренировки из «Здоровья» с iPhone и Apple Watch придут сами.',
      },
      {
        id: 'guide-nutrition',
        art: 'nutrition',
        tint: '#f0a4a4',
        heading: 'Питание',
        body: 'Во вкладке «Питание» заполните анкету — приложение посчитает '
          + 'норму калорий и белка. «Собрать рацион»: отметьте, что есть дома, '
          + 'листайте блюда — день соберётся под вашу норму со списком покупок.',
      },
      {
        id: 'guide-watch',
        only: 'ios',
        art: 'watch',
        tint: '#8ec0f5',
        heading: 'Apple Watch',
        body: 'Поставьте Fit Track на часы из приложения Watch на iPhone. На '
          + 'часах выберите тренировку и ведите её с руки: вес колёсиком или '
          + 'барабаном, оценка подхода — кнопками, отдых и пульс — на экране. '
          + 'Работает и без связи: тренировка доедет потом.',
      },
    ],
  },
];

/**
 * Кадры под устройство: на iPhone — без кадров «только Android», не на
 * iPhone — без кадров «только iPhone» (Apple Watch), и с текстом
 * для iPhone там, где он свой (bodyIos). Один раз при загрузке: дальше лента
 * работает с готовым списком, как раньше.
 */
const IOS = detectBrowser().platform === 'ios';
TOPICS.forEach((topic) => {
  topic.frames = topic.frames
    .filter((frame) => !(IOS && frame.only === 'android') && !(!IOS && frame.only === 'ios'))
    .map((frame) => (IOS && frame.bodyIos ? { ...frame, body: frame.bodyIos } : frame));
});

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
        {frame.date && <p className="story__date">{frame.date}</p>}
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
