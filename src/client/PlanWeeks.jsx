import React, { useState } from 'react';
import { apiMutate } from '../api.js';
import { Switch, Segmented, Sheet, Note } from '../ui.jsx';
import { IconAlert } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { monthWeeks, weekDates, KIND_LABEL } from '../plan-weeks.js';
import './plan-weeks.css';

/**
 * Программа недельными циклами (IDEA-7, 27.10.2026) — экранная часть:
 * полоска недель месяца над очередью, лист «доделать или пропустить» в
 * начале недели и настройка недель у тренера. Правила — plan-weeks.js.
 */

const plural = (n, one, few, many) => {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
};

/** Недели месяца и сводка выбранной: «Неделя 3 из 6 · Тяжёлая · сделано 2 из 4» */
export function WeekStrip({ plan, sel, onSelect }) {
  const w = plan.weeks[sel];
  const kind = w.short ? 'Короткая' : KIND_LABEL[w.kind];
  const summary = w.short
    ? 'Короткая неделя: потренироваться можно, но ничего не обязательно'
    : `Сделано ${w.done} из ${w.required}`
      + (w.rows.some((r) => r.carried) ? ' · с долгом прошлой недели' : '')
      + (w.missed ? ' · не выполнено: ' + w.missed : '')
      + (w.kind === 'light' ? ` · веса ниже на ${plan.cfg.lightPct} %` : '');
  return (
    <div className="plan-weeks">
      <div className="plan-weeks__strip" role="tablist" aria-label="Недели месяца">
        {plan.weeks.map((x, i) => (
          <button
            key={x.n}
            type="button"
            role="tab"
            aria-selected={i === sel}
            className={'plan-weeks__week' + (x.short ? ' is-short' : '') + (x.current ? ' is-now' : '')}
            onClick={() => { onSelect(i); haptic(); }}
          >
            <strong>{x.n}</strong>
            <span>{x.from === x.to ? x.from : x.from + '–' + x.to}</span>
            <i className={'plan-weeks__dot' + (x.missed ? ' is-missed' : x.ended && !x.short && x.required ? ' is-done' : '')} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="plan-weeks__card">
        <div className="plan-weeks__head">
          <div>
            <strong>Неделя {w.n} из {plan.weeks.length}</strong>
            <span>{weekDates(w)}{w.current ? ' · сейчас' : ''}</span>
          </div>
          <span className={'plan-weeks__kind plan-weeks__kind--' + (w.short ? 'short' : w.kind)}>{kind}</span>
        </div>
        {!w.short && (
          <div className="plan-weeks__bar" aria-hidden="true">
            <span style={{ width: (w.required ? Math.min(100, Math.round(w.done / w.required * 100)) : 0) + '%' }} />
          </div>
        )}
        <p className="plan-weeks__summary">{summary}</p>
      </div>
    </div>
  );
}

/** Неделя закончилась с пропусками, тренер оставил выбор клиенту */
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
    <Sheet title={`Неделя ${w.n} закончилась`} onClose={onClose}>
      <div className="plan-weeks__choice">
        <p className="plan-weeks__lead">
          {one ? 'Одна тренировка не выполнена' : `${rows.length} ${plural(rows.length, 'тренировка', 'тренировки', 'тренировок')} не выполнено`} · {weekDates(w)}
        </p>
        <ul className="plan-weeks__missed">
          {rows.map((r) => <li key={r.block.id}>{r.block.title}</li>)}
        </ul>
        <button type="button" className="button button--primary button--block plan-weeks__option" disabled={!!busy} onClick={() => choose('redo')}>
          <strong>{busy === 'redo' ? 'Сохраняю…' : 'Доделать на этой неделе'}</strong>
          <span>{one ? 'Встанет первой в очередь' : 'Встанут первыми в очередь'} — неделя станет длиннее</span>
        </button>
        <button type="button" className="button button--block plan-weeks__option" disabled={!!busy} onClick={() => choose('skip')}>
          <strong>{busy === 'skip' ? 'Сохраняю…' : 'Пропустить, идти дальше'}</strong>
          <span>Останется «не выполнена», неделя — по программе</span>
        </button>
        <p className="small muted plan-weeks__hint">Тренер увидит ваш выбор</p>
        {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
      </div>
    </Sheet>
  );
}

const KIND_ORDER = ['normal', 'heavy', 'light'];
const RULES = [
  { value: 'client', label: 'Клиент' },
  { value: 'redo', label: 'Доделывать' },
  { value: 'skip', label: 'Пропускать' },
];
const RULE_HINT = {
  client: 'Клиент сам выбирает: доделать пропущенную на следующей неделе или пропустить.',
  redo: 'Пропущенная сама встаёт первой в следующую неделю, клиент не выбирает.',
  skip: 'Пропущенная остаётся «не выполнена», неделя идёт по программе.',
};

/** Тренер: делить месяц на недели, тип каждой недели, правило для пропусков */
export function WeeksSettings({ clientRow, month, weeks, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  // Включённые недели — одной строкой: настройка редкая, а под ней программа
  const [open, setOpen] = useState(false);
  const list = monthWeeks(month);
  if (!list) return null;
  const cfg = weeks || { on: false, kinds: [], lightPct: 20, rule: 'client' };
  const save = async (next) => {
    setBusy(true);
    setFailure('');
    try {
      const res = await apiMutate('plan.weeks.save', { clientRow, month, weeks: next });
      onSaved(res.weeks);
      if (next.on && !weeks) setOpen(true);
    } catch (error) {
      setFailure(error.message || 'Не сохранилось');
    } finally {
      setBusy(false);
    }
  };
  const patch = (change) => save({ on: true, kinds: cfg.kinds, lightPct: cfg.lightPct, rule: cfg.rule, ...change });
  return (
    <div className="plan-weeks__settings">
      <Switch checked={!!weeks} disabled={busy} onChange={(on) => save(on ? { on: true, kinds: cfg.kinds, lightPct: cfg.lightPct, rule: cfg.rule } : { on: false })}>
        Делить месяц на недели
        <span className="plan-weeks__settings-note">Тренировки месяца повторяются каждую неделю</span>
      </Switch>
      {weeks && !open && (
        <button type="button" className="plan-weeks__fold" onClick={() => { setOpen(true); haptic(); }}>
          <span>
            {list.length} {plural(list.length, 'неделя', 'недели', 'недель')}
            {list.some((w, i) => !w.short && weeks.kinds[i] && weeks.kinds[i] !== 'normal')
              ? ' · ' + list.map((w, i) => (!w.short && weeks.kinds[i] && weeks.kinds[i] !== 'normal' ? `${w.n} — ${KIND_LABEL[weeks.kinds[i]].toLowerCase()}` : '')).filter(Boolean).join(', ')
              : ' · все обычные'}
            {' · пропуски: ' + { client: 'решает клиент', redo: 'доделывать', skip: 'пропускать' }[weeks.rule]}
          </span>
          <strong>Настроить</strong>
        </button>
      )}
      {weeks && open && (
        <>
          <div className="plan-weeks__kinds">
            {list.map((w, i) => {
              const k = weeks.kinds[i] || 'normal';
              return (
                <div className="plan-weeks__kind-row" key={w.n}>
                  <span>
                    <strong>Неделя {w.n}</strong>
                    <span>{weekDates(w)}{w.short ? ' · короткая' : ''}</span>
                  </span>
                  {w.short
                    ? <span className="plan-weeks__kind plan-weeks__kind--short">Без отметок</span>
                    : (
                      <button
                        type="button"
                        className={'plan-weeks__kind plan-weeks__kind--' + k}
                        disabled={busy}
                        aria-label={`Неделя ${w.n}: ${KIND_LABEL[k]}. Сменить`}
                        onClick={() => {
                          const kinds = list.map((_, j) => weeks.kinds[j] || 'normal');
                          kinds[i] = KIND_ORDER[(KIND_ORDER.indexOf(k) + 1) % KIND_ORDER.length];
                          haptic();
                          patch({ kinds });
                        }}
                      >
                        {KIND_LABEL[k]}{k === 'light' ? ` · −${weeks.lightPct} %` : ''}
                      </button>
                    )}
                </div>
              );
            })}
          </div>
          {weeks.kinds.includes('light') && (
            <label className="plan-weeks__pct">
              <span>Лёгкая неделя: веса ниже на</span>
              <select className="field__input" value={weeks.lightPct} disabled={busy} onChange={(e) => patch({ lightPct: Number(e.target.value) })}>
                {[10, 15, 20, 25, 30, 40].map((p) => <option key={p} value={p}>{p} %</option>)}
              </select>
            </label>
          )}
          <div className="plan-weeks__rule">
            <strong>Пропущенные тренировки</strong>
            <Segmented items={RULES} value={weeks.rule} label="Пропущенные тренировки" disabled={busy} onChange={(rule) => patch({ rule })} />
            <span className="small muted">{RULE_HINT[weeks.rule]}</span>
          </div>
          <button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Свернуть</button>
        </>
      )}
      {failure && <Note tone="critical" icon={IconAlert}>{failure}</Note>}
    </div>
  );
}
