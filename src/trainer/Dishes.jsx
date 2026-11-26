import { useReturnScroll } from '../scroll.js';
import React, { useMemo, useState } from 'react';
import { useData } from '../useData.js';
import { apiMutate } from '../api.js';
import { haptic } from '../telegram.js';
import {
  Panel, Chips, Segmented, Loading, ErrorState, Empty, Note, Field, Tag, Search, formatNumber, plural,
  BackButton, Sheet,
} from '../ui.jsx';
import {
  IconAlert, IconNutrition, IconSearch, IconClose, IconPlus, IconEye, IconClock, IconFlame, IconSend,
  IconRefresh, IconBolt, IconMoney, IconDumbbell, IconArrowDown, IconArrowUp, IconSunrise, IconBowl,
  IconMoon, IconNoMilk, IconSliders, IconCopy,
} from '../icons.jsx';
import SwipeRow from '../SwipeRow.jsx';
import { EGG_SIZES, pieceLabel, mlLabel } from '../nutrition/pieces.js';
import { carbLevel, carbTag } from '../nutrition/carbs.js';
import '../nutrition/carbs.css';
import { NO_FILTERS, filterCount, shownDishes } from './dish-list-model.js';
import { Tiles } from './ProgramList.jsx';
/* plib-* — общий язык списков «Программ»; meal-* — приёмы пищи */
import './programs-lib.css';
import './dishes-lib.css';

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

/** Обложка карточки: цвет и значок приёма пищи (макет v4, палитра — предложение) */
const MEAL_LOOK = {
  'завтрак': { key: 'zav', icon: IconSunrise },
  'обед': { key: 'ob', icon: IconBowl },
  'ужин': { key: 'uz', icon: IconMoon },
  'перекус': { key: 'per', icon: IconNutrition },
};

/** Метки сервера — значками, без слов (меньше текста); подсказка — в title */
const TAG_ICONS = {
  'быстро': { icon: IconBolt, tone: 'warm', title: 'Быстро' },
  'бюджетно': { icon: IconMoney, title: 'Бюджетное' },
  'без молочного': { icon: IconNoMilk, title: 'Без молочного' },
  'вегетарианское': { icon: IconNutrition, title: 'Вегетарианское' },
  'высокобелковое': { icon: IconDumbbell, title: 'Высокобелковое' },
};

export default function Dishes() {
  const { loading, data, error, reload } = useData('dishes.list', {}, []);
  const [status, setStatus] = useState('draft');
  const [meal, setMeal] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sheet, setSheet] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [failure, setFailure] = useState(null);
  // Из карточки блюда — обратно на то же место списка
  useReturnScroll(!!(open || editing));

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const dishes = data.dishes || [];
  const foods = data.foods || [];

  if (editing) {
    return (
      <DishEditor
        dish={editing.copy ? { ...editing.copy, id: undefined } : editing.new ? null : editing}
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
  const inStatus = dishes.filter((d) => d.status === status);
  const shown = shownDishes(inStatus, { q, meal, filters });

  const changeStatus = async (d, next) => {
    setBusyId(d.id);
    setFailure(null);
    try {
      await apiMutate('dish.status', { id: d.id, status: next });
      haptic('success');
      reload();
    } catch (err) {
      setFailure(err);
    } finally {
      setBusyId(null);
    }
  };

  /* Смахнуть влево — действие со статусом. «Удалить» нет: сервер блюда не
     удаляет (dish.status, dish.save), поэтому extra без onDelete — как у
     «Общих» программ. Пока тянется тень «Опубликовать», карточка стоит на месте. */
  const swipeExtra = (d) => {
    if (d.status === 'draft') return { text: 'Опубликовать', label: `Опубликовать «${d.name}»`, icon: <IconSend size={20} />, onClick: () => changeStatus(d, 'published') };
    if (d.status === 'published') return { text: 'Скрыть', label: `Скрыть «${d.name}»`, icon: <IconEye size={20} />, onClick: () => changeStatus(d, 'hidden') };
    return { text: 'В черновики', label: `Вернуть «${d.name}» в черновики`, icon: <IconRefresh size={20} />, onClick: () => changeStatus(d, 'draft') };
  };

  return (
    <>
      {/* Блюда — в языке «Программ» (26.11.2026). Статусы — своей строкой
          во всю ширину: их три, вместе с кнопками не влезают. Поиск и «+» —
          строкой ниже справа, чипы приёмов пищи — своей строкой во всю
          ширину, как в «Упражнениях» и «Тренажёрах». Поле поиска открывается
          на месте чипов (макет v4). */}
      <Segmented
        items={STATUS.map((s) => ({ value: s.value, label: <>{s.label}<em className="plib-count">{count(s.value)}</em></> }))}
        value={status}
        onChange={(v) => { setStatus(v); haptic(); }}
        label="Какие блюда"
        track
      />
      <div className="dish-actions">
        {status === 'draft' && count('draft') > 0 && (
          <p className="library__hint--lead dish-hint">Черновики клиенты не видят.</p>
        )}
        <button type="button" className="plib-ib" aria-label={searching ? 'Закрыть поиск' : 'Поиск блюд'} aria-pressed={searching}
          onClick={() => { haptic(); if (searching) setQ(''); setSearching(!searching); }}>
          {searching ? <IconClose size={20} /> : <IconSearch size={20} />}
        </button>
        <button type="button" className="plib-ib plib-ib--add" aria-label="Новое блюдо"
          onClick={() => { haptic(); setSheet('new'); }}>
          <IconPlus size={22} />
        </button>
      </div>
      {searching
        ? <div className="plib-search"><Search value={q} onChange={setQ} placeholder="Поиск блюда" /></div>
        : (
          <div className="chips plib-chips" role="toolbar" aria-label="Фильтры и приёмы пищи">
            <button type="button" className={'chip plib-chip' + (filterCount(filters) > 0 ? ' chip--active' : '')}
              onClick={() => { haptic(); setSheet('filter'); }}>
              <IconSliders size={16} />Фильтры{filterCount(filters) > 0 && <b className="plib-badge">{filterCount(filters)}</b>}
            </button>
            <button type="button" className={'chip plib-chip' + (meal === '' ? ' chip--active' : '')} aria-pressed={meal === ''}
              onClick={() => { setMeal(''); haptic(); }}>Все</button>
            {MEALS.map((m) => {
              const look = MEAL_LOOK[m] || MEAL_LOOK['перекус'];
              const MealIcon = look.icon;
              return (
                <button key={m} type="button" aria-pressed={meal === m}
                  className={'chip plib-chip' + (meal === m ? ' chip--active' : '')}
                  onClick={() => { setMeal(m); haptic(); }}>
                  <span className={'plib-dot plib-dot--sm plib-meal--' + look.key} aria-hidden="true"><MealIcon size={12} /></span>
                  {m}
                </button>
              );
            })}
          </div>
        )}

      {shown.length > 0 && (
        <div className="library__count">
          <p>{shown.length} {plural(shown.length, 'блюдо', 'блюда', 'блюд')}</p>
        </div>
      )}

      {shown.length === 0 && (
        <Empty icon={IconNutrition} title="Здесь пусто" text={status === 'draft' ? 'Все черновики разобраны.' : 'Блюд с таким отбором нет.'} />
      )}

      {shown.map((d, i) => {
        const card = (
          <button type="button" className="plib-card" style={{ '--i': Math.min(i, 8) }} onClick={() => { setOpen(d.id); haptic(); }}>
            <DishCard d={d} />
          </button>
        );
        return (
          <SwipeRow key={d.id} className="plib-row plib-swipe" disabled={busyId === d.id} extra={swipeExtra(d)}>
            {card}
          </SwipeRow>
        );
      })}

      {sheet === 'filter' && (
        <DishFilterSheet dishes={inStatus} q={q} meal={meal} filters={filters}
          onChange={setFilters} onMeal={setMeal} onClose={() => setSheet(null)} />
      )}
      {sheet === 'new' && (
        <DishNewSheet dishes={dishes}
          onClose={() => setSheet(null)}
          onBlank={() => { setSheet(null); setEditing({ new: true }); }}
          onCopy={(d) => { setSheet(null); setEditing({ copy: d }); }} />
      )}

      {failure && <Note tone="critical" icon={IconAlert}>{failure.message}</Note>}
    </>
  );
}

/** Лист «Фильтры»: приём пищи, время готовки, метки, порядок (макет v4) */
function DishFilterSheet({ dishes, q, meal, filters, onChange, onMeal, onClose }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const reset = () => { onChange({ ...NO_FILTERS, sort: filters.sort }); onMeal(''); };
  const count = shownDishes(dishes, { q, meal, filters }).length;
  return (
    <Sheet title="Фильтры" onClose={onClose}
      action={filterCount(filters) > 0 ? <button type="button" className="button button--ghost" onClick={reset}>Сбросить</button> : null}>
      <div className="plib-filter">
        <h4>Приём пищи</h4>
        <Tiles cols={4} label="Приём пищи" value={meal} onChange={(v) => { haptic(); onMeal(v); }}
          items={MEALS.map((m) => {
            const look = MEAL_LOOK[m] || MEAL_LOOK['перекус'];
            const MealIcon = look.icon;
            return { value: m, label: m, icon: <span className={'plib-dot plib-meal--' + look.key} aria-hidden="true"><MealIcon size={18} /></span> };
          })} />
        <h4>Время готовки</h4>
        <Tiles cols={3} label="Время готовки" value={filters.time} onChange={(v) => { haptic(); set({ time: v }); }}
          items={[
            { value: 15, label: <b>15′</b> },
            { value: 30, label: <b>30′</b> },
            { value: 0, label: <b>∞</b> },
          ]} />
        <h4>Метки</h4>
        <div className="plib-tiles plib-tiles--4" role="group" aria-label="Метки">
          {Object.entries(TAG_ICONS).map(([tag, look]) => {
            const TagIcon = look.icon;
            const on = filters.tags.includes(tag);
            return (
              <button key={tag} type="button" aria-pressed={on}
                className={'plib-tile' + (on ? ' is-on' : '')}
                onClick={() => { haptic(); set({ tags: on ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag] }); }}>
                <span className="dish-mdot" aria-hidden="true"><TagIcon size={18} /></span>
                {look.title}
              </button>
            );
          })}
        </div>
        <h4>Порядок</h4>
        <Segmented track label="Порядок" value={filters.sort} onChange={(v) => { haptic(); set({ sort: v }); }}
          items={[{ value: 'meal', label: 'По приёму' }, { value: 'az', label: 'А–Я' }]} />
        <button type="button" className="button button--primary button--block plib-filter__go" onClick={onClose}>
          {count ? `Показать: ${count}` : 'Ничего не нашлось'}
        </button>
      </div>
    </Sheet>
  );
}

/** Лист «Новое блюдо»: с нуля или копия похожего («сканер штрихкода» — нет) */
function DishNewSheet({ dishes, onClose, onBlank, onCopy }) {
  const [step, setStep] = useState('menu');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const similar = dishes.filter((d) => !query || d.name.toLowerCase().includes(query));
  return (
    <Sheet title={step === 'copy' ? 'Копия какого блюда' : 'Новое блюдо'} onClose={onClose}>
      {step === 'menu' && (
        <div className="plib-menu">
          <button type="button" className="plib-menu__item" onClick={() => { haptic(); onBlank(); }}>
            <span className="plib-menu__icon"><IconPlus size={22} /></span>
            <span><b>С нуля</b><small>Пустое блюдо</small></span>
          </button>
          {dishes.length > 0 && (
            <button type="button" className="plib-menu__item" onClick={() => { haptic(); setStep('copy'); }}>
              <span className="plib-menu__icon"><IconCopy size={22} /></span>
              <span><b>Копия</b><small>Взять похожее и поправить</small></span>
            </button>
          )}
        </div>
      )}
      {step === 'copy' && (
        <div className="plib-pick">
          <Search value={q} onChange={setQ} placeholder="Поиск блюда" />
          {similar.map((d) => {
            const look = MEAL_LOOK[d.meal] || MEAL_LOOK['перекус'];
            const MealIcon = look.icon;
            return (
              <button key={d.id} type="button" className="plib-menu__item" onClick={() => { haptic(); onCopy(d); }}>
                <span className={'plib-cover plib-cover--sm plib-meal--' + look.key} aria-hidden="true"><MealIcon size={18} /></span>
                <span><b>{d.name}</b><small>{d.meal}</small></span>
              </button>
            );
          })}
          {similar.length === 0 && <p className="small muted">Блюд с таким именем нет.</p>}
          <button type="button" className="button button--ghost button--block" onClick={() => { setStep('menu'); setQ(''); }}>Назад</button>
        </div>
      )}
    </Sheet>
  );
}

/** Карточка блюда: обложка приёма пищи, факты значками, метки значками */
function DishCard({ d }) {
  const look = MEAL_LOOK[d.meal] || MEAL_LOOK['перекус'];
  const MealIcon = look.icon;
  const level = carbLevel(d.per);
  return (
    <>
      <span className={'plib-cover plib-meal--' + look.key} aria-hidden="true"><MealIcon size={28} /></span>
      <span className="plib-body">
        <span className="plib-name">{d.name}</span>
        <span className={'plib-goalname plib-mealtext--' + look.key}>{d.meal}</span>
        <span className="plib-facts">
          {d.minutes > 0 && <span title="Минут на готовку"><IconClock size={14} />{d.minutes}</span>}
          {d.per.kcal > 0 && <span title="Ккал на порцию"><IconFlame size={14} />{formatNumber(d.per.kcal)}</span>}
          {d.portions > 1 && <span title="Порций">×{d.portions}</span>}
        </span>
        {(level || d.tags.length > 0) && (
          <span className="dish-tags" aria-hidden="true">
            {/* Уровень углеводов считается из КБЖУ (FT-709) — средний не показываем */}
            {level === 'low' && <span className="dish-itag dish-itag--cool" title="Углеводов мало"><IconArrowDown size={13} /></span>}
            {level === 'high' && <span className="dish-itag dish-itag--warm" title="Углеводов много"><IconArrowUp size={13} /></span>}
            {d.tags.map((t) => {
              const tag = TAG_ICONS[t];
              if (!tag) return null;
              const TagIcon = tag.icon;
              return <span key={t} className={'dish-itag' + (tag.tone ? ' dish-itag--' + tag.tone : '')} title={tag.title}><TagIcon size={13} /></span>;
            })}
          </span>
        )}
      </span>
      <span className="plib-side">
        <span className="plib-flags">
          <span className={d.status === 'published' ? 'is-on' : ''} title={d.status === 'published' ? 'Видят клиенты' : 'Клиенты не видят'}><IconEye size={15} /></span>
        </span>
        {d.status === 'draft' && <span className="plib-free">черновик</span>}
        {d.status === 'hidden' && <span className="plib-free">скрыто</span>}
      </span>
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
      <BackButton label="Блюда" onClick={onBack} />
      <Panel pad>
        <h2 className="library__title">{dish.name}</h2>
        <div className="item__meta library__meta">
          <Tag tone={dish.status === 'published' ? 'good' : undefined}>
            {dish.status === 'published' ? 'у клиентов' : dish.status === 'hidden' ? 'скрыто' : 'черновик'}
          </Tag>
          <span>{dish.meal} · {dish.minutes} мин · {dish.portions} {plural(dish.portions, 'порция', 'порции', 'порций')}</span>
        </div>

        <p className="dish__per">
          <strong>{dish.per.kcal} ккал</strong> на порцию · Б {formatNumber(dish.per.protein)} · Ж {formatNumber(dish.per.fat)} · У {formatNumber(dish.per.carbs)}
        </p>
        {/* Уровень углеводов считается из КБЖУ порции (FT-709), руками не ставится */}
        {(dish.tags.length > 0 || carbLevel(dish.per)) && (
          <div className="dish__tags">
            {carbLevel(dish.per) && <span className={'card__tag card__tag--carbs-' + carbLevel(dish.per)}>{carbTag(carbLevel(dish.per))}</span>}
            {dish.tags.map((t) => <span key={t} className="card__tag">{t}</span>)}
          </div>
        )}

        <h3 className="dish__h">Состав на всё блюдо</h3>
        <ul className="dish__items">
          {dish.items.map((i) => {
            // Яйца — штуками, жидкости — миллилитрами; граммы в скобках
            const shown = pieceLabel(i.food, i.grams, EGG_SIZES[2]) || mlLabel(i.food, i.grams);
            return <li key={i.food}><span>{i.food}</span><span>{shown ? shown + ' (' + formatNumber(i.grams) + ' г)' : formatNumber(i.grams) + ' г'}</span></li>;
          })}
        </ul>
        {dish.items.some((i) => pieceLabel(i.food, i.grams, EGG_SIZES[2])) && (
          <p className="small muted" style={{ margin: '6px 0 0' }}>Яйца в штуках — для крупных (С0, 55 г без скорлупы); клиент выбирает свой размер.</p>
        )}

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
      {/* Сверху — куда ведёт стрелка, как у шаблонов; «Отмена» — обычной
          кнопкой рядом с «Сохранить», а не стрелкой (аудит 24.10.2026) */}
      <BackButton label={dish && dish.id ? 'К блюду' : 'Блюда'} onClick={onCancel} />
      <Panel pad>
        <div className="library__form">
          <Field label="Название" inputMode="text" value={name} onChange={setName} placeholder="Гречка с курицей" />
          <div>
            <span className="field__label">Приём пищи</span>
            <Chips items={MEALS.map((m) => ({ value: m, label: m }))} value={meal} onChange={setMeal} />
          </div>
          <div className="field-row">
            <Field label="Порций" inputMode="numeric" value={portions} onChange={setPortions} />
            <Field label="Минут на готовку" inputMode="numeric" value={minutes} onChange={setMinutes} />
          </div>
          <label className="library__check">
            <input type="checkbox" checked={budget} onChange={(e) => setBudget(e.target.checked)} />
            <span>Бюджетное — без дорогих продуктов</span>
          </label>

          <div>
            <span className="field__label">Состав на всё блюдо (граммы до готовки)</span>
            <div className="dish__edit-items">
              {/* Смахнуть продукт влево — убрать из состава */}
              {items.map((it, k) => (
                <SwipeRow key={k} contentClassName="dish__edit-row" label="Убрать продукт" actionText="Убрать"
                  onDelete={() => setItems((l) => l.filter((_, i) => i !== k))}>
                  <FoodInput names={names} value={it.food} onChange={(v) => setItem(k, 'food', v)} />
                  <input className="field__input" inputMode="decimal" placeholder="г" value={it.grams} onChange={(e) => setItem(k, 'grams', e.target.value)} />
                </SwipeRow>
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
            <button className="button button--primary" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
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
