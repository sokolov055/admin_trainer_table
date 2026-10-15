import React from 'react';

/**
 * Разделы анкеты сверху — значками в кружках, соединёнными линией, как у
 * ONLYFITS: пройденный — галочка, текущий — обведён, следующие — бледные.
 * Общая для регистрации (LoginScreen.jsx) и анкеты (Onboarding.jsx), чтобы
 * счёт шёл без разрыва: регистрация — первый раздел.
 */

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const GLYPH = {
  account: <><circle cx="10" cy="7" r="3.2" {...P} /><path d="M4 17c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" {...P} /></>,
  body: <><circle cx="10" cy="4.5" r="2" {...P} /><path d="M10 7.5v6M6 9.5h8M8 18l2-4.5 2 4.5" {...P} /></>,
  activity: <path d="M10 2.5c.6 2.8 4.5 4.6 4.5 8.6A4.5 4.5 0 0 1 5.5 11c0-1.8.9-3 1.8-3.8.2 1.4 1 2.2 1.8 2.4C8.9 7.4 9.4 4.6 10 2.5z" {...P} />,
  goal: <><circle cx="10" cy="10" r="7" {...P} /><circle cx="10" cy="10" r="3.5" {...P} /><circle cx="10" cy="10" r=".6" fill="currentColor" stroke="currentColor" /></>,
  training: <><path d="M3 10h14" {...P} /><path d="M5 6.5v7M15 6.5v7M2.5 8.5v3M17.5 8.5v3" {...P} /></>,
  plan: <><path d="M5 3.5h10v13H5z" {...P} /><path d="M7.5 8l1.5 1.5L12.5 6M7.5 13h5" {...P} /></>,
  check: <path d="M5 10.5l3.2 3L15 6.5" {...P} strokeWidth="2.4" />,
};

export default function StageBar({ stages, current, label }) {
  return (
    <ol className="stagebar" aria-label={label + ': ' + stages[current].label + ', раздел ' + (current + 1) + ' из ' + stages.length}>
      {stages.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'next';
        return (
          <li key={s.id} className={'stagebar__item is-' + state} aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className="stagebar__line" aria-hidden="true" />}
            <span className="stagebar__dot" title={s.label}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">{GLYPH[state === 'done' ? 'check' : s.id]}</svg>
            </span>
            <span className="stagebar__sr">{s.label}{state === 'done' ? ' — готово' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}
