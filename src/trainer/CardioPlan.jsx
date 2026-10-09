import React, { useEffect, useState } from 'react';
import { METRICS, MODES, PHASE_KEYS, MAX_PHASES, cardioGoal, goalFirst, metricField, settingsFields, phaseField, phaseName, phaseKeys, phasesOf, intervalsUse, seconds } from '../exercise-track.js';

/**
 * Кардио в программе (09.10.2026, владелец) — свои поля вместо «подходы ·
 * повторы · вес». Сверху вид:
 *   аэробная тренировка — настройки (уровень, скорость, наклон — любые
 *     вместе) и цели (время, расстояние, калории, пульс — тоже любые);
 *   функциональное кардио — интервалы: круги, у ускорения и замедления своё
 *     время, настройки и цель — расстояние, калории, пульс. Общей цели-числа
 *     нет: цель — пройти круги.
 * Тренажёр не выбирается: настройки задаёт тренер (modes в плане).
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

/** Настройки — в порядке, в каком о них думают в зале */
const MODE_CHIPS = [['level', 'Уровень сложности'], ['speed', 'Скорость'], ['incline', 'Угол наклона']];
const KINDS = [[false, 'Аэробная тренировка'], [true, 'Функциональное кардио']];

export const NEW_INTERVALS = {
  rounds: 6,
  phases: [{ fields: ['time', 'speed'], time: '60', speed: '' }, { fields: ['time', 'speed'], time: '120', speed: '' }],
};

/** Время фазы в поле — секундами: старое «1:00» показываем как «60» */
const phaseValue = (p, k) => (k === 'time' && String(p.time || '').includes(':') ? String(seconds(p.time)) : p[k] || '');

/**
 * Интервалы в плане: круги, фазы и то, что из них следует, — что записывать
 * в отрезке и какие настройки у него (intervalsUse): у функционального
 * кардио их отдельно не выбирают
 */
export function withIntervals(cardio, intervals) {
  return { ...cardio, intervals, ...intervalsUse(intervals) };
}

/**
 * Круги и фазы интервалов — в шаблоне, программе клиента и в самом занятии
 * (активном и выполненном, «Исправить результат»). Фаз в круге сколько
 * угодно (до 10), у каждой название и свой набор целей и настроек.
 */
export function IntervalsEdit({ intervals, track, disabled, onChange }) {
  const iv = intervals || NEW_INTERVALS;
  const phases = phasesOf(iv);
  // Круги — своим полем: пока число стирают, в план уходит прежнее. Пустые
  // круги сервер не принимает, и занятие, сохранившись посреди ввода,
  // теряло интервалы — форма пропадала из-под пальцев (FT-511)
  const [rounds, setRounds] = useState(String(iv.rounds || ''));
  useEffect(() => { setRounds(String(iv.rounds || '')); }, [iv.rounds]);
  const editRounds = (text) => {
    const v = text.replace(/\D/g, '');
    setRounds(v);
    if (Number(v) >= 1 && Number(v) <= 50) onChange({ ...iv, rounds: Number(v) });
  };
  // Старый вид (fast/slow) при первой правке становится списком фаз
  const save = (list) => { const { fast, slow, ...rest } = iv; onChange({ ...rest, phases: list }); };
  const editPhase = (i, patch) => save(phases.map((p, k) => (k === i ? { ...p, fields: phaseKeys(p), ...patch } : p)));
  const phase = (p, i) => {
    const name = phaseName(p, i);
    const keys = phaseKeys(p);
    const toggle = (k) => editPhase(i, { fields: PHASE_KEYS.filter((x) => (x === k ? !keys.includes(k) : keys.includes(x))) });
    return (
      <div className="cardio-plan__phase" key={i}>
        <div className="cardio-plan__phase-head">
          <input className="field__input" aria-label={'Интервал ' + (i + 1) + ': название'} placeholder={phaseName({}, i)} maxLength={30} value={p.name || ''} disabled={disabled} onChange={(e) => editPhase(i, { name: e.target.value })} />
          {phases.length > 1 && <button type="button" className="button button--ghost" aria-label={'Убрать: ' + name} disabled={disabled} onClick={() => save(phases.filter((_, k) => k !== i))}>Убрать</button>}
        </div>
        <div className="chips" role="group" aria-label={name + ': что задать'}>
          {PHASE_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={keys.includes(k)} className={'chip' + (keys.includes(k) ? ' chip--active' : '')} disabled={disabled} onClick={() => toggle(k)}>{phaseField(k, track).short}</button>
          ))}
        </div>
        {keys.length > 0 && (
          <div className="cardio-plan__grid">
            {keys.map((k) => {
              const f = phaseField(k, track);
              return <label key={k}><span>{f.head}</span><input className="field__input" aria-label={name + ': ' + f.head} placeholder={f.placeholder || ''} inputMode={f.mode} maxLength={f.max} value={phaseValue(p, k)} disabled={disabled} onChange={(e) => editPhase(i, { [k]: k === 'time' ? e.target.value.replace(/\D/g, '') : e.target.value })} /></label>;
            })}
          </div>
        )}
      </div>
    );
  };
  return (
    <>
      <label className="cardio-plan__rounds"><span className="field__label">Кругов</span><input className="field__input" aria-label="Кругов" inputMode="numeric" maxLength={2} value={rounds} disabled={disabled} onChange={(e) => editRounds(e.target.value)} onBlur={() => setRounds(String(iv.rounds || ''))} /></label>
      {phases.map(phase)}
      <button type="button" className="button button--ghost" disabled={disabled || phases.length >= MAX_PHASES} onClick={() => save([...phases, { fields: ['time'], time: '' }])}>+ Интервал</button>
    </>
  );
}

// Главная — первая из выбранных целей-итогов: с неё начинаются план и
// отрезок в занятии. Пульс — зона, а не итог, главной не бывает
const mainOf = (list) => list.find((m) => m !== 'pulse') || 'time';

/** Кардио другого вида: функциональное — с интервалами, аэробное — без */
export function withKind(c, functional) {
  // Что записывать — по фазам; ушли в аэробную — интервалов нет
  return functional
    ? { ...withIntervals(c, c.intervals || NEW_INTERVALS), goal: 'intervals' }
    : { ...c, goal: mainOf(goalFirst(c.metrics, cardioGoal(c))), intervals: null };
}

/**
 * «Аэробная тренировка / Функциональное кардио» — в программе над полями,
 * в занятии — у названия вместе с видом упражнения (FT-513)
 */
export function CardioKind({ value, disabled, onChange }) {
  const functional = cardioGoal(value) === 'intervals';
  return (
    <div className="chips" role="radiogroup" aria-label="Вид кардио">
      {KINDS.map(([f, label]) => (
        <button key={label} type="button" role="radio" aria-checked={functional === f} className={'chip' + (functional === f ? ' chip--active' : '')} disabled={disabled} onClick={() => functional !== f && onChange(withKind(value, f))}>{label}</button>
      ))}
    </div>
  );
}

/**
 * Интервалы отрезка в занятии (FT-513, владелец): вместо «Время / Скорость» —
 * круги и каждый интервал с его целями. Что задаётся у интервала и как он
 * называется — в плане (IntervalsEdit); здесь только числа, свои в каждом
 * круге суперсета.
 */
export function IntervalsRow({ intervals, track, label, disabled, onChange }) {
  const iv = intervals || NEW_INTERVALS;
  const phases = phasesOf(iv);
  // Круги — своим полем, как в IntervalsEdit: пока стирают, уходит прежнее
  const [rounds, setRounds] = useState(String(iv.rounds || ''));
  useEffect(() => { setRounds(String(iv.rounds || '')); }, [iv.rounds]);
  const editRounds = (text) => {
    const v = text.replace(/\D/g, '');
    setRounds(v);
    if (Number(v) >= 1 && Number(v) <= 50) onChange({ rounds: Number(v), phases });
  };
  const editPhase = (i, k, v) => onChange({ rounds: iv.rounds, phases: phases.map((p, j) => (j === i ? { ...p, fields: phaseKeys(p), [k]: k === 'time' ? v.replace(/\D/g, '') : v } : p)) });
  return (
    <div className="intervals-row">
      <label className="intervals-row__rounds"><span>Кругов</span>
        <input aria-label={label + ', кругов'} inputMode="numeric" maxLength={2} value={rounds} disabled={disabled} onChange={(e) => editRounds(e.target.value)} onBlur={() => setRounds(String(iv.rounds || ''))} />
      </label>
      {phases.map((p, i) => {
        const keys = phaseKeys(p);
        return (
          <div className="intervals-row__phase" key={i}>
            <span className="intervals-row__name">{phaseName(p, i)}</span>
            <div className="intervals-row__fields">
              {keys.map((k) => {
                const f = phaseField(k, track);
                return <label key={k}><span>{f.head}</span><input aria-label={label + ', ' + phaseName(p, i).toLowerCase() + ', ' + f.head.toLowerCase()} inputMode={f.mode} placeholder={f.placeholder || ''} maxLength={f.max} value={phaseValue(p, k)} disabled={disabled} onChange={(e) => editPhase(i, k, e.target.value)} /></label>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function CardioPlan({ value, track, disabled, onChange, kind = true }) {
  const c = value;
  const set = (patch) => onChange({ ...c, ...patch });
  const setIn = (key, field, v) => set({ [key]: { ...(c[key] || {}), [field]: v } });
  const goal = cardioGoal(c);
  const functional = goal === 'intervals';
  const metrics = goalFirst(c.metrics, goal);
  const sorted = (list) => METRICS.filter((x) => list.includes(x));
  const toggle = (m) => {
    const next = sorted(metrics.includes(m) ? metrics.filter((x) => x !== m) : [...metrics, m]);
    // Отрезок отмечают по итогу — время, расстояние или калории
    if (next.some((x) => x !== 'pulse')) set({ metrics: next, goal: mainOf(next) });
  };
  const fields = settingsFields(track);
  const modes = fields.map((f) => f.key);
  // Выбор сохраняется списком: старый план «по тренажёру» становится явным
  const toggleMode = (k) => set({ modes: MODES.filter((m) => (modes.includes(k) ? m !== k && modes.includes(m) : m === k || modes.includes(m))) });

  const chip = (key, label, on, onClick) => (
    <button key={key} type="button" aria-pressed={on} className={'chip' + (on ? ' chip--active' : '')} disabled={disabled} onClick={onClick}>{label}</button>
  );
  // Скорость — по тому, что показывает экран тренажёра
  const speedUnit = modes.includes('speed') && (
    <div>
      <span className="field__label">Скорость</span>
      <div className="chips" role="radiogroup" aria-label="Скорость в">
        {[['', 'км/ч'], ['rpm', 'об/мин']].map(([k, label]) => (
          <button key={label} type="button" role="radio" aria-checked={(track.speedUnit || '') === k} className={'chip' + ((track.speedUnit || '') === k ? ' chip--active' : '')} disabled={disabled} onClick={() => set({ speedUnit: k, modes })}>{label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="cardio-plan">
      {kind && <CardioKind value={c} disabled={disabled} onChange={onChange} />}

      {/* У каждого вида — только свои настройки (владелец, 09.10.2026) */}
      {functional ? (
        <>
          {speedUnit}
          {c.intervals && <IntervalsEdit intervals={c.intervals} track={track} disabled={disabled} onChange={(iv) => onChange(withIntervals(c, iv))} />}
        </>
      ) : (
        <>
          <div>
            <span className="field__label">Настройки</span>
            <div className="chips" role="group" aria-label="Настройки">
              {MODE_CHIPS.map(([k, label]) => chip(k, label, modes.includes(k), () => toggleMode(k)))}
            </div>
          </div>
          {speedUnit}
          {fields.length > 0 && (
            <div className="cardio-plan__grid">
              {fields.map((f) => (
                <label key={f.key}><span>{f.head}</span><input className="field__input" aria-label={f.head} inputMode={f.mode} maxLength={f.max} value={(c.settings && c.settings[f.key]) || ''} disabled={disabled} onChange={(e) => setIn('settings', f.key, e.target.value)} /></label>
              ))}
            </div>
          )}
          <div>
            <span className="field__label">Цель</span>
            <div className="chips" role="group" aria-label="Цель">
              {METRICS.map((m) => chip(m, metricField(m, track).short, metrics.includes(m), () => toggle(m)))}
            </div>
          </div>
          <div className="cardio-plan__grid">
            {metrics.map((m) => {
              const f = metricField(m, track);
              return (
                <label key={m}><span>Цель: {f.head.toLowerCase()}</span><input className="field__input" aria-label={'Цель: ' + f.head} placeholder={m === 'pulse' ? PULSE_HINT : ''} inputMode={m === 'pulse' ? 'text' : f.mode} maxLength={m === 'pulse' ? 9 : f.max} value={(c.targets && c.targets[m]) || ''} disabled={disabled} onChange={(e) => setIn('targets', m, e.target.value)} /></label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
