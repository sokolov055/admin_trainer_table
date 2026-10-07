import React from 'react';
import { METRICS, GOALS, SPEED_UNIT_MACHINES, cardioGoal, goalFirst, metricField, settingsFields } from '../exercise-track.js';

/**
 * Кардио в программе — свои поля вместо «подходы · повторы · вес»:
 * тренажёр, основной режим (дорожка — скорость и наклон, эллипс — уровень,
 * велотренажёр и «другое» — скорость в км/ч или об/мин и уровень, гребля —
 * нагрузка), главную цель (время, расстояние, калории или интервалы — с неё
 * начинаются план и отрезок в занятии) и что ещё записывать (пульс тоже).
 * Интервалы — ускорение и замедление, каждое со своим временем и режимом.
 */

/** Название упражнения по тренажёру: по нему сервер свяжет его с базой */
export const MACHINE_NAMES = {
  treadmill: 'Беговая дорожка',
  skillmill: 'Механическая дорожка',
  rower: 'Гребной тренажёр',
  elliptical: 'Эллипс',
  bike: 'Велотренажёр',
  stepper: 'Степпер',
  other: 'Кардио',
};

export function newCardio(machine = 'treadmill') {
  return {
    machine,
    goal: 'time',
    metrics: ['time'],
    targets: { time: '20', distance: '', kcal: '', pulse: '' },
    settings: { speed: '', incline: '', level: '' },
    intervals: null,
  };
}

const PULSE_HINT = '130–150';

/** Коротко — чтобы тренажёры помещались в две строки на телефоне */
const MACHINE_CHIPS = {
  treadmill: 'Дорожка',
  skillmill: 'SkillMill',
  rower: 'Гребля',
  elliptical: 'Эллипс',
  bike: 'Велотренажёр',
  stepper: 'Степпер',
  other: 'Другое',
};

const NEW_INTERVALS = { rounds: 6, fast: { time: '1:00', speed: '', incline: '', level: '' }, slow: { time: '2:00', speed: '', incline: '', level: '' } };

export default function CardioPlan({ value, track, disabled, onChange }) {
  const c = value;
  const set = (patch) => onChange({ ...c, ...patch });
  const setIn = (key, field, v) => set({ [key]: { ...(c[key] || {}), [field]: v } });
  const goal = cardioGoal(c);
  const intervals = goal === 'intervals';
  // Главная цель-число всегда среди записываемого — в зале есть что записать
  const metrics = goalFirst(c.metrics, goal);
  const sorted = (list) => METRICS.filter((x) => list.includes(x));
  // Прежняя главная остаётся записываемой: время обычно смотрят и так.
  // Интервалы — цель «пройти круги»; ушли с них — интервалов нет
  const pickGoal = (m) => set(m === 'intervals'
    ? { goal: m, intervals: c.intervals || NEW_INTERVALS }
    : { goal: m, metrics: sorted([...metrics, m]), intervals: null });
  const toggle = (m) => {
    const next = metrics.includes(m) ? metrics.filter((x) => x !== m) : [...metrics, m];
    // У интервалов хоть что-то записывать надо: по нему отрезок и отмечают
    if (next.length) set({ metrics: sorted(next) });
  };
  const fields = settingsFields(track);
  const phase = (key, label) => {
    const p = (c.intervals && c.intervals[key]) || {};
    const edit = (field, v) => set({ intervals: { ...c.intervals, [key]: { ...p, [field]: v } } });
    return (
      <div className="cardio-plan__phase">
        <span className="field__label">{label}</span>
        <div className="cardio-plan__grid">
          <label><span>Время, мм:сс</span><input className="field__input" aria-label={label + ': время'} placeholder="1:00" inputMode="text" maxLength={8} value={p.time || ''} disabled={disabled} onChange={(e) => edit('time', e.target.value)} /></label>
          {fields.map((f) => (
            <label key={f.key}><span>{f.head}</span><input className="field__input" aria-label={label + ': ' + f.head} inputMode={f.mode} maxLength={f.max} value={p[f.key] || ''} disabled={disabled} onChange={(e) => edit(f.key, e.target.value)} /></label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="cardio-plan">
      <div className="chips cardio-plan__machines" role="radiogroup" aria-label="Тренажёр">
        {Object.entries(MACHINE_CHIPS).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={track.machine === k} className={'chip' + (track.machine === k ? ' chip--active' : '')} disabled={disabled} onClick={() => set({ machine: k })}>{label}</button>
        ))}
      </div>

      {/* Скорость велотренажёра и аэробайка — по тому, что показывает экран тренажёра */}
      {SPEED_UNIT_MACHINES.includes(track.machine) && (
        <div>
          <span className="field__label">Скорость</span>
          <div className="chips" role="radiogroup" aria-label="Скорость в">
            {[['', 'км/ч'], ['rpm', 'об/мин']].map(([k, label]) => (
              <button key={label} type="button" role="radio" aria-checked={(c.speedUnit || '') === k} className={'chip' + ((c.speedUnit || '') === k ? ' chip--active' : '')} disabled={disabled} onClick={() => set({ speedUnit: k })}>{label}</button>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="field__label">Главная цель</span>
        <div className="chips" role="radiogroup" aria-label="Главная цель">
          {GOALS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={goal === m} className={'chip' + (goal === m ? ' chip--active' : '')} disabled={disabled} onClick={() => pickGoal(m)}>{m === 'intervals' ? 'Интервалы' : metricField(m, track).short}</button>
          ))}
        </div>
      </div>

      {/* Интервалы: круги и есть цель; режим — у ускорения и замедления свой */}
      {intervals && c.intervals ? (
        <>
          <label className="cardio-plan__rounds"><span className="field__label">Кругов</span><input className="field__input" aria-label="Кругов" inputMode="numeric" maxLength={2} value={c.intervals.rounds || ''} disabled={disabled} onChange={(e) => set({ intervals: { ...c.intervals, rounds: e.target.value.replace(/\D/g, '') } })} /></label>
          {phase('fast', 'Ускорение')}
          {phase('slow', 'Замедление')}
        </>
      ) : fields.length > 0 && (
        <div className="cardio-plan__grid">
          {fields.map((f) => (
            <label key={f.key}><span>{f.head}</span><input className="field__input" aria-label={f.head} inputMode={f.mode} maxLength={f.max} value={(c.settings && c.settings[f.key]) || ''} disabled={disabled} onChange={(e) => setIn('settings', f.key, e.target.value)} /></label>
          ))}
        </div>
      )}

      <div>
        <span className="field__label">{intervals ? 'Записывать' : 'Ещё записывать'}</span>
        <div className="chips">
          {METRICS.filter((m) => m !== goal).map((m) => (
            <button key={m} type="button" aria-pressed={metrics.includes(m)} className={'chip' + (metrics.includes(m) ? ' chip--active' : '')} disabled={disabled} onClick={() => toggle(m)}>{metricField(m, track).short}</button>
          ))}
        </div>
      </div>
      {/* Цели-числа. У интервалов не обязательны: время отрезка — сумма кругов */}
      <div className="cardio-plan__grid">
        {metrics.map((m) => {
          const f = metricField(m, track);
          return (
            <label key={m}><span>Цель: {f.head.toLowerCase()}</span><input className="field__input" aria-label={'Цель: ' + f.head} placeholder={m === 'pulse' ? PULSE_HINT : ''} inputMode={m === 'pulse' ? 'text' : f.mode} maxLength={m === 'pulse' ? 9 : f.max} value={(c.targets && c.targets[m]) || ''} disabled={disabled} onChange={(e) => setIn('targets', m, e.target.value)} /></label>
          );
        })}
      </div>
    </div>
  );
}
