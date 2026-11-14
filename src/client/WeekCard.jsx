import React, { useEffect, useRef, useState } from 'react';
import { addDays, dateKey, inPause, WEEKDAY_SHORT } from '../program-timeline.js';
import { apiMutate } from '../api.js';
import { Sheet, Note } from '../ui.jsx';
import { IconAlert, IconCheck, IconHeart, IconPlay } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { weekItems, removedFromWeek, spanTiny, sessionsText } from '../week-edits.js';
import './week-card.css';

/**
 * Карточка недели (макет week-zone-mockup-v2.html, согласован владельцем
 * 14.11.2026): вместо полоски дат, карточки «Эта неделя» и строки дней —
 * одна картинка. Кольцо — сколько занятий сделано, полоска — какая неделя
 * программы, семь дней со значками (✓ сделано, гантель — силовая, сердце —
 * кардио), точки — соседние недели (свайп по карточке). Нажали на занятие —
 * короткое меню: начать, перенести (редактор недель), «не будет, без долга».
 * Только для программы по датам (scheduledPlan); месячные циклы — WeekStrip
 */

const C = 2 * Math.PI * 38;
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ru = (key) => key.split('-').reverse().slice(0, 2).join('.');
const GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
/** «9–15 ноября», на стыке — «30 ноября – 6 декабря» */
const spanLong = (start) => {
  const end = addDays(start, 6);
  const g = (k) => GEN[Number(k.slice(5, 7)) - 1];
  return start.slice(5, 7) === end.slice(5, 7)
    ? `${Number(start.slice(8))}–${Number(end.slice(8))} ${g(end)}`
    : `${Number(start.slice(8))} ${g(start)} – ${Number(end.slice(8))} ${g(end)}`;
};
/** «Тренировка 1 — верх» → «Верх», «Грудь, трицепс» → «Грудь» — подпись под днём */
export const shortTitle = (title) => {
  const parts = String(title || '').split(/\s*[,—–]\s*|\s+-\s+/).filter(Boolean);
  const pick = parts.length > 1 && /^тренировка\s*\d*$/i.test(parts[0]) ? parts[1] : parts[0] || '';
  return pick.charAt(0).toUpperCase() + pick.slice(1);
};
const isCardio = (it) => it.rows.length > 0 && it.rows.every((r) => (r.block.exercises || []).length && r.block.exercises.every((e) => e && e.cardio));

function Dumbbell() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <rect x="1" y="9" width="4" height="6" rx="1" /><rect x="19" y="9" width="4" height="6" rx="1" />
      <rect x="5" y="7" width="3" height="10" rx="1" /><rect x="16" y="7" width="3" height="10" rx="1" /><rect x="8" y="11" width="8" height="2" />
    </svg>
  );
}
export function Gear() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

/** Одна строка под полоской недель: что с неделей */
function statusLine(w, cfg) {
  if (w.status === 'scheduled') return `Начнётся ${ru(cfg.startsOn)}`;
  if (w.status === 'paused') return 'Пауза — неделя не считается пропуском';
  if (w.status === 'expired') return 'Программа завершена';
  if (w.status === 'legacy') return 'Пока идёт прежний список';
  if (w.status === 'empty') return 'Неделя отдыха';
  if (w.status === 'done') return 'Неделя выполнена';
  if (w.status === 'missed') return `Не выполнено: ${w.missed}`;
  const debt = w.rows.some((r) => r.carried) ? ' · с долгом' : '';
  const extra = w.extraNeed ? ` · кардио ${w.extraDone} из ${w.extraNeed}` : '';
  return (cfg.endsOn ? `до ${ru(cfg.endsOn)}` : 'до замены тренером') + debt + extra;
}

export default function WeekCard({ plan, sel, onSelect, cfg, month, clientRow = null, trainer = false, canEdit = false, onSettings = null, onEdit = null, onStart = null, onSaved }) {
  const w = plan.weeks[sel];
  const today = dateKey();
  const items = weekItems(w);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [anim, setAnim] = useState('');
  const [drawn, setDrawn] = useState(false);
  const [burst, setBurst] = useState(false);
  const touch = useRef(null);

  // Кольцо дорисовывается при показе и при смене недели
  useEffect(() => {
    setDrawn(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(id);
  }, [w.start]);
  // Неделя закрыта — салют, один раз на неделю на этом устройстве
  useEffect(() => {
    if (w.status !== 'done' || reduceMotion()) return undefined;
    const key = 'wk-burst:' + (month || '') + ':' + w.start;
    try { if (localStorage.getItem(key)) return undefined; localStorage.setItem(key, '1'); } catch (_) { return undefined; }
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 1400);
    return () => clearTimeout(t);
  }, [w.start, w.status]);

  const go = (dir) => {
    const i = sel + dir;
    if (i < 0 || i >= plan.weeks.length) return;
    haptic('selection');
    setAnim(reduceMotion() ? 'fade' : dir > 0 ? 'next' : 'prev');
    onSelect(i);
  };
  // Свайп по карточке — соседняя неделя (data-no-swipe: не вкладки карточки клиента)
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const editable = canEdit && w.editable && w.end >= today;
  const need = w.need || 0;
  const ratio = need ? Math.min(1, w.done / need) : 0;
  const cycle = w.length > 1 && w.length <= 8 ? w.length : 0;
  const cycleLabel = w.rhythm
    ? `${sessionsText(w.rhythm)} в неделю${w.length > 1 ? ` · ${w.week} из ${w.length}` : ''}`
    : w.length > 1 ? `Неделя ${w.week} из ${w.length}` : 'Одна неделя по кругу';
  const closedDay = (date) => date < cfg.startsOn || (cfg.endsOn && date > cfg.endsOn) || inPause(date, cfg);
  const free = items.filter((it) => !it.day);
  const debts = w.rows.filter((r) => r.carried && !r.extra && !r.movedFrom && r.left > 0);
  // Точки недель — окно вокруг выбранной
  const from = Math.max(0, Math.min(sel - 4, plan.weeks.length - 9));
  const dots = plan.weeks.slice(from, from + 9);

  const remove = async (it) => {
    setBusy(true);
    setFailure('');
    try {
      const weekEdits = removedFromWeek(cfg.weekEdits || {}, plan, w.start, it.idx);
      const res = await apiMutate('plan.week.edit', { ...(clientRow ? { clientRow } : {}), month, rev: Number(cfg.weekEditsRev) || 0, weekEdits, ...(trainer ? { notify: true } : {}) });
      haptic('success');
      setMenu(null);
      onSaved(res.weeks);
    } catch (error) {
      setFailure(error.message || 'Не сохранилось');
    }
    setBusy(false);
  };

  const dot = (it) => {
    const cls = 'wc-dot' + (it.done ? ' is-done' : isCardio(it) ? ' is-cardio' : '') + (it.from ? ' is-moved' : '');
    const icon = it.done ? <IconCheck size={16} /> : isCardio(it) ? <IconHeart size={15} /> : <Dumbbell />;
    const label = `${it.title}${it.done ? ' — сделано' : ''}${it.from ? ', перенесено из ' + spanTiny(it.from) : ''}`;
    if (it.done) return <span key={it.idx} className={cls} role="img" aria-label={label}>{icon}</span>;
    return <button key={it.idx} type="button" className={cls} aria-label={label} onClick={(e) => { e.stopPropagation(); haptic(); setFailure(''); setMenu(it); }}>{icon}</button>;
  };

  return (
    <div className={'wc' + (burst ? ' is-burst' : '')} data-no-swipe="" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="wc__top">
        <button type="button" className="wc__arrow" aria-label="Неделя раньше" disabled={sel <= 0} onClick={() => go(-1)}>‹</button>
        <strong className="wc__title">{spanLong(w.start)}{w.edited && <i className="wc__edited" aria-label="неделя изменена" />}</strong>
        <button type="button" className="wc__arrow" aria-label="Неделя позже" disabled={sel >= plan.weeks.length - 1} onClick={() => go(1)}>›</button>
        {onSettings && <button type="button" className="wc__gear" aria-label="Настроить" onClick={() => { haptic(); onSettings(); }}><Gear /></button>}
      </div>

      <div key={w.start} className={'wc__body' + (anim ? ' is-' + anim : '')}>
        <div className="wc__mid">
          <div className="wc-ring" role="img" aria-label={need ? `Сделано ${w.done} из ${need}` : statusLine(w, cfg)}>
            <svg width="92" height="92" aria-hidden="true">
              <circle className="wc-ring__track" cx="46" cy="46" r="38" />
              {need > 0 && <circle className={'wc-ring__fill' + (w.status === 'missed' ? ' is-missed' : '')} cx="46" cy="46" r="38"
                style={{ strokeDasharray: C, strokeDashoffset: drawn ? C * (1 - ratio) : C }} />}
            </svg>
            <div className="wc-ring__num">
              {need > 0 ? <><b>{Math.min(w.done, need)}/{need}</b><small>{need === 1 ? 'занятие' : 'занятий'}</small></> : <small>{w.status === 'paused' ? 'пауза' : '—'}</small>}
            </div>
            {burst && <span className="wc-burst" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</span>}
          </div>
          <div className="wc__cycle">
            <span>{cycleLabel}</span>
            {cycle > 0 && (
              <div className="wc__bars" aria-hidden="true">
                {Array.from({ length: cycle }, (_, i) => <i key={i} className={i + 1 === w.week ? 'is-now' : ''} />)}
              </div>
            )}
            <span className={w.status === 'missed' ? 'is-bad' : w.status === 'done' ? 'is-good' : ''}>{statusLine(w, cfg)}</span>
          </div>
        </div>

        <div className="wc__days">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const date = addDays(w.start, d - 1);
            const list = items.filter((it) => it.day === d);
            const open = editable && date >= today && !list.length;
            return (
              <div key={d} className={'wc-day' + (closedDay(date) ? ' is-closed' : '') + (date === today ? ' is-today' : '') + (open ? ' is-open' : '')}
                onClick={open && onEdit ? () => { haptic(); onEdit(w.start); } : undefined}>
                <span className="wc-day__wd">{WEEKDAY_SHORT[d]}</span>
                <b>{Number(date.slice(8))}</b>
                <div className="wc-day__dots">{list.slice(0, 2).map(dot)}{list.length > 2 && <span className="wc-day__more">+{list.length - 2}</span>}</div>
                {list.length > 0 && <span className="wc-day__name">{shortTitle(list[0].title)}</span>}
              </div>
            );
          })}
        </div>
        {(free.length > 0 || debts.length > 0) && (
          <div className="wc__free">
            <span>В любой день</span>
            {free.map((it) => (
              <span key={it.idx} className="wc__free-item">{dot(it)}{shortTitle(it.title)}</span>
            ))}
            {debts.map((r) => <span key={'d' + r.block.id} className="wc__free-item is-debt">{r.block.title} · долг</span>)}
          </div>
        )}
      </div>

      {plan.weeks.length > 1 && (
        <div className="wc__weeks" role="tablist" aria-label="Недели программы">
          {dots.map((x, k) => {
            const i = from + k;
            return (
              <button key={x.n} type="button" role="tab" aria-selected={i === sel} aria-label={spanLong(x.start)}
                className={'wc__wk is-' + x.status + (i === sel ? ' is-sel' : '') + (x.current ? ' is-now' : '') + (x.edited ? ' is-edited' : '')}
                onClick={() => { if (i !== sel) go(i - sel); }} />
            );
          })}
        </div>
      )}

      {menu && (
        <Sheet title={menu.title} onClose={() => setMenu(null)} locked={busy}>
          <div className="wc-menu">
            <p className="wc-menu__when">{menu.day ? `${WEEKDAY_SHORT[menu.day]}, ${Number(addDays(w.start, menu.day - 1).slice(8))} ${GEN[Number(addDays(w.start, menu.day - 1).slice(5, 7)) - 1]}` : 'В любой день недели'}{menu.from ? ` · перенесено из ${spanTiny(menu.from)}` : ''}</p>
            {onStart && (
              <button type="button" className="wc-menu__opt" onClick={() => { const b = menu.rows[0].block; setMenu(null); onStart(b); }}>
                <span className="wc-menu__ic"><IconPlay size={16} /></span>Начать тренировку
              </button>
            )}
            {editable && onEdit && (
              <button type="button" className="wc-menu__opt" onClick={() => { setMenu(null); onEdit(w.start); }}>
                <span className="wc-menu__ic">⇄</span>Перенести
              </button>
            )}
            {editable && (
              <button type="button" className="wc-menu__opt is-bad" disabled={busy} onClick={() => remove(menu)}>
                <span className="wc-menu__ic">✕</span>{busy ? 'Сохраняю…' : 'Не будет, без долга'}
              </button>
            )}
            {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
