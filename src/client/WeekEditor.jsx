import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, dateKey, monday, WEEKDAY_SHORT } from '../program-timeline.js';
import { apiMutate } from '../api.js';
import { Sheet, Note, Switch, Tag } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';
import { haptic } from '../telegram.js';
import {
  timelineWith, weekAt, weekItems, movedToDay, movedToWeek, removedFromWeek, addedToWeek, revertedWeek, clean,
  firstOpenDay, freeDay, programSessions, crowdedDays, changedWeeks, spanShort, spanTiny, sessionsText,
} from '../week-edits.js';
import './week-editor.css';

/**
 * Редактор программы по неделям (FT-788, этап 3, макет
 * week-editor-mockup.html, согласован владельцем 13.11.2026). Открывается
 * на выбранной неделе с днями; ‹ › и свайп — соседние недели, назад до
 * начала программы, вперёд без ограничения. Занятие: нажать — меню
 * переноса; удерживать 0,35 с — тащить на день; к краю — неделя
 * перелистывается (у края 0,5 с, потом край заблокирован, пока палец не
 * уйдёт, или ещё 1,2 с). Сделанные занятия не двигаются, на прошедшие дни
 * класть нельзя. Правят тренер и клиент; правила — week-edits.js
 */

const LIFT_MS = 350;
const SLOP = 8;
const EDGE = 28;
const EDGE_MS = 500;
const EDGE_LOCKED_MS = 1200;
const SWIPE = 50;

// iPhone отменяет прокрутку только слушателю touchmove, который уже был в
// момент касания (как в «Расписании»): слушатель стоит заранее, блокировка
// включается, лишь когда занятие поднято
let touchLock = false;
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('touchmove', (event) => {
    if (touchLock && event.cancelable) event.preventDefault();
  }, { passive: false });
}
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function WeekEditor({ blocks, sessions, month, cfg, clientRow = null, trainer = false, start, onSaved, onClose }) {
  const today = dateKey();
  const saved = cfg.weekEdits || {};
  const firstWeek = monday(cfg.startsOn);
  const thisWeek = monday(today);
  const [edits, setEdits] = useState(saved);
  const [cursor, setCursor] = useState(start && start >= firstWeek ? start : (thisWeek >= firstWeek ? thisWeek : firstWeek));
  const [anim, setAnim] = useState('');
  const [menu, setMenu] = useState(null); // занятие, по которому нажали
  const [pickWeek, setPickWeek] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addDay, setAddDay] = useState(0);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [drag, setDrag] = useState(null); // { start, idx, title }
  const [edge, setEdge] = useState({ dir: 0, locked: false, x: 0, y: 0, n: 0 });
  const rootRef = useRef(null);

  const horizon = [addDays(cursor, 63), ...Object.keys(edits)].sort().pop();
  const base = useMemo(() => timelineWith({ blocks, sessions, month, cfg, weekEdits: {}, until: horizon }), [blocks, sessions, month, cfg, horizon]);
  const timeline = useMemo(() => timelineWith({ blocks, sessions, month, cfg, weekEdits: edits, until: horizon }), [blocks, sessions, month, cfg, edits, horizon]);
  const w = weekAt(timeline, cursor);
  const items = weekItems(w);
  const canEdit = !!w && w.editable && w.end >= today;
  const openDay = firstOpenDay(cursor, today);
  const titles = useMemo(() => new Map(programSessions([...(blocks || []), ...(cfg.history || []).flatMap((h) => h.blocks || [])].reverse()).map((s) => [s.id, s.title])), [blocks, cfg]);
  const programList = useMemo(() => programSessions(blocks), [blocks]);
  const out = useMemo(() => clean(edits, base), [edits, base]);
  const changed = changedWeeks(saved, out);
  const dirty = changed.length > 0;

  const go = (dir) => {
    const next = addDays(cursor, dir * 7);
    if (next < firstWeek) return;
    haptic('selection');
    setAnim(reduceMotion() ? 'fade' : dir > 0 ? 'next' : 'prev');
    setCursor(next);
  };

  // Свежие значения для обработчиков жестов (они ставятся один раз)
  const live = useRef({});
  live.current = { edits, timeline, cursor, canEdit, openDay, firstWeek, thisWeek, go, items };

  const apply = (next) => { setEdits(next); setFailure(''); haptic(); };
  const moveDay = (it, day) => apply(movedToDay(edits, timeline, cursor, it.idx, day));
  const moveWeek = (it, to) => apply(movedToWeek(edits, timeline, cursor, it.idx, to, null, today));
  const remove = (it) => apply(removedFromWeek(edits, timeline, cursor, it.idx));
  const revert = () => apply(revertedWeek(edits, base, cursor, today));
  const add = (id) => { apply(addedToWeek(edits, timeline, cursor, id, addDay)); setAdding(false); };

  /* ------------------------------------------------------------------
   * Перетаскивание: палец — удержание 0,35 с, мышь — сразу после 5 px
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let g = null; // текущее касание
    let session = null; // поднятое занятие

    const dayAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const day = el && el.closest && el.closest('[data-we-day]');
      if (!day || !root.contains(day)) return null;
      const d = Number(day.dataset.weDay);
      const L = live.current;
      if (!L.canEdit || (d && d < L.openDay)) return null;
      return { el: day, d };
    };

    const lift = (el, x, y) => {
      const L = live.current;
      const idx = Number(el.dataset.weItem);
      const item = L.items.find((it) => it.idx === idx);
      if (!L.canEdit || !item || item.done) return null;
      const rect = el.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'we-ghost';
      ghost.textContent = item.title;
      ghost.style.width = rect.width + 'px';
      document.body.appendChild(ghost);
      const off = { x: x - rect.left, y: y - rect.top };
      const s = { origin: { start: L.cursor, idx }, ghost, over: null, edgeDir: 0, edgeTimer: 0, locked: false, raf: 0, x, y };
      const place = () => { ghost.style.transform = `translate3d(${s.x - off.x}px, ${s.y - off.y}px, 0) scale(1.03)`; };
      place();
      setDrag({ start: L.cursor, idx, title: item.title });
      haptic('medium');

      const scroller = root.closest('.sheet__body');
      const panel = root.closest('.sheet__panel') || root;
      // Дни по вертикали — у верхнего/нижнего края список прокручивается сам
      const tick = () => {
        if (scroller) {
          const r = scroller.getBoundingClientRect();
          const speed = s.y < r.top + 56 ? -(r.top + 56 - s.y) / 4 : s.y > r.bottom - 56 ? (s.y - (r.bottom - 56)) / 4 : 0;
          if (speed) { scroller.scrollTop += Math.max(-14, Math.min(14, speed)); mark(); }
        }
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);

      const mark = () => {
        const hit = dayAt(s.x, s.y);
        if (s.over && (!hit || hit.el !== s.over.el)) s.over.el.classList.remove('is-over');
        if (hit) hit.el.classList.add('is-over');
        s.over = hit;
      };
      const armEdge = (dir, r) => {
        clearTimeout(s.edgeTimer);
        s.edgeDir = dir;
        const at = { x: dir < 0 ? r.left + EDGE / 2 : r.right - EDGE / 2, y: s.y };
        setEdge((e) => ({ dir, locked: s.locked, ...at, n: e.n + 1 }));
        if (!dir) return;
        s.edgeTimer = setTimeout(function flip() {
          const L2 = live.current;
          // Назад — не раньше этой недели: на прошлые дни класть нельзя
          if (dir < 0 && addDays(L2.cursor, -7) < L2.thisWeek) return;
          L2.go(dir);
          haptic('selection');
          if (s.over) s.over.el.classList.remove('is-over');
          s.over = null;
          s.locked = true;
          setEdge((e) => ({ ...e, dir, locked: true, y: s.y, n: e.n + 1 }));
          s.edgeTimer = setTimeout(flip, EDGE_LOCKED_MS);
        }, s.locked ? EDGE_LOCKED_MS : EDGE_MS);
      };

      s.move = (nx, ny) => {
        s.x = nx;
        s.y = ny;
        place();
        mark();
        const r = panel.getBoundingClientRect();
        const dir = nx < r.left + EDGE ? -1 : nx > r.right - EDGE ? 1 : 0;
        if (dir !== s.edgeDir) {
          if (!dir) s.locked = false; // увели палец от края — блокировка снята
          armEdge(dir, r);
        }
      };
      const finish = () => {
        cancelAnimationFrame(s.raf);
        clearTimeout(s.edgeTimer);
        if (s.over) s.over.el.classList.remove('is-over');
        ghost.remove();
        setDrag(null);
        setEdge((e) => ({ ...e, dir: 0, locked: false }));
      };
      s.drop = () => {
        const hit = s.over;
        finish();
        if (!hit) return; // отпустили не над днём — ничего не меняется
        const L2 = live.current;
        const { start: from, idx: i } = s.origin;
        const next = from === L2.cursor
          ? movedToDay(L2.edits, L2.timeline, from, i, hit.d)
          : movedToWeek(L2.edits, L2.timeline, from, i, L2.cursor, hit.d);
        setEdits(next);
        setFailure('');
        haptic('success');
      };
      s.cancel = finish;
      return s;
    };

    // Слушатели — и на самом элементе: после перелистывания недели он
    // уходит со страницы, а касание продолжает приходить ему (как в «Расписании»)
    let last = null;
    const detach = (cur) => {
      for (const el of [root, cur && cur.el].filter(Boolean)) {
        el.removeEventListener('touchmove', move);
        el.removeEventListener('touchend', end);
        el.removeEventListener('touchcancel', end);
      }
    };
    function start(e) {
      if (e.touches.length !== 1 || session) return;
      const t = e.touches[0];
      const target = e.target.closest && e.target.closest('[data-we-item]');
      const cur = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, mode: '', timer: 0, target, el: e.target };
      if (g) detach(g);
      g = cur;
      if (target && target.dataset.weDone !== '1' && live.current.canEdit) {
        cur.timer = setTimeout(() => {
          if (g !== cur || cur.mode) return;
          const s = lift(target, cur.x, cur.y);
          if (!s) return;
          cur.mode = 'drag';
          session = s;
          touchLock = true;
        }, LIFT_MS);
      }
      for (const el of [root, e.target]) {
        el.addEventListener('touchmove', move, { passive: false });
        el.addEventListener('touchend', end, { passive: false });
        el.addEventListener('touchcancel', end, { passive: false });
      }
    }
    function move(e) {
      if (e === last) return;
      last = e;
      const cur = g;
      if (!cur) return;
      const t = e.touches[0];
      cur.x = t.clientX;
      cur.y = t.clientY;
      if (cur.mode === 'drag') {
        if (e.cancelable) e.preventDefault();
        session.move(cur.x, cur.y);
        return;
      }
      const dx = cur.x - cur.x0;
      const dy = cur.y - cur.y0;
      if (!cur.mode) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        clearTimeout(cur.timer);
        cur.mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (cur.mode === 'x' && e.cancelable) e.preventDefault();
    }
    function end(e) {
      if (e === last) return;
      last = e;
      const cur = g;
      if (!cur || e.touches.length) return;
      g = null;
      detach(cur);
      clearTimeout(cur.timer);
      if (cur.mode === 'drag') {
        touchLock = false;
        // Без нажатия после отпускания: иначе открылось бы меню переноса
        if (e.cancelable) e.preventDefault();
        const s = session;
        session = null;
        if (e.type === 'touchcancel') s.cancel(); else s.drop();
        return;
      }
      // Свайп вбок — соседняя неделя
      if (cur.mode === 'x') {
        const dx = cur.x - cur.x0;
        if (Math.abs(dx) > SWIPE) live.current.go(dx < 0 ? 1 : -1);
      }
    }

    // Мышь: перенос сразу, без удержания — как в «Расписании» на компьютере
    function down(e) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || session) return;
      const target = e.target.closest && e.target.closest('[data-we-item]');
      if (!target || target.dataset.weDone === '1' || !live.current.canEdit) return;
      const m = { x0: e.clientX, y0: e.clientY, s: null };
      const mm = (ev) => {
        if (!m.s) {
          if (Math.hypot(ev.clientX - m.x0, ev.clientY - m.y0) < 5) return;
          m.s = lift(target, m.x0, m.y0);
          if (!m.s) { up(); return; }
          session = m.s;
        }
        m.s.move(ev.clientX, ev.clientY);
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', mm);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!m.s) return;
        session = null;
        if (ev && ev.type === 'pointerup') m.s.drop(); else m.s.cancel();
        const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
        root.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => root.removeEventListener('click', stop, { capture: true }), 0);
      };
      window.addEventListener('pointermove', mm);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
    const keyOff = (e) => { if (e.key === 'Escape' && session) { e.stopPropagation(); const s = session; session = null; touchLock = false; s.cancel(); } };
    // Долгое нажатие на Android открывает меню и выделение — не здесь
    const menuOff = (e) => { if (e.target.closest && e.target.closest('[data-we-item]')) e.preventDefault(); };

    root.addEventListener('touchstart', start, { passive: true });
    root.addEventListener('pointerdown', down);
    root.addEventListener('contextmenu', menuOff);
    window.addEventListener('keydown', keyOff, true);
    return () => {
      root.removeEventListener('touchstart', start);
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('contextmenu', menuOff);
      window.removeEventListener('keydown', keyOff, true);
      detach(g);
      touchLock = false;
      if (session) session.cancel();
    };
  }, []);

  const save = async () => {
    setBusy(true);
    setFailure('');
    try {
      const res = await apiMutate('plan.week.edit', {
        ...(clientRow ? { clientRow } : {}), month, rev: Number(cfg.weekEditsRev) || 0, weekEdits: out, ...(trainer ? { notify } : {}),
      });
      haptic('success');
      onSaved(res.weeks);
    } catch (error) {
      setFailure(error.message || 'Не сохранилось');
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------------ */

  const weekTitle = cursor === thisWeek ? 'Эта неделя · ' + spanShort(cursor) : spanShort(cursor);
  const movedIn = items.filter((it) => it.from).length;
  const sub = !w ? '' : w.status === 'paused' ? 'Пауза — занятий нет'
    : w.status === 'expired' ? 'Программа к этой неделе закончилась'
    : [
      w.rhythm ? `Неделя ${w.week} ритма` : `Неделя ${w.week} программы`,
      sessionsText(items.length) + (movedIn ? ` (${items.length - movedIn} + ${movedIn} ${movedIn === 1 ? 'перенесённое' : 'перенесённых'})` : ''),
      (w.days || []).length ? w.days.map((d) => WEEKDAY_SHORT[d]).join(' ') : '',
    ].filter(Boolean).join(' · ');
  const crowded = crowdedDays(items, cursor);
  const sent = (w && w.sent) || [];
  const debts = w ? w.rows.filter((r) => r.carried && !r.extra) : [];
  const nextWeeks = [1, 2].map((k) => addDays(cursor, k * 7));
  const moreWeeks = [3, 4, 5, 6, 7, 8].map((k) => addDays(cursor, k * 7));
  const dayChip = (d) => `${WEEKDAY_SHORT[d]} ${Number(addDays(cursor, d - 1).slice(8))}`;

  const chip = (it) => {
    const lifted = drag && drag.start === cursor && drag.idx === it.idx;
    const cls = 'we-item' + (it.done ? ' is-done' : '') + (it.from ? ' is-moved' : '') + (lifted ? ' is-lifted' : '') + (canEdit && !it.done ? ' is-movable' : '');
    const label = (
      <>
        <span className="we-item__title">{it.title}</span>
        {it.done ? <span className="we-item__note">✓ сделано</span>
          : it.from ? <span className="we-item__note">из {spanTiny(it.from)}</span> : null}
        {canEdit && !it.done && <span className="we-item__grip" aria-hidden="true">⋮⋮</span>}
      </>
    );
    if (!canEdit || it.done) return <div key={it.idx} className={cls} data-we-item={it.idx} data-we-done={it.done ? '1' : '0'}>{label}</div>;
    return (
      <button key={it.idx} type="button" className={cls} data-we-item={it.idx} data-we-done="0"
        aria-label={`${it.title}${it.day ? ', ' + WEEKDAY_SHORT[it.day] : ', без дня'} — перенести`}
        onClick={() => { haptic(); setPickWeek(false); setMenu(it); }}>
        {label}
      </button>
    );
  };

  return (
    <Sheet title="Программа по неделям" onClose={onClose} dirty={dirty} locked={busy} className="we-sheet">
      <div className="we" ref={rootRef} data-no-gestures="" data-no-swipe="">
        <div className="we-nav">
          <button type="button" className="we-nav__arrow" aria-label="Неделя раньше" disabled={addDays(cursor, -7) < firstWeek} onClick={() => go(-1)}>‹</button>
          <div className="we-nav__title">
            <strong>{weekTitle}</strong>
            {w && w.edited && <Tag tone="warn">изменена</Tag>}
          </div>
          <button type="button" className="we-nav__arrow" aria-label="Неделя позже" onClick={() => go(1)}>›</button>
        </div>
        {cursor !== thisWeek && thisWeek >= firstWeek && (
          <button type="button" className="we-back" onClick={() => { setAnim(reduceMotion() ? 'fade' : cursor > thisWeek ? 'prev' : 'next'); setCursor(thisWeek); }}>К этой неделе</button>
        )}
        <p className="we-sub">{sub}</p>

        <div key={cursor} className={'we-days' + (anim ? ' is-' + anim : '')}>
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const date = addDays(cursor, d - 1);
            const list = items.filter((it) => it.day === d);
            const closed = !canEdit || d < openDay;
            return (
              <div key={d} className={'we-day' + (date === today ? ' is-today' : '') + (closed ? ' is-closed' : '') + (list.length ? '' : ' is-empty')} data-we-day={d}>
                <div className="we-day__label"><b>{WEEKDAY_SHORT[d]}</b> <span>{Number(date.slice(8))}</span></div>
                <div className="we-day__items">{list.map(chip)}</div>
              </div>
            );
          })}
          {(canEdit || items.some((it) => !it.day)) && (
            <div className={'we-day we-day--free' + (canEdit ? '' : ' is-closed')} data-we-day={0}>
              <div className="we-day__label"><b>Без дня</b></div>
              <div className="we-day__items">
                {items.filter((it) => !it.day).map(chip)}
                {canEdit && !items.some((it) => !it.day) && <span className="we-day__hint">сюда — клиент сделает в любой день недели</span>}
              </div>
            </div>
          )}
        </div>
        {edge.dir !== 0 && drag && (
          createPortal(<span key={edge.n} className={'we-edge' + (edge.locked ? ' is-locked' : '')} style={{ left: edge.x + 'px', top: edge.y + 'px' }} aria-hidden="true"><i /></span>, document.body)
        )}

        {sent.length > 0 && (
          <p className="we-sent">Перенесено: {sent.map((s) => `${titles.get(s.id) || 'занятие'} → ${spanTiny(s.to)}`).join(' · ')}</p>
        )}
        {debts.length > 0 && (
          <p className="we-sent">Долг прошлой недели: {debts.map((r) => r.block.title).join(', ')} — в любой день</p>
        )}
        {crowded.length > 0 && canEdit && (
          <p className="we-warn">{crowded.join(', ')}: два занятия в один день. Так и задумано? Если нет — перенесите одно.</p>
        )}
        {!canEdit && w && w.end < today && <p className="we-sent">Прошедшая неделя — только посмотреть.</p>}
        {canEdit && (
          <div className="we-tools">
            <button type="button" className="button button--ghost" onClick={() => { setAddDay(freeDay(items, openDay)); setAdding(true); }}>+ занятие</button>
            {w.edited && <button type="button" className="button button--ghost" onClick={revert}>Вернуть неделю как в программе</button>}
          </div>
        )}
        <p className="we-hint">
          Нажмите на занятие — меню переноса. Удерживайте — перетащите на другой день, к краю экрана — на соседнюю неделю.
          {' '}Сама программа не меняется: правка касается только выбранных недель.
        </p>

        {dirty && (
          <div className="we-changes">
            <strong>Изменения</strong>
            <ul>
              {changed.map((k) => {
                const x = weekAt(timeline, k);
                const n = x ? weekItems(x).length : (out[k] || []).length;
                return <li key={k}>{spanShort(k)}: {out[k] ? sessionsText(n) : 'как в программе'}</li>;
              })}
            </ul>
          </div>
        )}
        {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
        <div className="we-save">
          {trainer
            ? <Switch checked={notify} onChange={setNotify}>Уведомить клиента</Switch>
            : <p className="we-hint">Тренер получит уведомление об изменении.</p>}
          <button type="button" className="button button--primary button--block" disabled={!dirty || busy} onClick={save}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <button type="button" className="button button--block" disabled={busy} onClick={onClose}>Отменить</button>
        </div>
      </div>

      {menu && (
        <Sheet title={menu.title + ' — куда перенести'} onClose={() => setMenu(null)}>
          <div className="we-menu">
            <span className="we-menu__label">Эта неделя</span>
            <div className="chips chips--wrap">
              {[1, 2, 3, 4, 5, 6, 7].filter((d) => d >= openDay && d !== menu.day).map((d) => (
                <button key={d} type="button" className="chip" onClick={() => { moveDay(menu, d); setMenu(null); }}>{dayChip(d)}</button>
              ))}
              {menu.day !== 0 && <button type="button" className="chip" onClick={() => { moveDay(menu, 0); setMenu(null); }}>Без дня</button>}
            </div>
            <span className="we-menu__label">На другую неделю</span>
            <div className="chips chips--wrap">
              {nextWeeks.map((k, i) => (
                <button key={k} type="button" className="chip" onClick={() => { moveWeek(menu, k); setMenu(null); }}>
                  {i === 0 ? 'След. неделя' : 'Через неделю'} {spanTiny(k)}
                </button>
              ))}
              {!pickWeek && <button type="button" className="chip" onClick={() => setPickWeek(true)}>Выбрать…</button>}
              {pickWeek && moreWeeks.map((k) => (
                <button key={k} type="button" className="chip" onClick={() => { moveWeek(menu, k); setMenu(null); }}>{spanShort(k)}</button>
              ))}
            </div>
            <span className="we-menu__label">Ещё</span>
            <button type="button" className="button button--block we-menu__remove" onClick={() => { remove(menu); setMenu(null); }}>Убрать без долга</button>
            <p className="we-hint">«Убрать без долга» — договорились, что этого занятия не будет: неделя оценивается без него.</p>
          </div>
        </Sheet>
      )}

      {adding && (
        <Sheet title="Добавить занятие" onClose={() => setAdding(false)}>
          <div className="we-menu">
            <span className="we-menu__label">День</span>
            <div className="chips chips--wrap">
              {[1, 2, 3, 4, 5, 6, 7].filter((d) => d >= openDay).map((d) => (
                <button key={d} type="button" aria-pressed={addDay === d} className={'chip' + (addDay === d ? ' chip--active' : '')} onClick={() => setAddDay(d)}>{dayChip(d)}</button>
              ))}
              <button type="button" aria-pressed={addDay === 0} className={'chip' + (addDay === 0 ? ' chip--active' : '')} onClick={() => setAddDay(0)}>Без дня</button>
            </div>
            <span className="we-menu__label">Занятие программы</span>
            <div className="we-add">
              {programList.map((s) => (
                <button key={s.id} type="button" className="we-add__row" onClick={() => add(s.id)}>{s.title}</button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}
