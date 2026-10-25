import React, { useEffect, useRef, useState } from 'react';
import { apiMutate, apiPublic } from '../api.js';
import { Note, Sheet, plural } from '../ui.jsx';
import { IconTrash } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { foodTitle, cap } from './FoodFields.jsx';
import ScanGuide from './ScanGuide.jsx';
import { shrink } from './plate-photo-io.js';
import { PlateScanner } from './PlateScanner.jsx';
import { DIARY_MEALS, label, requestId, decimal } from './diary-model.js';
import { ErrorNote, n } from './diary-ui.jsx';
import './food-scan.css';

/**
 * Еда по фото (FT-736, 25.10.2026). Снимок тарелки → сервер → Yandex AI
 * Studio → список блюд с граммами. Нашлось в каталоге — КБЖУ каталога,
 * нет — оценка модели, запись «примерно» (как «Только калории»). Ничего не
 * пишется, пока человек не проверил список и не нажал «Добавить».
 *
 * Фото уменьшается до 1024 px и перекодируется здесь же: метаданные (место,
 * телефон) отрезаются, на сервер уходит только картинка. Пока идёт проба,
 * плитку видят владелец и тестовые клиенты (сервер: diary.get → photo).
 *
 * Состав (FT-749): блюдо — заголовок с суммой, под ним продукты, из которых
 * оно приготовлено. Название блюда и продуктов правится прямо в строке,
 * продукт меняется на карточку справочника. Каждый продукт — своя запись
 * дневника с пометкой блюда (dish): справочник точнее, «Повторить» работает.
 */
const per = (v, g) => Math.round(Number(v || 0) * g) / 100;
const one = v => String(Math.round(Number(v || 0) * 10) / 10).replace('.', ',');
// «105 ккал · Б 0 · Ж 0 · У 26,3» — КБЖУ этикетки на столько-то граммов
const calcLine = (v, g) => Math.round(v.kcal * g / 100) + ' ккал · Б ' + one(v.protein * g / 100) + ' · Ж ' + one(v.fat * g / 100) + ' · У ' + one(v.carbs * g / 100);
const packName = pack => [cap(pack?.product), pack?.brand].filter(Boolean).join(' · ') || 'продукт';
// «на 39 % меньше» — насколько оценка на глаз разошлась с этикеткой
const diffText = (ai, real) => { const d = Math.round((ai - real) / real * 100); return d === 0 ? 'совпало' : 'на ' + Math.abs(d) + ' % ' + (d < 0 ? 'меньше' : 'больше'); };

// Строка списка: что записываем и сколько это калорий при этих граммах.
// Без КБЖУ (продукт, добавленный вручную, ещё не выбран) — 0 и не записывается
function rowValues(it) {
  const g = decimal(it.grams), src = it.food || it.per100;
  const grams = Number.isFinite(g) && g > 0 && src ? g : 0;
  return { grams, kcal: per(src?.kcal, grams), protein: per(src?.protein, grams), fat: per(src?.fat, grams), carbs: per(src?.carbs, grams) };
}
const productWord = k => plural(k, 'продукт', 'продукта', 'продуктов');

// file — кадр AI-сканера (PlateScanner, FT-746): лист сразу его распознаёт, onRescan —
// «Сканировать снова» обратно в видоискатель. Без file — запасной путь, когда
// камеры в браузере нет (denied — не дали разрешение): «как снять» и снимок
// preset — сканер уже спросил AI сам (FT-748): { image, data, label? , labelFailed? }
export function PlatePhoto({ day, meal: initialMeal, file, preset = null, denied = false, onRescan, onClose, onSaved }) {
  // items — продукты подряд, dishes — блюда, к которым они относятся (it.dish — ключ блюда)
  const [image, setImage] = useState(''), [result, setResult] = useState(null), [items, setItems] = useState([]), [dishes, setDishes] = useState([]);
  const [busy, setBusy] = useState(''), [error, setError] = useState(null), [meal, setMeal] = useState(initialMeal);
  // Упаковка (FT-748): labelValues — КБЖУ на 100 г с этикетки (с фото или отсканированные), scan — открыт сканер этикетки
  const [labelValues, setLabelValues] = useState(null), [scan, setScan] = useState(false);
  // «AI ошибся» (FT-748): комментарий уходит владельцу вместе с ответом модели — по нему правят подсказку и справочник
  const [wrong, setWrong] = useState(null);
  const camera = useRef(null), gallery = useRef(null), sequence = useRef(0), uid = useRef(0);
  const key = () => 'k' + ++uid.current;
  useEffect(() => { if (preset?.data) show(preset.image, preset.data, preset.label); else if (file) void take(file); }, []);

  const take = async file => {
    if (!file) return;
    const ticket = ++sequence.current;
    setError(null); setResult(null); setItems([]); setDishes([]); setLabelValues(null); setScan(false); setBusy('Готовим фото…');
    try {
      const src = await shrink(file);
      if (ticket !== sequence.current) return;
      setImage(src); setBusy('AI распознаёт блюда… обычно 2–5 секунд');
      const data = await apiMutate('diary.photo', { image: src });
      if (ticket !== sequence.current) return;
      show(src, data);
      // Упаковка без цифр — сразу камера на этикетку, без лишнего касания (владелец 25.10.2026: «один сканер на всё»)
      if (data.package && !data.package.match && !data.package.label) setScan(true);
      haptic('success');
    } catch (e) { if (ticket === sequence.current) setError(e); }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  // Ответ AI → строки листа. read — этикетка, которую уже прочитал сканер (diary.photo.label)
  function show(src, data, read = null) {
    setImage(src); setResult(data);
    const pack = data.package, guess = data.items[0], grams = String(guess?.grams || pack?.net || 100);
    const values = read?.label || pack?.label;
    const single = row => { const d = key(); setDishes([{ key: d, name: row.name }]); setItems([{ ...row, key: key(), dish: d }]); };
    if (pack?.match) single({ name: foodTitle(pack.match), from: 0, per100: guess?.per100 || null, food: pack.match, options: pack.options || [], grams });
    // Название, объём и цифры — с этикетки: лицевая сторона даёт только догадку («Сок» вместо «Напиток «Крюшон»»)
    else if (pack && values) { const named = { product: read?.product || pack.product, brand: read?.brand || pack.brand }; setLabelValues({ ...values, basis: read?.basis || 'g', portion: read?.portion || null, net: read?.net || null, quote: read?.quote || '', labelId: read?.id || null, ...named }); single({ name: packName(named), from: 0, per100: values, label: true, food: null, options: pack.options || [], grams: String(read?.portion?.grams || guess?.grams || pack.net || 100) }); }
    else {
      // Блюдо → его продукты; ответ старого сервера без состава — блюдо само себе продукт
      const list = data.items.map((it, i) => ({ dish: { key: key(), name: it.name }, parts: (it.ingredients?.length ? it.ingredients : [it]).map(part => ({ name: part.name, per100: part.per100, food: part.match || null, options: pack && i === 0 ? pack.options || [] : part.options || [], grams: String(part.grams), from: i })) }));
      setDishes(list.map(x => x.dish));
      setItems(list.flatMap(x => x.parts.map(part => ({ ...part, key: key(), dish: x.dish.key }))));
    }
  }
  const pack = result?.package || null, aiKcal = result?.items?.[0]?.per100?.kcal;
  const unit = labelValues?.basis === 'ml' ? 'мл' : 'г', net = labelValues?.net || null;
  // Правки — по ключу строки, а не по номеру: ответ поиска приходит позже и не должен попасть в соседнюю
  const patch = (k, next) => setItems(list => list.map(it => it.key === k ? { ...it, ...next } : it));
  const drop = k => setItems(list => list.filter(it => it.key !== k));
  const rename = (k, name) => setDishes(list => list.map(d => d.key === k ? { ...d, name } : d));
  const blank = (dish, from = null) => ({ key: key(), dish, from, name: '', query: '', grams: '', per100: null, food: null, options: [], manual: true });
  const addTo = d => setItems(list => [...list, blank(d.key, list.find(it => it.dish === d.key)?.from ?? null)]);
  const addDish = () => { const d = key(); setDishes(list => [...list, { key: d, name: '' }]); setItems(list => [...list, blank(d)]); };
  const kept = items.filter(it => rowValues(it).grams > 0);
  const total = kept.reduce((s, it) => s + rowValues(it).kcal, 0);
  // Блюдо пишется пометкой, только когда в нём больше одного продукта: «Гречка» из одной гречки — просто гречка
  const dishOf = it => { const d = dishes.find(x => x.key === it.dish); return d && kept.filter(x => x.dish === it.dish).length > 1 ? d.name.trim() || 'Блюдо' : ''; };

  const save = async () => {
    setBusy('Записываем…'); setError(null);
    let done = 0;
    try {
      for (const it of kept) {
        const v = rowValues(it), dish = dishOf(it);
        // С этикетки — карточкой в справочник (как «Продукт с этикетки»), чтобы в следующий раз нашлась сразу
        if (it.label && !it.food) {
          const r = await apiMutate('food.add', { name: cap(labelValues?.product || pack?.product || it.name), brand: labelValues?.brand || pack?.brand || '', barcode: '', preparation: 'as_sold', unit: unit === 'мл' ? 'ml' : 'g', kcal: it.per100.kcal, protein: it.per100.protein, fat: it.per100.fat, carbs: it.per100.carbs }).catch(() => null);
          if (r?.food) it.food = { ...r.food, kind: 'food', unit: r.food.unit || (unit === 'мл' ? 'ml' : 'g') };
        }
        // Вписанные вручную калории без БЖУ — БЖУ «не знаю», а не 0
        const macro = k => it.per100[k] == null ? null : Math.round(v[k]);
        const payload = it.food
          ? { day, meal, amount: v.grams, product: { kind: 'food', id: it.food.id }, preview: { ...it.food, ...(dish ? { dish } : {}) } }
          : (() => {
            const product = { kind: 'quick', name: (it.name.trim() || 'Продукт') + ', ~' + n(v.grams) + ' г', kcal: Math.max(1, Math.round(v.kcal)), protein: macro('protein'), fat: macro('fat'), carbs: macro('carbs') };
            return { day, meal, amount: 1, product, preview: { ...product, id: 'pending', unit: 'portion', approx: true, source: 'Примерно · по фото', ...(dish ? { dish } : {}) } };
          })();
        await apiMutate('diary.entry.save', { ...payload, ...(dish ? { dish } : {}), requestId: requestId() });
        done++;
      }
      // Что записано на самом деле — для подсчёта точности; не мешает записи, если не дошло
      apiMutate('diary.photo.confirm', { id: result.id, items: kept.map(it => ({ name: it.food ? foodTitle(it.food) : it.name, dish: dishOf(it), grams: rowValues(it).grams, from: it.from, food: it.food?.id ?? null })) }).catch(() => {});
      haptic('success');
      onSaved('По фото записано: ' + n(total) + ' ккал, ' + kept.length + ' ' + productWord(kept.length) + '.');
    } catch (e) {
      // Часть уже записана — убираем записанное из списка, чтобы повтор не задвоил
      if (done) setItems(list => list.filter(it => !kept.slice(0, done).includes(it)));
      setError(e);
    } finally { setBusy(''); }
  };

  // Пояснений на экране нет по просьбе владельца (25.10.2026): про Яндекс —
  // один раз экраном-разрешением перед открытием всем (docs/legal, FT-736)
  return <Sheet title={'AI-распознавание · ' + label(meal)} dirty={items.length > 0} locked={!!busy} onClose={onClose}>
    <div className="plate-photo">
      {denied && !image && <Note tone="warning">Нет доступа к камере — разрешите его в настройках телефона или сделайте снимок.</Note>}
      {!image && !busy && <ScanGuide mode="plate" />}
      {image && <img className="food-scan-preview plate-photo__preview" src={image} alt="Снимок тарелки" />}
      <div className="diary-inline-actions">
        {onRescan ? <button type="button" className="button" disabled={!!busy} onClick={onRescan}>Сканировать снова</button> : <button type="button" className={'button' + (image ? '' : ' button--primary')} disabled={!!busy} onClick={() => camera.current.click()}>{image ? 'Переснять' : 'Сделать снимок'}</button>}
        <button type="button" className="button" disabled={!!busy} onClick={() => gallery.current.click()}>Выбрать фото</button>
      </div>
      <input ref={camera} className="food-scan-file" type="file" accept="image/*" capture="environment" aria-label="Снять тарелку" onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={gallery} className="food-scan-file" type="file" accept="image/*" aria-label="Выбрать фото тарелки" onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      {busy && <p role="status" className="small">{busy}</p>}
      <ErrorNote error={error} />
      {result && !busy && items.length === 0 && <Note tone="warning">Еды на фото не нашлось. Переснимите тарелку сверху целиком.</Note>}
      {pack && !busy && <div className="plate-pack">
        <strong>Упаковка: {packName(labelValues?.product ? labelValues : pack)}</strong>
        {pack.match ? <small>Нашли в справочнике — калории с этикетки, а не на глаз.</small>
          : labelValues ? <>{labelValues.quote && <blockquote className="plate-pack__quote">С этикетки: «{labelValues.quote}»</blockquote>}<small>{aiKcal ? 'AI на глаз давал ' + n(aiKcal) + ' ккал / 100 ' + unit + ', на этикетке ' + n(labelValues.kcal) + ' — ' + diffText(aiKcal, labelValues.kcal) + '.' : 'Цифры с этикетки — сверьте с упаковкой.'}</small></>
          : <><small>У упаковки AI считает на глаз и может ошибиться в разы. Отсканируйте таблицу «Пищевая ценность» — калории будут точными.</small>
            {!scan && <button type="button" className="button button--primary" onClick={() => { haptic(); setScan(true); }}>Сканировать этикетку</button>}</>}
        {scan && <PlateScanner labelFor={pack} base={{ image, data: result }} onResult={r => { setScan(false); if (r.label) show(image, result, r.label); }} onShot={() => setScan(false)} onFallback={() => setScan(false)} onClose={() => setScan(false)} />}
        {labelValues && items.length === 1 && <dl className="plate-pack__calc">
          {labelValues.portion && <div><dt>Порция · {n(labelValues.portion.grams)} {unit}</dt><dd>{calcLine(labelValues, labelValues.portion.grams)}</dd></div>}
          <div><dt>Записываем · {n(rowValues(items[0]).grams)} {unit}</dt><dd>{calcLine(labelValues, rowValues(items[0]).grams)}</dd></div>
        </dl>}
        {items.length === 1 && (net || labelValues || pack.match) && <div className="chips chips--wrap chips--flush" role="group" aria-label="Сколько съели">
          {[labelValues?.portion && ['Порция', labelValues.portion.grams], net && ['Вся упаковка', net], net && ['Половина', Math.round(net / 2)], ['100 ' + unit, 100], ['50 ' + unit, 50]].filter(Boolean).map(([t, g]) => <button key={t} type="button" className={'chip' + (String(g) === String(items[0].grams) ? ' chip--active' : '')} onClick={() => patch(0, { grams: String(g) })}>{t}{/\d/.test(t) ? '' : ' · ' + g + ' ' + unit}</button>)}
        </div>}
      </div>}
      {items.length > 0 && <>
        <ul className="plate-photo__list" aria-label="Распознанные блюда">
          {dishes.map(d => {
            const list = items.filter(it => it.dish === d.key);
            const row = it => <ProductRow key={it.key} it={it} unit={it.label ? unit : 'г'} onPatch={next => patch(it.key, next)} onDrop={() => drop(it.key)} />;
            if (list.length === 0) return null;
            if (list.length === 1) return row(list[0]);
            return <li key={d.key} className="plate-dish">
              <div className="plate-dish__head">
                <input className="field__input plate-dish__name" aria-label="Название блюда" placeholder="Название блюда" maxLength={80} value={d.name} onChange={e => rename(d.key, e.target.value)} />
                <span className="plate-dish__sum">{n(list.reduce((s, it) => s + rowValues(it).kcal, 0))} ккал</span>
                <button type="button" className="icon-button" aria-label={'Убрать блюдо ' + d.name} onClick={() => setItems(all => all.filter(it => it.dish !== d.key))}><IconTrash size={18} /></button>
              </div>
              <ul className="plate-dish__list" aria-label={'Из чего: ' + d.name}>{list.map(row)}</ul>
              <button type="button" className="button button--ghost plate-dish__add" onClick={() => addTo(d)}>+ продукт</button>
            </li>;
          })}
        </ul>
        {!pack && <button type="button" className="button button--ghost plate-dish__add" onClick={addDish}>+ Добавить продукт</button>}
        {/* Приём угадан по часам — поправить можно здесь же, до записи */}
        <div className="chips chips--wrap chips--flush plate-photo__meal" role="group" aria-label="Куда записать">{DIARY_MEALS.map(m => <button key={m.id} type="button" className={'chip' + (meal === m.id ? ' chip--active' : '')} aria-pressed={meal === m.id} onClick={() => setMeal(m.id)}>{m.label}</button>)}</div>
        <div className="diary-form-footer">
          <button type="button" className="button button--primary" disabled={!!busy || !kept.length} onClick={save}>Добавить {n(total)} ккал</button>
        </div>
      </>}
      {result?.id && !busy && <WrongAnswer state={wrong} onChange={setWrong} canFix={!!image && !labelValues && !pack?.match} onSend={async (comment, fix) => {
        setWrong({ text: comment, sending: true });
        try {
          // Пересчитать: тот же кадр + поправка → новый список (поправка сохраняется как отзыв к прошлому ответу)
          if (fix) { setBusy('AI пересчитывает с вашей поправкой…'); const data = await apiMutate('diary.photo', { image, hint: comment, fixOf: result.id }); show(image, data); haptic('success'); setWrong({ sent: true, fixed: true }); }
          else { await apiMutate('diary.photo.feedback', { id: result.id, labelId: labelValues?.labelId || null, comment }); haptic('success'); setWrong({ sent: true }); }
        } catch (e) { setWrong({ text: comment, error: e }); }
        finally { setBusy(''); }
      }} />}
    </div>
  </Sheet>;
}

/* Продукт блюда: название правится текстом и ищется в справочнике, выбранная
   карточка даёт КБЖУ «Из справочника»; без неё — оценка модели «примерно»,
   у добавленного вручную — калории на 100 г, если в справочнике нет */
function ProductRow({ it, unit, onPatch, onDrop }) {
  const v = rowValues(it), others = (it.options || []).filter(o => o.id !== it.food?.id);
  const name = it.food ? foodTitle(it.food) : it.name;
  useEffect(() => {
    const q = String(it.query || '').trim();
    if (q.length < 2) return undefined;
    let alive = true;
    // С паузой, а не на каждую букву; только граммовые карточки — лист считает на 100 г
    const timer = setTimeout(() => apiPublic('food.search', { q, separateBrand: true })
      .then(r => { if (alive) onPatch({ options: (r?.foods || []).filter(f => !f.unit || f.unit === 'g').slice(0, 4).map(f => ({ ...f, kind: 'food', unit: 'g' })) }); })
      .catch(() => {}), 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [it.query]);
  const source = it.food ? 'Из справочника · ' + n(it.food.kcal) + ' ккал / 100 г'
    : it.label ? 'С этикетки · ' + n(it.per100.kcal) + ' ккал · Б ' + one(it.per100.protein) + ' · Ж ' + one(it.per100.fat) + ' · У ' + one(it.per100.carbs) + ' на 100 ' + unit
      : it.manual ? (it.per100 ? 'Примерно · ' + n(it.per100.kcal) + ' ккал / 100 г' : 'Выберите из справочника или впишите калории')
        : 'Примерно, оценка по фото · ' + n(it.per100.kcal) + ' ккал / 100 г';
  return <li className="plate-photo__row">
    <div className="plate-photo__main">
      <input className="field__input plate-photo__name" aria-label="Продукт" placeholder="Продукт" maxLength={80} autoFocus={it.manual && !it.name} value={name} onChange={e => onPatch({ name: e.target.value, query: e.target.value, food: null })} />
      <small>{source}</small>
      {(others.length > 0 || (it.food && it.per100)) && <div className="plate-photo__options" role="group" aria-label={'Из справочника: ' + name}>
        {it.food && it.per100 && <button type="button" className="chip" onClick={() => onPatch({ food: null })}>{it.manual ? 'Свои калории' : 'Оценка по фото'}</button>}
        {others.map(o => <button type="button" className="chip" key={o.id} onClick={() => onPatch({ food: o, query: null })}>{foodTitle(o)}</button>)}
      </div>}
      {it.manual && !it.food && <label className="plate-photo__kcal"><input className="field__input" inputMode="decimal" aria-label={'Калории на 100 г: ' + (name || 'продукт')} placeholder="ккал" value={it.kcal100 || ''} onChange={e => { const k = decimal(e.target.value); onPatch({ kcal100: e.target.value, per100: Number.isFinite(k) && k > 0 ? { kcal: k, protein: null, fat: null, carbs: null } : null }); }} /><span>ккал на 100 г</span></label>}
    </div>
    <div className="plate-photo__grams">
      <input className="field__input" inputMode="decimal" aria-label={'Граммы: ' + (name || 'продукт')} placeholder={unit} value={it.grams} onChange={e => onPatch({ grams: e.target.value })} />
      <span>{unit} · {n(v.kcal)} ккал</span>
    </div>
    <button type="button" className="icon-button" aria-label={'Убрать ' + (name || 'продукт')} onClick={onDrop}><IconTrash size={18} /></button>
  </li>;
}

const WRONG_REASONS = ['Не то блюдо', 'Не те граммы', 'Не те калории', 'Это напиток', 'Не тот продукт'];
// Ссылка «AI ошибся?» → причины чипами и своими словами. state: null — свёрнуто, { text } — пишут, { sent } — отправлено
function WrongAnswer({ state, onChange, onSend, canFix }) {
  if (state?.sent) return <p className="small muted plate-photo__wrong-done">{state.fixed ? 'Пересчитали с вашей поправкой — проверьте список. Поправку запомнили, чтобы сканер ошибался реже.' : 'Спасибо — передали. По таким отзывам сканер учится ошибаться реже.'}</p>;
  if (!state) return <button type="button" className="button button--ghost plate-photo__wrong" onClick={() => onChange({ text: '' })}>AI ошибся?</button>;
  const text = state.text || '';
  const add = reason => onChange({ ...state, text: text.includes(reason) ? text : (text ? text.replace(/[\s.,]*$/, '') + ', ' : '') + reason.toLowerCase() });
  return <div className="plate-photo__wrong-form">
    <strong>{canFix ? 'Что на самом деле?' : 'Что не так?'}</strong>
    <div className="chips chips--wrap chips--flush" role="group" aria-label="Причина">{WRONG_REASONS.map(r => <button key={r} type="button" className="chip" onClick={() => add(r)}>{r}</button>)}</div>
    <label className="field"><span className="field__label">Своими словами</span><textarea className="field__input" rows={3} maxLength={300} value={text} placeholder={canFix ? 'Например: паста с тунцом, а не с курицей' : 'Например: это газировка, а не сок; бутылка 2 л'} onChange={e => onChange({ ...state, text: e.target.value })} /></label>
    <p className="small muted">{canFix ? 'Напишите, что на самом деле на тарелке, — AI посчитает заново. ' : ''}Только про еду, без имён и личных данных. Поправку увидит владелец приложения — чтобы научить сканер.</p>
    {state.error && <ErrorNote error={state.error} />}
    <div className="diary-inline-actions">{canFix
      ? <button type="button" className="button button--primary" disabled={state.sending || text.trim().length < 2} onClick={() => onSend(text.trim(), true)}>Пересчитать</button>
      : <button type="button" className="button button--primary" disabled={state.sending || text.trim().length < 2} onClick={() => onSend(text.trim(), false)}>Отправить</button>}<button type="button" className="button button--ghost" onClick={() => onChange(null)}>Отмена</button></div>
  </div>;
}
