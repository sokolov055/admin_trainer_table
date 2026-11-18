/**
 * Упражнение в идущем занятии (FT-802, этап 2, макет 18.11.2026): подходы —
 * полосой столбиков, крупно — только один подход с «− / +». Здесь — без
 * React: какой подход на виду, из чего полоса и шаг «− / +».
 *
 * На виду — ближайший неотмеченный подход; нажали столбик — этот, пока не
 * отметили следующий (view.done — сколько было сделано в момент нажатия:
 * отметка подхода возвращает экран к ближайшему, без лишнего состояния).
 */
import { unitOf, assistStep } from './effort.js';

const isDone = (x) => x.state === 'done';

/** Какой подход показать крупно: выбранный столбиком или ближайший */
export function shownSetOf(ex, view = null) {
  const sets = (ex && ex.sets) || [];
  if (!sets.length) return -1;
  const done = sets.filter(isDone).length;
  if (view && view.done === done && view.si >= 0 && view.si < sets.length) return view.si;
  const next = sets.findIndex((x) => x.state === 'pending');
  return next === -1 ? sets.length - 1 : next;
}

/** Выбор столбиком: запомнить и сколько сделано — до следующей отметки */
export function viewSet(ex, si) {
  return { si, done: ((ex && ex.sets) || []).filter(isDone).length };
}

/**
 * Столбики полосы: номер рабочего подхода (разминка — «Р»), состояние,
 * оценка и какой сейчас ближайший (он «дышит») и какой на виду
 */
export function stripOf(ex, view = null) {
  const sets = (ex && ex.sets) || [];
  const shown = shownSetOf(ex, view);
  const next = sets.findIndex((x) => x.state === 'pending');
  let n = 0;
  return sets.map((x, si) => {
    const warmup = x.kind === 'warmup';
    if (!warmup) n += 1;
    return {
      si,
      label: warmup ? 'Р' : String(n),
      warmup,
      state: x.state || 'pending',
      effort: x.state === 'done' ? (x.effort || 'ok') : '',
      next: si === next,
      shown: si === shown,
    };
  });
}

const num = (v) => {
  const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};
const round = (v) => Math.round(v * 100) / 100;

/** Шаг «− / +» поля: вес — гантели 1, остальное 2,5 (свой у тренажёра), повторы 1, время 5 с */
export function stepOfField(ex, key) {
  if (key === 'weight') return unitOf(ex);
  if (key === 'assist') return assistStep(ex);
  if (key === 'time') return 5;
  return 1;
}

/**
 * Новое значение по «− / +». Пусто и «−» — остаётся пустым; ниже нуля не
 * уходит. Время «1:30» — минутами и секундами, «45» — секундами. Ответ —
 * строка, как хранится в подходе (вес — с точкой)
 */
export function stepValue(ex, key, value, dir) {
  const step = stepOfField(ex, key);
  const text = String(value ?? '').trim();
  if (key === 'time' && text.includes(':')) {
    const parts = text.split(':').map(Number);
    if (parts.some((p) => !Number.isFinite(p))) return text;
    const total = parts.reduce((a, p) => a * 60 + p, 0);
    const next = Math.max(0, total + dir * step);
    const s = next % 60;
    const m = Math.floor(next / 60);
    return parts.length === 3
      ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0')
      : m + ':' + String(s).padStart(2, '0');
  }
  const was = num(text);
  if (!Number.isFinite(was)) return dir > 0 ? String(step) : text;
  // С кратного шагу — на шаг; «72,3» с шагом 2,5 — к ближайшему кратному
  const q = was / step;
  const base = dir > 0 ? (Math.floor(q + 1e-9) + 1) * step : (Math.ceil(q - 1e-9) - 1) * step;
  const next = Math.max(0, round(base));
  return key === 'reps' ? String(Math.round(next)) : String(next);
}
