import React from 'react';

/**
 * Набор иконок проекта.
 *
 * Рисованные, а не эмодзи. Эмодзи рендерятся по-разному в каждой ОС, несут
 * чужую цветовую гамму и ломают вертикальный ритм строки — это чужая
 * графика внутри интерфейса, а не его часть.
 *
 * Все иконки построены на одной сетке 24×24, с currentColor. Значит они
 * наследуют цвет текста, масштабируются размером шрифта и везде выглядят
 * как один комплект.
 *
 * Размеры — шкала 14 / 16 / 20 / 24 (в строке текста 14–16, в кнопке 20,
 * в таб-баре и плитках 22–24). Толщина — по размеру: до 16 px включительно
 * обводка 2 (1,75 на мелкой иконке выходила меньше пикселя и бледнела),
 * крупнее — 1,75. Явный strokeWidth сильнее. Своих наборов svg в экранах не
 * заводить — иконку добавить сюда (аудит 24.10.2026).
 */

const STROKE = 1.75;
const STROKE_SMALL = 2;

/** Толщина обводки по размеру иконки — и для своих svg на той же сетке */
export function iconStroke(size) {
  return Number(size) <= 16 ? STROKE_SMALL : STROKE;
}

function Icon({ children, size = 22, strokeWidth, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? iconStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------- Навигация клиента ---------- */

export const IconHome = (p) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.5 20v-6h5v6" />
  </Icon>
);

export const IconPlan = (p) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="17" rx="2.5" />
    <path d="M8.5 2.5v3M15.5 2.5v3" />
    <path d="M8 11h8M8 15.5h5" />
  </Icon>
);

export const IconHeart = (p) => (
  <Icon {...p}>
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
  </Icon>
);

export const IconCalendar = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
    <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" />
    <path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2" />
  </Icon>
);

export const IconProgress = (p) => (
  <Icon {...p}>
    <path d="M4 19h16" />
    <path d="M4 15.5 9 10l3.5 3.5L20 6" />
    <path d="M20 10V6h-4" />
  </Icon>
);

export const IconRuler = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="7.5" width="19" height="9" rx="2" />
    <path d="M7 7.5v3M11 7.5v4.5M15 7.5v3M19 7.5v4.5" />
  </Icon>
);

/** Напольные весы — «Вес» в быстрой записи */
export const IconScale = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M7.5 10a4.5 4.5 0 0 1 9 0" />
    <path d="m12 10 2-2.4" />
  </Icon>
);

/** Капля — вода в дневнике питания */
export const IconDrop = (p) => (
  <Icon {...p}>
    <path d="M12 3.5s6 6.6 6 10.9a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5Z" />
  </Icon>
);

export const IconNutrition = (p) => (
  <Icon {...p}>
    <path d="M12 8.5c0-2.5 1.8-4.5 4.5-4.5 0 2.6-1.9 4.5-4.5 4.5Z" />
    <path d="M12 8.5C9.6 7 6 8 5 11c-1.2 3.6 1.3 9 3.8 9 1 0 1.6-.5 3.2-.5s2.2.5 3.2.5c2.5 0 5-5.4 3.8-9-.5-1.4-1.6-2.4-2.9-2.8" />
  </Icon>
);

// Один человек — «Мои данные» в меню клиента: с двумя силуэтами (IconUsers)
// пункт было не отличить от «Семьи» (аудит 24.10.2026)
export const IconUser = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
  </Icon>
);

/* ---------- Навигация тренера ---------- */

export const IconUserPlus = (p) => (
  <Icon {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
    <path d="M18.5 7v6" />
    <path d="M15.5 10h6" />
  </Icon>
);

export const IconUsers = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
    <path d="M16.5 5.2a3.5 3.5 0 0 1 0 5.6" />
    <path d="M18 14.8c2.1.7 3.5 2.3 3.5 4.4" />
  </Icon>
);

export const IconMoney = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <circle cx="12" cy="12" r="2.75" />
    <path d="M6 9.5v5M18 9.5v5" />
  </Icon>
);

export const IconProcess = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
  </Icon>
);

export const IconDeparted = (p) => (
  <Icon {...p}>
    <path d="M14.5 3.5h3.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.5" />
    <path d="M10 8.5 13.5 12 10 15.5" />
    <path d="M13.5 12H3.5" />
  </Icon>
);

export const IconLog = (p) => (
  <Icon {...p}>
    <path d="M5 4.5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </Icon>
);

export const IconSheet = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10" />
  </Icon>
);

/**
 * Гамбургер: три линии того же шага, что и штрихи внутри остальных иконок,
 * иначе в шапке он выглядит жирнее соседей.
 */
export const IconMenu = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

/**
 * Настройки — ползунки, а не шестерёнка: шестерёнку в этом наборе уже
 * занимает «Процессы», и две одинаковые иконки в одном меню читались бы
 * как один и тот же раздел.
 */
export const IconSliders = (p) => (
  <Icon {...p}>
    <path d="M4 8h8.5M17.5 8h2.5" />
    <circle cx="15" cy="8" r="2.25" />
    <path d="M4 16h2.5M11.5 16h8.5" />
    <circle cx="9" cy="16" r="2.25" />
  </Icon>
);

/** Открытая книга — «Как пользоваться» */
/** «Оформление»: палитра художника — тема и персональные цвета */
export const IconPalette = (p) => (
  <Icon {...p}>
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8h2.1a3.7 3.7 0 0 0 3.7-3.7C20.5 6.9 16.7 3.5 12 3.5Z" />
    <circle cx="7.6" cy="11.6" r="1.1" />
    <circle cx="10.2" cy="7.6" r="1.1" />
    <circle cx="14.8" cy="7.9" r="1.1" />
  </Icon>
);

export const IconGuide = (p) => (
  <Icon {...p}>
    <path d="M12 6.5C10.4 5.2 8 4.6 4.5 4.8v12.4c3.5-.2 5.9.4 7.5 1.7 1.6-1.3 4-1.9 7.5-1.7V4.8c-3.5-.2-5.9.4-7.5 1.7Z" />
    <path d="M12 6.5v12.4" />
  </Icon>
);

/* ---------- Действия и состояния ---------- */

export const IconBack = (p) => (
  <Icon {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Icon>
);

export const IconSearch = (p) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </Icon>
);

/** Еда по фото (FT-744) — камера */
export const IconCamera = (p) => (
  <Icon {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

/** AI-сканер еды (FT-746) — рамка видоискателя с искрой */
export const IconScan = (p) => (
  <Icon {...p}>
    <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
    <path d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
  </Icon>
);

/** Штрихкод продукта (FT-744) */
export const IconBarcode = (p) => (
  <Icon {...p}>
    <path d="M4 6v12M8 6v12M11 6v12M15 6v12M18 6v12M20 6v12" />
  </Icon>
);

export const IconRefresh = (p) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 3.5V8h-4.5" />
  </Icon>
);

export const IconAlert = (p) => (
  <Icon {...p}>
    <path d="M12 3.5 21 19.5H3L12 3.5Z" />
    <path d="M12 9.5v4M12 16.5v.01" />
  </Icon>
);

export const IconCheck = (p) => (
  <Icon {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 7" />
  </Icon>
);

export const IconClose = (p) => (
  <Icon {...p}>
    <path d="M6 6 18 18M18 6 6 18" />
  </Icon>
);

export const IconKey = (p) => (
  <Icon {...p}>
    <circle cx="8" cy="15.5" r="4.5" />
    <path d="M11.4 12.6 20 4M17 7l2.5 2.5M14.5 9.5 17 12" />
  </Icon>
);

export const IconEmpty = (p) => (
  <Icon {...p}>
    <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
    <path d="M3.5 13.5 6 6.5a1.5 1.5 0 0 1 1.4-1h9.2a1.5 1.5 0 0 1 1.4 1l2.5 7v4a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3.5 17.5Z" />
  </Icon>
);

/** Часы — раздел «Часы» в турах (Help.jsx), тренировки с часов (WatchSuggest.jsx) */
export const IconWatch = (p) => (
  <Icon {...p}>
    <rect x="7" y="6" width="10" height="12" rx="3" />
    <path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 10v2l1.5 1" />
  </Icon>
);

export const IconPhone = (p) => (
  <Icon {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
  </Icon>
);

/** Глаз — «Глазами клиента» в шапке карточки (FT-613) */
export const IconEye = (p) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

/** Вопрос в круге — подсказка рядом с полем (FT-613) */
export const IconHelp = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 0 1 4.85.85c0 1.65-2.45 2.25-2.45 3.75" />
    <path d="M12 17h.01" />
  </Icon>
);

/**
 * Отправка — бумажный самолётик. Стоит на кнопке, которая уводит в
 * Telegram: рисуем движение наружу, а не логотип мессенджера, иначе
 * чужой фирменный знак оказался бы посреди нашего набора.
 */
export const IconSend = (p) => (
  <Icon {...p}>
    <path d="M20.5 3.5 10.5 13.5" />
    <path d="M20.5 3.5 14.2 20.5l-3.7-7-7-3.7 17-6.3Z" />
  </Icon>
);

export const IconMail = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);

export const IconLink = (p) => (
  <Icon {...p}>
    <path d="m9.5 14.5 5-5" />
    <path d="M7.2 17.8 5.7 19.3a3.5 3.5 0 0 1-5-5l3.6-3.6a3.5 3.5 0 0 1 5 0" transform="translate(3 -2)" />
    <path d="m16.8 6.2 1.5-1.5a3.5 3.5 0 0 1 5 5l-3.6 3.6a3.5 3.5 0 0 1-5 0" transform="translate(-3 2)" />
  </Icon>
);

/**
 * «Поделиться» в iOS — квадрат со стрелкой вверх. Стоит в инструкции по
 * установке: человек ищет глазами именно этот знак в панели Safari, и
 * нарисовать его точнее, чем описать словами.
 */
export const IconShare = (p) => (
  <Icon {...p}>
    <path d="M12 3.5v11" />
    <path d="m8.5 7 3.5-3.5L15.5 7" />
    <path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 18.5 11H17" />
  </Icon>
);

/** Выход наружу: стрелка, покидающая рамку. Кнопка «открыть в браузере» */
export const IconExternal = (p) => (
  <Icon {...p}>
    <path d="M14 4.5h5.5V10" />
    <path d="M19.5 4.5 11 13" />
    <path d="M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
  </Icon>
);

export const IconCopy = (p) => (
  <Icon {...p}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
);

/** Переставить выше / ниже — в редакторе программы */
export const IconArrowUp = (p) => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const IconPlus = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconMinus = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

/** «Начать» — занятие из быстрой записи */
export const IconPlay = (p) => (
  <Icon {...p}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
  </Icon>
);

/** Шеврон — «развернуть/свернуть»; поворачивается стилем */
export const IconChevron = (p) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const IconArrowDown = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

/** Ручка перетаскивания */
export const IconGrip = (p) => (
  <Icon {...p}>
    <path d="M5 9h14M5 15h14" />
  </Icon>
);

/** Суперсет: два упражнения сцеплены */
export const IconLinkPair = (p) => (
  <Icon {...p}>
    <path d="M9.5 14.5l5-5M8 11l-2 2a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
  </Icon>
);

/* ---------- Кардиотренажёры (карточка кардио, 17.11.2026) ---------- */

export const IconTreadmill = (p) => (
  <Icon {...p}>
    <path d="M3 17h13.5l3.5-2.5M5 17l-1.5 3M16 17l1.5 3M15.5 17V7.5L19 5" />
  </Icon>
);

export const IconSkillmill = (p) => (
  <Icon {...p}>
    <path d="M3 13.5c3.5 4 12.5 4 16 0M15.5 15.6V7.5L19 5M6 16.4 4.5 20M13 17l1 3" />
  </Icon>
);

export const IconRower = (p) => (
  <Icon {...p}>
    <path d="M2.5 18h19M6 18l3.5-5.5h6.5M19 18v-7M17 11h4" />
    <circle cx="13" cy="8" r="1.75" />
  </Icon>
);

export const IconElliptical = (p) => (
  <Icon {...p}>
    <ellipse cx="11" cy="16.5" rx="7" ry="2.5" />
    <path d="M14 14.2V5.5l3-2M11 14V9h-3" />
  </Icon>
);

export const IconBike = (p) => (
  <Icon {...p}>
    <circle cx="6" cy="16" r="3.5" />
    <circle cx="18" cy="16" r="3.5" />
    <path d="M6 16l4-7h5l3 7M10 9 8.5 6H6.5M15 9l1.5-3h2" />
  </Icon>
);

export const IconStepper = (p) => (
  <Icon {...p}>
    <path d="M3 20h5v-5h5v-5h5V5h3" />
  </Icon>
);

/** Выйти из суперсета: звено разорвано (редактор упражнений, 17.11.2026) */
export const IconUnlink = (p) => (
  <Icon {...p}>
    <path d="M13.5 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1M10.5 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1M4 4l16 16" />
  </Icon>
);

/** Заменить: две встречные стрелки */
export const IconSwap = (p) => (
  <Icon {...p}>
    <path d="M7 4L4 7l3 3M4 7h12M17 20l3-3-3-3M20 17H8" />
  </Icon>
);

export const IconTrash = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
  </Icon>
);

/**
 * Выход. Зеркало «Ушедших»: там человек уходит из списка, здесь — сам
 * закрывает кабинет. Развёрнут в другую сторону намеренно, чтобы две
 * иконки не читались как один и тот же пункт.
 */
export const IconExit = (p) => (
  <Icon {...p}>
    <path d="M9.5 3.5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3.5" />
    <path d="M16 8.5 19.5 12 16 15.5" />
    <path d="M19.5 12H9.5" />
  </Icon>
);

export const IconChart = (p) => (
  <Icon {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);

/** Стрелка изменения — вверх/вниз/без изменений, одним компонентом,
 *  чтобы дельта везде выглядела одинаково */
export function IconDelta({ value, size = 14, ...rest }) {
  if (value > 0) {
    return (
      <Icon size={size} {...rest}>
        <path d="M12 19V5M6 11l6-6 6 6" />
      </Icon>
    );
  }
  if (value < 0) {
    return (
      <Icon size={size} {...rest}>
        <path d="M12 5v14M6 13l6 6 6-6" />
      </Icon>
    );
  }
  return (
    <Icon size={size} {...rest}>
      <path d="M5 12h14" />
    </Icon>
  );
}

/** Три точки — «ещё»: редкие действия в меню, а не кнопками в шапке */
export const IconMore = (p) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="0.9" fill="currentColor" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" />
    <circle cx="19" cy="12" r="0.9" fill="currentColor" />
  </Icon>
);

/* Цели и факты программ в «Библиотеке» (17.11.2026) */

export const IconClock = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const IconFlame = (p) => (
  <Icon {...p}>
    <path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.5-4-6.5-4.5-10.5-2 1.5-3 3.5-3 5.5-1-.5-2-1.5-2.3-3C6.6 8.3 5.5 11 5.5 14.5A6.5 6.5 0 0 0 12 21Z" />
    <path d="M12 21a2.8 2.8 0 0 1-2.8-2.8c0-2 2.8-3.7 2.8-3.7s2.8 1.7 2.8 3.7A2.8 2.8 0 0 1 12 21Z" />
  </Icon>
);

export const IconDumbbell = (p) => (
  <Icon {...p}>
    <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
  </Icon>
);

export const IconBolt = (p) => (
  <Icon {...p}>
    <path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z" />
  </Icon>
);

export const IconWave = (p) => (
  <Icon {...p}>
    <path d="M2.5 12c2.3-4.5 4.5-4.5 6.5 0s4.2 4.5 6.5 0 4.2-4.5 6.5 0" />
  </Icon>
);

export const IconGem = (p) => (
  <Icon {...p}>
    <path d="M7 4h10l4 5.5L12 20.5 3 9.5z" />
    <path d="M3 9.5h18M9.5 4 12 9.5 14.5 4M12 9.5v11" />
  </Icon>
);

export const IconSpine = (p) => (
  <Icon {...p}>
    <rect x="9" y="2.5" width="6" height="3.5" rx="1.5" />
    <rect x="8.5" y="7.5" width="7" height="3.5" rx="1.5" />
    <rect x="8.5" y="12.5" width="7" height="3.5" rx="1.5" />
    <rect x="9" y="17.5" width="6" height="4" rx="1.5" />
  </Icon>
);

export const IconBandage = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)" />
    <path d="M10.5 10.5h.01M13.5 13.5h.01M13.5 10.5h.01M10.5 13.5h.01" />
  </Icon>
);

export const IconBench = (p) => (
  <Icon {...p}>
    <path d="M3 13h18M6 13v6M18 13v6M7 9.5h10M3.5 6.5v6M20.5 6.5v6" />
  </Icon>
);

/** Править — карандаш (экран программы, 17.11.2026) */
export const IconPen = (p) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

/** Список — тренировку из программы в «Тренировки» */
export const IconList = (p) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" />
  </Icon>
);

/** Собственный вес — человечек (плитки вида упражнения, 18.11.2026) */
export const IconBody = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="4.5" r="2" />
    <path d="M12 7v7M6.5 10l5.5-1 5.5 1M9 21l3-7 3 7" />
  </Icon>
);

/** Кардио — сердце с пульсом */
export const IconPulse = (p) => (
  <Icon {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
    <path d="M4.5 12.5h3.5l1.8-2.8 2.8 5.3 1.8-2.5h5" />
  </Icon>
);

/** Снежинка — пауза в тренировках (заморозка, src/pause/) */
export const IconSnow = (p) => (
  <Icon {...p}>
    <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5" />
    <path d="m9.5 4 2.5 2 2.5-2M9.5 20l2.5-2 2.5 2M4.2 10.4l3.1-.5-.7-3.1M19.8 13.6l-3.1.5.7 3.1M4.2 13.6l3.1.5-.7 3.1M19.8 10.4l-3.1-.5.7-3.1" />
  </Icon>
);
