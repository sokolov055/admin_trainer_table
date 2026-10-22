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
// «Блины» (21.10.2026): три олимпийских блина катятся по желобу к помосту — цвета и вес как в игре
export function IconBliniGame({ size = 48 }) {
  const id = useId();
  const plate = (cx, cy, fill, ink, kg) => <g key={kg}><circle cx={cx} cy={cy + .8} r="7.6" fill="#0b231d" opacity=".45" /><circle cx={cx} cy={cy} r="7.6" fill={fill} /><circle cx={cx} cy={cy} r="5.2" fill="none" stroke="#ffffff" strokeOpacity=".3" /><text x={cx} y={cy + 2.3} textAnchor="middle" fontSize="6.4" fontWeight="800" fontFamily="Manrope, sans-serif" fill={ink}>{kg}</text></g>;
  return <svg className="game-menu-icon" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2b5a4e" /><stop offset="1" stopColor="#123630" /></linearGradient></defs>
    <rect width="48" height="48" rx="11.5" fill={`url(#${id})`} />
    <path d="M6 33c6-15 18-21 36-17" fill="none" stroke="#0e2a24" strokeWidth="11" strokeLinecap="round" />
    <rect x="33" y="31" width="10" height="10" rx="2" fill="#9c6a39" stroke="#5d3b1d" />
    {plate(11, 28, '#d8343f', '#fff', 25)}{plate(22, 20, '#2d6bd3', '#fff', 20)}{plate(34, 17, '#f1c232', '#3a2a00', 15)}
  </svg>;
}

/**
 * Игры в меню — один список на клиента (ClientApp.jsx) и владельца в
 * «Моих тренировках» (trainer/MyGames.jsx, 22.10.2026). Карьера связывает
 * игры сюжетом (FT-563).
 */
export const GAME_ITEMS = [
  { id: 'career', label: 'Карьера в фитнесе', note: 'От турника во дворе до своей сети клубов', Icon: IconCareerGame },
  { id: 'plank-game', label: 'Тренер в планке', note: 'Фитнес-викторина на 10 секунд', Icon: IconPlankGame },
  { id: 'scooter-game', label: 'На самокате до зала', note: 'Бесконечный заезд и рейтинг игроков', Icon: IconScooterGame },
  { id: 'match-game', label: 'Три в ряд', note: 'Собери свой лучший каскад', Icon: IconMatchGame },
  { id: 'blini-game', label: 'Блины', note: 'Не дай блинам докатиться до помоста', Icon: IconBliniGame },
];
