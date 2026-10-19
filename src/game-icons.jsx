import React, { useId } from 'react';
import plank from './assets/game-plank-icon-v3.png';
import scooter from './assets/game-scooter-icon-v3.png';
import match from './assets/game-match-icon-v3.png';
function GameIcon({ src, size = 48 }) {
  return <img className="game-menu-icon" src={src} width={size} height={size} style={{ borderRadius: '24%', objectFit: 'cover', flexShrink: 0 }} alt="" aria-hidden="true" decoding="async" />;
}
export const IconPlankGame = ({ size }) => <GameIcon src={plank} size={size} />;
export const IconScooterGame = ({ size }) => <GameIcon src={scooter} size={size} />;
export const IconMatchGame = ({ size }) => <GameIcon src={match} size={size} />;
// Карьера (FT-563): ступени к флагу на вершине — в цветах игр, без отдельного растра
export function IconCareerGame({ size = 48 }) {
  const id = useId();
  return <svg className="game-menu-icon" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3f9a5a" /><stop offset="1" stopColor="#173c34" /></linearGradient></defs>
    <rect width="48" height="48" rx="11.5" fill={`url(#${id})`} />
    <path d="M8 38h9v-7h8v-7h8v-7h7v21z" fill="#d3ff85" />
    <path d="M8 38h9v-7h8v-7h8v-7h7" fill="none" stroke="#fffdf2" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M36.5 17V6.5" stroke="#fffdf2" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M37 6.5h7l-2.2 3 2.2 3h-7z" fill="#f2b33d" />
    <circle cx="12.5" cy="33.5" r="2.6" fill="#fffdf2" />
  </svg>;
}
