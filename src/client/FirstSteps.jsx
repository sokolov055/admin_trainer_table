import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiPrimary, apiMutate, onMutated } from '../api.js';
import { isNativeApp } from '../native-bridge.js';
import { stepsAvailability } from '../native-steps.js';
import { notifyPermission, askNotifyPermission } from '../native-rest.js';
import { IconCheck, IconClose } from '../icons.jsx';
import { plural } from '../ui.jsx';
import './first-steps.css';

/**
 * Первые шаги после анкеты (FT-561, FT-510; разбор ONLYFITS — FT-560).
 *
 * 1. Подсказка первого действия: экран затемнён, подсвечена одна настоящая
 *    кнопка — «Начать тренировку» (есть программа) или вкладка «Прогресс»
 *    (нет программы, шаги на этом телефоне есть). Нажатие на кнопку делает
 *    своё обычное дело и закрывает подсказку; «Пропустить» видно всегда.
 *    Что подсказка пройдена, хранит сервер — на втором устройстве её нет.
 * 2. Первый «день в режиме» — карточкой на «Обзоре», только когда есть
 *    факт: тренировка (по правилу наград FT-490) или норма шагов. Открыть
 *    занятие — ещё не успех.
 * 3. Уведомления — в той же карточке, после успеха, своим экраном перед
 *    системным окном. Это уведомления телефона (конец отдыха); push с
 *    сервера на паузе и здесь не включаются. Кнопка одна — «Продолжить»,
 *    без «Не сейчас» (App Review 5.1.1(iv); владелец 15.10.2026 — везде как
 *    на iPhone): отказаться можно в системном окне или закрыть карточку.
 */

const HINTS = {
  workout: {
    target: () => document.querySelector('main.app__body:not([hidden]) [data-first-action="workout"]'),
    title: 'Начните первое занятие',
    text: 'Нажмите «Начать тренировку» — откроются упражнения программы. Подходы отмечаете по ходу.',
  },
  steps: {
    target: () => document.querySelector('.tabbar [data-tab="progress"]'),
    title: 'Посмотрите свои шаги',
    text: 'Нажмите «Прогресс» — там шаги за сегодня и за две недели. Если они ещё не подключены, там же кнопка «Подключить шаги».',
  },
};

/** Состояние первых шагов своего кабинета; null — нет или не загрузилось */
export function useFirstSteps(enabled) {
  const [state, setState] = useState(null);
  const refresh = useCallback(async () => {
    if (!enabled || document.visibilityState === 'hidden') return;
    try {
      const r = await apiPrimary('client.firstSteps.get');
      let hint = r.hint;
      let action = r.action || null;
      // Шаги подсказываем только там, где они есть: в браузере и на
      // телефоне без «Здоровья»/Health Connect смотреть было бы нечего
      if (hint === 'steps' || action === 'steps') {
        const ok = isNativeApp() && (await stepsAvailability().catch(() => ({}))).available;
        if (!ok) { if (hint === 'steps') hint = null; if (action === 'steps') action = null; }
      }
      setState({ ...r, hint, action });
    } catch (_) {
      // Старый сервер не знает этих действий — просто ничего не показываем
      setState(null);
    }
  }, [enabled]);

  useEffect(() => {
    // Без браузера (тесты экранов) — ничего не показываем
    if (!enabled || typeof document === 'undefined') { setState(null); return undefined; }
    refresh();
    const again = () => refresh();
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    // Сохранили занятие — мог появиться первый день в режиме
    const off = onMutated(again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); off(); };
  }, [enabled, refresh]);

  const send = useCallback(async (action, params) => {
    try { setState((prev) => ({ ...prev, ...pick(prev, action) })); } catch (_) {}
    try {
      await apiMutate(action, params, { quiet: true });
    } catch (_) { /* не записалось — подсказка вернётся при следующем входе */ }
    refresh();
  }, [refresh]);

  return { state, refresh, send };
}

/** Что убрать с экрана сразу, не дожидаясь ответа сервера */
function pick(prev, action) {
  if (action === 'client.firstSteps.hint') return { hint: null, tour: false };
  if (action === 'client.firstSteps.regimeSeen') return { regime: null };
  if (action === 'client.firstSteps.notify') return { notify: false };
  return {};
}

/** Прямоугольник цели и его обновление при прокрутке, повороте и смене размеров */
function useTargetRect(find, onMissing) {
  const [rect, setRect] = useState(null);
  const target = useRef(null);
  useLayoutEffect(() => {
    let alive = true;
    let tries = 0;
    let timer = null;
    const measure = () => {
      const el = target.current;
      if (!el || !el.isConnected) { target.current = null; setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect(r.width && r.height ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    const look = () => {
      if (!alive) return;
      const el = find();
      if (el) {
        target.current = el;
        el.scrollIntoView({ block: 'center' });
        measure();
        return;
      }
      // Экран ещё грузится: ищем до 4 секунд, потом молча сдаёмся
      if (++tries > 20) { onMissing(); return; }
      timer = setTimeout(look, 200);
    };
    look();
    const again = () => { if (!target.current) return; measure(); };
    window.addEventListener('resize', again);
    window.addEventListener('scroll', again, true);
    document.addEventListener('visibilitychange', again);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null;
    if (ro) ro.observe(document.body);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener('resize', again);
      window.removeEventListener('scroll', again, true);
      document.removeEventListener('visibilitychange', again);
      if (ro) ro.disconnect();
    };
  }, []);
  return [rect, target];
}

const PAD = 6;

/**
 * Подсказка первого действия. Затемнение — четыре полосы вокруг кнопки:
 * они ловят касания мимо, а сама кнопка остаётся настоящей и нажимается.
 */
export function FirstHint({ kind, onDone }) {
  const hint = HINTS[kind];
  const done = useRef(false);
  const finish = (result) => { if (done.current) return; done.current = true; onDone(result); };
  const [rect, target] = useTargetRect(hint.target, () => { done.current = true; });
  const title = useRef(null);

  useEffect(() => { if (rect) title.current?.focus({ preventScroll: true }); }, [!!rect]);

  // Нажатие на подсвеченную кнопку — действие выполнено. Слушаем на
  // захвате, ничего не отменяя: кнопка делает своё обычное дело
  useEffect(() => {
    const el = target.current;
    if (!el) return undefined;
    const tap = () => finish(kind);
    el.addEventListener('click', tap, true);
    el.setAttribute('aria-describedby', 'first-hint-text');
    return () => { el.removeEventListener('click', tap, true); el.removeAttribute('aria-describedby'); };
  }, [rect && target.current]);

  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') finish('skipped'); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (!rect || done.current) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hole = {
    top: Math.max(0, rect.top - PAD), left: Math.max(0, rect.left - PAD),
    width: Math.min(vw, rect.width + PAD * 2), height: rect.height + PAD * 2,
  };
  const below = hole.top + hole.height / 2 < vh / 2;
  const card = below
    ? { top: Math.min(vh - 200, hole.top + hole.height + 14) }
    : { bottom: Math.min(vh - 200, vh - hole.top + 14) };

  return createPortal(
    <div className="first-hint">
      <div className="first-hint__block" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
      <div className="first-hint__block" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
      <div className="first-hint__block" style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
      <div className="first-hint__block" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
      <div className="first-hint__ring" style={hole} aria-hidden="true" />
      <section className="first-hint__card" style={card} role="dialog" aria-modal="false" aria-labelledby="first-hint-title" aria-describedby="first-hint-text">
        <h2 id="first-hint-title" ref={title} tabIndex={-1}>{hint.title}</h2>
        <p id="first-hint-text">{hint.text}</p>
        <button type="button" className="button button--ghost" onClick={() => finish('skipped')}>Пропустить</button>
      </section>
    </div>,
    document.body,
  );
}

/**
 * Первый день в режиме и, после него, вопрос об уведомлениях.
 * Уведомления — только в приложении: в браузере сигнал конца отдыха
 * телефоном не ставится, а push с сервера на паузе.
 */
export function FirstRegime({ regime, notify, onSeen, onNotify }) {
  const [perm, setPerm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  useEffect(() => {
    if (!notify || !isNativeApp()) { setPerm(''); return; }
    let alive = true;
    notifyPermission().then((p) => {
      if (!alive) return;
      // Уже решено на этом телефоне — второй раз не спрашиваем
      if (p === 'granted' || p === 'denied') onNotify(p);
      setPerm(p);
    });
    return () => { alive = false; };
  }, [notify]);

  const ask = perm === 'prompt' && notify;
  if (!regime && !ask && !answer) return null;

  const allow = async () => {
    setBusy(true);
    const p = await askNotifyPermission();
    setBusy(false);
    setAnswer(p === 'granted' ? 'Готово: телефон подаст сигнал, когда отдых закончится.' : 'Уведомления не разрешены. Включить их можно в настройках телефона.');
    onNotify(p || 'denied');
  };
  const close = () => { if (ask) onNotify('later'); if (regime) onSeen(); setAnswer(''); };

  return (
    <section className="first-regime panel panel--pad" aria-labelledby="first-regime-title">
      <button type="button" className="icon-button first-regime__close" aria-label="Закрыть" onClick={close}><IconClose size={18} /></button>
      {regime && <>
        <h2 id="first-regime-title" className="first-regime__title">
          {regime.count} {plural(regime.count, 'день', 'дня', 'дней')} в режиме
        </h2>
        <ol className="first-regime__week" aria-label="Эта неделя">
          {regime.week.map((d) => (
            <li key={d.day} className={'first-regime__day' + (d.on ? ' is-on' : '') + (d.today ? ' is-today' : '')}>
              <span className="first-regime__dot" aria-hidden="true">{d.on && <IconCheck size={14} />}</span>
              <span className="first-regime__label">{d.label}<span className="first-regime__sr">{d.on ? ' — в режиме' : ''}{d.today ? ', сегодня' : ''}</span></span>
            </li>
          ))}
        </ol>
        <p className="small muted">День в режиме — день с тренировкой или нормой шагов.</p>
      </>}
      {ask && !answer && <div className="first-regime__notify">
        <h3 id={regime ? undefined : 'first-regime-title'}>Сигнал конца отдыха</h3>
        <p className="small muted">Разрешите уведомления — телефон подаст сигнал, когда отдых между подходами закончится, даже с заблокированным экраном.</p>
        <div className="survey__actions">
          <button type="button" className="button button--primary" disabled={busy} onClick={allow}>{busy ? 'Спрашиваем…' : 'Продолжить'}</button>
        </div>
      </div>}
      {answer && <p className="small" role="status">{answer}</p>}
    </section>
  );
}
