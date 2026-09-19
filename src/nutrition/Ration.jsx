import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Section, Panel, Note, Search, formatNumber, plural } from '../ui.jsx';
import { IconCheck, IconClose, IconBack, IconNutrition } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { FOOD, MEALS } from './recipes.js';
import {
  rankRecipes, planVariants, shoppingList, foodByGroup, defaultPantry, splitItems,
} from './match.js';
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

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    // Приватный режим и заблокированные куки роняют localStorage на чтении.
    // Раздел от этого не перестаёт работать — просто не помнит прошлый раз.
    return {};
  }
}

function save(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
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
      {...handlers}
    >
      <div className="card__top">
        <span className="card__meal">{mealTitle}</span>
        <h3 className="card__name">{recipe.name}</h3>
      </div>

      <div className="card__macros">
        <span className="card__kcal">{per.kcal}<i>ккал</i></span>
        <span className="card__m">Б&nbsp;{formatNumber(per.protein)}</span>
        <span className="card__m">Ж&nbsp;{formatNumber(per.fat)}</span>
        <span className="card__m">У&nbsp;{formatNumber(per.carbs)}</span>
      </div>

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
            <span>{grams(item.grams)}</span>
          </li>
        ))}
      </ul>

      <p className="card__out">
        {recipe.portions === 1
          ? 'Готовится на одну порцию'
          : 'Готовится на ' + recipe.portions + ' '
            + plural(recipe.portions, 'порцию', 'порции', 'порций')}
      </p>
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
        <span style={{ width: Math.min(100, share * 100) + '%' }} />
      </div>
    </div>
  );
}

function Day({ variants, index, targets, pantry, onOther, onRestart, onPantry }) {
  const plan = variants[index % variants.length];
  const list = useMemo(() => shoppingList(plan.dishes, pantry), [plan, pantry]);
  const groups = useMemo(foodByGroup, []);

  const shortfall = plan.diff.kcal;
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
            <span className="day__kcal">{formatNumber(plan.totals.kcal)}</span>
            <span className="day__unit">ккал за день</span>
          </div>
          <Bar label="Белки" value={plan.totals.protein} goal={targets.protein} unit=" г" />
          <Bar label="Жиры" value={plan.totals.fat} goal={targets.fat} unit=" г" />
          <Bar label="Углеводы" value={plan.totals.carbs} goal={targets.carbs} unit=" г" />
        </Panel>
      </Section>

      {badly && (
        <Section>
          <Note tone={shortfall < 0 ? 'info' : 'warning'}>
            {shortfall < 0
              ? 'До нормы не хватает ' + Math.abs(shortfall) + ' ккал. Отметьте ещё '
                + 'блюд — чем больше выбор, тем точнее собирается день.'
              : 'День выходит на ' + shortfall + ' ккал больше нормы. Посмотрите '
                + 'другие варианты или отметьте блюда полегче.'}
          </Note>
        </Section>
      )}

      <Section title="Что есть сегодня" note={'вариант ' + (index % variants.length + 1) + ' из ' + variants.length}>
        <Panel>
          <div className="day__dishes">
            {plan.dishes.map((dish) => {
              const meal = MEALS.find((m) => m.id === dish.recipe.meal) || {};
              return (
                <div key={dish.recipe.id} className="day__dish">
                  <div className="day__dish-head">
                    <span className="day__meal">{meal.title || dish.recipe.meal}</span>
                    {dish.servings !== 1 && (
                      <span className="day__servings">{servingLabel(dish.servings)}</span>
                    )}
                  </div>
                  <h4 className="day__name">{dish.recipe.name}</h4>
                  <p className="day__macros">
                    {Math.round(dish.recipe.per.kcal * dish.servings)} ккал ·
                    {' '}Б {formatNumber(Math.round(dish.recipe.per.protein * dish.servings * 10) / 10)} ·
                    {' '}Ж {formatNumber(Math.round(dish.recipe.per.fat * dish.servings * 10) / 10)} ·
                    {' '}У {formatNumber(Math.round(dish.recipe.per.carbs * dish.servings * 10) / 10)}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      </Section>

      <Section>
        <div className="ration__actions">
          {variants.length > 1 && (
            <button className="button" onClick={onOther}>Другой вариант</button>
          )}
          <button className="button" onClick={onRestart}>Выбрать блюда заново</button>
          <button className="button" onClick={onPantry}>Изменить продукты</button>
        </div>
      </Section>

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
                      <span className="shop__grams">{grams(row.grams)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>
        )}
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
                      <span className="shop__grams">{grams(row.grams)}</span>
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

export default function Ration({ targets, onClose }) {
  const saved = useMemo(load, []);
  const [pantry, setPantry] = useState(() => saved.pantry || defaultPantry());
  const [liked, setLiked] = useState(() => saved.liked || []);
  const [seen, setSeen] = useState(() => saved.seen || []);
  const [variant, setVariant] = useState(0);
  const [step, setStep] = useState(() => ((saved.liked || []).length >= 2 ? 'day' : 'pantry'));

  useEffect(() => { save({ pantry, liked, seen }); }, [pantry, liked, seen]);

  const deck = useMemo(
    () => rankRecipes(pantry).filter((entry) => !seen.includes(entry.recipe.id)),
    [pantry, seen]
  );

  const variants = useMemo(() => planVariants(liked, targets), [liked, targets]);

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
  const dayReady = step === 'day' && variants.length > 0;

  return (
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

      {step === 'pantry' && (
        <Pantry pantry={pantry} onToggle={toggle} onNext={() => setStep('swipe')} />
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
          onOther={() => setVariant((n) => n + 1)}
          onRestart={restart}
          onPantry={() => setStep('pantry')}
        />
      )}
    </div>
  );
}
