import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useBliniSession } from './BliniSession.jsx';
import { LEVELS, PLATES, POWERS, levelRules, missionRules } from './blini-model.js';
import { FIELD, TRACKS } from './blini-tracks.js';
import { createFx, addEvents, drawScene } from './blini-draw.js';
import { createBliniAudio } from './blini-audio.js';
import { restHere, onRestHere } from './rest-here.js';
import { clock } from './workout-model.js';
import { IconBack, IconGuide, IconClose, IconCheck } from './icons.jsx';
import { useGameChrome, buzz, vibrationOn, setVibration } from './game-feel.js';
import { useMission, MissionNote } from './CareerMission.jsx';
import './blini-game.css';

const kg = value => value.toLocaleString('ru-RU') + ' кг';
const seconds = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const colorsLabel = n => n + ' ' + (n === 1 ? 'цвет' : n >= 2 && n <= 4 ? 'цвета' : 'цветов');

function Sound({ enabled }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" />{enabled ? <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /> : <path d="m16 9 5 6m0-6-5 6" />}</svg>;
}
/** Блин в подписях и правилах — тот же цвет и вес, что на поле. */
export function Plate({ color, small = false }) {
  const p = PLATES[color];
  return <span className={'blini-plate' + (small ? ' blini-plate--small' : '')} style={{ '--plate': p.color, '--ink': p.ink }} aria-hidden="true">{p.kg}</span>;
}
function PowerMark({ power }) {
  return <span className="blini-power" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {power === 'drop' && <path d="M6 2.6v5.8M3.4 5.8 6 8.8l2.6-3" />}
    {power === 'negative' && <path d="M8.8 6H3.4M5.8 3.4 3.2 6l2.6 2.6" />}
    {power === 'pause' && <path d="M4.4 3.4v5.2M7.6 3.4v5.2" />}
    {power === 'technique' && <><circle cx="6" cy="6" r="2.4" /><path d="M6 1.8v8.4M1.8 6h8.4" /></>}
  </svg></span>;
}

/**
 * «Блины» (21.10.2026): цепочка олимпийских блинов катится к помосту,
 * стойка в центре бросает блины. Три одного цвета подряд снимаются.
 * Правила — blini-model.js, рисование — blini-draw.js, партия — blini-session.js.
 */
export default function BliniGame({ onClose, restLeft, restUntil = Infinity, career = false }) {
  const [state, session] = useBliniSession();
  const { mode, hud, level, unlocked, result, sound, reason, serial } = state;
  const { mission, outcome, report } = useMission('blini', career);
  const reported = useRef(null);
  // Задание карьеры — свой уровень и план, пояс — одна страховка; без задания — свободная игра
  useLayoutEffect(() => {
    session.mission(mission ? { goal: mission.goal, boost: !!mission.boost } : null);
  }, [mission, session]);
  useEffect(() => {
    if (!mission || !state.mission || !['won', 'lost'].includes(mode) || reported.current === serial) return;
    reported.current = serial; report({ won: mode === 'won' });
  }, [mission, mode, serial, state.mission, report]);

  const [help, setHelp] = useState(false);
  const [soundError, setSoundError] = useState('');
  const [vibration, setVibrationState] = useState(vibrationOn);
  const token = useRef({});
  const audio = useRef(null);
  const fx = useRef(createFx());
  const aiming = useRef(false);
  const deadline = useRef(restUntil); deadline.current = restUntil;
  const root = useRef(null), stage = useRef(null), canvas = useRef(null), panel = useRef(null), primary = useRef(null);
  const view = useRef({ scale: 1, dpr: 1 });
  const soundOn = useRef(sound); soundOn.current = sound;
  const title = useId();
  const reduced = useRef(false);
  const rules = state.mission ? missionRules(state.mission.goal, state.mission.boost) : levelRules(level);
  const track = TRACKS[rules.track];
  const shownPanel = help || mode !== 'playing';

  useEffect(() => {
    reduced.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const isExpired = () => Date.now() >= Math.min(deadline.current, restHere()?.until ?? Infinity);
    const release = session.claim(token.current, isExpired);
    const pause = why => { if (session.owner() === token.current) session.pause(why); };
    const hidden = () => { if (document.hidden) pause('background'); };
    const blur = () => pause('background');
    const checkRest = () => { if (isExpired()) pause('rest'); };
    const unsubscribe = onRestHere(checkRest);
    const timer = setInterval(checkRest, 200);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur); window.addEventListener('pagehide', blur);
    audio.current = createBliniAudio();
    return () => {
      release(); clearInterval(timer); unsubscribe();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur); window.removeEventListener('pagehide', blur);
      audio.current?.close(); audio.current = null;
    };
  }, [session]);

  useGameChrome(root);

  const draw = () => {
    const el = canvas.current; if (!el) return;
    const ctx = el.getContext('2d'); if (!ctx) return;
    const { scale, dpr } = view.current;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    drawScene(ctx, session.game(), fx.current, { t: performance.now(), aiming: aiming.current });
  };

  // Холст — самый большой прямоугольник поля 360 × 560, что помещается в сцену
  useLayoutEffect(() => {
    const box = stage.current, el = canvas.current;
    if (!box || !el) return undefined;
    const fit = () => {
      const w = Math.max(160, Math.min(box.clientWidth, box.clientHeight * FIELD.width / FIELD.height));
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      view.current = { scale: w / FIELD.width, dpr };
      el.style.width = w + 'px'; el.style.height = w * FIELD.height / FIELD.width + 'px';
      el.width = Math.round(w * dpr); el.height = Math.round(w * FIELD.height / FIELD.width * dpr);
      draw();
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(box);
    window.addEventListener('resize', fit);
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  // Пока партия идёт — кадр за кадром; на паузе и в панелях — одна неподвижная картинка
  useEffect(() => {
    if (mode !== 'playing' || help) { draw(); return undefined; }
    let frame = 0;
    const loop = () => {
      const events = session.frame(token.current);
      if (events.length) {
        addEvents(fx.current, session.game(), events, performance.now(), reduced.current);
        for (const e of events) {
          if (soundOn.current) {
            if (['shot', 'insert', 'power', 'danger'].includes(e.kind)) audio.current?.play(e.kind);
            if (e.kind === 'clear') audio.current?.play('clear', e.depth);
          }
          if (e.kind === 'clear') buzz(e.depth > 1 ? 'great' : 'good');
          if (e.kind === 'danger') buzz('bad');
          if (e.kind === 'saved') buzz('great');
        }
      }
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [mode, help, session, serial]);

  useEffect(() => {
    if (session.owner() !== token.current) return;
    if (mode === 'won') { buzz('great'); if (soundOn.current) audio.current?.play('won'); }
    if (mode === 'lost') { buzz('crash'); if (soundOn.current) audio.current?.play('lost'); }
    if (mode === 'paused') audio.current?.stop();
  }, [mode, session]);

  useEffect(() => {
    if (session.owner() !== token.current) return;
    if (shownPanel) primary.current?.focus({ preventScroll: true });
    // Фокус на поле — для клавиатуры; рамку после касания не рисуем
    else canvas.current?.focus({ preventScroll: true, focusVisible: false });
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
  const start = () => { if (sound) audio.current?.unlock(); fx.current = createFx(); session.start(token.current); };
  const resume = () => { if (sound) audio.current?.unlock(); session.resume(token.current); };
  const swap = () => { if (session.swap(token.current)) buzz('tap'); };

  const toField = event => {
    const rect = canvas.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * FIELD.width, y: (event.clientY - rect.top) / rect.height * FIELD.height };
  };
  const down = event => {
    if (mode !== 'playing' || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const p = toField(event);
    aiming.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    session.aim(p.x, p.y, token.current);
  };
  const move = event => {
    if (mode !== 'playing') return;
    if (!aiming.current && event.pointerType !== 'mouse') return;
    const p = toField(event);
    session.aim(p.x, p.y, token.current);
  };
  const up = event => {
    if (!aiming.current) return;
    aiming.current = false;
    const p = toField(event), { shooter } = track;
    // Касание стойки — поменять блин в руке на следующий
    if (Math.hypot(p.x - shooter.x, p.y - shooter.y) < 30) { swap(); return; }
    session.shoot(p.x, p.y, token.current);
  };
  const turn = delta => {
    const game = session.game(), { shooter } = game.track, a = game.aim + delta;
    session.aim(shooter.x + Math.cos(a) * 100, shooter.y + Math.sin(a) * 100, token.current);
  };
  const keys = event => {
    if (mode !== 'playing' || help) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-.09); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); turn(.09); }
    else if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); session.shoot(undefined, undefined, token.current); }
    else if (event.code === 'KeyX' || event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); swap(); }
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

  const active = mode === 'playing' && !help;
  const progress = Math.min(1, hud.score / hud.target);
  const message = soundError
    || (hud.technique ? `${POWERS.technique.name}: ${POWERS.technique.effect}`
    : hud.negative ? `${POWERS.negative.name}: ${POWERS.negative.effect}`
    : hud.pause ? `${POWERS.pause.name}: ${POWERS.pause.effect}`
    : hud.full ? 'План выполнен — сними оставшиеся блины'
    : hud.danger >= .85 ? 'Блины у помоста! Снимай ближние'
    : hud.streak >= 3 ? `Серия ×${hud.streak}: каждое попадание дороже`
    : 'Касание поля — бросок, стойки — обмен');
  const backLabel = mission ? 'Вернуться в карьеру' : `Вернуться ${restLeft == null ? 'в приложение' : 'к отдыху'}`;

  return <section className={`blini-game blini-game--${mode}`} aria-label="Блины" data-no-gestures data-phase={mode} ref={root} onKeyDown={panelKeys}>
    <div className="blini-scene">
      <header className="blini-top">
        <button type="button" className="blini-icon blini-round" onClick={close} aria-label={mission ? 'К карьере' : restLeft == null ? 'Закрыть игру' : 'К отдыху'}><IconBack size={22} /></button>
        {restLeft != null && <div className="blini-rest" title="Пора к подходу? Игра подождёт."><span>Отдых</span><strong role="timer">{clock(Math.max(0, restLeft))}</strong></div>}
        <span className="blini-top__gap" />
        <button type="button" className="blini-icon blini-round" onClick={toggleSound} aria-label={sound ? 'Выключить звук' : 'Включить звук'} aria-pressed={sound}><Sound enabled={sound} /></button>
        <button type="button" className="blini-icon blini-round" onClick={() => session.pause()} disabled={!active} aria-label="Пауза"><span className="blini-pause-icon" /></button>
      </header>
      <div className="blini-hud">
        <div className="blini-level"><span>Уровень</span><strong>{level + 1}</strong></div>
        <div className="blini-plan">
          <div className="blini-plan__numbers"><strong data-blini="score">{kg(hud.score)}</strong><span>{hud.full ? <><IconCheck size={15} /> План есть</> : `План ${kg(hud.target)}`}</span></div>
          <div className={'blini-progress' + (hud.full ? ' is-full' : '')} role="progressbar" aria-label="Тоннаж до плана" aria-valuenow={Math.min(hud.score, hud.target)} aria-valuemin={0} aria-valuemax={hud.target}><span style={{ transform: `scaleX(${progress})` }} /></div>
        </div>
        {hud.lives > 0 && <div className="blini-belt" aria-label="Пояс: одна страховка">Пояс</div>}
      </div>
      <div className="blini-stage" ref={stage}>
        <canvas ref={canvas} className={'blini-canvas' + (hud.danger >= .85 ? ' is-danger' : '')} tabIndex={active ? 0 : -1}
          role="img" aria-label={`Трасса «${track.name}». В руке ${PLATES[hud.current].name}, следующий ${PLATES[hud.next].name}.`}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { aiming.current = false; }} onKeyDown={keys} />
      </div>
      <div className={'blini-feedback' + (hud.danger >= .85 && !hud.full ? ' is-danger' : '')} role="status" aria-live="polite">{message}</div>
      <footer className="blini-footer">
        <button type="button" onClick={swap} disabled={!active} aria-label={`Поменять: в руке ${PLATES[hud.current].name}, следующий ${PLATES[hud.next].name}`}><Plate color={hud.current} small /><span className="blini-swap-arrow" aria-hidden="true">⇄</span><Plate color={hud.next} small />Поменять</button>
        <button type="button" onClick={openHelp}><IconGuide size={19} />Как играть</button>
      </footer>
    </div>
    {shownPanel && <div className="blini-overlay">
      <div className={`blini-panel${mode === 'won' && !help ? ' blini-panel--win' : ''}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={title}>
        <button className="blini-panel-close blini-icon" onClick={() => help ? setHelp(false) : close()} aria-label={help ? 'Закрыть правила' : 'Выйти из игры'}><IconClose size={18} /></button>
        {help ? <>
          <h3 id={title}>Снимай блины</h3>
          <p>Блины катятся к помосту. Коснись поля — стойка бросит блин туда. Три и больше одного цвета подряд снимаются.</p>
          <div className="blini-rules">
            <div><span className="blini-rule-plates"><Plate color={0} /><Plate color={0} /><Plate color={0} /></span><span><strong>Три одного цвета</strong>Снимаются, а вес идёт в тоннаж</span></div>
            <div><span className="blini-rule-plates"><Plate color={1} /><Plate color={2} /><Plate color={1} /></span><span><strong>Цепь</strong>После снятия на стыке снова один цвет — блины откатываются назад, очки ×2, ×3…</span></div>
            <div><span className="blini-rule-plates"><Plate color={3} /></span><span><strong>План</strong>Набери тоннаж — новые блины перестанут выходить. Сними оставшиеся</span></div>
          </div>
          <div className="blini-powers">{Object.entries(POWERS).map(([id, power]) => <div key={id}><PowerMark power={id} /><span><strong>{power.name}</strong>{power.effect}</span></div>)}</div>
          <p className="blini-panel__fine">Бонус светится на блине — сними его, пока не погас. Касание стойки или кнопка «Поменять» меняет блин в руке на следующий.</p>
          <button className="blini-primary" ref={primary} onClick={() => { setHelp(false); if (mode === 'paused') resume(); }}>Понятно</button>
        </> : mode === 'ready' ? <>
          <span className="blini-chapter">Уровень {level + 1} из {LEVELS.length}</span>
          <h3 id={title}>«{track.name}»</h3>
          <p>{track.note}</p>
          <MissionNote game="blini" mission={mission} />
          <div className="blini-mission"><span>План {kg(rules.target)}</span><span>{colorsLabel(rules.colors)}</span><span>Норматив {seconds(rules.par)}</span></div>
          {!state.mission && unlocked > 0 && <div className="blini-levels" role="group" aria-label="Выбор уровня">
            <button type="button" onClick={() => session.choose(level - 1, token.current)} disabled={level === 0} aria-label="Предыдущий уровень">‹</button>
            <span>Открыто {unlocked + 1} из {LEVELS.length}</span>
            <button type="button" onClick={() => session.choose(level + 1, token.current)} disabled={level >= unlocked} aria-label="Следующий уровень">›</button>
          </div>}
          <button className="blini-primary" ref={primary} onClick={start}>Играть</button>
          <button className="blini-secondary" onClick={openHelp}>Как играть</button>
        </> : mode === 'paused' ? <>
          <div className="blini-panel-mark"><span className="blini-pause-icon" /></div>
          <h3 id={title}>{reason === 'rest' ? 'Пора к подходу' : 'Можно выдохнуть'}</h3>
          <p>{reason === 'rest' ? 'Блины замерли на месте. Продолжим на следующем отдыхе.' : 'Цепочка стоит. Продолжишь с того же места.'}</p>
          <div className="blini-mission"><span><strong>{kg(hud.score)}</strong> из {kg(hud.target)}</span><span>{seconds(hud.seconds)}</span></div>
          <label className="blini-toggle"><input type="checkbox" checked={vibration} onChange={event => { setVibration(event.target.checked); setVibrationState(event.target.checked); if (event.target.checked) buzz('tap'); }} />Вибрация</label>
          <button className="blini-primary" ref={primary} onClick={resume}>Продолжить игру</button>
          <button className="blini-secondary" onClick={close}>{backLabel}</button>
        </> : <>
          <span className="blini-chapter">Уровень {level + 1} · «{track.name}»</span>
          <h3 id={title}>{mode === 'won' ? (result?.ace ? 'Уложился в норматив!' : 'Уровень взят!') : 'Блины на помосте'}</h3>
          <p>{mode === 'won' ? (result?.ace ? `Быстрее ${seconds(rules.par)} — как по секундомеру.` : `Норматив — ${seconds(rules.par)}. В следующий раз быстрее.`) : 'Цепочка докатилась до помоста. Снимай ближние к нему блины первыми.'}</p>
          <div className="blini-result"><strong>{kg(result?.score ?? hud.score)}</strong><span>поднято за {seconds(result?.seconds ?? hud.seconds)}</span></div>
          {(result?.bestChain > 1 || result?.bestStreak > 1) && <p className="blini-panel__fine">{[result.bestChain > 1 && `Лучшая цепь ×${result.bestChain}`, result.bestStreak > 1 && `серия ×${result.bestStreak}`].filter(Boolean).join(' · ')}</p>}
          <MissionNote game="blini" mission={mission} outcome={outcome} />
          {mission ? <button className="blini-primary" ref={primary} onClick={() => mode === 'won' ? close() : start()}>{mode === 'won' ? 'К карьере' : 'Повторить задание'}</button>
            : <button className="blini-primary" ref={primary} onClick={() => mode === 'won' && level < LEVELS.length - 1 ? session.nextLevel(token.current) : start()}>{mode === 'won' ? (level < LEVELS.length - 1 ? 'Следующий уровень' : 'Сыграть ещё раз') : 'Повторить уровень'}</button>}
          {mission && mode === 'won' ? <button className="blini-secondary" onClick={start}>Сыграть ещё раз</button>
            : <button className="blini-secondary" onClick={close}>{backLabel}</button>}
        </>}
      </div>
    </div>}
  </section>;
}
