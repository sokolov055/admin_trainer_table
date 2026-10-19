import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import MatchGame from '../../src/MatchGame.jsx';
import { MatchSessionProvider, useMatchSession } from '../../src/MatchSession.jsx';
import { PlankSessionProvider } from '../../src/PlankSession.jsx';
import { RestScreen } from '../../src/RestScreen.jsx';
import { chooseMove } from '../match-policy.mjs';
import { legalMoves } from '../../src/match-model.js';
import { setRestHere } from '../../src/rest-here.js';
import '../../src/game-shell.css';
import '../../src/match-preview.css';

function Fixture({ menu = true, rest = false, until = Infinity, now = Date.now(), allowed = true }) {
  const [state, session] = useMatchSession();
  window.matchFixture = {
    read: () => structuredClone(session.getSnapshot()),
    move: (strategy = 'greedy') => chooseMove(session.getSnapshot().game.board, strategy, session.getSnapshot().game.turns, session.getSnapshot().game.covers),
    legal: () => legalMoves(session.getSnapshot().game.board, session.getSnapshot().game.covers),
    setRest: setRestHere,
  };
  return <>{menu && <main className="game-shell game-shell--match"><MatchGame onClose={() => window.showMatch({ menu: false })} /></main>}{rest && <RestScreen until={until} total={30000} now={now} allowGame={allowed} onStop={() => window.showMatch({ menu: false })} />}</>;
}
const root = createRoot(document.getElementById('root'));
window.showMatch = (props = {}) => root.render(<MatchSessionProvider key={props.identity || 'client'} seed={props.seed ?? 42}><PlankSessionProvider><Fixture {...props} /></PlankSessionProvider></MatchSessionProvider>);
window.showMatch();
