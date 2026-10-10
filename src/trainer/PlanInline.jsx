import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ExercisePicker from './ExercisePicker.jsx';
import ClientSetup from './ClientSetup.jsx';
import { ExerciseMachines } from './MachinesEditor.jsx';
import CardioPlan, { MACHINE_NAMES, newCardio } from './CardioPlan.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { haptic } from '../telegram.js';
import { apiPublic } from '../api.js';
import { useData } from '../useData.js';
import { trackOf, cardioFrom, planScheme, techniqueOf, techniqueText, planOneSide } from '../exercise-track.js';
import { IconPlus, IconLinkPair, IconCheck, IconTrash, IconClose } from '../icons.jsx';
import { patchPlanExercise } from '../plan-block-actions.js';
import ExerciseKind, { saveExerciseTrack } from '../ExerciseKind.jsx';
import MuscleEdit from '../muscles/MuscleEdit.jsx';

/**
 * Правка программы прямо в развёрнутой тренировке (владелец, 03.10.2026) —
 * вместо отдельного меню «Изменить программу»:
 *   тап по названию — из базы, нет в базе — «Добавить в базу»;
 *   тап по схеме «4 × 15» — повторы, вес, подходы: разминочный в начало,
 *     подход в конец, у подхода тип «Рабочий / Разминочный / Дропсет»;
 *     там же — соединить со следующим в суперсет или выйти из него;
 *   подержать упражнение — перетащить; суперсет едет целиком;
 *   смахнуть влево — удалить.
 * Каждое изменение сразу уходит на сервер всем месяцем (onChange родителя).
 */

export const blankExercise = () => ({
  name: '', weight: '', prevWeight: '', sets: '3', reps: '', rpe: '', supersetGroup: '',
  performers: [], splitWeights: {}, splitPrev: {}, exerciseId: null, technique: '', cardio: null,
});

export const cardioExercise = (machine = 'treadmill') => ({ ...blankExercise(), name: MACHINE_NAMES[machine], sets: '1', cardio: newCardio(machine) });

/** Упражнения подряд — блоками: суперсет одним блоком */
function unitsOf(list) {
  const out = [];
  list.forEach((e, i) => {
    const g = e.supersetGroup;
    const last = out[out.length - 1];
    if (g && last && last.group === g) last.idx.push(i);
    else out.push({ group: g || '', idx: [i] });
  });
  return out.map((u) => ({ ...u, group: u.idx.length > 1 ? u.group : '' }));
}

const count = (v, fallback = 3) => {
  const n = parseInt(String(v || ''), 10);
  return n > 0 ? Math.min(20, n) : fallback;
};

export function BlockEdit({ block, members = [], clientRow = 0, onChange, onRemove, canRemove = true }) {
  const library = useData('library.exercises', {}, []);
  const [extra, setExtra] = useState([]);
  const base = (library.data ? library.data.exercises : []).concat(extra);
  const list = block.exercises;
  const split = members.length > 1;

  // Что открыто: { kind: 'name' | 'scheme', i }
  const [open, setOpen] = useState(null);
  const [sure, setSure] = useState(false);
  const root = useRef(null);
  const drag = useRef(null);
  const swallow = useRef(false);

  // iPhone отменяет прокрутку только слушателю, который висел с начала касания
  useEffect(() => {
    const stop = (ev) => { if (drag.current) ev.preventDefault(); };
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);

  const set = (fn) => {
    const next = list.map((e) => ({ ...e }));
    fn(next);
    onChange(next);
  };
  const patch = (i, values) => onChange(patchPlanExercise(list, i, values));
  const latest = useRef(list);
  latest.current = list;

  /**
   * Вид упражнения (что записывать, на сторону) — в базу тренера, а не в
   * программу: программы и шаблоны берут его из базы, так что исправленное
   * здесь сразу видно везде (07.10.2026). Строки с тем же упражнением в этой
   * тренировке меняются сразу, не дожидаясь ответа
   */
  const [kindNote, setKindNote] = useState(null); // { i, text, error }
  const keyOf = (v) => String(v || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const changeTrack = (i, next) => {
    const ex = list[i];
    const same = (e) => (ex.exerciseId ? e.exerciseId === ex.exerciseId : !e.exerciseId && keyOf(e.name) === keyOf(ex.name));
    // Кардио в программе — со своим планом на тренажёре; ушло из кардио — плана нет
    const cardioOf = (e) => (next.kind === 'cardio'
      ? { cardio: e.cardio ? { ...e.cardio, machine: next.machine } : newCardio(next.machine) }
      : { cardio: null });
    onChange(list.map((e, k) => (k === i || same(e) ? { ...e, track: { ...next }, ...cardioOf(e) } : e)));
    setKindNote(null);
    saveExerciseTrack({ exerciseId: ex.exerciseId, name: ex.name, track: next })
      .then((saved) => {
        if (saved && !ex.exerciseId) {
          onChange(latest.current.map((e) => (!e.exerciseId && keyOf(e.name) === keyOf(ex.name) ? { ...e, exerciseId: saved.id } : e)));
        }
      })
      .catch((error) => setKindNote({ i, text: 'В базу не сохранилось: ' + (error.message || 'нет связи'), error: true }));
  };

  /** Мышцы сохранены в базе — у всех строк этой тренировки с тем же упражнением */
  const changeMuscles = (i, saved) => {
    const ex = latest.current[i];
    if (!ex) return;
    const same = (e) => (ex.exerciseId ? e.exerciseId === ex.exerciseId : !e.exerciseId && keyOf(e.name) === keyOf(ex.name));
    onChange(latest.current.map((e, k) => (k === i || same(e)
      ? { ...e, exerciseId: e.exerciseId || saved.id, muscles: saved.muscles, musclesCustom: !!saved.musclesCustom }
      : e)));
  };

  const toggle = (kind, i) => {
    if (swallow.current) return;
    setOpen((o) => (o && o.kind === kind && o.i === i ? null : { kind, i }));
  };

  /** Соединить со следующим в суперсет / выйти из суперсета */
  const joinNext = (i) => set((next) => {
    const a = next[i];
    const b = next[i + 1];
    if (!b) return;
    const g = a.supersetGroup || b.supersetGroup || 'g' + Date.now();
    const old = [a.supersetGroup, b.supersetGroup].filter(Boolean);
    next.forEach((e, k) => { if (k === i || k === i + 1 || old.includes(e.supersetGroup)) e.supersetGroup = g; });
    const sets = next.find((e) => e.supersetGroup === g && String(e.sets || '').trim());
    next.forEach((e) => { if (e.supersetGroup === g) e.sets = sets ? sets.sets : '3'; });
  });
  const leave = (i) => set((next) => {
    const g = next[i].supersetGroup;
    next[i].supersetGroup = '';
    const rest = next.filter((e) => e.supersetGroup === g);
    if (rest.length < 2) rest.forEach((e) => { e.supersetGroup = ''; });
  });
  const remove = (i) => { setOpen(null); set((next) => { next.splice(i, 1); }); };

  const add = (make) => {
    const at = list.length;
    set((next) => { next.push(make()); });
    setOpen({ kind: make === blankExercise ? 'name' : 'scheme', i: at });
  };

  /* ---------- Перестановка удержанием ---------- */
  const hold = (key) => (e) => {
    if (drag.current || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest && e.target.closest('input, textarea, select, .plan-inline__panel, .plan-inline__rounds-col--edit')) return;
    const x0 = e.clientX; const y0 = e.clientY; const id = e.pointerId; const head = e.currentTarget;
    const off = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', early);
      window.removeEventListener('pointerup', off);
      window.removeEventListener('pointercancel', off);
    };
    const early = (ev) => { if (ev.pointerId === id && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) off(); };
    const timer = setTimeout(() => { off(); begin(key, id, y0, head); }, 450);
    window.addEventListener('pointermove', early);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
  };
  const begin = (key, pointerId, y0, head) => {
    haptic('medium');
    flushSync(() => setOpen(null));
    const box = root.current;
    if (!box) return;
    try { head.setPointerCapture && head.setPointerCapture(pointerId); } catch (_) { /* старый браузер */ }
    const rows = [...box.querySelectorAll(':scope > [data-unit]')];
    const from = rows.findIndex((r) => r.dataset.unit === key);
    if (from < 0) return;
    const rects = rows.map((r) => r.getBoundingClientRect());
    const mid = (r) => r.top + r.height / 2;
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 8;
    const g = { to: from };
    drag.current = g;
    rows[from].classList.add('plan-inline__unit--lifted');
    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dy = ev.clientY - y0;
      const center = mid(rects[from]) + dy;
      let to = from;
      rects.forEach((r, k) => {
        if (k > from && center >= mid(r)) to = Math.max(to, k);
        if (k < from && center <= mid(r)) to = Math.min(to, k);
      });
      const shift = rects[from].height + gap;
      rows.forEach((row, k) => {
        if (k === from) { row.style.transform = `translate3d(0, ${dy}px, 0)`; return; }
        let s = 0;
        if (from < to && k > from && k <= to) s = -shift;
        if (from > to && k >= to && k < from) s = shift;
        row.style.transform = s ? `translate3d(0, ${s}px, 0)` : '';
      });
      if (to !== g.to) { g.to = to; haptic('light'); }
    };
    const finish = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      rows.forEach((row) => { row.style.transform = ''; row.classList.remove('plan-inline__unit--lifted'); });
      drag.current = null;
      swallow.current = true;
      setTimeout(() => { swallow.current = false; }, 350);
      if (ev.type === 'pointerup' && g.to !== from) {
        const units = unitsOf(list);
        const [moved] = units.splice(from, 1);
        units.splice(g.to, 0, moved);
        onChange(units.flatMap((u) => u.idx.map((i) => ({ ...list[i] }))));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  /* ---------- Строка упражнения ---------- */
  const row = (i, inSuperset, groupFirst = -1) => {
    const ex = list[i];
    const track = trackOf(ex);
    const scheme = planScheme(ex, inSuperset) || 'подходы не заданы';
    const weight = track.kind !== 'cardio' && !split && ex.weight ? ' · ' + ex.weight + (/^[+-]?\d/.test(String(ex.weight)) ? (planOneSide(ex) ? ' кг/стор.' : ' кг') : '') : '';
    const isName = open && open.kind === 'name' && open.i === i;
    const isScheme = open && open.kind === 'scheme' && open.i === i;
    // Силовое в суперсете: повторы и вес всегда на виду, круги — справа от скобки
    const inline = inSuperset && !split && track.kind !== 'cardio';
    // Тап по повторам, весу или кругам открывает правку всего суперсета сразу
    const groupOpen = !!(open && open.kind === 'group' && open.i === groupFirst);
    return (
      <SwipeRow
        key={i}
        className={'plan-inline__row' + (isName || isScheme ? ' plan-inline__row--open' : '')}
        label={'Удалить упражнение ' + (ex.name || i + 1)}
        disabled={!!open}
        onDelete={() => remove(i)}
      >
        {isName
          ? (
            <div className="plan-inline__panel">
              <ExercisePicker
                autoFocus
                value={ex.name}
                exerciseId={ex.exerciseId}
                exercises={base}
                onPick={({ name, exerciseId }) => {
                  const pick = exerciseId && base.find((x) => x.id === exerciseId);
                  const changed = (exerciseId || null) !== (ex.exerciseId || null) || name !== ex.name;
                  patch(i, {
                    name, exerciseId: exerciseId || null,
                    track: pick && pick.track ? pick.track : undefined,
                    // Другое упражнение — «было» прежнего ему не подходит
                    ...(changed ? {
                      prevWeight: '', lastWeight: '', startSets: undefined,
                      lastRun: undefined, exercise: pick || null,
                      muscles: pick ? pick.muscles : undefined,
                      musclesCustom: pick ? !!pick.musclesCustom : false,
                    } : {}),
                  });
                }}
                onAdded={(saved) => setExtra((prev) => [...prev, saved])}
              />
              {/* Вид упражнения — как в идущем занятии; пишется в базу */}
              {clientRow && ex.exerciseId ? <ClientSetup exerciseId={ex.exerciseId} clientRow={clientRow}
                members={split ? (ex.performers && ex.performers.length ? members.filter((m) => ex.performers.includes(m)) : members) : []} /> : null}
              {ex.name && <ExerciseKind track={trackOf(ex)} onChange={(t) => changeTrack(i, t)} note={kindNote && kindNote.i === i ? kindNote : null} />}
              {/* Карта мышц (FT-491): основная группа и синергисты — в базу тренера */}
              {ex.name && (
                <MuscleEdit
                  // По названию, не по id: первое сохранение заводит упражнение
                  // в базе, и id появляется — правка не должна от этого схлопнуться
                  key={keyOf(ex.name)}
                  exerciseId={ex.exerciseId}
                  name={ex.name}
                  muscles={ex.muscles}
                  custom={!!ex.musclesCustom}
                  onSaved={(saved) => changeMuscles(i, saved)}
                />
              )}
              {/* Тренажёры и оборудование (10.10.2026) — прямо в программе */}
              {ex.name && <ExerciseMachines key={'m:' + keyOf(ex.name)} exerciseId={ex.exerciseId} name={ex.name} />}
              <div className="plan-inline__panel-actions">
                <button type="button" className="button button--primary" onClick={() => setOpen(ex.name ? null : { kind: 'name', i })}>Готово</button>
              </div>
            </div>
          )
          : (
            <button type="button" className="plan-inline__name" onClick={() => toggle('name', i)}>
              {ex.name || <span className="muted">Название упражнения</span>}
            </button>
          )}
        {!isName && inline && groupOpen && (
          <div className="plan-inline__inline">
            <div className="plan-inline__fields">{repsWeight(i)}</div>
            {(ex.lastWeight || ex.prevWeight) && <span className="plan-inline__prev">было {ex.lastWeight || ex.prevWeight}</span>}
          </div>
        )}
        {/* Правка суперсета: выйти из него — у каждого упражнения, присоединить следующее — у нижнего (FT-473, FT-486) */}
        {!isName && inline && groupOpen && (
          <div className="plan-inline__group-actions">
            <button type="button" className="button" onClick={() => { leave(i); haptic(); }}>Выйти из суперсета</button>
            {list[i + 1] && list[i + 1].supersetGroup !== ex.supersetGroup && i === list.map((e) => e.supersetGroup).lastIndexOf(ex.supersetGroup) && (
              <button type="button" className="button" onClick={() => { joinNext(i); haptic(); }}><IconLinkPair size={16} />В суперсет со следующим</button>
            )}
          </div>
        )}
        {!isName && !(inline && groupOpen) && (
          <button type="button" className={'plan-inline__scheme' + (isScheme ? ' is-open' : '')} aria-expanded={!!isScheme} onClick={() => (inline ? toggle('group', groupFirst) : toggle('scheme', i))}>
            <strong>{scheme.split(' · ')[0]}</strong>
            {scheme.split(' · ').slice(1).map((p, k) => <span key={k}> · {p}</span>)}
            {weight && <span>{weight}</span>}
            {!split && (ex.lastWeight || ex.prevWeight) && <span className="plan-inline__prev">было {ex.lastWeight || ex.prevWeight}</span>}
          </button>
        )}
        {isScheme && !inline && schemePanel(i)}
      </SwipeRow>
    );
  };

  /* ---------- Подходы, повторы, вес ---------- */
  const [pickedSet, setPickedSet] = useState(-1);
  useEffect(() => { setPickedSet(-1); }, [open && open.i, open && open.kind]);

  /** Подходы упражнения: разминочные + рабочие, смена типа и удаление */
  const setsModel = (i) => {
    const ex = list[i];
    const track = trackOf(ex);
    const tech = techniqueOf(ex.technique);
    const work = count(ex.sets);
    const strength = track.kind === 'strength' || track.kind === 'bodyweight';
    const pills = [
      ...Array.from({ length: tech.warmup }, () => 'warmup'),
      ...Array.from({ length: work }, (_, k) => (k === work - 1 && tech.dropset ? 'drop' : 'work')),
    ];
    const setTech = (t) => patch(i, { technique: techniqueText({ ...tech, ...t }) });
    const kindOf = (p) => pills[p];
    const choose = (kind) => {
      const p = pickedSet;
      const now = kindOf(p);
      if (now === kind) return;
      if (kind === 'warmup' && now !== 'warmup') {
        // Рабочий стал разминочным — разминка в начале, рабочих на один меньше
        if (work <= 1 || tech.warmup >= 5) return;
        patch(i, { sets: String(work - 1), technique: techniqueText({ warmup: tech.warmup + 1, dropset: now === 'drop' ? false : tech.dropset }) });
        setPickedSet(tech.warmup);
      } else if (now === 'warmup') {
        patch(i, { sets: String(Math.min(20, work + 1)), technique: techniqueText({ warmup: tech.warmup - 1, dropset: kind === 'drop' || tech.dropset }) });
        setPickedSet(kind === 'drop' ? pills.length - 1 : tech.warmup - 1);
      } else {
        // Дропсет — только последний рабочий
        setTech({ dropset: kind === 'drop' });
        if (kind === 'drop') setPickedSet(pills.length - 1);
      }
    };
    const removeAt = (p) => {
      const now = kindOf(p);
      if (now === 'warmup') setTech({ warmup: tech.warmup - 1 });
      else if (work > 1) patch(i, { sets: String(work - 1), ...(now === 'drop' ? { technique: techniqueText({ ...tech, dropset: false }) } : {}) });
      setPickedSet(-1);
    };
    const removePicked = () => removeAt(pickedSet);
    // Последний рабочий не удаляется: упражнение без подходов — это удаление
    const removable = (p) => pills.length > 1 && (kindOf(p) === 'warmup' || work > 1);
    return { ex, track, tech, work, strength, pills, setTech, kindOf, choose, removeAt, removePicked, removable };
  };

  /** Повторы и вес — узкие поля по ширине цифр */
  const fieldOf = (i, key, label, placeholder, mode = 'text') => (
    <label className={'plan-inline__field plan-inline__field--' + key}>
      <span>{label}</span>
      <input className="field__input" inputMode={mode} placeholder={placeholder} maxLength={80} value={list[i][key] || ''} onChange={(e) => patch(i, { [key]: e.target.value })} />
    </label>
  );
  const repsWeight = (i) => {
    const ex = list[i];
    const track = trackOf(ex);
    const one = planOneSide(ex);
    return (
      <>
        {fieldOf(i, 'reps', track.kind === 'timed' ? 'Время, с' : track.unilateral ? 'Повт. / сторона' : 'Повторы', track.kind === 'timed' ? '60' : '12')}
        {!split && fieldOf(i, 'weight', track.kind === 'strength' ? (one ? 'Кг / сторона' : 'Вес, кг') : 'Доп. вес', track.kind === 'strength' ? '—' : 'свой', 'decimal')}
        {/* Вес на одну сторону — начальная отметка подходов занятия (07.10.2026) */}
        {!split && track.kind === 'strength' && (
          <button
            type="button"
            className={'chip exercise-kind__toggle plan-inline__side' + (one ? ' is-on' : '')}
            aria-pressed={one}
            onClick={() => patch(i, { technique: techniqueText({ ...techniqueOf(ex.technique), side: one ? 'two' : 'one' }) })}
          >{one && <IconCheck size={13} />}на сторону</button>
        )}
      </>
    );
  };

  const schemePanel = (i) => {
    const { ex, track, tech, work, strength, pills, setTech, kindOf, choose, removeAt, removePicked, removable } = setsModel(i);
    const next = list[i + 1];
    const inGroup = !!ex.supersetGroup && list.filter((e) => e.supersetGroup === ex.supersetGroup).length > 1;
    return (
      <div className="plan-inline__panel">
        {track.kind === 'cardio'
          ? (
            <CardioPlan
              value={cardioFrom(ex, track)}
              track={track}
              onChange={(c) => patch(i, {
                cardio: c,
                ...(c.machine && c.machine !== track.machine && (!ex.name || Object.values(MACHINE_NAMES).includes(ex.name)) ? { name: MACHINE_NAMES[c.machine], exerciseId: null } : {}),
              })}
            />
          )
          : (
            <>
              <div className="plan-inline__fields">{repsWeight(i)}</div>
              <div className="plan-inline__sets-head">
                <span>{inGroup ? 'Круги' : 'Подходы'}</span>
                <span className="muted">{tech.warmup ? tech.warmup + ' разм. + ' : ''}{work} раб.</span>
              </div>
              {/* Разминочный — вверху, рядом с началом списка; «в конец» — внизу
                  (владелец, 07.10.2026) */}
              {strength && (
                <div className="plan-inline__set-add plan-inline__set-add--top">
                  <button type="button" className="button" disabled={tech.warmup >= 5} onClick={() => setTech({ warmup: tech.warmup + 1 })}><IconPlus size={16} />Разминочный в начало</button>
                </div>
              )}
              <div className="plan-inline__sets" role="listbox" aria-label="Подходы">
                {/* Крестик у каждого подхода (владелец, 07.10.2026): удалить
                    одним касанием, а не «выбрать → Удалить выбранный» */}
                {pills.map((p, k) => (
                  <span className="plan-inline__set-wrap" key={k}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={pickedSet === k}
                      className={'plan-inline__set plan-inline__set--' + p + (pickedSet === k ? ' is-on' : '')}
                      onClick={() => setPickedSet(pickedSet === k ? -1 : k)}
                    >{p === 'warmup' ? 'Р' : p === 'drop' ? 'Д' : k - tech.warmup + 1}</button>
                    {removable(k) && (
                      <button type="button" className="plan-inline__set-x" aria-label={'Удалить подход ' + (p === 'warmup' ? 'разминочный' : k - tech.warmup + 1)} onClick={() => { removeAt(k); haptic(); }}>
                        <IconClose size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <p className="plan-inline__sets-help">Нажмите подход, чтобы сменить тип; крестик — удалить.</p>
              {pickedSet >= 0 && pickedSet < pills.length && (
                <div className="plan-inline__set-kind">
                  <div className="chips chips--flush" role="radiogroup" aria-label="Тип подхода">
                    {[['work', 'Рабочий'], ['warmup', 'Разминочный'], ...(strength ? [['drop', 'Дропсет']] : [])].map(([k, label]) => (
                      <button type="button" key={k} role="radio" aria-checked={kindOf(pickedSet) === k} className={'chip' + (kindOf(pickedSet) === k ? ' chip--active' : '')} onClick={() => choose(k)}>{label}</button>
                    ))}
                  </div>
                  <button type="button" className="button button--ghost" disabled={pills.length <= 1 || (kindOf(pickedSet) !== 'warmup' && work <= 1)} onClick={removePicked}><IconTrash size={16} />Удалить выбранный подход</button>
                </div>
              )}
              <div className="plan-inline__set-add">
                <button type="button" className="button" disabled={work >= 20} onClick={() => patch(i, { sets: String(work + 1) })}><IconPlus size={16} />{inGroup ? 'Круг в конец' : 'Подход в конец'}</button>
              </div>
            </>
          )}

        {/* Сплит: кто делает и с каким весом */}
        {split && (
          <div className="plan-inline__split">
            {members.map((m) => {
              const doing = !ex.performers || !ex.performers.length || ex.performers.includes(m);
              return (
                <div className="plan-inline__person" key={m}>
                  <button type="button" className={'chip' + (doing ? ' chip--active' : '')} aria-pressed={doing} onClick={() => {
                    const active = ex.performers && ex.performers.length ? ex.performers : members;
                    const on = active.includes(m) ? active.filter((n) => n !== m) : members.filter((x) => x === m || active.includes(x));
                    if (on.length) patch(i, { performers: on.length === members.length ? [] : on });
                  }}>{m}</button>
                  <input className="field__input" aria-label={'Вес: ' + m} placeholder={doing ? 'Вес' : 'не делает'} inputMode="decimal" maxLength={80} disabled={!doing}
                    value={(ex.splitWeights && ex.splitWeights[m]) || ''} onChange={(e) => patch(i, { splitWeights: { ...(ex.splitWeights || {}), [m]: e.target.value } })} />
                </div>
              );
            })}
          </div>
        )}

        <div className="plan-inline__group-actions">
          {next && !(ex.supersetGroup && next.supersetGroup === ex.supersetGroup) && !split && (
            <button type="button" className="button" onClick={() => { joinNext(i); haptic(); }}><IconLinkPair size={16} />В суперсет со следующим</button>
          )}
          {inGroup && <button type="button" className="button" onClick={() => { leave(i); haptic(); }}>Выйти из суперсета</button>}
        </div>
        <div className="plan-inline__panel-actions">
          <button type="button" className="button button--ghost plan-inline__danger" onClick={() => remove(i)}>Удалить</button>
          <button type="button" className="button button--primary" onClick={() => setOpen(null)}>Готово</button>
        </div>
      </div>
    );
  };

  /**
   * Колонок кругов не больше трёх: 1, 2 или 3 — по высоте упражнений (кружки 50/40/33 px
   * на строку). Кругов ещё больше — суперсет растёт вниз, упражнения и скобка тянутся
   * на всю высоту колонки (CSS)
   */
  const roundsLayout = (count, exercises) => {
    const room = exercises * 170 - 116; // в правке ~170 px на упражнение минус ~116 px заголовка и кнопок
    return { cols: [[1, 50], [2, 40]].find(([c, h]) => Math.ceil(count / c) * h <= room)?.[0] || 3 };
  };

  /** Круги суперсета — колонкой справа от скобки; считаются по первому упражнению, остальные подтягиваются */
  const roundsColumn = (first, exercises) => {
    const { tech, work, strength, pills, setTech, kindOf, choose, removeAt, removable } = setsModel(first);
    const editing = !!(open && open.kind === 'group' && open.i === first);
    if (!editing) {
      // Обычный вид — как у остальных упражнений: число кругов, тап — правка
      const word = work % 10 === 1 && work % 100 !== 11 ? 'круг' : [2, 3, 4].includes(work % 10) && ![12, 13, 14].includes(work % 100) ? 'круга' : 'кругов';
      const warm = tech.warmup ? '+ ' + (tech.warmup > 1 ? tech.warmup + ' ' : '') + (tech.warmup === 1 ? 'разминка' : tech.warmup < 5 ? 'разминки' : 'разминок') : '';
      return (
        <div className="plan-inline__rounds-col">
          <button type="button" className="plan-inline__rounds-sum" aria-label={'Круги: ' + work + (warm ? ', ' + warm : '') + '. Изменить'} onClick={() => toggle('group', first)}>
            <strong>{work}</strong>
            <span>{word}</span>
            {warm && <em>{warm}</em>}
          </button>
        </div>
      );
    }
    // Колонок кругов не больше трёх, число — по высоте упражнений
    const { cols } = roundsLayout(pills.length, exercises);
    const picked = pickedSet >= 0 && pickedSet < pills.length;
    return (
      <div className="plan-inline__rounds-col plan-inline__rounds-col--edit" data-cols={cols}>
        <span className="plan-inline__rounds-title">Круги</span>
        {strength && (
          <button type="button" className="plan-inline__round-add" disabled={tech.warmup >= 5} onClick={() => { setTech({ warmup: tech.warmup + 1 }); haptic(); }}>
            <IconPlus size={12} />Разминка
          </button>
        )}
        <div className="plan-inline__rounds-list" role="listbox" aria-label="Круги" style={{ '--rows': Math.ceil(pills.length / cols) }}>
          {pills.map((p, k) => (
            <span className="plan-inline__set-wrap" key={k}>
              <button
                type="button"
                role="option"
                aria-selected={pickedSet === k}
                className={'plan-inline__set plan-inline__set--' + p + (pickedSet === k ? ' is-on' : '')}
                onClick={() => setPickedSet(pickedSet === k ? -1 : k)}
              >{p === 'warmup' ? 'Р' : p === 'drop' ? 'Д' : k - tech.warmup + 1}</button>
              {removable(k) && (cols < 3 || pickedSet === k) && (
                <button type="button" className="plan-inline__set-x" aria-label={'Удалить круг ' + (p === 'warmup' ? 'разминочный' : k - tech.warmup + 1)} onClick={() => { removeAt(k); haptic(); }}>
                  <IconClose size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
        <button type="button" className="plan-inline__round-add" disabled={work >= 20} onClick={() => { patch(first, { sets: String(work + 1) }); haptic(); }}>
          <IconPlus size={12} />Круг
        </button>
        {picked && strength && (
          <div className="plan-inline__round-kind" role="radiogroup" aria-label="Тип круга">
            {[['work', 'Рабочий'], ['warmup', 'Разминка']].map(([k, label]) => (
              <button type="button" key={k} role="radio" aria-checked={kindOf(pickedSet) === k} className={'chip' + (kindOf(pickedSet) === k ? ' chip--active' : '')} onClick={() => choose(k)}>{label}</button>
            ))}
          </div>
        )}
        <button type="button" className="button button--primary plan-inline__round-done" onClick={() => setOpen(null)}>Готово</button>
      </div>
    );
  };

  const units = unitsOf(list);
  return (
    <div className="plan-inline">
      <div ref={root} className="plan-inline__list">
        {units.map((u) => {
          const key = u.group ? 'g' + u.group : 'e' + u.idx[0];
          if (!u.group) {
            return <div className="plan-inline__unit" data-unit={key} key={key} onPointerDown={hold(key)}>{row(u.idx[0], false)}</div>;
          }
          return (
            <div className="plan-inline__unit plan-inline__unit--superset" data-unit={key} key={key} onPointerDown={hold(key)}>
              {/* Скобка объединяет упражнения; от неё — колонка кругов */}
              <div className="plan-inline__bracket">
                {u.idx.map((i) => row(i, true, u.idx[0]))}
              </div>
              {roundsColumn(u.idx[0], u.idx.length)}
            </div>
          );
        })}
      </div>
      {list.length > 1 && <p className="plan-inline__hint">Подержите упражнение, чтобы перетащить. Смахните влево — удалить.</p>}
      <div className="plan-inline__add">
        <button type="button" className="button" onClick={() => add(blankExercise)}><IconPlus size={16} />Упражнение</button>
        <button type="button" className="button button--ghost" onClick={() => add(() => cardioExercise())}><IconPlus size={16} />Кардио</button>
      </div>
      {canRemove && (sure
        ? (
          <div className="plan-inline__remove">
            <span>Удалить «{block.title}» из программы?</span>
            <button type="button" className="button button--critical" onClick={onRemove}>Удалить</button>
            <button type="button" className="button button--ghost" onClick={() => setSure(false)}>Отмена</button>
          </div>
        )
        : <button type="button" className="plan-inline__remove-link" onClick={() => setSure(true)}>Удалить тренировку</button>)}
    </div>
  );
}

/**
 * «+» под последней тренировкой: из шаблонов тренировок или новая
 */
export function AddBlock({ onAdd, busy }) {
  const [mode, setMode] = useState(''); // '' | 'menu' | 'templates'
  const templates = useData('library.templates', { kind: 'workout' }, [mode === 'templates']);
  const [loading, setLoading] = useState(0);
  if (!mode) {
    return (
      <button type="button" className="plan-inline__plus" aria-label="Добавить тренировку" disabled={busy} onClick={() => { setMode('menu'); haptic(); }}>
        <IconPlus size={22} />
      </button>
    );
  }
  if (mode === 'menu') {
    return (
      <div className="plan-inline__add-menu">
        <button type="button" className="button button--block" onClick={() => setMode('templates')}>Из шаблонов тренировок</button>
        <button type="button" className="button button--primary button--block" onClick={() => { setMode(''); onAdd(null); }}>Новая тренировка</button>
        <button type="button" className="button button--ghost button--block" onClick={() => setMode('')}>Отмена</button>
      </div>
    );
  }
  const list = templates.data ? templates.data.templates : [];
  return (
    <div className="plan-inline__add-menu">
      {templates.loading && <p className="small muted">Загружаю шаблоны…</p>}
      {!templates.loading && !list.length && <p className="small muted">Шаблонов тренировок нет — их заводят в разделе «Шаблоны».</p>}
      {list.map((t) => (
        <button type="button" key={t.id} className="item" disabled={!!loading} onClick={async () => {
          setLoading(t.id);
          try {
            const full = await apiPublic('library.template.get', { id: t.id });
            const b = full && full.blocks && full.blocks[0];
            if (b) onAdd({ title: b.title || t.title, sourceId: t.id, exercises: b.exercises.map((x) => ({ ...blankExercise(), ...x })) });
            setMode('');
          } finally { setLoading(0); }
        }}>
          <div className="item__top"><span className="item__name">{t.title}</span>{loading === t.id && <IconCheck size={16} />}</div>
          <div className="item__meta"><span>{t.exercises} упр.</span></div>
        </button>
      ))}
      <button type="button" className="button button--ghost button--block" onClick={() => setMode('menu')}>Назад</button>
    </div>
  );
}
