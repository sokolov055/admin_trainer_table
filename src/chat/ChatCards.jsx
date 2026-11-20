import React, { useEffect, useState } from 'react';
import { apiOnce } from '../api.js';
import { haptic } from '../telegram.js';
import { reasonOf } from '../pause/pause-model.js';

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
  { kind: 'move', icon: '📅', label: 'Перенести занятие', pick: true },
  { kind: 'measures', icon: '📏', label: 'Замеры' },
  { kind: 'exercise', icon: '🎯', label: 'Упражнение', pick: true, search: true },
  { kind: 'food', icon: '🥗', label: 'Питание за день', pick: true },
  // Карточки с решением (этап 2): пауза — лист паузы, пожелание пишет клиент
  { kind: 'pause', icon: '⏸', label: 'Пауза', sheet: true },
  { kind: 'wish', icon: '💬', label: 'Пожелание', text: true, client: true },
];

/** Пункты скрепки для роли */
export const menuFor = (role) => CARD_MENU.filter((i) => !i.client || role === 'client');

/** Куда ведёт карточка: раздел приложения (у тренера — раздел карточки клиента) */
export const CARD_SECTION = { workout: 'plan', program: 'plan', measures: 'progress', food: 'nutrition' };

const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const ddmm = (day) => (day ? `${day.slice(8, 10)}.${day.slice(5, 7)}` : '');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + String(Math.abs(n)).replace('.', ',');
const pad = (n) => String(n).padStart(2, '0');
const WEEK = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/** «пт 22.11, 19:00» — время телефона */
export function whenText(iso) {
  const d = new Date(iso);
  return `${WEEK[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Для поля «дата и время»: ГГГГ-ММ-ДДTЧЧ:ММ по часам телефона */
export function localInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const APPROX_TEXT = { '2m': 'около 2 месяцев', '3m': 'около 3 месяцев', unknown: 'срок обсудить' };
const PAUSE_STATUS = {
  requested: 'Ждёт решения тренера', active: '✓ Пауза подтверждена', declined: 'Не подтверждена',
  cancelled: 'Отозвана', ended: 'Пауза закончилась', gone: 'Просьба удалена',
};
const MOVE_STATUS = { accepted: '✓ Перенесено', declined: 'Отклонено', withdrawn: 'Отозвано', stale: 'Уже неактуально' };
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
    case 'move':
      return (
        <>
          <span className="chat-card__head">📅 {card.status === 'accepted' ? 'Занятие перенесено' : 'Перенести занятие?'}</span>
          <span className="chat-card__line"><s>{whenText(card.from)}</s> → <b>{whenText(card.to)}</b></span>
          {card.status !== 'open' && card.status !== 'accepted' && <span className={'chat-card__state chat-card__state--' + card.status}>{MOVE_STATUS[card.status] || ''}</span>}
        </>
      );
    case 'pause': {
      const r = reasonOf(card.reason);
      const span = card.pauseKind === 'long' && !card.to
        ? `с ${ddmm(card.from)}, ${APPROX_TEXT[card.approx] || 'дольше месяца'}`
        : card.to ? `${ddmm(card.from)} — ${ddmm(card.to)}` : `с ${ddmm(card.from)}, до разморозки`;
      return (
        <>
          <span className="chat-card__head">⏸ Пауза в тренировках</span>
          {card.status !== 'gone' && <span className="chat-card__line">{span}{r ? ` · ${r.emoji} ${r.client}` : ''}</span>}
          <span className={'chat-card__state chat-card__state--' + card.status}>{PAUSE_STATUS[card.status] || ''}</span>
        </>
      );
    }
    case 'wish':
      return (
        <>
          <span className="chat-card__head">💬 Пожелание к программе</span>
          {card.status === 'gone'
            ? <span className="chat-card__note">Пожелание удалено</span>
            : <span className="chat-card__quote">«{card.text}»</span>}
          {card.reply && <span className="chat-card__note">Ответ тренера: {card.reply}</span>}
          {card.status === 'done' && <span className="chat-card__state chat-card__state--accepted">✓ Учтено</span>}
        </>
      );
    default:
      return <span className="chat-card__head">Карточка Fit Track</span>;
  }
}

/** Кнопки решения по карточке: кто и что может сейчас */
export function cardActions(card, { mine, role }) {
  if (card.kind === 'move' && card.status === 'open') {
    return mine
      ? [{ action: 'withdraw', label: 'Отозвать' }]
      : [{ action: 'accept', label: '✓ Согласен', primary: true }, { action: 'counter', label: 'Другое время' }, { action: 'decline', label: 'Отклонить' }];
  }
  if (card.kind === 'pause' && card.status === 'requested') {
    return role === 'trainer'
      ? [{ action: 'decide', label: 'Решить', primary: true }, { action: 'decline', label: 'Отклонить' }]
      : [{ action: 'withdraw', label: 'Отозвать' }];
  }
  if (card.kind === 'wish' && card.status !== 'gone') {
    if (role === 'trainer') {
      return card.status === 'done'
        ? [{ action: 'reply', label: 'Ответить' }]
        : [{ action: 'done', label: '✓ Учтено', primary: true }, { action: 'reply', label: 'Ответить' }];
    }
    return [{ action: 'delete', label: 'Удалить' }];
  }
  return [];
}

const DECISION = new Set(['move', 'pause', 'wish']);

/** Карточка в пузыре сообщения. Касание — открыть; у карточек с решением — кнопки */
export function ChatCard({ card, mine = false, role = 'client', busy = false, onOpen, onAction }) {
  if (DECISION.has(card.kind)) {
    const actions = cardActions(card, { mine, role });
    return (
      <div className={'chat-card-msg chat-card-msg--' + card.kind + (card.status && !['open', 'requested', 'new', 'read'].includes(card.status) ? ' chat-card-msg--settled' : '')}>
        <CardBody card={card} />
        {actions.length > 0 && (
          <span className="chat-card__actions">
            {actions.map((a) => (
              <button key={a.action} type="button" disabled={busy}
                className={'chat-card__btn' + (a.primary ? ' chat-card__btn--primary' : '')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); haptic(); onAction(card, a.action); }}>
                {a.label}
              </button>
            ))}
          </span>
        )}
      </div>
    );
  }
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
 * Меню скрепки «Из Fit Track». Тренировку, упражнение, день питания и
 * занятие для переноса — выбрать из списка; программу и замеры — отправить
 * сразу последние. Перенос — второй шаг: новое время. Пожелание — текст.
 * Пауза — лист паузы (onPause), как на «Обзоре».
 * initial — сразу открыть шаг (кнопка «Другое время» у переноса).
 */
export function AttachMenu({ base, role, onSend, onClose, onPause, initial = null }) {
  const [step, setStep] = useState(() => (initial ? CARD_MENU.find((i) => i.kind === initial.kind) : null));
  const [picked, setPicked] = useState(initial && initial.ref ? { ref: initial.ref, at: initial.at } : null);
  const [when, setWhen] = useState(() => (initial && initial.at ? localInput(new Date(Date.parse(initial.at) + 86400000).toISOString()) : ''));
  const [text, setText] = useState('');
  const [options, setOptions] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!step || !step.pick || picked) return undefined;
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const r = await apiOnce('chat.cardOptions', { ...base, kind: step.kind, q });
        if (!stop) { setOptions(r.options || []); setError(''); }
      } catch (e) { if (!stop) setError(e.message || 'Не получилось загрузить.'); }
    }, step.search ? 250 : 0);
    return () => { stop = true; clearTimeout(t); };
  }, [step, q, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => {
    if (picked && !initial) { setPicked(null); return; }
    setStep(null); setOptions(null); setQ(''); setPicked(null); setText('');
    if (initial) onClose();
  };
  const backRow = (
    <div className="chat-layer__actions">
      <button type="button" className="button button--ghost" onClick={back}>Назад</button>
    </div>
  );

  if (step && step.kind === 'move' && picked) {
    const at = when ? new Date(when) : null;
    const ok = at && !Number.isNaN(at.getTime()) && at.getTime() > Date.now();
    return (
      <>
        <h2 className="chat-layer__title">📅 Перенести занятие</h2>
        <p className="chat-layer__text">Сейчас: <b>{whenText(picked.at)}</b>. {role === 'trainer' ? 'Клиент' : 'Тренер'} согласится в чате — и занятие перенесётся само.</p>
        <label className="chat-move__field">Новое время
          <input type="datetime-local" value={when} min={localInput(new Date().toISOString())} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <div className="chat-layer__actions">
          <button type="button" className="button button--primary" disabled={!ok} onClick={() => onSend('move', picked.ref, { to: at.toISOString() })}>Предложить</button>
          <button type="button" className="button button--ghost" onClick={back}>Назад</button>
        </div>
      </>
    );
  }

  if (step && step.text) {
    const body = text.trim();
    return (
      <>
        <h2 className="chat-layer__title">💬 Пожелание к программе</h2>
        <p className="chat-layer__text">Своими словами: что добавить, убрать или заменить. Тренер отметит «Учтено» или ответит.</p>
        <textarea className="chat-wish__field" rows={4} autoFocus maxLength={600} value={text}
          placeholder="Например: больше упражнений на спину" aria-label="Пожелание" onChange={(e) => setText(e.target.value)} />
        <div className="chat-layer__actions">
          <button type="button" className="button button--primary" disabled={body.length < 3} onClick={() => onSend('wish', null, { text: body })}>Отправить</button>
          <button type="button" className="button button--ghost" onClick={back}>Назад</button>
        </div>
      </>
    );
  }

  if (step) {
    const empty = { workout: 'Завершённых тренировок пока нет.', food: 'В дневнике питания пока пусто.', move: 'Ближайших занятий нет.' }[step.kind] || 'Ничего не нашли.';
    return (
      <>
        <h2 className="chat-layer__title">{step.icon} {step.label}</h2>
        {step.kind === 'move' && <p className="chat-layer__text">Какое занятие перенести?</p>}
        {step.search && (
          <input className="chat__find chat__find--boxed" type="search" autoFocus value={q} placeholder="Найти упражнение"
            aria-label="Найти упражнение" onChange={(e) => setQ(e.target.value)} />
        )}
        {error && <p className="chat-layer__text">{error}</p>}
        {!options && !error && <p className="chat-layer__text">Загружаем…</p>}
        {options && !options.length && <p className="chat-layer__text">{empty}</p>}
        <div className="chat-menu__list chat-attach__options">
          {(options || []).map((o) => (
            <button key={o.ref} type="button" onClick={() => {
              if (step.kind === 'move') {
                setPicked({ ref: o.ref, at: o.at });
                setWhen(localInput(new Date(Date.parse(o.at) + 86400000).toISOString()));
              } else onSend(step.kind, o.ref);
            }}>
              <span>{o.title}</span>
              {(o.day || o.note) && <small>{o.day ? ddmm(o.day) : o.note}</small>}
            </button>
          ))}
        </div>
        {backRow}
      </>
    );
  }
  return (
    <>
      <h2 className="chat-layer__title">Из Fit Track</h2>
      <p className="chat-layer__text">{role === 'trainer' ? 'Отправьте клиенту сам предмет, а не пересказ.' : 'Отправьте тренеру тренировку, замеры, питание или попросите о переносе.'}</p>
      <div className="chat-attach">
        {menuFor(role).map((item) => (
          <button key={item.kind} type="button" className="chat-attach__item"
            onClick={() => {
              haptic();
              if (item.sheet) onPause();
              else if (item.pick || item.text) { setOptions(null); setStep(item); }
              else onSend(item.kind, null);
            }}>
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
