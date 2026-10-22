import React, { useState } from 'react';

import GameShell from '../GameShell.jsx';
import CareerHub from '../CareerHub.jsx';
import PlankGame from '../PlankGame.jsx';
import ScooterGame from '../ScooterGame.jsx';
import MatchGame from '../MatchGame.jsx';
import BliniGame from '../BliniGame.jsx';
import { useCareer } from '../CareerSession.jsx';
import { GAME_ITEMS } from '../game-icons.jsx';
import { haptic } from '../telegram.js';

/**
 * Игры владельца в «Моих тренировках» (22.10.2026, просьба владельца:
 * «приходится заходить с клиентского профиля, чтобы поиграть»). Те же
 * игры и тот же список, что в меню клиента (GAME_ITEMS); рейтинг и
 * сохранение идут от карточки «Мои тренировки» (сервер — selfAsClient).
 * Игра в отдыхе — общая (RestLayer, App.jsx).
 */
const GAMES = {
  'plank-game': (props) => <PlankGame {...props} />,
  'scooter-game': (props) => <ScooterGame immersive {...props} />,
  'match-game': (props) => <MatchGame {...props} />,
  'blini-game': (props) => <BliniGame {...props} />,
};
const KIND = { 'plank-game': 'plank', 'scooter-game': 'scooter', 'match-game': 'match', 'blini-game': 'blini' };
const CAREER = { plank: 'plank-game', scooter: 'scooter-game', match: 'match-game', blini: 'blini-game' };

export default function MyGames() {
  const career = useCareer();
  // { id, career } — открытая игра; career — задание ступени, выход в «Карьеру»
  const [open, setOpen] = useState(null);
  const start = (id) => { haptic('light'); setOpen({ id, career: false }); };

  let shell = null;
  if (open && open.id === 'career') {
    shell = (
      <GameShell kind="career">
        <CareerHub onClose={() => { career.leave(); setOpen(null); }} onPlay={(game) => setOpen({ id: CAREER[game], career: true })} />
      </GameShell>
    );
  } else if (open && GAMES[open.id]) {
    const Game = GAMES[open.id];
    shell = (
      <GameShell kind={KIND[open.id]}>
        <Game career={open.career || undefined} onClose={() => setOpen(open.career ? { id: 'career', career: false } : null)} />
      </GameShell>
    );
  }

  return (
    <>
      <div className="menu__list my-games">
        {GAME_ITEMS.map(({ id, label, note, Icon }) => (
          <button key={id} type="button" className="menu__item menu__item--game" onClick={() => start(id)}>
            <span className="menu__icon"><Icon size={64} /></span>
            <span className="menu__text">
              <span className="menu__label">{label}</span>
              <span className="menu__note">{note}</span>
            </span>
          </button>
        ))}
      </div>
      {shell}
    </>
  );
}
