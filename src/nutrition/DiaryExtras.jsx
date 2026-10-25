import React, { useState, useEffect, useRef } from 'react';
import { apiPublic, apiMutate } from '../api.js';
import { Note, Sheet, formatNumber, useEdgeFade } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { queueWrite, isOffline } from '../offline-writes.js';
import { CATALOG, setCatalog } from './catalog.js';
import { requestId } from './diary-model.js';
import { ErrorNote, n } from './diary-ui.jsx';
import { similarFoods, foodUsage, snackIdeas, swapQuestion, FREE, freeSnapshot } from './diary-extras.js';
import './diary-extras.css';

/**
 * Экраны «Конструктора рационов» (FT-709): замены продукта в составе блюда
 * и вопрос тренеру о замене, «Что влезет» в остаток дня и отметки «без
 * ограничений». Счёт — в diary-extras.js.
 */

// Справочник с группами и блюда с составом — из dishes.list, как в «Рационе».
// Грузится, только когда нужен (открыли состав или «Что влезет»); до ответа —
// встроенный набор (recipes.js).
export function useFoodCatalog(active = true) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!active || CATALOG.fromServer) return undefined;
    let alive = true;
    Promise.resolve().then(() => apiPublic('dishes.list', {}))
      .then(r => { if (alive && setCatalog(r || {})) setVersion(v => v + 1); })
      .catch(() => {});
    return () => { alive = false; };
  }, [active]);
  return CATALOG;
}

const MAIN_GRAMS = 20;
const grams = v => formatNumber(Math.round(Number(v || 0))) + ' г';

// Строки состава на порцию с заменами (для основных продуктов, от 20 г)
function swapRows(items, portions, catalog) {
  const usage = foodUsage(catalog.RECIPES);
  return items.map(i => {
    const g = Number(i.grams || 0) / (portions || 1);
    return { food: i.food, grams: Math.round(g), swaps: g >= MAIN_GRAMS ? similarFoods(i.food, catalog.FOOD, { grams: g, usage }) : [] };
  });
}

function SwapLine({ swaps }) {
  if (!swaps.length) return null;
  return <small className="swap-line">Можно заменить: {swaps.map((s, k) => <span key={s.name}>{k ? ' · ' : ''}<b>{s.name}</b> {grams(s.grams)}{Math.abs(s.proteinDelta) >= 1 ? ' (белка ' + (s.proteinDelta > 0 ? '+' : '−') + formatNumber(Math.abs(s.proteinDelta)) + ' г)' : ''}</span>)}</small>;
}

/**
 * Состав блюда на порцию с «можно заменить на». items — [{ food, grams }]
 * на всё блюдо, portions — на сколько порций. canAsk — показывать «Спросить
 * тренера о замене» (у клиента с тренером; в «Моих тренировках» тренера и у
 * тренера в карточке клиента — нет).
 */
export function IngredientSwaps({ dish, items = [], portions = 1, canAsk = false, heading = 'Состав на порцию' }) {
  const catalog = useFoodCatalog(true);
  const [ask, setAsk] = useState(false);
  const rows = swapRows(items, portions, catalog);
  if (!rows.length) return <p className="small muted swap-box">Состав этого блюда не указан.</p>;
  const any = rows.some(r => r.swaps.length);
  return <div className="swap-box">
    <p className="swap-box__head">{heading}{any ? ' и замены с похожим КБЖУ' : ''}</p>
    <ul className="swap-list">{rows.map(r => <li key={r.food}><span className="swap-list__row"><span>{r.food}</span><span className="swap-list__g">{grams(r.grams)}</span></span><SwapLine swaps={r.swaps} /></li>)}</ul>
    {any && <p className="small muted swap-box__why">Граммы замены — на те же калории. Белков, жиров и углеводов выйдет примерно столько же.</p>}
    {canAsk && rows.some(r => r.grams >= MAIN_GRAMS) && <button type="button" className="button button--ghost swap-box__ask" onClick={() => { haptic(); setAsk(true); }}>Спросить тренера о замене</button>}
    {ask && <AskSwap dish={dish} rows={rows.filter(r => r.grams >= MAIN_GRAMS)} onClose={() => setAsk(false)} />}
  </div>;
}

/**
 * Состав строки «Рецептов»: блюдо тренера — из каталога (dishes.list) по id,
 * свой рецепт — из его ингредиентов (весь рецепт, граммы как вписаны).
 */
export function ProductSwaps({ product, canAsk }) {
  const catalog = useFoodCatalog(true);
  if (product.kind === 'recipe') return <IngredientSwaps dish={product.name} canAsk={canAsk} heading="Состав рецепта" items={(product.ingredients || []).map(i => ({ food: i.product?.name || '', grams: Number(i.amount) || 0 })).filter(i => i.food)} />;
  const dish = catalog.RECIPES.find(r => String(r.id) === String(product.id));
  if (!dish) return <p className="small muted swap-box">{catalog.fromServer ? 'Состав этого блюда не найден.' : 'Загружаю состав…'}</p>;
  return <IngredientSwaps dish={product.name} items={dish.items} portions={dish.portions} canAsk={canAsk} />;
}

/** То же для карточки «Рациона»: свёрнуто, как «Как готовить» */
export function CardSwaps({ recipe }) {
  const catalog = CATALOG;
  const rows = swapRows(recipe.items || [], recipe.portions, catalog).filter(r => r.swaps.length);
  if (!rows.length) return null;
  return <details className="recipe swap-details" onClick={e => e.stopPropagation()}><summary>Чем заменить</summary><ul className="swap-list">{rows.map(r => <li key={r.food}><span className="swap-list__row"><span>{r.food}</span><span className="swap-list__g">{grams(r.grams)}</span></span><SwapLine swaps={r.swaps} /></li>)}</ul></details>;
}

/**
 * «Спросить тренера о замене» — тем же каналом, что «Пожелание тренеру»
 * (wish.create, lib/wishes.js): тренер видит вопрос в «Пожеланиях клиента»,
 * ответ приходит туда же, в «Тренировки». Текст собирается сам, его можно
 * поправить.
 */
export function AskSwap({ dish, rows, onClose }) {
  const [food, setFood] = useState(rows[0]?.food || ''), [to, setTo] = useState(null);
  const row = rows.find(r => r.food === food);
  const auto = swapQuestion({ dish, food, grams: row?.grams, to });
  const [text, setText] = useState(auto), [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [sent, setSent] = useState(false);
  useEffect(() => { if (!edited) setText(auto); }, [auto]);
  const pickFood = name => { setFood(name); setTo(null); setEdited(false); };
  const send = async e => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await apiMutate('wish.create', { text }); haptic('success'); setSent(true); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };
  const chip = (on, label, click, key) => <button key={key || label} type="button" className={'chip' + (on ? ' chip--active' : '')} aria-pressed={on} onClick={() => { haptic(); click(); }}>{label}</button>;
  return <Sheet title="Спросить тренера о замене" dirty={!sent && edited} locked={busy} onClose={onClose}>
    {sent ? <><Note tone="good">Отправлено. Ответ тренера появится в «Тренировках», в блоке «Пожелание тренеру».</Note><div className="diary-form-footer"><button type="button" className="button button--primary" onClick={onClose}>Готово</button></div></> :
    <form className="diary-form" onSubmit={send}>
      {rows.length > 1 && <><p className="recipe-filters__label">Что заменить</p><div className="chips chips--wrap chips--flush">{rows.map(r => chip(food === r.food, r.food, () => pickFood(r.food), r.food))}</div></>}
      {row?.swaps.length > 0 && <><p className="recipe-filters__label">На что</p><div className="chips chips--wrap chips--flush">{row.swaps.map(s => chip(to?.name === s.name, s.name + ' · ' + grams(s.grams), () => { setTo(to?.name === s.name ? null : s); setEdited(false); }, s.name))}</div></>}
      <label className="field"><span className="field__label">Вопрос тренеру</span><textarea className="field__input" rows={3} maxLength={1000} value={text} onChange={e => { setText(e.target.value); setEdited(true); }} /></label>
      <p className="small muted">Видите только вы и тренер — как пожелание к программе. Удалить его можно в «Тренировках».</p>
      <ErrorNote error={error} />
      <div className="diary-form-footer"><button className="button button--primary" disabled={busy || text.trim().length < 3}>{busy ? 'Отправляю…' : 'Отправить тренеру'}</button></div>
    </form>}
  </Sheet>;
}

/**
 * «Что влезет» в остаток дня: перекусы тренера и продукты с обычной
 * порцией, сначала с большим белком, сладкое — тоже. Выбор открывает
 * обычную форму записи с уже подставленной порцией (onPick).
 */
export function SnackIdeas({ remaining, onPick, onClose }) {
  const catalog = useFoodCatalog(true);
  const list = snackIdeas({ remaining, foods: catalog.FOOD, dishes: catalog.RECIPES });
  return <Sheet title={'Что влезет в ' + n(remaining) + ' ккал'} onClose={onClose}>
    <p className="small muted">Порция каждого целиком помещается в остаток. Сначала — где больше белка. Запретов нет: сладкое тоже можно, если влезает.</p>
    {list.length ? <div className="snack-list">{list.map(r => <div className="diary-catalog-row" key={r.product.kind + ':' + r.product.id}><button type="button" className="diary-food-main" onClick={() => onPick(r.product, r.amount)} aria-label={'Записать: ' + r.product.name}><strong>{r.product.name}</strong><small>{r.product.unit === 'portion' ? '1 порция' : grams(r.amount)} · {n(r.kcal)} ккал · белка {formatNumber(Math.round(r.protein))} г{r.sweet ? ' · сладкое' : ''}</small></button><button type="button" className="button" onClick={() => onPick(r.product, r.amount)}>Записать</button></div>)}</div>
      : <p className="small muted">В такой остаток целая порция ничего из справочника не помещается. Подойдут чай, кофе, вода и другое «без ограничений».</p>}
  </Sheet>;
}

/**
 * Отметки «без ограничений» рядом с водой: 0 ккал, одним нажатием, без
 * поиска. Запись — обычная запись дневника (kind 'free'), её видно в приёме
 * пищи и можно удалить смахиванием. Без связи — в очередь телефона, как
 * любая запись. Одной строкой, листается вбок (FT-745): заголовок и два
 * ряда чипов под водой занимали больше места, чем сама вода.
 */
export function FreeMarks({ day, meal, disabled, onSaved, onError }) {
  const [busy, setBusy] = useState('');
  const tokens = useRef({}), row = useRef(null), edges = useEdgeFade(row);
  const mark = async id => {
    const preview = freeSnapshot(id);
    tokens.current[id] ||= requestId();
    const params = { day, meal, amount: 1, product: { kind: 'free', id }, preview, requestId: tokens.current[id] };
    setBusy(id); haptic();
    try { await apiMutate('diary.entry.save', params); delete tokens.current[id]; haptic('success'); onSaved(preview.name + ' — записано, 0 ккал.'); }
    catch (err) {
      if (isOffline(err)) {
        try { await queueWrite('diaryEntry', params); delete tokens.current[id]; onSaved('Сохранено на телефоне. Отправим при появлении связи.', 'info'); }
        catch (storageError) { onError(storageError); }
      } else onError(err);
    } finally { setBusy(''); }
  };
  return <div className="free-marks"><span className="free-marks__head" aria-hidden="true">0 ккал</span><div ref={row} className={'chips chips--flush free-marks__row' + edges} role="group" aria-label="Без ограничений, 0 ккал">{Object.entries(FREE).map(([id, f]) => <button key={id} type="button" className="chip" disabled={disabled || !!busy} aria-label={f.name + ': записать, 0 ккал'} onClick={() => mark(id)}>{busy === id ? 'Записываю…' : '+ ' + f.short}</button>)}</div></div>;
}
