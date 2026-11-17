import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate, apiPublic } from '../api.js';
import { haptic } from '../telegram.js';
import { useTabLock } from '../gestures.jsx';
import { Sheet, Note, Field, Loading } from '../ui.jsx';
import {
  IconCalendar, IconClock, IconHome, IconBench, IconEye, IconUsers, IconPlus, IconList, IconCopy, IconHeart,
  IconGrip, IconChevron, IconAlert, IconPen, IconLink,
} from '../icons.jsx';
import { BlockEdit, blankExercise, cardioExercise } from './PlanInline.jsx';
import { ExerciseThumb } from '../client/PlanCard.jsx';
import { LooseCardio } from '../client/PlanWeeks.jsx';
import { TEMPLATE_GOALS, PLACES } from '../client/programs-model.js';
import {
  shownLength, resized, withWeekLoad, movedToWeek, copiedWeek, looseCardio, attachedCardio, isCardioBlock, weekOf,
} from '../plan-weeks.js';
import { goalLook } from './program-list-model.js';
import { LOAD_WORD } from './program-view-model.js';
import {
  draftOf, cleanBlocks, draftSnapshot, autoDays, autoMinutes, blockMinutes, weekItems, loadOfWeek, removedWeek,
  movedInWeek, removedAt, copiedTo, addedBlock, sessionsForCardio, cardioAdded, toggledJoin, canJoin, newKey, MAX_WEEKS,
} from './program-edit-model.js';
import { GoalIcon, LevelBars } from './ProgramList.jsx';
import './programs-lib.css';

/**
 * Редактор программы «Библиотеки» (этап 3 макета templates-programs-2026-11-17,
 * согласован владельцем 17.11.2026). Сверху «Отмена · Программа · Сохранить»
 * (точка — есть несохранённое), название крупно, «паспорт» чипами — один лист
 * с плитками; раз в неделю и минуты — «авто» по составу. Недели вкладками,
 * нагрузка недели — чипом. Тренировки свёрнуты: держать — перетащить,
 * нажать — раскрыть тот же BlockEdit, что в программе клиента. «+ Тренировка» —
 * лист: новая, из шаблона тренировки, копия тренировки программы, кардио к
 * занятию. Видимость — два переключателя.
 *
 * Шаблон одной тренировки правится прежним TemplateEditor + PlanEditor
 * (Library.jsx), программа клиента — своим редактором (PlanInline.jsx).
 */

const SHORT_GOAL = { 'Набор массы': 'Масса', 'Здоровая спина': 'Спина', 'Реабилитация': 'Реабили­тация', 'Выносливость': 'Выносли­вость' };
const LEVELS = ['Новичок', 'Средний', 'Опытный'];
const LOADS = [['', 'база'], ['heavy', '+ вес'], ['light', 'легче']];
const HINT_KEY = 'ft.progEdit.dragHint';
const HOLD_MS = 400;
const SLOP = 8;

function Toggle({ on, icon, title, hint, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={'plib-tog plib-tog--wide' + (on ? ' is-on' : '')}
      onClick={() => { haptic(); onChange(!on); }}>
      {icon}<span><b>{title}</b><small>{hint}</small></span><span className="plib-tog__sw" aria-hidden="true" />
    </button>
  );
}

/* --------------------------------------------------------------------------
 * «О программе» — один лист: цель, уровень, где, раз в неделю и минуты
 * -------------------------------------------------------------------------- */
function PassportSheet({ card, set, auto, onClose }) {
  const { goal, level, place, days, minutes } = card;
  const custom = !!goal && !TEMPLATE_GOALS.includes(goal);
  const [own, setOwn] = useState(custom);
  const tile = (on, onClick, children, label) => (
    <button type="button" className={'plib-tile' + (on ? ' is-on' : '')} aria-pressed={on} aria-label={label} onClick={() => { haptic(); onClick(); }}>{children}</button>
  );
  return (
    <Sheet title="О программе" onClose={onClose} onDone={onClose}>
      <div className="plib-filter">
        <h4>Цель</h4>
        <div className="plib-tiles plib-tiles--4">
          {TEMPLATE_GOALS.map((g) => tile(goal === g && !own, () => { setOwn(false); set({ goal: goal === g ? '' : g }); },
            <><span className={'plib-dot plib-goal--' + goalLook(g).key}><GoalIcon goal={g} size={18} /></span>{SHORT_GOAL[g] || g}</>, g))}
          {tile(own, () => { setOwn(true); if (!custom) set({ goal: '' }); }, <><span className="plib-dot"><IconPen size={18} /></span>Своя</>, 'Своя цель')}
        </div>
        {own && <Field label="Своя цель" inputMode="text" placeholder="Например, подготовка к забегу" value={goal} onChange={(v) => set({ goal: v.slice(0, 60) })} />}

        <h4>Уровень</h4>
        <div className="plib-tiles">
          {LEVELS.map((l) => tile(level === l, () => set({ level: level === l ? '' : l }), <><LevelBars level={l} />{l}</>, l))}
        </div>

        <h4>Где</h4>
        <div className="plib-tiles">
          {tile(place === 'gym', () => set({ place: 'gym' }), <><span className="plib-dot plib-dot--gym"><IconBench size={18} /></span>{PLACES.gym}</>)}
          {tile(place === 'home', () => set({ place: 'home' }), <><span className="plib-dot plib-dot--home"><IconHome size={18} /></span>{PLACES.home}</>)}
          {tile(!place, () => set({ place: '' }), <><b>—</b>не важно</>, 'Место не важно')}
        </div>

        <h4>Раз в неделю · минут</h4>
        <div className="plib-tiles plib-tiles--4">
          {tile(!days, () => set({ days: '' }), <><b>{auto.days ? auto.days + '×' : '—'}</b>по неделе 1</>, 'Раз в неделю — по неделе 1')}
          {tile(!!days, () => set({ days: days || String(auto.days || 3) }), <><b>✎</b>своё</>, 'Раз в неделю — своё')}
          {tile(!minutes, () => set({ minutes: '' }), <><b>{auto.minutes ? '≈' + auto.minutes : '—'}</b>по упражн.</>, 'Минуты — по упражнениям')}
          {tile(!!minutes, () => set({ minutes: minutes || String(auto.minutes || 60) }), <><b>✎</b>своё</>, 'Минуты — своё')}
        </div>
        {!!days && (
          <div className="plib-tiles plib-tiles--7 plib-sub" role="group" aria-label="Раз в неделю">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => tile(String(days) === String(n), () => set({ days: String(n) }), <b>{n}</b>, n + ' раз в неделю'))}
          </div>
        )}
        {!!minutes && (
          <div className="plib-sub">
            <Field label="Минут на тренировку" inputMode="numeric" value={minutes} placeholder="60"
              onChange={(v) => set({ minutes: v.replace(/\D/g, '').slice(0, 3) })} hint="От 10 до 240" />
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
 * Неделя: нагрузка, скопировать в пустую, убрать
 * -------------------------------------------------------------------------- */
function WeekSheet({ week, length, draft, onLoad, onCopy, onRemove, onClose }) {
  const load = loadOfWeek(draft, week);
  const empty = weekItems(draft, week).length === 0;
  const filled = Array.from({ length }, (_, i) => i + 1).filter((w) => w !== week && weekItems(draft, w).length);
  return (
    <Sheet title={'Неделя ' + week} onClose={onClose}>
      <div className="plib-filter">
        <h4>Нагрузка недели</h4>
        <div className="plib-tiles">
          {LOADS.map(([v, label]) => (
            <button key={v || 'base'} type="button" className={'plib-tile' + (load === v ? ' is-on' : '')} aria-pressed={load === v}
              disabled={empty} onClick={() => { haptic(); onLoad(v); onClose(); }}><b>{label}</b></button>
          ))}
        </div>
        {empty && <p className="plib-gaps">Нагрузку можно поставить, когда в неделе будут тренировки.</p>}
      </div>
      <div className="plib-menu plib-menu--top">
        {empty && filled.map((w) => (
          <button key={w} type="button" className="plib-menu__item" onClick={() => { haptic(); onCopy(w); onClose(); }}>
            <span className="plib-menu__icon"><IconCopy size={20} /></span>
            <span><b>Скопировать неделю {w}</b><small>Те же тренировки — поправите вес и повторы</small></span>
          </button>
        ))}
        {length > 1 && (
          <button type="button" className="plib-menu__item plib-menu__item--danger" onClick={() => { haptic(); onRemove(); onClose(); }}>
            <span className="plib-menu__icon"><IconAlert size={20} /></span>
            <span><b>Убрать неделю {week}</b><small>{empty ? 'Следующие сдвинутся на её место' : 'Вместе с её тренировками — можно будет вернуть'}</small></span>
          </button>
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
 * «+ Тренировка» — лист
 * -------------------------------------------------------------------------- */
function WorkoutTemplates({ onPick }) {
  const list = useData('library.templates', { kind: 'workout' }, []);
  const [loading, setLoading] = useState(0);
  if (list.loading) return <Loading lead={false} rows={3} />;
  const all = list.data ? list.data.templates : [];
  if (!all.length) return <p className="plib-gaps">Шаблонов тренировок пока нет — их заводят во вкладке «Тренировки».</p>;
  return all.map((t) => (
    <button key={t.id} type="button" className="plib-menu__item" disabled={!!loading} onClick={async () => {
      setLoading(t.id);
      try {
        const full = await apiPublic('library.template.get', { id: t.id });
        const b = full && full.blocks && full.blocks[0];
        if (b) onPick({ title: b.title || t.title, sourceId: t.id, exercises: b.exercises.map((x) => ({ ...blankExercise(), ...x })) });
      } finally { setLoading(0); }
    }}>
      <span className="plib-menu__icon"><IconList size={20} /></span>
      <span className="plib-grow"><b>{t.title}</b><small>{t.exercises} упр{loading === t.id ? ' · загружаем…' : ''}</small></span>
    </button>
  ));
}

function AddSheet({ week, length, draft, onAdd, onCopy, onCardio, onClose }) {
  const [step, setStep] = useState('');
  const sessions = sessionsForCardio(draft, week).filter((s) => !s.hasCardio);
  const title = { tpl: 'Из шаблона тренировки', copy: 'Копия какой', cardio: 'К какому занятию' }[step]
    || (length ? 'Тренировка в неделю ' + week : 'Новая тренировка');
  const item = (icon, head, sub, onClick, disabled = false) => (
    <button type="button" className="plib-menu__item" disabled={disabled} onClick={() => { haptic(); onClick(); }}>
      <span className="plib-menu__icon">{icon}</span><span className="plib-grow"><b>{head}</b><small>{sub}</small></span>
    </button>
  );
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="plib-menu">
        {!step && <>
          {item(<IconPlus size={20} />, 'Новая', 'Пустая — сразу выбор упражнений', () => { onAdd(null); onClose(); })}
          {item(<IconList size={20} />, 'Из шаблона тренировки', 'Копия, помнит, откуда взята', () => setStep('tpl'))}
          {item(<IconCopy size={20} />, 'Копия тренировки этой программы', 'Например, «Ноги» для другой недели с другим весом', () => setStep('copy'), !draft.length)}
          {item(<IconHeart size={20} />, 'Кардио к занятию', sessions.length ? 'Добавится к выбранной тренировке' : 'Во всех занятиях недели кардио уже есть', () => setStep('cardio'), !sessions.length)}
        </>}
        {step === 'tpl' && <WorkoutTemplates onPick={(b) => { onAdd(b); onClose(); }} />}
        {step === 'copy' && draft.map((b, i) => (
          <React.Fragment key={b._k}>
            {item(<span className="plib-wk__num">{i + 1}</span>, b.title || 'Без названия',
              [length && 'неделя ' + weekOf(b), b.exercises.filter((e) => String(e.name || '').trim()).length + ' упр'].filter(Boolean).join(' · '),
              () => { onCopy(i); onClose(); })}
          </React.Fragment>
        ))}
        {step === 'cardio' && sessions.map((s) => (
          <React.Fragment key={s.head}>
            {item(<IconHeart size={20} />, s.title, 'Кардио — в том же занятии, после неё', () => { onCardio(s.last); onClose(); })}
          </React.Fragment>
        ))}
        {step && <button type="button" className="button button--ghost button--block" onClick={() => setStep('')}>Назад</button>}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------------------
 * Тренировки вкладки: свёрнуты, держать — перетащить, нажать — раскрыть
 * -------------------------------------------------------------------------- */
function WorkoutList({ items, draft, length, open, onToggle, onMove, renderBody, disabled }) {
  const listRef = useRef(null);
  const g = useRef(null);
  const timer = useRef(0);
  const [lifted, setLifted] = useState(-1);
  const [hint, setHint] = useState(false);

  // Подсказка «держите — перетащить» — один раз на телефоне
  useEffect(() => {
    if (items.length < 2) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, '1');
    } catch (_) { return; }
    setHint(true);
  }, [items.length >= 2]);

  // Поднятую строку тащит палец: страница в это время не листается
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const stop = (e) => { if (g.current && g.current.armed) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const rowsOf = () => (listRef.current ? [...listRef.current.children].filter((r) => r.classList.contains('plib-ewk')) : []);
  const reset = (animate) => rowsOf().forEach((r) => {
    if (!animate) r.style.transition = 'none';
    r.style.transform = '';
    if (!animate) requestAnimationFrame(() => { r.style.transition = ''; });
  });

  const arm = () => {
    const s = g.current;
    if (!s) return;
    s.armed = true;
    const rows = rowsOf();
    s.rows = rows;
    s.rects = rows.map((r) => { const b = r.getBoundingClientRect(); return { top: b.top, h: b.height }; });
    const gap = rows.length > 1 ? Math.max(0, s.rects[1].top - s.rects[0].top - s.rects[0].h) : 8;
    s.step = s.rects[s.pos].h + gap;
    try { s.el.setPointerCapture(s.id); } catch (_) { /* уже отпущен */ }
    setLifted(s.pos);
    setHint(false);
    haptic('medium');
  };

  const down = (e, pos) => {
    if (disabled || g.current || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest('input, textarea, select, a')) return;
    const grip = !!e.target.closest('.plib-ewk__grip');
    g.current = { pos, id: e.pointerId, x0: e.clientX, y0: e.clientY, el: e.currentTarget, armed: false, moved: false, to: pos };
    if (grip) { arm(); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (g.current && !g.current.moved) arm(); }, HOLD_MS);
  };

  const move = (e) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.armed) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > SLOP) { clearTimeout(timer.current); g.current = null; }
      return;
    }
    if (Math.abs(dy) > 2) s.moved = true;
    const mid = (k) => s.rects[k].top + s.rects[k].h / 2;
    const center = mid(s.pos) + dy;
    let to = s.pos;
    s.rects.forEach((_, k) => {
      if (k > s.pos && center > mid(k)) to = Math.max(to, k);
      if (k < s.pos && center < mid(k)) to = Math.min(to, k);
    });
    s.rows[s.pos].style.transform = `translate3d(0, ${dy}px, 0)`;
    s.rows.forEach((r, k) => {
      if (k === s.pos) return;
      let shift = 0;
      if (to > s.pos && k > s.pos && k <= to) shift = -s.step;
      if (to < s.pos && k < s.pos && k >= to) shift = s.step;
      r.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
    });
    if (to !== s.to) { s.to = to; haptic('light'); }
  };

  const up = (e, cancel = false) => {
    clearTimeout(timer.current);
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    g.current = null;
    if (s.armed) {
      setLifted(-1);
      if (!cancel && s.moved && s.to !== s.pos) {
        reset(false);
        onMove(s.pos, s.to);
        haptic('success');
      } else reset(true);
      return;
    }
    if (!cancel) onToggle(items[s.pos].block._k);
  };

  const onGripKey = (e, pos) => {
    const to = e.key === 'ArrowUp' ? pos - 1 : e.key === 'ArrowDown' ? pos + 1 : null;
    if (to === null || to < 0 || to >= items.length) return;
    e.preventDefault();
    onMove(pos, to);
    requestAnimationFrame(() => {
      const row = rowsOf()[to];
      const grip = row && row.querySelector('.plib-ewk__grip');
      if (grip) grip.focus();
    });
  };

  let num = 0;
  return (
    <div className="plib-ewks" ref={listRef} data-no-gestures>
      {items.map(({ block, index }, pos) => {
        const cardio = isCardioBlock(block);
        if (!block.with) num += 1;
        const isOpen = open.has(block._k);
        const n = block.exercises.filter((x) => String(x.name || '').trim()).length;
        const min = blockMinutes(block);
        const sub = block.with
          ? ['в том же занятии', min && min + ' мин'].filter(Boolean).join(' · ')
          : [n + ' упр', min && '≈ ' + min + ' мин'].filter(Boolean).join(' · ');
        const title = block.title || 'Без названия';
        return (
          <div key={block._k} data-key={block._k}
            className={'plib-ewk' + (block.with ? ' plib-ewk--with' : '') + (isOpen ? ' is-open' : '') + (lifted === pos ? ' is-lifted' : '')}>
            <div className="plib-ewk__head" role="button" tabIndex={0} aria-expanded={isOpen}
              aria-label={title + ', ' + sub + (isOpen ? ' — свернуть' : ' — раскрыть')}
              onPointerDown={(e) => down(e, pos)} onPointerMove={move} onPointerUp={(e) => up(e)} onPointerCancel={(e) => up(e, true)}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(block._k); } }}>
              <button type="button" className="plib-ewk__grip" aria-label={'Переставить «' + title + '»: стрелки вверх и вниз'}
                onKeyDown={(e) => onGripKey(e, pos)} onClick={(e) => e.stopPropagation()}>
                <IconGrip size={18} />
              </button>
              <span className={'plib-wk__num' + (cardio ? ' plib-wk__num--cardio' : '')} aria-hidden="true">{cardio ? <IconHeart size={16} /> : num}</span>
              <span className="plib-grow"><b>{block.with && cardio ? '+ ' + title : title}</b><small>{sub}</small></span>
              {!isOpen && !cardio && n > 0 && (
                <span className="plib-thumbs" aria-hidden="true">
                  {block.exercises.filter((x) => String(x.name || '').trim()).slice(0, 3).map((x, i) => <ExerciseThumb key={i} ex={x} className="plib-thumbs__i" />)}
                </span>
              )}
              <IconChevron size={18} className="plib-wk__chev" />
              {hint && pos === 0 && <span className="plib-coach" aria-hidden="true">держите — перетащить</span>}
            </div>
            {isOpen && <div className="plib-ewk__body">{renderBody(block, index)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Редактор
 * -------------------------------------------------------------------------- */
export default function ProgramEditor({ template, onSaved, onCancel, confirm = null, onDirty }) {
  const t = template || {};
  const [card, setCard] = useState(() => ({
    title: t.title || '', goal: t.goal || '', level: t.level || '', place: t.place || '',
    days: t.days ? String(t.days) : '', minutes: t.minutes && !t.minutesAuto ? String(t.minutes) : '',
    description: t.description || '', forClients: !!t.forClients, isPublic: !!t.isPublic,
  }));
  const set = (patch) => { setCard((c) => ({ ...c, ...patch })); setFailure(null); };
  const [draft, setDraft] = useState(() => (template ? draftOf(template.blocks, blankExercise)
    : [{ _k: newKey(), title: 'Тренировка № 1', exercises: [blankExercise()] }]));
  const [lengthPick, setLengthPick] = useState(t.weekLength || 0);
  const length = shownLength(draft, lengthPick);
  const [week, setWeek] = useState(1);
  const shownWeek = length ? Math.min(Math.max(1, week), length) : 0;
  const [open, setOpen] = useState(() => new Set(template ? [] : [draft[0]._k]));
  const [sheet, setSheet] = useState(null); // 'card' | 'week' | 'add'
  const [descOpen, setDescOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [undo, setUndo] = useState(null); // { draft, lengthPick, text }
  const nameRef = useRef(null);

  // Есть ли несохранённое: снимок карточки и тренировок против открытого
  const snap = () => JSON.stringify([card, draftSnapshot(draft), length]);
  const [initial] = useState(snap);
  const dirty = snap() !== initial;
  useEffect(() => { if (onDirty) onDirty(dirty); }, [dirty]);

  // Правка — не раздел: смахнуть в соседний раздел значило бы бросить несохранённое
  useTabLock(true);

  useEffect(() => {
    if (!undo) return undefined;
    const id = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(id);
  }, [undo]);

  // Название крупно, в несколько строк — поле растёт под текст
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [card.title]);

  const change = (fn) => { setDraft((prev) => fn(prev.map((b) => ({ ...b, exercises: b.exercises.map((e) => ({ ...e })) })))); setFailure(null); };
  const withUndo = (text, fn) => { setUndo({ draft, lengthPick, text }); fn(); };
  const reveal = (key) => {
    setOpen((s) => new Set([...s, key]));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector('.plib-ewk[data-key="' + key + '"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }));
  };
  const toggle = (key) => { haptic(); setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }); };

  const auto = { days: autoDays(draft, length), minutes: autoMinutes(draft) };
  const items = weekItems(draft, shownWeek);
  const loose = looseCardio(draft);

  const setLength = (n) => {
    setLengthPick(n);
    change((list) => resized(list, n));
  };

  const add = (made) => {
    const block = made || { title: 'Тренировка № ' + (draft.length + 1), exercises: [blankExercise()] };
    const next = addedBlock(draft, shownWeek, block);
    setDraft(next);
    reveal(next[next.length - 1]._k);
  };

  const save = async () => {
    if (!card.title.trim()) {
      setFailure({ message: 'Назовите программу.' });
      if (nameRef.current) nameRef.current.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const saved = await apiMutate('library.template.save', {
        id: template ? template.id : undefined,
        kind: 'program',
        title: card.title.trim(),
        goal: card.goal.trim(),
        level: card.level,
        description: card.description,
        isPublic: card.isPublic,
        place: card.place,
        days: card.days,
        minutes: card.minutes,
        forClients: card.forClients,
        blocks: cleanBlocks(draft),
        weekLength: length,
        propagate: false,
      });
      haptic('success');
      onSaved(saved);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  // Раскрытая тренировка: название, неделя, занятие, копия — и тот же BlockEdit
  const renderBody = (block, index) => (
    <>
      {block.sourceId && <span className="plan-edit__source">из шаблона тренировки · правка здесь — только в этой программе</span>}
      <input aria-label="Название тренировки" className="field__input plib-ewk__title" value={block.title} maxLength={160} disabled={busy}
        onChange={(e) => { const v = e.target.value; change((next) => { next[index].title = v; return next; }); }} />
      <div className="plib-ewk__acts">
        {length > 1 && (
          <label className="plib-mini">
            <IconCalendar size={15} /><span>В неделю…</span>
            <select aria-label={'Перенести «' + block.title + '» в другую неделю'} value="" disabled={busy}
              onChange={(e) => { const w = Number(e.target.value); if (!w) return; haptic(); change((list) => movedToWeek(list, list[index], w)); setWeek(w); }}>
              <option value="">В неделю…</option>
              {Array.from({ length }, (_, i) => i + 1).filter((n) => n !== weekOf(block)).map((n) => <option key={n} value={n}>в неделю {n}</option>)}
            </select>
          </label>
        )}
        {canJoin(draft, index, length) && (
          <button type="button" className="plib-mini" disabled={busy} onClick={() => { haptic(); change((list) => toggledJoin(list, index)); }}>
            <IconLink size={15} />{block.with ? 'Отдельным занятием' : 'В одно занятие с предыдущей'}
          </button>
        )}
        <button type="button" className="plib-mini" disabled={busy} onClick={() => {
          haptic();
          const next = copiedTo(draft, index, shownWeek);
          setDraft(next);
          reveal(next[next.length - 1]._k);
        }}><IconCopy size={15} />Копия</button>
      </div>
      <BlockEdit
        block={block}
        canRemove={draft.length > 1}
        onChange={(exercises) => change((next) => { next[index].exercises = exercises; return next; })}
        onRemove={() => withUndo('Удалена «' + (block.title || 'тренировка') + '»', () => change((list) => removedAt(list, index)))}
      />
    </>
  );

  const goalChip = card.goal
    ? <><span className={'plib-dot plib-dot--sm plib-goal--' + goalLook(card.goal).key}><GoalIcon goal={card.goal} size={13} /></span>{card.goal}</>
    : <span className="plib-pass__empty">Цель</span>;
  const daysN = Number(card.days) || auto.days;

  return (
    <div className="plib plib-ed">
      <div className="plib-etop">
        <button type="button" className="plib-etop__c" onClick={onCancel}>Отмена</button>
        <b>Программа</b>
        <button type="button" className={'plib-etop__s' + (dirty ? ' is-dirty' : '')} disabled={busy} onClick={save}
          aria-label={dirty ? 'Сохранить — есть несохранённое' : 'Сохранить'}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
      {confirm}
      {failure && <Note tone="critical" icon={IconAlert}>{failure.message || 'Не получилось сохранить'}</Note>}

      <textarea ref={nameRef} rows={1} className="plib-ename" aria-label="Название программы" placeholder="Название программы"
        value={card.title} maxLength={120}
        onChange={(e) => set({ title: e.target.value.replace(/\n/g, ' ') })}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />

      <div className="plib-pass">
        <button type="button" className="plib-pchip" onClick={() => { haptic(); setSheet('card'); }}>{goalChip}</button>
        <button type="button" className="plib-pchip" onClick={() => { haptic(); setSheet('card'); }}>
          {card.level ? <><LevelBars level={card.level} />{card.level}</> : <span className="plib-pass__empty">Уровень</span>}
        </button>
        <button type="button" className="plib-pchip" onClick={() => { haptic(); setSheet('card'); }}>
          {card.place ? <>{card.place === 'home' ? <IconHome size={16} /> : <IconBench size={16} />}{PLACES[card.place]}</> : <span className="plib-pass__empty">Где</span>}
        </button>
        <button type="button" className={'plib-pchip' + (card.days ? '' : ' is-auto')} onClick={() => { haptic(); setSheet('card'); }}>
          <IconCalendar size={16} />{daysN ? daysN + '× в неделю' : 'Раз в неделю'}
        </button>
        <button type="button" className={'plib-pchip' + (card.minutes ? '' : ' is-auto')} onClick={() => { haptic(); setSheet('card'); }}>
          <IconClock size={16} />{card.minutes ? card.minutes + ' мин' : auto.minutes ? '≈ ' + auto.minutes + ' мин' : 'Минуты'}
        </button>
      </div>

      {descOpen ? (
        <label className="field plib-desc-field">
          <span className="field__label">Описание для клиентов</span>
          <textarea className="field__input library__textarea" value={card.description} maxLength={1000} autoFocus
            placeholder="Для кого и как вести: частота, прогрессия, на что обратить внимание"
            onChange={(e) => set({ description: e.target.value })} />
        </label>
      ) : (
        card.description.trim()
          ? <button type="button" className="plib-desc-prev" aria-label="Описание для клиентов — изменить" onClick={() => { haptic(); setDescOpen(true); }}>
            <span>{card.description}</span><IconPen size={15} />
          </button>
          : <button type="button" className="plib-addd" onClick={() => { haptic(); setDescOpen(true); }}>＋ Описание для клиентов</button>
      )}

      <LooseCardio count={loose.length} storeKey={template && template.id ? 'tpl' + template.id : ''} disabled={busy}
        onAttach={() => change((list) => attachedCardio(list, loose.map((b) => list[draft.indexOf(b)])))} />

      <div className="plib-etabs" role="tablist" aria-label="Недели программы">
        {length > 0 ? <>
          {Array.from({ length }, (_, i) => i + 1).map((w) => (
            <button key={w} type="button" role="tab" aria-selected={w === shownWeek} className={w === shownWeek ? 'is-on' : ''}
              onClick={() => { haptic(); setWeek(w); }}>{w === 1 ? 'Неделя 1' : w}</button>
          ))}
          {length < MAX_WEEKS && (
            <button type="button" className="plib-etabs__plus" aria-label="Добавить неделю"
              onClick={() => { haptic(); setLength(length + 1); setWeek(length + 1); }}>＋</button>
          )}
          <button type="button" className="plib-etabs__flat"
            onClick={() => { haptic(); withUndo('Программа — без недель', () => setLength(0)); }}>Без недель</button>
        </> : <>
          <button type="button" role="tab" aria-selected className="is-on">Без недель</button>
          <button type="button" className="plib-etabs__plus plib-etabs__plus--wide" onClick={() => { haptic(); setLength(1); setWeek(1); }}>＋ По неделям</button>
        </>}
      </div>

      {length > 0 && (
        <button type="button" className="plib-load" onClick={() => { haptic(); setSheet('week'); }}>
          Нагрузка недели: <span>{LOAD_WORD[loadOfWeek(draft, shownWeek)] || 'база'} ▾</span>
        </button>
      )}

      {items.length === 0 && <p className="plib-gaps plib-empty-wk">{length ? 'В неделе ' + shownWeek + ' пока нет тренировок.' : 'Тренировок пока нет.'}</p>}
      <WorkoutList key={shownWeek} items={items} draft={draft} length={length} open={open} disabled={busy}
        onToggle={toggle} onMove={(from, to) => change((list) => movedInWeek(list, shownWeek, from, to))} renderBody={renderBody} />

      <button type="button" className="plib-addw" disabled={busy} onClick={() => { haptic(); setSheet('add'); }}>
        <IconPlus size={18} />Тренировка
      </button>

      <div className="plib-vis">
        <Toggle on={card.forClients} icon={<IconEye size={18} />} title="Видят мои клиенты" hint="могут попросить её" onChange={(v) => set({ forClients: v })} />
        <Toggle on={card.isPublic} icon={<IconUsers size={18} />} title="Общая для тренеров" hint="скопируют с вашим именем" onChange={(v) => set({ isPublic: v })} />
      </div>

      {undo && (
        <div className="plib-undo" role="status">
          <span>{undo.text}</span>
          <button type="button" className="button button--ghost" onClick={() => { setDraft(undo.draft); setLengthPick(undo.lengthPick); setUndo(null); }}>Вернуть</button>
        </div>
      )}

      {sheet === 'card' && <PassportSheet card={card} set={set} auto={auto} onClose={() => setSheet(null)} />}
      {sheet === 'week' && length > 0 && (
        <WeekSheet week={shownWeek} length={length} draft={draft} onClose={() => setSheet(null)}
          onLoad={(load) => change((list) => withWeekLoad(list, shownWeek, load))}
          onCopy={(from) => change((list) => copiedWeek(list, from, shownWeek).map((b, i) => (i < list.length ? b : { ...b, _k: newKey() })))}
          onRemove={() => withUndo('Неделя ' + shownWeek + ' убрана', () => {
            setLengthPick(Math.max(0, length - 1));
            change((list) => removedWeek(list, shownWeek));
            setWeek(Math.max(1, shownWeek - 1));
          })} />
      )}
      {sheet === 'add' && (
        <AddSheet week={shownWeek} length={length} draft={draft} onClose={() => setSheet(null)} onAdd={add}
          onCopy={(i) => { const next = copiedTo(draft, i, shownWeek); setDraft(next); reveal(next[next.length - 1]._k); }}
          onCardio={(last) => {
            const next = cardioAdded(draft, last, { title: 'Кардио', exercises: [cardioExercise()] });
            setDraft(next);
            reveal(next[last + 1]._k);
          }} />
      )}
    </div>
  );
}
