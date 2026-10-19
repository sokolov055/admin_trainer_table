import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useMatchSession } from './MatchSession.jsx';
import { MATCH_TUNING, PIECES, POWER_NAMES, earnedStars, rowOf, colOf } from './match-model.js';
import { chapterFor, chapterProgress } from './match-story.js';
import { createMatchAudio } from './match-audio.js';
import { restHere, onRestHere } from './rest-here.js';
import { clock } from './workout-model.js';
import { IconBack, IconGuide, IconClose, IconCheck } from './icons.jsx';
import { useGameChrome, buzz, vibrationOn, setVibration } from './game-feel.js';
import { useMission, MissionNote } from './CareerMission.jsx';
import piecesUrl from './assets/match-pieces.png';
import gymUrl from './assets/match-gym.png';
import './match-game.css';

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

export default function MatchGame({ onClose, restLeft, restUntil = Infinity, career = false }) {
  const [state, session] = useMatchSession();
  const { game, mode, frame, selected, hint, busy, message, sound, serial } = state;
  const { mission, outcome, report } = useMission('match', career);
  const reported = useRef(null);
  // Задание карьеры — своя глава и правила, протеин даёт +3 хода; без задания — обычная история
  useLayoutEffect(() => {
    session.mission(mission ? { ...mission.goal, moves: mission.goal.moves + (mission.boost ? 3 : 0) } : null);
  }, [mission, session]);
  useEffect(() => {
    if (!mission || !state.rules || !['won', 'lost'].includes(mode) || reported.current === game) return;
    reported.current = game; report({ won: mode === 'won' });
  }, [mission, mode, game, state.rules, report]);
  const [help, setHelp] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [assets, setAssets] = useState('loading');
  const [soundError, setSoundError] = useState('');
  const [focusCell, setFocusCell] = useState(0);
  const [vibration, setVibrationState] = useState(vibrationOn);
  const token = useRef({});
  const felt = useRef({ serial, mode, selected });
  const audio = useRef(null);
  const deadline = useRef(restUntil); deadline.current = restUntil;
  const root = useRef(null), panel = useRef(null), primary = useRef(null), pointer = useRef(null);
  const title = useId(); const instructions = useId();
  const stars = earnedStars(game);
  const chapter = chapterFor(game.level);
  const progress = chapterProgress(game);
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

  useGameChrome(root);

  // Вибрация — по тем же кадрам, что и звук, и только у экрана, который ведёт партию
  useEffect(() => {
    const last = felt.current; felt.current = { serial, mode, selected };
    if (mode === 'paused' || session.owner() !== token.current) return;
    if (mode === 'won') { if (last.mode !== 'won') buzz('great'); return; }
    if (mode !== 'playing') return;
    if (serial !== last.serial && frame) {
      if (frame.kind === 'reject') buzz('bad');
      else if (frame.kind === 'swap') buzz('tap');
      else if (frame.kind === 'clear') buzz(frame.combo > 1 || frame.effects.length ? 'great' : 'good');
    } else if (selected != null && selected !== last.selected) buzz('tap');
  }, [serial, mode, selected, frame, session]);

  useEffect(() => {
    const animations = root.current?.querySelector('.match-board')?.getAnimations({ subtree: true }) || [];
    for (const animation of animations) {
      if (mode === 'paused') animation.pause();
      else if (mode === 'playing' && animation.playState === 'paused') animation.play();
    }
  }, [mode]);

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
    if (event.key === 'ArrowRight' && colOf(at) < MATCH_TUNING.size - 1) next++;
    else if (event.key === 'ArrowLeft' && colOf(at) > 0) next--;
    else if (event.key === 'ArrowDown' && rowOf(at) < MATCH_TUNING.size - 1) next += MATCH_TUNING.size;
    else if (event.key === 'ArrowUp' && rowOf(at) > 0) next -= MATCH_TUNING.size;
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
      const next = Math.abs(dx) > Math.abs(dy) ? p.at + Math.sign(dx) : p.at + MATCH_TUNING.size * Math.sign(dy);
      session.move(p.at, next, token.current);
    }
  };
  const panelKeys = event => {
    if (event.key === 'Escape') { event.preventDefault(); if (help) setHelp(false); else if (mode === 'playing') session.pause(); else if (mode === 'paused') resume(); }
    if (event.key !== 'Tab' || !shownPanel || !panel.current) return;
    const buttons = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    if (!buttons.length) return;
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const active = mode === 'playing' && !help && assets === 'ready';
  const clears = new Set(frame?.kind === 'clear' ? frame.cells : []);
  const sparkCells = frame?.kind === 'clear' ? frame.cells.filter((_, i) => i % Math.ceil(frame.cells.length / 24) === 0) : [];
  const powerText = power => power ? `, ${POWER_NAMES[power]}` : '';

  return <section className={`match-game match-game--${mode}`} aria-label="Три в ряд" data-no-gestures data-phase={mode} data-busy={busy} ref={root} onKeyDown={panelKeys}>
    <div className="match-scene">
      <header className="match-top">
        <button type="button" className="match-icon match-round" onClick={close} aria-label={mission ? 'К карьере' : restLeft == null ? 'Закрыть игру' : 'К отдыху'}><IconBack size={22} /></button>
        {restLeft != null && <div className="match-rest" title="Пора к подходу? Игра подождёт."><span>Отдых</span><strong role="timer">{clock(Math.max(0, restLeft))}</strong></div>}
        <span className="match-top__gap" />
        <button type="button" className="match-icon match-round" onClick={toggleSound} aria-label={sound ? 'Выключить звук' : 'Включить звук'} aria-pressed={sound}><Sound enabled={sound} /></button>
        <button type="button" className="match-icon match-round" onClick={() => session.pause()} disabled={!active} aria-label="Пауза"><span className="match-pause-icon" /></button>
      </header>
      <div className="match-hud">
        <div className={`match-moves${game.moves <= 3 ? ' is-low' : ''}`}><strong data-match="moves">{game.moves}</strong><span>{movesLabel(game.moves)}</span></div>
        <div className="match-score">
          <div className="match-score__numbers"><strong data-match="score" className={frame?.kind === 'clear' ? 'is-scoring' : ''} key={frame?.kind === 'clear' ? serial : 'score'}>{number(game.score)}</strong><span>{game.score >= game.target ? <><IconCheck size={15} /> Очки есть</> : `Очки ${number(game.target)}`}</span></div>
          <div className="match-progress" role="progressbar" aria-label="Очки до трёх звёзд" aria-valuenow={Math.min(game.score, game.target * 1.8)} aria-valuemin={0} aria-valuemax={game.target * 1.8}><span style={{ transform: `scaleX(${Math.min(1, game.score / (game.target * 1.8))})` }} /></div>
          <div className="match-stars" aria-label={`Звёзд: ${stars} из 3`}>{[1, 2, 3].map((n, i) => <Star key={n} filled={stars >= n} className={stars >= n ? 'is-earned' : ''} style={{ left: `${[55.56, 75, 100][i]}%` }} />)}</div>
        </div>
      </div>
      <div className={`match-quest${frame?.kind === 'clear' && (frame.storyGain || frame.reveals.length) ? ' is-progressing' : ''}`} key={frame?.kind === 'clear' && (frame.storyGain || frame.reveals.length) ? serial : 'quest'}>
        <Piece type={chapter.type} />
        <span><small>Задание</small><strong>{chapter.task}</strong></span>
        <div className="match-quest-progress"><b data-match="story-progress" aria-label={`${chapter.task}: ${progress.collected} из ${progress.required}`}>{progress.collected}<i> / {progress.required}</i></b><em data-match="covers-progress">Ящики {progress.uncovered}/{progress.coversRequired}</em></div>
      </div>
      <div className="match-stage">
      <div className="match-board-frame">
        <div className={`match-board match-board--${frame?.kind || 'idle'}`} role="group" aria-label={`Игровое поле ${MATCH_TUNING.size} на ${MATCH_TUNING.size}`} aria-describedby={instructions} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { pointer.current = null; }} onLostPointerCapture={() => { pointer.current = null; }}>
          <div className="match-sockets" aria-hidden="true">{Array.from({ length: MATCH_TUNING.size ** 2 }, (_, i) => <span key={i} className={(rowOf(i) + colOf(i)) % 2 ? 'is-alternate' : ''} />)}</div>
          {game.board.map((tile, at) => {
            const row = frame?.kind === 'drop-start' ? (frame.from[tile.id] ?? rowOf(at)) : rowOf(at);
            return <button type="button" key={tile.id} data-cell={at} data-type={tile.type} data-power={tile.power || ''}
              className={`match-tile${clears.has(at) ? ' is-clearing' : ''}${frame?.kind === 'reject' && (at === frame.a || at === frame.b) ? ' is-rejected' : ''}${frame?.kind === 'fall' && frame.from[tile.id] !== rowOf(at) ? ' is-falling' : ''}${selected === at ? ' is-selected' : ''}${hint?.includes(at) ? ' is-hint' : ''}`}
              style={{ transform: `translate(${colOf(at) * 100}%, ${row * 100}%)`, '--piece-color': PIECES[tile.type].color }}
              aria-label={`${rowOf(at) + 1} ряд, ${colOf(at) + 1} столбец: ${game.covers.includes(at) ? 'закрытая клетка' : PIECES[tile.type].name + powerText(tile.power)}`}
              aria-pressed={selected === at} aria-disabled={!active || busy || game.covers.includes(at)} tabIndex={active && at === focusCell ? 0 : -1}
              onKeyDown={key} onClick={event => { if (event.detail === 0) session.select(at, token.current); }}>
              <Piece type={tile.type} power={tile.power} />
            </button>;
          })}
          <div className="match-covers" aria-hidden="true">{[...game.covers, ...(frame?.kind === 'clear' ? frame.reveals : [])].map(at => <i key={at} className={`match-cover${frame?.kind === 'clear' && frame.reveals.includes(at) ? ' is-revealing' : ''}`} style={{ left: `${colOf(at) / MATCH_TUNING.size * 100}%`, top: `${rowOf(at) / MATCH_TUNING.size * 100}%` }}><span>?</span></i>)}</div>
          {frame?.kind === 'clear' && <div className="match-fx" key={serial} aria-hidden="true">
            {frame.cells.map(at => <i key={`ring-${at}`} className="match-burst-ring" style={{ left: `${(colOf(at) + .5) / MATCH_TUNING.size * 100}%`, top: `${(rowOf(at) + .5) / MATCH_TUNING.size * 100}%`, '--burst-color': PIECES[game.board[at].type].color }} />)}
            {sparkCells.flatMap(at => [0, 1, 2, 3, 4, 5].map(k => <i key={`${at}-${k}`} className="match-spark" style={{ left: `${(colOf(at) + .5) / MATCH_TUNING.size * 100}%`, top: `${(rowOf(at) + .5) / MATCH_TUNING.size * 100}%`, '--dx': `${[25,-25,12,-12,22,-22][k]}px`, '--dy': `${[-23,-20,28,27,6,8][k]}px`, background: PIECES[game.board[at].type].color }} />))}
            {frame.effects.filter(e => e.power === 'row' || e.power === 'col').map(e => <i key={e.at} className={`match-beam match-beam--${e.power}`} style={e.power === 'row' ? { top: `${(rowOf(e.at) + .5) / MATCH_TUNING.size * 100}%` } : { left: `${(colOf(e.at) + .5) / MATCH_TUNING.size * 100}%` }} />)}
            {frame.effects.filter(e => e.power === 'burst' || e.power === 'color').map(e => <i key={`power-${e.at}`} className="match-power-wave" style={{ left: `${(colOf(e.at) + .5) / MATCH_TUNING.size * 100}%`, top: `${(rowOf(e.at) + .5) / MATCH_TUNING.size * 100}%` }} />)}
          </div>}
        </div>
        {frame?.kind === 'clear' && active && <div className="match-combo" key={serial} aria-hidden="true"><strong>{frame.combo > 1 ? `Каскад ×${frame.combo}` : frame.effects.length ? 'ЗАРЯД!' : frame.creations.length ? 'Суперзаряд!' : 'Попадание!'}</strong><span>+{frame.points}</span></div>}
      </div>
      </div>
      <div className={`match-feedback${message === chapter.halfway ? ' match-feedback--story' : ''}`} role="status" aria-live="polite">{message === chapter.halfway && <strong>Тренер</strong>}{soundError || message || 'Собирай тройки. Лови каскады.'}</div>
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
          <p>Поменяй соседние предметы местами. Собирай очки и {chapter.task.toLowerCase()}. Тройка рядом с закрытой клеткой открывает ящик. Открой {chapter.coverGoal} ящиков.</p>
          <div className="match-rules">
            <div><Piece type={0} /><span><strong>3 в ряд</strong>Очки и цепочки совпадений</span></div>
            <div><Piece type={1} power="row" /><span><strong>4 в ряд</strong>Собери заряд в тройку, чтобы убрать целую линию</span></div>
            <div><Piece type={3} power="color" /><span><strong>5 в ряд</strong>Поменяй с любым предметом, чтобы убрать весь его цвет</span></div>
            <div><Piece type={4} power="burst" /><span><strong>Т или Г</strong>Взрыв убирает квадрат 3×3</span></div>
          </div>
          <p className="match-panel__fine">Соедини два бонуса для двойного эффекта. Неверный обмен не тратит ход.</p>
          <button className="match-primary" ref={primary} onClick={() => { setHelp(false); if (mode === 'paused') resume(); }}>Понятно</button>
        </> : mode === 'ready' ? <>
          <div className="match-story-intro"><div className="match-story-portrait" aria-hidden="true" /><div><span>{chapter.place}</span><h3 id={title}>{chapter.title}</h3><p>{chapter.intro}</p></div></div>
          <MissionNote game="match" mission={mission} />
          <div className="match-mission match-mission--story"><span>{game.moves} {movesLabel(game.moves)}</span><span>{number(game.target)} очков</span><span><Piece type={chapter.type} /> ×{progress.required}</span><span>Ящики ×{chapter.coverGoal}</span></div>
          <button className="match-primary" ref={primary} disabled={assets !== 'ready'} onClick={() => start(game.level)}>{assets === 'ready' ? 'Играть' : 'Готовим поле…'}</button>
          <button className="match-secondary" onClick={openHelp}>Как играть</button>
        </> : mode === 'paused' ? <>
          <div className="match-panel-mark"><span className="match-pause-icon" /></div>
          <h3 id={title}>{state.reason === 'rest' ? 'Пора к подходу' : 'Можно выдохнуть'}</h3>
          <p>{state.reason === 'rest' ? 'Поле и ходы сохранены. Продолжим на следующем отдыхе.' : 'Твои комбинации подождут. Продолжишь с того же места.'}</p>
          <p className="match-story-pause">{chapter.task}: {progress.collected}/{progress.required} · Ящики: {progress.uncovered}/{progress.coversRequired}</p>
          <div className="match-mission"><span>{game.moves} {movesLabel(game.moves)}</span><span><strong>{number(game.score)}</strong> очков</span></div>
          <label className="match-toggle"><input type="checkbox" checked={vibration} onChange={event => { setVibration(event.target.checked); setVibrationState(event.target.checked); if (event.target.checked) buzz('tap'); }} />Вибрация</label>
          <button className="match-primary" ref={primary} disabled={assets !== 'ready'} onClick={resume}>{assets === 'ready' ? 'Продолжить игру' : 'Готовим поле…'}</button>
          <button className="match-secondary" onClick={close}>{mission ? 'Вернуться в карьеру' : `Вернуться ${restLeft == null ? 'в приложение' : 'к отдыху'}`}</button>
        </> : <>
          <div className="match-result-stars">{[1, 2, 3].map(n => <Star key={n} filled={stars >= n} className={stars >= n ? 'is-earned' : ''} />)}</div>
          <span className="match-story-chapter">{chapter.place}</span>
          <h3 id={title}>{mode === 'won' ? (game.level === 3 ? 'Рекорд взят!' : chapter.title + ' — готово!') : 'Попробуем ещё раз?'}</h3>
          <p>{mode === 'won' ? chapter.won : `${chapter.lost} ${game.score < game.target ? `До цели по очкам — ${number(game.target - game.score)}.` : ''}`}</p>
          <div className="match-result-score"><strong>{number(game.score)}</strong><span>очков за партию</span></div>
          <p className="match-result-quest">{chapter.task}: {progress.collected}/{progress.required} · Ящики: {progress.uncovered}/{progress.coversRequired}</p>
          <p className="match-panel__fine">Лучший каскад ×{Math.max(1, game.bestCombo)}</p>
          <MissionNote game="match" mission={mission} outcome={outcome} />
          {mission ? <button className="match-primary" ref={primary} onClick={() => mode === 'won' ? close() : start(game.level)}>{mode === 'won' ? 'К карьере' : 'Повторить задание'}</button>
            : <button className="match-primary" ref={primary} onClick={() => mode === 'won' ? session.prepare(game.level < 3 ? game.level + 1 : 1, token.current) : start(game.level)}>{mode === 'won' ? (game.level < 3 ? 'Следующая глава' : 'Начать историю заново') : 'Повторить главу'}</button>}
          {mission && mode === 'won' ? <button className="match-secondary" onClick={() => start(game.level)}>Сыграть ещё раз</button>
            : <button className="match-secondary" onClick={close}>{mission ? 'Вернуться в карьеру' : `Вернуться ${restLeft == null ? 'в приложение' : 'к отдыху'}`}</button>}
          {mode === 'won' && <div className="match-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--x': `${(i * 29 + 5) % 100}%`, '--delay': `${i * 35}ms`, '--turn': `${i * 47}deg`, background: PIECES[i % 6].color }} />)}</div>}
        </>}
      </div>
    </div>}
  </section>;
}
