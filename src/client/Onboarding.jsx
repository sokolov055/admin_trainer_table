import React, { useEffect, useRef, useState } from 'react';
import { apiPublic, apiMutate } from '../api.js';
import { IconBack, IconCheck, IconPlan, IconUsers, IconHome, IconCalendar, IconUserPlus, IconKey } from '../icons.jsx';
import { QUESTIONS, canAdvance } from './onboarding-model.js';
import HealthAsk, { useHealthAsk } from './HealthAsk.jsx';
import './onboarding.css';
import '../brand-type.css';

const ICONS = [IconPlan, IconUsers, IconHome, IconCalendar];
// Регистрация (LoginScreen.jsx) — первые шаги той же анкеты: имя, согласия
const LEAD_ICONS = [IconUserPlus, IconKey];

/**
 * Вся анкета хранится на сервере, а не в общем кеше устройства.
 * lead — сколько шагов уже пройдено при регистрации (FT-574): счёт
 * продолжается, а не начинается заново с «Шаг 1».
 */
export default function Onboarding({ initial, onClose, onDone, onDisabled, lead = 0 }) {
  const [saved, setSaved] = useState(initial);
  const [answers, setAnswers] = useState(initial.answers || {});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const heading = useRef(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const step = saved.step || 0;
  const question = QUESTIONS[step];
  const [agreed, setAgreed] = useState(false);
  // Шаги и тренировки с часов — последним шагом анкеты, после выбора
  // программы (FT-510): только в приложении, где они есть и ещё не подключены
  const healthNeeded = useHealthAsk();
  const [askHealth, setAskHealth] = useState(false);
  const finish = () => (healthNeeded ? setAskHealth(true) : onDone());
  useEffect(() => () => { mounted.current = false; }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step, result]);

  const run = async (fn) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setFailure('');
    try {
      const r = await fn();
      if (!mounted.current) return;
      if (r.eligible === false && !r.completed) { onDisabled(); return; }
      return r;
    } catch (err) {
      if (mounted.current) setFailure((err.message || 'Не удалось сохранить ответы.') + ' Попробуйте ещё раз.');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const change = async (value) => {
    if (locked.current) return;
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    const r = await run(() => apiMutate('client.onboarding.save', { answers: next, step, revision: saved.revision }));
    if (r) setSaved(r);
  };
  const move = async (nextStep, close = false) => {
    if (locked.current) return;
    if (saved.consentNeeded && close) { onClose(saved); return; }
    const r = await run(() => apiMutate('client.onboarding.save', { answers, step: nextStep, revision: saved.revision }));
    if (r) { setSaved(r); setSelected(null); if (close) onClose(r); }
  };
  const reopen = async () => {
    const r = await run(() => apiPublic('client.onboarding.get'));
    if (r) { setSaved(r); setAnswers(r.answers || {}); setSelected(null); }
  };
  const choose = async () => {
    const r = await run(() => apiMutate('client.onboarding.choose', { templateId: selected, revision: saved.revision }));
    if (r) setResult(r);
  };
  const consent = async () => {
    const r = await run(() => apiMutate('client.onboarding.consent', { accept: true }));
    if (r) setSaved(r);
  };

  if (askHealth) return <HealthAsk onDone={onDone} />;

  return <main className="onboarding" aria-busy={busy}>
    <div className="onboarding__top">
      <button type="button" className="button button--ghost" disabled={busy}
        onClick={() => result ? finish() : step ? move(step - 1) : move(step, true)}>
        <IconBack size={18} />{result ? 'К тренировкам' : 'Назад'}
      </button>
      {!result && <button type="button" className="button button--ghost" disabled={busy} onClick={() => move(step, true)}>Продолжить позже</button>}
    </div>
    {!result && <>
      <p className="onboarding__progress-text">{step < 4 ? `Шаг ${step + 1 + lead} из ${5 + lead} · ${QUESTIONS[step].label}` : `Шаг ${5 + lead} из ${5 + lead} · Выбор программы`}</p>
      <div className="onboarding__progress" role="progressbar" aria-label="Подбор программы" aria-valuemin={0} aria-valuemax={5 + lead} aria-valuenow={step + 1 + lead}>
        {[...LEAD_ICONS.slice(0, lead), ...ICONS, IconCheck].map((Icon, i) => <span key={i} className={i <= step + lead ? 'onboarding__step onboarding__step--active' : 'onboarding__step'} aria-hidden="true"><Icon size={18} /></span>)}
      </div>
    </>}
    <div className="onboarding__content" key={result ? 'result' : step}>
      <h1 ref={heading} tabIndex={-1}>{result ? 'Программа готова' : question ? question.title : 'Выберите программу'}</h1>
      <p className="onboarding__intro">{result ? `${result.selectedTitle} · ${result.days || answers.days} раза в неделю.`
        : question ? (step === 0 ? 'Подберём программу под вашу цель и график.' : question.hint)
          : 'Эти программы подходят под ваши ответы. Посмотрите упражнения и выберите одну.'}</p>
      {saved.consentNeeded && <label className="onboarding__consent"><input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.target.checked)} />
        <span>Даю <a href="https://app.fitness100.ru/onboarding-consent.html" target="_blank" rel="noopener noreferrer">отдельное согласие</a> на сохранение цели, опыта, места занятий и графика для подбора программы. Можно продолжить пользоваться приложением без анкеты.</span></label>}
      {question && !saved.consentNeeded && <div className="options" role="group" aria-label={question.title}>
        {question.options.map(([id, title, hint]) => <button type="button" key={id} disabled={busy}
          aria-pressed={answers[question.key] === id}
          className={'option' + (answers[question.key] === id ? ' option--active' : '')} onClick={() => change(id)}>
          <span className="option__mark">{answers[question.key] === id && <IconCheck size={12} />}</span>
          <span className="option__body"><strong>{title}</strong><span className="option__hint">{hint}</span></span>
        </button>)}
      </div>}
      {!question && !result && <div className="onboarding__programs">
        {(saved.programs || []).map((p) => <article className="onboarding__program" key={p.id}>
          <h2>{p.title}</h2><p className="small muted">{p.days} раза в неделю{p.description ? ' · ' + p.description : ''}</p>
          <details><summary>Упражнения и инвентарь</summary>{p.blocks.map((b, i) => <div key={i}><h3>{b.title}</h3>
            <ul>{b.exercises.map((e, j) => <li key={j}>{e.name}{e.sets ? ` · ${e.sets} подхода` : ''}{e.reps ? ` · ${e.reps} повторений` : ''}</li>)}</ul></div>)}</details>
          <button className={'button button--block' + (selected === p.id ? '' : ' button--ghost')} type="button" disabled={busy} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
            {selected === p.id ? <><IconCheck size={16} />Выбрана</> : 'Выбрать эту программу'}
          </button>
        </article>)}
        {!saved.programs?.length && <p role="status">Пока нет программы для этого сочетания ответов. Можно изменить график или вернуться в приложение и обратиться к тренеру.</p>}
      </div>}
      <p className="small muted">{result ? 'Питание можно настроить отдельно в разделе «Питание».' : 'При боли или ограничениях обсудите занятия со специалистом. Анкета не оценивает состояние здоровья.'}</p>
      {failure && <div className="onboarding__error" role="alert"><p>{failure}</p><button className="button button--ghost" disabled={busy} onClick={reopen}>Открыть сохранённую анкету</button></div>}
    </div>
    <footer className="onboarding__footer">
      {question && !saved.consentNeeded && !canAdvance(answers, step) && <p className="small muted" id="onboarding-required">Выберите один вариант, чтобы продолжить.</p>}
      <button type="button" className="button button--primary button--block" disabled={busy || (saved.consentNeeded ? !agreed : !result && (question ? !canAdvance(answers, step) : !selected))}
        aria-describedby={question && !saved.consentNeeded && !canAdvance(answers, step) ? 'onboarding-required' : undefined}
        onClick={() => saved.consentNeeded ? consent() : result ? finish() : question ? move(step + 1) : choose()}>
        {busy ? 'Сохраняем…' : saved.consentNeeded ? 'Подтвердить и продолжить' : result ? 'Перейти к занятиям' : question ? 'Далее' : 'Начать по этой программе'}
      </button>
    </footer>
  </main>;
}
