import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ExercisePicker from './ExercisePicker.jsx';
import CardioPlan, { MACHINE_NAMES, newCardio } from './CardioPlan.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { haptic } from '../telegram.js';
import { apiPublic } from '../api.js';
import { useData } from '../useData.js';
import { trackOf, cardioFrom, planScheme, techniqueOf, techniqueText } from '../exercise-track.js';
import { IconPlus, IconLinkPair, IconCheck, IconTrash, IconClose } from '../icons.jsx';
import { patchPlanExercise } from '../plan-block-actions.js';

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

export function BlockEdit({ block, members = [], onChange, onRemove, canRemove = true }) {
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
    if (e.target.closest && e.target.closest('input, textarea, select, .plan-inline__panel')) return;
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
  const row = (i, inSuperset) => {
    const ex = list[i];
    const track = trackOf(ex);
    const scheme = planScheme(ex, inSuperset) || 'подходы не заданы';
    const weight = track.kind !== 'cardio' && !split && ex.weight ? ' · ' + ex.weight + (/^[+-]?\d/.test(String(ex.weight)) ? ' кг' : '') : '';
    const isName = open && open.kind === 'name' && open.i === i;
    const isScheme = open && open.kind === 'scheme' && open.i === i;
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
                    } : {}),
                  });
                }}
                onAdded={(saved) => setExtra((prev) => [...prev, saved])}
              />
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
        {!isName && (
          <button type="button" className={'plan-inline__scheme' + (isScheme ? ' is-open' : '')} aria-expanded={!!isScheme} onClick={() => toggle('scheme', i)}>
            <strong>{scheme.split(' · ')[0]}</strong>
            {scheme.split(' · ').slice(1).map((p, k) => <span key={k}> · {p}</span>)}
            {weight && <span>{weight}</span>}
            {!split && (ex.lastWeight || ex.prevWeight) && <span className="plan-inline__prev">было {ex.lastWeight || ex.prevWeight}</span>}
          </button>
        )}
        {isScheme && schemePanel(i)}
      </SwipeRow>
    );
  };

  /* ---------- Подходы, повторы, вес ---------- */
  const [pickedSet, setPickedSet] = useState(-1);
  useEffect(() => { setPickedSet(-1); }, [open && open.i, open && open.kind]);

  const schemePanel = (i) => {
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
    const field = (key, label, placeholder, mode = 'text') => (
      <label className="plan-inline__field">
        <span>{label}</span>
        <input className="field__input" inputMode={mode} placeholder={placeholder} maxLength={80} value={ex[key] || ''} onChange={(e) => patch(i, { [key]: e.target.value })} />
      </label>
    );
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
              <div className="plan-inline__fields">
                {field('reps', track.kind === 'timed' ? 'Время, с' : track.unilateral ? 'Повт. / сторона' : 'Повторы', track.kind === 'timed' ? '60' : '12')}
                {!split && field('weight', track.kind === 'strength' ? (track.perSide ? 'Кг / сторона' : 'Вес, кг') : 'Доп. вес', track.kind === 'strength' ? '—' : 'свой', 'decimal')}
              </div>
              <div className="plan-inline__sets-head">
                <span>{inGroup ? 'Круги' : 'Подходы'}</span>
                <span className="muted">{tech.warmup ? tech.warmup + ' разм. + ' : ''}{work} раб.</span>
              </div>
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
                {strength && <button type="button" className="button" disabled={tech.warmup >= 5} onClick={() => setTech({ warmup: tech.warmup + 1 })}><IconPlus size={16} />Разминочный в начало</button>}
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

  const units = unitsOf(list);
  return (
    <div className="plan-inline">
      <div ref={root} className="plan-inline__list">
        {units.map((u) => {
          const key = u.group ? 'g' + u.group : 'e' + u.idx[0];
          if (!u.group) {
            return <div className="plan-inline__unit" data-unit={key} key={key} onPointerDown={hold(key)}>{row(u.idx[0], false)}</div>;
          }
          const rounds = count(list[u.idx[0]].sets, 0);
          return (
            <div className="plan-inline__unit plan-inline__unit--superset" data-unit={key} key={key} onPointerDown={hold(key)}>
              <div className="plan-inline__superset-head">
                <span>Суперсет</span>
                {rounds > 0 && <span className="plan-inline__rounds">{rounds} {rounds % 10 === 1 && rounds % 100 !== 11 ? 'круг' : [2, 3, 4].includes(rounds % 10) && ![12, 13, 14].includes(rounds % 100) ? 'круга' : 'кругов'}</span>}
              </div>
              {u.idx.map((i) => row(i, true))}
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
