import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { Segmented, Sheet, Note } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';
import { haptic } from '../telegram.js';
import {
  weekDates, weekLoad, LOAD_LABEL, PROGRAM_LENGTHS, programLength, weekOf, withLength, startWeekOf,
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
const STATUS = { done: 'выполнен', missed: 'не выполнен', open: 'идёт', empty: 'без тренировок' };

/** «декабря» из «Декабрь 2026» — для «программа декабря не назначена» */
function monthGen(label) {
  const names = { Январь: 'январь', Февраль: 'февраль', Март: 'март', Апрель: 'апрель', Май: 'май', Июнь: 'июнь',
    Июль: 'июль', Август: 'август', Сентябрь: 'сентябрь', Октябрь: 'октябрь', Ноябрь: 'ноябрь', Декабрь: 'декабрь' };
  const name = String(label || '').split(' ')[0];
  const gen = { январь: 'января', февраль: 'февраля', март: 'марта', апрель: 'апреля', май: 'мая', июнь: 'июня',
    июль: 'июля', август: 'августа', сентябрь: 'сентября', октябрь: 'октября', ноябрь: 'ноября', декабрь: 'декабря' };
  return gen[names[name]] || label;
}

/** Циклы месяца с оценками и сводка выбранного */
export function WeekStrip({ plan, sel, onSelect }) {
  const w = plan.weeks[sel];
  const { score } = plan;
  const summary = w.status === 'empty'
    ? 'В этой неделе программы нет тренировок'
    : `Сделано ${w.done} из ${w.need}`
      + (w.rows.some((r) => r.carried && r.block.foreign) ? ' · с долгом прошлого месяца'
        : w.rows.some((r) => r.carried) ? ' · с долгом прошлого цикла' : '')
      + (w.extra ? ' · по прошлой программе: ' + w.extra : '')
      + (w.missed ? ' · не выполнено: ' + w.missed : '');
  const month = w.beyond
    ? `Программа ${monthGen(w.beyond)} не назначена — пока идёт эта, по кругу`
    : score.allDone && score.graded === score.total
      ? 'Все циклы месяца выполнены — молодец!'
      : score.graded
        ? `Месяц: выполнено ${score.done} из ${score.graded} ${plural(score.graded, 'прошедшего цикла', 'прошедших циклов', 'прошедших циклов')}`
        : '';
  return (
    <div className="plan-weeks">
      <div className="plan-weeks__strip" role="tablist" aria-label="Циклы месяца">
        {plan.weeks.map((x, i) => (
          <button
            key={x.n}
            type="button"
            role="tab"
            aria-selected={i === sel}
            aria-label={`Цикл ${x.n}, ${weekDates(x)}: ${STATUS[x.status]}`}
            className={'plan-weeks__week' + (x.beyond ? ' is-short' : '') + (x.current ? ' is-now' : '')}
            onClick={() => { onSelect(i); haptic(); }}
          >
            <strong>{x.n}</strong>
            <span>{x.from + '–' + x.to}</span>
            <i className={'plan-weeks__dot is-' + x.status} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="plan-weeks__card">
        <div className="plan-weeks__head">
          <div>
            <strong>Цикл {w.n}{w.beyond ? '' : ' из ' + plan.own}</strong>
            <span>{weekDates(w)}{w.current ? ' · сейчас' : ''}{plan.length > 1 ? ' · неделя ' + w.week + ' программы' : ''}</span>
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
        const res = await apiMutate('plan.week.choose', { ...(clientRow ? { clientRow } : {}), month, week: w.n, blockId: r.block.id, choice });
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
    <Sheet title={`Цикл ${w.n} закончился`} onClose={onClose}>
      <div className="plan-weeks__choice">
        <p className="plan-weeks__lead">
          {one ? 'Одна тренировка не выполнена' : `${workouts(rows.length)} не выполнено`} · {weekDates(w)}
          {month !== shownMonth ? ` · программа «${month}»` : ''}
        </p>
        <ul className="plan-weeks__missed">
          {rows.map((r) => <li key={r.block.id}>{r.block.title}</li>)}
        </ul>
        <button type="button" className="button button--primary button--block plan-weeks__option" disabled={!!busy} onClick={() => choose('redo')}>
          <strong>{busy === 'redo' ? 'Сохраняю…' : 'Доделать в этом цикле'}</strong>
          <span>{one ? 'Встанет первой в очередь' : 'Встанут первыми в очередь'} — цикл станет длиннее</span>
        </button>
        <button type="button" className="button button--block plan-weeks__option" disabled={!!busy} onClick={() => choose('skip')}>
          <strong>{busy === 'skip' ? 'Сохраняю…' : 'Пропустить, идти дальше'}</strong>
          <span>Останется «не выполнена», цикл — по программе</span>
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
export function WeekSections({ blocks, length, canEdit = false, current = 0, renderBlock, onLoad, onAdd, addSlot, onCopyWeek, disabled = false }) {
  const groups = byWeek(blocks, length);
  const filled = groups.filter((g) => g.blocks.length);
  return (
    <>
      {groups.map((g) => (
        <section className="wk" key={g.week} aria-label={`Неделя ${g.week}`}>
          <div className="wk__head">
            <h3>Неделя {g.week}</h3>
            <span className="wk__count">{g.blocks.length ? workouts(g.blocks.length) : 'пока пусто'}{current === g.week ? ' · сейчас' : ''}</span>
            <span className="wk__spacer" />
            {canEdit
              ? <WeekLoadPick week={g.week} value={weekLoad(blocks, g.week)} disabled={disabled || !g.blocks.length} onChange={(load) => onLoad(g.week, load)} />
              : weekLoad(blocks, g.week) && <span className={'wk__load wk__load--' + weekLoad(blocks, g.week)}>{LOAD_LABEL[weekLoad(blocks, g.week)]}</span>}
          </div>
          {g.blocks.map((b) => renderBlock(b, g.week))}
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
      ))}
    </>
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
  const length = programLength(blocks);
  const count = blocks.length;
  const cur = plan && plan.currentIndex >= 0 ? plan.weeks[plan.currentIndex] : null;
  // Следующий месяц без программы — с четверга перед его понедельником (как напоминание в «Клиентах»)
  const next = nextMonthOf(month);
  const nextCycles = next && length && months[0] === month && !months.includes(next) ? monthWeeks(next) : null;
  const soon = nextCycles && (new Date(nextCycles[0].start + 'T00:00:00').getTime() - today.getTime()) <= 4 * 24 * 60 * 60 * 1000;
  const nextWeek = length ? ((startWeekOf(cfg, length) - 1 + (monthWeeks(month) || []).length) % length) + 1 : 0;
  const rule = (cfg && cfg.rule) || 'client';
  return (
    <div className="wk-status" data-reveal="">
      <div className="wk-status__top">
        <strong>
          {monthWord(month)}: {length ? (length === 1 ? 'одна неделя по кругу' : `${length} недели по кругу`) : `${workouts(count)} списком`}
        </strong>
        {length > 0 && <button type="button" className="wk-status__link" onClick={() => { haptic(); onSettings(); }}>Настроить</button>}
      </div>
      {length
        ? (
          <p>
            {cur ? `Сейчас цикл ${cur.n} (${shortDates(cur)}) = неделя ${cur.week} программы. ` : ''}
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
export function SpreadSheet({ month, blocks, cfg, onApply, onClose, busy = false, today = new Date() }) {
  const [n, setN] = useState(blocks.length >= 2 && blocks.length <= 4 ? 1 : Math.min(4, Math.max(2, blocks.length)));
  const [rule, setRule] = useState((cfg && cfg.rule) || 'client');
  const cycles = monthWeeks(month) || [];
  const laid = withLength(blocks, n);
  const now = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const curIndex = cycles.findIndex((c) => now >= c.start && now <= c.end);
  // Текущий цикл — неделя 1: startWeek такой, чтобы цикл curIndex + 1 получил неделю 1
  const startWeek = curIndex > 0 ? ((n - (curIndex % n)) % n) + 1 : 1;
  const cur = curIndex >= 0 ? cycles[curIndex] : null;
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
          <span>
            {cur ? `Сейчас идёт цикл ${shortDates(cur)} — он станет неделей 1. ` : 'Первый цикл месяца — неделя 1. '}
            Проведённые тренировки остаются выполненными.
          </span>
        </div>
        <div className="wk-rows__item">
          <strong>Пропущенные тренировки</strong>
          <Segmented items={RULES} value={rule} label="Пропущенные тренировки" track onChange={(v) => { haptic(); setRule(v); }} />
          <span>{RULE_HINT[rule]}</span>
        </div>
        <button type="button" className="button button--primary button--block" disabled={busy} onClick={() => onApply({ blocks: laid, rule, startWeek })}>
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
export function WeeksSheet({ month, blocks, length, cfg, onLength, onLoad, onMonth, onClose, busy = false, failure = '' }) {
  const cycles = monthWeeks(month) || [];
  const startWeek = startWeekOf(cfg, length);
  const rule = (cfg && cfg.rule) || 'client';
  const next = nextMonthOf(month);
  const nextWeek = ((startWeek - 1 + cycles.length) % length) + 1;
  return (
    <Sheet title={`Недели: ${month}`} onClose={onClose}>
      <div className="wk-rows">
        <div className="wk-rows__item">
          <strong>Недель в программе</strong>
          <LengthPicker
            value={length}
            onChange={onLength}
            cycles={cycles.length}
            count={blocks.length}
            hint="Меньше — лишние недели сольются в первые; больше — новые недели пустые, тренировки не двигаются. «Список» — снять недели."
          />
        </div>
        <div className="wk-rows__item">
          <strong>Нагрузка недель</strong>
          {byWeek(blocks, length).map((g) => (
            <div className="wk-rows__pill" key={g.week}>
              <span>Неделя {g.week}<small>{g.blocks.length ? workouts(g.blocks.length) : 'пока пусто'}</small></span>
              <Segmented items={LOADS} value={weekLoad(blocks, g.week)} label={`Нагрузка недели ${g.week}`} track disabled={!g.blocks.length} onChange={(load) => { haptic(); onLoad(g.week, load); }} />
            </div>
          ))}
          <span>Только подпись в заголовке — упражнения и веса не меняются. Лёгкая тренировка не становится «было» для обычных.</span>
        </div>
        {length > 1 && (
          <div className="wk-rows__item">
            <strong>{monthWord(month)} начался с недели</strong>
            <Segmented items={Array.from({ length }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} value={startWeek} label="Начался с недели" track disabled={busy} onChange={(n) => { haptic(); onMonth({ startWeek: n }); }} />
            <span>
              {cycles.length ? `Цикл 1 (${shortDates(cycles[0])}) — неделя ${startWeek}, дальше по кругу. ` : ''}
              {next ? `${monthWord(next)} продолжит с недели ${nextWeek} — подставится само.` : ''}
            </span>
          </div>
        )}
        <div className="wk-rows__item">
          <strong>Пропущенные тренировки</strong>
          <Segmented items={RULES} value={rule} label="Пропущенные тренировки" track disabled={busy} onChange={(v) => { haptic(); onMonth({ rule: v }); }} />
          <span>{RULE_HINT[rule]}</span>
        </div>
        {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
        <button type="button" className="button button--primary button--block" onClick={onClose}>Готово</button>
      </div>
    </Sheet>
  );
}
