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

export default function ExerciseKind({ track, onChange, disabled = false, className = '', note = null }) {
  const set = (patch) => onChange({ ...track, ...patch });
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
      <span className="exercise-kind__label">Вид</span>
      <div className="chips chips--flush chips--wrap exercise-kind__row" role="radiogroup" aria-label="Что записывать">
        {Object.entries(KIND_LABELS).map(([k, v]) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={track.kind === k}
            className={'chip' + (track.kind === k ? ' chip--active' : '')}
            disabled={disabled}
            onClick={() => track.kind !== k && set({ kind: k, machine: k === 'cardio' ? (track.machine || 'treadmill') : '' })}
          >{v}</button>
        ))}
      </div>
      {track.kind !== 'cardio' && (
        <div className="chips chips--flush chips--wrap exercise-kind__row">
          {/* Работа: включено — одной стороной (рука, нога по очереди), выключено —
              двумя сразу, так по умолчанию. Вес на сторону — у веса, не здесь */}
          {toggle('unilateral', 'По одной стороне')}
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
  const { kind, machine, unilateral, perSide } = track;
  const res = await apiMutate('library.exercise.track', {
    ...(exerciseId ? { exerciseId } : {}),
    name: String(name || '').trim(),
    track: { kind, machine: machine || '', unilateral: !!unilateral, perSide: !!perSide },
  });
  return res && res.exercise ? res.exercise : null;
}
