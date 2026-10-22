import React, { useId } from 'react';
import { FACE, LOBES, STEM } from './halloween-art.js';

/**
 * Тыква вместо «+» у палитры «Хэллоуин» (FT-702, просьба владельца
 * 22.10.2026): оранжевые дольки, зелёный хвостик, злое лицо горит изнутри
 * — то же, что у тыкв фона (halloween-art.js). Цветная картинка, а не
 * значок набора icons.jsx — поэтому отдельно. Ставит её ThemeMascot.jsx,
 * только у «Хэллоуина»; у остальных палитр остаётся плюс. Градиенты — со
 * своим id на каждый экземпляр: в скрытой копии они бы не нарисовались у
 * видимой.
 */
// tall — тыква выше, чем шире (кнопка в меню, просьба владельца): рисунок
// растягивается по высоте, лицо вместе с ним
export default function Pumpkin({ size = 52, tall = 1, className }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={Math.round(size * tall)} viewBox="0 0 52 52" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id + 'b'} cx="0.4" cy="0.34" r="0.8">
          <stop offset="0" stopColor="#ffa53a" />
          <stop offset="0.55" stopColor="#e86e0e" />
          <stop offset="1" stopColor="#9c3a08" />
        </radialGradient>
        <radialGradient id={id + 'f'} cx="0.5" cy="0.55" r="0.6">
          <stop offset="0" stopColor="#fff3c2" />
          <stop offset="0.55" stopColor="#ffd25a" />
          <stop offset="1" stopColor="#ffab2e" />
        </radialGradient>
      </defs>
      <g fill={`url(#${id}b)`} stroke="#7a2c05" strokeOpacity="0.5" strokeWidth="1">
        {LOBES.map(([cx, cy, rx, ry]) => <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} />)}
      </g>
      <path d={STEM} fill="#3f6a22" />
      <g fill={`url(#${id}f)`} stroke="#5a1e03" strokeOpacity="0.7" strokeWidth="0.7" strokeLinejoin="round">
        {[...FACE.eyes, FACE.nose, FACE.mouth].map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}
