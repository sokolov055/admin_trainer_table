import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { Segmented, Sheet, Note } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { weekDates, weekLoad, LOAD_LABEL, PROGRAM_LENGTHS, programLength, weekOf, withLength } from '../plan-weeks.js';
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

/** Циклы месяца с оценками и сводка выбранного */
export function WeekStrip({ plan, sel, onSelect }) {
  const w = plan.weeks[sel];
  const { score } = plan;
  const summary = w.status === 'empty'
    ? 'В этой неделе программы нет тренировок'
    : (w.full ? `Сделано ${w.done} из ${w.need}` : `Короткий цикл: обязательно ${w.done} из ${w.need}, остальное — по желанию`)
      + (w.rows.some((r) => r.carried) ? ' · с долгом прошлого цикла' : '')
      + (w.missed ? ' · не выполнено: ' + w.missed : '');
  const month = score.allDone && score.graded === score.total
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
            className={'plan-weeks__week' + (!x.full ? ' is-short' : '') + (x.current ? ' is-now' : '')}
            onClick={() => { onSelect(i); haptic(); }}
          >
            <strong>{x.n}</strong>
            <span>{x.from === x.to ? x.from : x.from + '–' + x.to}</span>
            <i className={'plan-weeks__dot is-' + x.status} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="plan-weeks__card">
        <div className="plan-weeks__head">
          <div>
            <strong>Цикл {w.n} из {plan.weeks.length}</strong>
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

/** Цикл закончился с пропусками, тренер оставил выбор клиенту */
export function WeekChoice({ plan, month, clientRow, onChosen, onClose }) {
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState('');
  const w = plan.pendingWeek;
  const rows = plan.pending;
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

const LENGTHS = [{ value: 0, label: 'Месяц' }, ...PROGRAM_LENGTHS.map((n) => ({ value: n, label: String(n) }))];
const LOADS = [{ value: '', label: 'Обычная' }, { value: 'light', label: 'Лёгкая' }, { value: 'heavy', label: 'Тяжёлая' }];
const RULES = [
  { value: 'client', label: 'Клиент' },
  { value: 'redo', label: 'Доделывать' },
  { value: 'skip', label: 'Пропускать' },
];
const RULE_HINT = {
  client: 'Клиент сам выбирает: доделать пропущенную в следующем цикле или пропустить.',
  redo: 'Пропущенная сама встаёт первой в следующий цикл, клиент не выбирает.',
  skip: 'Пропущенная остаётся «не выполнена», цикл идёт по программе.',
};

/**
 * Тренер: на сколько недель программа, пометка каждой недели, правило о
 * пропущенных. Недели и пометки — у тренировок (onBlocks сохраняет
 * программу, как любая её правка), правило — у месяца
 */
export function WeeksSettings({ clientRow, month, blocks, weeks, onBlocks, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const length = programLength(blocks);
  const rule = (weeks && weeks.rule) || 'client';
  const saveRule = async (next) => {
    setBusy(true);
    setFailure('');
    try {
      const res = await apiMutate('plan.weeks.save', { clientRow, month, weeks: { rule: next } });
      onSaved(res.weeks);
    } catch (error) {
      setFailure(error.message || 'Не сохранилось');
    } finally {
      setBusy(false);
    }
  };
  const setLoad = (week, load) => {
    haptic();
    onBlocks(blocks.map((b) => {
      if (weekOf(b) !== week) return b;
      const { load: _drop, ...rest } = b;
      return load ? { ...rest, load } : rest;
    }));
  };
  const head = length
    ? `Программа на ${length} ${plural(length, 'неделю', 'недели', 'недель')} · повторяется до конца месяца`
    : 'Программа на месяц · без циклов';
  return (
    <div className="plan-weeks__settings">
      <button type="button" className="plan-weeks__fold" aria-expanded={open} onClick={() => { setOpen(!open); haptic(); }}>
        <span><strong>Недели и циклы</strong>{head}</span>
        <strong>{open ? 'Свернуть' : 'Настроить'}</strong>
      </button>
      {open && (
        <>
          <div className="plan-weeks__rule">
            <span className="small muted">На сколько недель программа: на месяц или 1–4 недели по кругу</span>
            <Segmented items={LENGTHS} value={length} label="На сколько недель программа" onChange={(n) => { haptic(); onBlocks(withLength(blocks, n)); }} />
            <span className="small muted">
              {length
                ? 'У каждой тренировки — своя неделя (в её заголовке). Месяц делится на циклы по календарю, программа идёт по кругу; за каждый цикл клиенту — оценка.'
                : 'Все тренировки — одна очередь на месяц, как раньше.'}
            </span>
          </div>
          {length > 0 && (
            <div className="plan-weeks__kinds">
              {Array.from({ length }, (_, i) => i + 1).map((week) => {
                const count = blocks.filter((b) => weekOf(b) === week).length;
                return (
                  <div className="plan-weeks__kind-row" key={week}>
                    <span>
                      <strong>Неделя {week}</strong>
                      <span>{count ? workouts(count) : 'пока пусто'}</span>
                    </span>
                    <Segmented items={LOADS} value={weekLoad(blocks, week)} label={`Неделя ${week}`} disabled={!count} onChange={(load) => setLoad(week, load)} />
                  </div>
                );
              })}
            </div>
          )}
          {length > 0 && (
            <div className="plan-weeks__rule">
              <strong>Пропущенные тренировки</strong>
              <Segmented items={RULES} value={rule} label="Пропущенные тренировки" disabled={busy} onChange={saveRule} />
              <span className="small muted">{RULE_HINT[rule]}</span>
            </div>
          )}
        </>
      )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
    </div>
  );
}

/** Тренер: неделя и пометка одной тренировки — в её заголовке */
export function BlockWeek({ block, length, onChange }) {
  return (
    <div className="plan-weeks__block">
      <label>
        <span>Неделя</span>
        <select className="field__input" value={weekOf(block)} onChange={(e) => { haptic(); onChange({ ...block, week: Number(e.target.value) }); }}>
          {Array.from({ length }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>
        <span>Нагрузка</span>
        <select
          className="field__input"
          value={block.load || ''}
          onChange={(e) => {
            haptic();
            const { load: _drop, ...rest } = block;
            onChange(e.target.value ? { ...rest, load: e.target.value } : rest);
          }}
        >
          {LOADS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
    </div>
  );
}

/**
 * Шаблон программы (trainer/PlanEditor.jsx): на сколько недель — тем же
 * переключателем, что в программе клиента; неделя тренировки — BlockWeek
 */
export function ProgramLength({ blocks, onChange }) {
  const length = programLength(blocks);
  return (
    <div className="plan-weeks__rule plan-weeks__template">
      <span className="small muted">На сколько недель программа: на месяц или 1–4 недели — у клиента она повторится по кругу до конца месяца</span>
      <Segmented items={LENGTHS} value={length} label="На сколько недель программа" onChange={(n) => { haptic(); onChange(withLength(blocks, n)); }} />
    </div>
  );
}
