import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PlankGame from './PlankGame.jsx';
import ScooterGame from './ScooterGame.jsx';
import MatchGame from './MatchGame.jsx';
import BliniGame from './BliniGame.jsx';
import { useBliniSession } from './BliniSession.jsx';
import { useMatchSession } from './MatchSession.jsx';
import { useScooterSession } from './ScooterSession.jsx';
import { usePlankSession } from './PlankSession.jsx';
import { activeRound } from './plank-game.js';
import { clock } from './workout-model.js';
import { alarmRings, alarmClosed } from './native-rest.js';
import { ringOnce, stopVibration } from './rest-alarm.js';
import { isNativeApp } from './native-bridge.js';
import { IconDelta, IconChevron } from './icons.jsx';
import { useBackGesture } from './gestures.jsx';
import { IconPlankGame, IconScooterGame, IconMatchGame, IconBliniGame } from './game-icons.jsx';
import { enterFullscreen } from './game-feel.js';
import './rest.css';
import './game-shell.css';

/**
 * Отдых на весь экран (03.10.2026, владелец): крупный таймер, касание по
 * экрану ничего не выключает: свайп вниз сворачивает его, кнопки управляют
 * отдыхом. Под таймером —
 * что дальше. В конце — «Отдых окончен», звук и вибрация каждые 2 с, пока
 * не нажмут «Закрыть» (не дольше двух минут). Свёрнутое приложение
 * сигналит уведомлением (native-rest.js) и плашкой (Live Activity).
 */
export function RestScreen({ until, total, now, next, onMore, onStop, onCollapse, allowGame = false }) {
  const [gameUntil, setGameUntil] = useState(0);
  const [gameKind, setGameKind] = useState('plank');
  const [match, matchSession] = useMatchSession();
  const matchActive = ['playing', 'paused'].includes(match.mode);
  const [blini, bliniSession] = useBliniSession();
  const bliniActive = ['playing', 'paused'].includes(blini.mode);
  const scooterSession = useScooterSession();
  const scooterActive = ['playing', 'countdown', 'paused'].includes(scooterSession.game.phase);
  const [plank, plankSession] = usePlankSession();
  const left = until - now;
  const over = left <= 0;
  // В том числе партия, открытая из меню под этим экраном: будильник
  // не должен скрывать продолжающийся отсчёт вопроса.
  useLayoutEffect(() => {
    if (over && allowGame) {
      plankSession.pause('rest', Date.now(), until);
      scooterSession.pause();
      matchSession.pause('rest');
      bliniSession.pause('rest');
    }
  }, [over, until, allowGame, plankSession, scooterSession, matchSession, bliniSession]);
  const stopRef = useRef(onStop);
  const swipe = useRef(null);
  stopRef.current = onStop;
  // Уход экрана — анимацией 220 мс, как приход (аудит 24.10.2026: пропадал
  // рывком): «Закончить отдых», «Закрыть», «Свернуть», смахивание вниз и
  // «Назад» сначала гасят экран, потом зовут своё. Без анимации
  // (reduced-motion, проверки компонента) — сразу
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const leaveTimer = useRef(0);
  // Отдых, у которого нажали «уйти»: за 220 мс анимации мог начаться
  // новый (отметили следующий подход) — запоздалое «закончить» его не гасит
  const untilRef = useRef(until);
  untilRef.current = until;
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const leave = (fn) => () => {
    if (!fn || leavingRef.current) return;
    const calm = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) { fn(); return; }
    leavingRef.current = true;
    setLeaving(true);
    const at = untilRef.current;
    leaveTimer.current = setTimeout(() => { leavingRef.current = false; if (untilRef.current === at) fn(); setLeaving(false); }, 220);
  };
  // Системный «Назад» (Android, Back браузера) сворачивает отдых, а не
  // закрывает тренировку под ним (аудит 24.10.2026); в игре — закрывает
  // игру, после конца отдыха — «Закрыть». Без смахивания (swipe: false):
  // вправо оно уводило из занятия, а вниз экран сворачивает сам
  useBackGesture(() => {
    if (!over && allowGame && gameUntil === until) setGameUntil(0);
    else if (!over && onCollapse) leave(onCollapse)();
    else leave(onStop)();
  }, true, null, { swipe: false });
  // data-no-gestures на экране (аудит 24.10.2026): жесты приложения
  // (gestures.jsx) его не трогают — смахивание вправо уводило из занятия,
  // а под ним стартовало «потяни, чтобы обновить». Свой жест — ниже
  const touchStart = (event) => {
    const touch = event.touches && event.touches[0];
    if (!touch || over || !onCollapse || (event.target.closest && event.target.closest('button'))) {
      swipe.current = null;
      return;
    }
    swipe.current = { x: touch.clientX, y: touch.clientY };
  };
  const touchEnd = (event) => {
    const start = swipe.current;
    swipe.current = null;
    const touch = event.changedTouches && event.changedTouches[0];
    if (!start || !touch || over || !onCollapse) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dy >= 64 && dy > Math.abs(dx) * 1.25) leave(onCollapse)();
  };
  // Будильник iPhone закрыли крестиком вне приложения — закрыть и этот
  // экран, второй раз «Закрыть» нажимать не нужно (03.10.2026)
  useEffect(() => {
    if (!over || !alarmRings(until)) return undefined;
    let alive = true;
    const check = () => alarmClosed(until).then((gone) => { if (alive && gone) stopRef.current(); });
    const timer = setInterval(check, 1500);
    document.addEventListener('visibilitychange', check);
    check();
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [over, until]);
  useEffect(() => {
    if (!over) return undefined;
    // iPhone с будильником (iOS 26+) звенит сам — второй звук не нужен
    if (alarmRings(until)) return undefined;
    let n = 0;
    ringOnce();
    const timer = setInterval(() => { n += 1; if (n >= 60) { clearInterval(timer); return; } ringOnce(); }, 2000);
    return () => { clearInterval(timer); stopVibration(); };
  }, [over, until]);
  // Игра на отдыхе — тоже на весь экран: касание по кнопке и есть жест,
  // без которого браузер не уберёт адресную строку (19.10.2026)
  const openGame = (event, kind) => {
    setGameKind(kind); setGameUntil(until);
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enterFullscreen(event.currentTarget);
  };
  const share = over ? 1 : Math.max(0, Math.min(1, left / Math.max(1, total)));
  const R = 120;
  const C = 2 * Math.PI * R;
  if (!over && allowGame && gameUntil === until) return (
    <div className={'rest-screen rest-screen--game' + (gameKind === 'scooter' ? ' rest-screen--scooter' : gameKind === 'match' ? ' rest-screen--match' : gameKind === 'blini' ? ' rest-screen--blini' : '')} role="dialog" aria-modal="true" aria-label="Игра во время отдыха" data-no-gestures="">
      {gameKind === 'blini'
        ? <BliniGame restLeft={left} restUntil={until} onClose={() => setGameUntil(0)} />
        : gameKind === 'match'
        ? <MatchGame restLeft={left} restUntil={until} onClose={() => setGameUntil(0)} />
        : gameKind === 'scooter'
        ? <ScooterGame restLeft={left} restUntil={until} onClose={() => setGameUntil(0)} />
        : <PlankGame restLeft={left} restUntil={until} onClose={() => setGameUntil(0)} />}
    </div>
  );
  return (
    <div className={'rest-screen' + (over ? ' rest-screen--over' : '') + (leaving ? ' rest-screen--leaving' : '')} role="dialog" aria-modal="true" aria-label={over ? 'Отдых окончен' : 'Отдых'}
      data-no-gestures=""
      onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={() => { swipe.current = null; }}>
      <div className="rest-screen__label">{over ? 'Отдых окончен' : 'Отдых'}</div>
      <div className="rest-screen__dial">
        <svg className="rest-screen__ring" viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r={R} className="rest-screen__track" />
          <circle cx="140" cy="140" r={R} className="rest-screen__bar" strokeDasharray={`${C * share} ${C}`} transform="rotate(-90 140 140)" />
        </svg>
        <div className="rest-screen__time" role="timer" aria-live="off">{over ? '0:00' : clock(left)}</div>
      </div>
      {next && (
        <div className="rest-screen__next">
          {/* «Дальше» — по просьбе владельца (03.10.2026): карточку читают
              с расстояния, между подходами, и подпись снимает вопрос, что это */}
          <p className="rest-screen__next-label">Дальше</p>
          <p className="rest-screen__next-name">{next.name}</p>
          <p className="rest-screen__next-part">{next.part.charAt(0).toUpperCase() + next.part.slice(1)}</p>
          {next.items
            // Дальше суперсет — весь круг: каждое упражнение со своим весом
            ? <ol className="rest-screen__round">
              {next.items.map((it, i) => (
                <li key={i} className={it.done ? 'is-done' : ''}>
                  <span className="rest-screen__round-name">{it.name}</span>
                  <span className="rest-screen__round-load">{it.load || '—'}</span>
                  {it.change && (it.change.kind === 'up' || it.change.kind === 'down') && <span className={'rest-screen__next-change rest-screen__next-change--' + it.change.kind}>
                    <IconDelta value={it.change.kind === 'up' ? 1 : -1} />{it.change.text}
                  </span>}
                </li>
              ))}
            </ol>
            : <>
              {next.load && <p className="rest-screen__next-load">{next.load}</p>}
              {next.change && <div className={'rest-screen__next-change rest-screen__next-change--' + next.change.kind}>
                {(next.change.kind === 'up' || next.change.kind === 'down') && <IconDelta value={next.change.kind === 'up' ? 1 : -1} />}
                {next.change.text}
              </div>}
            </>}
        </div>
      )}
      {over && allowGame && (activeRound(plank.round) || scooterActive || matchActive || bliniActive) && <p className="rest-screen__game-paused" role="status">Игра на паузе. Сделай подход — продолжим на следующем отдыхе.</p>}
      {!over && allowGame && <>
        <div className="rest-screen__games" aria-label="Игры на отдыхе">
          <button type="button" onClick={(event) => { openGame(event, 'plank'); }}><IconPlankGame size={64} /><span>{activeRound(plank.round) ? 'Продолжить игру' : 'Тренер в планке'}</span></button>
          <button type="button" onClick={(event) => { openGame(event, 'scooter'); }}><IconScooterGame size={64} /><span>{scooterActive ? 'Продолжить поездку' : 'На самокате до зала'}</span></button>
          <button type="button" onClick={(event) => { openGame(event, 'match'); }}><IconMatchGame size={64} /><span>{matchActive ? 'Продолжить три в ряд' : 'Три в ряд'}</span></button>
          <button type="button" onClick={(event) => { openGame(event, 'blini'); }}><IconBliniGame size={64} /><span>{bliniActive ? 'Продолжить блины' : 'Блины'}</span></button>
        </div>
      </>}
      <div className={'rest-screen__actions' + (onMore ? '' : ' rest-screen__actions--one')}>
        {over
          ? <button type="button" className="button button--primary rest-screen__main" onClick={leave(onStop)}>Закрыть</button>
          : <>
            {/* Вне экрана тренировки занятия под рукой нет — без «+30 с» */}
            {onMore && <button type="button" className="button rest-screen__more" onClick={onMore}>+30 с</button>}
            <button type="button" className="button button--primary rest-screen__main" onClick={leave(onStop)}>Закончить отдых</button>
          </>}
      </div>
      {/* Свернуть — таймер уходит в плашку внизу, приложение свободно:
          другие разделы, прокрутка (владелец, 03.10.2026) */}
      {!over && onCollapse && <button type="button" className="rest-screen__fold" onClick={leave(onCollapse)}>
        <IconChevron size={18} aria-hidden="true" />Свернуть таймер
      </button>}
    </div>
  );
}

/** Приложение на iPhone: у «брови» место под плашку */
function onIsland() {
  try { return isNativeApp() && window.Capacitor.getPlatform() === 'ios'; } catch (_) { return false; }
}

/** Свёрнутый отдых: плашка над нижним меню, касание разворачивает */
export function RestPill({ left, onOpen }) {
  return (
    // Приложение iPhone — сверху, у «брови»: продолжением Dynamic Island
    // (владелец, 03.10.2026). Внутрь самой «брови» своё открытое приложение
    // iPhone не пускает — там таймер, когда приложение свёрнуто (Live Activity)
    <button type="button" className={'rest-pill' + (onIsland() ? ' rest-pill--island' : '')} onClick={onOpen} aria-label={'Отдых, осталось ' + clock(left) + '. Развернуть'}>
      <span className="rest-pill__dot" aria-hidden="true" />
      <span>Отдых</span>
      <strong role="timer" aria-live="off">{clock(left)}</strong>
      <IconChevron size={16} className="rest-pill__up" aria-hidden="true" />
    </button>
  );
}
