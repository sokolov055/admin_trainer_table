import React, { useState, useEffect, useRef } from 'react';
import { apiMutate } from '../api.js';
import { Note, Loading, Sheet } from '../ui.jsx';
import { IconHeart, IconChevron } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { FoodFields, foodTitle, foodPer } from './FoodFields.jsx';
import FoodScan from './FoodScan.jsx';
import { productKey, label } from './diary-model.js';
import { useDiaryResource, useOperation, Field, ErrorNote, n, macroLine } from './diary-ui.jsx';

/**
 * Экран «Добавить еду» (план трёх разборов, п. 9): плитки способов ввода,
 * поиск по базе с вкладками «Недавние / Любимые / Все» и лист «Свой продукт»
 * с этикетки. Вынесен из Diary.jsx 21.10.2026; рецепт берёт отсюда же
 * выбор ингредиента (ingredientsOnly).
 */
// «Свой продукт» открывается листом поверх списка: список остаётся со
// своим поиском и вкладкой, назад возвращает к нему.
// Плитки способов на экране «Добавить еду» (п. 9 плана, как у «Худеем вместе»):
// все пути ввода видны сразу, сканер больше не спрятан в отдельный режим
// Обводка — как у icons.jsx на 22 px: 1,75 на сетке 24 (у «Ладони» сетка 32 —
// 2,33), аудит 24.10.2026
const WAYS = [
  // Еда по фото (FT-736) — первой: самый быстрый способ, пока видна только пробе
  { id: 'photo', title: 'Фото блюда', icon: <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg> },
  { id: 'label', title: 'Фото этикетки', icon: <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" /><path d="M8 9h8M8 12h8M8 15h5" /></svg> },
  { id: 'barcode', title: 'Штрихкод', icon: <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 6v12M8 6v12M11 6v12M15 6v12M18 6v12M20 6v12" /></svg> },
  { id: 'custom', title: 'Свой продукт', icon: <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg> },
  { id: 'recipe', title: 'Своё блюдо', icon: <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15h16M6 15a6 6 0 0 1 12 0M12 7V5M9 19h6" /></svg> },
  { id: 'quick', title: 'Только калории', icon: <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" /></svg> },
  { id: 'palm', title: 'Ладонью', icon: <svg viewBox="0 0 32 32" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.33" strokeLinecap="round" strokeLinejoin="round"><path d="M9 29h12a5 5 0 0 0 5-5V13a2 2 0 0 0-4 0v5M22 13V7a2 2 0 0 0-4 0v10M18 7V5a2 2 0 0 0-4 0v12M14 7a2 2 0 0 0-4 0v12l-2.2-2.6a2 2 0 0 0-3.1 2.5L9 29" /></svg> },
];

export function ProductPicker({ meal, onPick, onClose, onQuick, onPalm, onRecipe, onPhoto, mealLine, ingredientsOnly = false }) {
  const [scope, setScope] = useState('recent'), [query, setQuery] = useState(''), [q, setQ] = useState(''), [version, setVersion] = useState(0);
  const [error, setError] = useState(null), [busy, setBusy] = useState(''), [custom, setCustom] = useState(false), [scan, setScan] = useState(''), [moreOpen, setMoreOpen] = useState(false);
  const op = useOperation();
  const way = id => { haptic(); if (id === 'label' || id === 'barcode') setScan(s => s === id ? '' : id); else if (id === 'custom') setCustom(true); else if (id === 'quick') onQuick?.(); else if (id === 'palm') onPalm?.(); else if (id === 'recipe') onRecipe?.(); else if (id === 'photo') onPhoto?.(); };
  const ways = ingredientsOnly ? WAYS.filter(w => ['label', 'barcode', 'custom'].includes(w.id)) : WAYS.filter(w => (w.id !== 'photo' || onPhoto) && (w.id !== 'quick' || onQuick) && (w.id !== 'palm' || onPalm) && (w.id !== 'recipe' || onRecipe));
  useEffect(() => { const t = setTimeout(() => setQ(query), 200); return () => clearTimeout(t); }, [query]);
  // Начали искать во «Недавних» — ищем во всей базе: кнопки «Искать во всей базе» больше нет
  useEffect(() => { if (q && scope === 'recent') setScope('all'); }, [q]);
  const resource = useDiaryResource('diary.catalog', { q, scope, refresh: version });
  const products = resource.data?.products || [];
  // Новичку «Недавние» пусты — сразу вся база, а не объяснение про сердечко (FT-646)
  const autoAll = useRef(false);
  useEffect(() => { if (!autoAll.current && scope === 'recent' && !q && resource.data && !resource.stale && !products.length) { autoAll.current = true; setScope('all'); } }, [scope, q, resource.data, resource.stale, products.length]);
  const toggle = async p => { setBusy(productKey(p)); setError(null); try { await op('diary.like', { kind: p.kind, id: p.id, liked: !p.liked }); haptic(); setVersion(v => v + 1); } catch (e) { setError(e); } finally { setBusy(''); } };
  // 25.10.2026 (владелец: «меню перегружено»): плиток нет. Фото блюда и
  // штрихкод — кнопками в поле поиска, остальные способы — под «Ещё способы»;
  // под продуктом только калории, пустые разделы не рисуются
  const tool = id => ways.find(w => w.id === id);
  const more = ways.filter(w => w.id !== 'photo' && w.id !== 'barcode');
  const groups = [['Продукты', ['food', 'ingredient']], ...(!ingredientsOnly ? [['Блюда', ['dish', 'recipe']]] : [])].map(([heading, kinds]) => [heading, products.filter(p => kinds.includes(p.kind))]).filter(([, list]) => list.length);
  const row = p => <div className="diary-catalog-row" key={productKey(p)}><button className="diary-food-main" type="button" onClick={() => onPick(p)} aria-label={'Добавить ' + p.name}><strong>{foodTitle(p)}</strong><small>{n(p.kcal)} ккал / {foodPer(p)}</small></button><button className="diary-like" type="button" aria-label={(p.liked ? 'Убрать из любимых: ' : 'В любимые: ') + p.name} aria-pressed={!!p.liked} disabled={!!busy || p.kind === 'legacy'} onClick={() => toggle(p)}><IconHeart size={19} /></button></div>;
  return <Sheet title={ingredientsOnly ? 'Ингредиент рецепта' : 'Добавить еду · ' + label(meal)} dirty={!!query} onClose={onClose}><div className="diary-search"><Field label="Поиск продуктов и блюд" placeholder="Продукт или блюдо" value={query} onChange={setQuery} /><div className="diary-search__tools">{['photo', 'barcode'].map(tool).filter(Boolean).map(w => <button key={w.id} type="button" className={'diary-search__tool' + (scan === w.id ? ' is-on' : '')} aria-label={w.title} aria-pressed={w.id === 'barcode' ? scan === w.id : undefined} onClick={() => way(w.id)}>{w.icon}</button>)}</div></div><FoodScan compact start={scan} onClose={() => setScan('')} onDraft={setCustom} onFound={onPick} /><div className="diary-tabs" aria-label="Источник продуктов">{[['recent', 'Недавние'], ['favorites', 'Любимые'], ['all', 'Все']].map(([id, name]) => <button className={'chip' + (scope === id ? ' chip--active' : '')} type="button" key={id} aria-pressed={scope === id} onClick={() => setScope(id)}>{name}</button>)}{more.length > 0 && <button type="button" className="diary-more-ways" aria-expanded={moreOpen} aria-label="Ещё способы" onClick={() => setMoreOpen(v => !v)}>Ещё<IconChevron size={16} style={{ transform: moreOpen ? 'rotate(180deg)' : undefined }} /></button>}</div>{moreOpen && <div className="diary-ways" role="group" aria-label="Способы добавить еду">{more.map(w => <button key={w.id} type="button" className={'diary-way' + (scan === w.id ? ' is-on' : '')} aria-pressed={w.id === 'label' ? scan === w.id : undefined} onClick={() => way(w.id)}>{w.icon}<span>{w.title}</span></button>)}</div>}<ErrorNote error={error || resource.error} />{resource.loading ? <Loading lead={false} rows={2} /> : groups.length ? groups.map(([heading, list]) => <section key={heading} aria-label={heading}>{groups.length > 1 && <h3 className="diary-catalog-heading">{heading}</h3>}{list.map(row)}</section>) : <p className="small muted">{scope === 'favorites' ? 'Здесь пока нет совпадений. Найдите продукт в общей базе и отметьте сердечком.' : scope === 'recent' && !q ? 'Здесь появится то, что вы уже записывали.' : 'Ничего не найдено.'}</p>}{resource.stale && <div className="diary-picker-tools"><span className="small muted">Сохранённый список</span></div>}{mealLine && <div className="diary-pickbar"><span>{mealLine}</span><button type="button" className="button button--primary" onClick={onClose}>Готово</button></div>}{custom && <CustomProduct initialFields={typeof custom === 'object' ? custom : {}} onClose={() => setCustom(false)} onCreated={onPick} />}</Sheet>;
}

function CustomProduct({ initialFields = {}, onCreated, onClose }) {
  const [fields, setFields] = useState({ name: '', brand: '', barcode: '', preparation: 'as_sold', unit: 'g', kcal: '', protein: '', fat: '', carbs: '', ...initialFields }), [error, setError] = useState(null), [busy, setBusy] = useState(false), [existing, setExisting] = useState(null);
  const initial = useRef(JSON.stringify(fields));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await apiMutate('food.add', fields);
      const p = { ...r.food, kind: 'food', unit: r.food.unit || 'g', source: r.food.source || 'С этикетки · не проверено' };
      if (r.existed) setExisting(p); else { haptic('success'); onCreated(p); }
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <Sheet title="Продукт с этикетки" dirty={JSON.stringify(fields) !== initial.current} onClose={onClose}><form className="diary-form" onSubmit={submit}><p className="small muted">Значения на 100 г, у напитков — на 100 мл. Укажите жирность в названии, бренд — отдельным полем. Штрихкод можно снять камерой или вписать цифрами. Карточка будет помечена как непроверенная. Карточка пополнит общий справочник без вашего имени. Личные данные и сведения о здоровье в название не вписывайте.</p><FoodScan disabled={busy} onDraft={patch => { setFields(f => ({ ...f, ...patch })); setExisting(null); }} onFound={onCreated} /><FoodFields value={fields} onChange={next => { setFields(next); setExisting(null); }} /><ErrorNote error={error} />{existing && <Note tone="info">Такая карточка уже есть: {n(existing.kcal)} ккал, {macroLine(existing)} на {foodPer(existing)}. Проверьте цифры. Если ваш отличается, уточните название.</Note>}<div className="diary-form-footer"><button className="button button--primary" disabled={busy}>Создать продукт</button>{existing && <button className="button" type="button" onClick={() => onCreated(existing)}>Использовать найденный</button>}</div></form></Sheet>;
}
