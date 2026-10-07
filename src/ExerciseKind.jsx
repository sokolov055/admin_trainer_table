import React from 'react';
import { apiMutate } from './api.js';
import { KIND_LABELS, MACHINE_LABELS } from './exercise-track.js';
import { IconCheck } from './icons.jsx';

/**
 * Вид упражнения: что записывать в подходе, повторы на каждую сторону, вес
 * с одной стороны. Одно и то же меню в программе, шаблоне и идущем занятии
 * (решение владельца 07.10.2026) — и правка всегда уходит в базу тренера
 * (saveExerciseTrack): программы и шаблоны вид не хранят, а берут из базы,
 * поэтому исправленное в зале сразу видно и в шаблонах, и в программах.
 *
 * Всё — чипами одного кегля, как остальные переключатели приложения: тип —
 * один из, «на каждую сторону» и «вес с одной стороны» — включить/выключить
 * (с галочкой). Выпадающий список и флажки разного размера смотрелись
 * громоздко и не складывались с полями (владелец, 07.10.2026).
 */

// Короткие подписи: чипы встают в ряд даже в узкой колонке суперсета
const KIND_SHORT = { ...KIND_LABELS, bodyweight: 'Свой вес' };
const MACHINE_SHORT = { ...MACHINE_LABELS, skillmill: 'SkillMill', rower: 'Гребля' };

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
        {Object.entries(KIND_SHORT).map(([k, v]) => (
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
      {track.kind === 'cardio' ? (
        <div className="chips chips--flush chips--wrap exercise-kind__row" role="radiogroup" aria-label="Тренажёр">
          {Object.entries(MACHINE_SHORT).map(([k, v]) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={track.machine === k}
              className={'chip exercise-kind__toggle' + (track.machine === k ? ' is-on' : '')}
              disabled={disabled}
              onClick={() => set({ machine: k })}
            >{v}</button>
          ))}
        </div>
      ) : (
        <div className="chips chips--flush chips--wrap exercise-kind__row">
          {toggle('unilateral', 'На каждую сторону')}
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
  const { kind, machine, unilateral, perSide } = track;
  const res = await apiMutate('library.exercise.track', {
    ...(exerciseId ? { exerciseId } : {}),
    name: String(name || '').trim(),
    track: { kind, machine: machine || '', unilateral: !!unilateral, perSide: !!perSide },
  });
  return res && res.exercise ? res.exercise : null;
}
