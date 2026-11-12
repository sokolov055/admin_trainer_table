import React, { createContext } from 'react';
import { GAME_ITEMS } from '../game-icons.jsx';

/**
 * «Ещё → Игры» (владелец, 11.11.2026): пять игр одним пунктом меню, список —
 * здесь. Тот же вид пунктов, что в меню (client-menu.css), чтобы картинки
 * игр выглядели как раньше. Сюда же ведёт «Игры» после завершения тренировки
 * (GamesNav в Workout.jsx): на отдыхе игр больше нет.
 */
export const GAMES_HUB = {
  id: 'games',
  label: 'Игры',
  note: 'Карьера, викторина, самокат, три в ряд, блины',
  Icon: GAME_ITEMS.find((g) => g.id === 'match-game').Icon,
  game: true,
};

/** Открыть «Игры» из глубины экранов; null — некуда (тренер, нет доступа к играм) */
export const GamesNav = createContext(null);

export default function GamesHub({ onOpen }) {
  return (
    <div className="menu__list client-menu games-hub">
      {GAME_ITEMS.map(({ id, label, note, Icon }) => (
        <button key={id} type="button" className="menu__item menu__item--game" onClick={() => onOpen(id)}>
          <span className="menu__icon"><Icon size={44} /></span>
          <span className="menu__text">
            <span className="menu__label">{label}</span>
            <span className="menu__note">{note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
