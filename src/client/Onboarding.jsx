import React, { useEffect, useRef, useState } from 'react';
import { apiPublic, apiMutate } from '../api.js';
import { IconBack, IconCheck, IconChevron } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { formatNumber, plural } from '../ui.jsx';
import {
  STEPS, STAGES, SIGNUP_STAGE, GOALS, LIFESTYLES, QUESTIONS, WHEELS, PACES,
  wheelStart, hasBody, canAdvance, nextStep, resumeStep, stageOf, timesWeek, bmrOf,
} from './onboarding-model.js';
import Art from './OnboardingArt.jsx';
import StageBar from './StageBar.jsx';
import { Wheel, Sheet, range } from './Wheel.jsx';
import Permissions, { usePermissions } from './Permissions.jsx';
import './onboarding.css';
import '../brand-type.css';

/**
 * Анкета подбора программы 2.0 (FT-577; образец — ONLYFITS, FT-560).
 *
 * Путь: приветствие с согласием → основные данные (барабаны в нижнем окне)
 * → базовый обмен крупным числом → активность → цель (и темп в нижнем
 * окне) → опыт → место → график → «Ваш план» (дуга калорий и БЖУ) →
 * выбор программы → «Всё готово» → разрешения на телефоне → кабинет с туром.
 *
 * Шаг меняется сразу по нажатию, а ответы уходят на сервер очередью за
 * спиной: ждать сети между вопросами — то, что делает анкету «тяжёлой».
 * Очередь идёт строго по одному запросу с актуальной ревизией, поэтому
 * запоздалый ответ не затрёт свежий. Не записалось — над кнопкой ошибка и
 * «Открыть сохранённую анкету»: продолжить можно с того, что дошло.
 *
 * Регистрация (LoginScreen.jsx) — первый раздел той же полосы: lead > 0 —
 * человек пришёл прямо из неё, и раздел «Регистрация» уже пройден.
 */

const BODY = ['sex', 'age', 'height', 'weight'];
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Ход от 0 до 1 за ms — общий для чисел и дуги; при уменьшении движения сразу 1 */
function useReveal(ms = 900, key = '') {
  const [k, setK] = useState(() => (reduced() ? 1 : 0));
  useEffect(() => {
    if (reduced()) { setK(1); return undefined; }
    setK(0);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setK(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return k;
}

/** Что о теле уже известно (анкета питания, профиль) — в пустые поля */
function withPrefill(saved) {
  const answers = { ...(saved.answers || {}) };
  const pre = saved.prefill || {};
  if (!hasBody(answers)) {
    [...BODY, 'lifestyle'].forEach((k) => { if (answers[k] == null && pre[k] != null && pre[k] !== '') answers[k] = pre[k]; });
  }
  return answers;
}

const clean = (a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const fmtBody = (k, v) => (k === 'age' ? v + ' ' + plural(v, 'год', 'года', 'лет') : formatNumber(v) + ' ' + WHEELS[k].unit);

export default function Onboarding({ initial, name = '', onClose, onDone, onDisabled, lead = 0 }) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const [saved, setSaved] = useState(initial);
  const [answers, setAnswers] = useState(() => withPrefill(initial));
  const [step, setStep] = useState(() => resumeStep(initial.answers || {}, initial.step));
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [agreed, setAgreed] = useState(false);
  // Сколько ответов ещё в пути: план и программы ждут последнего из них
  const [pending, setPending] = useState(0);
  const perms = usePermissions();
  const [askPerms, setAskPerms] = useState(false);
  const heading = useRef(null);
  const mounted = useRef(true);
  const rev = useRef(initial.revision || 0);
  const queue = useRef(Promise.resolve());
  const timer = useRef(null);
  useEffect(() => () => { mounted.current = false; clearTimeout(timer.current); }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step, !!result, !!saved.consentNeeded]);

  const fail = (err) => { if (mounted.current) setFailure((err?.message || 'Не удалось сохранить ответы.') + ' Попробуйте ещё раз.'); };
  const persist = (next, to) => {
    setPending((n) => n + 1);
    const job = queue.current.then(async () => {
      const r = await apiMutate('client.onboarding.save', { answers: clean(next), step: to, revision: rev.current });
      if (!mounted.current) return r;
      rev.current = r.revision;
      if (r.eligible === false && !r.completed) { onDisabled(); return r; }
      setSaved(r);
      return r;
    });
    queue.current = job.catch(fail).finally(() => { if (mounted.current) setPending((n) => Math.max(0, n - 1)); });
    return job;
  };
  const restore = (r) => {
    queue.current = Promise.resolve();
    rev.current = r.revision || 0;
    setSaved(r);
    setAnswers(withPrefill(r));
    setStep(resumeStep(r.answers || {}, r.step));
  };

  const go = (to, next = answers) => {
    clearTimeout(timer.current);
    setFailure('');
    setDir(to >= step ? 1 : -1);
    setAnswers(next);
    setStep(to);
    setSheet(null);
    setSelected(null);
    persist(next, to).catch(() => {});
  };
  const forward = (next = answers) => go(nextStep(next, step, 1), next);
  const later = async () => {
    if (saved.consentNeeded) { onClose(saved); return; }
    setBusy(true);
    try {
      const r = await persist(answers, step);
      if (mounted.current) onClose(r || saved);
    } catch (_) { if (mounted.current) setBusy(false); }
  };
  const back = () => (step === 0 ? later() : go(nextStep(answers, step, -1)));

  // Одиночный выбор: отметка видна мгновенно, переход — через короткую
  // паузу, чтобы глаз успел увидеть, что выбрано
  const pick = (key, value) => {
    const next = { ...answers, [key]: value };
    if (key === 'goal' && !PACES[value]) delete next.pace;
    setAnswers(next);
    haptic();
    if (key === 'goal' && PACES[value] && hasBody(next)) { setSheet('pace'); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => forward(next), reduced() ? 80 : 300);
  };
  const skipBody = () => {
    const next = { ...answers };
    [...BODY, 'lifestyle', 'pace'].forEach((k) => { delete next[k]; });
    go(STEPS.indexOf('goal'), next);
  };

  const consent = async () => {
    if (busy) return;
    setBusy(true); setFailure('');
    try {
      const r = await apiMutate('client.onboarding.consent', { accept: true });
      if (!mounted.current) return;
      if (r.eligible === false && !r.completed) { onDisabled(); return; }
      setDir(1);
      restore(r);
    } catch (err) { fail(err); } finally { if (mounted.current) setBusy(false); }
  };
  const reopen = async () => {
    setBusy(true);
    try {
      const r = await apiPublic('client.onboarding.get');
      if (!mounted.current) return;
      if (!r.eligible) { onDisabled(); return; }
      restore(r);
      setFailure('');
    } catch (err) { fail(err); } finally { if (mounted.current) setBusy(false); }
  };
  const choose = async () => {
    if (busy || !selected) return;
    setBusy(true); setFailure('');
    try {
      await queue.current;
      const r = await apiMutate('client.onboarding.choose', { templateId: selected, revision: rev.current });
      if (!mounted.current) return;
      if (r.eligible === false && !r.completed) { onDisabled(); return; }
      haptic('medium');
      setDir(1);
      setResult(r);
    } catch (err) { fail(err); } finally { if (mounted.current) setBusy(false); }
  };
  const finish = () => (perms ? setAskPerms(true) : onDone());

  if (askPerms) return <Permissions need={perms} onDone={onDone} />;

  const id = result ? 'done' : saved.consentNeeded ? 'welcome' : STEPS[step];
  const stages = lead ? [SIGNUP_STAGE, ...STAGES] : STAGES;
  const stage = (lead ? 1 : 0) + (id === 'welcome' ? 0 : id === 'done' ? STAGES.length - 1 : Math.max(0, stageOf(step)));
  const programs = saved.programs || [];
  const head = (eyebrow, title, text) => <Head eyebrow={eyebrow} title={title} text={text} ref={heading} />;

  let content = null;
  let primary = null;
  if (id === 'welcome') {
    content = <>
      <div className="ob-hero" aria-hidden="true"><Art name="fitness" size={96} /></div>
      {head('Подбор программы', first ? `${first}, добро пожаловать!` : 'Добро пожаловать!',
        'Ответьте на несколько вопросов — подберём программу тренировок и посчитаем норму питания под вашу цель. Это займёт около минуты.')}
      <ul className="ob-promise">
        <li style={{ '--i': 0 }}><IconCheck size={16} />Программа под цель, опыт и график</li>
        <li style={{ '--i': 1 }}><IconCheck size={16} />Норма калорий и БЖУ — по желанию</li>
        <li style={{ '--i': 2 }}><IconCheck size={16} />Цель видна во всех разделах приложения</li>
      </ul>
      <label className="ob-consent">
        <input type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.target.checked)} />
        <span>Даю <a href="https://app.fitness100.ru/onboarding-consent.html" target="_blank" rel="noopener noreferrer">отдельное согласие</a> на сохранение ответов анкеты для подбора программы. Без него приложением можно пользоваться как обычно.</span>
      </label>
    </>;
    primary = { label: busy ? 'Минуту…' : 'Поехали', disabled: busy || !agreed, onClick: consent };
  } else if (id === 'body') {
    const next = BODY.slice(1).find((k) => !answers[k]);
    content = <>
      {head('О вас', first ? `Приятно познакомиться, ${first}!` : 'Расскажите о себе',
        'Начнём с основных данных — по ним посчитаем норму калорий. Не хотите — пропустите, программу подберём и так.')}
      <div className="ob-group" style={{ '--i': 0 }}>
        <span className="ob-group__label" id="ob-sex">Пол</span>
        <div className="ob-sex" role="radiogroup" aria-labelledby="ob-sex">
          {[['f', 'Женский'], ['m', 'Мужской']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={answers.sex === v}
              className={'ob-pill' + (answers.sex === v ? ' is-on' : '')}
              onClick={() => { setAnswers({ ...answers, sex: v }); haptic(); if (next && !answers[next]) setSheet(next); }}>
              <Art name={v} size={22} />{l}
            </button>
          ))}
        </div>
      </div>
      {BODY.slice(1).map((k, i) => (
        <button key={k} type="button" className="ob-tile" style={{ '--i': i + 1 }} aria-haspopup="dialog" onClick={() => setSheet(k)}>
          <span className="ob-tile__label">{WHEELS[k].label}</span>
          <span className={'ob-tile__value' + (answers[k] ? '' : ' is-empty')}>{answers[k] ? fmtBody(k, answers[k]) : 'Выбрать'}</span>
          <IconChevron size={16} />
        </button>
      ))}
      <button type="button" className="ob-skip" onClick={skipBody}>Пропустить — норму посчитаю позже</button>
    </>;
    primary = { label: 'Далее', disabled: !hasBody(answers), onClick: () => forward() };
  } else if (id === 'bmr') {
    content = <BmrStep answers={answers} first={first} head={head} />;
    primary = { label: 'Далее', onClick: () => forward() };
  } else if (id === 'lifestyle') {
    content = <>
      {head('Активность', 'Оценим вашу активность', 'Как проходит обычный день, без тренировок — их добавим из графика. Так точнее посчитаем расход калорий.')}
      <Choices label="Активность" items={LIFESTYLES} value={answers.lifestyle} onPick={(v) => pick('lifestyle', v)} />
    </>;
  } else if (id === 'goal') {
    content = <>
      {head('Цель', 'Какая у вас цель?', 'Под неё подстроим программу, норму питания и подсказки во всех разделах.')}
      <Choices label="Цель" grid items={GOALS} value={answers.goal} onPick={(v) => pick('goal', v)} />
    </>;
  } else if (QUESTIONS[id]) {
    const q = QUESTIONS[id];
    content = <>
      {head(q.eyebrow, q.title, q.hint)}
      <Choices label={q.title} items={q.options.map(([v, title, hint, art]) => ({ id: v, title, hint, art }))}
        value={answers[q.key]} onPick={(v) => pick(q.key, v)} />
    </>;
  } else if (id === 'plan') {
    content = <PlanStep norm={pending ? null : saved.norm} answers={answers} first={first} head={head} />;
    primary = { label: 'Выбрать программу', disabled: !!pending, onClick: () => forward() };
  } else if (id === 'programs') {
    content = <>
      {head('Ваш план', 'Программа под вашу цель', pending || programs.length
        ? 'Подходят под ваши ответы. Посмотрите упражнения и выберите одну.'
        : 'Пока нет программы под это сочетание ответов.')}
      {pending ? <p className="ob-note" role="status">Подбираем программы…</p> : programs.length ? <div className="ob-programs" role="radiogroup" aria-label="Программы">
        {programs.map((p, i) => <Program key={p.id} p={p} i={i} best={i === 0} on={selected === p.id} onPick={() => { setSelected(p.id); haptic(); }} />)}
      </div> : <p className="ob-note" role="status">Измените место или график — или вернитесь в приложение и напишите тренеру: он подберёт программу сам.</p>}
    </>;
    primary = pending || programs.length
      ? { label: busy ? 'Сохраняем…' : 'Начать по этой программе', disabled: busy || !!pending || !selected, onClick: choose }
      : { label: 'Изменить ответы', onClick: () => go(STEPS.indexOf('place')) };
  } else if (id === 'done') {
    content = <DoneStep result={result} answers={answers} first={first} head={head} />;
    primary = { label: 'Продолжить', onClick: finish };
  }
  if (!primary) primary = { label: 'Далее', disabled: !canAdvance(answers, step), onClick: () => forward() };

  return (
    <main className="onboarding ob" aria-busy={busy}>
      <header className="ob__top">
        <StageBar stages={stages} current={stage} label="Подбор программы" />
        {id !== 'done' && <button type="button" className="ob__later" disabled={busy} onClick={later}>Позже</button>}
      </header>
      <div key={id} className={'ob__body ob-step' + (dir < 0 ? ' ob-step--back' : '')}>
        {content}
      </div>
      <p className="ob__safety">При боли или ограничениях обсудите занятия со специалистом. Анкета не оценивает здоровье.</p>
      {failure && <div className="ob__error" role="alert"><p>{failure}</p><button type="button" className="button button--ghost" disabled={busy} onClick={reopen}>Открыть сохранённую анкету</button></div>}
      <footer className="ob__footer">
        {id !== 'done' && <button type="button" className="ob__back" aria-label={step === 0 || id === 'welcome' ? 'Закрыть анкету' : 'Назад'} disabled={busy} onClick={id === 'welcome' ? later : back}><IconBack size={20} /></button>}
        <button type="button" className="button button--primary ob__next" disabled={!!primary.disabled} onClick={primary.onClick}>
          {primary.label}<span className="ob__arrow" aria-hidden="true"><IconBack size={18} /></span>
        </button>
      </footer>

      {sheet && WHEELS[sheet] && <BodySheet key={sheet} k={sheet} answers={answers}
        onDone={(v, nextKey) => { setAnswers((a) => ({ ...a, [sheet]: v })); setSheet(nextKey || null); }}
        onClose={() => setSheet(null)} />}
      {sheet === 'pace' && <PaceSheet goal={answers.goal} value={answers.pace || 'even'}
        onDone={(pace) => forward({ ...answers, pace })} onClose={() => setSheet(null)} />}
    </main>
  );
}

const Head = React.forwardRef(function Head({ eyebrow, title, text }, ref) {
  return <>
    <p className="ob__eyebrow">{eyebrow}</p>
    <h1 ref={ref} tabIndex={-1} className="ob__title">{title}</h1>
    {text && <p className="ob__lead">{text}</p>}
  </>;
});

function Choices({ label, items, value, onPick, grid = false }) {
  return (
    <div className={'ob-choices' + (grid ? ' ob-choices--grid' : '')} role="radiogroup" aria-label={label}>
      {items.map((it, i) => {
        const on = value === it.id;
        return (
          <button key={it.id} type="button" role="radio" aria-checked={on} style={{ '--i': i }}
            className={'ob-choice' + (on ? ' is-on' : '')} onClick={() => onPick(it.id)}>
            <span className="ob-choice__art"><Art name={it.art} size={grid ? 56 : 44} /></span>
            <span className="ob-choice__text"><strong>{it.title}</strong><span>{it.hint}</span></span>
            <span className="ob-choice__mark" aria-hidden="true">{on && <IconCheck size={14} />}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Нижнее окно с барабаном. «Далее» ведёт к следующему пустому полю, как у ONLYFITS */
function BodySheet({ k, answers, onDone, onClose }) {
  const w = WHEELS[k];
  const start = answers[k] || wheelStart(k, answers.sex);
  const [value, setValue] = useState(start);
  const next = BODY.slice(1).find((key) => key !== k && !answers[key]);
  const kg = Math.floor(value);
  const tenth = Math.round((value - kg) * 10);
  return (
    <Sheet title={w.label} onClose={onClose} onDone={() => onDone(value, next)} done={next ? 'Далее' : 'Готово'}>
      <div className="ob-wheels">
        {k === 'weight' ? <>
          <Wheel label="Вес, килограммы" values={range(w.min, w.max)} value={kg} width={2}
            format={(v) => v + ' кг'} onChange={(v) => setValue(Math.min(w.max, v + tenth / 10))} />
          <Wheel label="Вес, граммы" values={range(0, 9)} value={tenth} width={1}
            format={(v) => v * 100 + ' г'} onChange={(v) => setValue(Math.min(w.max, kg + v / 10))} />
        </> : <Wheel label={w.label} values={range(w.min, w.max)} value={value}
          format={(v) => (k === 'age' ? v + ' ' + plural(v, 'год', 'года', 'лет') : v + ' ' + w.unit)} onChange={setValue} />}
      </div>
    </Sheet>
  );
}

function PaceSheet({ goal, value, onDone, onClose }) {
  const [pace, setPace] = useState(value);
  const p = PACES[goal];
  return (
    <Sheet title={p.title} onClose={onClose} onDone={() => onDone(pace)} done="Сохранить">
      <p className="ob-sheet__lead">Чтобы подобрать посильный темп и точно посчитать норму.</p>
      <div className="ob-choices ob-choices--compact" role="radiogroup" aria-label={p.title}>
        {p.options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={pace === o.id}
            className={'ob-choice' + (pace === o.id ? ' is-on' : '')} onClick={() => { setPace(o.id); haptic(); }}>
            <span className="ob-choice__text"><strong>{o.label} <span className="ob-choice__note">{o.note}</span></strong><span>{o.hint}</span></span>
            <span className="ob-choice__mark" aria-hidden="true">{pace === o.id && <IconCheck size={14} />}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function BmrStep({ answers, first, head }) {
  const bmr = bmrOf(answers) || 0;
  const k = useReveal(1000, String(bmr));
  return <>
    {head('О вас', first ? `Отлично, ${first}! Базовый обмен рассчитан` : 'Базовый обмен рассчитан')}
    <div className="ob-hero ob-hero--rest" aria-hidden="true"><RestArt /></div>
    <p className="ob-big" aria-label={formatNumber(bmr) + ' килокалорий'}>
      <span className="ob-big__num">{formatNumber(Math.round(bmr * k))}</span><span className="ob-big__unit">ккал</span>
    </p>
    <div className="ob-meter" aria-hidden="true"><span style={{ transform: `scaleX(${0.65 * k})` }} /></div>
    <p className="ob__lead ob__lead--small">
      Столько тело тратит в полном покое — на сердце, дыхание и мозг. Это 60–70 % всех трат за день, остальное
      добавят движение и тренировки. Формула Миффлина — Сан-Жеора по вашим данным: {formatNumber(answers.height)} см,{' '}
      {formatNumber(answers.weight)} кг, {answers.age} {plural(answers.age, 'год', 'года', 'лет')}.
    </p>
  </>;
}

/** Отдых — при базовом обмене (у ONLYFITS — спящий талисман) */
function RestArt() {
  return (
    <svg width="120" height="84" viewBox="0 0 120 84" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 64h92M20 64V44a8 8 0 0 1 8-8h64a8 8 0 0 1 8 8v20M20 72v-8M100 72v-8" />
      <path d="M30 36v-6a6 6 0 0 1 6-6h14a6 6 0 0 1 6 6v6" />
      <path d="M56 50h38" />
      <path d="M84 10h10l-10 12h10M100 4h6l-6 7h6" stroke="var(--accent-solid)" />
    </svg>
  );
}

const MACROS = [
  { key: 'protein', label: 'Белки', kcal: 4 },
  { key: 'fat', label: 'Жиры', kcal: 9 },
  { key: 'carbs', label: 'Углеводы', kcal: 4 },
];

function PlanStep({ norm, answers, first, head }) {
  const ready = !!norm?.ready;
  const k = useReveal(1100, ready ? String(norm.kcal) : '');
  const total = ready ? MACROS.reduce((s, m) => s + norm[m.key] * m.kcal, 0) : 1;
  let start = 0;
  const segments = MACROS.map((m) => {
    const len = ready ? (norm[m.key] * m.kcal / total) * 100 : 0;
    const seg = { ...m, start, len };
    start += len;
    return seg;
  });
  return <>
    {head('Ваш план', first ? `Ваш план готов, ${first}!` : 'Ваш план готов',
      'Норма калорий и БЖУ — из ваших данных, активности, цели и графика тренировок.')}
    {!ready ? <p className="ob-note" role="status">Считаем норму…</p> : <>
      <div className="ob-gauge">
        <svg viewBox="0 0 240 132" aria-hidden="true">
          <path d="M24 120a96 96 0 0 1 192 0" pathLength="100" className="ob-gauge__track" />
          {segments.map((s) => {
            const shown = Math.max(0, Math.min(s.len, k * 100 - s.start) - 1.2);
            return <path key={s.key} d="M24 120a96 96 0 0 1 192 0" pathLength="100" className={'ob-gauge__seg ob-gauge__seg--' + s.key}
              strokeDasharray={`${shown} 200`} strokeDashoffset={-s.start} />;
          })}
        </svg>
        <p className="ob-gauge__value" aria-label={formatNumber(norm.kcal) + ' килокалорий в день'}>
          <span className="ob-big__num">{formatNumber(Math.round(norm.kcal * k))}</span>
          <span className="ob-gauge__unit">ккал в день</span>
        </p>
      </div>
      <ul className="ob-macros">
        {segments.map((s, i) => (
          <li key={s.key} className={'ob-macro ob-macro--' + s.key} style={{ '--i': i }}>
            <span className="ob-macro__dot" aria-hidden="true" />
            <span className="ob-macro__label">{s.label}</span>
            <strong className="ob-macro__value">{formatNumber(norm[s.key])} г</strong>
            <span className="ob-macro__share">{Math.round(s.len)} %</span>
          </li>
        ))}
      </ul>
      <p className="ob-note">
        {norm.goalLabel}{norm.paceLabel && norm.goal !== 'keep' ? ', темп «' + norm.paceLabel.toLowerCase() + '»' : ''} · {timesWeek(answers.days)}.
        Это ориентир, а не назначение: цель, темп и данные можно поменять в «Питании».
      </p>
    </>}
  </>;
}

function Program({ p, i, best, on, onPick }) {
  const count = p.blocks.reduce((s, b) => s + b.exercises.length, 0);
  return (
    <article className={'ob-program' + (on ? ' is-on' : '')} style={{ '--i': i }}>
      <button type="button" role="radio" aria-checked={on} className="ob-program__pick" onClick={onPick}>
        <span className="ob-program__head">
          {best && <span className="ob-program__badge">Лучше всего под цель</span>}
          <strong className="ob-program__title">{p.title}</strong>
          <span className="ob-program__facts">{timesWeek(p.days)} · {p.blocks.length} {plural(p.blocks.length, 'занятие', 'занятия', 'занятий')} · {count} {plural(count, 'упражнение', 'упражнения', 'упражнений')}</span>
          {p.description && <span className="ob-program__text">{p.description}</span>}
        </span>
        <span className="ob-choice__mark" aria-hidden="true">{on && <IconCheck size={14} />}</span>
      </button>
      <details className="ob-program__more">
        <summary>Упражнения и инвентарь</summary>
        {p.blocks.map((b, j) => <div key={j}><h3>{b.title}</h3>
          <ul>{b.exercises.map((e, n) => <li key={n}>{e.name}{e.sets ? ` · ${e.sets} × ${e.reps || '—'}` : ''}</li>)}</ul></div>)}
      </details>
    </article>
  );
}

function DoneStep({ result, answers, first, head }) {
  const goal = GOALS.find((g) => g.id === (result.goal || answers.goal));
  const norm = result.norm;
  return <>
    <div className="ob-done" aria-hidden="true">
      <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="32" className="ob-done__ring" /><path d="M22 37l10 10 18-20" className="ob-done__tick" /></svg>
    </div>
    {head('Готово', first ? `Всё готово, ${first}!` : 'Всё готово!', 'Программа уже в «Тренировках». Цель и норма — во всех разделах.')}
    <ul className="ob-summary">
      {goal && <li style={{ '--i': 0 }}><span>Цель</span><strong>{goal.title}</strong></li>}
      <li style={{ '--i': 1 }}><span>Программа</span><strong>{result.selectedTitle}</strong></li>
      <li style={{ '--i': 2 }}><span>График</span><strong>{timesWeek(result.days || answers.days)}</strong></li>
      {norm && <li style={{ '--i': 3 }}><span>Норма</span><strong>{formatNumber(norm.kcal)} ккал · Б {norm.protein} · Ж {norm.fat} · У {norm.carbs}</strong></li>}
    </ul>
  </>;
}
