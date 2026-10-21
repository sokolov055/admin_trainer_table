import React from 'react';
import { formatNumber } from '../ui.jsx';
import { IconCheck } from '../icons.jsx';
import { foodPer } from './FoodFields.jsx';

/**
 * Карточка продукта в листе записи (план трёх разборов, п. 3), вынесена из
 * Diary.jsx 21.10.2026.
 */
// Карточка продукта (план трёх разборов, п. 3): проверен ли он, откуда цифры
// и честное «нет данных», если поля в источнике нет, — ноль не выдумываем.
const trustOf = p => p.approx ? { tone: 'approx', text: 'Примерно — без продукта' } : p.sourceType === 'usda' ? { tone: 'good', text: 'Справочные значения USDA' } : p.reviewStatus === 'verified' ? { tone: 'good', text: 'Проверено' } : p.kind === 'food' ? { tone: 'warn', text: 'Не проверено — сверьте с упаковкой' } : null;
const known = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
export function ProductFacts({ p }) {
  const trust = trustOf(p), per = p.unit === 'portion' ? 'в порции' : 'на ' + foodPer(p);
  const missing = ['kcal', 'protein', 'fat', 'carbs'].some(k => !known(p[k]));
  return <div className="diary-product">{trust && <span className={'diary-product__trust diary-product__trust--' + trust.tone}>{trust.tone === 'good' && <IconCheck size={14} />}{trust.text}</span>}<p className="diary-product__kcal"><strong>{known(p.kcal) ? formatNumber(Math.round(Number(p.kcal))) : 'нет данных'}</strong> <span>ккал {per}</span></p><dl className="diary-product__macros">{[['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([k, text]) => <div key={k}><dt>{text}</dt><dd className={known(p[k]) ? '' : 'is-missing'}>{known(p[k]) ? formatNumber(Math.round(Number(p[k]) * 10) / 10) + ' г' : 'нет данных'}</dd></div>)}</dl>{p.source && !p.approx && <p className="small muted diary-product__source">Источник: {p.source}</p>}{missing && <p className="small muted diary-product__source">«Нет данных» — этого поля нет в источнике. Ноль мы не придумываем.</p>}</div>;
}
