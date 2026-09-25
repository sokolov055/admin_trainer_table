import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import { Section, Panel, Note, Search, formatNumber, plural } from '../ui.jsx';
import { IconCheck, IconClose, IconBack, IconNutrition, IconShare } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { MEALS } from './recipes.js';
import { CATALOG, setCatalog } from './catalog.js';
import {
  rankRecipes, planVariants, shoppingList, foodByGroup, defaultPantry, splitItems,
  portionWeight, per100, extraTotals, remainingTarget, addTotals,
} from './match.js';
import Extras from './Extras.jsx';
import { EGG_SIZES, getEggSize, saveEggSize, pieceLabel, mlLabel } from './pieces.js';

/** Размер яиц, выбранный человеком: по нему «110 г» показываются как «2 яйца» */
const EggContext = createContext(EGG_SIZES[2]);

/** Вес продукта — штуками, если он штучный (яйца), иначе граммами */
function Amount({ food, grams: g }) {
  const size = useContext(EggContext);
  const pieces = pieceLabel(food, g, size) || mlLabel(food, g);
  if (!pieces) return <>{grams(g)}</>;
  return <>{pieces} <span className="amount__grams">({grams(g)})</span></>;
}

/** Вес строкой для текста списка — так же, как на экране */
function amountText(food, g, size) {
  const shown = pieceLabel(food, g, size) || mlLabel(food, g);
  return shown ? shown + ' (' + grams(g) + ')' : grams(g);
}

/**
 * Список покупок — текстом для заметок или мессенджера: группы полки,
 * «— продукт — сколько». Дома лежащее — отдельной строкой в конце, чтобы
 * не забыть проверить, а не купить.
 */
export function shoppingText(groups, home, size) {
  const lines = ['Список покупок', ''];
  groups.forEach((g) => {
    lines.push(g.title);
    g.items.forEach((row) => lines.push('— ' + row.food + ' — ' + amountText(row.food, row.grams, size)));
    lines.push('');
  });
  if (home.length) lines.push('Проверить, что хватит дома: ' + home.map((r) => r.food).join(', '));
  return lines.join('\n').trim();
}

/**
 * Отправить список: системное «Поделиться» (Заметки, Telegram, WhatsApp),
 * а где его нет — скопировать, чтобы вставить в любой блокнот.
 */
function ShareList({ text }) {
  const [note, setNote] = useState('');
  const send = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Список покупок', text });
        haptic('success');
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // закрыли меню — не ошибка
    }
    try {
      await navigator.clipboard.writeText(text);
      setNote('Список скопирован — вставьте его в заметки или в чат');
      haptic('success');
    } catch (_) {
      window.prompt('Скопируйте список:', text);
    }
  };
  return (
    <div className="shop__share">
      <button type="button" className="button button--block" onClick={send}>
        <IconShare size={16} />
        Отправить список
      </button>
      {note && <p className="small muted" style={{ margin: '6px 0 0' }}>{note}</p>}
    </div>
  );
}

/** Какие яйца у человека дома: мелкие, средние, крупные */
function EggPicker({ value, onChange }) {
  return (
    <div className="eggs" role="radiogroup" aria-label="Размер яиц">
      <span className="small muted">Яйца у вас:</span>
      {EGG_SIZES.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value.id === s.id}
          className={'chip' + (value.id === s.id ? ' chip--active' : '')}
          onClick={() => { onChange(s); haptic(); }}
        >{s.label} {s.mark}</button>
      ))}
    </div>
  );
}
import { apiPublic } from '../api.js';
import './ration.css';

/**
 * ==========================================================================
 * Рацион из того, что есть дома
 *
 * Норма калорий сама по себе бесполезна. Человек узнаёт, что ему положено
 * 1800 ккал и 140 г белка, закрывает экран и идёт есть то же, что вчера:
 * между числом и ужином лежит работа, которую никто делать не станет —
 * придумать блюда, сложить их в день, свести с нормой, купить недостающее.
 * Этот раздел делает ровно эту работу.
 *
 * Три шага, и порядок не случаен:
 *
 *   1. ХОЛОДИЛЬНИК. Сначала спрашиваем, что есть дома, и только потом
 *      предлагаем блюда. Наоборот было бы приложение с рецептами, которых
 *      миллион и которые никто не готовит: рецепт, за которым надо идти в
 *      магазин, откладывается на «потом» и не готовится никогда.
 *
 *   2. КОЛОДА. Блюда листаются по одному, влево-вправо. Список из двадцати
 *      названий требует сравнивать их между собой — работа, от которой
 *      человек устаёт и закрывает экран. Одно блюдо требует одного ответа:
 *      буду или не буду.
 *
 *   3. ДЕНЬ. Из понравившегося собирается завтрак, обед, ужин и перекус,
 *      попадающие в норму, и список покупок к ним.
 *
 * Считает всё match.js; здесь только показ, жест и хранение выбора.
 *
 * ЧТО ВЫБРАЛИ — ХРАНИТСЯ НА УСТРОЙСТВЕ, и это осознанно. В таблицу пишется
 * то, за что отвечает тренер: деньги, программа, норма. Холодильник и
 * «нравится/не нравится» — черновик, который человек меняет каждый день, и
 * возить его через ops в Google Таблицы значит нагрузить скрипт записью
 * ради данных, которые никто не будет смотреть. Если однажды тренер захочет
 * видеть рацион клиента — это отдельная функция и отдельный разговор.
 * ==========================================================================
 */

/** Ключ хранения. Версия в имени: изменится формат — старое просто не прочтётся. */
const STORE = 'ration_v1';

/** Сдвиг пальца, после которого карточка считается отправленной. */
const SWIPE_PX = 84;

/** Сколько живёт улетающая карточка. Совпадает с --dur в styles.css. */
const FLY_MS = 220;

/** С какого расхождения с нормой день считается неудачным и требует слов. */
const OFF_TARGET = 0.12;

const reduced = () => typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Пробный режим — тренер проходит раздел так, как его видит клиент. Отметки
 * в отдельном хранилище: собственный рацион тренера (если он клиент сам
 * себе) и пробы не смешиваются.
 */
const TRIAL_STORE = 'ration_trial_v1';

function load(key = STORE) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    // Приватный режим и заблокированные куки роняют localStorage на чтении.
    // Раздел от этого не перестаёт работать — просто не помнит прошлый раз.
    return {};
  }
}

function save(state, key = STORE) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* см. load: молчим намеренно, терять здесь нечего */
  }
}

const grams = (value) => (value >= 1000
  ? formatNumber(Math.round(value / 100) / 10) + ' кг'
  : value + ' г');

const servingLabel = (count) => (count === 1
  ? ''
  : formatNumber(count) + ' ' + plural(Math.ceil(count), 'порция', 'порции', 'порций'));

/* ==================================================================
 * Шаг 1. Холодильник
 * ================================================================== */

/**
 * Продукты отмечаются в закрытом списке, а не вводятся строкой.
 *
 * Поле ввода выглядит дружелюбнее ровно до первой попытки: человек пишет
 * «куриное филе», в справочнике это «куриная грудка», и приложение отвечает,
 * что такого продукта нет. Список из пятидесяти шести позиций перебирается
 * взглядом за полминуты, и в нём ровно то, из чего собраны блюда, — обещать
 * больше было бы враньём.
 */
function Pantry({ pantry, onToggle, onNext }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(foodByGroup, []);
  const needle = query.trim().toLowerCase();

  const shown = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((name) => !needle || name.includes(needle)),
    }))
    .filter((group) => group.items.length);

  const chosen = pantry.length;

  return (
    <>
      <Section>
        <Note tone="info" icon={IconNutrition}>
          Отметьте, что есть дома. Приложение подберёт блюда, которые из этого
          готовятся, — чем больше отметите, тем меньше придётся докупать.
        </Note>
      </Section>

      <Section>
        <Search value={query} onChange={setQuery} placeholder="Найти продукт" />
      </Section>

      {shown.map((group) => (
        <Section key={group.id} title={group.title}>
          <div className="pantry">
            {group.items.map((name) => {
              const active = pantry.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={'pantry__item' + (active ? ' pantry__item--on' : '')}
                  aria-pressed={active}
                  onClick={() => { onToggle(name); haptic(); }}
                >
                  {active && <span className="pantry__tick"><IconCheck size={13} /></span>}
                  {name}
                </button>
              );
            })}
          </div>
        </Section>
      ))}

      {!shown.length && (
        <Section>
          <Panel pad>
            <p className="small muted" style={{ margin: 0 }}>
              Такого продукта нет в справочнике. Блюда собраны из пятидесяти
              шести самых обычных — попробуйте назвать проще: «куриная грудка»,
              «гречка», «творог».
            </p>
          </Panel>
        </Section>
      )}

      {/* Панель внизу, а не кнопка в конце списка: список длинный, и решение
          «хватит отмечать» человек принимает где-то посередине, а не докрутив
          до конца. */}
      <div className="ration__bar">
        <span className="ration__count">
          {chosen ? 'Отмечено ' + chosen : 'Ничего не отмечено'}
        </span>
        <button
          className="button button--primary"
          disabled={chosen < 3}
          onClick={onNext}
        >
          Подобрать блюда
        </button>
      </div>
    </>
  );
}

/* ==================================================================
 * Шаг 2. Колода
 * ================================================================== */

/**
 * Порция и сто граммов.
 *
 * Вес сырой: крупы и макароны сухие, мясо и рыба сырые — так собран весь
 * справочник, и так же написано на упаковке, с которой человек сравнивает.
 * Умолчать об этом значит дать цифру, которая тихо расходится с весами.
 */
function Hundred({ recipe }) {
  const weight = portionWeight(recipe);
  const hundred = per100(recipe);
  if (!weight || !hundred) return null;

  return (
    <p className="card__hundred">
      <span className="card__portion">Порция ≈ {weight} г</span>
      <span className="card__per100">
        на 100 г: {hundred.kcal} ккал · Б {formatNumber(hundred.protein)}
        {' · '}Ж {formatNumber(hundred.fat)} · У {formatNumber(hundred.carbs)}
      </span>
      <span className="card__raw">вес продуктов до готовки</span>
    </p>
  );
}

/**
 * Рецепт: как готовить и сколько времени. Свёрнут — карточка отвечает на
 * «буду или не буду», а шаги нужны, когда уже решил готовить.
 */
function Recipe({ recipe }) {
  const steps = recipe.steps || [];
  if (!steps.length) return null;
  return (
    <details className="recipe" onClick={(e) => e.stopPropagation()}>
      <summary>Как готовить{recipe.minutes ? ' · ' + recipe.minutes + ' мин' : ''}</summary>
      <ol className="recipe__steps">
        {steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
    </details>
  );
}

/** Метки блюда: быстро, вегетарианское, без молочного… */
function Tags({ recipe }) {
  if (!recipe.tags || !recipe.tags.length) return null;
  return <div className="card__tags">{recipe.tags.map((t) => <span key={t} className="card__tag">{t}</span>)}</div>;
}

/**
 * Карточка блюда: то, что нужно для ответа «буду или не буду».
 *
 * Крупно калории — по ним человек и решает. Состав ниже, и в нём видно, чего
 * не хватает: без этого «докупить два продукта» превращается в загадку,
 * которая разгадывается уже в магазине.
 */
function Card({ entry, offset, style, handlers, flying }) {
  const { recipe, missing } = entry;
  const { main, minor } = splitItems(recipe);
  const per = recipe.per;
  const mealTitle = (MEALS.find((m) => m.id === recipe.meal) || {}).title || recipe.meal;

  return (
    <article
      className={'card' + (flying ? ' card--fly-' + flying : '')}
      style={{ ...style, zIndex: 10 - offset }}
      // Карточку смахивают сами — листание разделов и «потянуть вниз»
      // тут перехватывать нельзя
      data-no-gestures
      {...handlers}
    >
      <div className="card__top">
        <span className="card__meal">{mealTitle}</span>
        <h3 className="card__name">{recipe.name}</h3>
        <Tags recipe={recipe} />
      </div>

      <div className="card__macros">
        <span className="card__kcal">{per.kcal}<i>ккал</i></span>
        <span className="card__m">Б&nbsp;{formatNumber(per.protein)}</span>
        <span className="card__m">Ж&nbsp;{formatNumber(per.fat)}</span>
        <span className="card__m">У&nbsp;{formatNumber(per.carbs)}</span>
      </div>

      {/* Крупные цифры — на порцию: по ним решают, есть или не есть. Ниже
          её вес и те же цифры на сто граммов — величина, которой человек
          уже умеет пользоваться, она написана на каждой упаковке. Без неё
          «447 ккал» не говорит, тяжёлое блюдо или просто большое. */}
      <Hundred recipe={recipe} />

      {missing.length === 0 ? (
        <p className="card__state card__state--ready">Готовится из того, что есть</p>
      ) : (
        <p className="card__state card__state--buy">
          Докупить: {missing.join(', ')}
        </p>
      )}

      <ul className="card__items">
        {main.concat(minor).map((item) => (
          <li
            key={item.food}
            className={entry.have.includes(item.food) ? '' : 'card__items--miss'}
          >
            <span>{item.food}</span>
            <span><Amount food={item.food} grams={item.grams} /></span>
          </li>
        ))}
      </ul>

      <p className="card__out">
        {recipe.portions === 1
          ? 'Готовится на одну порцию'
          : 'Готовится на ' + recipe.portions + ' '
            + plural(recipe.portions, 'порцию', 'порции', 'порций')}
      </p>

      <Recipe recipe={recipe} />
    </article>
  );
}

function Deck({ cards, liked, onLike, onSkip, onEnough, onRestart }) {
  const [drag, setDrag] = useState(null);
  const [flying, setFlying] = useState(null);
  const busy = useRef(false);
  const move = useRef(null);

  const decide = (direction) => {
    if (busy.current || !cards.length) return;
    busy.current = true;
    const card = cards[0];
    haptic();
    move.current = null;
    setDrag(null);
    setFlying(direction);
    const finish = () => {
      setFlying(null);
      busy.current = false;
      (direction === 'right' ? onLike : onSkip)(card.recipe.id);
    };
    // Улетевшую карточку убираем после анимации, иначе она моргает: список
    // перерисовывается раньше, чем заканчивается движение.
    if (reduced()) finish();
    else setTimeout(finish, FLY_MS);
  };

  // Ход пальца живёт в ref, а не только в состоянии. Решение принимается в
  // pointerup, и если читать его из состояния, быстрый жест теряется: между
  // pointermove и pointerup React может не успеть перерисоваться, и в
  // обработчик придёт сдвиг, равный нулю. Состояние остаётся ради картинки,
  // ref отвечает за то, что произошло.
  const handlers = {
    onPointerDown: (e) => {
      if (busy.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      move.current = { x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
      setDrag(move.current);
    },
    onPointerMove: (e) => {
      const from = move.current;
      if (!from) return;
      move.current = { ...from, dx: e.clientX - from.x0, dy: e.clientY - from.y0 };
      setDrag(move.current);
    },
    onPointerUp: () => {
      const from = move.current;
      move.current = null;
      if (!from) return;
      if (from.dx > SWIPE_PX) decide('right');
      else if (from.dx < -SWIPE_PX) decide('left');
      else setDrag(null);
    },
    onPointerCancel: () => { move.current = null; setDrag(null); },
  };

  if (!cards.length) {
    return (
      <Section>
        <Panel pad>
          <h3 style={{ marginTop: 0 }}>Блюда закончились</h3>
          <p className="small muted">
            {liked.length >= 2
              ? 'Отмечено ' + liked.length + ' ' + plural(liked.length, 'блюдо', 'блюда', 'блюд')
                + ' — этого хватит, чтобы собрать день.'
              : 'Ничего не отмечено. Начните колоду заново или добавьте продуктов '
                + 'в холодильник — блюд станет больше.'}
          </p>
          <div className="ration__actions">
            {liked.length >= 2 && (
              <button className="button button--primary" onClick={onEnough}>
                Собрать день
              </button>
            )}
            <button className="button" onClick={onRestart}>Показать заново</button>
          </div>
        </Panel>
      </Section>
    );
  }

  const dx = drag ? drag.dx : 0;
  const style = drag
    ? {
      transform: 'translate(' + dx + 'px, ' + drag.dy * 0.35 + 'px) rotate('
        + (reduced() ? 0 : dx / 22) + 'deg)',
      transition: 'none',
    }
    : undefined;

  return (
    <>
      <div className="deck">
        {/* Вторая карточка видна краем: колода должна выглядеть колодой,
            иначе непонятно, что за этим блюдом есть следующее. */}
        {cards.slice(0, 2).map((entry, i) => (
          <Card
            key={entry.recipe.id}
            entry={entry}
            offset={i}
            style={i === 0 ? style : undefined}
            handlers={i === 0 ? handlers : {}}
            flying={i === 0 ? flying : null}
          />
        ))}

        {/* Метки появляются по ходу движения: человек должен понимать, что
            означает сдвиг, до того как отпустит палец. */}
        <span className="deck__mark deck__mark--yes" style={{ opacity: Math.max(0, dx / SWIPE_PX) }}>
          Буду
        </span>
        <span className="deck__mark deck__mark--no" style={{ opacity: Math.max(0, -dx / SWIPE_PX) }}>
          Не буду
        </span>
      </div>

      <div className="deck__controls">
        <button
          type="button"
          className="deck__button deck__button--no"
          aria-label="Не буду это готовить"
          onClick={() => decide('left')}
        >
          <IconClose size={22} />
        </button>
        <span className="deck__left">
          осталось {cards.length}
        </span>
        <button
          type="button"
          className="deck__button deck__button--yes"
          aria-label="Буду это готовить"
          onClick={() => decide('right')}
        >
          <IconCheck size={22} />
        </button>
      </div>

      <p className="deck__hint">
        Смахните вправо, если готовы это приготовить, влево — если нет.
        {liked.length >= 2 && ' Отмечено ' + liked.length + '.'}
      </p>

      {liked.length >= 2 && (
        <Section>
          <button className="button button--block" onClick={onEnough}>
            Хватит, собрать день
          </button>
        </Section>
      )}
    </>
  );
}

/* ==================================================================
 * Шаг 3. День и список покупок
 * ================================================================== */

function Bar({ label, value, goal, unit }) {
  const share = goal > 0 ? Math.min(1.35, value / goal) : 0;
  const off = goal > 0 && Math.abs(value - goal) / goal > OFF_TARGET;
  return (
    <div className="day__bar">
      <div className="day__bar-head">
        <span>{label}</span>
        <span className={off ? 'day__bar-off' : ''}>
          {formatNumber(value)}{unit} <i>из {formatNumber(goal)}{unit}</i>
        </span>
      </div>
      <div className="day__bar-track">
        <span style={{ transform: `scaleX(${Math.min(1, share)})` }} />
      </div>
    </div>
  );
}

function Day({ variants, index, targets, pantry, eaten, extras, eggSize, onEggSize, onOther, onRestart, onPantry }) {
  // Своё может закрыть норму целиком — тогда блюд не остаётся, и это не ошибка
  const plan = variants.length ? variants[index % variants.length] : { dishes: [], totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 } };
  const list = useMemo(() => shoppingList(plan.dishes, pantry), [plan, pantry]);
  const groups = useMemo(foodByGroup, []);

  // Итог дня — блюда плюс своё; с нормой сравнивается всё вместе
  const totals = addTotals(plan.totals, eaten);
  const shortfall = totals.kcal - Math.round(targets.kcal);
  const badly = targets.kcal > 0 && Math.abs(shortfall) / targets.kcal > OFF_TARGET;

  const rows = (items) => {
    const byGroup = new Map();
    for (const row of items) {
      if (!byGroup.has(row.group)) byGroup.set(row.group, []);
      byGroup.get(row.group).push(row);
    }
    return groups
      .filter((g) => byGroup.has(g.id))
      .map((g) => ({ title: g.title, items: byGroup.get(g.id) }));
  };

  return (
    <>
      <Section>
        <Panel pad>
          <div className="day__lead">
            <span className="day__kcal">{formatNumber(totals.kcal)}</span>
            <span className="day__unit">ккал за день</span>
          </div>
          {eaten.kcal > 0 && (
            <p className="small muted" style={{ margin: '0 0 var(--space-2)' }}>
              из них своё — {formatNumber(eaten.kcal)} ккал, блюда подобраны под остаток
            </p>
          )}
          <Bar label="Белки" value={totals.protein} goal={targets.protein} unit=" г" />
          <Bar label="Жиры" value={totals.fat} goal={targets.fat} unit=" г" />
          <Bar label="Углеводы" value={totals.carbs} goal={targets.carbs} unit=" г" />
        </Panel>
      </Section>

      {extras}

      {badly && (
        <Section>
          <Note tone={shortfall < 0 ? 'info' : 'warning'}>
            {shortfall < 0
              ? 'До нормы не хватает ' + Math.abs(shortfall) + ' ккал. Отметьте ещё '
                + 'блюд — чем больше выбор, тем точнее собирается день.'
              : eaten.kcal > 0 && eaten.kcal >= targets.kcal * 0.6
                ? 'Своё почти закрывает норму, и день выходит на ' + shortfall + ' ккал больше. '
                  + 'Это не страшно разово — завтра просто вернитесь к подобранному дню.'
                : 'День выходит на ' + shortfall + ' ккал больше нормы. Посмотрите '
                  + 'другие варианты или отметьте блюда полегче.'}
          </Note>
        </Section>
      )}

      {plan.dishes.length === 0 && (
        <Section>
          <Note tone="info">Своё уже закрыло норму на сегодня — подбирать блюда не под что.</Note>
        </Section>
      )}

      {plan.dishes.length > 0 && (
      <Section title="Что есть сегодня" note={'вариант ' + (index % variants.length + 1) + ' из ' + variants.length}>
        <Panel>
          <div className="day__dishes">
            {plan.dishes.map((dish) => {
              const meal = MEALS.find((m) => m.id === dish.recipe.meal) || {};
              return (
                <div key={dish.recipe.id} className="day__dish">
                  {/* Приём пищи — колонкой слева: день читается сверху вниз
                      по времени, а название блюда остаётся главным */}
                  <span className="day__meal">{meal.title || dish.recipe.meal}</span>
                  <div className="day__body">
                    <h4 className="day__name">{dish.recipe.name}</h4>
                    <p className="day__macros">
                      <strong>{Math.round(dish.recipe.per.kcal * dish.servings)} ккал</strong>
                      <span>
                        Б {formatNumber(Math.round(dish.recipe.per.protein * dish.servings * 10) / 10)} ·
                        {' '}Ж {formatNumber(Math.round(dish.recipe.per.fat * dish.servings * 10) / 10)} ·
                        {' '}У {formatNumber(Math.round(dish.recipe.per.carbs * dish.servings * 10) / 10)}
                      </span>
                      {dish.servings !== 1 && <span className="day__servings">{servingLabel(dish.servings)}</span>}
                    </p>
                    <Recipe recipe={dish.recipe} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </Section>
      )}

      <Section>
        {/* Главное действие дня — другой вариант; остальное — шаг назад */}
        <div className="ration__actions">
          {variants.length > 1 && (
            <button className="button button--primary ration__main" onClick={onOther}>Другой вариант</button>
          )}
          <button className="button button--ghost" onClick={onRestart}>Выбрать блюда заново</button>
          <button className="button button--ghost" onClick={onPantry}>Изменить продукты</button>
        </div>
      </Section>

      {list.buy.concat(list.athome).some((row) => row.food === 'яйцо' || row.food === 'белок яичный') && (
        <EggPicker value={eggSize} onChange={onEggSize} />
      )}

      <Section
        title="Список покупок"
        note={list.buy.length ? 'на всё, что готовится' : undefined}
      >
        {list.buy.length === 0 ? (
          <Panel pad>
            <p className="small muted" style={{ margin: 0 }}>
              Покупать нечего — всё уже дома.
            </p>
          </Panel>
        ) : (
          <Panel>
            <div className="shop">
              {rows(list.buy).map((group) => (
                <div key={group.title} className="shop__group">
                  <h4 className="shop__title">{group.title}</h4>
                  {group.items.map((row) => (
                    <div key={row.food} className="shop__row">
                      <span>{row.food}</span>
                      <span className="shop__grams"><Amount food={row.food} grams={row.grams} /></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        )}
        {list.buy.length > 0 && <ShareList text={shoppingText(rows(list.buy), list.athome, eggSize)} />}
      </Section>

      {/* Почему объём больше, чем съедается за день, — сказать обязательно:
          иначе человек решит, что приложение ошиблось в шесть раз. */}
      <Section>
        <Note tone="info">
          Вес указан на всё блюдо целиком: суп варится кастрюлей, и остаток
          останется на завтра. Крупы и макароны — сухими, мясо и рыба — сырыми.
        </Note>
      </Section>

      {list.athome.length > 0 && (
        <Section title="Уже есть дома" note="проверьте, что хватит">
          <Panel>
            <div className="shop">
              {rows(list.athome).map((group) => (
                <div key={group.title} className="shop__group">
                  <h4 className="shop__title">{group.title}</h4>
                  {group.items.map((row) => (
                    <div key={row.food} className="shop__row shop__row--have">
                      <span>{row.food}</span>
                      <span className="shop__grams"><Amount food={row.food} grams={row.grams} /></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        </Section>
      )}
    </>
  );
}

/* ==================================================================
 * Сборка
 * ================================================================== */

// trial — тренер пробует раздел: всё то же, но на своём устройстве и
// без записи в общую базу продуктов
export default function Ration({ targets, onClose, trial = false }) {
  const key = trial ? TRIAL_STORE : STORE;
  const saved = useMemo(() => load(key), [key]);
  const [pantry, setPantry] = useState(() => saved.pantry || defaultPantry());
  const [liked, setLiked] = useState(() => saved.liked || []);
  const [seen, setSeen] = useState(() => saved.seen || []);
  const [variant, setVariant] = useState(0);
  const [step, setStep] = useState(() => ((saved.liked || []).length >= 2 ? 'day' : 'pantry'));

  // Своё — на сегодня: завтра начинается с чистого дня. Недавние продукты
  // — на устройстве, на случай без сети; основная база общая, на сервере.
  // День — по Москве, как на сервере: иначе ночью своё уезжало бы во вчера
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const [extras, setExtras] = useState(() => (saved.extras && saved.extras.date === today ? saved.extras.items : []));
  const [products, setProducts] = useState(() => saved.products || []);

  useEffect(() => {
    save({ pantry, liked, seen, extras: { date: today, items: extras }, products }, key);
  }, [pantry, liked, seen, extras, products, key]);

  // ------------------------------------------------------------------
  // Сервер — главное хранилище рациона клиента (ration.*): отметки живут на
  // всех его устройствах, тренер видит их в карточке, а журнал своего
  // показывает, кто что ест. Телефон — кеш: экран открывается сразу, без
  // сети работает, а записанное без сети досылается при следующем заходе.
  // Проба тренера (trial) сервера не касается вовсе.
  // ------------------------------------------------------------------
  const [synced, setSynced] = useState(trial);

  useEffect(() => {
    if (trial) return undefined;
    let alive = true;
    apiPublic('ration.get', { day: today })
      .then(async (srv) => {
        if (!alive) return;
        if (srv.saved) {
          setPantry(srv.pantry || defaultPantry());
          setLiked(srv.liked || []);
          setSeen(srv.seen || []);
        } else if (saved.pantry || (saved.liked || []).length) {
          // Первый заход после переезда на сервер: отмеченное на телефоне —
          // туда, а не в пустоту
          await apiPublic('ration.save', { pantry, liked, seen }).catch(() => {});
        }
        // Своё, записанное без сети, — досылаем; дальше верим серверу
        const pending = extras.filter((e) => e.pending);
        const sent = [];
        for (const e of pending) {
          try {
            sent.push(await apiPublic('ration.extra.add', { day: today, product: e.product, grams: e.grams, pieces: e.pieces }));
          } catch (_) { sent.push(e); }
        }
        if (alive) setExtras([...(srv.extras || []), ...sent]);
      })
      .catch(() => {})
      .finally(() => { if (alive) setSynced(true); });
    return () => { alive = false; };
  }, [trial]);

  // Подбор — на сервер с паузой: листают колоду быстро, и каждое касание
  // отдельным запросом не нужно
  useEffect(() => {
    if (trial || !synced) return undefined;
    const timer = setTimeout(() => {
      apiPublic('ration.save', { pantry, liked, seen }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [pantry, liked, seen, synced, trial]);

  const eaten = useMemo(() => extraTotals(extras), [extras]);
  const rest = useMemo(() => remainingTarget(targets, eaten), [targets, eaten]);

  const addExtra = ({ product, grams, pieces }) => {
    const temp = { id: 'e' + Date.now().toString(36), product, grams, pieces, pending: !trial };
    setExtras((list) => [...list, temp]);
    setProducts((list) => [product, ...list.filter((p) => p.id !== product.id && p.name.toLowerCase() !== product.name.toLowerCase())].slice(0, 40));
    setVariant(0);
    if (trial) return;
    apiPublic('ration.extra.add', { day: today, product, grams, pieces })
      .then((saved) => setExtras((list) => list.map((e) => (e.id === temp.id ? saved : e))))
      .catch(() => { /* останется pending и уйдёт при следующем заходе */ });
  };
  const removeExtra = (id) => {
    setExtras((list) => list.filter((e) => e.id !== id));
    setVariant(0);
    if (!trial && typeof id === 'number') apiPublic('ration.extra.remove', { id }).catch(() => {});
  };


  // Каталог блюд — с сервера: там рецепты и то, что опубликовал тренер.
  // Пока не пришёл — встроенный набор (catalog.js); пришёл — пересчёт.
  const [catalogVersion, setCatalogVersion] = useState(CATALOG.fromServer ? 1 : 0);
  useEffect(() => {
    let alive = true;
    apiPublic('dishes.list', {})
      .then((r) => { if (alive && setCatalog(r || {})) setCatalogVersion((v) => v + 1); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const [eggSize, setEggSize] = useState(getEggSize);
  const pickEggs = (s) => { setEggSize(s); saveEggSize(s.id); };

  // Фильтр колоды по меткам: «быстро», «вегетарианское», «без молочного»…
  const [tag, setTag] = useState('');
  const tagOptions = useMemo(() => {
    const seenTags = new Set();
    CATALOG.RECIPES.forEach((r) => (r.tags || []).forEach((t) => seenTags.add(t)));
    return ['быстро', 'высокобелковое', 'вегетарианское', 'без молочного', 'бюджетно'].filter((t) => seenTags.has(t));
  }, [catalogVersion]);

  const deck = useMemo(
    () => rankRecipes(pantry)
      .filter((entry) => !seen.includes(entry.recipe.id))
      .filter((entry) => !tag || (entry.recipe.tags || []).includes(tag)),
    [pantry, seen, tag, catalogVersion]
  );

  // Блюда подбираются под то, что осталось от нормы после своего
  const variants = useMemo(() => planVariants(liked, rest), [liked, rest, catalogVersion]);

  const toggle = (name) => setPantry((list) => (
    list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
  ));

  const like = (id) => {
    setLiked((list) => (list.includes(id) ? list : [...list, id]));
    setSeen((list) => [...list, id]);
  };

  const skip = (id) => setSeen((list) => [...list, id]);

  const restart = () => {
    setLiked([]);
    setSeen([]);
    setVariant(0);
    setStep('swipe');
  };

  const titles = {
    pantry: 'Что есть дома',
    swipe: 'Что приготовить',
    day: 'День по вашей норме',
  };

  // День собрать не из чего — такое бывает, если отмечены только завтраки.
  // Возвращаем человека к колоде вместо пустого экрана с объяснением.
  const dayReady = step === 'day' && (variants.length > 0 || extras.length > 0);

  return (
    <EggContext.Provider value={eggSize}>
    <div className="ration">
      <div className="ration__head">
        <button
          type="button"
          className="ration__back"
          onClick={() => {
            if (step === 'pantry') onClose();
            else if (step === 'swipe') setStep('pantry');
            else setStep('swipe');
          }}
        >
          <IconBack size={18} />
          {step === 'pantry' ? 'К норме' : 'Назад'}
        </button>
        <h2 className="ration__title">{titles[step]}</h2>
      </div>

      {trial && (
        <Section>
          <Note tone="info">
            Пробный режим: так раздел видит клиент, с его нормой. Ваши отметки
            хранятся только на этом устройстве и клиенту не видны; новые
            продукты и лайки в общую базу не уходят.{' '}
            <button type="button" className="ration__trial-reset" onClick={() => {
              try { localStorage.removeItem(TRIAL_STORE); } catch { /* ничего */ }
              setPantry(defaultPantry()); setLiked([]); setSeen([]); setExtras([]); setProducts([]);
              setVariant(0); setStep('pantry');
            }}>Начать пробу заново</button>
          </Note>
        </Section>
      )}

      {step === 'pantry' && (
        <Pantry pantry={pantry} onToggle={toggle} onNext={() => setStep('swipe')} />
      )}

      {step === 'swipe' && tagOptions.length > 0 && (
        <div className="ration__tags" role="radiogroup" aria-label="Какие блюда показывать">
          {[''].concat(tagOptions).map((t) => (
            <button
              key={t || 'all'}
              type="button"
              role="radio"
              aria-checked={tag === t}
              className={'chip' + (tag === t ? ' chip--active' : '')}
              onClick={() => { setTag(t); haptic(); }}
            >{t || 'все'}</button>
          ))}
        </div>
      )}

      {step === 'swipe' && (
        <Deck
          cards={deck}
          liked={liked}
          onLike={like}
          onSkip={skip}
          onEnough={() => { setVariant(0); setStep('day'); }}
          onRestart={restart}
        />
      )}

      {step === 'day' && !dayReady && (
        <Section>
          <Panel pad>
            <h3 style={{ marginTop: 0 }}>Дня пока не выходит</h3>
            <p className="small muted">
              Чтобы собрать день, нужны блюда хотя бы на два разных приёма пищи —
              например, завтрак и ужин. Вернитесь к колоде и отметьте ещё.
            </p>
            <button className="button button--primary" onClick={() => setStep('swipe')}>
              К блюдам
            </button>
          </Panel>
        </Section>
      )}

      {dayReady && (
        <Day
          variants={variants}
          index={variant}
          targets={targets}
          pantry={pantry}
          eaten={eaten}
          eggSize={eggSize}
          onEggSize={pickEggs}
          extras={(
            <Extras extras={extras} products={products} onAdd={addExtra} onRemove={removeExtra} trial={trial} />
          )}
          onOther={() => setVariant((n) => n + 1)}
          onRestart={restart}
          onPantry={() => setStep('pantry')}
        />
      )}
    </div>
    </EggContext.Provider>
  );
}
