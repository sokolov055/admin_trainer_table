import React, { useId } from 'react';

/**
 * Тыква вместо «+» у палитры «Хэллоуин» (FT-702, просьба владельца
 * 22.10.2026): оранжевые дольки, зелёный хвостик, лицо горит изнутри.
 * Цветная картинка, а не значок набора icons.jsx — поэтому отдельно.
 * Показывает её CSS (tabbar-action.css, appearance.css) только при
 * data-palette='halloween': у остальных палитр остаётся плюс.
 * Градиенты — со своим id на каждый экземпляр: в скрытой копии они бы не
 * нарисовались у видимой.
 */
export default function Pumpkin({ size = 52, className }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id + 'b'} cx="0.4" cy="0.34" r="0.8">
          <stop offset="0" stopColor="#ffb24a" />
          <stop offset="0.55" stopColor="#f07a12" />
          <stop offset="1" stopColor="#b4440a" />
        </radialGradient>
        <radialGradient id={id + 'f'} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#fff6c4" />
          <stop offset="1" stopColor="#ffc23d" />
        </radialGradient>
      </defs>
      <g fill={`url(#${id}b)`} stroke="#8a3206" strokeOpacity="0.45" strokeWidth="1">
        <ellipse cx="14" cy="31" rx="11" ry="14" />
        <ellipse cx="38" cy="31" rx="11" ry="14" />
        <ellipse cx="20" cy="31" rx="10" ry="15.5" />
        <ellipse cx="32" cy="31" rx="10" ry="15.5" />
        <ellipse cx="26" cy="31" rx="8" ry="16" />
      </g>
      <path d="M24.5 16c.2-4 1-7 3.6-9.4l2 1.6c-2 2-2.6 4.6-2.4 8z" fill="#4f7a2a" />
      <g fill={`url(#${id}f)`} stroke="#7a2c05" strokeOpacity="0.5" strokeWidth="0.6" strokeLinejoin="round">
        <path d="M14.5 29 20.5 29 17.5 22.5z" />
        <path d="M31.5 29 37.5 29 34.5 22.5z" />
        <path d="M24.6 33 27.4 33 26 30.4z" />
        <path d="M12.5 35Q26 46 39.5 35L36.6 36.2 34.6 39.4 31.6 37 26 40.6 20.4 37 17.4 39.4 15.4 36.2z" />
      </g>
    </svg>
  );
}
