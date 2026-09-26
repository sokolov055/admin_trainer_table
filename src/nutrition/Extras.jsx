import React, { useEffect, useState } from 'react';
import { apiPublic } from '../api.js';
import { Section, Panel, Note, formatNumber } from '../ui.jsx';
import { IconClose, IconAlert, IconHeart } from '../icons.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { haptic } from '../telegram.js';
import { extraOf, cleanProduct } from './match.js';

/**
 * «Своё сегодня» — то, что съедено или будет съедено помимо подобранных
 * блюд: сникерс, кофе с сиропом, обед в кафе. Добавленное вычитается из
 * нормы, и день пересобирается под остаток.
 *
 * Продукты — общая база на всех клиентов (сервер, food.*): один вписал
 * сникерс с упаковки — остальные находят его поиском. Недавние ещё и на
 * устройстве: без сети их всё равно можно добавить.
 */

const macros = (v) => `${formatNumber(v.kcal)} ккал · Б ${formatNumber(v.protein)} · Ж ${formatNumber(v.fat)} · У ${formatNumber(v.carbs)}`;

export default function Extras({ extras, products, onAdd, onRemove, trial = false }) {
  const [open, setOpen] = useState(false);

  return (
    <Section title="Своё сегодня" note="съели или собираетесь — день подстроится">
      {extras.length > 0 && (
        <Panel>
          <div className="extras__list">
            {/* Смахнуть влево — убрать, как в списках iPhone */}
            {extras.map((item) => (
              <SwipeRow key={item.id} contentClassName="extras__row" label={'Убрать ' + item.product.name} actionText="Убрать"
                onDelete={() => { onRemove(item.id); haptic(); }}>
                <div>
                  <div className="extras__name">{item.product.name}</div>
                  <div className="extras__meta">{amountLabel(item)} · {macros(extraOf(item.product, item.grams))}</div>
                </div>
              </SwipeRow>
            ))}
          </div>
        </Panel>
      )}

      {open
        ? <AddForm products={products} trial={trial} onAdd={(entry) => { onAdd(entry); setOpen(false); }} onCancel={() => setOpen(false)} />
        : (
          <button className="button button--block extras__add" onClick={() => setOpen(true)}>
            Добавить своё
          </button>
        )}
    </Section>
  );
}

function amountLabel(item) {
  if (item.pieces && item.product.piece) return formatNumber(item.pieces) + ' шт. (' + formatNumber(item.grams) + ' г)';
  return formatNumber(item.grams) + ' г';
}

/**
 * Выбрать из своих или завести новый. Цифры — ровно как на упаковке: на
 * 100 г. Вес штуки нужен, чтобы дальше считать батончиками, а не граммами.
 */
function AddForm({ products, onAdd, onCancel, trial = false }) {
  const [picked, setPicked] = useState(null);
  const [fields, setFields] = useState({ name: '', kcal: '', protein: '', fat: '', carbs: '', piece: '' });
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('g');
  const [errors, setErrors] = useState([]);

  const [shared, setShared] = useState([]);
  // Лайк — в избранное, на сервере. Меняем сразу, не дожидаясь ответа:
  // сердечко, которое загорается через секунду, кажется сломанным.
  const [likes, setLikes] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const set = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));
  const q = fields.name.trim().toLowerCase();

  // Общая база — по мере ввода, с паузой: не на каждую букву
  useEffect(() => {
    if (picked) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      apiPublic('food.search', { q: fields.name.trim() })
        .then((r) => { if (alive) setShared((r && r.foods) || []); })
        .catch(() => { if (alive) setShared([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [fields.name, picked]);

  // Сначала общая база, недавние с устройства — если их там нет (офлайн)
  const local = products.filter((p) => !q || p.name.toLowerCase().includes(q));
  const matches = picked ? [] : [...shared, ...local.filter((p) => !shared.some((s) => s.name.toLowerCase() === p.name.toLowerCase()))].slice(0, 8);

  const submit = async (event) => {
    event.preventDefault();
    const res = picked ? { product: picked, errors: [] } : cleanProduct(fields);
    const qty = Number(String(amount).replace(',', '.'));
    const errs = [...res.errors];
    if (!Number.isFinite(qty) || qty <= 0) errs.push(unit === 'pcs' ? 'Сколько штук' : 'Сколько граммов');
    if (errs.length) { setErrors(errs); return; }

    let product = res.product;
    setBusy(true);
    setErrors([]);
    try {
      if (trial) {
        // Проба тренера: общую базу не трогаем — ни новых продуктов, ни счётчиков
      } else if (!picked) {
        // Новый — в общую базу. Такое название там уже есть — берутся его
        // цифры, и об этом говорим: человек вписывал свои.
        const saved = await apiPublic('food.add', fields);
        product = saved.food;
        if (saved.existed) setNote('«' + product.name + '» уже был в базе — взяты его цифры.');
      } else if (picked.id && typeof picked.id === 'number') {
        apiPublic('food.use', { id: picked.id }).catch(() => {});
      }
    } catch (err) {
      // Без сети — продукт остаётся только на этом устройстве
      if (err && err.code >= 400 && err.code < 500) { setErrors([err.message]); setBusy(false); return; }
    }
    setBusy(false);

    const pieceGrams = product.piece;
    if (unit === 'pcs' && !pieceGrams) { setErrors(['Укажите вес одной штуки']); return; }
    const grams = unit === 'pcs' ? Math.round(qty * pieceGrams) : Math.round(qty);
    haptic('success');
    onAdd({ product, grams, pieces: unit === 'pcs' ? qty : 0 });
  };

  const isLiked = (p) => (p.id in likes ? likes[p.id] : !!p.liked);
  const canLike = (p) => typeof p.id === 'number';
  const toggleLike = (p) => {
    const next = !isLiked(p);
    setLikes((m) => ({ ...m, [p.id]: next }));
    haptic();
    if (trial) return; // в пробе лайк только на экране
    apiPublic('food.like', { id: p.id, liked: next })
      .catch(() => setLikes((m) => ({ ...m, [p.id]: !next })));
  };

  const heart = (p) => canLike(p) && (
    <button
      type="button"
      className={'extras__like' + (isLiked(p) ? ' extras__like--on' : '')}
      aria-pressed={isLiked(p)}
      aria-label={(isLiked(p) ? 'Убрать из избранного: ' : 'В избранное: ') + p.name}
      onClick={() => toggleLike(p)}
    >
      <IconHeart size={16} />
    </button>
  );

  const choose = (p) => {
    setPicked(p);
    setUnit(p.piece ? 'pcs' : 'g');
    setAmount(p.piece ? '1' : '');
    setErrors([]);
    haptic();
  };

  const pieceKnown = picked ? !!picked.piece : String(fields.piece).trim() !== '';

  return (
    <Panel pad>
      <form className="extras__form" onSubmit={submit}>
        {picked ? (
          <div className="extras__picked">
            <div>
              <div className="extras__name">{picked.name}</div>
              <div className="extras__meta">на 100 г: {macros(picked)}{picked.piece ? ' · 1 шт. = ' + formatNumber(picked.piece) + ' г' : ''}</div>
            </div>
            <div className="extras__picked-actions">
              {heart(picked)}
              <button type="button" className="button button--ghost" onClick={() => { setPicked(null); setAmount(''); }}>Другой</button>
            </div>
          </div>
        ) : (
          <>
            <label className="field">
              <span className="field__label">Что это</span>
              <input className="field__input" value={fields.name} maxLength={60} placeholder="название продукта или блюда" onChange={set('name')} autoComplete="off" />
            </label>

            {matches.length > 0 && (
              <div className="extras__matches">
                <span className="small muted">
                  {q ? 'Нашлось в базе' : matches.some(isLiked) ? 'Избранное и частые' : 'Часто добавляют'}
                </span>
                {matches.map((p) => (
                  <span className="extras__saved" key={p.id}>
                    <button type="button" className="chip" onClick={() => choose(p)}>{p.name}</button>
                    {heart(p)}
                  </span>
                ))}
              </div>
            )}
            {q && matches.length === 0 && (
              <p className="small muted" style={{ margin: 0 }}>
                {trial ? 'В базе такого нет — в пробе продукт останется только у вас.' : 'В базе такого нет — впишите цифры, и продукт появится у всех.'}
              </p>
            )}

            <p className="small muted" style={{ margin: 0 }}>С упаковки, на 100 г. Белки, жиры и углеводы — если написаны.</p>
            <div className="extras__grid">
              <Num label="Ккал" value={fields.kcal} onChange={set('kcal')} />
              <Num label="Белки, г" value={fields.protein} onChange={set('protein')} />
              <Num label="Жиры, г" value={fields.fat} onChange={set('fat')} />
              <Num label="Углев., г" value={fields.carbs} onChange={set('carbs')} />
            </div>
            <Num label="Вес одной штуки, г — если считаете штуками" value={fields.piece} onChange={set('piece')} />
          </>
        )}

        <div className="extras__amount">
          <Num label={unit === 'pcs' ? 'Сколько штук' : 'Сколько граммов'} value={amount} onChange={(e) => setAmount(e.target.value)} />
          {pieceKnown && (
            <div className="extras__unit" role="radiogroup" aria-label="Единица">
              <button type="button" className={'chip' + (unit === 'g' ? ' chip--active' : '')} aria-checked={unit === 'g'} role="radio" onClick={() => setUnit('g')}>г</button>
              <button type="button" className={'chip' + (unit === 'pcs' ? ' chip--active' : '')} aria-checked={unit === 'pcs'} role="radio" onClick={() => setUnit('pcs')}>шт.</button>
            </div>
          )}
        </div>

        {errors.length > 0 && <Note tone="critical" icon={IconAlert}>{errors.join('. ') + '.'}</Note>}
        {note && <p className="small muted" style={{ margin: 0 }}>{note}</p>}

        <div className="ration__actions">
          <button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Добавляю…' : 'Добавить в день'}</button>
          <button className="button" type="button" onClick={onCancel}>Отмена</button>
        </div>
      </form>
    </Panel>
  );
}

function Num({ label, value, onChange }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__input" inputMode="decimal" value={value} maxLength={7} onChange={onChange} />
    </label>
  );
}
