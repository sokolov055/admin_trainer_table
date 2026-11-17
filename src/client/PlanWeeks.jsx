import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dateKey, nextMonday, programSize, addDays, WEEKDAY_SHORT, sessionsOf, sessionQueue as sessionQueueOf, MAX_RHYTHM } from '../program-timeline.js';
import { apiMutate } from '../api.js';
import { Segmented, Sheet, Note } from '../ui.jsx';
import { IconAlert, IconCheck, IconLink, IconPlus, IconMinus, IconPlay, IconClose } from '../icons.jsx';
import { haptic } from '../telegram.js';
import {
  weekDates, weekLoad, LOAD_LABEL, PROGRAM_LENGTHS, programLength, weekOf, withLength, withWeekLoad, startWeekOf,
  byWeek, lengthHint, monthWeeks, parseMonth, monthLabelOf,
} from '../plan-weeks.js';
import { weekItems, spanTiny } from '../week-edits.js';
import './plan-weeks.css';

/**
 * Программа по неделям, раскладка по циклам месяца (IDEA-7, 27–28.10.2026) —
 * экранная часть: полоска циклов с оценками над очередью, лист «доделать
 * или пропустить» в начале цикла, у тренера — на сколько недель программа,
 * пометки недель и правило о пропущенных. Правила — plan-weeks.js.
 */

const plural = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};
const workouts = (n) => n + ' ' + plural(n, 'тренировка', 'тренировки', 'тренировок');
const sessionsWord = (n) => n + ' ' + plural(n, 'занятие', 'занятия', 'занятий');

/**
 * Строки недели — занятиями (FT-788): «Ноги + Кардио». rows — строки
 * недели из scheduledPlan (extra — вторая и дальше тренировка занятия)
 */
export function sessionRows(rows) {
  return (rows || []).reduce((list, r) => {
    if (r.extra && list.length) list[list.length - 1].push(r);
    else list.push([r]);
    return list;
  }, []);
}
/** Что сверх занятий: «кардио 1 из 2», если всё дополнительное — кардио */
const extraLine = (w) => {
  if (!w.extraNeed) return '';
  const cardio = w.rows.filter((r) => r.extra).every((r) => (r.block.exercises || []).length && r.block.exercises.every((e) => e && e.cardio));
  return ` · ${cardio ? 'кардио' : 'к занятиям'} ${w.extraDone} из ${w.extraNeed}`;
};
/** «· одно перенесено с прошлой недели» — у недели, куда перенесли занятия (FT-788) */
const movedLine = (w) => {
  const moved = (w.layout || []).filter((it) => it.from);
  if (!moved.length) return '';
  const prev = moved.every((it) => it.from === addDays(w.start, -7));
  return ` · ${moved.length === 1 ? 'одно' : moved.length} перенесено ${prev ? 'с прошлой недели' : 'с других недель'}`;
};
const STATUS = { done: 'выполнен', missed: 'не выполнен', open: 'идёт', empty: 'неделя отдыха', paused: 'пауза', expired: 'программа завершена', partial: 'неполная неделя', scheduled: 'скоро начнётся', legacy: 'прежний список' };

/** «декабря» из «Декабрь 2026» — для «программа декабря не назначена» */
function monthGen(label) {
  const names = { Январь: 'январь', Февраль: 'февраль', Март: 'март', Апрель: 'апрель', Май: 'май', Июнь: 'июнь',
    Июль: 'июль', Август: 'август', Сентябрь: 'сентябрь', Октябрь: 'октябрь', Ноябрь: 'ноябрь', Декабрь: 'декабрь' };
  const name = String(label || '').split(' ')[0];
  const gen = { январь: 'января', февраль: 'февраля', март: 'марта', апрель: 'апреля', май: 'мая', июнь: 'июня',
    июль: 'июля', август: 'августа', сентябрь: 'сентября', октябрь: 'октября', ноябрь: 'ноября', декабрь: 'декабря' };
  return gen[names[name]] || label;
}

/** Месяц под датами недели: «ноя», на стыке — «ноя–дек» */
const shortMonths = (w) => {
  const a = String(w.fromGen || w.monthGen || '').slice(0, 3);
  const b = String(w.monthGen || '').slice(0, 3);
  return a && a !== b ? a + '–' + b : b;
};

/** Циклы месяца с оценками и сводка выбранного */
export function WeekStrip({ plan, sel, onSelect, onEdit = null }) {
  const w = plan.weeks[sel];
  const total = plan.weeks.length;
  const paged = total > 5;
  // Барабан (13.11.2026): недели едут за пальцем с инерцией и встают по
  // неделе — родная прокрутка с привязкой; стрелки — плавно на 5 недель
  const rowRef = useRef(null);
  const [view, setView] = useState({ start: true, end: false, now: true });
  const smooth = () => (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const tileAt = (i) => rowRef.current && rowRef.current.children[i];
  const centerOn = (i, behavior) => {
    const row = rowRef.current;
    const tile = tileAt(i);
    if (row && tile) row.scrollTo({ left: tile.offsetLeft - (row.clientWidth - tile.offsetWidth) / 2, behavior });
  };
  const measure = () => {
    const row = rowRef.current;
    if (!row) return;
    const tile = tileAt(plan.currentIndex);
    const now = !tile || (tile.offsetLeft + tile.offsetWidth > row.scrollLeft + 1 && tile.offsetLeft < row.scrollLeft + row.clientWidth - 1);
    const next = { start: row.scrollLeft <= 1, end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 1, now };
    setView((v) => (v.start === next.start && v.end === next.end && v.now === next.now ? v : next));
  };
  // Первый показ — выбранная неделя посередине, без анимации
  useLayoutEffect(() => { if (paged) { centerOn(sel, 'auto'); measure(); } }, [paged, total]);
  useEffect(() => {
    if (!paged || typeof window === 'undefined') return undefined;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [paged, total, plan.currentIndex]);
  const go = (dir) => {
    haptic();
    const row = rowRef.current;
    if (row) row.scrollBy({ left: dir * row.clientWidth, behavior: smooth() });
  };
  const { score } = plan;
  const summary = w.status === 'legacy' ? 'Пока действует прежний список тренировок'
    : w.status === 'paused' ? 'Плановые тренировки временно приостановлены'
    : w.status === 'expired' ? 'Срок программы закончился'
    : w.status === 'empty'
    ? 'В этой неделе программы нет тренировок'
    : (w.extraNeed ? `Занятий ${w.done} из ${w.need}` + extraLine(w) : `Сделано ${w.done} из ${w.need}`)
      + (w.rows.some((r) => r.carried && r.block.foreign) ? ' · с долгом прошлого месяца'
        : w.rows.some((r) => r.carried) ? ' · с долгом прошлого цикла' : '')
      + (w.extra ? ' · по прошлой программе: ' + w.extra : '')
      + movedLine(w)
      + (w.missed ? ' · не выполнено: ' + w.missed : '');
  const month = plan.scheduled
    ? w.status === 'scheduled' ? `Программа начнётся ${plan.cfg.startsOn.split('-').reverse().join('.')}` : w.status === 'expired' ? 'Программа завершена. Тренер назначит следующую.'
      : w.status === 'paused' ? 'Программа на паузе. Эта неделя не считается пропуском.'
        : plan.cfg.endsOn ? `Программа действует до ${plan.cfg.endsOn.split('-').reverse().join('.')}` : 'Программа действует до замены тренером'
    : w.beyond
    ? `Программа ${monthGen(w.beyond)} не назначена — пока идёт эта, по кругу`
    : score.allDone && score.graded === score.total
      ? 'Все циклы месяца выполнены — молодец!'
      : score.graded
        ? `Месяц: выполнено ${score.done} из ${score.graded} ${plural(score.graded, 'прошедшего цикла', 'прошедших циклов', 'прошедших циклов')}`
        : '';
  return (
    <div className="plan-weeks">
      {/* data-no-swipe: свайп по полоске листает недели, а не вкладки карточки */}
      <div className={'plan-weeks__nav' + (paged ? ' is-paged' : '')} {...(paged ? { 'data-no-swipe': '' } : {})}>
        {paged && <button type="button" className="plan-weeks__arrow" aria-label="Раньше" disabled={view.start} onClick={() => go(-1)}>‹</button>}
        <div
          ref={rowRef}
          className={'plan-weeks__strip' + (paged ? ' is-scroll' : '')}
          role="tablist"
          aria-label="Недели программы"
          onScroll={paged ? measure : undefined}
        >
          {plan.weeks.map((x, i) => (
            <button
              key={x.n}
              type="button"
              role="tab"
              aria-selected={i === sel}
              aria-label={`${weekDates(x)}: ${STATUS[x.status]}${x.edited ? ', неделя изменена' : ''}`}
              className={'plan-weeks__week' + (x.beyond ? ' is-short' : '') + (x.current ? ' is-now' : '') + (x.edited ? ' is-edited' : '')}
              onClick={() => { onSelect(i); haptic(); }}
            >
              <strong>{x.from + '–' + x.to}</strong>
              <span>{shortMonths(x)}</span>
              <i className={'plan-weeks__dot is-' + x.status} aria-hidden="true" />
            </button>
          ))}
        </div>
        {paged && <button type="button" className="plan-weeks__arrow" aria-label="Позже" disabled={view.end} onClick={() => go(1)}>›</button>}
      </div>
      {paged && plan.currentIndex >= 0 && !view.now && (
        <button type="button" className="plan-weeks__back" onClick={() => { haptic(); onSelect(plan.currentIndex); centerOn(plan.currentIndex, smooth()); }}>К этой неделе</button>
      )}
      <div className="plan-weeks__card">
        <div className="plan-weeks__head">
          <div>
            <strong>{w.current ? 'Эта неделя' : 'Неделя'} · {weekDates(w)}</strong>
            <span>{w.rhythm ? `${sessionsWord(w.rhythm)} в неделю${w.length > 1 ? ` · неделя ${w.week} из ${w.length}` : ''}` : `Неделя ${w.week} из ${w.length || plan.length}`}{w.load ? ' · ' + LOAD_LABEL[w.load].toLowerCase() : ''}{!w.full && w.need ? ' · неполная неделя, без оценки пропусков' : ''}</span>
          </div>
          {w.load
            ? <span className={'plan-weeks__kind plan-weeks__kind--' + w.load}>{LOAD_LABEL[w.load]}</span>
            : (w.status === 'done' || w.status === 'missed') && <span className={'plan-weeks__kind plan-weeks__kind--' + w.status}>{STATUS[w.status]}</span>}
        </div>
        {w.need > 0 && (
          <div className="plan-weeks__bar" aria-hidden="true">
            <span style={{ width: Math.min(100, Math.round(w.done / w.need * 100)) + '%' }} />
          </div>
        )}
        <p className="plan-weeks__summary">{summary}</p>
        {w.rows && w.rows.some((r) => r.day) && <DayLine week={w} />}
        {onEdit && w.editable && w.end >= dateKey() && (
          <button type="button" className="plan-weeks__edit" onClick={() => { haptic(); onEdit(w); }}>Изменить неделю</button>
        )}
        {month && <p className={'plan-weeks__month' + (score.allDone && score.graded === score.total ? ' is-praise' : '')}>{month}</p>}
      </div>
    </div>
  );
}

/**
 * Цикл закончился с пропусками, тренер оставил выбор клиенту. В первом
 * цикле месяца — последний цикл прошлого: выбор сохраняется под ним
 * (plan.pendingMonth)
 */
export function WeekChoice({ plan, month: shownMonth, clientRow, onChosen, onClose }) {
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState(() => new Set(plan.pending.map((r) => r.block.id)));
  const [failure, setFailure] = useState('');
  const w = plan.pendingWeek;
  const rows = plan.pending;
  const month = plan.pendingMonth || shownMonth;
  const choose = async (choice) => {
    setBusy(choice);
    setFailure('');
    try {
      let weeks = null;
      for (const r of rows) {
        const res = await apiMutate('plan.week.choose', { ...(clientRow ? { clientRow } : {}), month, week: w.n, blockId: r.block.id, choice: choice === 'redo' && !selected.has(r.block.id) ? 'skip' : choice });
        weeks = res.weeks;
      }
      haptic('success');
      onChosen(weeks);
    } catch (error) {
      setFailure(error.message || 'Не сохранилось');
      setBusy('');
    }
  };
  const one = rows.length === 1;
  return (
    <Sheet title="Прошлая неделя завершилась" onClose={onClose}>
      <div className="plan-weeks__choice">
        <p className="plan-weeks__lead">
          {one ? 'Одна тренировка не выполнена' : `${workouts(rows.length)} не выполнено`} · {weekDates(w)}
          {month !== shownMonth ? ` · программа «${month}»` : ''}
        </p>
        <ul className="plan-weeks__missed">
          {rows.map((r) => <li key={r.block.id}><label><input type="checkbox" checked={selected.has(r.block.id)} onChange={() => setSelected((old) => { const next = new Set(old); if (next.has(r.block.id)) next.delete(r.block.id); else next.add(r.block.id); return next; })} /> {r.block.title}</label></li>)}
        </ul>
        <button type="button" className="button button--primary button--block plan-weeks__option" disabled={!!busy} onClick={() => choose('redo')}>
          <strong>{busy === 'redo' ? 'Сохраняю…' : 'Перенести выбранные'}</strong>
          <span>На этой неделе станет {((plan.weeks[plan.currentIndex] || {}).need || 0) + rows.reduce((sum, r) => sum + (selected.has(r.block.id) ? r.missed || 1 : 0), 0)} тренировок</span>
        </button>
        <button type="button" className="button button--block plan-weeks__option" disabled={!!busy} onClick={() => choose('skip')}>
          <strong>{busy === 'skip' ? 'Сохраняю…' : 'Оставить в прошлой неделе'}</strong>
          <span>История сохранится, эта неделя останется по плану</span>
        </button>
        <p className="small muted plan-weeks__hint">Тренер увидит ваш выбор</p>
        {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
      </div>
    </Sheet>
  );
}

/* ==========================================================================
 * Тренер: неделя — раздел (FT-775, решения владельца 28.10.2026)
 *
 * До 28.10 неделя и нагрузка были полями у каждой тренировки, а длина
 * программы — переключателем, который молча раскидывал тренировки; три
 * экрана показывали одно и то же по-разному, и было непонятно, как
 * «создать по неделям, прикрепить старую, перевести на циклы». Теперь:
 * тренировки лежат под заголовками «Неделя 1 · Обычная», нагрузка — у
 * недели целиком, у каждого переключателя одна фраза о том, что получит
 * клиент. Правила — plan-weeks.js (byWeek, withWeekLoad, movedToWeek…)
 * ========================================================================== */

const LOADS = [{ value: '', label: 'Обычная' }, { value: 'light', label: 'Лёгкая' }, { value: 'heavy', label: 'Тяжёлая' }];
export const RULES = [
  { value: 'client', label: 'Решает клиент' },
  { value: 'redo', label: 'Доделывать' },
  { value: 'skip', label: 'Пропускать' },
];
export const RULE_HINT = {
  client: 'Клиент сам выбирает в начале следующего цикла: доделать пропущенную или идти дальше.',
  redo: 'Пропущенная сама встаёт первой в следующий цикл, клиент не выбирает.',
  skip: 'Пропущенная остаётся «не выполнена», цикл идёт по программе.',
};

/** «Одна / 2 / 3 / 4 / Список» + одной фразой, что получит клиент */
export function LengthPicker({ value, onChange, list = true, cycles = 0, count = 0, disabled = false, hint = null, label = 'Недель в программе' }) {
  const items = [
    { value: 1, label: list ? '1' : 'Одна' },
    ...PROGRAM_LENGTHS.filter((n) => n > 1).map((n) => ({ value: n, label: String(n) })),
    ...(list ? [{ value: 0, label: 'Список' }] : []),
  ];
  return (
    <div className="wk-pick">
      <Segmented items={items} value={value} label={label} track disabled={disabled} onChange={(n) => { haptic(); onChange(n); }} />
      <p className="wk-pick__hint">{hint || lengthHint(value, { cycles, count })}</p>
    </div>
  );
}

/** Нагрузка недели — плашка в заголовке раздела; только подпись */
export function WeekLoadPick({ value, onChange, week, disabled = false }) {
  return (
    <label className={'wk__load' + (value ? ' wk__load--' + value : '')}>
      <span>{(LOADS.find((l) => l.value === (value || '')) || LOADS[0]).label}</span>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      <select aria-label={`Нагрузка недели ${week}`} value={value || ''} disabled={disabled} onChange={(e) => { haptic(); onChange(e.target.value); }}>
        {LOADS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
    </label>
  );
}

/** Перенести тренировку в другую неделю — вторая дорога рядом с перетаскиванием */
export function MoveWeek({ block, length, onMove, disabled = false }) {
  const here = weekOf(block);
  if (length < 2) return null;
  return (
    <label className="wk__move">
      <span>В неделю…</span>
      <select aria-label={`Перенести «${block.title}» в другую неделю`} value="" disabled={disabled} onChange={(e) => { if (e.target.value) { haptic(); onMove(Number(e.target.value)); } }}>
        <option value="">В неделю…</option>
        {Array.from({ length }, (_, i) => i + 1).filter((n) => n !== here).map((n) => <option key={n} value={n}>в неделю {n}</option>)}
      </select>
    </label>
  );
}

/**
 * Тренировки по неделям: заголовок «Неделя N · k тренировок» с нагрузкой,
 * под ним — тренировки (renderBlock), «+ Тренировка в неделю N»
 * (addSlot(week, label) — кнопка родителя, иначе onAdd), пустая неделя —
 * «Скопировать неделю K». current — неделя программы текущего цикла
 */
export function WeekSections({ blocks, length, canEdit = false, current = 0, renderBlock, onLoad, onAdd, addSlot, onCopyWeek, onJoin, onSplit, disabled = false }) {
  const groups = byWeek(blocks, length);
  const filled = groups.filter((g) => g.blocks.length);
  return (
    <>
      {groups.map((g) => {
        const sessions = sessionsOf(g.blocks).length;
        return (
        <section className="wk" key={g.week} aria-label={`Неделя ${g.week}`}>
          <div className="wk__head">
            <h3>Неделя {g.week}</h3>
            <span className="wk__count">{g.blocks.length ? (sessions < g.blocks.length ? `${sessionsWord(sessions)} · ${workouts(g.blocks.length)}` : workouts(g.blocks.length)) : 'пока пусто'}{current === g.week ? ' · сейчас' : ''}</span>
            <span className="wk__spacer" />
            {canEdit
              ? <WeekLoadPick week={g.week} value={weekLoad(blocks, g.week)} disabled={disabled || !g.blocks.length} onChange={(load) => onLoad(g.week, load)} />
              : weekLoad(blocks, g.week) && <span className={'wk__load wk__load--' + weekLoad(blocks, g.week)}>{LOAD_LABEL[weekLoad(blocks, g.week)]}</span>}
          </div>
          <SessionGroups blocks={g.blocks} week={g.week} renderBlock={renderBlock} canEdit={canEdit} disabled={disabled} onJoin={onJoin} onSplit={onSplit} />
          {canEdit && g.blocks.length === 0 && (
            <div className="wk__empty">
              <span>{filled.length ? 'Пока без тренировок. Перенесите сюда из другой недели или:' : 'Пока без тренировок.'}</span>
              <div className="wk__row">
                {filled.length > 0 && onCopyWeek && (
                  <button type="button" className="button" disabled={disabled} onClick={() => { haptic(); onCopyWeek(filled[0].week, g.week); }}>
                    Скопировать неделю {filled[0].week}
                  </button>
                )}
                {addSlot ? addSlot(g.week, 'Новая тренировка') : (
                  <button type="button" className="button button--primary" disabled={disabled} onClick={() => { haptic(); onAdd(g.week); }}>Новая тренировка</button>
                )}
              </div>
            </div>
          )}
          {canEdit && g.blocks.length > 0 && (addSlot ? addSlot(g.week, `Тренировка в неделю ${g.week}`) : (
            <button type="button" className="wk__add" disabled={disabled} onClick={() => { haptic(); onAdd(g.week); }}>+ Тренировка в неделю {g.week}</button>
          ))}
        </section>
        );
      })}
    </>
  );
}

/**
 * Тренировки недели занятиями (FT-788, макет 13.11.2026): занятие из
 * нескольких тренировок — в рамке «Занятие 2 · Спина + Кардио» с
 * «Разделить»; между занятиями — «В одно занятие» (следующее — к
 * предыдущему). onJoin(head) — первая тренировка занятия, которое
 * цепляется; onSplit(group) — тренировки занятия. Без onJoin — только показ
 */
export function SessionGroups({ blocks, week = 0, renderBlock, canEdit = false, disabled = false, onJoin, onSplit }) {
  const groups = sessionsOf(blocks);
  const framed = groups.some((g) => g.length > 1);
  return groups.map((g, i) => (
    <React.Fragment key={'s' + blocks.indexOf(g[0])}>
      {i > 0 && canEdit && onJoin && (
        <div className="wk-join">
          <button type="button" disabled={disabled} onClick={() => { haptic(); onJoin(g[0]); }} aria-label={`«${g[0].title}» — в одно занятие с «${groups[i - 1][groups[i - 1].length - 1].title}»`}>
            <IconLink size={14} />В одно занятие
          </button>
        </div>
      )}
      {g.length > 1 ? (
        <div className="wk-sess" role="group" aria-label={`Занятие ${i + 1}`}>
          <div className="wk-sess__head">
            <span>Занятие {i + 1} · {g.map((b) => b.title || 'Без названия').join(' + ')}</span>
            {canEdit && onSplit && <button type="button" className="wk-sess__split" disabled={disabled} onClick={() => { haptic(); onSplit(g); }}>Разделить</button>}
          </div>
          {g.map((b, k) => (
            <React.Fragment key={'b' + blocks.indexOf(b)}>
              {k > 0 && <div className="wk-sess__then" aria-hidden="true">+ после «{g[k - 1].title || 'тренировки'}»</div>}
              {renderBlock(b, week)}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <>
          {framed && <div className="wk-sess__lone">Занятие {i + 1}</div>}
          {renderBlock(g[0], week)}
        </>
      )}
    </React.Fragment>
  ));
}

/**
 * Старые программы (FT-788): кардио отдельной тренировкой сразу после
 * силовой — «Прицепить каждое к силовой перед ним?». «Оставить так»
 * больше не спрашивает у этой программы (ключ — в памяти телефона)
 */
export function LooseCardio({ count, storeKey, onAttach, disabled = false }) {
  const key = 'ft.looseCardio.' + storeKey;
  const [hidden, setHidden] = useState(() => {
    try { return !!storeKey && localStorage.getItem(key) === '1'; } catch (_) { return false; }
  });
  if (!count || hidden) return null;
  return (
    <div className="wk-loose" role="note">
      <strong>{count === 1 ? 'Кардио — отдельной тренировкой' : `${count} кардио — отдельными тренировками`}</strong>
      <span>{count === 1 ? 'Прицепить его к силовой перед ним? Это будет одно занятие.' : 'Прицепить каждое к силовой перед ним? В неделе будет меньше занятий, а тренировки останутся теми же.'}</span>
      <div className="wk__row">
        <button type="button" className="button button--primary" disabled={disabled} onClick={() => { haptic(); onAttach(); }}>Прицепить</button>
        <button type="button" className="button" onClick={() => { haptic(); setHidden(true); try { if (storeKey) localStorage.setItem(key, '1'); } catch (_) { /* приватный режим */ } }}>Оставить так</button>
      </div>
    </div>
  );
}

/** «Октябрь 2026» → «Ноябрь 2026» */
function nextMonthOf(month) {
  const p = parseMonth(month);
  return p ? monthLabelOf(p.year, p.month + 1) : '';
}
/** «26 окт – 1 ноя» — коротко, для строки состояния */
function shortDates(w) {
  const g = (s) => s.slice(0, 3);
  return w.fromGen && w.fromGen !== w.monthGen ? `${w.from} ${g(w.fromGen)} – ${w.to} ${g(w.monthGen)}` : `${w.from}–${w.to} ${g(w.monthGen)}`;
}
const monthWord = (label) => String(label || '').split(' ')[0];

/**
 * Тренеру над программой месяца: списком или по неделям, какой цикл сейчас,
 * что с пропусками, нет ли дыры в следующем месяце. Отсюда — «Разложить по
 * неделям» (список) или «Настроить» (по неделям)
 */
export function MonthStatus({ month, blocks, plan, cfg, months, onSpread, onSettings, today = new Date() }) {
  const length = programSize(blocks, cfg);
  const count = blocks.length;
  const cur = plan && plan.currentIndex >= 0 ? plan.weeks[plan.currentIndex] : null;
  // Следующий месяц без программы — с четверга перед его понедельником (как напоминание в «Клиентах»)
  const next = nextMonthOf(month);
  const nextCycles = !(cfg && cfg.schedule === 1) && next && length && months[0] === month && !months.includes(next) ? monthWeeks(next) : null;
  const soon = nextCycles && (new Date(nextCycles[0].start + 'T00:00:00').getTime() - today.getTime()) <= 4 * 24 * 60 * 60 * 1000;
  const nextWeek = length ? ((startWeekOf(cfg, length) - 1 + (monthWeeks(month) || []).length) % length) + 1 : 0;
  const rule = (cfg && cfg.rule) || 'client';
  return (
    <div className="wk-status" data-reveal="">
      <div className="wk-status__top">
        <strong>
          {cfg && cfg.schedule === 1 ? 'Программа' : monthWord(month)}: {length ? (length === 1 ? 'одна неделя по кругу' : `${length} недели по кругу`) : `${workouts(count)} списком`}
        </strong>
        {length > 0 && <button type="button" className="wk-status__link" onClick={() => { haptic(); onSettings(); }}>Настроить</button>}
      </div>
      {length
        ? (
          <p>
            {cur ? `Сейчас ${shortDates(cur)} — неделя ${cur.week} из ${length}. ` : ''}
            {cfg && cfg.schedule === 1 ? (cfg.endsOn ? `Действует до ${cfg.endsOn.split('-').reverse().join('.')}. ` : 'Действует до замены тренером. ') : ''}
            Пропуски: {rule === 'redo' ? 'доделывать' : rule === 'skip' ? 'пропускать' : 'решает клиент'}.
          </p>
        )
        : <p>Без недель — клиент идёт по очереди на месяц. Циклов и оценок «неделя выполнена» нет.</p>}
      {soon && (
        <p className="wk-status__warn">
          {monthWord(next)} начнётся {nextCycles[0].from} {nextCycles[0].fromGen}{length > 1 ? ` с недели ${nextWeek}` : ''} — программы на {monthWord(next).toLowerCase()} ещё нет.
        </p>
      )}
      {!length && <button type="button" className="button button--primary" onClick={() => { haptic(); onSpread(); }}>Разложить по неделям</button>}
    </div>
  );
}

/** Предпросмотр: неделя → названия тренировок */
/** День недели даты «ГГГГ-ММ-ДД»: 1 — понедельник … 7 — воскресенье */
export const weekdayOf = (key) => ((new Date(key + 'T12:00:00').getDay() + 6) % 7) + 1;

/** Дни занятий клиента — любой набор из семи, можно ни одного (13.11.2026) */
export function DayPicker({ value, onChange }) {
  const set = new Set(value || []);
  return (
    <div className="chips wk-days" role="group" aria-label="Дни занятий">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <button key={d} type="button" aria-pressed={set.has(d)} className={'chip' + (set.has(d) ? ' chip--active' : '')}
          onClick={() => { haptic(); onChange([1, 2, 3, 4, 5, 6, 7].filter((x) => (x === d ? !set.has(d) : set.has(x)))); }}>
          {WEEKDAY_SHORT[d]}
        </button>
      ))}
    </div>
  );
}

/** «Сегодня по плану: B · Спина + Кардио» и дни недели — у недели с днями занятий */
function DayLine({ week }) {
  const today = dateKey();
  // По раскладке недели (FT-788): одно занятие может стоять дважды, перенесённое — с пометкой
  const items = weekItems(week);
  const name = (it) => it.rows.map((r, i) => r.block.title + ((i === 0 ? it.done : r.left === 0) ? ' ✓' : '')).join(' + ')
    + (it.from ? ` (перенесено из ${spanTiny(it.from)})` : '');
  const planned = items.filter((it) => it.day).sort((a, b) => a.day - b.day || a.idx - b.idx);
  const free = items.filter((it) => !it.day);
  const now = week.current && planned.find((it) => addDays(week.start, it.day - 1) === today && !it.done);
  return (
    <p className="wk-today">
      {now ? <><b>Сегодня по плану: {now.title}</b><br /></> : null}
      {planned.map((it) => `${WEEKDAY_SHORT[it.day]} — ${name(it)}`).join(' · ')}
      {free.length ? ' · в любой день: ' + free.map(name).join(', ') : ''}
    </p>
  );
}

/**
 * Ритм (FT-788, макет program-week-mockup.html, раздел 2): сколько занятий
 * в неделю — одно число или чередование недель (3 · 1), у недель
 * чередования свои дни; неделя с одним занятием — дальше по очереди или
 * всегда одно и то же. value — { rhythm: [], rhythmDays: [[]], one: ключ
 * занятия или '' }; sessions — [{ key, title }] занятия программы по порядку;
 * count — занятий в неделе программы (для «Все»)
 */
export function RhythmPicker({ value, onChange, sessions = [], count = 0, seedDays = [] }) {
  const rhythm = value.rhythm || [];
  const days = value.rhythmDays || [];
  const alternate = rhythm.length > 1;
  const set = (patch) => onChange({ ...value, ...patch });
  const setAt = (i, n) => set({ rhythm: rhythm.map((x, k) => (k === i ? n : x)) });
  const lightWeek = alternate && rhythm.includes(1) && rhythm.some((n) => n > 1);
  const counts = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }));
  return (
    <div className="wk-rows__item">
      <strong>Сколько занятий в неделю</strong>
      {!alternate && (
        <Segmented
          items={counts}
          value={rhythm[0] || 0}
          label="Занятий в неделю"
          track
          onChange={(n) => { haptic(); set({ rhythm: n ? [n] : [], rhythmDays: [], one: '' }); }}
        />
      )}
      {alternate && rhythm.map((n, i) => (
        <div className="wk-beat" key={i}>
          <div className="wk-beat__top">
            <b>Неделя {i + 1}</b>
            {rhythm.length > 2 && <button type="button" className="wk-beat__drop" onClick={() => { haptic(); set({ rhythm: rhythm.filter((_, k) => k !== i), rhythmDays: days.filter((_, k) => k !== i) }); }}>Убрать</button>}
          </div>
          <Segmented items={counts} value={n} label={`Занятий в неделю ${i + 1}`} track onChange={(v) => { haptic(); setAt(i, v); }} />
          <DayPicker value={days[i] || []} onChange={(d) => set({ rhythmDays: rhythm.map((_, k) => (k === i ? d : days[k] || [])) })} />
        </div>
      ))}
      <div className="wk__row">
        <button type="button" aria-pressed={!rhythm.length} className={'chip' + (!rhythm.length ? ' chip--active' : '')}
          onClick={() => { haptic(); set({ rhythm: [], rhythmDays: [], one: '' }); }}>
          Как в программе
        </button>
        <button type="button" aria-pressed={alternate} className={'chip' + (alternate ? ' chip--active' : '')}
          onClick={() => { haptic(); set(alternate ? { rhythm: [rhythm[0]], rhythmDays: [], one: '' } : { rhythm: [rhythm[0] || count || 3, 1], rhythmDays: [seedDays || [], []] }); }}>
          Чередовать недели
        </button>
        {alternate && rhythm.length < MAX_RHYTHM && (
          <button type="button" className="chip" onClick={() => { haptic(); set({ rhythm: [...rhythm, rhythm[0]] }); }}>+ неделя</button>
        )}
      </div>
      <span>
        {!rhythm.length
          ? `Все занятия недели программы${count ? ` (${count})` : ''} — каждую неделю.`
          : alternate
            ? `Ритм ${rhythm.join(' · ')} — и так по кругу. Считаются занятия (дни прихода), очередь продолжается с того места, где клиент остановился. Дни недели можно не отмечать.`
            : `${rhythm[0]} в неделю. Занятия идут по кругу: на следующей неделе — с того места, где остановились.`}
      </span>
      {lightWeek && sessions.length > 1 && (
        <>
          <strong>Неделя с одним занятием</strong>
          <Segmented items={[{ value: 'next', label: 'Дальше по очереди' }, { value: 'one', label: 'Всегда одно' }]} value={value.one !== '' && value.one !== undefined ? 'one' : 'next'} label="Неделя с одним занятием"
            onChange={(v) => { haptic(); set({ one: v === 'one' ? sessions[sessions.length - 1].key : '' }); }} />
          {value.one !== '' && value.one !== undefined && (
            <div className="chips chips--wrap" role="radiogroup" aria-label="Какое занятие">
              {sessions.map((x) => (
                <button key={x.key} type="button" role="radio" aria-checked={x.key === value.one} className={'chip' + (x.key === value.one ? ' chip--active' : '')} onClick={() => { haptic(); set({ one: x.key }); }}>{x.title}</button>
              ))}
            </div>
          )}
          {value.one !== '' && value.one !== undefined && <span>Это занятие — только в неделю с одним, в остальные недели его нет.</span>}
        </>
      )}
    </div>
  );
}

/** Как идёт неделя, если программа начинается не с понедельника */
export const firstWeekDefault = (days) => (days && days.length ? 'days' : 'order');

export function FirstWeekPicker({ startsOn, days, blocks, value, onChange }) {
  const start = weekdayOf(startsOn);
  const list = days || [];
  // Занятия, а не тренировки (FT-788): «Ноги + Кардио»
  const names = sessionsOf(blocks || []).map((g) => g.map((b) => b.title).join(' + '));
  const dayName = (d) => WEEKDAY_SHORT[d];
  const left = list.filter((d) => d >= start);
  const byDays = list.length
    ? names.map((t, i) => (list[i] && list[i] >= start ? `${dayName(list[i])} — ${t}` : '')).filter(Boolean).join(', ') || 'На этой неделе занятий не останется'
    : '';
  const fits = list.length ? left.length : Math.max(1, Math.round(names.length * (8 - start) / 7));
  const byOrder = names.slice(0, fits).map((t, i) => (left[i] ? `${dayName(left[i])} — ${t}` : t)).join(', ');
  const rest = names.slice(fits);
  const options = [
    { value: 'days', title: 'По дням программы', text: list.length ? `${byDays}. Прошедшие дни пропускаются, долгом не считаются.` : 'Сначала отметьте дни занятий выше.', off: !list.length },
    { value: 'order', title: 'Сначала то, что по порядку', text: `${byOrder || '—'}.${rest.length ? ` ${rest.join(', ')} — в начало следующей недели.` : ''}` },
    { value: 'all', title: 'Успеть всю неделю', text: `${names.join(', ')} — за оставшиеся дни, как раньше.` },
  ];
  return (
    <div className="wk-rows__item">
      <strong>Эта неделя начинается {['', 'с понедельника', 'со вторника', 'со среды', 'с четверга', 'с пятницы', 'с субботы', 'с воскресенья'][start]} — что делать?</strong>
      <div className="wk-opts" role="radiogroup" aria-label="Первая неделя">
        {options.map((o) => (
          <button type="button" role="radio" aria-checked={value === o.value} aria-disabled={o.off} disabled={o.off} className="wk-opt" key={o.value} onClick={() => { haptic(); onChange(o.value); }}>
            <span className="wk-opt__mark" aria-hidden="true">{value === o.value && <IconCheck size={12} />}</span>
            <span className="wk-opt__body"><strong>{o.title}</strong><span>{o.text}</span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WeekPreview({ rows }) {
  return (
    <div className="wk-prev">
      {rows.map((r) => (
        <div key={r.key}><b>{r.label}</b><span>{r.titles.length ? r.titles.join(' · ') : 'без тренировок'}</span></div>
      ))}
    </div>
  );
}

/**
 * Лист «Разложить по неделям» — программа-список у клиента становится по
 * неделям: на сколько, предпросмотр, с какой недели (текущий цикл — неделя
 * 1), правило. Старые клиенты не меняются, пока тренер не нажмёт (решение
 * владельца 28.10.2026)
 */
export function SpreadSheet({ month, blocks, cfg, onApply, onClose, busy = false }) {
  const [n, setN] = useState(blocks.length >= 2 && blocks.length <= 4 ? 1 : Math.min(4, Math.max(2, blocks.length)));
  const [rule, setRule] = useState((cfg && cfg.rule) || 'client');
  const [startsOn, setStartsOn] = useState(dateKey());
  const [endsOn, setEndsOn] = useState('');
  const [loadAccepted, setLoadAccepted] = useState(false);
  const cycles = monthWeeks(month) || [];
  const laid = withLength(blocks, n);
  const overloaded = byWeek(laid, n).some((g) => g.blocks.length > 6);


  return (
    <Sheet title="Разложить по неделям" onClose={onClose}>
      <div className="wk-rows">
        <div className="wk-rows__item">
          <strong>Недель в программе</strong>
          <LengthPicker value={n} onChange={setN} list={false} cycles={cycles.length} count={blocks.length} />
          {n > 1 && <span>Тренировки разложатся по порядку поровну. Потом можно перенести.</span>}
        </div>
        <WeekPreview rows={byWeek(laid, n).map((g) => ({ key: g.week, label: `Неделя ${g.week}`, titles: g.blocks.map((b) => b.title) }))} />
        <div className="wk-rows__item">
          <strong>Клиент начнёт с недели 1</strong>
          <ProgramDates startsOn={startsOn} endsOn={endsOn} onStart={setStartsOn} onEnd={setEndsOn} />
          <span>
            Программа начнётся с выбранной даты. Неполная неделя не получит оценку «не выполнена».
            Проведённые тренировки остаются выполненными.
          </span>
        </div>
        <div className="wk-rows__item">
          <strong>Пропущенные тренировки</strong>
          <Segmented items={RULES} value={rule} label="Пропущенные тренировки" track onChange={(v) => { haptic(); setRule(v); }} />
          <span>{RULE_HINT[rule]}</span>
        </div>
        {overloaded && <label className="wk__row"><input type="checkbox" checked={loadAccepted} onChange={(e) => setLoadAccepted(e.target.checked)} />В одной неделе больше 6 тренировок. Я проверил распределение.</label>}
        <button type="button" className="button button--primary button--block" disabled={busy || (overloaded && !loadAccepted)} onClick={() => onApply({ blocks: laid, rule, startWeek: 1, schedule: 1, startsOn, endsOn, length: n })}>
          {busy ? 'Сохраняю…' : 'Разложить'}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Лист «Настроить» у программы по неделям: длина, нагрузка недель, с какой
 * недели начался месяц, правило — с одной фразой у каждого
 */
export function ProgramDates({ startsOn, endsOn, onStart, onEnd, disabled = false }) {
  return <>
    <label className="field"><span className="field__label">Дата начала</span><input className="field__input" type="date" value={startsOn} disabled={disabled} onChange={(e) => onStart(e.target.value)} /></label>
    <label className="field"><span className="field__label">Срок программы</span><select className="field__input" value={endsOn ? 'date' : 'open'} onChange={(e) => onEnd(e.target.value === 'open' ? '' : addDays(startsOn || dateKey(), 27))}><option value="open">До замены тренером</option><option value="date">До даты</option></select></label>
    {endsOn && <label className="field"><span className="field__label">Последний день программы</span><input className="field__input" type="date" min={startsOn} value={endsOn} onChange={(e) => onEnd(e.target.value)} /></label>}
  </>;
}

/* ==========================================================================
 * Лист «Настроить программу» (14.11.2026, макет program-settings-mockup.html):
 * четыре блока по частоте — «Неделя» (сколько в неделю и по каким дням),
 * «Цикл» (недели и их нагрузка столбиками), «Сроки» (старт, конец, паузы),
 * «Пропуск» (три плитки с маленькой анимацией). «Видна клиенту» — глаз в
 * шапке, «Применить с» и неделя продолжения — строка над «Сохранить».
 * Что сохраняется, не поменялось: те же поля weeks, что и раньше
 * ========================================================================== */

const ruShort = (key) => (key ? new Date(key + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '') : '');
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
const LOAD_CYCLE = ['', 'light', 'heavy'];
const RULE_TILES = [{ value: 'client', label: 'Клиент' }, { value: 'redo', label: 'Доделать' }, { value: 'skip', label: 'Дальше' }];
const RULE_SHORT = { client: 'Клиент выберет: доделать или дальше', redo: 'Пропущенная встанет первой на следующей неделе', skip: 'Остаётся пропуском, идём дальше' };

function Dumbbell() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <rect x="1" y="9" width="4" height="6" rx="1" /><rect x="19" y="9" width="4" height="6" rx="1" />
      <rect x="5" y="7" width="3" height="10" rx="1" /><rect x="16" y="7" width="3" height="10" rx="1" /><rect x="8" y="11" width="8" height="2" />
    </svg>
  );
}
function PauseGlyph() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>;
}
function EyeGlyph({ off }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" />
      <path className={'ws-eye__slash' + (off ? ' is-on' : '')} d="M4 4l16 16" />
    </svg>
  );
}

/** Глаз в шапке листа: видна программа клиенту или нет; нажатие — подсказка на секунду */
function VisibilityEye({ visibility }) {
  const [flash, setFlash] = useState('');
  const [shown, setShown] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hidden = !!visibility.hidden;
  return (
    <button type="button" className={'ws-eye' + (hidden ? ' is-off' : '')} aria-pressed={!hidden} disabled={visibility.busy}
      aria-label={hidden ? 'Скрыта от клиента — показать' : 'Видна клиенту — скрыть'}
      onClick={() => { haptic(); visibility.onToggle(); setFlash(hidden ? 'Клиент видит' : 'Скрыта от клиента'); setShown(true); clearTimeout(timer.current); timer.current = setTimeout(() => setShown(false), 1500); }}>
      <EyeGlyph off={hidden} />
      <span className={'ws-eye__toast' + (shown ? ' is-shown' : '')} role="status">{flash}</span>
    </button>
  );
}

/** Число «в неделю» с −/+: подпрыгивает при смене */
function CountDial({ value, onChange, note }) {
  return (
    <div className="ws-count">
      <button type="button" className="ws-step" aria-label="Меньше занятий" disabled={value <= 1} onClick={() => { haptic(); onChange(value - 1); }}><IconMinus size={20} /></button>
      <div className="ws-count__num" aria-live="polite"><b key={value}>{value || '—'}</b><small>{note}</small></div>
      <button type="button" className="ws-step" aria-label="Больше занятий" disabled={value >= 7} onClick={() => { haptic(); onChange(value + 1); }}><IconPlus size={20} /></button>
    </div>
  );
}

/** Семь кружков: отмеченный день — синий с гантелей */
function DayDots({ value, onToggle }) {
  const set = new Set(value || []);
  return (
    <div className="ws-days" role="group" aria-label="Дни занятий">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <button key={d} type="button" aria-pressed={set.has(d)} className={'ws-day' + (set.has(d) ? ' is-on' : '')} onClick={() => { haptic(); onToggle(d); }}>
          <small>{WEEKDAY_SHORT[d]}</small>
          <span className="ws-day__dot"><Dumbbell /></span>
        </button>
      ))}
    </div>
  );
}

const daysLine = (days, count) => {
  const list = [...(days || [])].sort((a, b) => a - b);
  if (!list.length) return 'в любые дни';
  const more = count > list.length ? count - list.length : 0;
  return list.map((d) => WEEKDAY_SHORT[d]).join(' · ') + (more ? ` + ещё ${more}` : '');
};

/**
 * Откуда дни занятий (FT-788, этап 4): «По записям» — записи «Расписания»
 * ставят занятия на свои дни, без записи — по дням ниже; «Только по дням» —
 * расписание на программу не влияет (по умолчанию, как было)
 */
function DaySource({ value, onChange }) {
  const items = [
    { value: true, label: 'По записям', icon: <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /><circle cx="12" cy="15.5" r="2" /></svg> },
    { value: false, label: 'Только по дням', icon: <span className="ws-src__dots" aria-hidden="true">{[1, 0, 1, 0, 0, 1, 0].map((on, i) => <i key={i} className={on ? 'is-on' : ''} />)}</span> },
  ];
  return (
    <>
      <div className="ws-src" role="radiogroup" aria-label="Дни занятий">
        {items.map((it) => (
          <button key={it.label} type="button" role="radio" aria-checked={value === it.value} className={'ws-src__opt' + (value === it.value ? ' is-on' : '')}
            onClick={() => { haptic(); onChange(it.value); }}>{it.icon}{it.label}</button>
        ))}
      </div>
      <p className="ws-hint">{value ? 'Записи в расписании — главные. Без записи — по дням выше.' : 'Записи в расписании на программу не влияют.'}</p>
    </>
  );
}

/**
 * Кто ведёт занятие (владелец 14.11.2026): «с тренером» встаёт на запись
 * «Расписания», «сам» — клиент по приложению, на свой день из ⚙. Здесь —
 * для всей программы; на отдельной неделе меняют в меню занятия
 */
function SoloPicker({ sessions, value, onChange }) {
  if (!sessions.length) return null;
  return (
    <div className="ws-solo">
      <h4 className="ws-solo__h">Кто ведёт занятие</h4>
      {sessions.map((x, i) => {
        const on = value.includes(x.key);
        return (
          <div className={'ws-solo__row' + (on ? ' is-solo' : '')} key={x.key}>
            <span className="ws-solo__letter" aria-hidden="true">{String.fromCharCode(65 + (i % 26))}</span>
            <span className="ws-solo__name">{x.title}<small>{on ? 'клиент сам, по приложению' : 'на записи с тренером'}</small></span>
            <span className="ws-solo__seg" role="radiogroup" aria-label={'Кто ведёт: ' + x.title}>
              <button type="button" role="radio" aria-checked={!on} className={!on ? 'is-on' : ''} onClick={() => { haptic(); onChange(value.filter((k) => k !== x.key)); }}>с тренером</button>
              <button type="button" role="radio" aria-checked={on} className={on ? 'is-on is-solo' : ''} onClick={() => { haptic(); onChange([...value.filter((k) => k !== x.key), x.key]); }}>сам</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * «Неделя»: число и дни — одно решение. Отметил больше дней, чем занятий, —
 * число растёт; убавил число ниже числа дней — лишние дни снимаются.
 * Число, равное неделе программы, — это «как в программе» (rhythm: [])
 */
export function WeekBlock({ beat, setBeat, days, setDays, count, sessions, source = null }) {
  const [ab, setAb] = useState(0);
  const rhythm = beat.rhythm || [];
  const rDays = beat.rhythmDays || [];
  const alternate = rhythm.length > 1;
  const i = Math.min(ab, Math.max(0, rhythm.length - 1));
  const cur = alternate ? rhythm[i] : (rhythm[0] || count || 1);
  const curDays = alternate ? (rDays[i] || []) : days;
  const plain = (n) => (count && n === count ? [] : [n]);
  const setCount = (n, nextDays = curDays) => {
    const v = Math.min(7, Math.max(1, n));
    const trimmed = nextDays.length > v ? [...nextDays].sort((a, b) => a - b).slice(0, v) : nextDays;
    if (alternate) setBeat({ ...beat, rhythm: rhythm.map((x, k) => (k === i ? v : x)), rhythmDays: rhythm.map((_, k) => (k === i ? trimmed : rDays[k] || [])) });
    else { setBeat({ rhythm: plain(v), rhythmDays: [], one: '' }); setDays(trimmed); }
  };
  const toggle = (d) => {
    const next = curDays.includes(d) ? curDays.filter((x) => x !== d) : [...curDays, d].sort((a, b) => a - b);
    setCount(Math.max(cur, next.length), next);
  };
  const flip = () => {
    if (alternate) { setBeat({ rhythm: plain(rhythm[0]), rhythmDays: [], one: '' }); setDays(rDays[0] || []); }
    else { setBeat({ rhythm: [cur, 1], rhythmDays: [days, []], one: '' }); }
    setAb(0);
  };
  const lightWeek = alternate && rhythm.includes(1) && rhythm.some((n) => n > 1);
  const oneOn = beat.one !== '' && beat.one !== undefined;
  return (
    <section className="ws-blk">
      <h3 className="ws-blk__h">Неделя</h3>
      {alternate && (
        <div className="ws-ab">
          <Segmented items={rhythm.map((n, k) => ({ value: k, label: `${LETTERS[k]} · ${n}` }))} value={i} label="Неделя чередования" track onChange={(k) => { haptic(); setAb(k); }} />
          {rhythm.length < MAX_RHYTHM && <button type="button" className="ws-mini" aria-label="Добавить неделю чередования" onClick={() => { haptic(); setBeat({ ...beat, rhythm: [...rhythm, rhythm[0]], rhythmDays: [...rhythm.map((_, k) => rDays[k] || []), []] }); setAb(rhythm.length); }}><IconPlus size={16} /></button>}
          {rhythm.length > 2 && <button type="button" className="ws-mini" aria-label={`Убрать неделю ${LETTERS[i]}`} onClick={() => { haptic(); setBeat({ ...beat, rhythm: rhythm.filter((_, k) => k !== i), rhythmDays: rDays.filter((_, k) => k !== i) }); setAb(0); }}><IconMinus size={16} /></button>}
        </div>
      )}
      <CountDial value={cur} onChange={(n) => setCount(n)} note={!alternate && !rhythm.length && count ? 'как в программе' : 'в неделю'} />
      <DayDots value={curDays} onToggle={toggle} />
      <p className="ws-hint">{daysLine(curDays, cur)}</p>
      {lightWeek && sessions.length > 1 && rhythm[i] === 1 && (
        <div className="ws-one">
          <Segmented items={[{ value: 'next', label: 'По очереди' }, { value: 'one', label: 'Всегда одно' }]} value={oneOn ? 'one' : 'next'} label="Неделя с одним занятием"
            onChange={(v) => { haptic(); setBeat({ ...beat, one: v === 'one' ? sessions[sessions.length - 1].key : '' }); }} />
          {oneOn && (
            <div className="chips chips--wrap" role="radiogroup" aria-label="Какое занятие">
              {sessions.map((x) => (
                <button key={x.key} type="button" role="radio" aria-checked={x.key === beat.one} className={'chip' + (x.key === beat.one ? ' chip--active' : '')} onClick={() => { haptic(); setBeat({ ...beat, one: x.key }); }}>{x.title}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="ws-row ws-row--center">
        <button type="button" className={'ws-chip' + (alternate ? ' is-on' : '')} aria-pressed={alternate} onClick={() => { haptic(); flip(); }}>⇄ Чередовать</button>
      </div>
      {source}
    </section>
  );
}

/** «Цикл»: сколько разных недель и столбики нагрузки — нажатие меняет обычная → лёгкая → тяжёлая */
function CycleBlock({ draft, n, onLength, onLoad }) {
  const weeks = byWeek(draft, n);
  return (
    <section className="ws-blk">
      <h3 className="ws-blk__h">Цикл <span>недель</span></h3>
      <Segmented items={PROGRAM_LENGTHS.map((v) => ({ value: v, label: String(v) }))} value={n} label="Недель в программе" track onChange={(v) => { haptic(); onLength(v); }} />
      <div className="ws-bars">
        {weeks.map((g) => {
          const load = weekLoad(draft, g.week) || '';
          const label = (LOADS.find((l) => l.value === load) || LOADS[0]).label.toLowerCase();
          return (
            <button key={g.week} type="button" className={'ws-bar' + (load ? ' ws-bar--' + load : '')} aria-label={`Неделя ${g.week}: ${workouts(g.blocks.length)}, ${label}. Нажмите, чтобы сменить нагрузку`}
              onClick={() => { haptic(); onLoad(g.week, LOAD_CYCLE[(LOAD_CYCLE.indexOf(load) + 1) % LOAD_CYCLE.length]); }}>
              <i><b>{g.blocks.length}</b></i>
              <small>Н{g.week}</small>
            </button>
          );
        })}
      </div>
      <div className="ws-legend" aria-hidden="true"><span className="ws-legend--light">лёгкая</span><span>обычная</span><span className="ws-legend--heavy">тяжёлая</span></div>
    </section>
  );
}

function LockGlyph() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}

const PRESET_WEEKS = [4, 8, 12];
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

/** Плитка с датой: нажатие — календарь телефона (невидимое поле поверх) */
function DateTile({ title, value, empty, min, max, locked = false, onChange, onLocked }) {
  return (
    <label className={'ws-tile-date' + (locked ? ' is-locked' : '')} onClick={locked ? onLocked : undefined}>
      <small>{title}</small>
      <b key={value || 'none'}>{value ? ruShort(value) : empty}</b>
      {locked && <span className="ws-tile-date__lock"><LockGlyph /></span>}
      <input type="date" aria-label={title} value={value || ''} min={min || undefined} max={max || undefined} disabled={locked}
        onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  );
}

/**
 * «Сроки» (макет program-dates-mockup.html, вариант А, 14.11.2026):
 * плитки «Начало» и «Конец», длительность кнопками 4 · 8 · 12 · своё · ∞,
 * ниже квадратик на каждую неделю — прошедшие, текущая, паузы
 */
function DatesBlock({ startsOn, endsOn, onStart, onEnd, startLocked, pauses, onPauses, onPauseFrom }) {
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState(dateKey());
  const [to, setTo] = useState('');
  const [lockNote, setLockNote] = useState(false);
  const [typing, setTyping] = useState(false);
  const [own, setOwn] = useState('');
  const today = dateKey();
  const start = startsOn || today;
  const span = endsOn ? dayDiff(start, endsOn) + 1 : 0;
  const exact = span > 0 && span % 7 === 0 ? span / 7 : 0;
  const weeksTotal = endsOn ? Math.max(1, Math.ceil(span / 7)) : 0;
  const setWeeks = (w) => { haptic(); onEnd(w ? addDays(start, w * 7 - 1) : ''); };
  const custom = exact && !PRESET_WEEKS.includes(exact);
  const applyOwn = () => { const w = Math.round(Number(own)); if (w >= 1 && w <= 104) setWeeks(w); setTyping(false); };
  // Квадратики: неделя k — дни start + 7k … +6
  const elapsed = Math.floor(dayDiff(start, today) / 7);
  const shown = endsOn ? Math.min(weeksTotal, 104) : Math.max(elapsed + 4, 8);
  const pausedWeek = (k) => pauses.some((p) => { const a = addDays(start, k * 7); const b = addDays(a, 6); return p.from <= b && (!p.to || p.to >= a); });
  const hint = dayDiff(today, start) > 0
    ? `начнётся ${ruShort(start)}`
    : `идёт ${elapsed + 1}-я неделя · ` + (endsOn ? (weeksTotal - elapsed - 1 > 0 ? `ещё ${weeksTotal - elapsed - 1} нед` : 'последняя') : 'без конца');
  return (
    <section className="ws-blk">
      <h3 className="ws-blk__h">Сроки</h3>
      <div className="ws-dates">
        <DateTile title="Начало" value={startsOn} empty="—" max={endsOn} locked={startLocked} onChange={onStart} onLocked={() => { haptic(); setLockNote(true); }} />
        <DateTile title="Конец" value={endsOn} empty="без конца" min={startsOn} onChange={onEnd} />
      </div>
      <div className="ws-len" role="group" aria-label="Длительность программы">
        {PRESET_WEEKS.map((w) => (
          <button key={w} type="button" aria-pressed={exact === w} className={exact === w ? 'is-on' : ''} onClick={() => setWeeks(w)}>{w} нед</button>
        ))}
        {typing ? (
          <span className="ws-len__own is-on">
            <input type="number" inputMode="numeric" min="1" max="104" autoFocus aria-label="Своё число недель" value={own} placeholder="6"
              onChange={(e) => setOwn(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={applyOwn} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            <small>нед</small>
          </span>
        ) : (
          <button type="button" aria-pressed={!!custom} className={custom ? 'is-on' : ''} aria-label="Своё число недель" onClick={() => { haptic(); setOwn(custom ? String(exact) : ''); setTyping(true); }}>{custom ? `${exact} нед` : 'своё'}</button>
        )}
        <button type="button" aria-pressed={!endsOn} className={'ws-len__inf' + (!endsOn ? ' is-on' : '')} aria-label="Без конца" onClick={() => setWeeks(0)}>∞</button>
      </div>
      <div className={'ws-weeks' + (endsOn ? '' : ' is-open')} aria-hidden="true">
        {Array.from({ length: shown }, (_, k) => (
          <i key={k} style={{ animationDelay: Math.min(k, 20) * 20 + 'ms' }}
            className={(k < elapsed ? 'is-past' : '') + (k === elapsed ? ' is-now' : '') + (pausedWeek(k) ? ' is-pause' : '')} />
        ))}
      </div>
      <p className="ws-hint">{hint}</p>
      {/* Сервер не сдвигает начало программы, у которой уже есть версии
          (plan-weeks.js: history) — говорим об этом, а не молчим */}
      {lockNote && <p className="ws-hint">Начало закреплено: программа уже менялась. Изменения — строкой «с …» внизу.</p>}
      <div className="ws-row">
        {pauses.map((p, k) => {
          const running = !p.to && p.from < today;
          return (
            <span className="ws-chip ws-chip--pause is-on" key={p.from}>
              <PauseGlyph />{ruShort(p.from)}{p.to ? '–' + ruShort(p.to) : ' →'}
              <button type="button" aria-label={running ? 'Возобновить сегодня' : 'Убрать паузу'} onClick={() => {
                haptic();
                if (running) { onPauses(pauses.map((v, j) => (j === k ? { ...v, to: addDays(today, -1) } : v))); onPauseFrom(today); } else onPauses(pauses.filter((_, j) => j !== k));
              }}>{running ? <IconPlay size={12} /> : <IconClose size={12} />}</button>
            </span>
          );
        })}
        {!adding && <button type="button" className="ws-chip ws-chip--pause" onClick={() => { haptic(); setAdding(true); }}><PauseGlyph />Пауза</button>}
      </div>
      {adding && (
        <div className="ws-pause">
          <label><span>с</span><input type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label><span>по</span><input type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="button button--primary" disabled={!from} onClick={() => { haptic(); onPauses([...pauses, { from, to }]); onPauseFrom(from); setAdding(false); setTo(''); }}>Добавить</button>
          <button type="button" className="ws-mini" aria-label="Отмена" onClick={() => setAdding(false)}><IconClose size={14} /></button>
        </div>
      )}
    </section>
  );
}

/** «Пропуск»: красная точка на плитке показывает, что с ней будет */
export function RuleBlock({ value, onChange }) {
  return (
    <section className="ws-blk">
      <h3 className="ws-blk__h">Пропуск</h3>
      <div className="ws-tiles" role="radiogroup" aria-label="Пропущенные тренировки">
        {RULE_TILES.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={value === t.value} className={'ws-tile ws-tile--' + t.value + (value === t.value ? ' is-on' : '')} onClick={() => { haptic(); onChange(t.value); }}>
            <span className="ws-mini-week" aria-hidden="true"><b /><b className="is-miss" /><i /><b /><b /></span>
            {t.label}
          </button>
        ))}
      </div>
      <p className="ws-hint">{RULE_SHORT[value] || ''}</p>
    </section>
  );
}

export function WeeksSheet({ blocks, length, cfg, onApply, onClose, busy = false, failure = '', visibility = null }) {
  const [draft, setDraft] = useState(blocks);
  const [n, setN] = useState(length);
  const [rule, setRule] = useState(cfg && cfg.rule || 'client');
  const [startsOn, setStartsOn] = useState(cfg && cfg.startsOn || dateKey());
  const [endsOn, setEndsOn] = useState(cfg && cfg.endsOn || '');
  const [startWeek, setStartWeek] = useState('');
  const [effectiveOn, setEffectiveOn] = useState(cfg && cfg.effectiveOn > dateKey() ? cfg.effectiveOn : nextMonday());
  const [pauses, setPauses] = useState(cfg && cfg.pauses || []);
  const [days, setDays] = useState(cfg && cfg.days || []);
  // Ритм (FT-788): «всегда одно» занятие — по id его первой тренировки
  const [beat, setBeat] = useState({ rhythm: cfg && cfg.rhythm || [], rhythmDays: cfg && cfg.rhythmDays || [], one: cfg && cfg.oneSession || '' });
  const [whenOpen, setWhenOpen] = useState(false);
  const [bySchedule, setBySchedule] = useState(!!(cfg && cfg.bySchedule));
  const [solo, setSolo] = useState((cfg && cfg.solo) || []);
  const alternate = beat.rhythm.length > 1;
  const queue = sessionQueueOf(draft);
  const [loadAccepted, setLoadAccepted] = useState(false);
  const overloaded = byWeek(draft, n).some((g) => g.blocks.length > 6);
  const weekCount = Math.max(0, ...byWeek(draft, n).map((g) => sessionsOf(g.blocks).length));
  return <Sheet title="Программа" onClose={onClose} className="ws-sheet" action={visibility ? <VisibilityEye visibility={visibility} /> : null}><div className="ws">
    {queue.length > 0
      ? <WeekBlock beat={beat} setBeat={setBeat} days={days} setDays={setDays} count={weekCount}
        source={<>
          <DaySource value={bySchedule} onChange={setBySchedule} />
          {bySchedule && <SoloPicker value={solo} onChange={setSolo} sessions={queue.filter((g) => g[0].id).map((g) => ({ key: g[0].id, title: g.map((b) => b.title).join(' + ') }))} />}
        </>}
        sessions={queue.filter((g) => g[0].id).map((g) => ({ key: g[0].id, title: g.map((b) => b.title).join(' + ') }))} />
      : <section className="ws-blk"><h3 className="ws-blk__h">Дни</h3><DayDots value={days} onToggle={(d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b))} /><p className="ws-hint">{daysLine(days, 0)}</p></section>}
    <CycleBlock draft={draft} n={n} onLength={(v) => { setN(v); setDraft(withLength(draft, v)); }} onLoad={(w, load) => setDraft(withWeekLoad(draft, w, load))} />
    {overloaded && <label className="library__check"><input type="checkbox" checked={loadAccepted} onChange={(e) => setLoadAccepted(e.target.checked)} /><span>В одной неделе больше 6 тренировок. Я проверил и подтверждаю распределение.</span></label>}
    <DatesBlock startsOn={startsOn} endsOn={endsOn} onStart={setStartsOn} onEnd={setEndsOn} startLocked={!!(cfg && cfg.schedule === 1 && (cfg.history || []).length)}
      pauses={pauses} onPauses={setPauses} onPauseFrom={setEffectiveOn} />
    <RuleBlock value={rule} onChange={setRule} />
    {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
    <div className="ws-foot">
      <button type="button" className="ws-chip ws-when" aria-expanded={whenOpen} onClick={() => { haptic(); setWhenOpen(!whenOpen); }}>
        с {ruShort(effectiveOn)} · {startWeek ? `с недели ${startWeek}` : 'по порядку'} <span aria-hidden="true">▾</span>
      </button>
      {whenOpen && (
        <div className="ws-when__panel">
          <label className="field"><span className="field__label">Применить изменения с</span><input className="field__input" type="date" min={dateKey()} value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} /></label>
          <Segmented items={[{ value: '', label: 'По порядку' }, ...Array.from({ length: n }, (_, k) => ({ value: String(k + 1), label: 'Н' + (k + 1) }))]} value={startWeek} label="С какой недели продолжить" onChange={(v) => { haptic(); setStartWeek(v); }} />
        </div>
      )}
      <button className="button button--primary button--block" disabled={busy || !startsOn || !effectiveOn || (overloaded && !loadAccepted)} onClick={() => onApply({ blocks: draft, effectiveOn, weeks: { schedule: 1, startsOn, endsOn, length: n, rule, pauses, days: alternate ? [] : days, bySchedule: bySchedule ? 1 : 0, solo: solo.filter((id) => queue.some((g) => g[0].id === id)),
        rhythm: beat.rhythm, rhythmDays: alternate ? beat.rhythmDays.slice(0, beat.rhythm.length).map((d) => d || []) : [], oneSession: alternate ? beat.one || '' : '',
        ...(startWeek ? { startWeek: Number(startWeek) } : {}) } })}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
    </div>
  </div></Sheet>;
}
