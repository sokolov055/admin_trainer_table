import React, { useState, useEffect, useRef } from 'react';
import { apiStale, apiMutate } from '../api.js';
import { Note, formatNumber } from '../ui.jsx';
import { isOffline } from '../offline-writes.js';
import { foodUnit as unit } from './FoodFields.jsx';
import { requestId } from './diary-model.js';
import { palmUnit } from './palm-model.js';

/**
 * Общие кирпичики экранов дневника питания (вынесены из Diary.jsx 21.10.2026,
 * план трёх разборов): загрузка ресурса с защитой от запоздалого ответа,
 * повтор операции с тем же requestId, поле с ошибкой под ним, плашка ошибки
 * и подписи чисел. Чистые функции без React — в diary-model.js.
 */
export const n = v => formatNumber(Math.round(Number(v || 0)));
export const macroLine = t => `Б ${n(t.protein)} · Ж ${n(t.fat)} · У ${n(t.carbs)} г`;
// Подпись количества в строке еды: у примерной записи — «примерно», у ладони — порции рукой
export const amountLabel = e => e.product.kind === 'free' ? 'без ограничений' + (e.amount !== 1 ? ' · ×' + formatNumber(e.amount) : '') : e.product.kind === 'quick' ? 'примерно' + (e.amount !== 1 ? ' · ×' + formatNumber(e.amount) : '') : e.product.kind === 'palm' ? formatNumber(e.amount) + ' ' + palmUnit(e.product.id, e.amount) + ' · примерно' : formatNumber(e.amount) + ' ' + unit(e.product);

// Не показываем ответ прошлого дня/клиента, пришедший после переключения.
export function useDiaryResource(action, params) {
  const key = action + '|' + JSON.stringify(params), sequence = useRef(0);
  const [version, setVersion] = useState(0), [value, setValue] = useState({});
  useEffect(() => {
    let alive = true; const ticket = ++sequence.current;
    const cached = apiStale(action, params);
    setValue(old => ({ key, data: cached.data || (old.key === key ? old.data : null), loading: !cached.data && !(old.key === key && old.data), stale: !!cached.data, error: null }));
    cached.promise.then(data => { if (alive && ticket === sequence.current) setValue({ key, data, loading: false, stale: false, error: null }); })
      .catch(error => { if (alive && ticket === sequence.current) setValue(old => ({ ...old, key, loading: false, stale: true, error })); });
    return () => { alive = false; };
  }, [key, version]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reload = () => setVersion(v => v + 1);
    window.addEventListener('online', reload); window.addEventListener('focus', reload);
    return () => { window.removeEventListener('online', reload); window.removeEventListener('focus', reload); };
  }, []);
  return { ...(value.key === key ? value : { data: null, loading: true }), reload: () => setVersion(v => v + 1) };
}

// После потерянного ответа повторяем тот же requestId, а не новую операцию.
export function useOperation() {
  const last = useRef(null);
  return async (action, params) => {
    const signature = JSON.stringify([action, params]);
    if (!last.current || last.current.signature !== signature) last.current = { signature, requestId: requestId() };
    const result = await apiMutate(action, { ...params, requestId: last.current.requestId });
    last.current = null;
    return result;
  };
}

// Ошибка под полем — без «обновите данные»: это не про сервер. Подсказка
// повторить остаётся у сетевых ошибок и конфликта ревизии (409).
export function Field({ label: text, value, onChange, error, ...rest }) {
  const errorId = useRef('field-error-' + requestId());
  if (!error) return <label className="field"><span className="field__label">{text}</span><input className="field__input" value={value} onChange={e => onChange(e.target.value)} {...rest} /></label>;
  // Ошибка — рядом с меткой, но не внутри неё: имя поля для читалки остаётся коротким
  return <div className="field field--bad"><label><span className="field__label">{text}</span><input className="field__input" value={value} onChange={e => onChange(e.target.value)} aria-invalid="true" aria-describedby={errorId.current} {...rest} /></label><span className="field__error" id={errorId.current} role="alert">{error}</span></div>;
}
export const needsRetry = e => !!e && typeof e === 'object' && (isOffline(e) || e.code === 409);
export function ErrorNote({ error }) { return error ? <Note tone="critical">{typeof error === 'string' ? error : error.message}{needsRetry(error) ? ' Обновите данные или повторите действие.' : ''}</Note> : null; }
