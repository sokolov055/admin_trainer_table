import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Sheet, Note, Switch } from './ui.jsx';
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

/* ==========================================================================
 * Пробный «Плюс» сам (FT-768, решение владельца 26.10.2026)
 *
 * Кнопки «Попробовать» на iPhone нет: пробный включает сервер — новичку после
 * анкеты, остальным при первом открытии после TARIFFS. Здесь только два
 * экрана по одному разу (rights.trialGift / trialEnded, отметка —
 * client.plus.seen) и строка в «Моих данных». На iPhone (sellDigital=false)
 * ни цены, ни «купить», ни ссылки на сайт — цена и ссылка приходят письмом
 * (App Store 3.1.1, 3.1.3; макет FT-768).
 * ========================================================================== */

const MARKETING_DOC = 'https://app.fitness100.ru/marketing-consent.html';

// Что открывает пробный — коротко, без цены: одинаково на всех платформах
const GIFT = ['Фото еды: калории по снимку', 'Неделя питания и рецепты', '«Разбор дня» с советами', 'Графики за всё время'];

const dayMonth = (iso) => {
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
  } catch (_) { return iso; }
};

const seen = (what) => apiMutate('client.plus.seen', { what }, { quiet: true })
  .then((res) => res && res.rights && setRights(res.rights))
  .catch(() => {});

/**
 * Подпись согласия на рекламные письма и СМС. Отдельная отметка, не
 * отмечена заранее, без неё всё работает (ст. 18 38-ФЗ, ст. 15 152-ФЗ)
 */
export function MarketingLabel() {
  return (
    <>Присылать письма и СМС о «Плюсе» и предложениях Fit Track (<a href={MARKETING_DOC} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}>согласие</a>). Можно отключить в «Моих данных»</>
  );
}

/**
 * «Вам открыт «Плюс»» после анкеты и «Пробный закончился» — по разу.
 * enabled — свой кабинет, и сейчас не идёт анкета или согласие
 */
export function PlusMoments({ enabled }) {
  const rights = useRights();
  const [closed, setClosed] = useState('');
  const [ads, setAds] = useState(false);
  if (!enabled || !rights) return null;
  const what = rights.trialGift ? 'gift' : rights.trialEnded ? 'ended' : '';
  if (!what || closed === what) return null;

  const close = () => {
    setClosed(what);
    // Галочку — до отметки «увидел»: оба ответа несут права, последний главный
    const chain = what === 'gift' && ads && !rights.marketing
      ? apiMutate('client.marketing.set', { on: true }, { quiet: true }).catch(() => {})
      : Promise.resolve();
    chain.then(() => seen(what));
  };

  if (what === 'gift') {
    return (
      <Sheet title="«Плюс»" onClose={close} className="plus-gift">
        <div className="plus-gift__mark" aria-hidden="true">+</div>
        <h2 className="plus-gift__title">Вам открыт «Плюс» на {rights.trialDays} дней</h2>
        <ul className="plus-gift__list">
          {GIFT.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="small muted plus-gift__note">
          {rights.plusUntil ? `До ${dayMonth(rights.plusUntil)} включительно. ` : ''}Всё, что запишете, останется у вас.
        </p>
        {!rights.marketing && (
          <label className="plus-gift__ads">
            <input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} />
            <span><MarketingLabel /></span>
          </label>
        )}
        <button type="button" className="button button--primary button--block" onClick={close}>Начать</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="«Плюс»" onClose={close} className="plus-gift">
      <h2 className="plus-gift__title">Пробный период «Плюса» закончился</h2>
      <p className="muted">Всё, что вы записали, сохранено. Дневник питания, тренировки и замеры работают как раньше.</p>
      {/* Сайт и Android — цена и лист «Плюса»; на iPhone — ничего сверх справки */}
      {rights.sellDigital && rights.plusPrice > 0 && (
        <p className="plus-offer__price"><strong>{rights.plusPrice} ₽</strong> в месяц</p>
      )}
      {rights.sellDigital && (
        <button type="button" className="button button--primary button--block" onClick={() => { close(); openPlusOffer(''); }}>
          Подробнее о «Плюсе»
        </button>
      )}
      <button type="button" className={'button button--block' + (rights.sellDigital ? '' : ' button--primary')} onClick={close}>Понятно</button>
    </Sheet>
  );
}

/**
 * «Плюс» в «Моих данных»: состояние строкой. На iPhone — только срок, без
 * «Продлить» и «Управлять»; на сайте и Android без «Плюса» — к листу
 */
export function PlusStatus() {
  const rights = useRights();
  if (!rights || !rights.on) return null;
  let value;
  if (rights.plus) {
    value = rights.plusSource === 'trainer' ? 'открыт тренером'
      : rights.plusSource === 'trial' ? (rights.plusUntil ? `пробный, до ${dayMonth(rights.plusUntil)}` : 'пробный')
        : rights.plusUntil ? `до ${dayMonth(rights.plusUntil)}` : 'открыт';
  } else {
    value = rights.sellDigital && rights.plusPrice > 0 ? `${rights.plusPrice} ₽ в месяц` : 'не подключён';
  }
  const tappable = !rights.plus && rights.sellDigital;
  const body = <><span className="plus-status__name">«Плюс»</span><span className="plus-status__value">{value}</span></>;
  return tappable
    ? <button type="button" className="plus-status plus-status--tap" onClick={() => openPlusOffer('')}>{body}</button>
    : <div className="plus-status">{body}</div>;
}

/** Переключатель рекламных писем и СМС — отозвать согласие так же легко, как дать */
export function MarketingSwitch() {
  const rights = useRights();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!rights || !rights.on) return null;
  const set = async (on) => {
    setBusy(true); setError('');
    try {
      const res = await apiMutate('client.marketing.set', { on });
      setRights(res.rights);
    } catch (e) {
      setError(e.message || 'Не получилось — попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Switch checked={!!rights.marketing} onChange={set} disabled={busy}>
        <span>Письма и СМС о предложениях</span>
        <span className="small muted plus-ads__hint">О «Плюсе» и новых функциях — не чаще 4 раз в месяц, днём. <a href={MARKETING_DOC} target="_blank" rel="noopener noreferrer">Согласие</a></span>
      </Switch>
      {error && <Note tone="critical">{error}</Note>}
    </>
  );
}

/**
 * Ссылка из письма app.fitness100.ru/?plus — лист «Плюса» сразу (сайт и
 * Android). Метку из адреса снимаем, чтобы обновление страницы не открывало снова
 */
export function usePlusLink() {
  const rights = useRights();
  useEffect(() => {
    if (!rights || !rights.sellDigital) return;
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (_) { return; }
    if (!params.has('plus')) return;
    params.delete('plus');
    const rest = params.toString();
    try { window.history.replaceState(window.history.state, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash); } catch (_) {}
    if (!rights.plus) openPlusOffer('');
  }, [rights]);
}
