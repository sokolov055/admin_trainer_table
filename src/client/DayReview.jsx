import React, { useEffect, useId, useRef, useState } from 'react';
import { useData } from '../useData.js';
import { Sheet, formatNumber } from '../ui.jsx';
import { noteDayReview, askReviewAt } from '../native-review.js';
import './day-review.css';

/**
 * «Разбор дня» (FT-738, идея IDEA-6): кольца дня по образцу «Активности»
 * Apple — движение, тренировка, питание, сон, — советы и неделя точками.
 * Всё считает сервер (server/src/lib/day-review.js), экран только рисует.
 *
 * Карточка — на «Обзоре» у клиента вместо «Сегодня» и в «Прогрессе» у
 * тренера (карточка клиента и «Мои тренировки»); касание — лист с разбором
 * любого из прошлых дней. Кольцо, закрытое сегодня, один раз «вылезает» с
 * анимацией и плашкой — у самого клиента, не у тренера.
 *
 * Пока видят владелец и тестовые клиенты: client.day отвечает enabled:false
 * остальным, и карточки нет.
 */

const RING_VAR = { move: '--ring-move', train: '--ring-train', food: '--ring-food', sleep: '--ring-sleep' };
const RING_TITLE = { move: 'Движение', train: 'Тренировка', food: 'Питание', sleep: 'Сон' };
const WEEKDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const LIVE_MS = 5 * 60 * 1000;

const n = (v) => formatNumber(Math.round(Number(v) || 0));
function hm(min) {
  const m = Math.round(Number(min) || 0);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return r + ' мин';
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}
const shift = (day, k) => {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};
function dayLabel(day, today) {
  if (day === today) return 'Сегодня';
  if (day === shift(today, -1)) return 'Вчера';
  return new Date(day + 'T12:00:00Z').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Подпись кольца: значение и короткое пояснение */
export function ringText(r) {
  switch (r.id) {
    case 'move':
      return { value: `${n(r.value)} из ${n(r.target)}`, note: 'шагов' };
    case 'train':
      if (r.state === 'done') return { value: r.value ? hm(r.value) : 'Была', note: `${r.doneWeek} из ${r.target} за неделю` };
      if (r.state === 'due') return { value: 'Нужна сегодня', note: `${r.doneWeek} из ${r.target} за неделю` };
      return { value: 'Отдых', note: `${r.doneWeek} из ${r.target} за неделю` };
    case 'food':
      return {
        // В карточке «ккал» не входит в строку на 390 px — там «Питание» и так рядом
        short: `${n(r.value)} из ${n(r.target)}`,
        value: `${n(r.value)} из ${n(r.target)} ккал`,
        note: (r.over ? 'больше цели · ' : '') + (r.proteinTarget ? `белок ${n(r.protein)} из ${n(r.proteinTarget)} г` : ''),
      };
    case 'sleep':
      return r.value == null
        ? { value: 'Нет данных', note: 'за прошлую ночь' }
        : { value: hm(r.value), note: r.usual ? `обычно ${hm(r.usual)}` : `цель ${hm(r.target)}` };
    default:
      return { value: '', note: '' };
  }
}

/**
 * Кольца одно в другом, внешнее — первое. progress > 1 рисуется полным:
 * перебор шагов — не повод для второго витка, как у Apple, а перебор
 * калорий — вообще не успех.
 */
export function Rings({ rings, size = 112, pop = null, label }) {
  const [drawn, setDrawn] = useState(() => reduced());
  // Градиенты — у каждого набора колец свои: id в одном документе общие
  const uid = useId().replace(/:/g, '');
  useEffect(() => {
    if (drawn) return undefined;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const count = Math.max(rings.length, 1);
  const stroke = size * (count > 3 ? 0.095 : 0.11);
  const gap = Math.max(1.5, stroke * 0.16);
  return (
    <svg className={'day-rings' + (pop ? ' is-pop' : '')} width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label={label || rings.map((r) => `${RING_TITLE[r.id]}: ${r.closed ? 'закрыто' : Math.round(Math.min(r.progress, 1) * 100) + ' %'}`).join(', ')}>
      {/* Как у Apple: дуга светлеет к концу. Конического градиента в SVG
          нет — линейный сверху вниз на круге читается так же */}
      <defs>
        {rings.map((r) => (
          <linearGradient key={r.id} id={`${uid}-${r.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: `var(${RING_VAR[r.id] || '--accent'})` }} />
            <stop offset="1" style={{ stopColor: `var(${RING_VAR[r.id] || '--accent'}-end)` }} />
          </linearGradient>
        ))}
      </defs>
      {rings.map((r, i) => {
        const radius = size / 2 - stroke / 2 - i * (stroke + gap);
        if (radius <= stroke / 2) return null;
        const c = 2 * Math.PI * radius;
        const p = Math.max(0, Math.min(1, Number(r.progress) || 0));
        const color = `var(${RING_VAR[r.id] || '--accent'})`;
        return (
          <g key={r.id} className={'day-rings__ring' + (r.state === 'rest' ? ' is-rest' : '') + (pop === r.id ? ' is-popping' : '')}>
            <circle className="day-rings__track" cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} />
            {p > 0 && (
              <circle className="day-rings__arc" cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`url(#${uid}-${r.id})`}
                strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
                strokeDashoffset={drawn ? c * (1 - p) : c}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Какое кольцо сегодня закрылось и ещё не праздновалось на этом устройстве.
 * Память — localStorage на день: в приватном окне её нет, тогда плашка
 * покажется ещё раз — не беда.
 */
function useClosedPop(data, enabled) {
  const [pop, setPop] = useState(null);
  const shown = useRef(false);
  useEffect(() => {
    if (!enabled || !data?.enabled || data.day !== data.today || shown.current) return;
    const key = 'day-rings:' + data.day;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { seen = []; }
    // Отдых закрывает кольцо сам по себе — праздновать нечего
    const fresh = data.rings.find((r) => r.closed && r.state !== 'rest' && !seen.includes(r.id));
    // Первый заход за день: что уже закрыто — запоминаем молча, не салютуем задним числом
    if (!localStorageHas(key)) {
      try { localStorage.setItem(key, JSON.stringify(data.rings.filter((r) => r.closed).map((r) => r.id))); } catch (_) {}
      return;
    }
    if (!fresh) return;
    try { localStorage.setItem(key, JSON.stringify([...seen, fresh.id])); } catch (_) {}
    shown.current = true;
    setPop(fresh.id);
    const t = setTimeout(() => { setPop(null); shown.current = false; }, 3200);
    return () => clearTimeout(t);
  }, [data, enabled]);
  return pop;
}
function localStorageHas(key) {
  try { return localStorage.getItem(key) !== null; } catch (_) { return true; }
}

/**
 * Карточка на «Обзоре» / в «Прогрессе». own — свой кабинет клиента (с
 * плашкой закрытого кольца), mine — «Мои тренировки» тренера
 */
export default function DayCard({ clientRow, own = false, mine = false }) {
  const params = clientRow ? { clientRow } : {};
  const res = useData('client.day', params, [clientRow], { live: LIVE_MS });
  const [open, setOpen] = useState(false);
  const data = res.data;
  const pop = useClosedPop(data, own);
  // Разбор есть — просьба об оценке за полный день ждёт его закрытия (FT-751)
  const enabled = !!data?.enabled;
  useEffect(() => { if (own && enabled) noteDayReview(); }, [own, enabled]);
  const close = () => {
    setOpen(false);
    if (own) setTimeout(() => { askReviewAt('day-review').catch(() => {}); }, 600);
  };

  if (!data && res.loading) return own ? <DayCardWait /> : null;
  if (!data?.enabled || !data.rings?.length) return null;
  const tip = data.tips?.[0];
  return (
    <>
      <section className="day-card" aria-label="Мой день">
        {pop && (
          <div className="day-card__pop" role="status" style={{ '--ring': `var(${RING_VAR[pop]})` }}>
            Кольцо «{RING_TITLE[pop]}» закрыто
          </div>
        )}
        <div className="day-card__head">
          <h2 className="day-card__title">{own || mine ? 'Мой день' : 'День клиента'}</h2>
          {data.inGoal && <span className="day-card__goal">день в цель</span>}
        </div>
        <button type="button" className="day-card__body" onClick={() => setOpen(true)}>
          <Rings rings={data.rings} size={112} pop={pop} />
          <ul className="day-card__list">
            {data.rings.map((r) => {
              const t = ringText(r);
              return (
                <li key={r.id} className={r.closed ? 'is-closed' : ''}>
                  <i style={{ background: `var(${RING_VAR[r.id]})` }} aria-hidden="true" />
                  <span className="day-card__label">{RING_TITLE[r.id]}</span>
                  <span className="day-card__value">{t.short || t.value}</span>
                </li>
              );
            })}
          </ul>
        </button>
        {tip && (
          <button type="button" className="day-card__tip" onClick={() => setOpen(true)}>
            {tip.text}
          </button>
        )}
      </section>
      {open && <DaySheet clientRow={clientRow} first={data} onClose={close} />}
    </>
  );
}

function DayCardWait() {
  return (
    <section className="day-card" aria-hidden="true">
      <div className="skeleton day-card__wait-title" />
      <div className="skeleton day-card__wait" />
    </section>
  );
}

/** Лист «Разбор дня»: день, кольца крупно, что по каждому, советы, неделя */
function DaySheet({ clientRow, first, onClose }) {
  const today = first.today;
  const [day, setDay] = useState(first.day);
  const params = { ...(clientRow ? { clientRow } : {}), ...(day !== today ? { day } : {}) };
  const res = useData('client.day', params, [clientRow, day]);
  const data = res.data?.day === day ? res.data : (day === first.day ? first : null);
  const oldest = shift(today, -120);
  return (
    <Sheet title="Разбор дня" onClose={onClose} className="day-sheet">
      <div className="day-sheet__nav">
        <button type="button" className="day-sheet__step" aria-label="Предыдущий день"
          disabled={day <= oldest} onClick={() => setDay(shift(day, -1))}>‹</button>
        <strong>{dayLabel(day, today)}</strong>
        <button type="button" className="day-sheet__step" aria-label="Следующий день"
          disabled={day >= today} onClick={() => setDay(shift(day, 1))}>›</button>
      </div>
      {!data ? (
        <div className="skeleton day-sheet__wait" />
      ) : (
        <>
          <div className="day-sheet__rings">
            <Rings key={day} rings={data.rings} size={196} />
            {data.inGoal && <span className="day-card__goal">день в цель</span>}
          </div>
          <ul className="day-sheet__rows">
            {data.rings.map((r) => {
              const t = ringText(r);
              return (
                <li key={r.id}>
                  <i style={{ background: `var(${RING_VAR[r.id]})` }} aria-hidden="true" />
                  <span className="day-sheet__label">{RING_TITLE[r.id]}</span>
                  <span className="day-sheet__value">
                    <strong>{t.value}</strong>
                    {t.note && <span>{t.note}</span>}
                  </span>
                  <span className={'day-sheet__mark' + (r.closed ? ' is-closed' : '')}>
                    {r.closed ? (r.state === 'rest' ? 'отдых' : 'закрыто') : 'открыто'}
                  </span>
                </li>
              );
            })}
          </ul>
          {data.tips?.length > 0 && (
            <section className="day-sheet__tips">
              <h3>{day === today ? 'Что сделать' : 'Что было'}</h3>
              {data.tips.map((t) => <p key={t.id}>{t.text}</p>)}
            </section>
          )}
          <div className="day-sheet__week" role="group" aria-label="Неделя">
            {data.days.map((d) => (
              <button key={d.day} type="button" className={'day-sheet__day' + (d.day === day ? ' is-current' : '')}
                aria-pressed={d.day === day} onClick={() => setDay(d.day)}>
                <Rings rings={d.rings} size={36} label={dayLabel(d.day, today) + (d.inGoal ? ', день в цель' : '')} />
                <span>{WEEKDAY[new Date(d.day + 'T00:00:00Z').getUTCDay()]}</span>
              </button>
            ))}
          </div>
          <p className="day-sheet__foot">Подсказки считаются по вашим целям и записям в приложении. Это не медицинские рекомендации.</p>
        </>
      )}
    </Sheet>
  );
}
