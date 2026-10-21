import React, { useState } from 'react';
import { Sheet } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { DIARY_MEALS } from './diary-model.js';
import { ErrorNote, n } from './diary-ui.jsx';

/**
 * Норма по приёмам (план трёх разборов, п. 10): лист с долями дня в процентах
 * и строка «520 из 450 ккал» у приёма. Вынесено из Diary.jsx 21.10.2026.
 */
// Норма на приём (план трёх разборов, п. 10, как у «Худеем вместе»): доли дня
// в процентах — клиент видит «сколько можно на ужин», а не только остаток дня.
export const MEAL_DEFAULT = { breakfast: 25, lunch: 35, dinner: 30, snack: 10 };
export function MealShares({ meals, dayKcal, onClose, onSave }) {
  const start = meals || MEAL_DEFAULT;
  const [values, setValues] = useState({ ...start }), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const sum = DIARY_MEALS.reduce((s, m) => s + (Number(values[m.id]) || 0), 0);
  const step = (id, d) => { haptic(); setValues(v => ({ ...v, [id]: Math.max(0, Math.min(100, (Number(v[id]) || 0) + d)) })); };
  const save = async next => { setBusy(true); setError(null); try { await onSave(next); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Sheet title="Норма по приёмам" dirty={JSON.stringify(values) !== JSON.stringify(start)} locked={busy} onClose={onClose}><div className="diary-form meal-shares"><p className="small muted">{dayKcal ? 'Из ' + n(dayKcal) + ' ккал в день.' : 'Норма дня ещё не назначена — доли посчитаются, когда она появится.'} Сумма всегда 100 %.</p>{DIARY_MEALS.map(m => <div className="meal-shares__row" key={m.id}><span className="meal-shares__name">{m.label}</span><button type="button" className="meal-shares__step" aria-label={'Меньше: ' + m.label} onClick={() => step(m.id, -5)}>−</button><strong className="meal-shares__pct" aria-live="polite">{values[m.id]} %</strong><button type="button" className="meal-shares__step" aria-label={'Больше: ' + m.label} onClick={() => step(m.id, 5)}>+</button><span className="meal-shares__kcal">{dayKcal ? n(dayKcal * values[m.id] / 100) + ' ккал' : ''}</span></div>)}<p className={'meal-shares__sum' + (sum === 100 ? ' is-ok' : '')} role="status">Сумма: {sum} %{sum !== 100 ? ' — ' + (sum > 100 ? 'уберите ' + (sum - 100) : 'добавьте ' + (100 - sum)) + ' %' : ''}</p><ErrorNote error={error} /><div className="diary-form-footer meal-shares__actions"><button type="button" className="button button--primary" disabled={busy || sum !== 100} onClick={() => save(values)}>Сохранить</button><button type="button" className="button button--ghost" disabled={busy} onClick={() => setValues({ ...MEAL_DEFAULT })}>По умолчанию</button>{meals && <button type="button" className="button button--ghost" disabled={busy} onClick={() => save(null)}>Без долей</button>}</div></div></Sheet>;
}
// «520 из 450 ккал · на 70 больше» / «0 из 540 · можно ещё 540»
export function MealNormLine({ eaten, norm }) {
  const diff = Math.round(norm - eaten), over = diff < -norm * 0.1;
  return <span className={'diary-meal-norm' + (over ? ' is-over' : '')}><strong>{n(eaten)}</strong> из {n(norm)} ккал<small>{over ? 'на ' + n(-diff) + ' больше' : diff > 0 ? 'можно ещё ' + n(diff) : 'в норме'}</small></span>;
}
