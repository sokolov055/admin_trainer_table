import React, { useState, useRef } from 'react';
import { apiMutate } from '../api.js';
import { Note, Sheet } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { queueWrite, isOffline } from '../offline-writes.js';
import { today, dayLabel, requestId, label, decimal } from './diary-model.js';
import { Field, ErrorNote, n } from './diary-ui.jsx';

/**
 * Лист «Только калории» (план трёх разборов, п. 1), вынесен из Diary.jsx
 * 21.10.2026. Открывается из плитки на экране «Добавить еду».
 */
// «Только калории» (план трёх разборов, п. 1): продукта нет в базе или некогда
// искать — примерная запись лучше пропущенной. Калории обязательны, название
// и Б/Ж/У — если знают. Сервер помечает запись «примерно» (kind: 'quick').
const optional = v => String(v).trim() === '' ? '' : decimal(v);
export function QuickEntry({ day = today(), meal = 'snack', onClose, onSaved }) {
  const [fields, setFields] = useState({ kcal: '', name: '', protein: '', fat: '', carbs: '' }), [error, setError] = useState(null), [kcalError, setKcalError] = useState(''), [busy, setBusy] = useState(false);
  const token = useRef({ signature: '', id: '' });
  const set = key => v => { setFields(f => ({ ...f, [key]: v })); if (key === 'kcal') setKcalError(''); };
  const kcal = decimal(fields.kcal);
  const submit = async e => {
    e.preventDefault();
    if (!Number.isFinite(kcal) || kcal < 1 || kcal > 5000) { setKcalError('Калории: от 1 до 5000.'); return; }
    const product = { kind: 'quick', name: fields.name.trim(), kcal, protein: optional(fields.protein), fat: optional(fields.fat), carbs: optional(fields.carbs) };
    const preview = { ...product, name: product.name || 'Примерно', protein: product.protein === '' ? null : product.protein, fat: product.fat === '' ? null : product.fat, carbs: product.carbs === '' ? null : product.carbs, id: 'pending', unit: 'portion', approx: true, source: 'Примерно · без продукта' };
    const payload = { day, meal, amount: 1, product, preview };
    const signature = JSON.stringify(payload);
    if (token.current.signature !== signature) token.current = { signature, id: requestId() };
    const params = { ...payload, requestId: token.current.id };
    setBusy(true); setError(null);
    try { await apiMutate('diary.entry.save', params); haptic('success'); onSaved('Записано примерно: ' + n(kcal) + ' ккал.'); }
    catch (err) {
      if (isOffline(err)) {
        try { await queueWrite('diaryEntry', params); haptic('success'); onSaved('Сохранено на телефоне. Отправим при появлении связи.', 'info'); }
        catch (storageError) { setError(storageError); }
      } else setError(err);
    } finally { setBusy(false); }
  };
  const dirty = Object.values(fields).some(v => String(v).trim());
  return <Sheet title="Только калории" dirty={dirty} locked={busy} focus="#quick-kcal" onClose={onClose}><form className="diary-form diary-quick" onSubmit={submit}><p className="small muted">{dayLabel(day)} · {label(meal)}. Когда продукта нет в базе или некогда искать: примерная запись лучше пропущенной.</p><Field id="quick-kcal" label="Калории, ккал" inputMode="numeric" value={fields.kcal} onChange={set('kcal')} error={kcalError} aria-required="true" /><Field label="Что это было" placeholder="Бизнес-ланч, кусок торта…" value={fields.name} onChange={set('name')} maxLength={120} /><div className="diary-quick__macros" role="group" aria-label="Белки, жиры и углеводы, если знаете">{[['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([k, text]) => <Field key={k} label={text} inputMode="decimal" placeholder="—" value={fields[k]} onChange={set(k)} />)}</div><Note tone="info">Запись помечается «примерно» — и в итоге дня, и у тренера.</Note><ErrorNote error={error} /><div className="diary-form-footer"><button className="button button--primary" disabled={busy} type="submit">{busy ? 'Сохраняю…' : Number.isFinite(kcal) && kcal > 0 ? 'Добавить ' + n(kcal) + ' ккал' : 'Добавить'}</button></div></form></Sheet>;
}
