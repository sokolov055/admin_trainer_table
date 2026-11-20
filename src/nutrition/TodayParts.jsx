import React, { useState, useEffect, useRef } from 'react';
import { Section, Panel, plural } from '../ui.jsx';
import { IconSearch, IconBarcode, IconPlus, IconCopy } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { today, shiftDay, totalEntries } from './diary-model.js';
import { n, amountLabel } from './diary-ui.jsx';
import { cap } from './FoodFields.jsx';
import { weekOf, WEEKDAYS, dayTone, mealTarget, MEAL_ICONS, foodEmoji, WATER_GOAL, GLASS_ML, glassCount, glassDelta, finishFace } from './today-model.js';
import './today.css';

/*
 * «Сегодня» в питании — этап 1 макета nutrition-redesign-2026-11-20
 * (владелец 20.11.2026: «делай всё как в макете»). Неделя кружками, кольцо
 * «осталось» и три кольца БЖУ, фото тарелки главной кнопкой, приёмы
 * карточками, вода стаканами, блюда на остаток, пузырёк тренера и итог дня.
 * Данные — те же, что у дневника: сервер не меняется.
 */

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Кольцо SVG: части по очереди, дуги дорисовываются после появления */
export function Ring({ size, stroke, parts, track = 'currentColor', children, className = '' }) {
  const r = (size - stroke) / 2, len = 2 * Math.PI * r;
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (on || typeof requestAnimationFrame !== 'function') { setOn(true); return undefined; }
    const raf = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  let acc = 0;
  return (
    <span className={'nt-ring ' + className} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="nt-ring__track" cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {parts.map((p, i) => {
          const share = Math.max(0, Math.min(1, p.share || 0)), arc = share * len, start = acc;
          acc += share;
          return arc > 0 && (
            <circle key={i} className="nt-ring__arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={`${arc} ${len}`} strokeDashoffset={on ? 0 : arc}
              transform={`rotate(${-90 + start * 360} ${size / 2} ${size / 2})`} />
          );
        })}
      </svg>
      {children && <span className="nt-ring__mid">{children}</span>}
    </span>
  );
}

/** Число набегает от нуля за 0,9 с */
export function CountUp({ value }) {
  const target = Math.max(0, Math.round(Number(value) || 0));
  const [shown, setShown] = useState(() => (reduced() ? target : 0));
  useEffect(() => {
    if (reduced() || target === 0 || typeof requestAnimationFrame !== 'function') { setShown(target); return undefined; }
    let raf = 0;
    const from = shown, t0 = Date.now();
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / 900);
      setShown(Math.round(from + (target - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{shown.toLocaleString('ru-RU')}</>;
}

const TONE_COLOR = { good: 'var(--nt-good)', over: 'var(--nt-over)', under: 'var(--nt-under)', neutral: 'var(--nt-kcal)', empty: 'transparent' };

/**
 * Неделя кружками вместо стрелок и даты: у каждого дня колечко съеденного к
 * норме. weekDays — ответ diary.week за эту неделю (может не быть: нет
 * «Плюса» или ещё грузится — тогда просто дни). ‹ › листают неделю.
 */
export function DayStrip({ day, weekDays, target, onPick }) {
  const dates = weekOf(day), now = today();
  const byDay = Object.fromEntries((weekDays || []).map((d) => [d.day, d]));
  return (
    <div className="nt-days" role="group" aria-label="Дни недели">
      <button type="button" className="nt-days__arrow" aria-label="Прошлая неделя" onClick={() => onPick(shiftDay(dates[0], -7))}>‹</button>
      {dates.map((d, i) => {
        const info = byDay[d], kcal = info ? info.totals.kcal : 0, aim = Number(info?.targets?.kcal || target || 0);
        const tone = dayTone(kcal, aim);
        const share = aim > 0 ? kcal / aim : kcal > 0 ? 1 : 0;
        // Сегодня, пока день идёт, колечко оранжевое — «ещё набираем», а не «меньше нормы»
        const color = d === now && tone === 'under' ? 'var(--nt-kcal)' : TONE_COLOR[tone];
        return (
          <button key={d} type="button" className={'nt-day' + (d === day ? ' is-on' : '') + (d > now ? ' is-future' : '')}
            aria-pressed={d === day} aria-label={d === now ? 'Сегодня' : Number(d.slice(8)) + '.' + d.slice(5, 7)}
            onClick={() => { haptic(); onPick(d); }}>
            <small>{WEEKDAYS[i]}</small>
            <Ring size={30} stroke={4} parts={[{ share, color }]} className={info && info.complete ? 'is-full' : ''} />
            <b>{Number(d.slice(8))}</b>
          </button>
        );
      })}
      <button type="button" className="nt-days__arrow" aria-label="Следующая неделя" onClick={() => onPick(shiftDay(dates[6], 1))}>›</button>
    </div>
  );
}

const MACROS = [['protein', 'Б', 'белки', 'var(--nt-p)'], ['fat', 'Ж', 'жиры', 'var(--nt-f)'], ['carbs', 'У', 'углеводы', 'var(--nt-c)']];

/** Кольцо «осталось» и три кольца БЖУ; под ними — значки дня (тренировка, углеводы) */
export function DayHero({ totals, target, approxKcal, children }) {
  const aim = Number(target.kcal || 0), left = aim - totals.kcal, over = aim > 0 && left < 0;
  return (
    <div className="nt-hero">
      <div className="nt-hero__row">
        <Ring size={138} stroke={14} className={'nt-hero__ring' + (over ? ' is-over' : '')}
          parts={[{ share: aim > 0 ? totals.kcal / aim : totals.kcal > 0 ? 1 : 0, color: over ? 'var(--nt-over)' : 'url(#nt-kcal-grad)' }]}>
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs><linearGradient id="nt-kcal-grad" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#f5b324" /><stop offset="1" stopColor="#e9564a" /></linearGradient></defs></svg>
          <b>{over ? '+' : ''}<CountUp value={aim > 0 ? Math.abs(left) : totals.kcal} /></b>
          <span>{aim > 0 ? over ? 'ккал сверх нормы' : 'ккал осталось' : 'ккал съедено'}</span>
        </Ring>
        <div className="nt-macros">
          {MACROS.map(([k, letter, word, color]) => (
            <div className="nt-macro" key={k}>
              <Ring size={36} stroke={5} track={color} parts={[{ share: target[k] > 0 ? totals[k] / target[k] : 0, color }]}><i style={{ color }}>{letter}</i></Ring>
              <span><b>{n(totals[k])}</b> <small>{target[k] ? '/ ' + n(target[k]) + ' г ' : 'г '}{word}</small></span>
            </div>
          ))}
        </div>
      </div>
      {(children || approxKcal > 0) && <div className="nt-hero__chips">{children}{approxKcal > 0 && <span className="nt-chip">≈ {n(approxKcal)} ккал на глаз</span>}</div>}
    </div>
  );
}

/** Главное действие: фото тарелки (AI-сканер — главный способ, FT-744), рядом поиск и штрихкод */
export function AddBar({ photo, photoPlus, palm, onPhoto, onSearch, onBarcode, onPalm }) {
  return (
    <div className="nt-add">
      {(photo || photoPlus) ? (
        <button type="button" className="nt-snap" onClick={onPhoto}>
          <b>Сфоткать тарелку{photoPlus ? ' · Плюс' : ''}</b><span>AI посчитает сам</span><em aria-hidden="true">📷</em>
        </button>
      ) : (
        <button type="button" className="nt-snap nt-snap--plain" onClick={palm ? onPalm : onSearch}>
          <b>{palm ? 'Отметить порции' : 'Записать еду'}</b><span>{palm ? 'ладонью, без весов' : 'найдите продукт или блюдо'}</span><em aria-hidden="true">{palm ? '✋' : '🍽️'}</em>
        </button>
      )}
      {palm && (photo || photoPlus) && <button type="button" className="nt-sq" onClick={onPalm}><span aria-hidden="true">✋</span><small>ладонь</small></button>}
      {!palm && <button type="button" className="nt-sq" onClick={onSearch}><IconSearch size={20} /><small>поиск</small></button>}
      {!palm && <button type="button" className="nt-sq" onClick={onBarcode}><IconBarcode size={20} /><small>код</small></button>}
    </div>
  );
}

/**
 * Приёмы карточками: значок, «съедено / норма приёма», полоска и еда
 * плашками (нажать — изменить или удалить). Приём по часам сегодня подсвечен.
 */
export function MealCards({ meals, entries, dayKcal, shares, nowMeal, readOnly, onAdd, onOpen, onCopy }) {
  return (
    <Section>
      <Panel className="nt-meals">
        {meals.map((m) => {
          const list = entries.filter((e) => e.meal === m.id), eaten = totalEntries(list).kcal, norm = mealTarget(m.id, dayKcal, shares);
          const now = nowMeal === m.id;
          return (
            <div key={m.id} className={'nt-meal nt-meal--' + m.id + (now && !readOnly ? ' is-now' : '')}>
              <span className="nt-meal__icon" aria-hidden="true">{MEAL_ICONS[m.id]}</span>
              <div className="nt-meal__body">
                <div className="nt-meal__head">
                  <b>{m.label}</b>{now && !readOnly && <span className="nt-meal__now">● сейчас</span>}
                  <span className="nt-meal__kcal">{n(eaten)}{norm ? ' / ' + n(norm) : ' ккал'}</span>
                </div>
                {norm > 0 && <div className="nt-bar"><i className={eaten > norm * 1.12 ? 'is-over' : ''} style={{ '--w': Math.min(100, eaten / norm * 100) + '%' }} /></div>}
                {list.length > 0 ? (
                  <div className="nt-pills">
                    {list.map((e) => (
                      <button key={e.id} type="button" className={'nt-pill' + (e.pending ? ' is-pending' : '') + (e.error ? ' is-error' : '')}
                        disabled={readOnly || (e.pending && !e.error)} onClick={() => onOpen(e)}
                        aria-label={'Изменить: ' + e.product.name}>
                        <span aria-hidden="true">{foodEmoji(e.product.name)}</span> {cap(e.product.name)} <small>{amountLabel(e)} · {e.product.approx ? '≈' : ''}{n(totalEntries([e]).kcal)}</small>
                        {e.pending && <small>{e.error ? ' · нужна проверка' : ' · ждёт отправки'}</small>}
                      </button>
                    ))}
                  </div>
                ) : !readOnly && <div className="nt-meal__empty">{now ? 'сфоткайте тарелку или нажмите ＋' : ''}</div>}
              </div>
              {!readOnly && <button type="button" className="nt-plus" aria-label={'Добавить в ' + m.label.toLowerCase()} onClick={() => onAdd(m.id)}><IconPlus size={20} /></button>}
            </div>
          );
        })}
        {!readOnly && <button type="button" className="nt-meals__copy" onClick={onCopy}><IconCopy size={15} /> Повторить еду</button>}
      </Panel>
    </Section>
  );
}

/** Вода стаканами: нажать пустой — налить до него, последний полный — убрать */
export function WaterGlasses({ ml, goal = WATER_GOAL, readOnly, busy, onDelta, children }) {
  const count = glassCount(ml, goal), full = Math.floor((ml || 0) / GLASS_ML);
  const liters = (v) => (Math.round(v / 50) / 20).toLocaleString('ru-RU');
  return (
    <Section>
      <Panel pad>
        <div className="nt-water__head"><span aria-hidden="true">💧</span><b>{liters(ml || 0)}</b><small>из {liters(goal)} л</small><span className="nt-sp" />{!readOnly && <small>нажмите стакан</small>}</div>
        <div className="nt-glasses">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} type="button" className={'nt-glass' + (i < full ? ' is-on' : '') + (i === full ? ' is-next' : '')}
              disabled={readOnly || busy} aria-label={i < full ? (i === full - 1 ? 'Убрать стакан' : 'Стакан выпит') : 'Выпил стакан'}
              onClick={() => { const d = glassDelta(i, ml); if (d) { haptic(); onDelta(d); } }} />
          ))}
        </div>
        {children}
      </Panel>
    </Section>
  );
}

/** «Что съесть на остаток»: три блюда карточками, «все ›» — во вкладку идей */
const DISH_TINTS = ['var(--nt-teal)', 'var(--nt-p)', 'var(--nt-f)'];
export function IdeasStrip({ remaining, dishes, onAll, onAdd }) {
  if (!dishes.length) return null;
  return (
    <Section>
      <Panel pad>
        <div className="nt-ideas__head"><b>Что съесть на {n(remaining)} ккал</b><span className="nt-sp" /><button type="button" className="nt-link" onClick={onAll}>все ›</button></div>
        <div className="nt-ideas">
          {dishes.slice(0, 3).map((p, i) => (
            <div key={p.kind + p.id} className="nt-dish" style={{ '--dc': DISH_TINTS[i % 3] }}>
              <button type="button" className="nt-dish__add" aria-label={'Записать: ' + p.name} onClick={() => onAdd(p)}>＋</button>
              <span className="nt-dish__em" aria-hidden="true">{foodEmoji(p.name)}</span>
              <b>{cap(p.name)}</b>
              <small>{n(p.kcal)} ккал{p.protein >= 20 ? ' · ' + n(p.protein) + ' г белка' : ''}</small>
            </div>
          ))}
        </div>
      </Panel>
    </Section>
  );
}

/** Слово тренера — пузырёк сообщения */
export function CoachBubble({ text }) {
  if (!text) return null;
  return (
    <Section>
      <div className="nt-coach"><span className="nt-coach__av" aria-hidden="true">🏋️</span><div className="nt-coach__bub"><small>От тренера</small><span>{text}</span></div></div>
    </Section>
  );
}

function confetti(el) {
  if (!el || reduced()) return;
  const colors = ['#f08a1c', '#e0457b', '#3b8fe0', '#1a9488', '#f2a516', '#7656cc'];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('i');
    s.className = 'nt-conf';
    s.style.left = Math.random() * 100 + '%';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = Math.random() * 0.3 + 's';
    el.appendChild(s);
    setTimeout(() => s.remove(), 1900);
  }
}

/**
 * Итог дня: одна кнопка «Завершить день», после — эмодзи, слово и цифры.
 * Конфетти — когда день завершили только что и он в норме.
 */
export function FinishCard({ data, totals, target, readOnly, busy, streak, onFinish, onReopen }) {
  const box = useRef(null), justDone = useRef(false);
  const face = finishFace(totals.kcal, Number(target.kcal || 0));
  useEffect(() => {
    if (data.complete && justDone.current) { justDone.current = false; if (face.tone === 'good') confetti(box.current); }
  }, [data.complete]);
  const pending = data.entries.some((e) => e.pending);
  if (!data.complete && readOnly) return <p className="small muted diary-day-open">Клиент ещё не завершил этот день.</p>;
  return (
    <Section>
      <Panel pad>
        <div className="nt-finish" ref={box}>
          {data.complete ? (
            <div className="nt-finish__done">
              <span className="nt-finish__emoji" aria-hidden="true">{face.emoji}</span>
              <b>{face.title}</b>
              <small>{n(totals.kcal)}{target.kcal ? ' из ' + n(target.kcal) : ''} ккал · белок {n(totals.protein)} г · вода {(Math.round((data.waterMl || 0) / 50) / 20).toLocaleString('ru-RU')} л</small>
              {streak > 1 && <span className="nt-chip nt-chip--good">🔥 {streak} {plural(streak, 'полный день', 'полных дня', 'полных дней')} подряд</span>}
              {!readOnly && <button type="button" className="button button--ghost" disabled={busy} onClick={onReopen}>Дописать</button>}
            </div>
          ) : (
            <>
              <button type="button" className="button button--primary button--block" disabled={busy || pending || !data.entries.length}
                onClick={() => { justDone.current = true; onFinish(); }}>✓ Завершить день</button>
              {(pending || !data.entries.length) && <p className="small muted nt-finish__hint">{pending ? 'Дождёмся отправки записей с телефона.' : 'Запишите еду — потом завершите день.'}</p>}
            </>
          )}
        </div>
      </Panel>
    </Section>
  );
}


/* ==================================================================
 * Этап 2 макета — «Добавить еду»: значки приёмов, пончик БЖУ, метки на снимке
 * ================================================================== */

/** Приём пищи четырьмя значками вместо списка (макет: выбран приём по часам) */
export function MealPicker({ meals, value, onChange, label = 'Приём пищи' }) {
  return (
    <div className="nt-mealpick" role="group" aria-label={label}>
      {meals.map((m) => (
        <button key={m.id} type="button" className={value === m.id ? 'is-on' : ''} aria-pressed={value === m.id}
          onClick={() => { haptic(); onChange(m.id); }}>
          <span aria-hidden="true">{MEAL_ICONS[m.id]}</span>{m.label}
        </button>
      ))}
    </div>
  );
}

/** Доли калорий из белков, жиров и углеводов — для пончика */
export function macroShares(t) {
  const p = (Number(t.protein) || 0) * 4, f = (Number(t.fat) || 0) * 9, c = (Number(t.carbs) || 0) * 4, sum = p + f + c;
  return sum > 0 ? { protein: p / sum, fat: f / sum, carbs: c / sum } : null;
}

/** Итог порции: пончик БЖУ, калории крупно, строка БЖУ и метка «много белка» */
export function PortionPreview({ totals, note = '' }) {
  const s = macroShares(totals);
  return (
    <div className="nt-prev">
      <Ring size={46} stroke={7} parts={s ? [{ share: s.protein, color: 'var(--nt-p)' }, { share: s.fat, color: 'var(--nt-f)' }, { share: s.carbs, color: 'var(--nt-c)' }] : []} />
      <div className="nt-prev__text">
        <b>{n(totals.kcal)} ккал</b>
        <small>{note}Б {n(totals.protein)} · Ж {n(totals.fat)} · У {n(totals.carbs)}</small>
      </div>
      {s && s.protein >= 0.3 && totals.protein >= 10 && <span className="nt-chip nt-chip--good">💪 много белка</span>}
    </div>
  );
}

/* Места меток на снимке: найденное всплывает по одному поверх тарелки */
const TAG_SPOTS = [[14, 18], [52, 34], [10, 64], [48, 72], [26, 42], [58, 12]];
export function PlateTags({ names }) {
  return (
    <div className="nt-tags" aria-hidden="true">
      {names.slice(0, TAG_SPOTS.length).map((t, i) => (
        <span key={i + t} className="nt-tag" style={{ left: TAG_SPOTS[i][0] + '%', top: TAG_SPOTS[i][1] + '%', animationDelay: (0.25 + i * 0.35) + 's' }}>{t}</span>
      ))}
    </div>
  );
}
