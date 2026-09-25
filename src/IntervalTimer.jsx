import React, { useEffect, useRef, useState } from 'react';
import { haptic } from './telegram.js';
import { intervalPhases, intervalsText, clockText } from './exercise-track.js';

/**
 * Таймер интервалов кардио: ускорение — замедление, столько раз, сколько
 * задал тренер. На дорожке смотреть в телефон неудобно, поэтому смена
 * фазы — вибрацией, а на экране крупно: что сейчас, сколько осталось и
 * какой режим выставить.
 *
 * Время считается от момента старта, а не тиками: заблокировал телефон,
 * разблокировал — таймер там, где должен быть. Состояние живёт на экране и
 * в занятие не пишется — это подсказка, а не запись.
 */
export default function IntervalTimer({ intervals, track }) {
  const phases = intervalPhases(intervals, track);
  const total = phases.reduce((n, p) => n + p.seconds, 0);
  const [run, setRun] = useState(null); // { since, done } — done: секунд до паузы
  const [, tick] = useState(0);
  const last = useRef(-1);

  const elapsed = run ? run.done + (run.since ? (Date.now() - run.since) / 1000 : 0) : 0;
  let at = 0;
  let index = phases.length;
  for (let i = 0; i < phases.length; i += 1) {
    if (elapsed < at + phases[i].seconds) { index = i; break; }
    at += phases[i].seconds;
  }
  const finished = !!run && index >= phases.length;
  const current = phases[index];
  const left = current ? at + current.seconds - elapsed : 0;

  useEffect(() => {
    if (!run || !run.since || finished) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [run, finished]);

  // Смена фазы — вибрация: ускорение — длиннее, замедление — короче
  useEffect(() => {
    if (!run || last.current === index) return;
    if (last.current !== -1) {
      haptic(finished ? 'success' : 'heavy');
      try {
        if (navigator.vibrate) navigator.vibrate(finished ? [300, 120, 300] : current && current.kind === 'fast' ? [400] : [150, 80, 150]);
      } catch (_) { /* не все телефоны умеют */ }
    }
    last.current = index;
  }, [index, run, finished, current]);

  if (!phases.length) return null;

  const start = () => { last.current = -1; setRun({ since: Date.now(), done: 0 }); haptic('medium'); };
  const pause = () => setRun((r) => ({ since: 0, done: r.done + (Date.now() - r.since) / 1000 }));
  const resume = () => setRun((r) => ({ ...r, since: Date.now() }));
  const reset = () => { last.current = -1; setRun(null); };

  return (
    <div className={'intervals' + (current ? ' intervals--' + current.kind : '')}>
      <div className="intervals__plan small muted">Интервалы: {intervalsText(intervals, track)} · всего {clockText(total)}</div>
      {run && !finished && current && (
        <div className="intervals__now" aria-live="polite">
          <div className="intervals__phase">{current.label}{current.mode ? ' · ' + current.mode : ''}</div>
          <div className="intervals__left">{clockText(left)}</div>
          <div className="intervals__round small">Круг {current.round} из {intervals.rounds}</div>
          <div className="intervals__bar"><span style={{ transform: `scaleX(${Math.min(1, elapsed / total)})` }} /></div>
        </div>
      )}
      {finished && <div className="intervals__phase">Интервалы закончены</div>}
      <div className="workout__toolbar">
        {!run && <button type="button" className="button button--primary" onClick={start}>Запустить интервалы</button>}
        {run && !finished && (run.since
          ? <button type="button" className="button" onClick={pause}>Пауза</button>
          : <button type="button" className="button button--primary" onClick={resume}>Продолжить</button>)}
        {run && <button type="button" className="button" onClick={reset}>Сбросить</button>}
      </div>
    </div>
  );
}
