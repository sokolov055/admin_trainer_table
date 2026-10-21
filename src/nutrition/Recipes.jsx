import React, { useState } from 'react';
import { Section, Panel, Loading } from '../ui.jsx';
import { IconPlus } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { foodTitle, foodPer } from './FoodFields.jsx';
import { DIARY_MEALS, productKey, mealFromRecipe } from './diary-model.js';
import { ErrorNote, n } from './diary-ui.jsx';

/**
 * Вкладка «Рецепты» под остаток нормы (план трёх разборов, п. 11): фильтр
 * recipeFilter — чистая функция, её проверяет scripts/test-diary.mjs.
 * Вынесено из Diary.jsx 21.10.2026.
 */
// «Рецепты» под остаток нормы (план трёх разборов, п. 11, из ONLYFITS): приём и
// калорийность порции чипами; по умолчанию — то, что влезает в остаток дня
export const RECIPE_TAGS = [['быстро', 'Быстро'], ['вегетарианское', 'Вегетарианское'], ['без молочного', 'Без молочного'], ['высокобелковое', 'Много белка']];
export function recipeFilter(rows, { meal, band, tags, remaining }) {
  return rows.filter(p => {
    // Свои рецепты считаются на 100 г, а не на порцию — их не фильтруем, они ниже блюд
    if (p.kind !== 'dish') return true;
    if (meal && mealFromRecipe(p.meal) !== meal) return false;
    const kcal = Number(p.kcal || 0);
    if (band === 'rest' && !(remaining > 0 && kcal <= remaining)) return false;
    if (band === 'low' && kcal > 300) return false;
    if (band === 'mid' && (kcal <= 300 || kcal > 600)) return false;
    return tags.every(t => (p.tags || []).includes(t));
  }).sort((a, b) => (a.kind === 'dish' ? 0 : 1) - (b.kind === 'dish' ? 0 : 1));
}
export function Recipes({ rows, loading, error, remaining, readOnly, onAdd, onEdit, onNew, onFridge }) {
  const [meal, setMeal] = useState(null), [band, setBand] = useState(remaining > 0 ? 'rest' : 'any'), [tags, setTags] = useState([]);
  const list = recipeFilter(rows, { meal, band, tags, remaining });
  const chip = (on, text, click, key) => <button key={key || text} type="button" className={'chip' + (on ? ' chip--active' : '')} aria-pressed={on} onClick={() => { haptic(); click(); }}>{text}</button>;
  return <Section title="Что приготовить" note={remaining > 0 ? 'Осталось ' + n(remaining) + ' ккал' : undefined}><Panel pad><div className="recipe-filters"><p className="recipe-filters__label">Приём</p><div className="chips chips--wrap chips--flush">{DIARY_MEALS.map(m => chip(meal === m.id, m.label, () => setMeal(meal === m.id ? null : m.id), m.id))}</div><p className="recipe-filters__label">Калорийность порции</p><div className="chips chips--wrap chips--flush">{remaining > 0 && chip(band === 'rest', 'До ' + n(remaining) + ' · под остаток', () => setBand('rest'), 'rest')}{chip(band === 'low', 'До 300', () => setBand('low'), 'low')}{chip(band === 'mid', '300–600', () => setBand('mid'), 'mid')}{chip(band === 'any', 'Любая', () => setBand('any'), 'any')}</div><div className="chips chips--wrap chips--flush">{RECIPE_TAGS.map(([id, text]) => chip(tags.includes(id), text, () => setTags(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]), id))}{onFridge && <button type="button" className="chip" onClick={onFridge}>Из того, что есть</button>}</div></div>{!readOnly && <button className="button" onClick={onNew}><IconPlus size={16} /> Свой рецепт</button>}<ErrorNote error={error} />{loading ? <Loading lead={false} rows={2} /> : list.length ? list.map(p => { const fits = remaining > 0 && p.kind === 'dish' && Number(p.kcal) <= remaining; return <div className="diary-catalog-row" key={productKey(p)}><div className="diary-food-main"><strong>{foodTitle(p)}</strong><small>{n(p.kcal)} ккал / {foodPer(p)} · Б {n(p.protein)} · Ж {n(p.fat)} · У {n(p.carbs)}</small>{(fits || p.minutes) ? <small className={fits ? 'recipe-fits' : ''}>{[fits ? 'Влезает в остаток' : '', p.minutes ? p.minutes + ' мин' : ''].filter(Boolean).join(' · ')}</small> : null}</div>{!readOnly && <div className="diary-inline-actions">{p.kind === 'recipe' && <button className="button button--ghost" aria-label={'Изменить рецепт: ' + p.name} onClick={() => onEdit(p)}>Изменить</button>}<button className="button" onClick={() => onAdd(p)}>Добавить</button></div>}</div>; }) : <p className="small muted">Под эти условия блюд нет. Снимите фильтр или выберите «Любая».</p>}</Panel></Section>;
}
