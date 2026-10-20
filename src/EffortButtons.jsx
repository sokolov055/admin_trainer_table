import React from 'react';
import { EFFORTS, EFFORT_HINT } from './effort.js';
import { haptic } from './telegram.js';
import { unlockAlarm } from './rest-alarm.js';

/**
 * «Легко / Норм / Тяжело» вместо галочки подхода (03.10.2026): каждая
 * кнопка отмечает подход и запускает отдых — короче после «Легко», дольше
 * после «Тяжело» (effort.js). current — ближайший подход текущего
 * упражнения (кнопки залиты), иначе — контуром. Разминка (FT-620): оценка
 * ничего не решает, поэтому одна кнопка «Готово». hint — подсказка, что
 * значат кнопки, пока в занятии нет ни одной оценки
 */
export function EffortChooser({ onPick, current = true, warmup = false, hint = false }) {
  return (
    <>
      <div className={'workout__effort' + (current ? '' : ' workout__effort--quiet')} role="group" aria-label="Подход сделан — как прошло?">
        {warmup
          ? <button type="button" className="workout__effort-btn workout__effort-btn--ok workout__effort-btn--warmup"
            onClick={() => { haptic(); unlockAlarm(); onPick(''); }}>Готово</button>
          : EFFORTS.map((e) => (
            <button type="button" key={e.key} className={'workout__effort-btn workout__effort-btn--' + e.key}
              onClick={() => { haptic(); unlockAlarm(); onPick(e.key); }}>{e.label}</button>
          ))}
      </div>
      {hint && <p className="workout__effort-hint">{EFFORT_HINT}</p>}
    </>
  );
}

/**
 * «Как прошло?» у уже отмеченного подхода: поменять оценку, если нажали
 * не ту. Текущая — залита, остальные — контуром. Отдых не перезапускается
 */
export function EffortFix({ current, onPick }) {
  return (
    <div className="workout__effort-fix">
      <p className="workout__effort-fix-title">Как прошло? Нажали не то — поменяйте</p>
      <div className="workout__effort workout__effort--quiet" role="group" aria-label="Как прошёл подход">
        {EFFORTS.map((e) => (
          <button type="button" key={e.key} aria-pressed={current === e.key}
            className={'workout__effort-btn workout__effort-btn--' + e.key + (current === e.key ? ' workout__effort-btn--on' : '')}
            onClick={() => { if (current !== e.key) { haptic(); onPick(e.key); } }}>{e.label}</button>
        ))}
      </div>
    </div>
  );
}
