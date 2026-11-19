import React from 'react';
import { useData } from '../useData.js';
import { formatMoney, formatWhen } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { dayLine, dayHint, timeOf, initials, avatarTone, paceLine } from './trainer-home-model.js';
import './trainer-home.css';

/*
 * Первая страница тренера, этап 3 (макет home-redesign-2026-11-19, согласован
 * владельцем 19.11.2026): цветная шапка дня с лентой сегодняшних клиентов,
 * плитки «Сделать» вместо строки фактов и фильтров «Требуют внимания / Долг /
 * Без замера», строка темпа месяца из «Сводки».
 */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Кружок с инициалами — цвет по имени, как в «Библиотеке → Программы» */
export function Avatar({ name, ring = '', size = '' }) {
  return (
    <span className={'th-ava th-ava--' + avatarTone(name) + (size ? ' th-ava--' + size : '') + (ring ? ' th-ava--ring th-ring--' + ring : '')} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* ==================================================================
 * Шапка дня
 * ================================================================== */

export function DayHead({ today, onOpen, now = new Date() }) {
  const day = today || { total: 0, done: 0, next: null };
  const line = dayLine(day.items, now);
  // Старый сервер ленты не отдаёт — числа из total/done, без кружков
  const total = Array.isArray(day.items) ? line.total : day.total || 0;
  const done = Array.isArray(day.items) ? line.done : day.done || 0;
  const hint = Array.isArray(day.items)
    ? dayHint(line, day.next, now, formatWhen)
    : (total ? 'занятий проведено' : 'сегодня занятий нет') + (day.next ? ' · следующее — ' + formatWhen(day.next.at) : '');
  const date = cap(now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
  const progress = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className="th-day enter" aria-label="Сегодня">
      <span className="th-day__deco" aria-hidden="true" />
      <div className="th-day__date">{date}</div>
      <div className="th-day__value">{total ? done + ' из ' + total : 'Занятий нет'}</div>
      <div className="th-day__hint">{hint}</div>
      {total > 0 && (
        <div className="th-day__bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Проведено занятий">
          <span style={{ '--p': progress + '%' }} />
        </div>
      )}
      {line.slots.length > 0 && (
        <div className="th-day__line">
          {line.slots.map((s, i) => (
            <button
              type="button"
              key={s.row + '-' + s.at}
              className={'th-slot' + (s.done ? ' is-done' : '') + (s.now ? ' is-now' : '')}
              style={{ '--i': i }}
              onClick={() => { haptic(); onOpen(s.row); }}
              aria-label={s.name + ', ' + timeOf(s.at) + (s.done ? ', проведено' : s.now ? ', следующее' : '')}
            >
              <Avatar name={s.name} size="day" />
              <b>{timeOf(s.at)}</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ==================================================================
 * Сделать
 * ================================================================== */

export function TodoTiles({ tiles, value, onPick }) {
  return (
    <section className="section enter">
      <div className="section__head"><h2 className="section__title">Сделать</h2></div>
      <div className="th-todo">
        {tiles.map((t) => (
          <button
            type="button"
            key={t.id}
            className={'th-td th-td--' + t.tone + (t.count ? '' : ' is-zero') + (value === t.id ? ' is-on' : '')}
            disabled={!t.count}
            aria-pressed={value === t.id}
            onClick={() => { haptic(); onPick(value === t.id ? null : t.id); }}
          >
            <b>{t.count}</b>
            <span>{t.icon} {t.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ==================================================================
 * Темп месяца
 * ================================================================== */

/** Строка темпа: «216 850 ₽ · ▲ 8% к 19 окт», полоска к цели, черта прошлого месяца */
export function PaceCard({ onGo }) {
  const { data } = useData('trainer.metrics.overview', {}, []);
  const p = paceLine(data);
  if (!p) return null;
  const up = p.diff !== null && p.diff > 0;
  const down = p.diff !== null && p.diff < 0;
  return (
    <button type="button" className="th-pace enter" onClick={() => { haptic(); onGo('dashboard'); }} aria-label="Темп месяца — открыть «Сводку»">
      <div className="th-pace__head">
        <span className="th-pace__label">{p.month ? p.month + ' · выручка' : 'Выручка месяца'}</span>
        {p.diff !== null && p.against && (
          <span className={'th-pace__diff' + (up ? ' is-up' : down ? ' is-down' : '')}>
            {up ? '▲ ' : down ? '▼ ' : ''}{Math.abs(p.diff)}% {p.against}
          </span>
        )}
      </div>
      <div className="th-pace__value">{formatMoney(p.revenue)}</div>
      <div className="th-pace__row">
        <span className="th-pace__bar">
          <span style={{ '--p': p.bar + '%' }} />
          {p.was !== null && <em style={{ left: p.was + '%' }} />}
        </span>
        {p.goal && <span className="th-pace__goal">{p.goal}</span>}
      </div>
      <div className="th-pace__note">
        {p.was !== null ? 'черта — прошлый месяц к этому дню · ' : ''}вся сводка →
      </div>
    </button>
  );
}
