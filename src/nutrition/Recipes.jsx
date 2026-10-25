import React, { useState, useEffect, useRef } from 'react';
import { Section, Panel, Loading } from '../ui.jsx';
import { IconPlus } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { foodTitle, foodPer } from './FoodFields.jsx';
import { DIARY_MEALS, productKey, mealFromRecipe } from './diary-model.js';
import { ErrorNote, n } from './diary-ui.jsx';
import { CARB_LEVELS, carbLevel, carbTag, preferredLevel, carbDayLine } from './carbs.js';
import './carbs.css';
import { ProductSwaps } from './DiaryExtras.jsx';

/**
 * Вкладка «Рецепты» под остаток нормы (план трёх разборов, п. 11): фильтр
 * recipeFilter — чистая функция, её проверяет scripts/test-diary.mjs.
 * Вынесено из Diary.jsx 21.10.2026.
 */
// «Рецепты» под остаток нормы (план трёх разборов, п. 11, из ONLYFITS): приём и
// калорийность порции чипами; по умолчанию — то, что влезает в остаток дня
export const RECIPE_TAGS = [['быстро', 'Быстро'], ['вегетарианское', 'Вегетарианское'], ['без молочного', 'Без молочного'], ['высокобелковое', 'Много белка']];
// carbs — уровень углеводов блюда (FT-709): 'high' | 'mid' | 'low', пусто — любые
export function recipeFilter(rows, { meal, band, tags, remaining, carbs = null }) {
  return rows.filter(p => {
    // Свои рецепты считаются на 100 г, а не на порцию — их не фильтруем, они ниже блюд
    if (p.kind !== 'dish') return true;
    if (meal && mealFromRecipe(p.meal) !== meal) return false;
    const kcal = Number(p.kcal || 0);
    if (band === 'rest' && !(remaining > 0 && kcal <= remaining)) return false;
    if (band === 'low' && kcal > 300) return false;
    if (band === 'mid' && (kcal <= 300 || kcal > 600)) return false;
    if (carbs && carbLevel(p) !== carbs) return false;
    return tags.every(t => (p.tags || []).includes(t));
  }).sort((a, b) => (a.kind === 'dish' ? 0 : 1) - (b.kind === 'dish' ? 0 : 1));
}
// onSnacks / onFridge (FT-744) — «Перекус, который влезет» и «Из того, что есть
// дома» строками над фильтрами: сюда ведёт единственная ссылка «Что съесть на …»
// из итога дня, прежние входы в итоге и чип среди фильтров убраны
export function Recipes({ rows, loading, error, remaining, readOnly, canAsk = false, onAdd, onEdit, onNew, onFridge, onSnacks, carbDay }) {
  // Состав с заменами (FT-709) — по кнопке «Состав», одна строка за раз
  const [open, setOpen] = useState('');
  const [meal, setMeal] = useState(null), [band, setBand] = useState(remaining > 0 ? 'rest' : 'any'), [tags, setTags] = useState([]);
  // День тренировки — сначала блюда с углеводами, день отдыха — без (FT-709).
  // День приходит после загрузки: выбор по умолчанию следует за ним, пока
  // человек не выбрал сам
  const prefer = preferredLevel(carbDay), [carbs, setCarbs] = useState(prefer), carbsTouched = useRef(false);
  useEffect(() => { if (!carbsTouched.current) setCarbs(prefer); }, [prefer]);
  const carbHint = carbDayLine(carbDay, { today: carbDay?.today !== false });
  // Остаток приходит после загрузки дня и уходит после записи: чип «под остаток» живёт вместе с ним
  const hadRest = useRef(remaining > 0);
  useEffect(() => { if (remaining > 0 && !hadRest.current) setBand('rest'); if (!(remaining > 0) && band === 'rest') setBand('any'); hadRest.current = remaining > 0; }, [remaining > 0]);
  // Подсказка дня не должна оставлять пустой список: под остаток может не
  // найтись ни одного блюда нужного уровня — тогда показываем все
  const filtered = recipeFilter(rows, { meal, band, tags, remaining, carbs });
  const fallback = carbs && !carbsTouched.current && !filtered.some(p => p.kind === 'dish');
  const shownCarbs = fallback ? null : carbs, list = fallback ? recipeFilter(rows, { meal, band, tags, remaining }) : filtered;
  const chip = (on, text, click, key) => <button key={key || text} type="button" className={'chip' + (on ? ' chip--active' : '')} aria-pressed={on} onClick={() => { haptic(); click(); }}>{text}</button>;
  return <Section title="Что приготовить" note={remaining > 0 ? 'Осталось ' + n(remaining) + ' ккал' : undefined}>{(onSnacks || onFridge) && <Panel className="recipe-entries">{onSnacks && <button type="button" className="diary-more" onClick={() => { haptic(); onSnacks(); }}><strong>Перекус, который влезет</strong><small>Порция целиком помещается в остаток</small></button>}{onFridge && <button type="button" className="diary-more" onClick={() => { haptic(); onFridge(); }}><strong>Из того, что есть дома</strong><small>Отметьте продукты — соберём день и список покупок</small></button>}</Panel>}<Panel pad><div className="recipe-filters"><p className="recipe-filters__label">Приём</p><div className="chips chips--wrap chips--flush">{DIARY_MEALS.map(m => chip(meal === m.id, m.label, () => setMeal(meal === m.id ? null : m.id), m.id))}</div><p className="recipe-filters__label">Калорийность порции</p><div className="chips chips--wrap chips--flush">{remaining > 0 && chip(band === 'rest', 'До ' + n(remaining) + ' · под остаток', () => setBand('rest'), 'rest')}{chip(band === 'low', 'До 300', () => setBand('low'), 'low')}{chip(band === 'mid', '300–600', () => setBand('mid'), 'mid')}{chip(band === 'any', 'Любая', () => setBand('any'), 'any')}</div><p className="recipe-filters__label">Углеводы в порции</p><div className="chips chips--wrap chips--flush">{chip(!shownCarbs, 'Любые', () => { carbsTouched.current = true; setCarbs(null); }, 'carbs-any')}{CARB_LEVELS.map(l => chip(shownCarbs === l.id, l.label, () => { carbsTouched.current = true; setCarbs(l.id); }, 'carbs-' + l.id))}</div>{carbHint && <p className="carb-hint">{carbHint}</p>}<div className="chips chips--wrap chips--flush">{RECIPE_TAGS.map(([id, text]) => chip(tags.includes(id), text, () => setTags(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]), id))}</div></div>{!readOnly && <button className="button" onClick={onNew}><IconPlus size={16} /> Свой рецепт</button>}<ErrorNote error={error} />{loading ? <Loading lead={false} rows={2} /> : list.length ? list.map(p => { const fits = remaining > 0 && p.kind === 'dish' && Number(p.kcal) <= remaining, level = p.kind === 'dish' ? carbLevel(p) : null; const key = productKey(p); return <React.Fragment key={key}><div className="diary-catalog-row"><button type="button" className="diary-food-main" aria-expanded={open === key} onClick={() => { haptic(); setOpen(open === key ? '' : key); }}><strong>{foodTitle(p)}</strong><small>{n(p.kcal)} ккал / {foodPer(p)} · Б {n(p.protein)} · Ж {n(p.fat)} · У {n(p.carbs)}</small>{level && <small className="recipe-carbs">{carbTag(level)}</small>}{(fits || p.minutes) ? <small className={fits ? 'recipe-fits' : ''}>{[fits ? 'Влезает в остаток' : '', p.minutes ? p.minutes + ' мин' : ''].filter(Boolean).join(' · ')}</small> : null}<small className="swap-toggle">{open === key ? 'Скрыть состав' : 'Состав и замены'}</small></button><div className="diary-inline-actions">{!readOnly && p.kind === 'recipe' && <button className="button button--ghost" aria-label={'Изменить рецепт: ' + p.name} onClick={() => onEdit(p)}>Изменить</button>}{!readOnly && <button className="button" onClick={() => onAdd(p, meal)}>Добавить</button>}</div></div>{open === key && <ProductSwaps product={p} canAsk={canAsk} />}</React.Fragment>; }) : <p className="small muted">Под эти условия блюд нет. Снимите фильтр или выберите «Любая».</p>}</Panel></Section>;
}
