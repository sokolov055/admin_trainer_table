import React, { useEffect, useId, useRef, useState } from 'react';
import { useMatchSession } from './MatchSession.jsx';
import { PIECES, POWER_NAMES, earnedStars, rowOf, colOf } from './match-model.js';
import { createMatchAudio } from './match-audio.js';
import { restHere, onRestHere } from './rest-here.js';
import { clock } from './workout-model.js';
import { IconBack, IconGuide, IconClose, IconCheck } from './icons.jsx';
import piecesUrl from './assets/match-pieces.png';
import gymUrl from './assets/match-gym.png';
import './match-game.css';

const LEVELS = ['Разминка', 'В потоке', 'На максимум'];
const number = value => value.toLocaleString('ru-RU');
const movesLabel = value => value === 1 ? 'ход' : value >= 2 && value <= 4 ? 'хода' : 'ходов';
function Star({ filled = true, ...props }) {
  return <svg viewBox="0 0 40 40" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}><path d="m20 3 5.1 10.5 11.6 1.7-8.4 8.2 2 11.6L20 29.5 9.7 35l2-11.6-8.4-8.2 11.6-1.7Z" /></svg>;
}
function Sound({ enabled }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" />{enabled ? <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 5 6m0-6-5 6" />}</svg>;
}
function Piece({ type, power, className = '' }) {
  return <span className={`match-piece match-piece--${type} ${className}`} aria-hidden="true">
    <span className="match-piece__art" />
    {power && <span className={`match-power match-power--${power}`}><span /></span>}
  </span>;
}

export default function MatchGame({ onClose, restLeft, restUntil = Infinity }) {
  const [state, session] = useMatchSession();
  const { game, mode, frame, selected, hint, busy, message, sound, serial } = state;
  const [help, setHelp] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [assets, setAssets] = useState('loading');
  const [soundError, setSoundError] = useState('');
  const [focusCell, setFocusCell] = useState(0);
  const token = useRef({});
  const audio = useRef(null);
  const deadline = useRef(restUntil); deadline.current = restUntil;
  const root = useRef(null), panel = useRef(null), primary = useRef(null), pointer = useRef(null);
  const title = useId(); const instructions = useId();
  const stars = earnedStars(game);
  const shownPanel = help || mode !== 'playing';

  useEffect(() => {
    let alive = true;
    setAssets('loading');
    const load = src => new Promise((resolve, reject) => {
      const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = src;
    });
    Promise.all([load(piecesUrl), load(gymUrl)]).then(() => { if (alive) setAssets('ready'); }).catch(error => {
      console.warn('Не удалось загрузить рисунки игры', error);
      if (alive) setAssets('error');
    });
    return () => { alive = false; };
  }, [loadAttempt]);

  useEffect(() => {
    const isExpired = () => Date.now() >= Math.min(deadline.current, restHere()?.until ?? Infinity);
    const release = session.claim(token.current, isExpired);
    const pause = reason => { if (session.owner() === token.current) session.pause(reason); };
    const hidden = () => { if (document.hidden) pause('background'); };
    const blur = () => pause('background');
    const checkRest = () => { if (isExpired()) pause('rest'); };
    const unsubscribe = onRestHere(checkRest);
    const timer = setInterval(checkRest, 200);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur); window.addEventListener('pagehide', blur);
    audio.current = createMatchAudio();
    return () => {
      release(); clearInterval(timer); unsubscribe();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur); window.removeEventListener('pagehide', blur);
      audio.current?.close(); audio.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!sound || mode === 'paused' || session.owner() !== token.current) { audio.current?.stop(); return; }
    if (mode === 'playing' && frame?.kind === 'clear') audio.current?.play(frame.combo);
    if (mode === 'won') audio.current?.play(1, true);
  }, [serial, mode, sound, session]);

  useEffect(() => {
    if (session.owner() !== token.current) return;
    if (shownPanel) primary.current?.focus({ preventScroll: true });
    else root.current?.querySelector(`[data-cell="${focusCell}"]`)?.focus({ preventScroll: true });
  }, [mode, help]);

  const close = () => { session.pause('exit'); onClose?.(); };
  const openHelp = () => { session.pause('help'); setHelp(true); };
  const toggleSound = async () => {
    if (!sound) {
      const enabled = await audio.current?.unlock();
      if (!enabled) { setSoundError('Звук недоступен. Можно играть без него.'); return; }
    }
    setSoundError(''); session.toggleSound();
  };
  const start = level => { if (sound) audio.current?.unlock(); session.start(level, token.current); };
  const resume = () => { if (sound) audio.current?.unlock(); session.resume(token.current); };
  const key = event => {
    const at = Number(event.currentTarget.dataset.cell);
    let next = at;
    if (event.key === 'ArrowRight' && colOf(at) < 5) next++;
    else if (event.key === 'ArrowLeft' && colOf(at) > 0) next--;
    else if (event.key === 'ArrowDown' && rowOf(at) < 5) next += 6;
    else if (event.key === 'ArrowUp' && rowOf(at) > 0) next -= 6;
    else return;
    event.preventDefault();
    if (event.shiftKey) session.move(at, next, token.current);
    setFocusCell(next); root.current.querySelector(`[data-cell="${next}"]`)?.focus({ preventScroll: true });
  };
  const down = event => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0) || pointer.current || busy || mode !== 'playing') return;
    const cell = event.target.closest('[data-cell]'); if (!cell) return;
    pointer.current = { id: event.pointerId, at: Number(cell.dataset.cell), x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const up = event => {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    pointer.current = null;
    const dx = event.clientX - p.x, dy = event.clientY - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) { session.select(p.at, token.current); setFocusCell(p.at); }
    else {
      const next = Math.abs(dx) > Math.abs(dy) ? p.at + Math.sign(dx) : p.at + 6 * Math.sign(dy);
      session.move(p.at, next, token.current);
    }
  };
  const panelKeys = event => {
    if (event.key === 'Escape') { event.preventDefault(); if (help) setHelp(false); else if (mode === 'playing') session.pause(); else if (mode === 'paused') resume(); }
    if (event.key !== 'Tab' || !shownPanel || !panel.current) return;
    const buttons = [...panel.current.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const active = mode === 'playing' && !help && assets === 'ready';
  const clears = new Set(frame?.kind === 'clear' ? frame.cells : []);
  const powerText = power => power ? `, ${POWER_NAMES[power]}` : '';

  return <section className={`match-game match-game--${mode}`} aria-label="Три в ряд" data-no-gestures data-phase={mode} data-busy={busy} ref={root} onKeyDown={panelKeys}>
    <header className="match-toolbar">
      <button type="button" className="match-icon" onClick={close} aria-label={restLeft == null ? 'Закрыть игру' : 'К отдыху'}><IconBack size={20} /></button>
      <span>Три в ряд</span>
      <button type="button" className="match-icon" onClick={toggleSound} aria-label={sound ? 'Выключить звук' : 'Включить звук'} aria-pressed={sound}><Sound enabled={sound} /></button>
      <button type="button" className="match-icon" onClick={() => session.pause()} disabled={!active} aria-label="Пауза"><span className="match-pause-icon" /></button>
    </header>
    {restLeft != null && <div className="match-rest"><span>Отдых</span><strong role="timer">{clock(Math.max(0, restLeft))}</strong><span>Пора к подходу? Игра подождёт.</span></div>}
    <div className="match-scene">
      <div className="match-brand"><h2>В форме!</h2><span>{LEVELS[game.level - 1]}</span></div>
      <div className="match-hud">
        <div className={`match-moves${game.moves <= 3 ? ' is-low' : ''}`}><strong data-match="moves">{game.moves}</strong><span>{movesLabel(game.moves)}</span></div>
        <div className="match-score">
          <div className="match-score__numbers"><strong data-match="score">{number(game.score)}</strong><span>{game.score >= game.target ? <><IconCheck size={15} /> Цель взята</> : `Цель ${number(game.target)}`}</span></div>
          <div className="match-progress" role="progressbar" aria-label="Очки до трёх звёзд" aria-valuenow={Math.min(game.score, game.target * 1.8)} aria-valuemin={0} aria-valuemax={game.target * 1.8}><span style={{ transform: `scaleX(${Math.min(1, game.score / (game.target * 1.8))})` }} /></div>
          <div className="match-stars" aria-label={`Звёзд: ${stars} из 3`}>{[1, 2, 3].map((n, i) => <Star key={n} filled={stars >= n} className={stars >= n ? 'is-earned' : ''} style={{ left: `${[55.56, 75, 100][i]}%` }} />)}</div>
        </div>
      </div>
      <div className="match-board-frame">
        <div className={`match-board match-board--${frame?.kind || 'idle'}`} role="group" aria-label="Игровое поле 6 на 6" aria-describedby={instructions} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { pointer.current = null; }} onLostPointerCapture={() => { pointer.current = null; }}>
          <div className="match-sockets" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <span key={i} className={(rowOf(i) + colOf(i)) % 2 ? 'is-alternate' : ''} />)}</div>
          {game.board.map((tile, at) => {
            const row = frame?.kind === 'drop-start' ? (frame.from[tile.id] ?? rowOf(at)) : rowOf(at);
            return <button type="button" key={tile.id} data-cell={at} data-type={tile.type} data-power={tile.power || ''}
              className={`match-tile${clears.has(at) ? ' is-clearing' : ''}${selected === at ? ' is-selected' : ''}${hint?.includes(at) ? ' is-hint' : ''}`}
              style={{ transform: `translate(${colOf(at) * 100}%, ${row * 100}%)`, '--piece-color': PIECES[tile.type].color }}
              aria-label={`${rowOf(at) + 1} ряд, ${colOf(at) + 1} столбец: ${PIECES[tile.type].name}${powerText(tile.power)}`}
              aria-pressed={selected === at} aria-disabled={!active || busy} tabIndex={active && at === focusCell ? 0 : -1}
              onKeyDown={key} onClick={event => { if (event.detail === 0) session.select(at, token.current); }}>
              <Piece type={tile.type} power={tile.power} />
            </button>;
          })}
          {frame?.kind === 'clear' && <div className="match-fx" key={serial} aria-hidden="true">
            {frame.cells.flatMap(at => [0, 1, 2, 3].map(k => <i key={`${at}-${k}`} className="match-spark" style={{ left: `${(colOf(at) + .5) / 6 * 100}%`, top: `${(rowOf(at) + .5) / 6 * 100}%`, '--dx': `${[18,-23,14,-9][k]}px`, '--dy': `${[-24,-12,23,26][k]}px`, background: PIECES[game.board[at].type].color }} />))}
            {frame.effects.filter(e => e.power === 'row' || e.power === 'col').map(e => <i key={e.at} className={`match-beam match-beam--${e.power}`} style={e.power === 'row' ? { top: `${(rowOf(e.at) + .5) / 6 * 100}%` } : { left: `${(colOf(e.at) + .5) / 6 * 100}%` }} />)}
          </div>}
        </div>
        {frame?.kind === 'clear' && active && <div className="match-combo" key={serial} aria-hidden="true"><strong>{frame.combo > 1 ? `Каскад ×${frame.combo}` : frame.creations.length ? 'Супер!' : 'Отлично!'}</strong><span>+{frame.points}</span></div>}
      </div>
      <div className="match-feedback" role="status" aria-live="polite">{soundError || message || 'Собирай тройки. Лови каскады.'}</div>
      <footer className="match-footer">
        <button type="button" onClick={() => session.hint(token.current)} disabled={!active || busy}><svg className="match-hint-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.7 9a2.5 2.5 0 1 1 3.6 2.2c-.9.5-1.3 1-1.3 2.3M12 17h.01" /></svg>Подсказка</button>
        <button type="button" onClick={openHelp}><IconGuide size={19} />Как играть</button>
      </footer>
      <p id={instructions} className="match-sr">Меняй соседние предметы свайпом или двумя касаниями. Клавиатура: стрелки для выбора клетки, пробел для выбора предмета; Shift со стрелкой для обмена.</p>
    </div>
    {shownPanel && <div className="match-overlay">
      <div className={`match-panel${mode === 'won' && !help ? ' match-panel--win' : ''}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={title}>
        <button className="match-panel-close match-icon" onClick={() => help ? setHelp(false) : close()} aria-label={help ? 'Закрыть правила' : 'Выйти из игры'}><IconClose size={18} /></button>
        {assets === 'error' ? <>
          <h3 id={title}>Загрузим рисунки?</h3>
          <p role="alert">Не загрузились рисунки. Проверь подключение и попробуй ещё раз. Партия сохранена.</p>
          <button className="match-primary" ref={primary} onClick={() => setLoadAttempt(x => x + 1)}>Загрузить ещё раз</button>
        </> : help ? <>
          <h3 id={title}>Собирай и заряжай</h3>
          <p>Поменяй соседние предметы местами. Три одинаковых исчезнут, новые упадут сверху.</p>
          <div className="match-rules">
            <div><Piece type={0} /><span><strong>3 в ряд</strong>Очки и цепочки совпадений</span></div>
            <div><Piece type={1} power="row" /><span><strong>4 в ряд</strong>Собери заряд в тройку, чтобы убрать целую линию</span></div>
            <div><Piece type={3} power="color" /><span><strong>5 в ряд</strong>Поменяй с любым предметом, чтобы убрать весь его цвет</span></div>
            <div><Piece type={4} power="burst" /><span><strong>Т или Г</strong>Взрыв убирает квадрат 3×3</span></div>
          </div>
          <p className="match-panel__fine">Соедини два бонуса для двойного эффекта. Неверный обмен не тратит ход.</p>
          <button className="match-primary" ref={primary} onClick={() => { setHelp(false); if (mode === 'paused') resume(); }}>Понятно</button>
        </> : mode === 'ready' ? <>
          <div className="match-cover-pieces"><Piece type={0} /><Piece type={3} /><Piece type={4} /></div>
          <h3 id={title}>Собери свой<br />лучший каскад</h3>
          <p>Снаряды, фрукты и немного магии совпадений. Двенадцать ходов, чтобы быть в форме.</p>
          <div className="match-mission"><span>12 ходов</span><span>Цель <strong>{number(game.target)}</strong></span></div>
          <button className="match-primary" ref={primary} disabled={assets !== 'ready'} onClick={() => start(1)}>{assets === 'ready' ? 'Играть' : 'Готовим поле…'}</button>
          <button className="match-secondary" onClick={openHelp}>Как играть</button>
        </> : mode === 'paused' ? <>
          <div className="match-panel-mark"><span className="match-pause-icon" /></div>
          <h3 id={title}>{state.reason === 'rest' ? 'Пора к подходу' : 'Можно выдохнуть'}</h3>
          <p>{state.reason === 'rest' ? 'Поле и ходы сохранены. Продолжим на следующем отдыхе.' : 'Твои комбинации подождут. Продолжишь с того же места.'}</p>
          <div className="match-mission"><span>{game.moves} {movesLabel(game.moves)}</span><span><strong>{number(game.score)}</strong> очков</span></div>
          <button className="match-primary" ref={primary} disabled={assets !== 'ready'} onClick={resume}>{assets === 'ready' ? 'Продолжить игру' : 'Готовим поле…'}</button>
          <button className="match-secondary" onClick={close}>Вернуться {restLeft == null ? 'в приложение' : 'к отдыху'}</button>
        </> : <>
          <div className="match-result-stars">{[1, 2, 3].map(n => <Star key={n} filled={stars >= n} className={stars >= n ? 'is-earned' : ''} />)}</div>
          <h3 id={title}>{mode === 'won' ? (stars === 3 ? 'Вот это форма!' : 'Отличная форма!') : 'Ещё один подход?'}</h3>
          <p>{mode === 'won' ? 'Цель взята. Красивые комбинации идут тебе.' : `До цели не хватило ${number(game.target - game.score)} очков. Попробуй собрать четыре в ряд и запустить бонус.`}</p>
          <div className="match-result-score"><strong>{number(game.score)}</strong><span>очков за партию</span></div>
          <p className="match-panel__fine">Лучший каскад ×{Math.max(1, game.bestCombo)}</p>
          <button className="match-primary" ref={primary} onClick={() => start(mode === 'won' ? Math.min(3, game.level + 1) : game.level)}>{mode === 'won' && game.level < 3 ? 'Следующий раунд' : 'Играть ещё'}</button>
          <button className="match-secondary" onClick={close}>Вернуться {restLeft == null ? 'в приложение' : 'к отдыху'}</button>
          {mode === 'won' && <div className="match-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--x': `${(i * 29 + 5) % 100}%`, '--delay': `${i * 35}ms`, '--turn': `${i * 47}deg`, background: PIECES[i % 6].color }} />)}</div>}
        </>}
      </div>
    </div>}
  </section>;
}
