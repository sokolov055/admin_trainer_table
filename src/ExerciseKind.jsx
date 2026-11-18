import React from 'react';
import { apiMutate } from './api.js';
import { KIND_LABELS } from './exercise-track.js';
import { IconCheck, IconDumbbell, IconBody, IconClock, IconPulse } from './icons.jsx';
import './exercise-kind-tiles.css';

/**
 * Вид упражнения: что записывать в подходе и работа одной стороной или двумя
 * (вес на одну сторону — отметка у веса: в программе и у каждого подхода). Одно и то же меню в программе, шаблоне и идущем занятии
 * (решение владельца 07.10.2026) — и правка всегда уходит в базу тренера
 * (saveExerciseTrack): программы и шаблоны вид не хранят, а берут из базы,
 * поэтому исправленное в зале сразу видно и в шаблонах, и в программах.
 *
 * Всё — чипами одного кегля, как остальные переключатели приложения: тип —
 * один из, «на каждую сторону» и «вес с одной стороны» — включить/выключить
 * (с галочкой). Выпадающий список и флажки разного размера смотрелись
 * громоздко и не складывались с полями (владелец, 07.10.2026).
 */

// Тренажёр у кардио больше не выбирают (владелец, 09.10.2026): настройки —
// скорость, наклон, уровень — тренер задаёт в карточке кардио (CardioPlan)

/** Плитки вида (18.11.2026, FT-802): картинка и короткое слово */
const TILES = [
  ['strength', 'Вес', IconDumbbell],
  ['bodyweight', 'Своё тело', IconBody],
  ['timed', 'Время', IconClock],
  ['cardio', 'Кардио', IconPulse],
];

/**
 * Вид упражнения плитками (FT-802, макет 18.11.2026) — в «Об упражнении»
 * редактора программы и в листе упражнения идущего занятия: четыре плитки
 * с картинкой, «по одной стороне» и «вес с одной стороны» — плашками-
 * переключателями с маленьким рисунком. Учёт тот же, что у чипов
 */
function KindTiles({ track, set, disabled, className, note }) {
  const side = (key, label, bars) => (
    <button
      type="button"
      className={'ek-side' + (track[key] ? ' is-on' : '')}
      aria-pressed={!!track[key]}
      disabled={disabled}
      onClick={() => set({ [key]: !track[key] })}
    >
      <span className="ek-side__ill" aria-hidden="true">{bars.map((on, i) => <i key={i} className={on ? 'is-a' : ''} />)}</span>
      <span className="ek-side__t">{label}</span>
    </button>
  );
  return (
    <div className={'ek' + (className ? ' ' + className : '')}>
      <span className="ek__label">Как записывать</span>
      <div className="ek-kinds" role="radiogroup" aria-label="Как записывать">
        {TILES.map(([k, label, Icon]) => {
          const on = track.kind === k;
          return (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={on}
              aria-label={KIND_LABELS[k]}
              className={'ek-kind' + (on ? ' is-on' : '')}
              disabled={disabled}
              onClick={() => !on && set({ kind: k, auto: false, weightMode: undefined, machine: k === 'cardio' ? (track.machine || 'treadmill') : '' })}
            >
              <Icon size={24} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {track.kind !== 'cardio' && (
        <div className="ek-sides">
          {side('unilateral', 'По одной стороне', [true, false])}
          {track.kind === 'strength' && side('perSide', 'Вес с одной стороны', [true, true])}
          {track.kind === 'bodyweight' && (
            <button
              type="button"
              className={'ek-side' + (track.weightMode === 'assistance' ? ' is-on' : '')}
              aria-pressed={track.weightMode === 'assistance'}
              disabled={disabled}
              onClick={() => set({ weightMode: track.weightMode === 'assistance' ? undefined : 'assistance' })}
            >
              <span className="ek-side__ill ek-side__ill--up" aria-hidden="true"><i className="is-a" /><i /></span>
              <span className="ek-side__t">Вес помощи</span>
            </button>
          )}
        </div>
      )}
      {note && (
        <p className={'exercise-kind__note' + (note.error ? ' exercise-kind__note--error' : '')} role="status">
          {!note.error && <IconCheck size={13} />}
          {note.text}
        </p>
      )}
    </div>
  );
}

export default function ExerciseKind({ track, onChange, disabled = false, className = '', note = null, allowAuto = false, tiles = false }) {
  const set = (patch) => onChange({ ...track, ...patch });
  if (tiles && !allowAuto) return <KindTiles track={track} set={set} disabled={disabled} className={className} note={note} />;
  // В карточке упражнения (Library.jsx) есть «Автоматически»: тип по
  // названию и мышце (сервер, exercise-kind.js); auto — текущая догадка
  const auto = allowAuto && !!track.auto;
  const toggle = (key, label) => (
    <button
      type="button"
      className={'chip exercise-kind__toggle' + (track[key] ? ' is-on' : '')}
      aria-pressed={!!track[key]}
      disabled={disabled}
      onClick={() => set({ [key]: !track[key] })}
    >
      {track[key] && <IconCheck size={14} />}
      {label}
    </button>
  );
  return (
    <div className={'exercise-kind' + (className ? ' ' + className : '')}>
      <span className="exercise-kind__label">Как учитывать нагрузку</span>
      <div className="chips chips--flush chips--wrap exercise-kind__row" role="radiogroup" aria-label="Как учитывать нагрузку">
        {allowAuto && (
          <button
            type="button"
            role="radio"
            aria-checked={auto}
            className={'chip' + (auto ? ' chip--active' : '')}
            disabled={disabled}
            onClick={() => !auto && onChange({ ...track, auto: true, weightMode: undefined })}
          >{auto ? 'Автоматически: ' + KIND_LABELS[track.kind].toLowerCase() : 'Автоматически'}</button>
        )}
        {Object.entries(KIND_LABELS).map(([k, v]) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={!auto && track.kind === k}
            className={'chip' + (!auto && track.kind === k ? ' chip--active' : '')}
            disabled={disabled}
            // Другой тип — другой учёт: «вес помощи» своего веса снимается
            onClick={() => (auto || track.kind !== k) && set({ kind: k, auto: false, weightMode: undefined, machine: k === 'cardio' ? (track.machine || 'treadmill') : '' })}
          >{v}</button>
        ))}
      </div>
      {!auto && track.kind === 'bodyweight' && <label className="library__check"><input type="checkbox" checked={track.weightMode === 'assistance'} disabled={disabled} onChange={(e) => set({ weightMode: e.target.checked ? 'assistance' : undefined })} />Вес помощи и повторения</label>}
      {!auto && track.weightMode === 'assistance' && <p className="small muted">Чем больше вес помощи, тем легче упражнение.</p>}
      {!auto && track.kind !== 'cardio' && (
        <div className="chips chips--flush chips--wrap exercise-kind__row">
          {/* Работа: включено — одной стороной (рука, нога по очереди), выключено —
              двумя сразу, так по умолчанию. Вес на сторону — у веса, не здесь */}
          {toggle('unilateral', 'По одной стороне')}
          {/* Вес с одной стороны — гантели, Смит, рычажные: в объёме удвоенный.
              До 20.10.2026 было только в карточке упражнения, своим флажком */}
          {track.kind === 'strength' && toggle('perSide', 'Вес с одной стороны')}
        </div>
      )}
      {note && (
        <p className={'exercise-kind__note' + (note.error ? ' exercise-kind__note--error' : '')} role="status">
          {!note.error && <IconCheck size={13} />}
          {note.text}
        </p>
      )}
    </div>
  );
}

/**
 * Записать вид в базу тренера: своё упражнение правится, у общего — своя
 * версия, упражнения нет в базе — заводится своё. Ответ — упражнение базы
 * (id может смениться: своя версия или новое).
 */
export async function saveExerciseTrack({ exerciseId, name, track }) {
  const { kind, machine, unilateral, perSide, weightMode } = track;
  const res = await apiMutate('library.exercise.track', {
    ...(exerciseId ? { exerciseId } : {}),
    name: String(name || '').trim(),
    track: { kind, weightMode, machine: machine || '', unilateral: !!unilateral, perSide: !!perSide },
  });
  return res && res.exercise ? res.exercise : null;
}
