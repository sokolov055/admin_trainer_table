import React from 'react';
import plank from './assets/game-plank-icon-v3.png';
import scooter from './assets/game-scooter-icon-v3.png';
import match from './assets/game-match-icon-v3.png';
function GameIcon({ src, size = 48 }) {
  return <img className="game-menu-icon" src={src} width={size} height={size} style={{ borderRadius: '24%', objectFit: 'cover', flexShrink: 0 }} alt="" aria-hidden="true" decoding="async" />;
}
export const IconPlankGame = ({ size }) => <GameIcon src={plank} size={size} />;
export const IconScooterGame = ({ size }) => <GameIcon src={scooter} size={size} />;
export const IconMatchGame = ({ size }) => <GameIcon src={match} size={size} />;
