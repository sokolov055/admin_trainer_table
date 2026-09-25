import React, { useMemo, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import {
  Section, Panel, Chips, Loading, ErrorState, Empty, Note, Field, Badge, Search, formatNumber, plural,
} from '../ui.jsx';
import { IconAlert, IconBack, IconNutrition, IconTrash } from '../icons.jsx';

/**
 * Блюда для рациона клиентов (Шаблоны → Блюда).
 *
 * Новые блюда приходят черновиками: клиент видит только опубликованные.
 * Здесь тренер читает состав, КБЖУ и рецепт, публикует или скрывает, правит
 * граммовку и шаги, заводит своё. КБЖУ и метки («быстро», «без молочного»…)
 * сервер считает из состава сам — вписывать их руками не нужно и нельзя.
 */

const STATUS = [
  { value: 'draft', label: 'Черновики' },
  { value: 'published', label: 'У клиентов' },
  { value: 'hidden', label: 'Скрытые' },
];
const MEALS = ['завтрак', 'обед', 'ужин', 'перекус'];

export default function Dishes() {
  const { loading, data, error, reload } = useData('dishes.list', {}, []);
  const [status, setStatus] = useState('draft');
  const [meal, setMeal] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const dishes = data.dishes || [];
  const foods = data.foods || [];

  if (editing) {
    return (
      <DishEditor
        dish={editing.new ? null : editing}
        foods={foods}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => { setEditing(null); setOpen(saved.id); reload(); }}
      />
    );
  }

  const current = open ? dishes.find((d) => d.id === open) : null;
  if (current) {
    return <DishView dish={current} onBack={() => setOpen(null)} onEdit={() => setEditing(current)} onChanged={reload} />;
  }

  const count = (s) => dishes.filter((d) => d.status === s).length;
  const shown = dishes
    .filter((d) => d.status === status)
    .filter((d) => !meal || d.meal === meal)
    .filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="library__bar">
        <button className="button button--primary" onClick={() => setEditing({ new: true })}>Своё блюдо</button>
      </div>
      <Chips items={STATUS.map((s) => ({ value: s.value, label: s.label + ' · ' + count(s.value) }))} value={status} onChange={setStatus} />
      <Search value={q} onChange={setQ} placeholder="Поиск блюда" />
      <Chips items={[{ value: '', label: 'Все' }, ...MEALS.map((m) => ({ value: m, label: m }))]} value={meal} onChange={setMeal} />

      {status === 'draft' && count('draft') > 0 && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Черновики клиенты не видят. Откройте блюдо, проверьте состав и рецепт — и опубликуйте.
        </p>
      )}

      {shown.length === 0 && (
        <Empty icon={IconNutrition} title="Здесь пусто" text={status === 'draft' ? 'Все черновики разобраны.' : 'Блюд с таким отбором нет.'} />
      )}

      <Section>
        {shown.map((d) => (
          <button className="item" key={d.id} onClick={() => { setOpen(d.id); haptic(); }}>
            <div className="item__top">
              <span className="item__name">{d.name}</span>
              <span className="item__amount">{d.per.kcal} ккал</span>
            </div>
            <div className="item__meta">
              <span>{d.meal}</span>
              <span>Б {formatNumber(d.per.protein)} · Ж {formatNumber(d.per.fat)} · У {formatNumber(d.per.carbs)}</span>
              <span>{d.minutes} мин</span>
            </div>
          </button>
        ))}
      </Section>
    </>
  );
}

function DishView({ dish, onBack, onEdit, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const setStatus = async (status) => {
    setBusy(true);
    setFailure(null);
    try {
      await apiMutate('dish.status', { id: dish.id, status });
      haptic('success');
      onChanged();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="button button--ghost library__back" onClick={onBack}><IconBack size={16} />Блюда</button>
      <Panel pad>
        <h2 className="library__title">{dish.name}</h2>
        <div className="item__meta" style={{ marginBottom: 'var(--space-3)' }}>
          <Badge kind={dish.status === 'published' ? 'good' : undefined}>
            {dish.status === 'published' ? 'у клиентов' : dish.status === 'hidden' ? 'скрыто' : 'черновик'}
          </Badge>
          <span>{dish.meal}</span>
          <span>{dish.minutes} мин</span>
          <span>{dish.portions} {plural(dish.portions, 'порция', 'порции', 'порций')}</span>
        </div>

        <p className="dish__per">
          <strong>{dish.per.kcal} ккал</strong> на порцию · Б {formatNumber(dish.per.protein)} · Ж {formatNumber(dish.per.fat)} · У {formatNumber(dish.per.carbs)}
        </p>
        {dish.tags.length > 0 && (
          <div className="dish__tags">{dish.tags.map((t) => <span key={t} className="card__tag">{t}</span>)}</div>
        )}

        <h3 className="dish__h">Состав на всё блюдо</h3>
        <ul className="dish__items">
          {dish.items.map((i) => <li key={i.food}><span>{i.food}</span><span>{formatNumber(i.grams)} г</span></li>)}
        </ul>

        <h3 className="dish__h">Как готовить</h3>
        <ol className="recipe__steps">{dish.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>

        {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

        <div className="library__actions">
          {dish.status !== 'published' && (
            <button className="button button--primary" disabled={busy} onClick={() => setStatus('published')}>Опубликовать</button>
          )}
          <button className="button" disabled={busy} onClick={onEdit}>Изменить</button>
          {dish.status !== 'hidden'
            ? <button className="button button--ghost" disabled={busy} onClick={() => setStatus('hidden')}>Скрыть</button>
            : <button className="button button--ghost" disabled={busy} onClick={() => setStatus('draft')}>В черновики</button>}
        </div>
        <p className="small muted">КБЖУ и метки считаются из состава: поправите граммы — цифры пересчитаются сами.</p>
      </Panel>
    </>
  );
}

/** Своё блюдо или правка: состав — из справочника, шаги — по строке */
function DishEditor({ dish, foods, onCancel, onSaved }) {
  const [name, setName] = useState(dish ? dish.name : '');
  const [meal, setMeal] = useState(dish ? dish.meal : 'обед');
  const [portions, setPortions] = useState(String(dish ? dish.portions : 1));
  const [minutes, setMinutes] = useState(String(dish ? dish.minutes : 20));
  const [budget, setBudget] = useState(dish ? dish.budget : true);
  const [items, setItems] = useState(dish ? dish.items.map((i) => ({ ...i, grams: String(i.grams) })) : [{ food: '', grams: '' }]);
  const [steps, setSteps] = useState(dish ? dish.steps.join('\n') : '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const names = useMemo(() => foods.map((f) => f.name), [foods]);
  const setItem = (k, key, value) => setItems((list) => list.map((it, i) => (i === k ? { ...it, [key]: value } : it)));

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const saved = await apiMutate('dish.save', {
        id: dish ? dish.id : undefined,
        name, meal, portions: Number(portions), minutes: Number(minutes), budget,
        items: items.filter((i) => i.food.trim()).map((i) => ({ food: i.food.trim(), grams: Number(String(i.grams).replace(',', '.')) })),
        steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      haptic('success');
      onSaved(saved);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="button button--ghost library__back" onClick={onCancel}><IconBack size={16} />Отмена</button>
      <Panel pad>
        <div className="library__form">
          <Field label="Название" inputMode="text" value={name} onChange={setName} placeholder="Гречка с курицей" />
          <div>
            <span className="field__label">Приём пищи</span>
            <Chips items={MEALS.map((m) => ({ value: m, label: m }))} value={meal} onChange={setMeal} />
          </div>
          <div className="field-row">
            <Field label="Порций" value={portions} onChange={setPortions} />
            <Field label="Минут на готовку" value={minutes} onChange={setMinutes} />
          </div>
          <label className="library__check">
            <input type="checkbox" checked={budget} onChange={(e) => setBudget(e.target.checked)} />
            <span>Бюджетное — без дорогих продуктов</span>
          </label>

          <div>
            <span className="field__label">Состав на всё блюдо (граммы до готовки)</span>
            <div className="dish__edit-items">
              {items.map((it, k) => (
                <div className="dish__edit-row" key={k}>
                  <FoodInput names={names} value={it.food} onChange={(v) => setItem(k, 'food', v)} />
                  <input className="field__input" inputMode="decimal" placeholder="г" value={it.grams} onChange={(e) => setItem(k, 'grams', e.target.value)} />
                  <button type="button" className="icon-button" aria-label="Убрать продукт" onClick={() => setItems((l) => l.filter((_, i) => i !== k))}><IconTrash size={16} /></button>
                </div>
              ))}
            </div>
            <button type="button" className="button button--ghost" onClick={() => setItems((l) => [...l, { food: '', grams: '' }])}>Добавить продукт</button>
          </div>

          <label className="field">
            <span className="field__label">Как готовить — каждый шаг с новой строки</span>
            <textarea className="field__input library__textarea" rows={6} value={steps} onChange={(e) => setSteps(e.target.value)} />
          </label>

          {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}

          <div className="library__actions">
            <button className="button button--primary" disabled={busy} onClick={save}>{busy ? 'Сохраняю…' : 'Сохранить'}</button>
            <button className="button" disabled={busy} onClick={onCancel}>Отмена</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Новое блюдо сохраняется черновиком — опубликуете, когда будет готово.</p>
        </div>
      </Panel>
    </>
  );
}

/**
 * Продукт из справочника с подсказками — списком прямо под полем, а не
 * встроенным списком браузера: его Safari на iPhone почти не показывает.
 */
function FoodInput({ names, value, onChange }) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const known = names.includes(value);
  const matches = q && !known ? names.filter((n) => n.toLowerCase().includes(q)).slice(0, 6) : [];
  return (
    <div className="dish__food">
      <input
        className="field__input"
        placeholder="Продукт из справочника"
        value={value}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="dish__food-list" role="listbox">
          {matches.map((n) => (
            <button type="button" role="option" aria-selected={false} key={n} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(n); setOpen(false); }}>{n}</button>
          ))}
        </div>
      )}
      {q && !known && matches.length === 0 && <span className="small muted">нет в справочнике</span>}
    </div>
  );
}
