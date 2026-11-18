import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ExercisePicker from './ExercisePicker.jsx';
import HistoryMove, { HistoryPick, hadHistory } from './HistoryMove.jsx';
import ClientSetup from './ClientSetup.jsx';
import { ExerciseMachines } from './MachinesEditor.jsx';
import { MACHINE_NAMES, newCardio } from './CardioPlan.jsx';
import ExerciseCard from './ExerciseCard.jsx';
import ExerciseAdd from './ExerciseAdd.jsx';
import { ExerciseThumb } from '../client/PlanCard.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { haptic } from '../telegram.js';
import { apiPublic } from '../api.js';
import { useData } from '../useData.js';
import { useReveal } from '../reveal.js';
import { pinInView } from '../scroll-pin.js';
import { trackOf, planScheme, planOneSide, planText, techniqueOf, restText } from '../exercise-track.js';
import { IconPlus, IconCheck, IconLinkPair, IconUnlink } from '../icons.jsx';
import { patchPlanExercise } from '../plan-block-actions.js';
import ExerciseKind, { saveExerciseTrack } from '../ExerciseKind.jsx';
import MuscleEdit from '../muscles/MuscleEdit.jsx';
import { Loading } from '../ui.jsx';
import { barsOf, workOf, splitGroupAt, groupLetter, groupVaries, groupMembers } from './exercise-card-model.js';
import { moveExercise, leaveBelow, ungroup, removeGroup, putBack, dropTarget } from './superset-move-model.js';

/**
 * Правка программы прямо в развёрнутой тренировке (владелец, 03.10.2026) —
 * вместо отдельного меню «Изменить программу». Один редактор на всё:
 * программа клиента в его карточке, шаблон программы (ProgramEditor) и
 * шаблон тренировки (PlanEditor).
 *
 * С 17.11.2026 (этап 5, FT-798) — один вход вместо двух меню: нажали
 * упражнение — снизу карточка (ExerciseCard): «‹ 2 из 6 ›», картинка,
 * «Заменить», мышцы, подходы столбиками, счётчики «− / +», отдых, «Об
 * упражнении» (что записывать, мышцы, тренажёры, история клиента).
 *   звено ⛓ между упражнениями — собрать суперсет, синее звено внутри
 *   рамки — разобрать (шаг 2: круги «по кругам» — в карточке суперсета);
 *   подержать упражнение — перетащить одно: внутри рамки суперсета —
 *   порядок, за рамку — выйти, в рамку — вступить; подержать шапку
 *   суперсета — едет весь (18.11.2026, superset-move-model.js);
 *   смахнуть упражнение — удалить (в суперсете ещё «Из суперсета»), шапку
 *   суперсета — «Удалить оба» / «Разобрать»; всё с «Вернуть».
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

export function BlockEdit({ block, members = [], clientRow = 0, onChange, onRemove, canRemove = true, onHistoryMoved }) {
  const library = useData('library.exercises', {}, []);
  const [extra, setExtra] = useState([]);
  // Заменили упражнение, которое клиент уже делал (HistoryMove): { i, from, to }
  const [historyAsk, setHistoryAsk] = useState(null);
  // У какой строки тренер открыл «делал под другим названием?» (HistoryPick)
  const [historyPick, setHistoryPick] = useState(null);
  const base = (library.data ? library.data.exercises : []).concat(extra);
  const list = block.exercises;
  const split = members.length > 1;

  // Открытая карточка упражнения (номер в списке) и поиск «Заменить» в ней
  const [card, setCard] = useState(null);
  const [picking, setPicking] = useState(false);
  // Лист «＋ Упражнения» сеткой (шаг 3, 18.11.2026)
  const [adding, setAdding] = useState(false);
  const [sure, setSure] = useState(false);
  const root = useRef(null);
  const drag = useRef(null);
  const swallow = useRef(false);
  /**
   * Список — на месте, пока над ним перестраивается лента картинок
   * карточки (подписи в одну-две строки меняют её высоту): после переноса
   * и удаления на iPhone страница прыгала (18.11.2026)
   */
  const steady = () => pinInView(root.current);

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
  const latest = useRef(list);
  latest.current = list;
  const patch = (i, values) => {
    const next = patchPlanExercise(latest.current, i, values);
    latest.current = next;
    onChange(next);
  };
  /** Несколько правок одним изменением: «Одинаково» у всего суперсета */
  const patchAll = (changes) => {
    let next = latest.current;
    changes.forEach(([i, values]) => { next = patchPlanExercise(next, i, values); });
    latest.current = next;
    onChange(next);
  };

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

  const openCard = (i) => {
    if (swallow.current) return;
    setPicking(false);
    setCard(i);
    haptic('light');
  };
  const goCard = (i) => { setPicking(false); setHistoryAsk(null); setCard(i); };

  /** Соединить со следующим в суперсет / выйти из суперсета */
  const joinNext = (i) => set((next) => {
    const a = next[i];
    const b = next[i + 1];
    if (!b) return;
    const g = a.supersetGroup || b.supersetGroup || 'g' + Date.now();
    const old = [a.supersetGroup, b.supersetGroup].filter(Boolean);
    next.forEach((e, k) => { if (k === i || k === i + 1 || old.includes(e.supersetGroup)) e.supersetGroup = g; });
    // Кругов — больше из двух: кардио (1 отрезок) со звеном к силовому (4 × 12)
    // давало суперсет на 1 круг (17.11.2026)
    const most = Math.max(0, ...next.filter((e) => e.supersetGroup === g).map((e) => parseInt(e.sets, 10) || 0));
    next.forEach((e) => { if (e.supersetGroup === g) e.sets = most > 0 ? String(most) : '3'; });
  });
  /** Синее звено внутри рамки: суперсет разбирается в этом месте */
  const unlinkAt = (i) => { steady(); onChange(splitGroupAt(latest.current, i)); haptic('light'); };
  const leave = (i) => set((next) => {
    const g = next[i].supersetGroup;
    next[i].supersetGroup = '';
    const rest = next.filter((e) => e.supersetGroup === g);
    if (rest.length < 2) rest.forEach((e) => { e.supersetGroup = ''; });
  });
  // Удалённое упражнение можно вернуть, как целую тренировку (blockUndo в
  // client/screens.jsx): правка уходит на сервер сама через 0,7 с, и
  // смахнутое по ошибке терялось насовсем (аудит 24.10.2026). Пустую строку
  // без названия не жалеем
  const [gone, setGone] = useState(null); // { items: [{ i, ex }], text }
  useEffect(() => {
    if (!gone) return undefined;
    const t = setTimeout(() => setGone(null), 8000);
    return () => clearTimeout(t);
  }, [gone]);
  const remove = (i) => {
    steady();
    setCard(null);
    const ex = latest.current[i];
    setGone(ex && String(ex.name || '').trim() ? { items: [{ i, ex: { ...ex } }], text: 'Упражнение удалено' } : null);
    const next = latest.current.map((e) => ({ ...e }));
    next.splice(i, 1);
    onChange(next);
  };
  const restore = () => {
    if (!gone) return;
    steady();
    const next = putBack(latest.current, gone.items);
    latest.current = next;
    setGone(null);
    onChange(next);
    haptic('light');
  };
  /** Смахнули упражнение в рамке → «Из суперсета»: встаёт отдельным под рамкой */
  const outOf = (i) => { steady(); setCard(null); const next = leaveBelow(latest.current, i); latest.current = next; onChange(next); haptic('light'); };
  /** Смахнули шапку → «Разобрать» / «Удалить оба» */
  const unpack = (i) => { steady(); setCard(null); const next = ungroup(latest.current, i); latest.current = next; onChange(next); haptic('light'); };
  const removeAll = (i) => {
    steady();
    setCard(null);
    const { next, gone: items } = removeGroup(latest.current, i);
    setGone({ items, text: 'Суперсет удалён · ' + items.length + ' ' + (items.length < 5 ? 'упражнения' : 'упражнений') });
    latest.current = next;
    onChange(next);
  };

  const add = (make) => {
    const at = list.length;
    set((next) => { next.push(make()); });
    setPicking(false);
    setCard(at);
  };

  /** Отмеченные в листе «＋ Упражнения» — в конец тренировки, карточку не открываем: схема уже 3 × 12 */
  const addRef = useRef(null);
  const addMany = (rows) => {
    if (!rows.length) return;
    // Кнопка «＋ Упражнения» остаётся где была, новые строки встают над ней
    pinInView(addRef.current);
    const next = latest.current.map((e) => ({ ...e })).concat(rows);
    latest.current = next;
    onChange(next);
  };

  /** Карточку закрыли: передумали с новым упражнением без названия — строки нет (QA 20.10.2026) */
  const closeCard = () => {
    const i = card;
    setCard(null);
    setPicking(false);
    setHistoryAsk(null);
    const ex = latest.current[i];
    if (ex && !String(ex.name || '').trim() && !ex.cardio) remove(i);
  };

  /* ---------- Перестановка удержанием ---------- */
  const hold = (start) => (e) => {
    if (drag.current || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const x0 = e.clientX; const y0 = e.clientY; const id = e.pointerId; const head = e.currentTarget;
    const off = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', early);
      window.removeEventListener('pointerup', off);
      window.removeEventListener('pointercancel', off);
    };
    const early = (ev) => { if (ev.pointerId === id && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) off(); };
    const timer = setTimeout(() => { off(); start(id, y0, head); }, 450);
    window.addEventListener('pointermove', early);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
  };
  const holdUnit = (key) => hold((id, y0, head) => begin(key, id, y0, head));
  const holdRow = (i) => hold((id, y0, head) => beginRow(i, id, y0, head));
  const begin = (key, pointerId, y0, head) => {
    haptic('medium');
    flushSync(() => setCard(null));
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
    // Звенья стоят на месте — пока едут упражнения, их не видно
    box.classList.add('is-dragging');
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
      box.classList.remove('is-dragging');
      drag.current = null;
      swallow.current = true;
      setTimeout(() => { swallow.current = false; }, 350);
      if (ev.type === 'pointerup' && g.to !== from) {
        const units = unitsOf(list);
        const [moved] = units.splice(from, 1);
        units.splice(g.to, 0, moved);
        steady();
        onChange(units.flatMap((u) => u.idx.map((i) => ({ ...list[i] }))));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  /**
   * Одно упражнение — удержанием (18.11.2026): строка едет за пальцем,
   * черта показывает, куда встанет; синяя — в суперсет (рамка подсвечена),
   * оранжевая — выходит из суперсета. Где упадёт — dropTarget
   */
  const beginRow = (i, pointerId, y0, head) => {
    haptic('medium');
    flushSync(() => setCard(null));
    const box = root.current;
    if (!box) return;
    try { head.setPointerCapture && head.setPointerCapture(pointerId); } catch (_) { /* старый браузер */ }
    const els = [...box.querySelectorAll('[data-row]')];
    const el = els.find((r) => Number(r.dataset.row) === i);
    if (!el) return;
    const from = latest.current;
    const rect = (r) => r.getBoundingClientRect();
    const rows = from.map((e, k) => {
      const r = els.find((x) => Number(x.dataset.row) === k);
      const b = r ? rect(r) : { top: 0, bottom: 0 };
      return { top: b.top, bottom: b.bottom, group: groupMembers(from, k).length > 1 ? e.supersetGroup : '' };
    });
    const frameEls = [...box.querySelectorAll('[data-frame]')];
    // Подсветка — на самой рамке (не обводкой внутреннего блока: на iPhone
    // выглядела второй рамкой поверх, 18.11.2026) и только чужой: вступает
    const frameOf = (f) => f.closest('.plan-inline__unit--superset') || f;
    const frames = Object.fromEntries(frameEls.map((f) => { const b = rect(f); return [f.dataset.frame, { top: b.top, bottom: b.bottom }]; }));
    const own = rows[i].group;
    const mid0 = (rows[i].top + rows[i].bottom) / 2;
    const boxTop = rect(box).top;
    const line = document.createElement('div');
    line.className = 'plan-inline__drop';
    line.setAttribute('aria-hidden', 'true');
    box.appendChild(line);
    el.classList.add('plan-inline__row--lifted');
    box.classList.add('is-dragging');
    const g = { to: null, group: own };
    drag.current = g;
    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dy = ev.clientY - y0;
      el.style.transform = `translate3d(0, ${dy}px, 0)`;
      const t = dropTarget(rows, frames, i, mid0 + dy);
      const same = t.to === i && t.group === own;
      line.style.transform = `translate3d(0, ${t.at - boxTop}px, 0)`;
      line.classList.toggle('is-on', !same);
      line.classList.toggle('is-in', !!t.group);
      line.classList.toggle('is-out', !t.group && !!own);
      frameEls.forEach((f) => frameOf(f).classList.toggle('is-target', !!t.group && t.group !== own && f.dataset.frame === t.group));
      if (g.to !== null && (t.to !== g.to || t.group !== g.group)) haptic('light');
      g.to = t.to;
      g.group = t.group;
    };
    const finish = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      el.style.transform = '';
      el.classList.remove('plan-inline__row--lifted');
      frameEls.forEach((f) => frameOf(f).classList.remove('is-target'));
      line.remove();
      box.classList.remove('is-dragging');
      drag.current = null;
      swallow.current = true;
      setTimeout(() => { swallow.current = false; }, 350);
      if (ev.type === 'pointerup' && g.to !== null && !(g.to === i && g.group === own)) {
        const next = moveExercise(latest.current, i, g.to, g.group);
        latest.current = next;
        steady();
        onChange(next);
        haptic('light');
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  /* ---------- Строка упражнения: картинка, название, подходы, «было» ---------- */
  const cardOf = (ex) => ex.exercise || (ex.exerciseId ? base.find((b) => b.id === ex.exerciseId) : null) || null;
  const row = (i, inSuperset) => {
    const ex = list[i];
    const track = trackOf(ex);
    const scheme = planScheme(ex, inSuperset) || 'подходы не заданы';
    const weight = track.kind !== 'cardio' && !split && planText(ex.weight) ? ' · ' + planText(ex.weight) + (/^[+-]?\d/.test(planText(ex.weight)) ? (planOneSide(ex) ? ' кг/стор.' : ' кг') : '') : '';
    // В суперсете «было» — в карточке: рядом со скобкой названию тесно
    const was = !split && !inSuperset && track.kind !== 'cardio' && (ex.lastWeight || ex.prevWeight);
    const named = String(ex.name || '').trim();
    return (
      <SwipeRow
        key={i}
        className="plan-inline__row"
        data-row={i}
        label={'Удалить упражнение ' + (ex.name || i + 1)}
        disabled={card !== null}
        onDelete={() => remove(i)}
        extra={inSuperset ? { text: 'Из суперсета', label: 'Убрать «' + (named || i + 1) + '» из суперсета', icon: <IconUnlink size={20} />, onClick: () => outOf(i) } : null}
      >
        <button type="button" className="exr" aria-label={(named || 'Упражнение без названия') + ': ' + scheme + weight + '. Открыть карточку'} onClick={() => openCard(i)} onPointerDown={holdRow(i)}>
          <ExerciseThumb ex={{ ...ex, exercise: cardOf(ex) }} className="exr__pic" />
          <span className="exr__body">
            <span className={'exr__name' + (named ? '' : ' is-empty')}>{named || 'Название упражнения'}</span>
            <span className="exr__meta">
              {!inSuperset && track.kind !== 'cardio' && (
                <span className="exr-dots" aria-hidden="true">
                  {barsOf(ex).map((b, k) => <i key={k} className={b === 'work' ? '' : 'is-' + b} />)}
                </span>
              )}
              <span>{scheme}{weight}</span>
            </span>
          </span>
          {was && <span className="exr__was">было<br />{was}</span>}
        </button>
      </SwipeRow>
    );
  };

  /** Шапка рамки суперсета: «⛓ Суперсет А · 3 круга · отдых 1:30»; нажать — карточка первого */
  const groupHead = (u) => {
    const first = u.idx[0];
    const ex = list[first];
    const work = workOf(ex);
    const word = work % 10 === 1 && work % 100 !== 11 ? 'круг' : [2, 3, 4].includes(work % 10) && ![12, 13, 14].includes(work % 100) ? 'круга' : 'кругов';
    const rest = techniqueOf(ex.technique).rest;
    const letter = groupLetter(list, u.group);
    const differs = groupVaries(list, u.idx);
    const line = [work + ' ' + word, differs && 'по кругам', rest && 'отдых ' + restText(rest)].filter(Boolean).join(' · ');
    return (
      <button type="button" className="ss-head" aria-label={'Суперсет ' + letter + ': ' + line + '. Изменить'} onClick={() => openCard(first)} onPointerDown={holdUnit('g' + u.group)}>
        <IconLinkPair size={16} />
        <span className="ss-head__t">Суперсет {letter}</span>
        <span className="ss-head__m">{line}</span>
      </button>
    );
  };

  /** Звено между упражнениями: серое — собрать суперсет, синее (внутри рамки) — разобрать */
  const link = (i, inside) => (split ? null : (
    <div className={'ss-link' + (inside ? ' ss-link--in' : '')} key={'l' + i}>
      <button
        type="button"
        className="ss-link__b"
        aria-label={inside
          ? 'Разобрать суперсет между «' + (list[i].name || i + 1) + '» и «' + (list[i + 1].name || i + 2) + '»'
          : 'В суперсет: «' + (list[i].name || i + 1) + '» и «' + (list[i + 1].name || i + 2) + '»'}
        onClick={() => (inside ? unlinkAt(i) : (steady(), joinNext(i), haptic('light')))}
      >
        {inside ? <IconUnlink size={14} /> : <IconLinkPair size={14} />}
      </button>
    </div>
  ));

  /* ---------- Что карточка берёт у редактора ---------- */
  const renderPicker = (i) => {
    const ex = list[i];
    return (
      <ExercisePicker
        autoFocus
        value={ex.name}
        exerciseId={ex.exerciseId}
        exercises={base}
        onPick={({ name, exerciseId }) => {
          const pick = exerciseId && base.find((x) => x.id === exerciseId);
          const changed = (exerciseId || null) !== (ex.exerciseId || null) || name !== ex.name;
          if (clientRow && exerciseId && exerciseId !== ex.exerciseId && hadHistory(ex)) {
            setHistoryAsk({ i, from: { id: ex.exerciseId || null, name: ex.name }, to: { id: exerciseId, name } });
          } else if (historyAsk && historyAsk.i === i) setHistoryAsk(null);
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
          setPicking(false);
        }}
        onAdded={(saved) => setExtra((prev) => [...prev, saved])}
      />
    );
  };
  const renderHistory = (i) => (historyAsk && historyAsk.i === i
    ? <HistoryMove clientRow={clientRow} from={historyAsk.from} to={historyAsk.to} onClose={() => setHistoryAsk(null)} onMoved={onHistoryMoved} />
    : null);
  const renderAbout = (i) => {
    const ex = list[i];
    return (
      <>
        {/* Вид упражнения — как в идущем занятии; пишется в базу */}
        <ExerciseKind track={trackOf(ex)} onChange={(t) => changeTrack(i, t)} note={kindNote && kindNote.i === i ? kindNote : null} />
        {/* Карта мышц (FT-491): основная группа и синергисты — в базу тренера */}
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
        {/* Тренажёры и оборудование (10.10.2026) — прямо в программе */}
        <ExerciseMachines key={'m:' + keyOf(ex.name)} exerciseId={ex.exerciseId} name={ex.name} />
        {/* До тренировки (владелец, 16.10.2026): упражнение уже новое, а
            клиент делал его под старым названием — перенести сюда */}
        {clientRow && ex.exerciseId && !(historyAsk && historyAsk.i === i) && (!hadHistory(ex) || historyPick === i) ? (
          <HistoryPick clientRow={clientRow} to={{ id: Number(ex.exerciseId), name: ex.name }}
            onOpen={() => setHistoryPick(i)} onClose={() => setHistoryPick(null)} onMoved={onHistoryMoved} />
        ) : null}
        {/* Настройка тренажёра у клиента — как в идущем занятии */}
        {clientRow && ex.exerciseId ? <ClientSetup exerciseId={ex.exerciseId} clientRow={clientRow}
          members={split ? (ex.performers && ex.performers.length ? members.filter((m) => ex.performers.includes(m)) : members) : []} /> : null}
      </>
    );
  };

  const units = unitsOf(list);
  return (
    <div className="plan-inline">
      <div ref={root} className="plan-inline__list">
        {units.map((u, ui) => {
          const key = u.group ? 'g' + u.group : 'e' + u.idx[0];
          const before = ui > 0 ? link(units[ui - 1].idx[units[ui - 1].idx.length - 1], false) : null;
          if (!u.group) {
            return (
              <React.Fragment key={key}>
                {before}
                <div className="plan-inline__unit" data-unit={key}>{row(u.idx[0], false)}</div>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={key}>
              {before}
              {/* Рамка суперсета: шапка с кругами, упражнения, синие звенья между ними.
                  Смахнуть шапку — уезжает вся рамка: «Удалить оба» / «Разобрать» */}
              <SwipeRow
                className="plan-inline__unit plan-inline__unit--ss"
                contentClassName="plan-inline__unit--superset"
                data-unit={key}
                label={'Удалить суперсет ' + groupLetter(list, u.group) + ' целиком'}
                actionText={u.idx.length > 2 ? 'Удалить все' : 'Удалить оба'}
                disabled={card !== null}
                onDelete={() => removeAll(u.idx[0])}
                extra={{ text: 'Разобрать', label: 'Разобрать суперсет ' + groupLetter(list, u.group), icon: <IconUnlink size={20} />, onClick: () => unpack(u.idx[0]) }}
              >
                <div className="plan-inline__frame" data-frame={u.group}>
                {groupHead(u)}
                {u.idx.map((i, k) => (
                  <React.Fragment key={i}>
                    {k > 0 && link(u.idx[k - 1], true)}
                    {row(i, true)}
                  </React.Fragment>
                ))}
                </div>
              </SwipeRow>
            </React.Fragment>
          );
        })}
      </div>
      {gone && (
        <div className="plan__block-undo" role="status">
          <span>{gone.text}</span>
          <button type="button" className="button button--ghost" onClick={restore}>Вернуть</button>
        </div>
      )}
      {list.length > 1 && <p className="plan-inline__hint">{split ? '' : '⛓ между упражнениями — суперсет. '}Подержите упражнение, чтобы перетащить{split ? '' : ', шапку суперсета — весь суперсет'}. Смахните влево — удалить.</p>}
      <div className="plan-inline__add" ref={addRef}>
        <button type="button" className="button" onClick={() => { setCard(null); setAdding(true); haptic('light'); }}><IconPlus size={16} />Упражнения</button>
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
      {adding && (
        <ExerciseAdd
          base={base}
          loading={library.loading}
          make={{ blank: blankExercise, cardio: newCardio }}
          onAdd={addMany}
          onAdded={(saved) => setExtra((prev) => [...prev, saved])}
          onClose={() => setAdding(false)}
        />
      )}
      {card !== null && list[card] && (
        <ExerciseCard
          list={list}
          index={card}
          onIndex={goCard}
          split={split}
          members={members}
          base={base}
          picking={picking}
          onPicking={setPicking}
          onPatch={patch}
          onPatchAll={patchAll}
          onClose={closeCard}
          onRemove={remove}
          onJoin={joinNext}
          onLeave={leave}
          renderPicker={renderPicker}
          renderAbout={renderAbout}
          renderHistory={renderHistory}
        />
      )}
    </div>
  );
}

/**
 * «+» под последней тренировкой: из шаблонов тренировок или новая
 */
export function AddBlock({ onAdd, busy, label = '', primary = false }) {
  const [mode, setMode] = useState(''); // '' | 'menu' | 'templates'
  const templates = useData('library.templates', { kind: 'workout' }, [mode === 'templates']);
  const [loading, setLoading] = useState(0);
  // Меню и список шаблонов — под последней тренировкой, у нижнего края: на экран
  const ref = useReveal(mode && mode + (mode === 'templates' && !templates.loading ? ':ready' : ''));
  if (!mode) {
    // С подписью — в разделе недели («+ Тренировка в неделю 2», FT-775), без — круглый «+»
    if (label) {
      return (
        <button type="button" className={primary ? 'button button--primary' : 'wk__add'} disabled={busy} onClick={() => { setMode('menu'); haptic(); }}>
          {primary ? label : '+ ' + label}
        </button>
      );
    }
    return (
      <button type="button" className="plan-inline__plus" aria-label="Добавить тренировку" disabled={busy} onClick={() => { setMode('menu'); haptic(); }}>
        <IconPlus size={22} />
      </button>
    );
  }
  if (mode === 'menu') {
    return (
      <div className="plan-inline__add-menu" ref={ref}>
        <button type="button" className="button button--block" onClick={() => setMode('templates')}>Из шаблонов тренировок</button>
        <button type="button" className="button button--primary button--block" onClick={() => { setMode(''); onAdd(null); }}>Новая тренировка</button>
        <button type="button" className="button button--ghost button--block" onClick={() => setMode('')}>Отмена</button>
      </div>
    );
  }
  const list = templates.data ? templates.data.templates : [];
  return (
    <div className="plan-inline__add-menu" ref={ref}>
      {templates.loading && <Loading lead={false} rows={3} />}
      {!templates.loading && !list.length && <p className="small muted">Шаблонов тренировок нет — их заводят в разделе «Библиотека».</p>}
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
