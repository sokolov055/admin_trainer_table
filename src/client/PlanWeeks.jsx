import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dateKey, nextMonday, programSize, addDays, WEEKDAY_SHORT, sessionsOf, sessionQueue as sessionQueueOf, MAX_RHYTHM } from '../program-timeline.js';
import { apiMutate } from '../api.js';
import { Segmented, Sheet, Note } from '../ui.jsx';
import { IconAlert, IconCheck, IconLink } from '../icons.jsx';
import { haptic } from '../telegram.js';
import {
  weekDates, weekLoad, LOAD_LABEL, PROGRAM_LENGTHS, programLength, weekOf, withLength, withWeekLoad, startWeekOf,
  byWeek, lengthHint, monthWeeks, parseMonth, monthLabelOf,
} from '../plan-weeks.js';
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
export function WeekStrip({ plan, sel, onSelect }) {
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
              aria-label={`${weekDates(x)}: ${STATUS[x.status]}`}
              className={'plan-weeks__week' + (x.beyond ? ' is-short' : '') + (x.current ? ' is-now' : '')}
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
  const groups = sessionRows(week.rows);
  const name = (g) => g.map((r) => r.block.title + (r.left === 0 ? ' ✓' : '')).join(' + ');
  const planned = groups.filter((g) => g[0].day);
  const free = groups.filter((g) => !g[0].day);
  const now = week.current && planned.find((g) => g[0].date === today && g.some((r) => r.left > 0));
  return (
    <p className="wk-today">
      {now ? <><b>Сегодня по плану: {now.map((r) => r.block.title).join(' + ')}</b><br /></> : null}
      {planned.map((g) => `${WEEKDAY_SHORT[g[0].day]} — ${name(g)}`).join(' · ')}
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

export function WeeksSheet({ blocks, length, cfg, onApply, onClose, busy = false, failure = '' }) {
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
  const alternate = beat.rhythm.length > 1;
  const queue = sessionQueueOf(draft);
  const [pauseFrom, setPauseFrom] = useState(dateKey());
  const [pauseTo, setPauseTo] = useState('');
  const [loadAccepted, setLoadAccepted] = useState(false);
  const overloaded = byWeek(draft, n).some((g) => g.blocks.length > 6);
  return <Sheet title="Настроить программу" onClose={onClose}><div className="wk-rows">
    <div className="wk-rows__item"><strong>Недель в программе</strong><LengthPicker value={n} onChange={(v) => { setN(v); setDraft(withLength(draft, v)); }} list={false} count={draft.length} />
      <span>Предпросмотр ниже покажет результат перераспределения. Пустая неделя сохранится как отдых.</span></div>
    <WeekPreview rows={byWeek(draft, n).map((g) => ({ key: g.week, label: `Неделя ${g.week}`, titles: g.blocks.map((b) => b.title) }))} />
    {byWeek(draft, n).map((g) => <div className="wk-rows__pill" key={g.week}><span>Неделя {g.week}<small>{workouts(g.blocks.length)}</small></span><Segmented items={LOADS} value={weekLoad(draft, g.week)} label={`Нагрузка недели ${g.week}`} onChange={(load) => setDraft(withWeekLoad(draft, g.week, load))} /></div>)}
    <ProgramDates startsOn={startsOn} endsOn={endsOn} onStart={setStartsOn} onEnd={setEndsOn} disabled={cfg && cfg.schedule === 1} />
    {queue.length > 0 && <RhythmPicker value={beat} onChange={setBeat} seedDays={days} count={sessionsOf(draft.filter((b) => weekOf(b) === 1)).length}
      sessions={queue.filter((g) => g[0].id).map((g) => ({ key: g[0].id, title: g.map((b) => b.title).join(' + ') }))} />}
    {!alternate && <div className="wk-rows__item"><strong>Дни занятий</strong><DayPicker value={days} onChange={setDays} /><span>Занятия недели встают на эти дни по порядку. Можно не указывать.</span></div>}
    <label className="field"><span className="field__label">Применить изменения с</span><input className="field__input" type="date" min={dateKey()} value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} /></label>
    <span>По умолчанию — следующий понедельник. Прошлые недели и проведённые занятия сохранятся.</span>
    <label className="field"><span className="field__label">Неделя продолжения</span><select className="field__input" value={startWeek} onChange={(e) => setStartWeek(e.target.value)}><option value="">Продолжить по порядку</option>{Array.from({ length: n }, (_, i) => <option key={i} value={i + 1}>Начать с недели {i + 1}</option>)}</select></label>
    <div className="wk-rows__item"><strong>Пропущенные тренировки</strong><Segmented items={RULES} value={rule} label="Пропущенные тренировки" onChange={setRule} /><span>{RULE_HINT[rule]}</span></div>
    <div className="wk-rows__item"><strong>Паузы программы</strong><span>Дни паузы не считаются пропусками. Полная неделя паузы не сдвигает программу. Причину указывать не нужно.</span>
      {pauses.map((p, i) => <div className="wk__row" key={p.from}><span>{p.from} — {p.to || 'до возобновления'}</span><button className="button" onClick={() => { if (!p.to && p.from < dateKey()) { setPauses(pauses.map((v, j) => i === j ? { ...v, to: addDays(dateKey(), -1) } : v)); setEffectiveOn(dateKey()); } else setPauses(pauses.filter((_, j) => j !== i)); }}>{p.to ? 'Убрать' : 'Возобновить сегодня'}</button></div>)}
      <label className="field"><span className="field__label">Начало паузы</span><input className="field__input" type="date" min={dateKey()} value={pauseFrom} onChange={(e) => setPauseFrom(e.target.value)} /></label>
      <label className="field"><span className="field__label">Конец паузы, если известен</span><input className="field__input" type="date" min={pauseFrom} value={pauseTo} onChange={(e) => setPauseTo(e.target.value)} /></label>
      <button className="button" onClick={() => { setPauses([...pauses, { from: pauseFrom, to: pauseTo }]); setEffectiveOn(pauseFrom); }}>Добавить паузу</button>
    </div>
    {overloaded && <label className="library__check"><input type="checkbox" checked={loadAccepted} onChange={(e) => setLoadAccepted(e.target.checked)} /><span>В одной неделе больше 6 тренировок. Я проверил и подтверждаю распределение.</span></label>}
    {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
    <button className="button button--primary button--block" disabled={busy || !startsOn || !effectiveOn || (overloaded && !loadAccepted)} onClick={() => onApply({ blocks: draft, effectiveOn, weeks: { schedule: 1, startsOn, endsOn, length: n, rule, pauses, days: alternate ? [] : days,
      rhythm: beat.rhythm, rhythmDays: alternate ? beat.rhythmDays.slice(0, beat.rhythm.length).map((d) => d || []) : [], oneSession: alternate ? beat.one || '' : '',
      ...(startWeek ? { startWeek: Number(startWeek) } : {}) } })}>{busy ? 'Сохраняю…' : 'Сохранить программу'}</button>
  </div></Sheet>;
}
