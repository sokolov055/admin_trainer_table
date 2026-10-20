import React from 'react';
import { apiMutate } from './api.js';
import { KIND_LABELS } from './exercise-track.js';
import { IconCheck } from './icons.jsx';

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

export default function ExerciseKind({ track, onChange, disabled = false, className = '', note = null, allowAuto = false }) {
  const set = (patch) => onChange({ ...track, ...patch });
  // В карточке упражнения (Library.jsx) есть «Определить само»: тип по
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
          >{auto ? 'Само: ' + KIND_LABELS[track.kind].toLowerCase() : 'Определить само'}</button>
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
