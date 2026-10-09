import React, { useEffect, useRef, useState } from 'react';
import { haptic } from './telegram.js';
import { intervalPhases, intervalsText, clockText } from './exercise-track.js';

/**
 * Таймер интервалов кардио: фазы круга (ускорение, замедление, сколько
 * задал тренер) — столько раз, сколько кругов. На дорожке смотреть в
 * телефон неудобно, поэтому смена фазы — вибрацией, а на экране крупно:
 * что сейчас, сколько осталось и какую цель держать.
 *
 * Фаза без времени («20 ккал») сама не кончается: таймер считает вверх и
 * ждёт «Дальше» (09.10.2026). «Дальше» есть и у фазы со временем — сделал
 * раньше.
 *
 * Время считается от момента старта, а не тиками: заблокировал телефон,
 * разблокировал — таймер там, где должен быть. Состояние живёт на экране и
 * в занятие не пишется — это подсказка, а не запись.
 */
export default function IntervalTimer({ intervals, track }) {
  const phases = intervalPhases(intervals, track);
  const total = phases.reduce((n, p) => n + p.seconds, 0);
  // { from, since, done }: фаза, с которой идёт отсчёт; since — когда
  // продолжили (0 — пауза); done — секунд от from до паузы
  const [run, setRun] = useState(null);
  const [, tick] = useState(0);
  const last = useRef(-1);

  const passed = run ? run.done + (run.since ? (Date.now() - run.since) / 1000 : 0) : 0;
  // От from идём по фазам со временем; на фазе без времени остаёмся
  let index = run ? run.from : 0;
  let inPhase = passed;
  while (index < phases.length && phases[index].seconds > 0 && inPhase >= phases[index].seconds) {
    inPhase -= phases[index].seconds;
    index += 1;
  }
  const finished = !!run && index >= phases.length;
  const current = phases[index];
  const timed = current && current.seconds > 0;
  const left = timed ? current.seconds - inPhase : 0;

  useEffect(() => {
    if (!run || !run.since || finished) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [run, finished]);

  // Смена фазы — вибрация: первая фаза круга — длиннее, остальные — короче
  useEffect(() => {
    if (!run || last.current === index) return;
    if (last.current !== -1) {
      haptic(finished ? 'success' : 'heavy');
      try {
        if (navigator.vibrate) navigator.vibrate(finished ? [300, 120, 300] : current && current.index === 0 ? [400] : [150, 80, 150]);
      } catch (_) { /* не все телефоны умеют */ }
    }
    last.current = index;
  }, [index, run, finished, current]);

  if (!phases.length) return null;

  const start = () => { last.current = -1; setRun({ from: 0, since: Date.now(), done: 0 }); haptic('medium'); };
  const pause = () => setRun((r) => ({ ...r, since: 0, done: r.done + (Date.now() - r.since) / 1000 }));
  const resume = () => setRun((r) => ({ ...r, since: Date.now() }));
  const next = () => setRun((r) => ({ from: index + 1, since: r.since ? Date.now() : 0, done: 0 }));
  const reset = () => { last.current = -1; setRun(null); };
  const rounds = Number(intervals.rounds) || 1;
  // Полоса: доля пройденных фаз, внутри фазы со временем — по времени
  const share = finished ? 1 : (index + (timed ? inPhase / current.seconds : 0)) / phases.length;

  return (
    <div className={'intervals' + (current ? ' intervals--' + (current.index === 0 ? 'fast' : 'slow') : '')}>
      <div className="intervals__plan small muted">Интервалы: {intervalsText(intervals, track)}{total && phases.every((p) => p.seconds > 0) ? ' · всего ' + clockText(total) : ''}</div>
      {run && !finished && current && (
        <div className="intervals__now" aria-live="polite">
          <div className="intervals__phase">{current.label}{current.mode ? ' · ' + current.mode : ''}</div>
          <div className="intervals__left">{clockText(timed ? left : inPhase)}</div>
          <div className="intervals__round small">Круг {current.round} из {rounds}{timed ? '' : ' · по готовности — «Дальше»'}</div>
          <div className="intervals__bar"><span style={{ transform: `scaleX(${Math.min(1, share)})` }} /></div>
        </div>
      )}
      {finished && <div className="intervals__phase">Интервалы закончены</div>}
      <div className="workout__toolbar">
        {!run && <button type="button" className="button button--primary" onClick={start}>Запустить интервалы</button>}
        {run && !finished && <button type="button" className={'button' + (timed ? '' : ' button--primary')} onClick={next}>Дальше</button>}
        {run && !finished && (run.since
          ? <button type="button" className="button" onClick={pause}>Пауза</button>
          : <button type="button" className="button button--primary" onClick={resume}>Продолжить</button>)}
        {run && <button type="button" className="button" onClick={reset}>Сбросить</button>}
      </div>
    </div>
  );
}
