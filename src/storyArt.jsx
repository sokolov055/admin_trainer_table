import React from 'react';

/**
 * ==========================================================================
 * Картинки для сторис
 *
 * Рисованный SVG, а не фотографии и не эмодзи: набор значков в приложении
 * уже нарисован одной толщиной линии, и картинка в сторис принадлежит тому
 * же набору — иначе кадр выглядит вставленным из другого приложения.
 *
 * Каждая картинка показывает ровно то, о чём кадр, и показывает это
 * настоящей формой: у расписания — календарь с выбранным днём и часом, у
 * питания — кольцо с долями Б/Ж/У, у прогресса — линия замеров, которая
 * идёт вниз. Абстрактных пятен «в тему» здесь нет: если картинка не
 * повторяет смысл текста, она только отнимает у него место.
 *
 * Цвет у каждой свой, но из той же проверенной палитры, что и данные в
 * приложении, — через переменную --tint, которую задаёт кадр. Остальное
 * рисуется currentColor, то есть цветом текста кадра: одна картинка
 * работает и на тёмной поверхности, и на любой другой.
 * ==========================================================================
 */

const STROKE = 1.6;

/** Общая рамка: одна система координат и одна толщина линии на все картинки */
function Art({ children, label }) {
  return (
    <svg
      className="story-art"
      viewBox="0 0 320 180"
      role="img"
      aria-label={label}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/**
 * Расписание: месяц, в нём выбранный день, и час под ним.
 *
 * Час вынесен из сетки и стоит отдельной строкой снизу: это ответ на
 * вопрос, а не ещё одна клетка календаря. Рядом с сеткой он налезал на
 * неё и читался как надпись на полях.
 */
export function ArtSchedule() {
  const COLS = 5;
  const CELL_W = 22;
  const STEP_X = 30;
  const X0 = 74;

  const cells = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (row === 1 && col === 2) continue;
      cells.push(
        <rect
          key={row + ':' + col}
          x={X0 + col * STEP_X}
          y={62 + row * 24}
          width={CELL_W} height={15} rx={4}
          stroke="none"
          fill="currentColor"
          opacity={0.14}
        />
      );
    }
  }

  return (
    <Art label="Календарь с выбранным днём и временем занятия">
      {/* карточка месяца */}
      <rect x={60} y={20} width={200} height={104} rx={14} opacity={0.32} />
      <path d="M60 48h200" opacity={0.32} />
      <path d="M100 12v14M220 12v14" opacity={0.55} />

      {cells}

      {/* выбранный день */}
      <rect x={X0 + 2 * STEP_X} y={86} width={CELL_W} height={15} rx={4}
        stroke="none" fill="var(--tint)" />

      {/* час занятия — под календарём, на одной оси с выбранным днём */}
      <path d={'M' + (X0 + 2 * STEP_X + CELL_W / 2) + ' 101v29'}
        stroke="var(--tint)" opacity={0.45} strokeDasharray="3 5" />
      <rect x={110} y={132} width={100} height={36} rx={12}
        fill="var(--tint)" fillOpacity={0.16} stroke="var(--tint)" strokeOpacity={0.8} />
      <text
        x={160} y={156}
        textAnchor="middle"
        fill="var(--tint)"
        stroke="none"
        fontSize={17}
        fontWeight={640}
        letterSpacing="-0.01em"
      >
        10:00
      </text>
    </Art>
  );
}

/**
 * Питание: кольцо из трёх долей — белки, жиры, углеводы — и норма в центре.
 * Доли разной длины, как в жизни, а не по трети каждая: ровное кольцо
 * читалось бы как заглушка.
 */
export function ArtNutrition() {
  // Окружность радиусом 52: длина 326,7. Доли 40 / 25 / 35 процентов.
  const R = 52;
  const LEN = 2 * Math.PI * R;
  const parts = [
    { share: 0.40, color: 'var(--tint)', opacity: 1 },
    { share: 0.25, color: 'currentColor', opacity: 0.5 },
    { share: 0.35, color: 'currentColor', opacity: 0.22 },
  ];

  let offset = 0;
  const arcs = parts.map((p, i) => {
    const len = LEN * p.share - 6;
    const el = (
      <circle
        key={i}
        cx={104} cy={90} r={R}
        stroke={p.color}
        strokeOpacity={p.opacity}
        strokeWidth={11}
        strokeDasharray={len + ' ' + (LEN - len)}
        strokeDashoffset={-offset}
        transform="rotate(-90 104 90)"
      />
    );
    offset += LEN * p.share;
    return el;
  });

  return (
    <Art label="Кольцо с долями белков, жиров и углеводов и дневной нормой">
      {arcs}
      <text
        x={104} y={86}
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize={24}
        fontWeight={680}
        letterSpacing="-0.02em"
      >
        1850
      </text>
      <text
        x={104} y={106}
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        opacity={0.6}
        fontSize={12}
      >
        ккал
      </text>

      {/* легенда: подпись у доли, а не рядом с цветным квадратиком */}
      {[
        { y: 56, label: 'Белки', value: '140 г', color: 'var(--tint)', op: 1 },
        { y: 90, label: 'Жиры', value: '62 г', color: 'currentColor', op: 0.5 },
        { y: 124, label: 'Углеводы', value: '190 г', color: 'currentColor', op: 0.22 },
      ].map((row) => (
        <g key={row.label}>
          <rect x={186} y={row.y - 9} width={10} height={10} rx={3}
            fill={row.color} fillOpacity={row.op} stroke="none" />
          <text x={204} y={row.y} fill="currentColor" stroke="none" fontSize={13} opacity={0.75}>
            {row.label}
          </text>
          <text x={296} y={row.y} textAnchor="end" fill="currentColor" stroke="none"
            fontSize={13} fontWeight={600}>
            {row.value}
          </text>
        </g>
      ))}
    </Art>
  );
}

/**
 * Прогресс: сантиметровая лента, обёрнутая вокруг, и насколько ушло.
 *
 * Не диаграмма: осей и сетки здесь нет намеренно. График с подписанными
 * величинами человек увидит в самом разделе, а кадру нужна картинка,
 * которая читается за полсекунды и говорит «замеры», а не «отчётность».
 * Лента повторяет значок замеров в приложении — человек его уже видел.
 */
export function ArtProgress() {
  const CX = 160;
  const CY = 92;
  const RX = 92;
  const RY = 46;

  // Деления печатаются по ленте, каждое пятое длиннее — как на настоящей
  const ticks = [];
  const COUNT = 44;
  for (let i = 0; i < COUNT; i += 1) {
    const t = (i / COUNT) * Math.PI * 2;
    const long = i % 5 === 0;
    const depth = long ? 8 : 4.5;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    ticks.push(
      <path
        key={i}
        d={'M' + (CX + RX * cos).toFixed(1) + ' ' + (CY + RY * sin).toFixed(1)
          + 'L' + (CX + (RX - depth) * cos).toFixed(1) + ' ' + (CY + (RY - depth) * sin).toFixed(1)}
        stroke="currentColor"
        strokeWidth={1.2}
        opacity={long ? 0.55 : 0.3}
      />
    );
  }

  return (
    <Art label="Сантиметровая лента и результат: минус пять с половиной килограммов">
      {/* лента */}
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY}
        stroke="var(--tint)" strokeWidth={13} opacity={0.85} />
      {ticks}

      {/* хвост ленты с язычком — он и делает из кольца именно сантиметр */}
      <path d="M232 124c26 10 40 18 44 30" stroke="var(--tint)" strokeWidth={13}
        opacity={0.85} strokeLinecap="round" />
      <rect x={268} y={150} width={22} height={16} rx={4}
        fill="var(--tint)" stroke="none" opacity={0.85} />

      {/* единственное число на картинке */}
      <text x={CX} y={86} textAnchor="middle" fill="currentColor" stroke="none"
        fontSize={27} fontWeight={680} letterSpacing="-0.02em">
        −5,5
      </text>
      <text x={CX} y={108} textAnchor="middle" fill="currentColor" stroke="none"
        fontSize={13} opacity={0.6}>
        килограмма
      </text>
    </Art>
  );
}

/**
 * Установка: телефон, а на нём домашний экран с нашей иконкой среди прочих.
 *
 * Показываем результат, а не процесс: человеку нужно понять, что получится,
 * а как туда дойти — в гиде. Пальца и стрелок здесь нет: в мелком масштабе
 * они читаются как грязь на картинке, а не как подсказка.
 */
export function ArtInstall() {
  const X0 = 102;
  const Y0 = 46;
  const STEP = 40;
  const TILE = 32;

  const tiles = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (row === 1 && col === 1) continue;
      tiles.push(
        <rect
          key={row + ':' + col}
          x={X0 + col * STEP} y={Y0 + row * STEP}
          width={TILE} height={TILE} rx={9}
          fill="currentColor" fillOpacity={0.13} stroke="none"
        />
      );
    }
  }

  const iconX = X0 + STEP;
  const iconY = Y0 + STEP;

  return (
    <Art label="Телефон: иконка приложения на домашнем экране">
      <rect x={84} y={10} width={152} height={160} rx={22} opacity={0.4} />
      <path d="M144 22h32" opacity={0.5} />

      {tiles}

      {/* наша иконка: та же гантель, что и на значке приложения */}
      <rect x={iconX} y={iconY} width={TILE} height={TILE} rx={9}
        fill="var(--tint)" stroke="none" />
      <g stroke="var(--story-bg)" strokeWidth={2.2} strokeLinecap="round">
        <path d={'M' + (iconX + 8) + ' ' + (iconY + 16) + 'h16'} />
        <path d={'M' + (iconX + 7) + ' ' + (iconY + 11) + 'v10'} />
        <path d={'M' + (iconX + 25) + ' ' + (iconY + 11) + 'v10'} />
      </g>
    </Art>
  );
}

/**
 * Гид: страница инструкции и ключ, которым в неё входят.
 * Ключ повторяет значок входа в приложении — человек уже видел его на
 * экране запуска, и здесь узнаёт.
 */
export function ArtGuide() {
  return (
    <Art label="Страница инструкции и ключ входа">
      <rect x={58} y={24} width={150} height={132} rx={12} opacity={0.35} />

      <rect x={78} y={44} width={74} height={9} rx={4}
        fill="var(--tint)" stroke="none" />

      {[68, 84, 100, 116, 132].map((y, i) => (
        <rect key={y} x={78} y={y} width={i % 2 ? 110 : 84} height={6} rx={3}
          fill="currentColor" fillOpacity={0.16} stroke="none" />
      ))}

      {/* ключ поверх угла страницы: инструкция и вход — одно и то же место */}
      <g transform="translate(196 84)">
        <circle cx={0} cy={0} r={15} stroke="var(--tint)" strokeWidth={2.2} />
        <path d="M13 -7 L44 -38" stroke="var(--tint)" strokeWidth={2.2} />
        <path d="M34 -28l8 8M40 -34l8 8" stroke="var(--tint)" strokeWidth={2.2} />
      </g>
    </Art>
  );
}

/**
 * Темп питания: три варианта нормы, выбран средний.
 *
 * Полоски разной длины — это калории: чем быстрее темп, тем короче.
 * Отмечен средний, а не самый короткий, и в этом весь смысл кадра: раньше
 * человек получал край шкалы, не зная, что у него есть выбор.
 */
export function ArtPace() {
  const rows = [
    { w: 196, active: false },
    { w: 168, active: true },
    { w: 140, active: false },
  ];

  return (
    <Art label="Три варианта нормы, выбран средний">
      {rows.map((row, i) => {
        const y = 26 + i * 48;
        const cy = y + 17;

        return (
          <g key={i}>
            {row.active ? (
              <g>
                <circle cx={52} cy={cy} r={10} fill="var(--tint)" stroke="none" />
                <path d={'M47.5 ' + cy + 'l3.2 3.4 6-6.6'} stroke="var(--story-bg)" strokeWidth={2} />
              </g>
            ) : (
              <circle cx={52} cy={cy} r={10} opacity={0.35} />
            )}

            <rect
              x={76} y={y} width={row.w} height={34} rx={11}
              fill={row.active ? 'var(--tint)' : 'currentColor'}
              fillOpacity={row.active ? 0.22 : 0.1}
              stroke={row.active ? 'var(--tint)' : 'none'}
              strokeOpacity={0.8}
            />
          </g>
        );
      })}
    </Art>
  );
}

/* ==========================================================================
 * Обложки кружков
 *
 * Кружок с тонким значком читался как кнопка настроек: такое не открывают.
 * Обложка занимает всю плитку и говорит «здесь история», прежде чем человек
 * успел прочитать подпись, — тем же приёмом, что и полка историй в банке
 * или мессенджере.
 *
 * Рисуем, а не фотографируем. Фотография потребовала бы файла, веса и
 * повода каждый раз, а рисунок наследует ту же палитру и ту же руку, что и
 * остальное приложение.
 *
 * preserveAspectRatio="slice": обложка обрезается по краям, но никогда не
 * оставляет пустого поля — плитка обязана быть залита целиком при любой
 * ширине экрана.
 * ========================================================================== */

/**
 * Обложка темы «Что нового».
 *
 * Композиция собрана так, чтобы нижняя треть осталась почти пустой: там
 * лежит подпись, и картинка не должна с ней спорить. Главный предмет —
 * карточка приложения — стоит выше и чуть повёрнут, от этого плитка
 * перестаёт выглядеть плоской заливкой.
 *
 * Цвета ярче, чем в остальном интерфейсе, и это намеренно: полка историй
 * стоит над спокойным экраном и обязана быть заметнее его. Внутри самой
 * истории всё возвращается к обычной палитре.
 */
export function CoverRelease() {
  return (
    <svg
      className="stories__art"
      viewBox="0 0 200 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="cover-release" x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#5b8cff" />
          <stop offset="0.55" stopColor="#4a63e8" />
          <stop offset="1" stopColor="#6a3fd0" />
        </linearGradient>

        <radialGradient id="cover-release-glow" cx="0.22" cy="0.16" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="cover-release-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8edff" />
        </linearGradient>
      </defs>

      <rect width="200" height="200" fill="url(#cover-release)" />
      <rect width="200" height="200" fill="url(#cover-release-glow)" />

      {/* карточка приложения: то, про что вся история */}
      <g transform="rotate(-9 124 92)">
        <rect x="92" y="28" width="76" height="112" rx="18"
          fill="#0f1836" fillOpacity="0.18" transform="translate(3 5)" />
        <rect x="92" y="28" width="76" height="112" rx="18" fill="url(#cover-release-screen)" />

        {/* содержимое экрана: крупная цифра и строки — узнаваемый обзор */}
        <rect x="104" y="44" width="34" height="7" rx="3.5" fill="#4a63e8" fillOpacity="0.3" />
        <rect x="104" y="58" width="52" height="13" rx="5" fill="#4a63e8" fillOpacity="0.85" />
        <rect x="104" y="80" width="44" height="6" rx="3" fill="#0f1836" fillOpacity="0.14" />
        <rect x="104" y="92" width="52" height="6" rx="3" fill="#0f1836" fillOpacity="0.14" />
        <rect x="104" y="104" width="30" height="6" rx="3" fill="#0f1836" fillOpacity="0.14" />

        {/* гантель — тот же знак, что на иконке приложения */}
        <g stroke="#4a63e8" strokeWidth="2.6" strokeLinecap="round" opacity="0.9">
          <path d="M106 124h18" />
          <path d="M105 119.5v9M125 119.5v9" />
        </g>
      </g>

      {/* вспышка: «появилось новое» */}
      <path
        d="M48 42c3 15.6 8.7 21.3 24.3 24.3C56.7 69.3 51 75 48 90.6 45 75 39.3 69.3 23.7 66.3 39.3 63.3 45 57.6 48 42Z"
        fill="#ffffff"
        fillOpacity="0.95"
      />
      <path
        d="M34 108c1.5 8 4.4 10.9 12.4 12.4-8 1.5-10.9 4.4-12.4 12.4-1.5-8-4.4-10.9-12.4-12.4 8-1.5 10.9-4.4 12.4-12.4Z"
        fill="#ffffff"
        fillOpacity="0.6"
      />

      {/* россыпь: воздух вокруг предмета, а не узор */}
      <g fill="#ffffff">
        <circle cx="176" cy="46" r="3.4" fillOpacity="0.55" />
        <circle cx="166" cy="168" r="4.6" fillOpacity="0.35" />
        <circle cx="70" cy="150" r="2.8" fillOpacity="0.4" />
      </g>
    </svg>
  );
}

export const COVERS = {
  release: CoverRelease,
};

export const ART = {
  schedule: ArtSchedule,
  nutrition: ArtNutrition,
  progress: ArtProgress,
  install: ArtInstall,
  guide: ArtGuide,
  pace: ArtPace,
};
