import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import BliniGame from '../../src/BliniGame.jsx';
import { BliniSessionProvider, useBliniSession } from '../../src/BliniSession.jsx';
import { MatchSessionProvider } from '../../src/MatchSession.jsx';
import { PlankSessionProvider } from '../../src/PlankSession.jsx';
import { RestScreen } from '../../src/RestScreen.jsx';
import { platePoint } from '../../src/blini-model.js';
import { setRestHere } from '../../src/rest-here.js';
import '../../src/game-shell.css';

function Fixture({ menu = true, rest = false, until = Infinity, now = Date.now(), allowed = true }) {
  const [, session] = useBliniSession();
  window.bliniFixture = {
    read: () => { const s = session.getSnapshot(); return { mode: s.mode, level: s.level, unlocked: s.unlocked, hud: s.hud, reason: s.reason, result: s.result, mission: s.mission }; },
    game: () => { const g = session.game(); return { tick: g.tick, shots: g.shots.length, fired: g.shotsFired, score: g.score, mode: g.mode, current: g.current, next: g.next, aim: g.aim, shooter: g.track.shooter, balls: g.chains.map(c => c.balls.filter(b => b.s >= 0).map(b => ({ color: b.color, ...platePoint(c, b) }))) }; },
    win: () => { const g = session.game(); g.score = g.rules.target; g.full = true; g.chains.forEach(c => { c.balls = []; }); },
    setRest: setRestHere,
  };
  return <>{menu && <main className="game-shell game-shell--blini"><BliniGame onClose={() => window.showBlini({ menu: false })} /></main>}{rest && <RestScreen until={until} total={30000} now={now} allowGame={allowed} onStop={() => window.showBlini({ menu: false })} />}</>;
}
const root = createRoot(document.getElementById('root'));
window.showBlini = (props = {}) => root.render(<BliniSessionProvider key={props.identity || 'client'} seed={props.seed ?? 42}><MatchSessionProvider><PlankSessionProvider><Fixture {...props} /></PlankSessionProvider></MatchSessionProvider></BliniSessionProvider>);
window.showBlini();
