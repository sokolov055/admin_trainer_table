import React, { useEffect, useRef, useState } from 'react';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { IconCheck } from '../icons.jsx';
import { MuscleFigure, MuscleNames, LABELS } from './MuscleMap.jsx';

/**
 * Правка карты мышц упражнения тренером (FT-491, владелец 08.10.2026:
 * «чтобы тренер мог менять, сам выделять и сам переписывать»).
 *
 * Тап по мышце на фигуре или по её названию в списке: не задействована →
 * основная → синергист → снова не задействована. Как и вид упражнения,
 * правка уходит в базу тренера (у общего — своя версия), поэтому видна во
 * всех программах, шаблонах и итогах. Сохраняется сама, через ~0,7 с после
 * последнего тапа; «Как было» — снова угадывать по группе и названию.
 *
 * В панели упражнения рядом с названием, видом и настройкой тренажёра
 * полная фигура со списком мышц перегружала бы её, поэтому по умолчанию —
 * строка «маленькая фигура + основная группа и синергисты» и «Изменить».
 */

const ORDER = Object.keys(LABELS);
const NEXT = { idle: 'primary', primary: 'secondary', secondary: 'idle' };

export async function saveExerciseMuscles({ exerciseId, name, muscles }) {
  const res = await apiMutate('library.exercise.muscles', {
    ...(exerciseId ? { exerciseId } : {}),
    name: String(name || '').trim(),
    muscles,
  });
  return res && res.exercise ? res.exercise : null;
}

export default function MuscleEdit({ exerciseId, name, muscles, custom = false, onSaved }) {
  const [value, setValue] = useState(() => ({
    primary: (muscles && muscles.primary) || [],
    secondary: (muscles && muscles.secondary) || [],
  }));
  const [mine, setMine] = useState(custom);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(null); // { text, error }
  const timer = useRef(null);
  const target = useRef({ exerciseId, name });
  target.current = { exerciseId, name };
  useEffect(() => () => clearTimeout(timer.current), []);

  const stateOf = (r) => (value.primary.includes(r) ? 'primary' : value.secondary.includes(r) ? 'secondary' : 'idle');

  const save = (next) => {
    clearTimeout(timer.current);
    setNote(null);
    timer.current = setTimeout(() => {
      saveExerciseMuscles({ ...target.current, muscles: next })
        .then((saved) => {
          if (saved) {
            setMine(!!saved.musclesCustom);
            if (next === null && saved.muscles) setValue(saved.muscles);
            if (onSaved) onSaved(saved);
          }
          setNote({ text: 'Сохранено в базе — везде так' });
        })
        .catch((error) => setNote({ text: 'В базу не сохранилось: ' + (error.message || 'нет связи'), error: true }));
    }, next === null ? 0 : 700);
  };

  const tap = (r) => {
    const to = NEXT[stateOf(r)];
    const next = {
      primary: value.primary.filter((x) => x !== r).concat(to === 'primary' ? [r] : []),
      secondary: value.secondary.filter((x) => x !== r).concat(to === 'secondary' ? [r] : []),
    };
    setValue(next);
    setMine(true);
    haptic();
    save(next);
  };

  if (!open) {
    return (
      <div className="muscle-edit">
        <span className="exercise-kind__label">Мышцы</span>
        <div className="muscle-edit__row">
          <MuscleFigure primary={value.primary} secondary={value.secondary} size="sm" />
          <MuscleNames primary={value.primary} secondary={value.secondary} max={3}
            empty={<p className="muscles__hint" style={{ flex: 1 }}>Мышцы не отмечены</p>} />
          <button type="button" className="button muscle-edit__open" onClick={() => { setOpen(true); haptic(); }}>Изменить</button>
        </div>
        {note && (
          <p className={'exercise-kind__note' + (note.error ? ' exercise-kind__note--error' : '')} role="status">
            {!note.error && <IconCheck size={13} />}
            {note.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="muscle-edit">
      <div className="muscle-edit__head">
        <span className="exercise-kind__label">Мышцы</span>
        <div className="muscle-edit__head-actions">
          {mine && (
            <button type="button" className="button button--ghost muscle-edit__reset" onClick={() => { setMine(false); save(null); }}>
              Как было
            </button>
          )}
          <button type="button" className="button muscle-edit__open" onClick={() => { setOpen(false); haptic(); }}>Готово</button>
        </div>
      </div>
      <MuscleFigure primary={value.primary} secondary={value.secondary} size="lg" onTap={tap} captions />
      <MuscleNames primary={value.primary} secondary={value.secondary} max={8}
        empty={<p className="muscles__hint">Мышцы не отмечены</p>} />
      <p className="muscles__hint">Тап по мышце: основная → синергист → снять</p>
      <div className="chips chips--flush chips--wrap muscle-edit__chips">
        {ORDER.map((r) => {
          const st = stateOf(r);
          return (
            <button
              type="button"
              key={r}
              className={'chip muscle-edit__chip muscle-edit__chip--' + st}
              aria-label={LABELS[r] + ': ' + (st === 'primary' ? 'основная' : st === 'secondary' ? 'синергист' : 'не задействована')}
              onClick={() => tap(r)}
            >
              {st !== 'idle' && <span className={'muscles__dot muscles__dot--' + st} aria-hidden="true" />}
              {LABELS[r]}
            </button>
          );
        })}
      </div>
      {note && (
        <p className={'exercise-kind__note' + (note.error ? ' exercise-kind__note--error' : '')} role="status">
          {!note.error && <IconCheck size={13} />}
          {note.text}
        </p>
      )}
    </div>
  );
}
