import { foodTitle, foodUnit as unit, cap } from './FoodFields.jsx';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { apiStale, apiMutate } from '../api.js';
import { palmUnit } from './palm-model.js';
import { Section, Panel, Note, Loading, Chips, Sheet, Qty, BackButton, formatNumber } from '../ui.jsx';
import { IconPlus, IconMinus, IconClose, IconCopy, IconTrash, IconChevron, IconSearch, IconBarcode } from '../icons.jsx';
import { haptic } from '../telegram.js';
import SwipeRow from '../SwipeRow.jsx';
import { usePendingDelete } from '../pendingDelete.jsx';
import { useQuickRequest } from '../quick-actions.js';
import { localWrites, onWritesChange, queueWrite, isOffline, dropWrite } from '../offline-writes.js';
import { offlineAccount } from '../offline-account.js';
import { DIARY_MEALS, today, shiftDay, dayLabel, requestId, totalEntries, withPending, mealNow, mealFromRecipe, label, paramsOf, decimal } from './diary-model.js';
import { DIARY_LESSONS } from './diary-lessons.js';
import { Approach, PalmSummary, PalmSheet } from './Palm.jsx';
import { useDiaryResource, useOperation, Field, ErrorNote, n, macroLine, amountLabel } from './diary-ui.jsx';
import { ProductFacts } from './ProductFacts.jsx';
import { QuickEntry } from './QuickEntry.jsx';
import { ProductPicker, PhotoHero } from './ProductPicker.jsx';
import { PlatePhoto } from './PlatePhoto.jsx';
import { PlateScanner } from './PlateScanner.jsx';
import { MealShares, MealNormLine } from './MealShares.jsx';
import { Recipes } from './Recipes.jsx';
import { SnackIdeas, FreeMarks } from './DiaryExtras.jsx';
import { FinishSheet, DayFinish } from './DayFinish.jsx';
import { CarbCycleField } from './CarbCycle.jsx';
import { carbTargetLine } from './carbs.js';
// Части дневника разнесены по модулям 21.10.2026; прежние экспорты этого файла
// остаются доступными отсюда (scripts/test-diary.mjs, Ration.jsx)
export { useDiaryResource } from './diary-ui.jsx';
export { ProductFacts } from './ProductFacts.jsx';
export { QuickEntry } from './QuickEntry.jsx';
export { recipeFilter } from './Recipes.jsx';
// «Не сейчас» на вопросе про опыт — неделю не спрашиваем (только на этом устройстве)
const LATER_KEY = 'diary_approach_later_v1';
const askedLater = () => { try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < 7 * 86400000; } catch { return false; } };
const askLater = () => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* не запомнили — спросим снова */ } };
import './diary.css';

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
  const palm = p.kind === 'palm';
  const submit = async e => {
    e.preventDefault(); const qty = decimal(amount);
    // Порция рукой — как на сервере: от 0,5 до 10 шагом 0,5 (diary-approx.js); общая форма не должна обещать 0,01–30
    if (palm ? (!Number.isFinite(qty) || qty < 0.5 || qty > 10 || Math.round(qty * 2) !== qty * 2) : (!Number.isFinite(qty) || qty <= 0 || qty > (p.unit === 'portion' ? 30 : 5000))) { setAmountError('Проверьте количество: ' + (palm ? 'от 0,5 до 10 порций, шагом 0,5.' : p.unit === 'portion' ? 'от 0,01 до 30 порций.' : 'от 0,01 до 5000 ' + unit(p) + '.')); return; }
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
  const amountField = palm ? 'Порций рукой, ' + palmUnit(p.id, 5) : p.unit === 'portion' ? 'Количество порций' : 'Количество, ' + unit(p);
  // Быстрые порции: стакан и банка у напитков, навески у еды, у «ладони» — те же, что в листе
  const quick = palm ? [.5, 1, 1.5, 2] : p.unit === 'portion' ? [.5, 1, 1.5] : p.unit === 'ml' ? [200, 250, 330] : [100, 150, 200];
  return <Sheet title={entry ? 'Изменить запись' : 'Записать съеденное'} dirty={dirty} locked={busy} focus="#diary-amount" onClose={onClose}><form className="diary-form" onSubmit={submit}><h3>{foodTitle(p)}</h3><ProductFacts p={p} />{editWhen ? <><Field label="Дата" type="date" value={date} onChange={setDate} required min="2000-01-01" max="2099-12-31" /><label className="field"><span className="field__label">Приём пищи</span><select className="field__input" value={selectedMeal} onChange={e => setMeal(e.target.value)}>{DIARY_MEALS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label></> : <button type="button" className="diary-when" aria-expanded="false" onClick={() => setEditWhen(true)}><span>{dayLabel(date)} · {label(selectedMeal)}</span><small>изменить</small></button>}<Field id="diary-amount" label={amountField} inputMode="decimal" value={amount} onChange={v => { setAmount(v); setAmountError(''); }} onFocus={e => e.target.select()} error={amountError} required /><div className="diary-inline-actions">{quick.map(q => <button className="chip" key={q} type="button" onClick={() => { setAmount(String(q)); setAmountError(''); }}>{formatNumber(q)} {unit(p)}</button>)}</div><div className="diary-portion-preview"><strong>{n(preview.kcal)} ккал</strong><div>{macroLine(preview)}</div></div><ErrorNote error={error} /><div className="diary-form-footer"><button className="button button--primary" disabled={busy} type="submit">{busy ? 'Сохраняю…' : 'Записать в дневник'}</button></div>{entry && <div className="diary-form-remove"><button type="button" className="button button--ghost" disabled={busy} onClick={remove}><IconTrash size={16} /> Удалить запись</button></div>}</form></Sheet>;
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

// carbDay — с сервера: базовая цель (targets) и процент углеводов по дням (FT-709)
function GoalEditor({ clientRow, targets, carbDay, onClose, onSaved }) {
  const [values, setValues] = useState({ kcal: targets.kcal, protein: targets.protein, fat: targets.fat, carbs: targets.carbs }), [from, setFrom] = useState(today()), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const [cycle, setCycle] = useState(carbDay?.percent || 0);
  const initial = useRef(JSON.stringify([values, from, cycle]));
  const op = useOperation();
  const submit = async e => { e.preventDefault(); setBusy(true); setError(null); try { await op('diary.target.save', { clientRow, fromDay: from, targets: values, carbCycle: cycle }); haptic('success'); onSaved(); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <Sheet title="Назначить цель питания" dirty={JSON.stringify([values, from, cycle]) !== initial.current} onClose={onClose}><form className="diary-form" onSubmit={submit}><Field label="Действует с" type="date" min={today()} value={from} onChange={setFrom} required /><div className="diary-goal-grid">{[['kcal', 'Калории'], ['protein', 'Белки, г'], ['fat', 'Жиры, г'], ['carbs', 'Углеводы, г']].map(([k, text]) => <Field key={k} label={text} inputMode="decimal" value={values[k] ?? ''} onChange={v => setValues(old => ({ ...old, [k]: v }))} required />)}</div><CarbCycleField value={cycle} onChange={setCycle} targets={values} /><p className="small muted">Новая цель действует с выбранной даты. Сохранённое прошлое не пересчитывается.</p><ErrorNote error={error} /><button className="button button--primary button--block" disabled={busy}>Сохранить цель</button></form></Sheet>;
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

// «0 л», «0,25 л», «1,5 л» — без хвоста нулей «0,00»
const liters = ml => formatNumber(Math.round(ml / 10) / 100, Number.isInteger(ml / 1000) ? 0 : Number.isInteger(ml / 100) ? 1 : 2);

export default function NutritionDiary({ clientRow, readOnly = false, self = false, preview = false, targets: fallbackTargets, onPlan, activeTab, onTabChange, notice, dayNote }) {
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
  // Ревизию дня сверяет только полнота; любая запись еды её поднимает, а дневник
  // перечитывается после записи не мгновенно. 409 сразу после своей же записи —
  // не чужое устройство: один раз перечитываем день и повторяем с свежей ревизией.
  const updateDay = async (patch, done = 'Сохранено.') => {
    setBusy(true); setError(null);
    const save = revision => op('diary.day.save', { ...paramsOf(clientRow), day, revision, ...patch });
    try {
      try { await save(data.revision); }
      catch (e) {
        if (e?.code !== 409 || !patch.complete) throw e;
        const fresh = await apiStale('diary.get', { ...paramsOf(clientRow), day }).promise;
        await save(fresh.revision);
      }
      resource.reload(); say(done); return true;
    } catch (e) { setError(e); resource.reload(); return false; } finally { setBusy(false); }
  };
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
  // Записать еду (FT-744): фото — главное действие, если доступно; приём — по
  // часам у сегодняшнего дня, у прошлого — перекус (сменить можно в листе)
  const photoOn = !readOnly && !!resource.data?.photo, addMeal = day === today() ? mealNow() : 'snack';
  const snap = () => { setError(null); setModal({ type: 'scan', meal: addMeal }); };
  // «Обед · 320 ккал», а с нормой на приём — «Обед · 320 из 630 ккал» (п. 10)
  const mealLine = id => { const eaten = totalEntries(shown.filter(e => e.meal === id)).kcal, norm = mealNorm(id); return label(id) + ' · ' + n(eaten) + (norm ? ' из ' + n(norm) : '') + ' ккал'; };
  const mealNorm = id => settings.meals && target.kcal ? Number(target.kcal) * (settings.meals[id] || 0) / 100 : 0;
  // «+» посередине панели (п. 13): «Еда» — сразу выбор еды на приём по часам,
  // «Вода» — +250 мл одним касанием; пока день не загружен — ждём (false)
  // Дневник мог остаться на другом дне — «+» пишет в сегодня: сначала переключаем день, запрос придёт снова после загрузки
  const toToday = () => { if (day === today()) return true; setDay(today()); chooseTab('diary'); return false; };
  useQuickRequest('food', () => { if (!toToday() || !resource.data) return false; chooseTab('diary'); add(mealNow()); }, !readOnly);
  useQuickRequest('water', () => { if (!toToday() || !resource.data || busy) return false; chooseTab('diary'); haptic(); updateDay({ waterDelta: 250 }, 'Вода: +250 мл.'); }, !readOnly);
  const openEntry = entry => { if (readOnly || entry.pending) return; setModal({ type: 'entry', entry }); };
  const modalView = () => {
    if (!modal) return null;
    if (modal.type === 'pick') return <ProductPicker key={catalogVersion} meal={modal.meal} mealLine={mealLine(modal.meal)} startScan={modal.scan} onClose={() => setModal(null)} onQuick={() => setModal({ type: 'quick', meal: modal.meal })} onPalm={() => setModal({ type: 'palm', meal: modal.meal })} onPhoto={photoOn ? () => setModal({ type: 'scan', meal: modal.meal, back: true }) : undefined} onPick={p => setModal({ type: 'entry', product: p, meal: modal.meal })} />;
    // AI-сканер (FT-746): кадр снимается сам → тот же лист со списком блюд; нет камеры — лист со снимком
    if (modal.type === 'scan') return <PlateScanner onResult={preset => setModal({ ...modal, type: 'photo', preset })} onShot={file => setModal({ ...modal, type: 'photo', file })} onFallback={why => setModal({ ...modal, type: 'photo', denied: why === 'denied' })} onClose={() => setModal(modal.back ? { type: 'pick', meal: modal.meal } : null)} />;
    if (modal.type === 'photo') return <PlatePhoto day={day} meal={modal.meal} file={modal.file} preset={modal.preset} denied={modal.denied} onRescan={modal.file || modal.preset ? () => setModal({ type: 'scan', meal: modal.meal, back: modal.back }) : undefined} onClose={() => setModal(modal.back ? { type: 'pick', meal: modal.meal } : null)} onSaved={refresh} />;
    if (modal.type === 'shares') return <MealShares meals={settings.meals} dayKcal={Number(target.kcal || 0)} onClose={() => setModal(null)} onSave={async meals => { await op('diary.settings.save', { meals }); setModal(null); resource.reload(); say(meals ? 'Норма по приёмам сохранена.' : 'Доли по приёмам убраны.'); }} />;
    if (modal.type === 'palm') return <PalmSheet day={day} meal={modal.meal} onClose={() => setModal(null)} onSaved={refresh} onGrams={() => setModal({ type: 'pick', meal: modal.meal })} />;
    if (modal.type === 'snacks') return <SnackIdeas remaining={remaining} onClose={() => setModal(null)} onPick={(product, amount) => setModal({ type: 'entry', product, amount, meal: 'snack' })} />;
    if (modal.type === 'quick') return <QuickEntry day={day} meal={modal.meal} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'entry') return <DiaryEntryForm {...modal} day={day} onClose={() => setModal(null)} onSaved={refresh} onRemove={removeEntry} />;
    if (modal.type === 'finish') return <FinishSheet data={data} totals={totals} target={target} busy={busy} error={error} onClose={() => setModal(null)} onFinish={async () => { if (await updateDay({ complete: true }, 'День завершён.')) { haptic('success'); setModal(null); } }} />;
    if (modal.type === 'copy') return <CopyDialog day={day} onClose={() => setModal(null)} onSaved={refresh} />;
    if (modal.type === 'recipe') return <RecipeEditor recipe={modal.recipe} onClose={() => setModal(null)} onSaved={() => refresh('Рецепт сохранён.')} />;
    if (modal.type === 'goal') return <GoalEditor clientRow={clientRow} targets={data.carbDay?.base || target} carbDay={data.carbDay} onClose={() => setModal(null)} onSaved={() => refresh('Цель сохранена.')} />;
    if (modal.type === 'lesson') { const a = DIARY_LESSONS.find(a => a.id === modal.id); return <Sheet title={a.title} onClose={() => setModal(null)}>{a.paragraphs.map(p => <p key={p} className="small">{p}</p>)}</Sheet>; }
    return null;
  };
  // «Что съесть на остаток» — один вход вместо трёх (FT-744): «Что влезет»,
  // «Что приготовить на остаток» и чип «Из того, что есть» живут во вкладке
  // «Рецепты», здесь — только ссылка туда
  const nextLink = () => !readOnly && target.kcal > 0 && remaining >= 50 ? <button type="button" className="diary-next" onClick={() => chooseTab('recipes')}><span>Что съесть на <Qty value={n(remaining)} unit="ккал" /></span><IconChevron size={18} style={{ transform: 'rotate(-90deg)' }} /></button> : null;
  // Под итогом дня — как записать еду: фото во всю ширину, ниже поиск и штрихкод
  const addBlock = () => readOnly ? null : <div className="diary-add">{photoOn && <PhotoHero onClick={snap} />}<div className="diary-add__row">{palm ? <button type="button" className={'button' + (photoOn ? '' : ' button--primary')} onClick={() => add(addMeal)}><IconPlus size={20} /> Отметить порции</button> : <><button type="button" className={'button' + (photoOn ? '' : ' button--primary')} onClick={() => add(addMeal)}><IconSearch size={20} /> Найти продукт</button><button type="button" className="button" onClick={() => { setError(null); setModal({ type: 'pick', meal: addMeal, scan: 'barcode' }); }}><IconBarcode size={20} /> Штрихкод</button></>}</div></div>;
  const foodRow = e => <SwipeRow key={e.id} className="diary-food-swipe" contentClassName="diary-foodrow" label={'Удалить: ' + e.product.name} disabled={readOnly} onDelete={() => removeEntry(e)}><button type="button" className="diary-food-main" disabled={readOnly || e.pending} onClick={() => openEntry(e)} aria-label={'Изменить: ' + e.product.name}><strong>{cap(e.product.name)}</strong><small>{amountLabel(e)}{e.pending ? e.error ? ' · нужна проверка' : ' · на телефоне, ждёт отправки' : ''}</small>{e.error && <small role="alert">{e.error}</small>}</button><span className="diary-food-cal"><Qty value={(e.product.approx ? '≈ ' : '') + n(totalEntries([e]).kcal)} unit="ккал" /></span>{e.pending && <button className="icon-button" aria-label={'Убрать локальную запись: ' + e.product.name} onClick={() => removeEntry(e)}><IconTrash size={16} /></button>}</SwipeRow>;
  return <div className="nutrition-diary" data-testid="nutrition-diary"><Chips variant="nav" label="Питание" items={NAV} value={navOf(tab)} onChange={chooseTab} />{tab === 'diary' && <div className="diary-toolbar"><div className="diary-date"><button className="icon-button" aria-label="Предыдущий день" onClick={() => chooseDate(shiftDay(day, -1))}><IconChevron size={18} style={{ transform: 'rotate(90deg)' }} /></button><label className="diary-date__pick"><span className="diary-date__text" aria-hidden="true">{dayLabel(day)}</span><input type="date" aria-label="Дата дневника" min="2000-01-01" max="2099-12-31" value={day} onChange={e => chooseDate(e.target.value)} /></label><button className="icon-button" aria-label="Следующий день" onClick={() => chooseDate(shiftDay(day, 1))}><IconChevron size={18} style={{ transform: 'rotate(-90deg)' }} /></button></div></div>}{message && <div role="status"><Note tone={message.tone}>{message.text}</Note></div>}<ErrorNote error={error} />{tab === 'diary' && !target.kcal && notice}{askApproach && <Approach current={settings.chosen ? settings.mode : null} busy={busy} onChoose={saveMode} onCancel={() => { askLater(); setLater(true); setApproachOpen(false); }} />}{resource.error && <Note tone="warning">{resource.data ? 'Показаны сохранённые данные. ' : ''}{resource.error.message} <button type="button" className="button button--ghost" onClick={resource.reload}>Повторить загрузку</button></Note>}{tab === 'diary' && <>{resource.loading && !resource.data ? <Loading rows={2} /> : <><Section><Panel pad>{palm ? <><PalmSummary entries={shown} targets={target} /><p className="small palm-mode-line"><span>Съедено <Qty value={'≈ ' + n(totals.kcal)} unit={'ккал' + (target.kcal ? ' из ' + n(target.kcal) : '')} /></span>{!readOnly && <button type="button" className="button button--ghost" onClick={() => setApproachOpen(true)}>Как считать</button>}</p></> : <div className="diary-summary"><div className="diary-ring" style={{ '--diary-progress': target.kcal > 0 ? Math.min(100, totals.kcal / target.kcal * 100) : 0 }}><div className="diary-ring-inner"><strong>{n(totals.kcal)}</strong><small>ккал съедено</small></div></div><div><div className="diary-summary__head"><strong>{target.kcal ? remaining >= 0 ? <>Осталось <Qty value={n(remaining)} unit="ккал" /></> : <>Выше цели на <Qty value={n(-remaining)} unit="ккал" /></> : 'Цель ещё не назначена'}</strong></div><div className="diary-macros">{[['protein', 'Белки'], ['fat', 'Жиры'], ['carbs', 'Углеводы']].map(([k, text]) => <div key={k}><small>{text}</small><strong><Qty value={n(totals[k])} unit={'/ ' + (target[k] ? n(target[k]) : '—') + ' г'} /></strong><div className={'diary-track diary-track--' + k}><span style={{ width: (target[k] > 0 ? Math.min(100, totals[k] / target[k] * 100) : 0) + '%' }} /></div></div>)}</div><p className="small muted">Норма дня {target.kcal ? n(target.kcal) + ' ккал' : '—'}{approxKcal > 0 ? ' · из съеденного примерно ' + n(approxKcal) + ' ккал' : ''}</p>{carbTargetLine(data.carbDay) && <p className="small diary-carb-line">{carbTargetLine(data.carbDay)}</p>}{canCoach && <button className="button" onClick={() => setModal({ type: 'goal' })}>Назначить цель</button>}</div></div>}{palm && canCoach && <button className="button" onClick={() => setModal({ type: 'goal' })}>Назначить цель</button>}{dayNote && dayNote(day)}{nextLink()}</Panel></Section>{addBlock()}{data.hasLegacy && <Note tone="info">Ранее добавленное «Своё» перенесено в перекусы. Эти записи могли быть неполными — проверьте день.</Note>}<Section><Panel className="diary-meals">{DIARY_MEALS.map(m => { const list = shown.filter(e => e.meal === m.id); return <div className="diary-meal" key={m.id}><div className="diary-meal-head"><h3>{m.label}</h3>{mealNorm(m.id) ? <MealNormLine eaten={totalEntries(list).kcal} norm={mealNorm(m.id)} /> : <span className="small muted">{n(totalEntries(list).kcal)} ккал</span>}{!readOnly && <button type="button" className="diary-meal-add" aria-label={'Добавить в ' + m.label.toLowerCase()} onClick={() => add(m.id)}><IconPlus size={22} /></button>}</div>{list.length > 0 && <div className="diary-meal-list">{list.map(foodRow)}</div>}</div>; })}{!readOnly && <button type="button" className="diary-meals__copy" onClick={() => setModal({ type: 'copy' })}><IconCopy size={16} /> Повторить еду</button>}</Panel></Section><Section><Panel pad><div className="diary-water"><div><h3 className="diary-card-title">Вода</h3><strong><Qty value={liters(data.waterMl)} unit="л выпито" /></strong></div>{!readOnly && <div className="diary-inline-actions"><button className="button" disabled={busy} onClick={() => { haptic(); updateDay({ waterDelta: 250 }); }}>+ 250 мл</button><button className="button diary-water__less" disabled={busy || data.waterMl < 250} aria-label="Убрать 250 мл воды" onClick={() => { haptic(); updateDay({ waterDelta: -250 }); }}><IconMinus size={18} /></button></div>}</div>{!readOnly && <FreeMarks day={day} meal={day === today() ? mealNow() : 'snack'} disabled={busy} onSaved={(text, tone) => { say(text, tone); resource.reload(); }} onError={setError} />}</Panel></Section>{!self && <Section><Panel pad><h3 className="diary-card-title">{canCoach ? 'Комментарий клиенту' : 'От тренера'}</h3>{canCoach ? <><label className="field"><span className="field__label">Комментарий к выбранному дню</span><textarea className="field__input" value={comment} maxLength={1500} rows={3} onChange={e => setComment(e.target.value)} /></label><button className="button button--primary" disabled={busy} onClick={() => updateDay({ comment })}>Сохранить комментарий</button></> : <p className="small" style={{ margin: 0 }}>{data.comment || 'Здесь появится комментарий тренера к этому дню.'}</p>}</Panel></Section>}<DayFinish data={data} totals={totals} target={target} readOnly={readOnly} busy={busy} onOpen={() => { setError(null); setModal({ type: 'finish' }); }} onReopen={() => updateDay({ complete: false }, 'День открыт — можно дописать.')} /></>}</>}{tab === 'week' && <Week clientRow={clientRow} day={day} />}{tab === 'recipes' && <Recipes rows={recipeRows} canAsk={!readOnly && !self} loading={recipeResource.loading} error={recipeResource.error} remaining={day === today() && target.kcal ? remaining : 0} readOnly={readOnly} onNew={() => setModal({ type: 'recipe' })} onEdit={p => setModal({ type: 'recipe', recipe: p })} onAdd={(p, meal) => setModal({ type: 'entry', product: p, meal: p.kind === 'dish' ? mealFromRecipe(p.meal) : meal || mealNow() })} onFridge={onPlan && target.kcal ? () => onPlan({ day, totals, targets: target }) : undefined} onSnacks={!readOnly && target.kcal > 0 && remaining >= 50 ? () => setModal({ type: 'snacks' }) : undefined} carbDay={data.carbDay && { ...data.carbDay, today: day === today() }} />}{(tab === 'more' || tab === 'learn') && <>{onTabChange && <Section><Panel><button type="button" className="diary-more" aria-label="Норма и анкета" onClick={() => chooseTab('settings')}><strong>Норма и анкета</strong><small>Расчёт калорий по анкете, цель на день</small></button></Panel></Section>}{!readOnly && <Section><Panel><button type="button" className="diary-more" onClick={() => { chooseTab('diary'); setApproachOpen(true); }}><strong>Как считать еду</strong><small>{palm ? 'Сейчас: ладонью — порции без граммов' : 'Сейчас: граммы и продукты'}</small></button><button type="button" className="diary-more" onClick={() => setModal({ type: 'shares' })}><strong>Норма по приёмам</strong><small>{settings.meals ? DIARY_MEALS.map(m => m.label + ' ' + settings.meals[m.id] + ' %').join(' · ') : 'Поделить норму дня на завтрак, обед, ужин и перекус'}</small></button></Panel></Section>}<Section title="Разобраться за пару минут"><Panel>{DIARY_LESSONS.map(a => <button type="button" className="diary-lesson" key={a.id} onClick={() => setModal({ type: 'lesson', id: a.id })}><strong>{a.title}</strong><small>{a.time}</small></button>)}</Panel></Section></>}{tab === 'settings' && <BackButton label="Ещё" onClick={() => chooseTab('more')} />}{modalView()}{del.bar}</div>;
}
