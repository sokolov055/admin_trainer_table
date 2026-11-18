import React, { useMemo, useRef, useState } from 'react';
import { Sheet, Loading } from '../ui.jsx';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import { ExerciseThumb } from '../client/PlanCard.jsx';
import { IconPlus, IconSearch, IconClose } from '../icons.jsx';
import { chipsOf, startChip, shownOf, newName, togglePick, addLabel, rowsOf, PAGE } from './exercise-add-model.js';
import './exercise-card.css';

/**
 * «＋ Упражнения» (этап 5, шаг 3, 18.11.2026, FT-798) — лист снизу с сеткой
 * картинок (те же, что в строке упражнения), «Недавние» — что тренер ставил
 * чаще, плашки мышц, поиск. Отметить сразу несколько — номер в кружке
 * показывает порядок; «Добавить 3 · по 3 × 12» ставит их в конец
 * тренировки, схему правят потом в карточке. Нет в базе — «＋ Новое: „…“»
 * под поиском: упражнение заводится в базе и сразу отмечается.
 * Логика — exercise-add-model.js.
 */
export default function ExerciseAdd({ base, loading = false, make, onAdd, onAdded, onClose }) {
  const [q, setQ] = useState('');
  const [chip, setChip] = useState(() => startChip(base));
  const [picked, setPicked] = useState([]);
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState('');
  const closeRef = useRef(null);

  const chips = useMemo(() => chipsOf(base), [base]);
  // Плашка пропала (база пришла позже, «Недавних» нет) — «Все»
  const on = chips.some((c) => c.id === chip) ? chip : chips[0].id;
  const shown = useMemo(() => shownOf(base, { q, chip: on }), [base, q, on]);
  const fresh = newName(base, q);

  const pick = (id) => { setPicked((p) => togglePick(p, id)); haptic('light'); };
  const choose = (id) => { setChip(id); setLimit(PAGE); haptic('light'); };

  const create = async () => {
    setCreating(true);
    setFailure('');
    try {
      const saved = await apiMutate('library.exercise.save', { name: fresh });
      onAdded(saved);
      setPicked((p) => (p.includes(saved.id) ? p : [...p, saved.id]));
      setQ('');
      haptic('success');
    } catch (err) {
      setFailure(err.message || 'Не получилось добавить');
    } finally {
      setCreating(false);
    }
  };

  const done = () => {
    if (!picked.length) return;
    onAdd(rowsOf(picked, base, make));
    haptic('success');
    if (closeRef.current) closeRef.current(); else onClose();
  };

  return (
    <Sheet title="Добавить упражнения" className="exa-sheet" onClose={onClose} closeRef={closeRef} dirty={picked.length > 0}>
      <div className="exa">
        <label className="exa-search">
          <IconSearch size={18} />
          <input
            type="search"
            aria-label="Поиск или новое упражнение"
            placeholder="Поиск или новое"
            value={q}
            maxLength={160}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); setFailure(''); }}
          />
          {q && <button type="button" className="exa-search__x" aria-label="Очистить поиск" onClick={() => setQ('')}><IconClose size={16} /></button>}
        </label>
        {fresh && (
          <button type="button" className="exa-new" disabled={creating} onClick={create}>
            <IconPlus size={16} />
            <span>{creating ? 'Добавляем…' : <>Новое: «{fresh}»</>}</span>
          </button>
        )}
        {failure && <p className="exa-fail" role="alert">{failure}</p>}

        <div className="exa-chips" role="radiogroup" aria-label="Какие упражнения показать">
          {chips.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={c.id === on} className={'exa-chip' + (c.id === on ? ' is-on' : '')} onClick={() => choose(c.id)}>{c.label}</button>
          ))}
        </div>

        {loading && !base.length
          ? <Loading lead={false} rows={3} />
          : shown.length
            ? (
              <div className="exa-grid">
                {shown.slice(0, limit).map((e) => {
                  const n = picked.indexOf(e.id);
                  return (
                    <button key={e.id} type="button" className={'exa-tile' + (n >= 0 ? ' is-on' : '')} aria-pressed={n >= 0}
                      aria-label={e.name + (n >= 0 ? ', отмечено ' + (n + 1) + '-м' : '')} onClick={() => pick(e.id)}>
                      <ExerciseThumb ex={{ exercise: e }} className="exa-tile__pic" />
                      <span className="exa-tile__name">{e.name}</span>
                      {n >= 0 && <span key={n} className="exa-tile__n" aria-hidden="true">{n + 1}</span>}
                    </button>
                  );
                })}
              </div>
            )
            : <p className="exa-empty">{q ? 'Ничего не нашлось' + (fresh ? ' — добавьте новое' : '') : 'Здесь пока пусто'}</p>}
        {shown.length > limit && (
          <button type="button" className="button button--ghost button--block exa-more" onClick={() => setLimit((l) => l + PAGE)}>
            Показать ещё {Math.min(PAGE, shown.length - limit)}
          </button>
        )}
      </div>
      <div className="exc-foot">
        <button type="button" className="button button--primary exc-foot__ok" disabled={!picked.length} onClick={done}>{addLabel(picked.length)}</button>
      </div>
    </Sheet>
  );
}
