import React from 'react';

/**
 * Картинки к вариантам анкеты (FT-577). У ONLYFITS картинка объясняет
 * выбор: отдых — при базовом обмене, движение — при активности. Здесь тот
 * же приём своими средствами: линейные рисунки на сетке 64×64 той же
 * толщиной, что иконки приложения, с акцентом на главном. Цвет — от темы,
 * поэтому рисунки одинаково читаются в светлой и тёмной.
 */

const A = 'var(--accent-solid)';

const ART = {
  lose: <>
    <rect x="9" y="28" width="46" height="28" rx="8" />
    <path d="M22 38a10 10 0 0 1 20 0" />
    <path d="M32 38l4-6" />
    <path d="M50 6v15M45 16l5 5 5-5" stroke={A} />
  </>,
  fitness: <>
    <path d="M32 54S10 41 10 25a11 11 0 0 1 22-3 11 11 0 0 1 22 3c0 16-22 29-22 29z" />
    <path d="M14 32h10l4-8 6 15 4-7h12" stroke={A} />
  </>,
  strength: <>
    <path d="M6 32h52" />
    <rect x="12" y="20" width="6" height="24" rx="2" fill={A} stroke={A} />
    <rect x="46" y="20" width="6" height="24" rx="2" fill={A} stroke={A} />
    <rect x="18" y="25" width="4" height="14" rx="1.5" />
    <rect x="42" y="25" width="4" height="14" rx="1.5" />
  </>,
  muscle: <>
    <path d="M16 46l20-20" />
    <rect x="6" y="40" width="14" height="10" rx="3" transform="rotate(-45 13 45)" />
    <rect x="32" y="14" width="14" height="10" rx="3" transform="rotate(-45 39 19)" />
    <path d="M44 56V40M38 46l6-6 6 6" stroke={A} />
  </>,
  desk: <>
    <rect x="16" y="10" width="32" height="22" rx="3" />
    <path d="M32 32v8M25 40h14M8 48h48M14 48v8M50 48v8" />
    <path d="M23 21h10" stroke={A} />
  </>,
  feet: <>
    <path d="M14 44V30a4 4 0 0 1 4-4h10l8 6 14 4a7 7 0 0 1 6 7v3H14z" />
    <path d="M14 50h42M27 30l3 4M32 32l2 3" />
    <path d="M4 32h6M2 38h8M5 44h5" stroke={A} />
  </>,
  labor: <>
    <path d="M12 26l20-10 20 10v22L32 58 12 48z" />
    <path d="M12 26l20 10 20-10M32 36v22" />
    <path d="M22 21l20 10v8" stroke={A} />
  </>,
  beginner: <Bars filled={1} />,
  regular: <Bars filled={2} />,
  experienced: <Bars filled={3} />,
  gym: <>
    <path d="M24 22a8 8 0 0 1 16 0" />
    <path d="M22 22h20" />
    <path d="M18 40a14 14 0 1 0 28 0 14 14 0 0 0-28 0z" />
    <path d="M26 42h12" stroke={A} />
  </>,
  home: <>
    <path d="M10 30L32 12l22 18" />
    <path d="M16 26v28h32V26" />
    <path d="M22 48h20" stroke={A} />
    <rect x="22" y="44" width="20" height="4" rx="2" fill={A} stroke={A} />
  </>,
  m: <>
    <circle cx="27" cy="37" r="13" />
    <path d="M37 27l14-14M40 13h11v11" stroke={A} />
  </>,
  f: <>
    <circle cx="32" cy="25" r="13" />
    <path d="M32 38v18M24 48h16" stroke={A} />
  </>,
};

function Bars({ filled }) {
  return [0, 1, 2].map((i) => {
    const h = 14 + i * 12;
    const on = i < filled;
    return <rect key={i} x={12 + i * 15} y={52 - h} width="10" height={h} rx="3" fill={on ? A : 'none'} stroke={on ? A : 'currentColor'} />;
  });
}

/** Неделя точками: сколько тренировок — столько закрашено, с отдыхом между */
const SPREAD = { 2: [1, 4], 3: [0, 2, 4], 4: [0, 1, 3, 5] };
export function WeekArt({ days, size = 64 }) {
  const on = SPREAD[days] || [];
  return (
    <svg className="ob-art" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const x = 8 + (i % 4) * 16;
        const y = i < 4 ? 22 : 42;
        return <circle key={i} cx={i < 4 ? x : x + 8} cy={y} r="5.5" fill={on.includes(i) ? A : 'none'} stroke={on.includes(i) ? A : 'currentColor'} strokeWidth="2" />;
      })}
    </svg>
  );
}

export default function Art({ name, size = 64 }) {
  if (typeof name === 'number') return <WeekArt days={name} size={size} />;
  const art = ART[name];
  if (!art) return null;
  return (
    <svg className="ob-art" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor"
      strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {art}
    </svg>
  );
}
