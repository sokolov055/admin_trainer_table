import React, { useRef, useState } from 'react';
import { apiMutate } from '../api.js';
import { Sheet, Note, Qty, formatNumber } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { queueWrite, isOffline } from '../offline-writes.js';
import { PALM, PALM_GROUPS, palmNorm, palmCount, palmUnit, palmSnapshot } from './palm-model.js';
import { DIARY_MEALS, dayLabel, requestId, today } from './diary-model.js';
import './palm.css';

/**
 * Режим «Ладонь» (план трёх разборов, п. 8 — главная находка, из ONLYFITS):
 * клиент тренера, который никогда не считал калории, начинает вести питание
 * за 3–5 касаний — порции рукой вместо граммов. Тренер видит порции в том же
 * дневнике. Режим выбирается ответом про опыт, а не термином.
 */

// Свои простые пиктограммы руки — чужие рисунки не копируем
export function HandIcon({ kind, size = 28, filled = false }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true, focusable: 'false', fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round', strokeLinecap: 'round' };
  if (kind === 'protein') return <svg {...common}><path d="M9 29h12a5 5 0 0 0 5-5V13a2 2 0 0 0-4 0v5M22 13V7a2 2 0 0 0-4 0v10M18 7V5a2 2 0 0 0-4 0v12M14 7a2 2 0 0 0-4 0v12l-2.2-2.6a2 2 0 0 0-3.1 2.5L9 29" /></svg>;
  if (kind === 'carbs') return <svg {...common}><path d="M4 15h24a12 12 0 0 1-24 0Z" /><path d="M10 15c.5-2 1.6-3 3-3M16 15c.3-2.6 1.5-4 3-4.4" fill="none" /></svg>;
  if (kind === 'fat') return <svg {...common}><path d="M12 29V9a4 4 0 0 1 8 0v20Z" /><path d="M14 10h4" fill="none" /></svg>;
  return <svg {...common}><path d="M7 14a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7Z" /><path d="M11 11v4M15 11v4M19 11v4" fill="none" /></svg>;
}

const SCALE = { palm: { difficulty: 'низкая', accuracy: 'примерная' }, count: { difficulty: 'выше', accuracy: 'точная' } };
const ANSWERS = [
  { id: 'never', title: 'Никогда не считал(а)', note: 'Отмечать порции ладонью, без весов и цифр', mode: 'palm' },
  { id: 'simpler', title: 'Считал(а), но хочу проще', note: 'Ладонь каждый день, граммы — когда захочется', mode: 'palm' },
  { id: 'exact', title: 'Считаю калории и хочу точности', note: 'Продукты, граммы, сканер этикеток', mode: 'count' },
];

/** «Как вы считаете еду?» — один вопрос про опыт, ответ выбирает режим. */
export function Approach({ current = null, busy = false, onChoose, onCancel }) {
  const [answer, setAnswer] = useState(current === 'count' ? 'exact' : current === 'palm' ? 'never' : '');
  const chosen = ANSWERS.find((a) => a.id === answer);
  const mode = chosen?.mode;
  return (
    <section className="palm-approach" aria-labelledby="palm-approach-title">
      <h2 id="palm-approach-title">Как вы считаете еду?</h2>
      <p className="small muted">От ответа зависит, как будет выглядеть дневник. Поменять можно в любой момент в «Ещё».</p>
      <div className="palm-approach__options" role="radiogroup" aria-label="Опыт подсчёта">
        {ANSWERS.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={answer === a.id} className={'palm-option' + (answer === a.id ? ' is-on' : '')} onClick={() => { haptic(); setAnswer(a.id); }}>
            <span className="palm-option__text"><strong>{a.title}</strong><small>{a.note}</small></span>
            <span className="palm-option__radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      {mode && (
        <div className="palm-approach__result" aria-live="polite">
          <small>Подойдёт режим</small>
          <strong>{mode === 'palm' ? 'Ладонь' : 'Подсчёт в граммах'}</strong>
          <div className="palm-approach__tags">
            <span className="palm-tag palm-tag--easy">Сложность: {SCALE[mode].difficulty}</span>
            <span className={'palm-tag ' + (mode === 'palm' ? 'palm-tag--approx' : 'palm-tag--exact')}>Точность: {SCALE[mode].accuracy}</span>
          </div>
          <p className="small">{mode === 'palm'
            ? 'Белок — ладонь, углеводы — горсть, жиры — большой палец, овощи — кулак. Тренер видит порции в вашем дневнике.'
            : 'Продукты из базы, свои с этикетки и граммы. Ладонью можно отметить порцию и в этом режиме.'}</p>
        </div>
      )}
      <div className="palm-approach__actions">
        <button type="button" className="button button--primary" disabled={!mode || busy} onClick={() => onChoose(mode)}>{busy ? 'Сохраняю…' : 'Продолжить'}</button>
        {onCancel && <button type="button" className="button button--ghost" disabled={busy} onClick={onCancel}>Не сейчас</button>}
      </div>
    </section>
  );
}

/** Итог дня порциями: четыре круга «отмечено / норма» */
export function PalmSummary({ entries, targets }) {
  const norm = palmNorm(targets), got = palmCount(entries);
  return (
    <div className="palm-summary">
      <div className="palm-summary__row">
        {PALM_GROUPS.map((g) => {
          const goal = norm?.[g.id] || 0, have = got[g.id];
          const pct = goal ? Math.min(100, (have / goal) * 100) : 0;
          return (
            <div key={g.id} className={'palm-ring palm-ring--' + g.id + (goal && have >= goal ? ' is-done' : '')} style={{ '--palm-progress': pct }}>
              <span className="palm-ring__circle"><HandIcon kind={g.id} size={22} /></span>
              {/* «3 из 5»: число с серой единицей, как счёт в «Целях» (Qty, FT-665) */}
              <strong>{goal ? <Qty value={formatNumber(have)} unit={'из ' + goal} /> : formatNumber(have)}</strong>
              <small>{g.title}</small>
            </div>
          );
        })}
      </div>
      <p className="small muted">{norm
        ? 'Норма в порциях посчитана из нормы на день: ' + formatNumber(Math.round(targets.kcal)) + ' ккал.'
        : 'Норма ещё не назначена — отмечайте порции, тренер увидит, что вы едите.'}</p>
    </div>
  );
}

/**
 * Лист «Порции ладонью» на приём пищи: касание пиктограммы — порция, ещё
 * раз по последней — убрать; «+½» — половина. Сохраняются отдельными
 * записями дневника по группам (сервер считает КБЖУ средней порции).
 */
export function PalmSheet({ day = today(), meal = 'snack', onClose, onSaved, onGrams }) {
  const [counts, setCounts] = useState({ protein: 0, carbs: 0, fat: 0, veg: 0 });
  const [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const ids = useRef({});
  const total = PALM_GROUPS.reduce((s, g) => s + counts[g.id] * PALM[g.id].kcal, 0);
  const tap = (id, k) => { haptic(); setCounts((c) => ({ ...c, [id]: c[id] === k ? k - 1 : k })); };
  const half = (id) => { haptic(); setCounts((c) => ({ ...c, [id]: Math.min(10, c[id] + 0.5) })); };
  const dirty = Object.values(counts).some(Boolean);
  const save = async () => {
    setBusy(true); setError(null);
    let queued = false;
    try {
      for (const g of PALM_GROUPS) {
        const amount = counts[g.id];
        if (!amount) continue;
        // Один requestId на группу и количество: повтор после потери ответа не задвоит запись
        const key = g.id + ':' + amount + ':' + meal + ':' + day;
        ids.current[key] ||= requestId();
        const params = { day, meal, amount, product: { kind: 'palm', id: g.id }, preview: palmSnapshot(g.id), requestId: ids.current[key] };
        try { await apiMutate('diary.entry.save', params); }
        catch (e) { if (!isOffline(e)) throw e; await queueWrite('diaryEntry', params); queued = true; }
        setCounts((c) => ({ ...c, [g.id]: 0 }));
      }
      haptic('success');
      onSaved(queued ? 'Сохранено на телефоне. Отправим при появлении связи.' : 'Порции записаны: ≈ ' + formatNumber(Math.round(total)) + ' ккал.', queued ? 'info' : 'good');
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const mealLabel = DIARY_MEALS.find((m) => m.id === meal)?.label || meal;
  return (
    <Sheet title={'Порции · ' + mealLabel} dirty={dirty} locked={busy} onClose={onClose}>
      <div className="palm-sheet">
        <p className="small muted">{dayLabel(day)}. Касание — порция, ещё раз по последней — убрать.</p>
        {PALM_GROUPS.map((g) => (
          <div key={g.id} className={'palm-group palm-group--' + g.id} role="group" aria-label={g.title + ', ' + g.hand}>
            <div className="palm-group__head">
              <strong>{g.title} · {g.hand}</strong>
              <small>{g.hint}</small>
            </div>
            <div className="palm-group__hands">
              {[1, 2, 3, 4, 5].map((k) => (
                <button key={k} type="button" className={'palm-hand' + (counts[g.id] >= k ? ' is-on' : counts[g.id] > k - 1 ? ' is-half' : '')} aria-label={g.title + ': ' + k + ' ' + palmUnit(g.id, k)} aria-pressed={counts[g.id] >= k} onClick={() => tap(g.id, k)}>
                  <HandIcon kind={g.id} filled={counts[g.id] >= k} />
                </button>
              ))}
              <button type="button" className="palm-half" aria-label={'Ещё половина: ' + g.title} onClick={() => half(g.id)}>+½</button>
            </div>
            <p className="palm-group__count" aria-live="polite">{counts[g.id] ? formatNumber(counts[g.id]) + ' ' + palmUnit(g.id, counts[g.id]) : 'не отмечено'}</p>
          </div>
        ))}
        {error && <Note tone="critical">{error.message || String(error)}</Note>}
        <div className="diary-form-footer palm-sheet__footer">
          <button type="button" className="button button--primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Сохраняю…' : dirty ? 'Сохранить · ≈ ' + formatNumber(Math.round(total)) + ' ккал' : 'Сохранить'}</button>
          {onGrams && <button type="button" className="button button--ghost" disabled={busy} onClick={onGrams}>В граммах</button>}
        </div>
      </div>
    </Sheet>
  );
}
