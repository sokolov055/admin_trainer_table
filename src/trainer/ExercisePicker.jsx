import React, { useMemo, useRef, useState } from 'react';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';

/**
 * Название упражнения с подсказками из базы.
 *
 * Упражнение в программе — ссылка на объект базы: выбранное из списка
 * приносит с собой технику, видео, мышцы. Вписанное руками сервер свяжет
 * по названию сам; нет такого в базе — рядом «Добавить в базу», и
 * упражнение станет объектом, не выходя из редактора.
 */

const key = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.,()]/g, ' ').replace(/\s+/g, ' ').trim();
const LIMIT = 8;

export default function ExercisePicker({ value, exerciseId, exercises, disabled, onPick, onAdded }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [failure, setFailure] = useState('');
  const inputRef = useRef(null);

  // Список — частью страницы, а не поверх: на телефоне всплывающий под
  // полем оказывался под клавиатурой. Поле при вводе поднимается к верху
  // экрана, и варианты видны между ним и клавиатурой.
  const lift = () => {
    const el = inputRef.current;
    if (el && el.scrollIntoView) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
  };

  const q = key(value);
  const linked = exerciseId ? exercises.find((e) => e.id === exerciseId) : null;
  const exact = exercises.find((e) => key(e.name) === q);

  const matches = useMemo(() => {
    if (!q) return [];
    const words = q.split(' ');
    return exercises
      .filter((e) => { const k = key(e.name); return words.every((w) => k.includes(w)); })
      .sort((a, b) => Number(!key(a.name).startsWith(q)) - Number(!key(b.name).startsWith(q)))
      .slice(0, LIMIT);
  }, [q, exercises]);

  const known = linked || exact;

  const add = async () => {
    setAdding(true);
    setFailure('');
    try {
      const saved = await apiMutate('library.exercise.save', { name: value.trim() });
      haptic('success');
      onAdded && onAdded(saved);
      onPick({ name: saved.name, exerciseId: saved.id });
    } catch (err) {
      setFailure(err.message || 'Не получилось добавить');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="picker">
      <input
        ref={inputRef}
        className="field__input picker__input"
        placeholder="Упражнение"
        value={value}
        maxLength={160}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => { onPick({ name: e.target.value, exerciseId: null }); if (!open) lift(); setOpen(true); }}
        onFocus={() => { setOpen(true); if (value) lift(); }}
        // Задержка — чтобы нажатие по подсказке успело сработать до закрытия
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      {open && matches.length > 0 && !(matches.length === 1 && known && matches[0].id === known.id) && (
        <ul className="picker__list" role="listbox">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                role="option"
                aria-selected={e.id === exerciseId}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => { onPick({ name: e.name, exerciseId: e.id }); setOpen(false); haptic(); }}
              >
                <span className="picker__name">{e.name}</span>
                <span className="picker__meta">{[e.muscle, e.equipment].filter(Boolean).join(' · ')}{e.media ? ' · видео' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {known && (
        <span className="picker__state picker__state--linked">
          из базы{[known.muscle, known.equipment].filter(Boolean).length ? ' · ' + [known.muscle, known.equipment].filter(Boolean).join(' · ') : ''}
          {known.media ? ' · есть видео' : ''}
        </span>
      )}
      {!known && q && q.length > 2 && (
        <span className="picker__state">
          нет в базе ·{' '}
          <button type="button" className="picker__add" disabled={adding || disabled} onClick={add}>
            {adding ? 'добавляю…' : 'добавить в базу'}
          </button>
        </span>
      )}
      {failure && <span className="picker__state picker__state--bad">{failure}</span>}
    </div>
  );
}
