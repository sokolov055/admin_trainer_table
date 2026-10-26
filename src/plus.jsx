import React, { useState, useSyncExternalStore } from 'react';
import { Sheet, Note } from './ui.jsx';
import { apiMutate } from './api.js';
import { useRights, setRights } from './rights.js';
import { haptic } from './telegram.js';
import './plus.css';

/**
 * «Плюс» на экранах (FT-767): отметка у закрытого и лист с предложением.
 * Показывается только там, где цифровое продаётся (gate → 'plus': сайт и
 * Android). На iPhone закрытого не видно совсем — сюда оттуда не попасть.
 * Оплата — FT-554; пока её нет, лист предлагает пробный период.
 */

// Названия — как в FEATURES сервера: лист говорит, что именно открыл человек
const TITLES = {
  foodPhoto: 'Сканер еды по фото',
  ration: 'Рацион из того, что есть дома',
  recipes: 'Рецепты и свои рецепты',
  diaryWeek: '«Неделя» в питании',
  mealNorm: 'Норма по приёмам пищи',
  palm: 'Подсчёт «Ладонью»',
  progressCharts: 'Графики за всё время',
  summaries: 'Итоги месяца и баланс мышц',
  dayReview: '«Разбор дня» с советами',
  themesPremium: 'Праздничные темы',
};

// Что входит — коротко, по разделам (docs/PLAN-MARKETPLACE.md, «Тарифы клиента»)
const INCLUDED = [
  ['Питание', 'фото тарелки и этикетки, рацион из холодильника и список покупок, рецепты, «Неделя», норма по приёмам, «Ладонь»'],
  ['Прогресс', 'графики весов и замеров за всё время, итоги месяца, баланс мышц'],
  ['Здоровье', '«Разбор дня» с советами по сну, шагам и питанию'],
  ['Оформление', 'праздничные темы и своя картинка вместо «+»'],
];

let open = null;
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const read = () => open;

/** Открыть лист «Плюса» про функцию key */
export function openPlusOffer(key) {
  haptic();
  open = key || '';
  listeners.forEach((fn) => fn());
}

function close() {
  open = null;
  listeners.forEach((fn) => fn());
}

/** Отметка у закрытого пункта: «Плюс» */
export function PlusBadge() {
  return <span className="plus-badge">Плюс</span>;
}

/** Вместо закрытой вкладки: что там и кнопка к листу */
export function PlusTeaser({ feature, children }) {
  return (
    <div className="plus-teaser">
      <PlusBadge />
      <strong>{TITLES[feature] || '«Плюс»'}</strong>
      <p className="small muted">{children}</p>
      <button type="button" className="button button--primary" onClick={() => openPlusOffer(feature)}>Подробнее о «Плюсе»</button>
    </div>
  );
}

/** Лист «Плюса» — один на приложение, живёт в App.jsx */
export function PlusOffer() {
  const key = useSyncExternalStore(subscribe, read, read);
  const rights = useRights();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (key === null) return null;
  const trial = async () => {
    setBusy(true); setError('');
    try {
      const res = await apiMutate('client.plus.trial', {});
      setRights(res.rights);
      haptic('success');
      close();
    } catch (e) {
      setError(e.message || 'Не получилось — попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };
  const price = rights && rights.plusPrice;
  return (
    <Sheet title="«Плюс»" onClose={close} className="plus-offer">
      {TITLES[key] && <p className="plus-offer__lead"><strong>{TITLES[key]}</strong> — в «Плюсе».</p>}
      <ul className="plus-offer__list">
        {INCLUDED.map(([head, text]) => <li key={head}><strong>{head}</strong><span>{text}</span></li>)}
      </ul>
      <p className="small muted">Запись тренировок, часы, базовый дневник питания и итоги недели — бесплатно всегда. Записанное без «Плюса» не пропадает.</p>
      {price > 0 && <p className="plus-offer__price"><strong>{price} ₽</strong> в месяц</p>}
      {rights && rights.canTrial ? (
        <button type="button" className="button button--primary button--block" disabled={busy} onClick={trial}>
          {busy ? 'Включаем…' : `Попробовать ${rights.trialDays} дней бесплатно`}
        </button>
      ) : (
        <Note tone="info">Оплата картой появится здесь в ближайшее время.</Note>
      )}
      {error && <Note tone="critical">{error}</Note>}
    </Sheet>
  );
}
