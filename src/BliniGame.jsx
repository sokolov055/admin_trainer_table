import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useBliniSession } from './BliniSession.jsx';
import { LEVELS, PLATES, POWERS, MEDALS, GOLD_CHAIN, TICK_MS, levelRules, missionRules } from './blini-model.js';
import { FIELD, TRACKS } from './blini-tracks.js';
import { createFx, addEvents, drawScene, bakeBackground, plateImage } from './blini-draw.js';
import { createBliniAudio } from './blini-audio.js';
import { restHere, onRestHere } from './rest-here.js';
import { clock } from './workout-model.js';
import { IconBack, IconGuide, IconClose, IconCheck } from './icons.jsx';
import { useGameChrome, buzz, vibrationOn, setVibration } from './game-feel.js';
import { useMission, MissionNote } from './CareerMission.jsx';
import { useGameProgress, saveProgress } from './game-progress.js';
import GameProgressCard from './GameProgressCard.jsx';
import './blini-game.css';

const kg = value => value.toLocaleString('ru-RU') + ' кг';
const seconds = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
// Советы Михалыча перед уровнем (по мотивам подсказок Zuma's Revenge)
const TIPS = [
  'Сбивай еду на поле — это тоннаж в план. Батончик даёт больше всего.',
  'Сними всю цепочку раньше плана — «Чистая трасса!» и бонус.',
  '«Суперсет» снимает все блины этого цвета разом — ищи его свечение.',
  'Цепь откатывает блины назад: ставь блин так, чтобы после снятия сошлись одинаковые.',
  'Блины ближе к помосту опаснее — снимай их первыми.',
  'Коснись Михалыча — он возьмёт следующий блин, если этот не подходит.',
  'Серия удачных бросков подряд делает каждый следующий дороже.',
  'На «Гантели» две цепочки — следи за обеими.',
];
const BOSS_TIPS = [
  'Пока Диван прикрыт подушкой, снимай блины — бросок в подушку пропадёт.',
  'Пончик летит туда, где ты стоишь сейчас: шагни по скамье — и мимо.',
  'Пончик можно сбить блином — это ещё и тоннаж.',
  'После попадания Диван трясётся секунду — следующий блин отскочит.',
];
const colorsLabel = n => n + ' ' + (n === 1 ? 'цвет' : n >= 2 && n <= 4 ? 'цвета' : 'цветов');

function Sound({ enabled }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" />{enabled ? <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /> : <path d="m16 9 5 6m0-6-5 6" />}</svg>;
}
/** Блин в подписях и правилах — та же картинка, что на поле. */
export function Plate({ color, small = false }) {
  return <img className={'blini-plate' + (small ? ' blini-plate--small' : '')} src={plateImage(color)} alt="" aria-hidden="true" draggable="false" />;
}
function PowerMark({ power }) {
  return <span className="blini-power" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {power === 'drop' && <path d="M6 2.6v5.8M3.4 5.8 6 8.8l2.6-3" />}
    {power === 'negative' && <path d="M8.8 6H3.4M5.8 3.4 3.2 6l2.6 2.6" />}
    {power === 'pause' && <path d="M4.4 3.4v5.2M7.6 3.4v5.2" />}
    {power === 'technique' && <><circle cx="6" cy="6" r="2.4" /><path d="M6 1.8v8.4M1.8 6h8.4" /></>}
    {power === 'superset' && <path d="M7 1.6 3.6 6.6H6.4L5 10.4" />}
  </svg></span>;
}
// Медаль уровня: лента и диск цвета металла; не взятая — бледный контур
const METAL = ['', '#c27a3e', '#aeb8bf', '#e9b52a'];
function Medal({ rank, earned = true, size = 30 }) {
  const fill = earned ? METAL[rank] : '#e3e3d3', ink = earned ? '#fff9e0' : '#b6b8a6';
  return <svg className="blini-medal-icon" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
    <path d="M9 2h6l3 8h-6Z" fill={earned ? '#d8343f' : '#d6d6c6'} /><path d="M23 2h-6l-3 8h6Z" fill={earned ? '#2d6bd3' : '#cacabb'} />
    <circle cx="16" cy="19.5" r="10" fill={fill} stroke={earned ? '#00000030' : '#c9cab8'} strokeWidth="1.5" />
    <circle cx="16" cy="19.5" r="6.6" fill="none" stroke={ink} strokeOpacity=".55" strokeWidth="1.2" />
    <text x="16" y="23.4" textAnchor="middle" fontSize="10.5" fontWeight="900" fill={ink} fontFamily="Manrope, sans-serif">{rank}</text>
  </svg>;
}
/** Три медали уровня и за что каждая: взятые — цветные. */
function MedalGoals({ best, par }) {
  const goals = ['', 'Пройти уровень', `Уложиться в ${seconds(par)}`, `${seconds(par)} и цепь ×${GOLD_CHAIN}`];
  return <ul className="blini-medals" aria-label="Медали уровня">
    {[1, 2, 3].map(rank => <li key={rank} className={best >= rank ? 'is-earned' : ''}>
      <Medal rank={rank} earned={best >= rank} /><span><strong>{MEDALS[rank]}</strong>{goals[rank]}</span>
      {best >= rank && <span className="blini-visually-hidden">— есть</span>}
    </li>)}
  </ul>;
}

/**
 * «Блины» (21.10.2026): цепочка олимпийских блинов катится к помосту,
 * Гиря Михалыч в центре бросает блины. Три одного цвета подряд снимаются.
 * Поле — на весь экран, верхняя строка и кнопки лежат поверх карты.
 * Правила — blini-model.js, рисование — blini-draw.js, партия — blini-session.js.
 */
export default function BliniGame({ onClose, restLeft, restUntil = Infinity, career = false }) {
  const [state, session] = useBliniSession();
  const { mode, hud, level, unlocked, medals, result, sound, reason, serial } = state;
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

  // Прогресс в аккаунте: каждое сохранение партии уходит на сервер (если включено),
  // а более свежее сохранение с другого устройства подхватывается
  const account = useGameProgress();
  useEffect(() => session.onPersist(data => saveProgress('blini', data)), [session]);
  useEffect(() => {
    if (!account.enabled) return;
    const remote = account.states.blini;
    if (remote && remote.savedAt > session.savedAt()) session.hydrate(remote.state);
    else if (!remote || remote.savedAt < session.savedAt()) session.save();
  }, [account.enabled, account.states.blini, session]);

  const [help, setHelp] = useState(false);
  const [soundError, setSoundError] = useState('');
  const [vibration, setVibrationState] = useState(vibrationOn);
  const token = useRef({});
  const audio = useRef(null);
  const fx = useRef(createFx());
  const aiming = useRef(false);
  const deadline = useRef(restUntil); deadline.current = restUntil;
  const root = useRef(null), top = useRef(null), bottom = useRef(null), canvas = useRef(null), layer = useRef(null), panel = useRef(null), primary = useRef(null);
  const view = useRef({ width: 1, height: 1, dpr: 1, s: 1, ox: 0, oy: 0 });
  // Качество картинки: плотность пикселей не выше 2; если кадры не успевают — ниже ступенями
  const quality = useRef(2), refit = useRef(() => {});
  const soundOn = useRef(sound); soundOn.current = sound;
  const title = useId();
  const reduced = useRef(false);
  const rules = state.mission ? missionRules(state.mission.goal, state.mission.boost) : levelRules(level, session.easeOf(level));
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
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    drawScene(ctx, session.game(), fx.current, { t: performance.now(), aiming: aiming.current, view: view.current, reduced: reduced.current });
  };

  // Холст — на весь экран; поле 360 × 640 — во всю ширину между верхней строкой и кнопками
  useLayoutEffect(() => {
    const box = root.current, el = canvas.current, bg = layer.current;
    if (!box || !el || !bg) return undefined;
    const fit = () => {
      const rect = box.getBoundingClientRect();
      const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
      const above = top.current ? top.current.getBoundingClientRect().bottom - rect.top + 4 : 0;
      const below = bottom.current ? rect.bottom - bottom.current.getBoundingClientRect().top + 4 : 0;
      const room = Math.max(160, height - above - below);
      const s = Math.min(width / FIELD.width, room / FIELD.height);
      const dpr = Math.min(quality.current, window.devicePixelRatio || 1);
      view.current = { width, height, dpr, s, ox: (width - FIELD.width * s) / 2, oy: above + (room - FIELD.height * s) / 2 };
      for (const c of [el, bg]) { c.width = Math.round(width * dpr); c.height = Math.round(height * dpr); }
      el.dataset.field = [view.current.ox, view.current.oy, s].map(n => n.toFixed(2)).join(' ');
      el.dataset.quality = String(dpr);
      // Фон карты — отдельный неподвижный слой: каждый кадр рисуется только то, что движется
      bakeBackground(track, view.current, bg, rules.rail);
      draw();
    };
    refit.current = fit;
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(box);
    window.addEventListener('resize', fit);
    return () => { observer?.disconnect(); window.removeEventListener('resize', fit); };
  }, [track, rules.rail]);

  // Пока партия идёт — кадр за кадром; на паузе и в панелях — одна неподвижная картинка
  useEffect(() => {
    if (mode !== 'playing' || help) { draw(); return undefined; }
    let frame = 0, last = performance.now(), slow = 0, average = 16.7;
    const loop = () => {
      // Кадр дольше 24 мс две секунды подряд — снизить плотность пикселей на ступень
      const now = performance.now(); average = average * .95 + (now - last) * .05; last = now;
      slow = average > 24 ? slow + 1 : 0;
      if (slow > 120 && quality.current > 1) { quality.current = Math.max(1, quality.current - .5); slow = 0; refit.current(); }
      const events = session.frame(token.current);
      if (events.length) {
        addEvents(fx.current, session.game(), events, performance.now(), reduced.current);
        for (const e of events) {
          if (soundOn.current) {
            if (['shot', 'insert', 'power', 'danger'].includes(e.kind)) audio.current?.play(e.kind);
            if (e.kind === 'clear') audio.current?.play('clear', e.depth);
            if (e.kind === 'food') audio.current?.play('power');
            if (e.kind === 'cleartrack' || e.kind === 'boss-down') audio.current?.play('clear', 4);
            if (e.kind === 'boss-hit') audio.current?.play('clear', 2);
            if (e.kind === 'stunned') audio.current?.play('danger');
            if (e.kind === 'donut-down') audio.current?.play('power');
            if (e.kind === 'ramp') audio.current?.play('danger');
          }
          if (e.kind === 'clear') buzz(e.depth > 1 ? 'great' : 'good');
          if (e.kind === 'danger') buzz('bad');
          if (e.kind === 'saved' || e.kind === 'cleartrack') buzz('great');
          if (e.kind === 'food' || e.kind === 'donut-down') buzz('good');
          if (e.kind === 'boss-hit' || e.kind === 'boss-down') buzz('great');
          if (e.kind === 'stunned') buzz('bad');
          if (e.kind === 'ramp') buzz('bad');
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
  const start = () => { if (sound) audio.current?.unlock(); fx.current = createFx(performance.now(), true); session.start(token.current); };
  const resume = () => { if (sound) audio.current?.unlock(); session.resume(token.current); };
  const swap = () => { if (session.swap(token.current)) buzz('tap'); };

  const toField = event => {
    const rect = canvas.current.getBoundingClientRect(), { s, ox, oy } = view.current;
    return { x: (event.clientX - rect.left - ox) / s, y: (event.clientY - rect.top - oy) / s };
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
    const p = toField(event), { shooter } = session.game();
    // Касание Михалыча — поменять блин в руке на следующий
    if (Math.hypot(p.x - shooter.x, p.y - shooter.y) < 32) { swap(); return; }
    session.shoot(p.x, p.y, token.current);
  };
  const turn = delta => {
    const game = session.game(), { shooter } = game, a = game.aim + delta;
    session.aim(shooter.x + Math.cos(a) * 100, shooter.y + Math.sin(a) * 100, token.current, false);
  };
  const keys = event => {
    if (mode !== 'playing' || help) return;
    // Shift со стрелкой (или A и D) — шаг по скамье
    const step = event.code === 'KeyA' || (event.shiftKey && event.key === 'ArrowLeft') ? -24 : event.code === 'KeyD' || (event.shiftKey && event.key === 'ArrowRight') ? 24 : 0;
    if (step && rules.rail) { event.preventDefault(); session.walk(step, token.current); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-.09); }
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
  const boss = hud.bossMax > 0;
  const progress = boss ? hud.boss / hud.bossMax : Math.min(1, hud.score / hud.target);
  const message = soundError
    || (boss && hud.stun ? 'Михалыч объелся пончиком — секунду'
    : boss && hud.shield ? 'Диван прикрылся подушкой — снимай блины'
    : boss && hud.danger < .85 ? (hud.rage ? 'Диван в ярости: уходи от пончиков по скамье' : 'Бей Дивана в просветы цепочки, уходи от пончиков') : '')
    || (hud.technique ? `${POWERS.technique.name}: ${POWERS.technique.effect}`
    : hud.negative ? `${POWERS.negative.name}: ${POWERS.negative.effect}`
    : hud.pause ? `${POWERS.pause.name}: ${POWERS.pause.effect}`
    : hud.full ? 'План выполнен — сними оставшиеся блины'
    : hud.danger >= .85 ? 'Блины у помоста! Снимай ближние'
    : hud.streak >= 3 ? `Серия ×${hud.streak}: каждое попадание дороже`
    : hud.ramp && hud.seconds < rules.rampAt * TICK_MS / 1000 + 6 ? 'Темп растёт — не зевай'
    : rules.rail ? 'Веди пальцем — Михалыч идёт по скамье, отпусти — бросок'
    : 'Касание поля — бросок, Михалыча — обмен');
  const backLabel = mission ? 'Вернуться в карьеру' : `Вернуться ${restLeft == null ? 'в приложение' : 'к отдыху'}`;

  return <section className={`blini-game blini-game--${mode}`} aria-label="Блины" data-no-gestures data-phase={mode} ref={root} onKeyDown={panelKeys}>
    <canvas ref={layer} className="blini-canvas blini-canvas--bg" aria-hidden="true" />
    <canvas ref={canvas} className="blini-canvas blini-canvas--play" tabIndex={active ? 0 : -1}
      role="img" aria-label={`Карта «${track.name}». В руке ${PLATES[hud.current].name}, следующий ${PLATES[hud.next].name}.`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { aiming.current = false; }} onKeyDown={keys} />
    <div className="blini-scene">
      <header className="blini-top" ref={top}>
        <button type="button" className="blini-icon blini-round" onClick={close} aria-label={mission ? 'К карьере' : restLeft == null ? 'Закрыть игру' : 'К отдыху'}><IconBack size={22} /></button>
        {restLeft != null
          ? <div className="blini-chip blini-chip--rest" title="Пора к подходу? Игра подождёт."><span>Отдых</span><strong role="timer">{clock(Math.max(0, restLeft))}</strong></div>
          : <div className="blini-chip"><span>Уровень</span><strong>{level + 1}</strong></div>}
        <div className="blini-plan">
          {boss ? <>
            <div className="blini-plan__numbers"><strong data-blini="score">{kg(hud.score)}</strong><span>{hud.boss > 0 ? `Диван ♥ ${hud.boss} из ${hud.bossMax}` : <><IconCheck size={14} /> Повержен</>}</span></div>
            <div className={'blini-progress blini-progress--boss' + (hud.rage ? ' is-rage' : '')} role="progressbar" aria-label="Сердца Дивана" aria-valuenow={hud.boss} aria-valuemin={0} aria-valuemax={hud.bossMax}><span style={{ transform: `scaleX(${progress})` }} /></div>
          </> : <>
            <div className="blini-plan__numbers"><strong data-blini="score">{kg(hud.score)}</strong><span>{hud.full ? <><IconCheck size={14} /> План</> : `из ${hud.target.toLocaleString('ru-RU')}`}</span></div>
            <div className={'blini-progress' + (hud.full ? ' is-full' : '')} role="progressbar" aria-label="Тоннаж до плана" aria-valuenow={Math.min(hud.score, hud.target)} aria-valuemin={0} aria-valuemax={hud.target}><span style={{ transform: `scaleX(${progress})` }} /></div>
          </>}
          {hud.lives > 0 && <em className="blini-belt" aria-label="Пояс: одна страховка">Пояс</em>}
        </div>
        <button type="button" className="blini-icon blini-round" onClick={toggleSound} aria-label={sound ? 'Выключить звук' : 'Включить звук'} aria-pressed={sound}><Sound enabled={sound} /></button>
        <button type="button" className="blini-icon blini-round" onClick={() => session.pause()} disabled={!active} aria-label="Пауза"><span className="blini-pause-icon" /></button>
      </header>
      <div className="blini-bottom" ref={bottom}>
        <div className={'blini-feedback' + (hud.danger >= .85 && !hud.full ? ' is-danger' : '')} role="status" aria-live="polite">{message}</div>
        <footer className="blini-footer">
          <button type="button" onClick={swap} disabled={!active} aria-label={`Поменять: в руке ${PLATES[hud.current].name}, следующий ${PLATES[hud.next].name}`}><Plate color={hud.current} small /><span className="blini-swap-arrow" aria-hidden="true">⇄</span><Plate color={hud.next} small />Поменять</button>
          <button type="button" onClick={openHelp}><IconGuide size={19} />Как играть</button>
        </footer>
      </div>
    </div>
    {shownPanel && <div className="blini-overlay">
      <div className={`blini-panel${mode === 'won' && !help ? ' blini-panel--win' : ''}`} ref={panel} role="dialog" aria-modal="true" aria-labelledby={title}>
        <button className="blini-panel-close blini-icon" onClick={() => help ? setHelp(false) : close()} aria-label={help ? 'Закрыть правила' : 'Выйти из игры'}><IconClose size={18} /></button>
        {help ? <>
          <h3 id={title}>Снимай блины</h3>
          <p>Блины катятся к помосту. Коснись поля — Гиря Михалыч бросит блин туда. Три и больше одного цвета подряд снимаются.</p>
          <div className="blini-rules">
            <div><span className="blini-rule-plates"><Plate color={0} /><Plate color={0} /><Plate color={0} /></span><span><strong>Три одного цвета</strong>Снимаются, а вес идёт в тоннаж</span></div>
            <div><span className="blini-rule-plates"><Plate color={1} /><Plate color={2} /><Plate color={1} /></span><span><strong>Цепь</strong>После снятия на стыке снова один цвет — блины откатываются назад, очки ×2, ×3…</span></div>
            <div><span className="blini-rule-plates"><Plate color={3} /></span><span><strong>План</strong>Набери тоннаж — новые блины перестанут выходить. Сними оставшиеся</span></div>
            <div><span className="blini-rule-plates"><Plate color={2} /><Plate color={2} /></span><span><strong>Скамья</strong>На «Зале» со второго круга Михалыч ходит по скамье: веди пальцем — он идёт под него, отпусти — бросит. С клавиатуры — Shift со стрелками или A и D</span></div>
            <div><span className="blini-rule-plates"><Plate color={4} /></span><span><strong>Темп растёт</strong>Через 40 секунд блины катятся быстрее, а где их было четыре — выходит пятый цвет</span></div>
          </div>
          <div className="blini-powers">{Object.entries(POWERS).map(([id, power]) => <div key={id}><PowerMark power={id} /><span><strong>{power.name}</strong>{power.effect}</span></div>)}</div>
          <div className="blini-rules"><div><span className="blini-rule-plates blini-rule-boss" aria-hidden="true">♥</span><span><strong>Босс круга — Диван</strong>Брошенный в него блин снимает сердце, но подушка и дрожь после попадания его отбивают — тогда снимай блины. Пончики уводят Михалыча в нокаут на секунду: уходи по скамье или сбей пончик блином. Повержен Диван — все блины на трассе идут в тоннаж</span></div></div>
          <p className="blini-panel__fine">Еда на поле — банан, яблоко, брокколи, протеиновый батончик: попади в неё брошенным блином, и её вес уйдёт в тоннаж. Бонус светится на блине — сними его, пока не погас. Гиря Михалыч, 16 кг харизмы: коснись его или кнопки «Поменять», и он возьмёт следующий блин.</p>
          <button className="blini-primary" ref={primary} onClick={() => { setHelp(false); if (mode === 'paused') resume(); }}>Понятно</button>
        </> : mode === 'ready' ? <>
          <span className="blini-chapter">{rules.boss ? 'Босс круга · ' : ''}Уровень {level + 1} из {LEVELS.length}</span>
          <h3 id={title}>«{track.name}»</h3>
          <p>{track.note}</p>
          <MissionNote game="blini" mission={mission} />
          <div className="blini-mission">{rules.boss ? <span>Диван: {rules.boss.hp} ♥</span> : <span>План {kg(rules.target)}</span>}<span>{colorsLabel(rules.colors)}</span><span>Норматив {seconds(rules.par)}</span>
            {rules.rampAt > 0 && <span>С {seconds(rules.rampAt * TICK_MS / 1000)} — {rules.colors < PLATES.length ? 'пятый цвет и ' : ''}быстрее</span>}
            {rules.rail && <span>Михалыч ходит по скамье</span>}</div>
          {!state.mission && rules.ease > 0 && <p className="blini-ease">Михалыч сбавил темп: блины на {rules.ease * 6} % медленнее, {rules.boss ? `у Дивана ${rules.boss.hp} ♥ вместо ${LEVELS[level].boss.hp}` : `план на ${rules.ease * 5} % меньше`}. Выиграешь — уровень станет обычным.</p>}
          {!state.mission && <MedalGoals best={medals[level] || 0} par={rules.par} />}
          <p className="blini-tip"><b>Совет Михалыча.</b> {rules.boss ? BOSS_TIPS[(level + serial) % BOSS_TIPS.length] : TIPS[(level + serial) % TIPS.length]}</p>
          {!state.mission && unlocked > 0 && <div className="blini-levels" role="group" aria-label="Выбор уровня">
            <button type="button" onClick={() => session.choose(level - 1, token.current)} disabled={level === 0} aria-label="Предыдущий уровень">‹</button>
            <span>Открыто {unlocked + 1} из {LEVELS.length}<br />Медалей {Object.values(medals).reduce((sum, n) => sum + n, 0)} из {LEVELS.length * 3}</span>
            <button type="button" onClick={() => session.choose(level + 1, token.current)} disabled={level >= unlocked} aria-label="Следующий уровень">›</button>
          </div>}
          <button className="blini-primary" ref={primary} onClick={start}>Играть</button>
          <button className="blini-secondary" onClick={openHelp}>Как играть</button>
          <GameProgressCard />
        </> : mode === 'paused' ? <>
          <div className="blini-panel-mark"><span className="blini-pause-icon" /></div>
          <h3 id={title}>{reason === 'rest' ? 'Пора к подходу' : reason === 'saved' ? 'Партия сохранена' : 'Можно выдохнуть'}</h3>
          <p>{reason === 'rest' ? 'Блины замерли на месте. Продолжим на следующем отдыхе.' : reason === 'saved' ? `Уровень ${level + 1}, «${track.name}». Блины стоят там же, где ты остановился.` : 'Цепочка стоит. Продолжишь с того же места.'}</p>
          <div className="blini-mission"><span>{boss ? <>Диван: <strong>{hud.boss} ♥</strong> из {hud.bossMax}</> : <><strong>{kg(hud.score)}</strong> из {kg(hud.target)}</>}</span><span>{seconds(hud.seconds)}</span></div>
          <label className="blini-toggle"><input type="checkbox" checked={vibration} onChange={event => { setVibration(event.target.checked); setVibrationState(event.target.checked); if (event.target.checked) buzz('tap'); }} />Вибрация</label>
          <button className="blini-primary" ref={primary} onClick={resume}>Продолжить игру</button>
          <button className="blini-secondary" onClick={close}>{backLabel}</button>
          <GameProgressCard />
        </> : <>
          <span className="blini-chapter">Уровень {level + 1} · «{track.name}»</span>
          <h3 id={title}>{mode === 'won' ? (rules.boss ? 'Диван повержен!' : result?.ace ? 'Уложился в норматив!' : 'Уровень взят!') : 'Блины на помосте'}</h3>
          <p>{mode === 'won' ? (result?.ace ? `Быстрее ${seconds(rules.par)} — как по секундомеру.` : `Норматив — ${seconds(rules.par)}. В следующий раз быстрее.`) : rules.boss ? 'Диван отсиделся за цепочкой. Снимай блины перед ним — в просветы бросок долетит.' : 'Цепочка докатилась до помоста. Снимай ближние к нему блины первыми.'}</p>
          <div className="blini-result"><strong>{kg(result?.score ?? hud.score)}</strong><span>поднято за {seconds(result?.seconds ?? hud.seconds)}</span></div>
          {mode === 'won' && result?.medal > 0 && <div className={'blini-award' + (result.newMedal ? ' is-new' : '')}>
            <Medal rank={result.medal} size={46} />
            <span><strong>{result.newMedal ? `Новая медаль: ${MEDALS[result.medal].toLowerCase()}` : MEDALS[result.medal]}</strong>
              {result.medal === 1 ? `Серебро — уложись в ${seconds(rules.par)}` : result.medal === 2 ? `Золото — ещё и цепь ×${GOLD_CHAIN}` : 'Лучшая медаль уровня'}</span>
          </div>}
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
