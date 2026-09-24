import React from 'react';

/**
 * Набор иконок проекта.
 *
 * Рисованные, а не эмодзи. Эмодзи рендерятся по-разному в каждой ОС, несут
 * чужую цветовую гамму и ломают вертикальный ритм строки — это чужая
 * графика внутри интерфейса, а не его часть.
 *
 * Все иконки построены на одной сетке 24×24, обводкой одной толщины,
 * с currentColor. Значит они наследуют цвет текста, масштабируются
 * размером шрифта и везде выглядят как один комплект.
 */

const STROKE = 1.75;

function Icon({ children, size = 22, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
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

export const IconNutrition = (p) => (
  <Icon {...p}>
    <path d="M12 8.5c0-2.5 1.8-4.5 4.5-4.5 0 2.6-1.9 4.5-4.5 4.5Z" />
    <path d="M12 8.5C9.6 7 6 8 5 11c-1.2 3.6 1.3 9 3.8 9 1 0 1.6-.5 3.2-.5s2.2.5 3.2.5c2.5 0 5-5.4 3.8-9-.5-1.4-1.6-2.4-2.9-2.8" />
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

export const IconPhone = (p) => (
  <Icon {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 18.5h3" />
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
