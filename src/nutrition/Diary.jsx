import { FoodFields, foodTitle, foodUnit as unit, foodPer } from './FoodFields.jsx';
import FoodScan from './FoodScan.jsx';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { apiStale, apiMutate } from '../api.js';
import { Section, Panel, Note, Loading, Chips, Sheet, formatNumber } from '../ui.jsx';
import { IconPlus, IconClose, IconHeart, IconCopy, IconTrash, IconChevron, IconNutrition, IconCheck } from '../icons.jsx';
import { haptic } from '../telegram.js';
import SwipeRow from '../SwipeRow.jsx';
import { usePendingDelete } from '../pendingDelete.jsx';
import { localWrites, onWritesChange, queueWrite, isOffline, dropWrite } from '../offline-writes.js';
import { offlineAccount } from '../offline-account.js';
import { DIARY_MEALS, NUTRIENTS, today, shiftDay, dayLabel, requestId, totalEntries, withPending, productKey, mealNow, dayVerdict } from './diary-model.js';
import { DIARY_LESSONS } from './diary-lessons.js';
import { palmUnit } from './palm-model.js';
import { Approach, PalmSummary, PalmSheet } from './Palm.jsx';

// «Не сейчас» на вопросе про опыт — неделю не спрашиваем (только на этом устройстве)
const LATER_KEY = 'diary_approach_later_v1';
const askedLater = () => { try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < 7 * 86400000; } catch { return false; } };
const askLater = () => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* не запомнили — спросим снова */ } };
import './diary.css';

const label = id => DIARY_MEALS.find(m => m.id === id)?.label || id;
const n = v => formatNumber(Math.round(Number(v || 0)));
const paramsOf = clientRow => clientRow ? { clientRow } : {};
const decimal = value => Number(String(value).replace(',', '.'));
const macroLine = t => `Б ${n(t.protein)} · Ж ${n(t.fat)} · У ${n(t.carbs)} г`;
// Подпись количества в строке еды: у примерной записи — «примерно», у ладони — порции рукой
const amountLabel = e => e.product.kind === 'quick' ? 'примерно' + (e.amount !== 1 ? ' · ×' + formatNumber(e.amount) : '') : e.product.kind === 'palm' ? formatNumber(e.amount) + ' ' + palmUnit(e.product.id, e.amount) + ' · примерно' : formatNumber(e.amount) + ' ' + unit(e.product);

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

// Карточка продукта (план трёх разборов, п. 3): проверен ли он, откуда цифры
// и честное «нет данных», если поля в источнике нет, — ноль не выдумываем.
const trustOf = p => p.approx ? { tone: 'approx', text: 'Примерно — без продукта' } : p.sourceType === 'usda' ? { tone: 'good', text: 'Справочные значения USDA' } : p.reviewStatus === 'verified' ? { tone: 'good', text: 'Проверено' } : p.kind === 'food' ? { tone: 'warn', text: 'Не проверено — сверьте с упаковкой' } : null;
const known = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
export function ProductFacts({ p }) {
  const trust = trustOf(p), per = p.unit === 'portion' ? 'в порции' : 'на ' + foodPer(p);
  const missing = ['kcal', 'protein', 'fat', 'carbs'].some(k => !known(p[k]));
  return <div className="diary-product">{trust && <span className={'diary-product__trust diary-product__trust--' + trust.tone}>{trust.tone === 'good' && <IconCheck size={14} />}{trust.text}</span>}<p className="diary-product__kcal"><strong>{known(p.kcal) ? formatNumber(Math.round(Number(p.kcal))) : 'нет данных'}</strong> <span>ккал {per}</span></p><dl className="diary-product__macros">{[['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([k, text]) => <div key={k}><dt>{text}</dt><dd className={known(p[k]) ? '' : 'is-missing'}>{known(p[k]) ? formatNumber(Math.round(Number(p[k]) * 10) / 10) + ' г' : 'нет данных'}</dd></div>)}</dl>{p.source && !p.approx && <p className="small muted diary-product__source">Источник: {p.source}</p>}{missing && <p className="small muted diary-product__source">«Нет данных» — этого поля нет в источнике. Ноль мы не придумываем.</p>}</div>;
}

// После потерянного ответа повторяем тот же requestId, а не новую операцию.
function useOperation() {
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
function Field({ label: text, value, onChange, error, ...rest }) {
  const errorId = useRef('field-error-' + requestId());
  if (!error) return <label className="field"><span className="field__label">{text}</span><input className="field__input" value={value} onChange={e => onChange(e.target.value)} {...rest} /></label>;
  // Ошибка — рядом с меткой, но не внутри неё: имя поля для читалки остаётся коротким
  return <div className="field field--bad"><label><span className="field__label">{text}</span><input className="field__input" value={value} onChange={e => onChange(e.target.value)} aria-invalid="true" aria-describedby={errorId.current} {...rest} /></label><span className="field__error" id={errorId.current} role="alert">{error}</span></div>;
}
const needsRetry = e => !!e && typeof e === 'object' && (isOffline(e) || e.code === 409);
function ErrorNote({ error }) { return error ? <Note tone="critical">{typeof error === 'string' ? error : error.message}{needsRetry(error) ? ' Обновите данные или повторите действие.' : ''}</Note> : null; }

// onRemove — удаление отдаётся родителю: он закрывает окно и показывает
// «Удалено · Вернуть», на сервер уходит через паузу (pendingDelete.jsx).
// Без onRemove (старые вызовы) — сразу на сервер, как раньше.
export function DiaryEntryForm({ product, entry, day = today(), meal = 'snack', amount: initialAmount, onClose, onSaved, onRemove }) {
  const p = entry?.product || product;
  const initial = useRef({ amount: String(entry?.amount || initialAmount || (p.unit === 'portion' ? 1 : 100)), meal: entry?.meal || meal, day: entry?.day || day });
  const [amount, setAmount] = useState(initial.current.amount);
  const [selectedMeal, setMeal] = useState(initial.current.meal), [date, setDate] = useState(initial.current.day);
  const [editWhen, setEditWhen] = useState(false);
  const [error, setError] = useState(null), [amountError, setAmountError] = useState(''), [busy, setBusy] = useState(false);
  const token = useRef({ signature: '', id: '' });
  const operation = useOperation();
  const preview = totalEntries([{ product: p, amount: Number.isFinite(decimal(amount)) ? decimal(amount) : 0 }]);
  const dirty = amount !== initial.current.amount || selectedMeal !== initial.current.meal || date !== initial.current.day;
  const submit = async e => {
    e.preventDefault(); const qty = decimal(amount);
    if (!Number.isFinite(qty) || qty <= 0 || qty > (p.unit === 'portion' ? 30 : 5000)) { setAmountError('Проверьте количество: ' + (p.unit === 'portion' ? 'от 0,01 до 30 порций.' : 'от 0,01 до 5000 ' + unit(p) + '.')); return; }
    const payload = { day: date, meal: selectedMeal, amount: qty, ...(entry ? { id: entry.id, revision: entry.revision } : { product: { kind: p.kind, id: p.id }, preview: p }) };
    const signature = JSON.stringify(payload);
    if (token.current.signature !== signature) token.current = { signature, id: requestId() };
    const params = { ...payload, requestId: token.current.id };
    setBusy(true); setError(null); setAmountError('');
    try { await apiMutate('diary.entry.save', params); haptic('success'); onSaved(); }
    catch (err) {
      if (!entry && isOffline(err)) {
        try { await queueWrite('diaryEntry', params); haptic('success'); onSaved('Сохранено на телефоне. Отправим при появлении связи.', 'info'); }
        catch (storageError) { setError(storageError); }
      } else setError(err);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (onRemove) { onRemove(entry); return; }
    setBusy(true); setError(null);
    try { await operation('diary.entry.remove', { id: entry.id, revision: entry.revision }); onSaved(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const amountField = p.unit === 'portion' ? 'Количество порций' : 'Количество, ' + unit(p);
  // Быстрые порции: стакан и банка у напитков, навески у еды
  const quick = p.unit === 'portion' ? [.5, 1, 1.5] : p.unit === 'ml' ? [200, 250, 330] : [100, 150, 200];
  return <Sheet title={entry ? 'Изменить запись' : 'Записать съеденное'} dirty={dirty} locked={busy} focus="#diary-amount" onClose={onClose}><form className="diary-form" onSubmit={submit}><h3>{foodTitle(p)}</h3><ProductFacts p={p} />{editWhen ? <><Field label="Дата" type="date" value={date} onChange={setDate} required min="2000-01-01" max="2099-12-31" /><label className="field"><span className="field__label">Приём пищи</span><select className="field__input" value={selectedMeal} onChange={e => setMeal(e.target.value)}>{DIARY_MEALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label></> : <button type="button" className="diary-when" aria-expanded="false" onClick={() => setEditWhen(true)}><span>{dayLabel(date)} · {label(selectedMeal)}</span><small>изменить</small></button>}<Field id="diary-amount" label={amountField} inputMode="decimal" value={amount} onChange={v => { setAmount(v); setAmountError(''); }} onFocus={e => e.target.select()} error={amountError} required /><div className="diary-inline-actions">{quick.map(q => <button className="chip" key={q} type="button" onClick={() => { setAmount(String(q)); setAmountError(''); }}>{formatNumber(q)} {unit(p)}</button>)}</div><div className="diary-portion-preview"><strong>{n(preview.kcal)} ккал</strong><div>{macroLine(preview)}</div></div><ErrorNote error={error} /><div className="diary-form-footer"><button className="button button--primary" disabled={busy} type="submit">{busy ? 'Сохраняю…' : 'Записать в дневник'}</button></div>{entry && <div className="diary-form-remove"><button type="button" className="button button--ghost" disabled={busy} onClick={remove}><IconTrash size={16} /> Удалить запись</button></div>}</form></Sheet>;
}

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

// «Свой продукт» открывается листом поверх списка: список остаётся со
// своим поиском и вкладкой, назад возвращает к нему.
function ProductPicker({ meal, onPick, onClose, onQuick, ingredientsOnly = false }) {
  const [scope, setScope] = useState('recent'), [query, setQuery] = useState(''), [q, setQ] = useState(''), [version, setVersion] = useState(0);
  const [error, setError] = useState(null), [busy, setBusy] = useState(''), [custom, setCustom] = useState(false);
  const op = useOperation();
  useEffect(() => { const t = setTimeout(() => setQ(query), 200); return () => clearTimeout(t); }, [query]);
  const resource = useDiaryResource('diary.catalog', { q, scope, refresh: version });
  const products = resource.data?.products || [];
  // Новичку «Недавние» пусты — сразу вся база, а не объяснение про сердечко (FT-646)
  const autoAll = useRef(false);
  useEffect(() => { if (!autoAll.current && scope === 'recent' && !q && resource.data && !resource.stale && !products.length) { autoAll.current = true; setScope('all'); } }, [scope, q, resource.data, resource.stale, products.length]);
  const toggle = async p => { setBusy(productKey(p)); setError(null); try { await op('diary.like', { kind: p.kind, id: p.id, liked: !p.liked }); haptic(); setVersion(v => v + 1); } catch (e) { setError(e); } finally { setBusy(''); } };
  return <Sheet title={ingredientsOnly ? 'Ингредиент рецепта' : 'Добавить еду · ' + label(meal)} dirty={!!query} onClose={onClose}><FoodScan onDraft={setCustom} onFound={onPick} /><Field label="Поиск продуктов и блюд" placeholder="Например, творог 5%" value={query} onChange={setQuery} /><div className="diary-tabs" aria-label="Источник продуктов">{[['recent', 'Недавние'], ['favorites', 'Любимые'], ['all', 'Все']].map(([id, name]) => <button className={'chip' + (scope === id ? ' chip--active' : '')} type="button" key={id} aria-pressed={scope === id} onClick={() => setScope(id)}>{name}</button>)}</div><ErrorNote error={error || resource.error} />{resource.loading ? <Loading lead={false} rows={2} /> : [['Продукты', ['food', 'ingredient']], ...(!ingredientsOnly ? [['Блюда', ['dish', 'recipe']]] : [])].map(([heading, kinds]) => { const list = products.filter(p => kinds.includes(p.kind)); return <section key={heading} aria-label={heading}><h3 className="diary-catalog-heading">{heading} · {list.length}</h3>{list.length ? list.map(p => <div className="diary-catalog-row" key={productKey(p)}><button className="diary-food-main" type="button" onClick={() => onPick(p)} aria-label={'Добавить ' + p.name}><strong>{foodTitle(p)}</strong><small>{n(p.kcal)} ккал / {foodPer(p)} · {p.source}</small></button><button className="diary-like" type="button" aria-label={(p.liked ? 'Убрать из любимых: ' : 'В любимые: ') + p.name} aria-pressed={!!p.liked} disabled={!!busy || p.kind === 'legacy'} onClick={() => toggle(p)}><IconHeart size={19} /></button></div>) : <p className="small muted">{scope === 'favorites' ? 'Здесь пока нет совпадений. Найдите продукт в общей базе и отметьте сердечком.' : scope === 'recent' && !q ? 'Здесь появится то, что вы уже записывали.' : 'Ничего не найдено.'}</p>}</section>; })}<div className="diary-picker-tools">{scope !== 'all' && <button className="button" type="button" onClick={() => setScope('all')}>Искать во всей базе</button>}<button className="button" type="button" onClick={() => setCustom(true)}><IconPlus size={16} /> Свой продукт</button>{onQuick && <button className="button" type="button" onClick={onQuick}>Только калории</button>}{resource.stale && <span className="small muted">Сохранённый список</span>}</div>{custom && <CustomProduct initialFields={typeof custom === 'object' ? custom : {}} onClose={() => setCustom(false)} onCreated={onPick} />}</Sheet>;
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

const recipeSignature = (name, output, ingredients) => JSON.stringify([name, output, ingredients.map(i => [i.product.kind, i.product.id, String(i.amount)])]);
// Ингредиент выбирается листом поверх рецепта: название и уже набранные
// строки никуда не деваются.
function RecipeEditor({ recipe, onClose, onSaved }) {
  const [name, setName] = useState(recipe?.name || ''), [output, setOutput] = useState(String(recipe?.outputGrams || '')), [ingredients, setIngredients] = useState(() => (recipe?.ingredients || []).map(i => ({ ...i, key: requestId() }))), [picker, setPicker] = useState(false), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const initial = useRef(recipeSignature(name, output, ingredients));
  const op = useOperation();
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await op('diary.recipe.save', { ...(recipe ? { id: recipe.id, revision: recipe.revision } : {}), name, outputGrams: output, ingredients: ingredients.map(i => ({ product: { kind: i.product.kind, id: i.product.id }, amount: i.amount })) }); haptic('success'); onSaved(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <Sheet title="Свой рецепт" dirty={recipeSignature(name, output, ingredients) !== initial.current} onClose={onClose}><form className="diary-form" onSubmit={submit}><Field label="Название блюда" value={name} onChange={setName} required maxLength={100} /><h3>Ингредиенты</h3>{ingredients.map(i => <div className="diary-ingredient" key={i.key}><span>{i.product.name}</span><input className="field__input" aria-label={(i.product.unit === 'ml' ? 'Миллилитры: ' : 'Граммы: ') + i.product.name} inputMode="decimal" value={i.amount} onChange={e => setIngredients(list => list.map(row => row.key === i.key ? { ...row, amount: e.target.value } : row))} /><button className="icon-button" type="button" aria-label={'Убрать: ' + i.product.name} onClick={() => setIngredients(list => list.filter(row => row.key !== i.key))}><IconClose size={17} /></button></div>)}<button className="button" type="button" onClick={() => setPicker(true)}><IconPlus size={16} /> Добавить ингредиент</button><Field label="Вес всего готового блюда, г" inputMode="decimal" value={output} onChange={setOutput} required /><p className="small muted">Взвесьте блюдо без посуды после приготовления. По этому выходу рассчитаются КБЖУ съеденной порции.</p><ErrorNote error={error} /><button className="button button--primary button--block" disabled={busy || !ingredients.length}>Сохранить в мои блюда</button></form>{picker && <ProductPicker ingredientsOnly onClose={() => setPicker(false)} onPick={p => { setIngredients(items => [...items, { product: p, amount: '100', key: requestId() }]); setPicker(false); }} />}</Sheet>;
}

function CopyDialog({ day, onClose, onSaved }) {
  const [from, setFrom] = useState(shiftDay(day, -1)), [fromMeal, setFromMeal] = useState(''), [toMeal, setToMeal] = useState(''), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const op = useOperation();
  const select = (text, value, change) => <label className="field"><span className="field__label">{text}</span><select className="field__input" value={value} onChange={e => change(e.target.value)}><option value="">Все приёмы</option>{DIARY_MEALS.map(m => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label>;
  const submit = async e => { e.preventDefault(); setBusy(true); setError(null); try { await op('diary.copy', { day, fromDay: from, fromMeal, toMeal }); haptic('success'); onSaved('Записи скопированы. Проверьте порции.'); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Sheet title="Повторить еду" dirty={from !== shiftDay(day, -1) || !!fromMeal || !!toMeal} onClose={onClose}><form className="diary-form" onSubmit={submit}><Field label="Из какого дня" type="date" value={from} onChange={setFrom} required />{select('Что скопировать', fromMeal, setFromMeal)}{select('Куда добавить', toMeal, setToMeal)}<p className="small muted">Записи добавятся к дню «{dayLabel(day)}». Уже внесённая еда останется. Вода и отметка полноты не копируются.</p><ErrorNote error={error} /><button className="button button--primary button--block" disabled={busy}>Скопировать записи</button></form></Sheet>;
}

function GoalEditor({ clientRow, targets, onClose, onSaved }) {
  const [values, setValues] = useState({ ...targets }), [from, setFrom] = useState(today()), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const initial = useRef(JSON.stringify([values, from]));
  const op = useOperation();
  const submit = async e => { e.preventDefault(); setBusy(true); setError(null); try { await op('diary.target.save', { clientRow, fromDay: from, targets: values }); haptic('success'); onSaved(); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Sheet title="Назначить цель питания" dirty={JSON.stringify([values, from]) !== initial.current} onClose={onClose}><form className="diary-form" onSubmit={submit}><Field label="Действует с" type="date" min={today()} value={from} onChange={setFrom} required /><div className="diary-goal-grid">{[['kcal', 'Калории'], ['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([k, text]) => <Field key={k} label={text} inputMode="decimal" value={values[k] ?? ''} onChange={v => setValues(old => ({ ...old, [k]: v }))} required />)}</div><p className="small muted">Новая цель действует с выбранной даты. Сохранённое прошлое не пересчитывается.</p><ErrorNote error={error} /><button className="button button--primary button--block" disabled={busy}>Сохранить цель</button></form></Sheet>;
}

// Завершение дня (FT-646): не галочка между приёмами, а итог — сколько
// съедено против нормы, БЖУ, вода и слово тренера; после — вибрация.
function FinishSheet({ data, totals, target, busy, onFinish, onClose }) {
  const verdict = dayVerdict(totals.kcal, Number(target.kcal || 0));
  return <Sheet title={'Итог дня · ' + dayLabel(data.day)} locked={busy} onClose={onClose}><div className="diary-finish"><p className="diary-finish__kcal"><strong>{n(totals.kcal)}</strong> <span>ккал{target.kcal ? ' из ' + n(target.kcal) : ''}</span></p><p className={'diary-finish__verdict diary-finish__verdict--' + verdict.tone}>{verdict.text}</p><dl className="diary-finish__facts">{[['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([k, text]) => <div key={k}><dt>{text}</dt><dd>{n(totals[k])}{target[k] ? ' из ' + n(target[k]) : ''} г</dd></div>)}<div><dt>Вода</dt><dd>{formatNumber(data.waterMl / 1000, 2)} л</dd></div><div><dt>Записей</dt><dd>{data.entries.length}</dd></div></dl>{data.comment ? <div className="diary-finish__coach"><small>От тренера</small><p>{data.comment}</p></div> : <p className="small muted">Завершённый день идёт в среднее за неделю, тренер видит итог.</p>}<div className="diary-form-footer"><button className="button button--primary" disabled={busy} onClick={onFinish}>{busy ? 'Сохраняю…' : 'Завершить день'}</button></div></div></Sheet>;
}
function DayFinish({ data, totals, target, readOnly, busy, onOpen, onReopen }) {
  const verdict = dayVerdict(totals.kcal, Number(target.kcal || 0));
  if (data.complete) return <Section><Panel pad><div className="diary-day-done"><div><strong>День завершён</strong><p className="small muted">{n(totals.kcal)}{target.kcal ? ' из ' + n(target.kcal) : ''} ккал · {verdict.tone === 'good' ? 'в норме' : verdict.tone === 'under' ? 'меньше нормы' : verdict.tone === 'over' ? 'больше нормы' : 'без нормы'}</p></div>{!readOnly && <button className="button button--ghost" disabled={busy} onClick={onReopen}>Дописать</button>}</div></Panel></Section>;
  if (readOnly) return <p className="small muted diary-day-open">Клиент ещё не завершил этот день.</p>;
  const pending = data.entries.some(e => e.pending);
  return <Section><Panel pad><div className="diary-day-done"><div><strong>Всё записали?</strong><p className="small muted">{data.entries.length ? pending ? 'Дождёмся отправки записей с телефона.' : 'Завершите день — увидите итог против нормы.' : 'Запишите еду — потом завершите день.'}</p></div><button className="button button--primary" disabled={busy || pending || !data.entries.length} onClick={onOpen}>Завершить день</button></div></Panel></Section>;
}

function Week({ clientRow, day }) {
  const resource = useDiaryResource('diary.week', { ...paramsOf(clientRow), day });
  if (resource.loading) return <Loading lead={false} rows={2} />;
  if (!resource.data) return <ErrorNote error={resource.error} />;
  const { days, fullDays, average, weights = [] } = resource.data, max = Math.max(1, ...days.map(d => d.totals.kcal));
  return <Section title="Последние семь дней" note={fullDays + ' полных из 7'}><Panel pad><div className="diary-week" role="img" aria-label="Калории по дням, с отметкой полноты">{days.map(d => <div key={d.day} className="diary-daybar" data-complete={d.complete}><span>{d.entries.length ? n(d.totals.kcal) : '—'}</span><div className="diary-daybar-track"><div className="diary-daybar-fill" style={{ height: (d.totals.kcal / max * 100) + '%' }} /></div><span>{d.day.slice(8)}.{d.day.slice(5, 7)}</span><span>{d.complete ? 'полный' : d.entries.length ? 'часть' : 'пусто'}</span></div>)}</div><p className="small muted">Насыщенные столбцы — полные дни. Частичные и пустые не входят в среднее.</p>{average ? <p className="small"><strong>Среднее за полные дни: {n(average.kcal)} ккал</strong><br />{macroLine(average)}</p> : <p className="small muted">Пока нет полностью заполненных дней для расчёта среднего.</p>}<h3>Вес и питание</h3>{weights.length ? <div className="diary-weight-list">{weights.map(w => { const d = days.find(d => d.day === w.day); return <p className="small" key={w.day}><strong>{w.day.slice(8)}.{w.day.slice(5, 7)} · {formatNumber(w.weight)} кг</strong> · {d?.complete ? n(d.totals.kcal) + ' ккал за полный день' : 'дневник за день неполный'}</p>; })}</div> : <p className="small muted">За эту неделю вес не записан. Добавьте замер в разделе «Прогресс».</p>}<p className="small muted">Вес меняется по многим причинам. Сравнивайте несколько недель; один день не показывает результат питания.</p></Panel></Section>;
}

// Четыре вкладки вместо шести (FT-642): «Подсказки» и «Норма и анкета»
// ушли в «Ещё», «План меню» — не вкладка, а действие в карточке итога.
const NAV = [{ value: 'diary', label: 'Дневник' }, { value: 'week', label: 'Неделя' }, { value: 'recipes', label: 'Рецепты' }, { value: 'more', label: 'Ещё' }];
const navOf = tab => NAV.some(t => t.value === tab) ? tab : 'more';

export default function NutritionDiary({ clientRow, readOnly = false, preview = false, targets: fallbackTargets, onPlan, activeTab, onTabChange, notice }) {
  const [day, setDay] = useState(today), [localTab, setLocalTab] = useState('diary'), [modal, setModal] = useState(null), [message, setMessage] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [writes, setWrites] = useState({ scope: '', rows: [] }), [comment, setComment] = useState('');
  const tab = activeTab ?? localTab;
  // Успех — зелёной плашкой; «сохранено на телефоне» — обычной, это ещё не итог.
  const say = (text, tone = 'good') => setMessage(text ? { text, tone } : null);
  const chooseTab = next => { setLocalTab(next); setMessage(null); setError(null); onTabChange?.(next); };
  const op = useOperation(), scope = offlineAccount(), canCoach = readOnly && !preview;
  const resource = useDiaryResource('diary.get', { ...paramsOf(clientRow), day });
  const recipeResource = useDiaryResource('diary.catalog', { ...paramsOf(clientRow), scope: 'all', q: '' });
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [approachOpen, setApproachOpen] = useState(false), [later, setLater] = useState(askedLater);
  const fallback = { day, entries: [], totals: totalEntries([]), targets: fallbackTargets, complete: false, waterMl: 0, comment: '', revision: 0 };
  const data = useMemo(() => withPending(resource.data || fallback, readOnly || writes.scope !== scope ? [] : writes.rows), [resource.data, writes, day, readOnly, scope, fallbackTargets]);
  useEffect(() => { setModal(null); setError(null); setMessage(null); }, [clientRow, scope]);
  useEffect(() => { setComment(resource.data?.comment || ''); }, [resource.data?.comment, day, clientRow]);
  useEffect(() => {
    let alive = true;
    const load = () => { if (readOnly) return; localWrites(undefined, 'diaryEntry').then(rows => { if (alive) { setWrites({ scope, rows }); resource.reload(); } }); };
    load(); const unsubscribe = onWritesChange(load);
    return () => { alive = false; unsubscribe(); };
  }, [readOnly, scope]);
  const refresh = (msg, tone) => { setModal(null); say(typeof msg === 'string' ? msg : 'Порция записана', tone); resource.reload(); recipeResource.reload(); setCatalogVersion(v => v + 1); };
  // Удаление записи — без вопроса «Точно?»: строка исчезает, внизу «Удалено ·
  // Вернуть», на сервер уходит через паузу. Местная (ещё не отправленная)
  // запись той же дорогой убирается из очереди.
  const del = usePendingDelete(e => e.pending ? dropWrite(undefined, 'diaryEntry', e.params) : op('diary.entry.remove', { id: e.id, revision: e.revision }), { onDone: () => resource.reload(), onError: setError });
  const removeEntry = entry => { setModal(null); setError(null); setMessage(null); del.remove(entry.id, entry, 'Запись удалена'); };
  const updateDay = async (patch, done = 'Сохранено.') => { setBusy(true); setError(null); try { await op('diary.day.save', { ...paramsOf(clientRow), day, revision: data.revision, ...patch }); resource.reload(); say(done); return true; } catch (e) { setError(e); resource.reload(); return false; } finally { setBusy(false); } };
  const chooseDate = value => { if (value && /^20\d{2}-\d{2}-\d{2}$/.test(value)) { setDay(value); setModal(null); setMessage(null); setError(null); } };
  const shown = data.entries.filter(e => !del.hidden(e.id));
  const totals = shown.length === data.entries.length ? data.totals : totalEntries(shown);
  const target = resource.data ? data.targets || {} : fallbackTargets || {}, remaining = Number(target.kcal || 0) - totals.kcal;
  const recipeRows = (recipeResource.data?.products || []).filter(p => ['dish', 'recipe'].includes(p.kind));
  const approxKcal = totalEntries(shown.filter(e => e.product.approx)).kcal;
  // Как человек считает еду (п. 8). Старый сервер настроек не знает — граммы, без вопроса
  const settings = resource.data?.settings || { mode: 'count', meals: null, chosen: true };
  const palm = settings.mode === 'palm';
  const askApproach = !readOnly && tab === 'diary' && (approachOpen || (!!resource.data && !settings.chosen && !later));
  const saveMode = async mode => { setBusy(true); setError(null); try { await op('diary.settings.save', { mode }); setApproachOpen(false); resource.reload(); say(mode === 'palm' ? 'Режим «Ладонь»: отмечайте порции рукой.' : 'Режим подсчёта в граммах.'); } catch (e) { setError(e); } finally { setBusy(false); } };
  const add = meal => { setError(null); setModal({ type: palm ? 'palm' : 'pick', meal }); };
  const openEntry = entry => { if (readOnly || entry.pending) return; setModal({ type: 'entry', entry }); };
  const modalView = () => {
    if (!modal) return null;
    if (modal.type === 'pick') return <ProductPicker key={catalogVersion} meal={modal.meal} onClose={() => setModal(null)} onQuick={() => setModal({ type: 'quick', meal: modal.meal })} onPick={p => setModal({ type: 'entry', product: p, meal: modal.meal })} />;
    if (modal.type === 'palm') return <PalmSheet day={day} meal={modal.meal} onClose={() => setModal(null)} onSaved={refresh} onGrams={() => setModal({ type: 'pick', meal: modal.meal })} />;
    if (modal.type === 'quick') return <QuickEntry day={day} meal={modal.meal} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'entry') return <DiaryEntryForm {...modal} day={day} onClose={() => setModal(null)} onSaved={refresh} onRemove={removeEntry} />;
    if (modal.type === 'finish') return <FinishSheet data={data} totals={totals} target={target} busy={busy} onClose={() => setModal(null)} onFinish={async () => { if (await updateDay({ complete: true }, 'День завершён.')) { haptic('success'); setModal(null); } }} />;
    if (modal.type === 'copy') return <CopyDialog day={day} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'recipe') return <RecipeEditor recipe={modal.recipe} onClose={() => setModal(null)} onSaved={() => refresh('Рецепт сохранён.')} />;
    if (modal.type === 'goal') return <GoalEditor clientRow={clientRow} targets={target} onClose={() => setModal(null)} onSaved={() => refresh('Цель сохранена.')} />;
    if (modal.type === 'lesson') { const a = DIARY_LESSONS.find(a => a.id === modal.id); return <Sheet title={a.title} onClose={() => setModal(null)}>{a.paragraphs.map(p => <p key={p} className="small">{p}</p>)}</Sheet>; }
    return null;
  };
  const planButton = () => {
    if (readOnly || !onPlan) return null;
    if (!target.kcal) return <div className="diary-plan-row"><button className="button" disabled aria-describedby="diary-plan-why">Что приготовить на остаток</button><p className="small muted" id="diary-plan-why">Подбор блюд считает остаток от цели по калориям. Цель появится после анкеты или её назначит тренер.</p></div>;
    return <div className="diary-plan-row"><button className="button" onClick={() => onPlan({ day, totals, targets: target })}>{remaining > 0 ? 'Что приготовить на остаток' : 'Подобрать блюда'}</button></div>;
  };
  const foodRow = e => <SwipeRow key={e.id} className="diary-food-swipe" contentClassName="diary-foodrow" label={'Удалить: ' + e.product.name} disabled={readOnly} onDelete={() => removeEntry(e)}><button type="button" className="diary-food-main" disabled={readOnly || e.pending} onClick={() => openEntry(e)} aria-label={'Изменить: ' + e.product.name}><strong>{e.product.name}</strong><small>{amountLabel(e)}{e.pending ? e.error ? ' · нужна проверка' : ' · на телефоне, ждёт отправки' : ''}</small>{e.error && <small role="alert">{e.error}</small>}</button><span className="diary-food-cal">{e.product.approx ? '≈ ' : ''}{n(totalEntries([e]).kcal)} ккал</span>{e.pending && <button className="icon-button" aria-label={'Убрать локальную запись: ' + e.product.name} onClick={() => removeEntry(e)}><IconTrash size={16} /></button>}</SwipeRow>;
  return <div className="nutrition-diary" data-testid="nutrition-diary"><Chips variant="nav" label="Питание" items={NAV} value={navOf(tab)} onChange={chooseTab} />{tab === 'diary' && <div className="diary-toolbar"><div className="diary-date"><button className="icon-button" aria-label="Предыдущий день" onClick={() => chooseDate(shiftDay(day, -1))}><IconChevron size={18} style={{ transform: 'rotate(90deg)' }} /></button><label className="diary-date__pick"><span className="diary-date__text" aria-hidden="true">{dayLabel(day)}</span><input type="date" aria-label="Дата дневника" min="2000-01-01" max="2099-12-31" value={day} onChange={e => chooseDate(e.target.value)} /></label><button className="icon-button" aria-label="Следующий день" onClick={() => chooseDate(shiftDay(day, 1))}><IconChevron size={18} style={{ transform: 'rotate(-90deg)' }} /></button></div></div>}{message && <div role="status"><Note tone={message.tone}>{message.text}</Note></div>}<ErrorNote error={error} />{tab === 'diary' && notice}{askApproach && <Approach current={settings.chosen ? settings.mode : null} busy={busy} onChoose={saveMode} onCancel={() => { askLater(); setLater(true); setApproachOpen(false); }} />}{resource.error && <Note tone="warning">{resource.data ? 'Показаны сохранённые данные. ' : ''}{resource.error.message} <button type="button" className="button button--ghost" onClick={resource.reload}>Повторить загрузку</button></Note>}{tab === 'diary' && <>{resource.loading && !resource.data ? <Loading rows={2} /> : <><Section><Panel pad>{palm ? <><PalmSummary entries={shown} targets={target} /><p className="small palm-mode-line"><span>Съедено ≈ {n(totals.kcal)} ккал{target.kcal ? ' из ' + n(target.kcal) : ''}</span>{!readOnly && <button type="button" className="button button--ghost" onClick={() => setApproachOpen(true)}>Режим</button>}</p></> : <div className="diary-summary"><div className="diary-ring" style={{ '--diary-progress': target.kcal > 0 ? Math.min(100, totals.kcal / target.kcal * 100) : 0 }}><div className="diary-ring-inner"><strong>{n(totals.kcal)}</strong><small>ккал съедено</small></div></div><div><strong>{target.kcal ? remaining >= 0 ? 'Осталось ' + n(remaining) + ' ккал' : 'Выше цели на ' + n(-remaining) + ' ккал' : 'Цель ещё не назначена'}</strong><div className="diary-macros">{[['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([k, text]) => <div key={k}><small>{text}</small><strong>{n(totals[k])} / {target[k] ? n(target[k]) : '—'} г</strong><div className="diary-track"><span style={{ width: (target[k] > 0 ? Math.min(100, totals[k] / target[k] * 100) : 0) + '%' }} /></div></div>)}</div><p className="small muted">Цель на выбранный день: {target.kcal ? n(target.kcal) + ' ккал' : '—'}{approxKcal > 0 ? ' · из съеденного примерно ' + n(approxKcal) + ' ккал' : ''}</p>{canCoach && <button className="button" onClick={() => setModal({ type: 'goal' })}>Назначить цель</button>}</div></div>}{palm && canCoach && <button className="button" onClick={() => setModal({ type: 'goal' })}>Назначить цель</button>}{planButton()}</Panel></Section>{data.hasLegacy && <Note tone="info">Ранее добавленное «Своё» перенесено в перекусы. Эти записи могли быть неполными — проверьте день.</Note>}{DIARY_MEALS.map(m => { const list = shown.filter(e => e.meal === m.id); return <Section key={m.id}><Panel><div className="diary-meal-head"><h3>{m.label}</h3><span className="small muted">{n(totalEntries(list).kcal)} ккал</span>{!readOnly && <button className="icon-button" aria-label={'Добавить в ' + m.label.toLowerCase()} onClick={() => add(m.id)}><IconPlus size={17} /></button>}</div>{list.length ? list.map(foodRow) : <div className="diary-empty">Пока нет записей.</div>}</Panel></Section>; })}{!readOnly && <div className="diary-foot-actions"><button className="button" onClick={() => setModal({ type: 'copy' })}><IconCopy size={16} /> Повторить еду</button></div>}<Section title="Вода"><Panel pad><div className="diary-water"><strong>{formatNumber(data.waterMl / 1000, 2)} л выпито</strong>{!readOnly && <div className="diary-inline-actions"><button className="button" disabled={busy} onClick={() => { haptic(); updateDay({ waterDelta: 250 }); }}>+ 250 мл</button><button className="button" disabled={busy || data.waterMl < 250} aria-label="Убрать 250 мл воды" onClick={() => { haptic(); updateDay({ waterDelta: -250 }); }}>−</button></div>}</div></Panel></Section><Section title={canCoach ? 'Комментарий клиенту' : 'От тренера'}><Panel pad>{canCoach ? <><label className="field"><span className="field__label">Комментарий к выбранному дню</span><textarea className="field__input" value={comment} maxLength={1500} rows={3} onChange={e => setComment(e.target.value)} /></label><button className="button button--primary" disabled={busy} onClick={() => updateDay({ comment })}>Сохранить комментарий</button></> : <p className="small" style={{ margin: 0 }}>{data.comment || 'Здесь появится комментарий тренера к этому дню.'}</p>}</Panel></Section><DayFinish data={data} totals={totals} target={target} readOnly={readOnly} busy={busy} onOpen={() => { setError(null); setModal({ type: 'finish' }); }} onReopen={() => updateDay({ complete: false }, 'День открыт — можно дописать.')} />{!readOnly && <div className="diary-addbar"><button className="button button--primary" onClick={() => add(day === today() ? mealNow() : 'snack')}><IconPlus size={18} /> {palm ? 'Отметить порции' : 'Добавить еду'}</button></div>}</>}</>}{tab === 'week' && <Week clientRow={clientRow} day={day} />}{tab === 'recipes' && <Section title="Блюда и рецепты"><Panel pad>{!readOnly && <button className="button button--primary" onClick={() => setModal({ type: 'recipe' })}><IconPlus size={16} /> Свой рецепт</button>}<p className="small muted">Блюда тренера — порциями. Свои рецепты с измеренным выходом — граммами.</p><ErrorNote error={recipeResource.error} />{recipeResource.loading ? <Loading lead={false} rows={2} /> : recipeRows.map(p => <div className="diary-catalog-row" key={productKey(p)}><div className="diary-food-main"><strong>{foodTitle(p)}</strong><small>{n(p.kcal)} ккал / {foodPer(p)}</small></div>{!readOnly && <div className="diary-inline-actions">{p.kind === 'recipe' && <button className="button button--ghost" aria-label={'Изменить рецепт: ' + p.name} onClick={() => setModal({ type: 'recipe', recipe: p })}>Изменить</button>}<button className="button" onClick={() => setModal({ type: 'entry', product: p, meal: 'snack' })}>Добавить</button></div>}</div>)}</Panel></Section>}{(tab === 'more' || tab === 'learn') && <>{onTabChange && <Section><Panel><button type="button" className="diary-more" aria-label="Норма и анкета" onClick={() => chooseTab('settings')}><strong>Норма и анкета</strong><small>Расчёт калорий по анкете, цель на день</small></button></Panel></Section>}{!readOnly && <Section><Panel><button type="button" className="diary-more" onClick={() => { chooseTab('diary'); setApproachOpen(true); }}><strong>Как считать еду</strong><small>{palm ? 'Сейчас: ладонью — порции без граммов' : 'Сейчас: граммы и продукты'}</small></button></Panel></Section>}<Section title="Разобраться за пару минут"><Panel>{DIARY_LESSONS.map(a => <button type="button" className="diary-lesson" key={a.id} onClick={() => setModal({ type: 'lesson', id: a.id })}><strong>{a.title}</strong><small>{a.time}</small></button>)}</Panel></Section></>}{tab === 'settings' && <p className="small"><button type="button" className="button button--ghost" onClick={() => chooseTab('more')}>← Ещё</button></p>}{modalView()}{del.bar}</div>;
}
