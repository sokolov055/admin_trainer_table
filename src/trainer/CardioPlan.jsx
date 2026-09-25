import React from 'react';
import { METRICS, metricField, settingsFields } from '../exercise-track.js';

/**
 * Кардио в программе — свои поля вместо «подходы · повторы · вес»:
 * тренажёр, основной режим (дорожка — скорость и наклон, эллипс и
 * велотренажёр — уровень, гребля — нагрузка), что записывать и какие цели
 * (время, расстояние, калории, пульс — любые из списка) и интервалы:
 * ускорение и замедление, каждое со своим временем и режимом.
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

export default function CardioPlan({ value, track, disabled, onChange }) {
  const c = value;
  const set = (patch) => onChange({ ...c, ...patch });
  const setIn = (key, field, v) => set({ [key]: { ...(c[key] || {}), [field]: v } });
  const toggle = (m) => {
    const has = c.metrics.includes(m);
    // Хоть одна метрика должна остаться — иначе в зале нечего записать
    if (has && c.metrics.length === 1) return;
    set({ metrics: has ? c.metrics.filter((x) => x !== m) : METRICS.filter((x) => x === m || c.metrics.includes(x)) });
  };
  const phase = (key, label) => {
    const p = (c.intervals && c.intervals[key]) || {};
    const edit = (field, v) => set({ intervals: { ...c.intervals, [key]: { ...p, [field]: v } } });
    return (
      <div className="cardio-plan__phase">
        <span className="field__label">{label}</span>
        <div className="cardio-plan__grid">
          <label><span>Время, мм:сс</span><input className="field__input" aria-label={label + ': время'} placeholder="1:00" inputMode="text" maxLength={8} value={p.time || ''} disabled={disabled} onChange={(e) => edit('time', e.target.value)} /></label>
          {settingsFields(track).map((f) => (
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

      {settingsFields(track).length > 0 && (
        <div className="cardio-plan__grid">
          {settingsFields(track).map((f) => (
            <label key={f.key}><span>{f.head}</span><input className="field__input" aria-label={f.head} inputMode={f.mode} maxLength={f.max} value={(c.settings && c.settings[f.key]) || ''} disabled={disabled} onChange={(e) => setIn('settings', f.key, e.target.value)} /></label>
          ))}
        </div>
      )}

      <div>
        <span className="field__label">Что записывать</span>
        <div className="chips">
          {METRICS.map((m) => (
            <button key={m} type="button" aria-pressed={c.metrics.includes(m)} className={'chip' + (c.metrics.includes(m) ? ' chip--active' : '')} disabled={disabled} onClick={() => toggle(m)}>{metricField(m, track).short}</button>
          ))}
        </div>
      </div>
      <div className="cardio-plan__grid">
        {c.metrics.map((m) => {
          const f = metricField(m, track);
          return (
            <label key={m}><span>Цель: {f.head.toLowerCase()}</span><input className="field__input" aria-label={'Цель: ' + f.head} placeholder={m === 'pulse' ? PULSE_HINT : ''} inputMode={m === 'pulse' ? 'text' : f.mode} maxLength={m === 'pulse' ? 9 : f.max} value={(c.targets && c.targets[m]) || ''} disabled={disabled} onChange={(e) => setIn('targets', m, e.target.value)} /></label>
          );
        })}
      </div>

      <label className="library__check">
        <input type="checkbox" checked={!!c.intervals} disabled={disabled} onChange={(e) => set({
          intervals: e.target.checked ? { rounds: 6, fast: { time: '1:00', speed: '', incline: '', level: '' }, slow: { time: '2:00', speed: '', incline: '', level: '' } } : null,
        })} />
        Интервалы: ускорение и замедление
      </label>
      {c.intervals && (
        <>
          <label className="cardio-plan__rounds"><span className="field__label">Повторов</span><input className="field__input" inputMode="numeric" maxLength={2} value={c.intervals.rounds || ''} disabled={disabled} onChange={(e) => set({ intervals: { ...c.intervals, rounds: e.target.value.replace(/\D/g, '') } })} /></label>
          {phase('fast', 'Ускорение')}
          {phase('slow', 'Замедление')}
        </>
      )}
    </div>
  );
}
