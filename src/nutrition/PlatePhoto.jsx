import React, { useEffect, useRef, useState } from 'react';
import { apiMutate } from '../api.js';
import { Note, Sheet } from '../ui.jsx';
import { IconTrash } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { foodTitle } from './FoodFields.jsx';
import ScanGuide from './ScanGuide.jsx';
import FoodScan from './FoodScan.jsx';
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
 */
const SIDE = 1024;

async function shrink(file) {
  const { preparePhoto } = await import('./food-recognition.js');
  const big = await preparePhoto(file);
  const k = Math.min(1, SIDE / Math.max(big.width, big.height));
  const c = document.createElement('canvas');
  c.width = Math.round(big.width * k); c.height = Math.round(big.height * k);
  c.getContext('2d').drawImage(big, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

const per = (v, g) => Math.round(Number(v || 0) * g) / 100;
const one = v => String(Math.round(Number(v || 0) * 10) / 10).replace('.', ',');
const packName = pack => [pack?.product, pack?.brand].filter(Boolean).join(' · ') || 'продукт';
// «на 39 % меньше» — насколько оценка на глаз разошлась с этикеткой
const diffText = (ai, real) => { const d = Math.round((ai - real) / real * 100); return d === 0 ? 'совпало' : 'на ' + Math.abs(d) + ' % ' + (d < 0 ? 'меньше' : 'больше'); };

// Строка списка: что записываем и сколько это калорий при этих граммах
function rowValues(it) {
  const g = decimal(it.grams), src = it.food || it.per100;
  const grams = Number.isFinite(g) && g > 0 ? g : 0;
  return { grams, kcal: per(src.kcal, grams), protein: per(src.protein, grams), fat: per(src.fat, grams), carbs: per(src.carbs, grams) };
}

// file — кадр AI-сканера (PlateScanner, FT-746): лист сразу его распознаёт, onRescan —
// «Сканировать снова» обратно в видоискатель. Без file — запасной путь, когда
// камеры в браузере нет (denied — не дали разрешение): «как снять» и снимок
export function PlatePhoto({ day, meal: initialMeal, file, denied = false, onRescan, onClose, onSaved }) {
  const [image, setImage] = useState(''), [result, setResult] = useState(null), [items, setItems] = useState([]);
  const [busy, setBusy] = useState(''), [error, setError] = useState(null), [meal, setMeal] = useState(initialMeal);
  // Упаковка (FT-748): labelValues — КБЖУ на 100 г с этикетки (с фото или отсканированные), scan — открыт сканер этикетки
  const [labelValues, setLabelValues] = useState(null), [scan, setScan] = useState(false);
  const camera = useRef(null), gallery = useRef(null), sequence = useRef(0);
  useEffect(() => { if (file) void take(file); }, []);

  const take = async file => {
    if (!file) return;
    const ticket = ++sequence.current;
    setError(null); setResult(null); setItems([]); setLabelValues(null); setScan(false); setBusy('Готовим фото…');
    try {
      const src = await shrink(file);
      if (ticket !== sequence.current) return;
      setImage(src); setBusy('AI распознаёт блюда… обычно 2–5 секунд');
      const data = await apiMutate('diary.photo', { image: src });
      if (ticket !== sequence.current) return;
      setResult(data);
      const pack = data.package, guess = data.items[0];
      if (pack?.match) setItems([{ ...(guess || {}), name: foodTitle(pack.match), from: 0, food: pack.match, options: pack.options || [], grams: String(guess?.grams || pack.net || 100) }]);
      else if (pack?.label) { setLabelValues(pack.label); setItems([{ name: packName(pack), from: 0, per100: pack.label, label: true, food: null, options: [], grams: String(guess?.grams || pack.net || 100) }]); }
      else setItems(data.items.map((it, i) => ({ ...it, from: i, food: it.match || null, grams: String(it.grams) })));
      haptic('success');
    } catch (e) { if (ticket === sequence.current) setError(e); }
    finally { if (ticket === sequence.current) setBusy(''); }
  };
  const pack = result?.package || null, aiKcal = result?.items?.[0]?.per100?.kcal;
  // Этикетку прочитал сканер: одна строка с цифрами этикетки вместо оценки на глаз
  const applyLabel = fields => {
    const v = { kcal: Number(fields.kcal), protein: Number(fields.protein || 0), fat: Number(fields.fat || 0), carbs: Number(fields.carbs || 0) };
    setScan(false);
    if (!Number.isFinite(v.kcal) || v.kcal <= 0) { setError(new Error('Калории на этикетке не прочитались. Отсканируйте таблицу ещё раз крупнее.')); return; }
    setLabelValues(v);
    setItems(list => [{ name: packName(pack), from: 0, per100: v, label: true, food: null, options: [], grams: list[0]?.grams || String(pack?.net || 100) }]);
  };
  const patch = (i, next) => setItems(list => list.map((it, k) => k === i ? { ...it, ...next } : it));
  const drop = i => setItems(list => list.filter((_, k) => k !== i));
  const kept = items.filter(it => rowValues(it).grams > 0);
  const total = kept.reduce((s, it) => s + rowValues(it).kcal, 0);

  const save = async () => {
    setBusy('Записываем…'); setError(null);
    let done = 0;
    try {
      for (const it of kept) {
        const v = rowValues(it);
        // С этикетки — карточкой в справочник (как «Продукт с этикетки»), чтобы в следующий раз нашлась сразу
        if (it.label && !it.food) {
          const r = await apiMutate('food.add', { name: pack?.product || it.name, brand: pack?.brand || '', barcode: '', preparation: 'as_sold', unit: 'g', kcal: it.per100.kcal, protein: it.per100.protein, fat: it.per100.fat, carbs: it.per100.carbs }).catch(() => null);
          if (r?.food) it.food = { ...r.food, kind: 'food', unit: r.food.unit || 'g' };
        }
        const payload = it.food
          ? { day, meal, amount: v.grams, product: { kind: 'food', id: it.food.id }, preview: it.food }
          : (() => {
            const product = { kind: 'quick', name: it.name + ', ~' + n(v.grams) + ' г', kcal: Math.max(1, Math.round(v.kcal)), protein: Math.round(v.protein), fat: Math.round(v.fat), carbs: Math.round(v.carbs) };
            return { day, meal, amount: 1, product, preview: { ...product, id: 'pending', unit: 'portion', approx: true, source: 'Примерно · по фото' } };
          })();
        await apiMutate('diary.entry.save', { ...payload, requestId: requestId() });
        done++;
      }
      // Что записано на самом деле — для подсчёта точности; не мешает записи, если не дошло
      apiMutate('diary.photo.confirm', { id: result.id, items: kept.map(it => ({ name: it.food ? foodTitle(it.food) : it.name, grams: rowValues(it).grams, from: it.from, food: it.food?.id ?? null })) }).catch(() => {});
      haptic('success');
      onSaved('По фото записано: ' + n(total) + ' ккал, ' + kept.length + ' ' + (kept.length === 1 ? 'блюдо' : kept.length < 5 ? 'блюда' : 'блюд') + '.');
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
        <strong>Упаковка: {packName(pack)}</strong>
        {pack.match ? <small>Нашли в справочнике — калории с этикетки, а не на глаз.</small>
          : labelValues ? <small>{aiKcal ? 'AI на глаз давал ' + n(aiKcal) + ' ккал / 100 г, на этикетке ' + n(labelValues.kcal) + ' — ' + diffText(aiKcal, labelValues.kcal) + '.' : 'Цифры с этикетки — сверьте с упаковкой.'}</small>
          : <><small>У упаковки AI считает на глаз и может ошибиться в разы. Отсканируйте таблицу «Пищевая ценность» — калории будут точными.</small>
            {!scan && <button type="button" className="button button--primary" onClick={() => { haptic(); setScan(true); }}>Сканировать этикетку</button>}</>}
        {scan && <FoodScan compact start="label" onClose={() => setScan(false)} onDraft={applyLabel} />}
        {items.length === 1 && (pack.net || labelValues || pack.match) && <div className="chips chips--wrap chips--flush" role="group" aria-label="Сколько съели">
          {[pack.net && ['Вся упаковка', pack.net], pack.net && ['Половина', Math.round(pack.net / 2)], ['100 г', 100], ['50 г', 50]].filter(Boolean).map(([t, g]) => <button key={t} type="button" className={'chip' + (String(g) === String(items[0].grams) ? ' chip--active' : '')} onClick={() => patch(0, { grams: String(g) })}>{t}{t.endsWith('г') ? '' : ' · ' + g + ' г'}</button>)}
        </div>}
      </div>}
      {items.length > 0 && <>
        <ul className="plate-photo__list" aria-label="Распознанные блюда">
          {items.map((it, i) => {
            const v = rowValues(it), others = (it.options || []).filter(o => o.id !== it.food?.id);
            return <li key={it.from} className="plate-photo__row">
              <div className="plate-photo__main">
                <strong>{it.food ? foodTitle(it.food) : it.name}</strong>
                <small>{it.food ? 'Из справочника · ' + n(it.food.kcal) + ' ккал / 100 г' : it.label ? 'С этикетки · ' + n(it.per100.kcal) + ' ккал · Б ' + one(it.per100.protein) + ' · Ж ' + one(it.per100.fat) + ' · У ' + one(it.per100.carbs) + ' на 100 г' : 'Примерно, оценка по фото · ' + n(it.per100.kcal) + ' ккал / 100 г'}</small>
                {(others.length > 0 || it.food) && <div className="plate-photo__options">
                  {it.food && <button type="button" className="chip" onClick={() => patch(i, { food: null })}>Оценка по фото</button>}
                  {others.map(o => <button type="button" className="chip" key={o.id} onClick={() => patch(i, { food: o })}>{foodTitle(o)}</button>)}
                </div>}
              </div>
              <div className="plate-photo__grams">
                <input className="field__input" inputMode="decimal" aria-label={'Граммы: ' + it.name} value={it.grams} onChange={e => patch(i, { grams: e.target.value })} />
                <span>г · {n(v.kcal)} ккал</span>
              </div>
              <button type="button" className="icon-button" aria-label={'Убрать ' + it.name} onClick={() => drop(i)}><IconTrash size={18} /></button>
            </li>;
          })}
        </ul>
        {/* Приём угадан по часам — поправить можно здесь же, до записи */}
        <div className="chips chips--wrap chips--flush plate-photo__meal" role="group" aria-label="Куда записать">{DIARY_MEALS.map(m => <button key={m.id} type="button" className={'chip' + (meal === m.id ? ' chip--active' : '')} aria-pressed={meal === m.id} onClick={() => setMeal(m.id)}>{m.label}</button>)}</div>
        <div className="diary-form-footer">
          <button type="button" className="button button--primary" disabled={!!busy || !kept.length} onClick={save}>Добавить {n(total)} ккал</button>
        </div>
      </>}
    </div>
  </Sheet>;
}
