import React, { useState, useEffect, useRef } from 'react';
import { Note, formatNumber } from '../ui.jsx';
import { haptic } from '../telegram.js';
import { Ring, CountUp } from './TodayParts.jsx';
import './survey.css';

/*
 * «Норма и анкета» — этап 5 макета nutrition-redesign-2026-11-20 (владелец
 * 20.11.2026: «делай всё как в макете»). Анкета — по одному вопросу на экран,
 * норма — тарелкой из трёх цветов БЖУ, темп — карточками с наклоном графика.
 * Вопросы, ответы и расчёт прежние: сервер не меняется, новых данных нет.
 */

export const SURVEY_STEPS = ['age', 'weight', 'height', 'sex', 'lifestyle', 'trainings', 'goal'];

// Ползунок уже, чем допустимый ввод: вес 30–250 на ползунке не попасть
// пальцем в нужный килограмм. Крайние значения вписываются в поле числом.
const NUMBERS = {
  age: { q: 'Сколько вам лет?', label: 'Возраст, лет', unit: 'лет', mode: 'numeric', range: [14, 90], step: 1, mid: 30 },
  weight: { q: 'Ваш вес', label: 'Вес, кг', unit: 'кг', mode: 'decimal', range: [40, 160], step: 0.5, mid: 70 },
  height: { q: 'Ваш рост', label: 'Рост, см', unit: 'см', mode: 'decimal', range: [140, 210], step: 1, mid: 170 },
};

const SEX_EMOJI = { m: '👨', f: '👩' };
const LIFE_EMOJI = { desk: '🪑', feet: '🚶', labor: '🏗️' };
const GOAL_EMOJI = { lose: '⬇️', keep: '⚖️', gain: '💪' };
const TRAININGS = ['0', '1', '2', '3', '4', '5', '6', '7'];

const QUESTIONS = { sex: 'Ваш пол', lifestyle: 'Чем занят ваш день?', trainings: 'Тренировок в неделю', goal: 'Чего хотите?' };
const NOTES = {
  sex: 'без него основной обмен не считается',
  lifestyle: 'без тренировок: работа, дорога, быт',
  trainings: 'все: с тренером, сами, бассейн, бег',
};

const num = (v) => {
  const x = Number(String(v ?? '').replace(',', '.'));
  return String(v ?? '').trim() && Number.isFinite(x) ? x : null;
};

/** Первый вопрос без ответа — с него и начинаем; всё заполнено — с первого */
export function firstOpen(form, check) {
  const i = SURVEY_STEPS.findIndex((f) => check(f, form));
  return i < 0 ? 0 : i;
}

/**
 * Анкета по одному вопросу. Состояние и отправка — у формы (screens.jsx),
 * здесь только шаги: «Дальше» проверяет текущий ответ, выбор картинкой сам
 * переходит к следующему вопросу.
 */
export function SurveyWizard({ options, lifestyles, form, onSet, check, busy, failure, note, onSubmit, onCancel }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const field = SURVEY_STEPS[step], last = step === SURVEY_STEPS.length - 1;
  const go = (i) => { clearTimeout(timer.current); setError(null); setStep(i); };
  const next = () => {
    const found = check(field, form);
    if (found) { setError(found); return; }
    if (last) onSubmit(); else go(step + 1);
  };
  const back = () => (step === 0 ? onCancel && onCancel() : go(step - 1));
  const choose = (value) => {
    onSet(field, value);
    setError(null);
    haptic();
    if (last) return;
    clearTimeout(timer.current);
    const from = step;
    timer.current = setTimeout(() => setStep((s) => (s === from ? s + 1 : s)), 260);
  };

  const cfg = NUMBERS[field];
  const choice = (value, emoji, title, sub) => (
    <button key={value} type="button" role="radio" aria-checked={form[field] === value}
      className={'nt-qz__pick' + (form[field] === value ? ' is-on' : '')} disabled={busy} onClick={() => choose(value)}>
      {emoji && <span className="nt-qz__em" aria-hidden="true">{emoji}</span>}
      <span className="nt-qz__pt">{title}</span>
      {sub && <small>{sub}</small>}
    </button>
  );

  let body;
  if (cfg) {
    const v = num(form[field]);
    const [lo, hi] = cfg.range;
    const slider = v === null ? cfg.mid : Math.max(lo, Math.min(hi, v));
    body = (
      <div className="nt-qz__slider">
        <label className="nt-qz__num">
          <input className="nt-qz__value" aria-label={cfg.label} placeholder={cfg.unit} inputMode={cfg.mode} value={form[field]}
            disabled={busy} onChange={(e) => { onSet(field, e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') next(); }} size={4} />
          <span className="nt-qz__unit" aria-hidden="true">{cfg.unit}</span>
        </label>
        <input type="range" aria-label={cfg.label + ' — ползунок'} min={lo} max={hi} step={cfg.step} value={slider} disabled={busy}
          style={{ '--p': ((slider - lo) / (hi - lo)) * 100 + '%' }}
          onChange={(e) => { onSet(field, String(e.target.value).replace('.', ',')); setError(null); }} />
        <div className="nt-qz__ends" aria-hidden="true"><span>{lo}</span><span>{hi}</span></div>
      </div>
    );
  } else if (field === 'sex') {
    body = <div className="nt-qz__grid nt-qz__grid--2" role="radiogroup" aria-label="Пол">{(options.sexes || []).map((s) => choice(s.value, SEX_EMOJI[s.value], s.label))}</div>;
  } else if (field === 'lifestyle') {
    body = (
      <div className="nt-qz__list" role="radiogroup" aria-label="Образ жизни">
        {lifestyles.map((l) => { const [t, ...rest] = String(l.label).split(':'); return choice(l.value, LIFE_EMOJI[l.value] || '🙂', t.trim(), rest.join(':').trim()); })}
      </div>
    );
  } else if (field === 'trainings') {
    body = <div className="nt-qz__grid nt-qz__grid--n" role="radiogroup" aria-label="Тренировок в неделю">{TRAININGS.map((t) => choice(t, null, t))}</div>;
  } else {
    body = <div className="nt-qz__grid nt-qz__grid--3" role="radiogroup" aria-label="Цель">{(options.goal || []).map((g) => choice(g.value, GOAL_EMOJI[g.value] || '🎯', g.label))}</div>;
  }

  return (
    <div className="nt-qz" data-step={field}>
      <div className="nt-qz__dots">
        {SURVEY_STEPS.map((f, i) => (
          <button key={f} type="button" className={i <= step ? 'is-on' : ''} aria-label={'Вопрос ' + (i + 1)} aria-current={i === step ? 'step' : undefined}
            disabled={busy || i >= step} onClick={() => go(i)} />
        ))}
      </div>
      <div className="nt-qz__n">вопрос {step + 1} из {SURVEY_STEPS.length}</div>
      <h4 className="nt-qz__q" key={field}>{cfg ? cfg.q : QUESTIONS[field]}</h4>
      {NOTES[field] && <p className="nt-qz__note">{NOTES[field]}</p>}
      {step === 0 && note && <p className="small muted nt-qz__prefill">{note}</p>}
      <div className="nt-qz__body" key={'b' + field}>{body}</div>
      {error && <span className="field__error nt-qz__err" role="alert">{error}</span>}
      {failure && <Note tone="critical">{failure.message}</Note>}
      <div className="nt-qz__nav">
        {(step > 0 || onCancel) && <button type="button" className="button" disabled={busy} onClick={back}>{step > 0 ? '← Назад' : 'Отмена'}</button>}
        <span className="nt-sp" />
        <button type="button" className="button button--primary" disabled={busy} onClick={next}>
          {last ? (busy ? 'Считаем…' : 'Посчитать норму') : 'Дальше →'}
        </button>
      </div>
    </div>
  );
}

/** Доли калорий от белков, жиров и углеводов — для тарелки нормы */
export function plateShares(t) {
  const p = Number(t.protein) * 4 || 0, f = Number(t.fat) * 9 || 0, c = Number(t.carbs) * 4 || 0, sum = p + f + c;
  if (!sum) return [];
  return [['var(--nt-p)', p / sum], ['var(--nt-f)', f / sum], ['var(--nt-c)', c / sum]];
}

const GAP = 0.06;
const grams = (v) => (v === null || v === undefined ? '—' : formatNumber(v) + ' г');

/** Норма — тарелкой: колечко БЖУ, число калорий набегает от нуля */
export function NormPlate({ targets, goalLabel }) {
  const shares = plateShares(targets);
  const parts = [];
  shares.forEach(([color, share]) => {
    parts.push({ color, share: Math.max(0, share - GAP) });
    parts.push({ color: 'transparent', share: Math.min(share, GAP) });
  });
  return (
    <div className="nt-norm">
      <b className="nt-norm__title">Ваша норма</b>
      <span className="nt-norm__src">Расчёт по анкете{goalLabel ? ' · ' + goalLabel.toLowerCase() : ''}</span>
      <Ring size={156} stroke={18} parts={parts} track="var(--text-muted)" className="nt-norm__ring">
        <span><b className="nt-norm__kcal"><CountUp value={targets.kcal} /></b><span className="nt-norm__unit">ккал в день</span></span>
      </Ring>
      <div className="nt-norm__leg">
        <span><i style={{ background: 'var(--nt-p)' }} />белки {grams(targets.protein)}</span>
        <span><i style={{ background: 'var(--nt-f)' }} />жиры {grams(targets.fat)}</span>
        <span><i style={{ background: 'var(--nt-c)' }} />углеводы {grams(targets.carbs)}</span>
      </div>
    </div>
  );
}

/** Наклон графика темпа: вниз — похудение, вверх — набор, круче — быстрее */
export function paceSlope(goal, index, count) {
  const k = count > 1 ? index / (count - 1) : 0.5;
  const drop = Math.round(8 + 20 * k);
  if (goal === 'gain') return `M2 ${4 + drop * 0.9} L42 4`;
  if (goal === 'lose') return `M2 4 L42 ${4 + drop * 0.9}`;
  return 'M2 15 L42 15';
}

/** Карточка темпа: наклон, название, подсказка, калории и БЖУ */
export function PaceCard({ plan, active, busy, goal, index, count, onChoose, disabled }) {
  return (
    <button type="button" role="radio" aria-checked={active} className={'nt-pace' + (active ? ' is-on' : '')} onClick={onChoose} disabled={disabled}>
      <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden="true"><path d={paceSlope(goal, index, count)} stroke="var(--nt-good)" strokeWidth="3" strokeLinecap="round" fill="none" /></svg>
      <span className="nt-pace__body">
        <b>{plan.label}{plan.note ? <span className="nt-pace__note"> · {plan.note}</span> : null}</b>
        {plan.hint && <small>{plan.hint}</small>}
        <small className="nt-pace__macros">Б {plan.protein} · Ж {plan.fat} · У {plan.carbs} г</small>
      </span>
      <b className="nt-pace__kcal">{busy ? '…' : formatNumber(plan.kcal) + ' ккал'}</b>
    </button>
  );
}
