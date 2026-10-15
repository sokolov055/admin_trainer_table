import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../telegram.js';
import './tour.css';

/**
 * Тур по разделам клиента (FT-577) — вместо одной подсказки FT-561.
 * Образец — тур ONLYFITS «1 из 4»: карточка у подсвеченного места, счёт
 * шагов, «Далее». У нас разделов больше, поэтому тур идёт по нижнему
 * меню и сам открывает каждый раздел — человек видит, что за ним.
 *
 * Последний шаг — первое действие: подсвечена настоящая кнопка «Начать
 * тренировку» (или «Прогресс» с шагами), её можно нажать — она сделает
 * своё обычное дело, и тур закончится. «Пропустить» видно на каждом шаге.
 *
 * Подсветка — одно «окно» с огромной тенью вокруг: оно плавно переезжает
 * от цели к цели. На шагах-объяснениях касания мимо карточки гасятся;
 * на шаге действия гасятся только касания вокруг окна.
 */

const PAD = 6;
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function tourSteps({ unlinked, action, app }) {
  const steps = [
    { tab: 'overview', target: '.tabbar [data-tab="overview"]', title: 'Обзор — главное на сегодня',
      text: unlinked
        ? 'Ваша цель, график и норма. Когда появится тренер — здесь же его занятия и оплата.'
        : 'Ваша цель, следующая тренировка с тренером и сколько занятий оплачено.' },
    { tab: 'plan', target: '.tabbar [data-tab="plan"]', title: 'Тренировки',
      text: 'Программа по занятиям. «Начать тренировку» — и отмечайте подходы по ходу, отдых считает таймер. Проведённые — во вкладке «Выполненные».' },
    { tab: 'progress', target: '.tabbar [data-tab="progress"]', title: 'Прогресс',
      text: app
        ? 'Замеры, рабочие веса, шаги с телефона и награды за серии — видно, как вы идёте к цели.'
        : 'Замеры, рабочие веса, шаги и награды за серии — видно, как вы идёте к цели. Шаги приходят из приложения на телефоне.' },
    { tab: 'nutrition', target: '.tabbar [data-tab="nutrition"]', title: 'Питание',
      text: 'Норма калорий и БЖУ под вашу цель и рацион из того, что есть дома, — со списком покупок.' },
    { tab: 'overview', target: '.app__bar [aria-label="Меню"]', title: 'Меню «Ещё»',
      text: 'Ваш тренер и ID для привязки, ваши данные, настройки и «Как пользоваться» — короткие инструкции, если что-то забудется.' },
  ];
  if (action === 'workout') {
    steps.push({ tab: 'plan', action: 'workout', wait: true, title: 'Начните первое занятие',
      target: 'main.app__body:not([hidden]) [data-first-action="workout"]',
      text: 'Нажмите «Начать тренировку» — откроются упражнения программы. Подходы отмечаете по ходу.' });
  } else if (action === 'steps') {
    steps.push({ tab: 'overview', action: 'steps', title: 'Посмотрите свои шаги', target: '.tabbar [data-tab="progress"]',
      text: 'Нажмите «Прогресс» — там шаги за сегодня и за две недели. Не подключены — там же кнопка «Подключить шаги».' });
  } else {
    steps.push({ tab: 'overview', title: 'Готово!', text: 'Всё самое важное — в нижнем меню. Приятных тренировок!' });
  }
  return steps;
}

function useRect(step) {
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const el = useRef(null);
  useLayoutEffect(() => {
    let alive = true;
    let tries = 0;
    let timer = 0;
    el.current = null;
    setMissing(false);
    const measure = () => {
      const t = el.current;
      if (!t || !t.isConnected) return;
      const r = t.getBoundingClientRect();
      if (r.width && r.height) setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const look = () => {
      if (!alive) return;
      const t = step.target ? document.querySelector(step.target) : null;
      if (t) {
        el.current = t;
        if (step.wait) t.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
        measure();
        // После прокрутки — ещё раз: окно должно встать ровно на кнопку
        timer = setTimeout(measure, 380);
        return;
      }
      if (!step.target || ++tries > (step.wait ? 25 : 8)) { setRect(null); setMissing(true); return; }
      timer = setTimeout(look, 160);
    };
    // Раздел только что переключён — даём ему кадр отрисоваться
    timer = setTimeout(look, 40);
    const again = () => measure();
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, true);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('resize', again);
      window.removeEventListener('scroll', again, true);
    };
  }, [step]);
  return { rect, missing, el };
}

export default function Tour({ unlinked, action, app, onTab, onDone }) {
  // Шаги — один раз на показ: иначе каждая перерисовка начинала бы поиск цели заново
  const [steps] = useState(() => tourSteps({ unlinked, action, app }));
  const [i, setI] = useState(0);
  const step = steps[i];
  const { rect, missing, el } = useRect(step);
  const done = useRef(false);
  const title = useRef(null);
  const finish = (result) => { if (done.current) return; done.current = true; onDone(result); };
  const last = i === steps.length - 1;

  useEffect(() => { if (step.tab) onTab(step.tab); }, [i]);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [i]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') finish('skipped'); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // Шаг действия: нажатие на настоящую кнопку — действие выполнено.
  // Слушаем документ на захвате и ничего не отменяем: кнопка может
  // перерисоваться (приехали данные программы), и слушатель на прежнем
  // элементе остался бы на удалённом узле
  const live = step.action && rect && !missing;
  useEffect(() => {
    if (!live) return undefined;
    const tap = (e) => { if (e.target instanceof Element && e.target.closest(step.target)) finish(step.action); };
    document.addEventListener('click', tap, true);
    const t = el.current;
    t?.setAttribute('aria-describedby', 'tour-text');
    return () => { document.removeEventListener('click', tap, true); t?.removeAttribute('aria-describedby'); };
  }, [live, i]);

  const next = () => {
    haptic();
    if (last) finish('skipped');
    else setI(i + 1);
  };

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = rect && !missing
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : { top: vh / 2, left: vw / 2, width: 0, height: 0 };
  const below = rect && !missing && hole.top + hole.height / 2 < vh / 2;
  const cardPos = !rect || missing
    ? { top: '50%', transform: 'translateY(-50%)' }
    : below ? { top: Math.min(vh - 220, hole.top + hole.height + 14) } : { bottom: Math.min(vh - 220, vh - hole.top + 14) };
  // Хвостик карточки — над центром цели
  const tail = rect && !missing ? Math.max(28, Math.min(vw - 28, hole.left + hole.width / 2)) : null;

  return createPortal(
    <div className={'tour' + (live ? ' tour--live' : '')}>
      {live ? <>
        <div className="tour__block" style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }} />
        <div className="tour__block" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
        <div className="tour__block" style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
        <div className="tour__block" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
      </> : <div className="tour__block" style={{ inset: 0 }} />}
      <div className={'tour__hole' + (rect && !missing ? '' : ' is-empty')} style={hole} aria-hidden="true" />
      <section className={'tour__card' + (below ? ' is-below' : rect && !missing ? ' is-above' : '')} style={cardPos}
        role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-text">
        {tail !== null && <span className="tour__tail" style={{ left: tail - 16 - 8 }} aria-hidden="true" />}
        <div key={i} className="tour__content">
          <p className="tour__count" aria-live="polite">{i + 1} из {steps.length}</p>
          <h2 id="tour-title" ref={title} tabIndex={-1}>{step.title}</h2>
          <p id="tour-text">{step.text}</p>
        </div>
        <div className="tour__actions">
          {!last && <button type="button" className="tour__skip" onClick={() => finish('skipped')}>Пропустить</button>}
          {last && step.action && !missing
            ? <button type="button" className="tour__skip" onClick={() => finish('skipped')}>Не сейчас</button>
            : <button type="button" className="button button--primary tour__next" onClick={next}>{last ? 'Начать' : 'Далее'}</button>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
