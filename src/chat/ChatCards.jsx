import React, { useEffect, useState } from 'react';
import { apiOnce } from '../api.js';
import { haptic } from '../telegram.js';

/**
 * Карточки Fit Track в чате (FT-808, этап 2; макет messenger-2026-11-20,
 * вкладка 4). Карточку собирает сервер (server/src/lib/chat-cards.js) —
 * экран только рисует её и ведёт в раздел: тренировка и программа —
 * «Тренировки», замеры — «Прогресс», питание — «Питание». Упражнение
 * открывается здесь же листом с техникой.
 */

export const CARD_MENU = [
  { kind: 'workout', icon: '🏋️', label: 'Тренировка', pick: true },
  { kind: 'program', icon: '📋', label: 'Программа' },
  { kind: 'exercise', icon: '🎯', label: 'Упражнение', pick: true, search: true },
  { kind: 'measures', icon: '📏', label: 'Замеры' },
  { kind: 'food', icon: '🥗', label: 'Питание за день', pick: true },
];

/** Куда ведёт карточка: раздел приложения (у тренера — раздел карточки клиента) */
export const CARD_SECTION = { workout: 'plan', program: 'plan', measures: 'progress', food: 'nutrition' };

const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const ddmm = (day) => (day ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : '');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + String(Math.abs(n)).replace('.', ',');
const MEASURE_LABELS = { weight: 'Вес', waist: 'Талия', hips: 'Бёдра', chest: 'Грудь', arm: 'Рука', thigh: 'Бедро', shoulders: 'Плечи' };

function CardBody({ card }) {
  switch (card.kind) {
    case 'workout':
      return (
        <>
          <span className="chat-card__head">🏋️ {card.title} · {ddmm(card.day)}</span>
          <span className="chat-card__line">{card.sets} подх. · {fmt(card.tonnage)} кг{card.minutes ? ` · ${card.minutes} мин` : ''}</span>
          {card.skipped && card.skipped.length > 0 && (
            <span className="chat-card__note">Пропущено: {card.skipped.map((s) => s.name + (s.reason ? ` (${s.reason})` : '')).join(', ')}</span>
          )}
        </>
      );
    case 'program':
      return (
        <>
          <span className="chat-card__head">📋 Программа · {card.title}</span>
          <span className="chat-card__line">{card.trainings} трен. · {card.exercises} упражн.</span>
          {card.blocks && card.blocks.length > 0 && <span className="chat-card__note">{card.blocks.join(' · ')}</span>}
        </>
      );
    case 'exercise':
      return (
        <>
          <span className="chat-card__head">🎯 {card.title}</span>
          <span className="chat-card__line">{[card.muscle, card.media ? 'есть видео техники' : 'техника'].filter(Boolean).join(' · ')}</span>
        </>
      );
    case 'measures':
      return (
        <>
          <span className="chat-card__head">📏 Замеры · {ddmm(card.day)}</span>
          <span className="chat-card__grid">
            {Object.entries(card.values || {}).map(([k, v]) => (
              <span key={k}>
                {MEASURE_LABELS[k] || k} <b>{String(v).replace('.', ',')}</b>
                {card.change && card.change[k] ? <i className={card.change[k] < 0 ? 'down' : 'up'}> {signed(card.change[k])}</i> : null}
              </span>
            ))}
          </span>
          {card.since && <span className="chat-card__note">Изменение с {ddmm(card.since)}</span>}
        </>
      );
    case 'food':
      return (
        <>
          <span className="chat-card__head">🥗 Питание · {ddmm(card.day)}</span>
          <span className="chat-card__line">{fmt(card.kcal)} ккал · Б {card.protein} · Ж {card.fat} · У {card.carbs}</span>
          <span className="chat-card__note">{card.items} записей в дневнике</span>
        </>
      );
    default:
      return <span className="chat-card__head">Карточка Fit Track</span>;
  }
}

/** Карточка в пузыре сообщения. Касание — открыть */
export function ChatCard({ card, onOpen }) {
  return (
    <button type="button" className={'chat-card-msg chat-card-msg--' + card.kind}
      onClick={(e) => { e.stopPropagation(); onOpen(card); }}>
      <CardBody card={card} />
      <span className="chat-card__open">Открыть</span>
    </button>
  );
}

/** Упражнение — лист с техникой прямо в чате */
export function ExerciseSheet({ card }) {
  return (
    <>
      <h2 className="chat-layer__title">🎯 {card.title}</h2>
      {(card.muscle || card.equipment) && <p className="chat-layer__text">{[card.muscle, card.equipment].filter(Boolean).join(' · ')}</p>}
      {card.notes ? <p className="chat-exercise__notes">{card.notes}</p> : <p className="chat-layer__text">Подсказок по технике тренер пока не добавил.</p>}
      {card.media && <p className="chat-layer__text">Видео техники — в карточке упражнения в программе.</p>}
    </>
  );
}

/**
 * Меню скрепки «Из Fit Track». Тренировку, упражнение и день питания —
 * выбрать из списка; программу и замеры — отправить сразу последние.
 */
export function AttachMenu({ base, role, onSend, onClose }) {
  const [step, setStep] = useState(null);
  const [options, setOptions] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!step) return undefined;
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiOnce('chat.cardOptions', { ...base, kind: step.kind, q });
        if (!stop) { setOptions(r.options || []); setError(''); }
      } catch (e) { if (!stop) setError(e.message || 'Не получилось загрузить.'); }
    }, step.search ? 250 : 0);
    return () => { stop = true; clearTimeout(t); };
  }, [step, q]); // eslint-disable-line react-hooks/exhaustive-deps

  if (step) {
    return (
      <>
        <h2 className="chat-layer__title">{step.icon} {step.label}</h2>
        {step.search && (
          <input className="chat__find chat__find--boxed" type="search" autoFocus value={q} placeholder="Найти упражнение"
            aria-label="Найти упражнение" onChange={(e) => setQ(e.target.value)} />
        )}
        {error && <p className="chat-layer__text">{error}</p>}
        {!options && !error && <p className="chat-layer__text">Загружаем…</p>}
        {options && !options.length && <p className="chat-layer__text">{step.kind === 'workout' ? 'Завершённых тренировок пока нет.' : step.kind === 'food' ? 'В дневнике питания пока пусто.' : 'Ничего не нашли.'}</p>}
        <div className="chat-menu__list chat-attach__options">
          {(options || []).map((o) => (
            <button key={o.ref} type="button" onClick={() => onSend(step.kind, o.ref)}>
              <span>{o.title}</span>
              {(o.day || o.note) && <small>{o.day ? ddmm(o.day) : o.note}</small>}
            </button>
          ))}
        </div>
        <div className="chat-layer__actions">
          <button type="button" className="button button--ghost" onClick={() => { setStep(null); setOptions(null); setQ(''); }}>Назад</button>
        </div>
      </>
    );
  }
  return (
    <>
      <h2 className="chat-layer__title">Из Fit Track</h2>
      <p className="chat-layer__text">{role === 'trainer' ? 'Отправьте клиенту сам предмет, а не пересказ.' : 'Отправьте тренеру тренировку, замеры или питание.'}</p>
      <div className="chat-attach">
        {CARD_MENU.map((item) => (
          <button key={item.kind} type="button" className="chat-attach__item"
            onClick={() => { haptic(); if (item.pick) { setOptions(null); setStep(item); } else onSend(item.kind, null); }}>
            <span className="chat-attach__icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="chat-layer__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>Отмена</button>
      </div>
    </>
  );
}
