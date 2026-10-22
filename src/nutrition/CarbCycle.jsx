import React from 'react';
import { haptic } from '../telegram.js';
import { CARB_CYCLE_STEPS, CARB_CYCLE_DEFAULT, cycleTargets } from './carbs.js';
import { n } from './diary-ui.jsx';
import './carbs.css';

/**
 * Переключатель тренера «Углеводы по дням тренировок» в «Назначить цель»
 * (FT-709). value — процент сдвига, 0 — выключено. Предпросмотр считает
 * цель дня тренировки и дня отдыха из введённых цифр тем же расчётом, что и
 * сервер (carbs.js ↔ server/src/lib/carb-days.js).
 */
export function CarbCycleField({ value, onChange, targets }) {
  const on = value > 0;
  const base = { kcal: Number(targets.kcal), protein: Number(targets.protein), fat: Number(targets.fat), carbs: Number(targets.carbs) };
  const ready = Object.values(base).every((v) => Number.isFinite(v) && v >= 0) && base.carbs > 0;
  const train = ready && on ? cycleTargets(base, 'train', value) : null, rest = ready && on ? cycleTargets(base, 'rest', value) : null;
  const line = (t) => 'У ' + n(t.carbs) + ' г · Ж ' + n(t.fat) + ' г';
  return (
    <div className="carb-cycle">
      <label className="carb-cycle__switch">
        <input type="checkbox" checked={on} onChange={(e) => { haptic(); onChange(e.target.checked ? CARB_CYCLE_DEFAULT : 0); }} />
        Углеводы по дням тренировок
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        В день тренировки углеводов больше, в день отдыха — меньше. Калории и белок те же, разницу берут на себя жиры.
        Дни — из календаря занятий и журнала тренировок; без расписания цель обычная.
      </p>
      {on && (
        <>
          <div className="chips chips--wrap chips--flush" role="radiogroup" aria-label="На сколько менять углеводы">
            {CARB_CYCLE_STEPS.map((step) => (
              <button key={step} type="button" role="radio" aria-checked={value === step} className={'chip' + (value === step ? ' chip--active' : '')} onClick={() => { haptic(); onChange(step); }}>±{step} %</button>
            ))}
          </div>
          {train && rest && (
            <p className="carb-cycle__preview">
              День тренировки: {line(train)}<br />
              День отдыха: {line(rest)}<br />
              Калории — {n(base.kcal)} ккал, белок — {n(base.protein)} г в оба дня.
            </p>
          )}
        </>
      )}
    </div>
  );
}
