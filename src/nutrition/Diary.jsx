import React, { useState, useEffect, useRef, useMemo } from 'react';
import { apiStale, apiMutate } from '../api.js';
import { Section, Panel, Note, Loading, formatNumber } from '../ui.jsx';
import { IconPlus, IconClose, IconHeart, IconCopy, IconTrash, IconChevron, IconNutrition } from '../icons.jsx';
import { useBackGesture } from '../gestures.jsx';
import { localWrites, onWritesChange, queueWrite, isOffline, dropWrite } from '../offline-writes.js';
import { offlineAccount } from '../offline-account.js';
import { DIARY_MEALS, NUTRIENTS, today, shiftDay, requestId, totalEntries, withPending, productKey } from './diary-model.js';
import { DIARY_LESSONS } from './diary-lessons.js';
import './diary.css';

const label = id => DIARY_MEALS.find(m => m.id === id)?.label || id;
const unit = p => p.unit === 'portion' ? 'порц.' : 'г';
const n = v => formatNumber(Math.round(Number(v || 0)));
const paramsOf = clientRow => clientRow ? { clientRow } : {};
const decimal = value => Number(String(value).replace(',', '.'));
const macroLine = t => `Б ${n(t.protein)} · Ж ${n(t.fat)} · У ${n(t.carbs)} г`;

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

function Dialog({ title, onClose, children }) {
  const ref = useRef(null), titleId = useRef('diary-dialog-' + requestId()), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useBackGesture(onClose, true, null, { swipe: false });
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    const key = event => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || [])];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="diary-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section className="diary-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId.current} ref={ref}><div className="diary-dialog-head"><h2 id={titleId.current}>{title}</h2><button className="button button--icon" type="button" onClick={onClose} aria-label="Закрыть"><IconClose size={20} /></button></div>{children}</section></div>;
}

function Field({ label: text, value, onChange, ...rest }) {
  return <label className="field"><span className="field__label">{text}</span><input className="field__input" value={value} onChange={e => onChange(e.target.value)} {...rest} /></label>;
}
function ErrorNote({ error }) { return error ? <Note tone="critical">{typeof error === 'string' ? error : error.message} Обновите данные или повторите действие.</Note> : null; }

export function DiaryEntryForm({ product, entry, day = today(), meal = 'snack', amount: initialAmount, onClose, onSaved }) {
  const p = entry?.product || product;
  const [amount, setAmount] = useState(String(entry?.amount || initialAmount || (p.unit === 'portion' ? 1 : 100)));
  const [selectedMeal, setMeal] = useState(entry?.meal || meal), [date, setDate] = useState(entry?.day || day);
  const [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const token = useRef({ signature: '', id: '' });
  const operation = useOperation();
  const preview = totalEntries([{ product: p, amount: Number.isFinite(decimal(amount)) ? decimal(amount) : 0 }]);
  const submit = async e => {
    e.preventDefault(); const qty = decimal(amount);
    if (!Number.isFinite(qty) || qty <= 0 || qty > (p.unit === 'portion' ? 30 : 5000)) { setError('Проверьте количество: ' + (p.unit === 'portion' ? 'от 0,01 до 30 порций.' : 'от 0,01 до 5000 г.')); return; }
    const payload = { day: date, meal: selectedMeal, amount: qty, ...(entry ? { id: entry.id, revision: entry.revision } : { product: { kind: p.kind, id: p.id }, preview: p }) };
    const signature = JSON.stringify(payload);
    if (token.current.signature !== signature) token.current = { signature, id: requestId() };
    const params = { ...payload, requestId: token.current.id };
    setBusy(true); setError(null);
    try { await apiMutate('diary.entry.save', params); onSaved(); }
    catch (err) {
      if (!entry && isOffline(err)) {
        try { await queueWrite('diaryEntry', params); onSaved('Сохранено на телефоне. Отправим при появлении связи.'); }
        catch (storageError) { setError(storageError); }
      } else setError(err);
    } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); setError(null); try { await operation('diary.entry.remove', { id: entry.id, revision: entry.revision }); onSaved(); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Dialog title={entry ? 'Изменить запись' : 'Записать съеденное'} onClose={busy ? () => {} : onClose}><form onSubmit={submit}><h3>{p.name}</h3><p className="small muted">{p.source}</p><Field label="Дата" type="date" value={date} onChange={setDate} required min="2000-01-01" max="2099-12-31" /><label className="field"><span className="field__label">Приём пищи</span><select className="field__input" value={selectedMeal} onChange={e => setMeal(e.target.value)}>{DIARY_MEALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label><Field label={p.unit === 'portion' ? 'Количество порций' : 'Количество, г'} inputMode="decimal" value={amount} onChange={setAmount} required /><div className="diary-inline-actions">{(p.unit === 'portion' ? [.5, 1, 1.5] : [100, 150, 200]).map(q => <button className="chip" key={q} type="button" onClick={() => setAmount(String(q))}>{formatNumber(q)} {unit(p)}</button>)}</div><div className="diary-portion-preview"><strong>{n(preview.kcal)} ккал</strong><div>{macroLine(preview)}</div></div><ErrorNote error={error} /><div className="diary-dialog-footer"><button className="button button--primary" disabled={busy} type="submit">{busy ? 'Сохраняю…' : 'Записать в дневник'}</button>{entry && <button type="button" className="button" disabled={busy} onClick={remove}><IconTrash size={16} /> Удалить</button>}</div></form></Dialog>;
}

function ProductPicker({ meal, onPick, onClose, ingredientsOnly = false }) {
  const [scope, setScope] = useState('favorites'), [query, setQuery] = useState(''), [q, setQ] = useState(''), [version, setVersion] = useState(0);
  const [error, setError] = useState(null), [busy, setBusy] = useState(''), [custom, setCustom] = useState(false);
  const op = useOperation();
  useEffect(() => { const t = setTimeout(() => setQ(query), 200); return () => clearTimeout(t); }, [query]);
  const resource = useDiaryResource('diary.catalog', { q, scope, refresh: version });
  const products = resource.data?.products || [];
  const toggle = async p => { setBusy(productKey(p)); setError(null); try { await op('diary.like', { kind: p.kind, id: p.id, liked: !p.liked }); setVersion(v => v + 1); } catch (e) { setError(e); } finally { setBusy(''); } };
  if (custom) return <CustomProduct onClose={() => setCustom(false)} onCreated={onPick} />;
  return <Dialog title={ingredientsOnly ? 'Ингредиент рецепта' : 'Добавить еду · ' + label(meal)} onClose={onClose}><Field label="Поиск продуктов и блюд" placeholder="Название, бренд или жирность" value={query} onChange={setQuery} /><div className="diary-tabs" aria-label="Источник продуктов">{[['favorites', 'Любимые'], ['recent', 'Недавние'], ['all', 'Все']].map(([id, name]) => <button className={'chip' + (scope === id ? ' chip--active' : '')} type="button" key={id} aria-pressed={scope === id} onClick={() => setScope(id)}>{name}</button>)}</div><ErrorNote error={error || resource.error} />{resource.loading ? <Loading lead={false} rows={2} /> : [['Продукты', ['food', 'ingredient']], ...(!ingredientsOnly ? [['Блюда', ['dish', 'recipe']]] : [])].map(([heading, kinds]) => { const list = products.filter(p => kinds.includes(p.kind)); return <section key={heading} aria-label={heading}><h3 className="diary-catalog-heading">{heading} · {list.length}</h3>{list.length ? list.map(p => <div className="diary-catalog-row" key={productKey(p)}><button className="diary-food-main" type="button" onClick={() => onPick(p)} aria-label={'Добавить ' + p.name}><strong>{p.name}</strong><small>{n(p.kcal)} ккал / {p.unit === 'portion' ? 'порция' : '100 г'} · {p.source}</small></button><button className="diary-like" type="button" aria-label={(p.liked ? 'Убрать из любимых: ' : 'В любимые: ') + p.name} aria-pressed={!!p.liked} disabled={!!busy || p.kind === 'legacy'} onClick={() => toggle(p)}><IconHeart size={19} /></button></div>) : <p className="small muted">{scope === 'favorites' ? 'Пока пусто. Отмечайте сердечком продукты и блюда в разделе «Все».' : 'Ничего не найдено.'}</p>}</section>; })}<div className="diary-picker-tools"><button className="button" type="button" onClick={() => setCustom(true)}><IconPlus size={16} /> Свой продукт</button>{resource.stale && <span className="small muted">Сохранённый список</span>}</div></Dialog>;
}

function CustomProduct({ onCreated, onClose }) {
  const [fields, setFields] = useState({ name: '', kcal: '', protein: '', fat: '', carbs: '' }), [error, setError] = useState(null), [busy, setBusy] = useState(false), [existing, setExisting] = useState(null);
  const set = k => v => { setFields(f => ({ ...f, [k]: v })); setExisting(null); };
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await apiMutate('food.add', fields);
      const p = { ...r.food, kind: 'food', unit: 'g', source: 'Данные с этикетки · добавлено пользователем' };
      if (r.existed) setExisting(p); else onCreated(p);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <Dialog title="Продукт с этикетки" onClose={onClose}><form onSubmit={submit}><p className="small muted">Все значения на 100 г. Добавьте в название бренд и жирность, чтобы отличать похожие продукты. Карточка пополнит общий справочник без вашего имени. Личные данные и сведения о здоровье в название не вписывайте.</p><Field label="Название, бренд, жирность" value={fields.name} onChange={set('name')} maxLength={60} required /><div className="diary-goal-grid">{[['kcal', 'Ккал'], ['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([k, text]) => <Field key={k} label={text} value={fields[k]} onChange={set(k)} inputMode="decimal" required />)}</div><ErrorNote error={error} />{existing && <Note tone="info">Продукт с таким названием уже есть: {n(existing.kcal)} ккал, {macroLine(existing)} на 100 г. Проверьте цифры. Если ваш отличается, уточните название.</Note>}<div className="diary-dialog-footer"><button className="button button--primary" disabled={busy}>Создать продукт</button>{existing && <button className="button" type="button" onClick={() => onCreated(existing)}>Использовать найденный</button>}</div></form></Dialog>;
}

function RecipeEditor({ recipe, onClose, onSaved }) {
  const [name, setName] = useState(recipe?.name || ''), [output, setOutput] = useState(String(recipe?.outputGrams || '')), [ingredients, setIngredients] = useState(() => (recipe?.ingredients || []).map(i => ({ ...i, key: requestId() }))), [picker, setPicker] = useState(false), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const op = useOperation();
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await op('diary.recipe.save', { ...(recipe ? { id: recipe.id, revision: recipe.revision } : {}), name, outputGrams: output, ingredients: ingredients.map(i => ({ product: { kind: i.product.kind, id: i.product.id }, amount: i.amount })) }); onSaved(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  if (picker) return <ProductPicker ingredientsOnly onClose={() => setPicker(false)} onPick={p => { setIngredients(items => [...items, { product: p, amount: '100', key: requestId() }]); setPicker(false); }} />;
  return <Dialog title="Свой рецепт" onClose={onClose}><form onSubmit={submit}><Field label="Название блюда" value={name} onChange={setName} required maxLength={100} /><h3>Ингредиенты</h3>{ingredients.map(i => <div className="diary-ingredient" key={i.key}><span>{i.product.name}</span><input className="field__input" aria-label={'Граммы: ' + i.product.name} inputMode="decimal" value={i.amount} onChange={e => setIngredients(list => list.map(row => row.key === i.key ? { ...row, amount: e.target.value } : row))} /><button className="button button--icon" type="button" aria-label={'Убрать: ' + i.product.name} onClick={() => setIngredients(list => list.filter(row => row.key !== i.key))}><IconClose size={17} /></button></div>)}<button className="button" type="button" onClick={() => setPicker(true)}><IconPlus size={16} /> Добавить ингредиент</button><Field label="Вес всего готового блюда, г" inputMode="decimal" value={output} onChange={setOutput} required /><p className="small muted">Взвесьте блюдо без посуды после приготовления. По этому выходу рассчитаются КБЖУ съеденной порции.</p><ErrorNote error={error} /><button className="button button--primary button--block" disabled={busy || !ingredients.length}>Сохранить в мои блюда</button></form></Dialog>;
}

function CopyDialog({ day, onClose, onSaved }) {
  const [from, setFrom] = useState(shiftDay(day, -1)), [fromMeal, setFromMeal] = useState(''), [toMeal, setToMeal] = useState(''), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const op = useOperation();
  const select = (text, value, change) => <label className="field"><span className="field__label">{text}</span><select className="field__input" value={value} onChange={e => change(e.target.value)}><option value="">Все приёмы</option>{DIARY_MEALS.map(m => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label>;
  const submit = async e => { e.preventDefault(); setBusy(true); setError(null); try { await op('diary.copy', { day, fromDay: from, fromMeal, toMeal }); onSaved('Записи скопированы. Проверьте порции.'); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Dialog title="Повторить еду" onClose={onClose}><form onSubmit={submit}><Field label="Из какого дня" type="date" value={from} onChange={setFrom} required />{select('Что скопировать', fromMeal, setFromMeal)}{select('Куда добавить', toMeal, setToMeal)}<p className="small muted">Записи добавятся к {day}. Уже внесённая еда останется. Вода и отметка полноты не копируются.</p><ErrorNote error={error} /><button className="button button--primary button--block" disabled={busy}>Скопировать записи</button></form></Dialog>;
}

function GoalEditor({ clientRow, targets, onClose, onSaved }) {
  const [values, setValues] = useState({ ...targets }), [from, setFrom] = useState(today()), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const op = useOperation();
  const submit = async e => { e.preventDefault(); setBusy(true); setError(null); try { await op('diary.target.save', { clientRow, fromDay: from, targets: values }); onSaved(); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Dialog title="Назначить цель питания" onClose={onClose}><form onSubmit={submit}><Field label="Действует с" type="date" min={today()} value={from} onChange={setFrom} required /><div className="diary-goal-grid">{[['kcal', 'Калории'], ['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([k, text]) => <Field key={k} label={text} inputMode="decimal" value={values[k] ?? ''} onChange={v => setValues(old => ({ ...old, [k]: v }))} required />)}</div><p className="small muted">Новая цель действует с выбранной даты. Сохранённое прошлое не пересчитывается.</p><ErrorNote error={error} /><button className="button button--primary button--block" disabled={busy}>Сохранить цель</button></form></Dialog>;
}

function Week({ clientRow, day }) {
  const resource = useDiaryResource('diary.week', { ...paramsOf(clientRow), day });
  if (resource.loading) return <Loading lead={false} rows={2} />;
  if (!resource.data) return <ErrorNote error={resource.error} />;
  const { days, fullDays, average, weights = [] } = resource.data, max = Math.max(1, ...days.map(d => d.totals.kcal));
  return <Section title="Последние семь дней" note={fullDays + ' полных из 7'}><Panel pad><div className="diary-week" role="img" aria-label="Калории по дням, с отметкой полноты">{days.map(d => <div key={d.day} className="diary-daybar" data-complete={d.complete}><span>{d.entries.length ? n(d.totals.kcal) : '—'}</span><div className="diary-daybar-track"><div className="diary-daybar-fill" style={{ height: (d.totals.kcal / max * 100) + '%' }} /></div><span>{d.day.slice(8)}.{d.day.slice(5, 7)}</span><span>{d.complete ? 'полный' : d.entries.length ? 'часть' : 'пусто'}</span></div>)}</div><p className="small muted">Насыщенные столбцы — полные дни. Частичные и пустые не входят в среднее.</p>{average ? <p className="small"><strong>Среднее за полные дни: {n(average.kcal)} ккал</strong><br />{macroLine(average)}</p> : <p className="small muted">Пока нет полностью заполненных дней для расчёта среднего.</p>}<h3>Вес и питание</h3>{weights.length ? <div className="diary-weight-list">{weights.map(w => { const d = days.find(d => d.day === w.day); return <p className="small" key={w.day}><strong>{w.day.slice(8)}.{w.day.slice(5, 7)} · {formatNumber(w.weight)} кг</strong> · {d?.complete ? n(d.totals.kcal) + ' ккал за полный день' : 'дневник за день неполный'}</p>; })}</div> : <p className="small muted">За эту неделю вес не записан. Добавьте замер в разделе «Прогресс».</p>}<p className="small muted">Вес меняется по многим причинам. Сравнивайте несколько недель; один день не показывает результат питания.</p></Panel></Section>;
}

export default function NutritionDiary({ clientRow, readOnly = false, preview = false, targets: fallbackTargets, onPlan }) {
  const [day, setDay] = useState(today), [tab, setTab] = useState('diary'), [modal, setModal] = useState(null), [message, setMessage] = useState(''), [error, setError] = useState(null), [busy, setBusy] = useState(false), [writes, setWrites] = useState({ scope: '', rows: [] }), [comment, setComment] = useState('');
  const op = useOperation(), scope = offlineAccount(), canCoach = readOnly && !preview;
  const resource = useDiaryResource('diary.get', { ...paramsOf(clientRow), day });
  const recipeResource = useDiaryResource('diary.catalog', { ...paramsOf(clientRow), scope: 'all', q: '' });
  const [catalogVersion, setCatalogVersion] = useState(0);
  const fallback = { day, entries: [], totals: totalEntries([]), targets: fallbackTargets, complete: false, waterMl: 0, comment: '', revision: 0 };
  const data = useMemo(() => withPending(resource.data || fallback, readOnly || writes.scope !== scope ? [] : writes.rows), [resource.data, writes, day, readOnly, scope, fallbackTargets]);
  useEffect(() => { setModal(null); setError(null); setMessage(''); }, [clientRow, scope]);
  useEffect(() => { setComment(resource.data?.comment || ''); }, [resource.data?.comment, day, clientRow]);
  useEffect(() => {
    let alive = true;
    const load = () => { if (readOnly) return; localWrites(undefined, 'diaryEntry').then(rows => { if (alive) { setWrites({ scope, rows }); resource.reload(); } }); };
    load(); const unsubscribe = onWritesChange(load);
    return () => { alive = false; unsubscribe(); };
  }, [readOnly, scope]);
  const refresh = msg => { setModal(null); setMessage(typeof msg === 'string' ? msg : 'Запись сохранена.'); resource.reload(); recipeResource.reload(); setCatalogVersion(v => v + 1); };
  const updateDay = async patch => { setBusy(true); setError(null); try { await op('diary.day.save', { ...paramsOf(clientRow), day, revision: data.revision, ...patch }); resource.reload(); setMessage('Сохранено.'); } catch (e) { setError(e); resource.reload(); } finally { setBusy(false); } };
  const chooseDate = value => { if (value && /^20\d{2}-\d{2}-\d{2}$/.test(value)) { setDay(value); setModal(null); setMessage(''); setError(null); } };
  const target = resource.data ? data.targets || {} : fallbackTargets || {}, remaining = Number(target.kcal || 0) - data.totals.kcal;
  const recipeRows = (recipeResource.data?.products || []).filter(p => ['dish', 'recipe'].includes(p.kind));
  const add = meal => { setError(null); setModal({ type: 'pick', meal }); };
  const openEntry = entry => { if (readOnly || entry.pending) return; setModal({ type: 'entry', entry }); };
  const modalView = () => {
    if (!modal) return null;
    if (modal.type === 'pick') return <ProductPicker key={catalogVersion} meal={modal.meal} onClose={() => setModal(null)} onPick={p => setModal({ type: 'entry', product: p, meal: modal.meal })} />;
    if (modal.type === 'entry') return <DiaryEntryForm {...modal} day={day} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'copy') return <CopyDialog day={day} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'recipe') return <RecipeEditor recipe={modal.recipe} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'goal') return <GoalEditor clientRow={clientRow} targets={target} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'lesson') { const a = DIARY_LESSONS.find(a => a.id === modal.id); return <Dialog title={a.title} onClose={() => setModal(null)}>{a.paragraphs.map(p => <p key={p} className="small">{p}</p>)}</Dialog>; }
    return null;
  };
  return <div className="nutrition-diary" data-testid="nutrition-diary"><div className="diary-tabs" aria-label="Питание"><button aria-pressed={tab === 'diary'} className={'chip' + (tab === 'diary' ? ' chip--active' : '')} onClick={() => setTab('diary')}>Дневник</button>{!readOnly && onPlan && <button className="chip" disabled={!target.kcal} onClick={() => onPlan({ day, totals: data.totals, targets: target })}>План меню</button>}<button aria-pressed={tab === 'recipes'} className={'chip' + (tab === 'recipes' ? ' chip--active' : '')} onClick={() => setTab('recipes')}>Рецепты</button><button aria-pressed={tab === 'week'} className={'chip' + (tab === 'week' ? ' chip--active' : '')} onClick={() => setTab('week')}>Неделя</button><button aria-pressed={tab === 'learn'} className={'chip' + (tab === 'learn' ? ' chip--active' : '')} onClick={() => setTab('learn')}>Узнать больше</button></div><div className="diary-toolbar"><div className="diary-date"><button className="button button--icon" aria-label="Предыдущий день" onClick={() => chooseDate(shiftDay(day, -1))}><IconChevron size={18} style={{ transform: 'rotate(90deg)' }} /></button><input type="date" aria-label="Дата дневника" min="2000-01-01" max="2099-12-31" value={day} onChange={e => chooseDate(e.target.value)} /><button className="button button--icon" aria-label="Следующий день" onClick={() => chooseDate(shiftDay(day, 1))}><IconChevron size={18} style={{ transform: 'rotate(-90deg)' }} /></button></div>{!readOnly && <button className="button button--primary" onClick={() => add('snack')}><IconPlus size={17} /> Добавить еду</button>}</div>{message && <div role="status"><Note tone="info">{message}</Note></div>}<ErrorNote error={error} />{resource.error && <Note tone="warning">{resource.data ? 'Показаны сохранённые данные. ' : ''}{resource.error.message} <button type="button" className="text-button" onClick={resource.reload}>Повторить загрузку</button></Note>}{tab === 'diary' && <>{resource.loading && !resource.data ? <Loading rows={2} /> : <><Section><Panel pad><div className="diary-summary"><div className="diary-ring" style={{ '--diary-progress': target.kcal > 0 ? Math.min(100, data.totals.kcal / target.kcal * 100) : 0 }}><div className="diary-ring-inner"><strong>{n(data.totals.kcal)}</strong><small>ккал съедено</small></div></div><div><strong>{target.kcal ? remaining >= 0 ? 'Осталось ' + n(remaining) + ' ккал' : 'Выше цели на ' + n(-remaining) + ' ккал' : 'Цель ещё не назначена'}</strong><div className="diary-macros">{[['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([k, text]) => <div key={k}><small>{text}</small><strong>{n(data.totals[k])} / {target[k] ? n(target[k]) : '—'} г</strong><div className="diary-track"><span style={{ width: (target[k] > 0 ? Math.min(100, data.totals[k] / target[k] * 100) : 0) + '%' }} /></div></div>)}</div><p className="small muted">Цель на выбранный день: {target.kcal ? n(target.kcal) + ' ккал' : '—'}</p>{canCoach && <button className="button" onClick={() => setModal({ type: 'goal' })}>Назначить цель</button>}</div></div></Panel></Section>{data.hasLegacy && <Note tone="info">Ранее добавленное «Своё» перенесено в перекусы. Эти записи могли быть неполными — проверьте день.</Note>}{DIARY_MEALS.map(m => { const list = data.entries.filter(e => e.meal === m.id); return <Section key={m.id}><Panel><div className="diary-meal-head"><h3>{m.label}</h3><span className="small muted">{n(totalEntries(list).kcal)} ккал</span>{!readOnly && <button className="button button--icon" aria-label={'Добавить в ' + m.label.toLowerCase()} onClick={() => add(m.id)}><IconPlus size={17} /></button>}</div>{list.length ? list.map(e => <div className="diary-foodrow" key={e.id}><button type="button" className="diary-food-main" disabled={readOnly || e.pending} onClick={() => openEntry(e)} aria-label={'Изменить: ' + e.product.name}><strong>{e.product.name}</strong><small>{formatNumber(e.amount)} {unit(e.product)}{e.pending ? e.error ? ' · нужна проверка' : ' · на телефоне, ждёт отправки' : ''}</small>{e.error && <small role="alert">{e.error}</small>}</button><span className="diary-food-cal">{n(totalEntries([e]).kcal)} ккал</span>{e.pending && <button className="button button--icon" aria-label={'Убрать локальную запись: ' + e.product.name} onClick={async () => { await dropWrite(undefined, 'diaryEntry', e.params); refresh(); }}><IconTrash size={16} /></button>}</div>) : <div className="diary-empty">Пока нет записей.</div>}</Panel></Section>; })}<div className="diary-foot-actions"><label className="diary-complete"><input type="checkbox" checked={data.complete} disabled={readOnly || busy || data.entries.some(e => e.pending)} onChange={e => updateDay({ complete: e.target.checked })} /> Всё за день записано</label>{!readOnly && <button className="button" onClick={() => setModal({ type: 'copy' })}><IconCopy size={16} /> Повторить еду</button>}</div><Section title="Вода"><Panel pad><div className="diary-water"><strong>{formatNumber(data.waterMl / 1000, 2)} л выпито</strong>{!readOnly && <div className="diary-inline-actions"><button className="button" disabled={busy} onClick={() => updateDay({ waterDelta: 250 })}>+ 250 мл</button><button className="button" disabled={busy || data.waterMl < 250} aria-label="Убрать 250 мл воды" onClick={() => updateDay({ waterDelta: -250 })}>−</button></div>}</div></Panel></Section><Section title={canCoach ? 'Комментарий клиенту' : 'От тренера'}><Panel pad>{canCoach ? <><label className="field"><span className="field__label">Комментарий к выбранному дню</span><textarea className="field__input" value={comment} maxLength={1500} rows={3} onChange={e => setComment(e.target.value)} /></label><button className="button button--primary" disabled={busy} onClick={() => updateDay({ comment })}>Сохранить комментарий</button></> : <p className="small" style={{ margin: 0 }}>{data.comment || 'Здесь появится комментарий тренера к этому дню.'}</p>}</Panel></Section></>}</>}{tab === 'week' && <Week clientRow={clientRow} day={day} />}{tab === 'recipes' && <Section title="Блюда и рецепты"><Panel pad>{!readOnly && <button className="button button--primary" onClick={() => setModal({ type: 'recipe' })}><IconPlus size={16} /> Свой рецепт</button>}<p className="small muted">Блюда тренера — порциями. Свои рецепты с измеренным выходом — граммами.</p><ErrorNote error={recipeResource.error} />{recipeResource.loading ? <Loading lead={false} rows={2} /> : recipeRows.map(p => <div className="diary-catalog-row" key={productKey(p)}><div className="diary-food-main"><strong>{p.name}</strong><small>{n(p.kcal)} ккал / {p.unit === 'portion' ? 'порция' : '100 г'}</small></div>{!readOnly && <div className="diary-inline-actions">{p.kind === 'recipe' && <button className="button button--icon" aria-label={'Изменить рецепт: ' + p.name} onClick={() => setModal({ type: 'recipe', recipe: p })}>Изм.</button>}<button className="button" onClick={() => setModal({ type: 'entry', product: p, meal: 'snack' })}>Добавить</button></div>}</div>)}</Panel></Section>}{tab === 'learn' && <Section title="Разобраться за пару минут"><Panel>{DIARY_LESSONS.map(a => <button type="button" className="diary-lesson" key={a.id} onClick={() => setModal({ type: 'lesson', id: a.id })}><strong>{a.title}</strong><small>{a.time}</small></button>)}</Panel></Section>}{modalView()}</div>;
}
