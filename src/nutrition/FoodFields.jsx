import React from 'react';
import './diary.css';
export function FoodField({ label, value, onChange, ...rest }) {
  return <label className="field"><span className="field__label">{label}</span><input className="field__input" value={value} onChange={e => onChange(e.target.value)} {...rest} /></label>;
}
const Field = FoodField;

export const PREPARATIONS = [['as_sold', 'Как продаётся'], ['raw', 'Сырой продукт'], ['dry', 'Сухой вес'], ['cooked', 'Готовый вес'], ['unspecified', 'Не уточнён']];
export function FoodFields({ value, onChange }) {
  const set = key => next => onChange({ ...value, [key]: next });
  return <>
    <Field label="Название продукта" value={value.name} onChange={set('name')} maxLength={60} required />
    <Field label="Бренд (необязательно)" value={value.brand || ''} onChange={set('brand')} maxLength={60} />
    <label className="field"><span className="field__label">В каком виде взвешиваете</span><select className="field__input" value={value.preparation || 'as_sold'} onChange={e => set('preparation')(e.target.value)}>{PREPARATIONS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
    <Field label="Штрихкод (необязательно)" value={value.barcode || ''} onChange={set('barcode')} inputMode="numeric" maxLength={14} />
    <div className="diary-goal-grid">{[['kcal', 'Ккал'], ['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([key, label]) => <Field key={key} label={label} value={String(value[key] ?? '')} onChange={set(key)} inputMode="decimal" required />)}</div>
  </>;
}

export const foodTitle = p => p.name + (p.brand ? ' · ' + p.brand : '');
