import React from 'react';
import './diary.css';
// counter — показать «27 / 120» под полем (нужен maxLength)
export function FoodField({ label, value, onChange, counter = false, ...rest }) {
  const input = <><span className="field__label">{label}</span><input className="field__input" value={value} onChange={e => onChange(e.target.value)} {...rest} /></>;
  if (!counter || !rest.maxLength) return <label className="field">{input}</label>;
  // Счётчик — рядом с меткой, а не внутри: имя поля остаётся «Название продукта»
  return <div className="field"><label>{input}</label><span className="field__counter" aria-hidden="true">{String(value ?? '').length} / {rest.maxLength}</span></div>;
}
const Field = FoodField;
// Совпадает с food.add / food.review на сервере (lib/food-catalog.js)
export const FOOD_NAME_MAX = 120;

export const PREPARATIONS = [['as_sold', 'Как продаётся'], ['raw', 'Сырой продукт'], ['dry', 'Сухой вес'], ['cooked', 'Готовый вес'], ['unspecified', 'Не уточнён']];
// На 100 чего цифры с упаковки: напитки — в миллилитрах, их порции потом тоже в мл
export const FOOD_UNITS = [['g', 'на 100 г'], ['ml', 'на 100 мл']];
export function FoodFields({ value, onChange }) {
  const set = key => next => onChange({ ...value, [key]: next });
  const unit = value.unit === 'ml' ? 'ml' : 'g';
  return <>
    <Field label="Название продукта" value={value.name} onChange={set('name')} maxLength={FOOD_NAME_MAX} counter required />
    <Field label="Бренд (необязательно)" value={value.brand || ''} onChange={set('brand')} maxLength={60} />
    <label className="field"><span className="field__label">В каком виде взвешиваете</span><select className="field__input" value={value.preparation || 'as_sold'} onChange={e => set('preparation')(e.target.value)}>{PREPARATIONS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
    <Field label="Штрихкод (необязательно)" value={value.barcode || ''} onChange={set('barcode')} inputMode="numeric" maxLength={14} />
    <div className="field"><span className="field__label" id="food-unit-label">Значения с упаковки</span><div className="diary-inline-actions" role="radiogroup" aria-labelledby="food-unit-label">{FOOD_UNITS.map(([id, text]) => <button type="button" key={id} role="radio" aria-checked={unit === id} className={'chip' + (unit === id ? ' chip--active' : '')} onClick={() => set('unit')(id)}>{text}</button>)}</div></div>
    <div className="diary-goal-grid">{[['kcal', 'Ккал'], ['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([key, label]) => <Field key={key} label={label} value={String(value[key] ?? '')} onChange={set(key)} inputMode="decimal" required />)}</div>
  </>;
}

export const foodTitle = p => p.name + (p.brand ? ' · ' + p.brand : '');
export const foodUnit = p => p.unit === 'portion' ? 'порц.' : p.unit === 'ml' ? 'мл' : 'г';
/** «порция» или «100 г / 100 мл» — к чему относятся КБЖУ карточки */
export const foodPer = p => p.unit === 'portion' ? 'порция' : '100 ' + foodUnit(p);
