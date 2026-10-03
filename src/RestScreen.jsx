import React, { useEffect, useRef } from 'react';
import { clock } from './workout-model.js';
import { alarmRings, alarmClosed } from './native-rest.js';
import { ringOnce, stopVibration } from './rest-alarm.js';
import { isNativeApp } from './native-bridge.js';
import { IconDelta, IconChevron } from './icons.jsx';
import './rest.css';

/**
 * Отдых на весь экран (03.10.2026, владелец): крупный таймер, касание по
 * экрану ничего не делает — выключить можно только кнопкой. Под таймером —
 * что дальше. В конце — «Отдых окончен», звук и вибрация каждые 2 с, пока
 * не нажмут «Закрыть» (не дольше двух минут). Свёрнутое приложение
 * сигналит уведомлением (native-rest.js) и плашкой (Live Activity).
 */
export function RestScreen({ until, total, now, next, onMore, onStop, onCollapse }) {
  const left = until - now;
  const over = left <= 0;
  const stopRef = useRef(onStop);
  stopRef.current = onStop;
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
  const share = over ? 1 : Math.max(0, Math.min(1, left / Math.max(1, total)));
  const R = 120;
  const C = 2 * Math.PI * R;
  return (
    <div className={'rest-screen' + (over ? ' rest-screen--over' : '')} role="dialog" aria-modal="true" aria-label={over ? 'Отдых окончен' : 'Отдых'}>
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
      <div className={'rest-screen__actions' + (onMore ? '' : ' rest-screen__actions--one')}>
        {over
          ? <button type="button" className="button button--primary rest-screen__main" onClick={onStop}>Закрыть</button>
          : <>
            {/* Вне экрана тренировки занятия под рукой нет — без «+30 с» */}
            {onMore && <button type="button" className="button rest-screen__more" onClick={onMore}>+30 с</button>}
            <button type="button" className="button button--primary rest-screen__main" onClick={onStop}>Закончить отдых</button>
          </>}
      </div>
      {/* Свернуть — таймер уходит в плашку внизу, приложение свободно:
          другие разделы, прокрутка (владелец, 03.10.2026) */}
      {!over && onCollapse && <button type="button" className="rest-screen__fold" onClick={onCollapse}>
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
