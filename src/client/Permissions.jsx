import React, { useEffect, useRef, useState } from 'react';
import { isNativeApp } from '../native-bridge.js';
import { detectBrowser } from '../browser.js';
import { stepsAvailability, stepsOn, connectHealth, deviceHealthScope, healthHub, onIphone, workoutsAvailable } from '../native-steps.js';
import { healthResultLines } from './HealthConnect.jsx';
import { HEALTH_CONSENT_URL } from '../PrivacyLink.jsx';
import { ensureBackgroundSync, backgroundSyncAvailable, backgroundSyncStatus, requestBackgroundAccess } from '../native-sync.js';
import { notifyPermission, askNotifyPermission } from '../native-rest.js';
import './onboarding.css';
import './first-steps.css';

/**
 * Разрешения при регистрации на телефоне (FT-510, владелец 15.10.2026):
 * одним шагом всё, что нужно приложению, — шаги, тренировки,
 * уведомления, на Android ещё отправка в фоне. Показывается последним шагом
 * анкеты, а если анкеты нет (выключена или отложена) — сразу после
 * регистрации. Один раз на телефоне.
 *
 * Шаги считает сам телефон — берём суммы по дням из «Здоровья» или Health
 * Connect; тренировки — те, что записали телефон или часы. Согласие на шаги
 * и тренировки (редакция 2026-10-02) человек уже подтвердил при регистрации.
 * Сон, пульс, вес и остальное (FT-708) — только на новых сборках и только с
 * галочкой отдельного согласия здесь же: без неё системное окно спросит
 * одни шаги и тренировки. Решение уходит на сервер (health.access.set) —
 * второй раз экран «Здоровье» при входе не покажется.
 *
 * Перед системными окнами — свой экран с одной кнопкой «Продолжить», без
 * «Не сейчас»: App Review (5.1.1(iv)) отклоняет экраны перед запросом с
 * кнопкой выхода. Отказаться можно в каждом системном окне, и отказ ничего
 * не закрывает: подключить можно позже в «Прогрессе» и «Настройках».
 */

const ASKED_KEY = 'fittrack_permissions_asked_v1';

export function permissionsAsked() {
  return asked();
}

function asked() {
  try { return localStorage.getItem(ASKED_KEY) === '1'; } catch (_) { return false; }
}
function markAsked() {
  try { localStorage.setItem(ASKED_KEY, '1'); } catch (_) {}
}

/** Что на этом телефоне ещё можно спросить; null — пока проверяем */
async function pending() {
  const health = !stepsOn() && !!(await stepsAvailability().catch(() => ({}))).available;
  const scope = health ? await deviceHealthScope().catch(() => 'basic') : '';
  const notify = (await notifyPermission()) === 'prompt';
  const bgStatus = !onIphone() && backgroundSyncAvailable() ? await backgroundSyncStatus() : null;
  const background = !!(bgStatus && bgStatus.supported && !bgStatus.background);
  return { health, scope, workouts: health && workoutsAvailable(), notify, background: background && health };
}

/** Нужен ли экран: приложение, ещё не спрашивали, есть что спросить */
export function usePermissions() {
  const [need, setNeed] = useState(null);
  useEffect(() => {
    if (!isNativeApp() || asked()) { setNeed(false); return undefined; }
    let alive = true;
    pending().then((p) => { if (alive) setNeed(p.health || p.notify ? p : false); }).catch(() => { if (alive) setNeed(false); });
    return () => { alive = false; };
  }, []);
  return need;
}

const fromHub = () => (healthHub() === '«Здоровье»' ? '«Здоровья»' : healthHub());

function healthLine(r) {
  if (r.steps === 'ok' || r.workouts === 'ok') {
    return r.steps === 'ok' && r.workouts === 'ok' ? 'Шаги и тренировки пришли — они в «Прогрессе».'
      : r.steps === 'ok' ? 'Шаги пришли — они в «Прогрессе».' : 'Тренировки пришли — они в «Прогрессе».';
  }
  if (r.steps === 'error' || r.workouts === 'error') return `Не получилось прочитать данные из ${fromHub()}. Попробуйте позже: «Прогресс» → «Подключить шаги».`;
  if (r.steps === 'denied') return 'Шаги и тренировки не разрешены. Включить можно позже: «Прогресс» → «Подключить шаги».';
  return onIphone()
    ? 'Шагов и тренировок за месяц нет — или в «Здоровье» не включён доступ для Fit Track. Проверить можно в «Прогрессе».'
    : 'Записей пока нет — появятся в «Прогрессе», как только телефон их посчитает.';
}

export default function Permissions({ need, onDone }) {
  const [busy, setBusy] = useState(false);
  // Галочка не отмечена заранее: согласие — отдельное действие человека
  const [consent, setConsent] = useState(false);
  const full = need.health && need.scope === 'full';
  const [lines, setLines] = useState(null);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [lines]);

  const run = async () => {
    setBusy(true);
    markAsked();
    const out = [];
    let health = null;
    if (need.health) {
      try { health = await connectHealth({ consent: full && consent }); } catch (_) { health = { steps: 'error' }; }
      out.push(['Шаги и тренировки', healthLine(health)]);
      if (health.scope === 'full') out.push(...healthResultLines(health).filter(([title]) => title === 'Сон, пульс и вес'));
    }
    if (need.notify) {
      const p = await askNotifyPermission();
      out.push(['Уведомления', p === 'granted' ? 'Разрешены: телефон подаст сигнал, когда закончится отдых.' : 'Не разрешены. Включить можно в настройках телефона.']);
    }
    if (need.background && health && health.steps !== 'denied' && health.steps !== 'error') {
      try {
        const r = await requestBackgroundAccess();
        out.push(['Отправка в фоне', r.granted ? 'Включена: шаги уходят сами, примерно раз в 30 минут.' : 'Не разрешена. Включить можно в «Прогрессе» → «Отправлять в фоне».']);
      } catch (_) { /* старый APK — шаги уходят при открытом приложении */ }
    } else if (health && health.ok) {
      ensureBackgroundSync().catch(() => {});
    }
    setLines(out);
    setBusy(false);
  };

  return <main className="onboarding" aria-busy={busy}>
    <div className="onboarding__content">
      <h1 ref={heading} tabIndex={-1}>{lines ? 'Готово' : 'Разрешения'}</h1>
      {lines
        ? <ul className="permissions__result" role="status">
          {lines.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}
        </ul>
        : <>
          <p className="onboarding__intro">Чтобы приложение работало полностью, телефону нужно кое-что разрешить. Дальше он спросит сам — отказаться можно в каждом окне.</p>
          <ul className="permissions__list">
            {need.health && <li><strong>Шаги</strong><span>Телефон считает их сам — берём суммы по дням из {fromHub()}. Их видите вы и ваш тренер.</span></li>}
            {need.workouts && <li><strong>Тренировки</strong><span>Записанные телефоном или часами: вид, время, калории и дистанция{full ? ', с согласием — пульс' : ''}.</span></li>}
            {full && <li><strong>Сон, пульс, вес — с вашего согласия</strong><span>Сон и его фазы, пульс покоя и ВСР, вес и % жира с весов, калории за день, рост и VO2max — тренер видит восстановление и подбирает нагрузку.</span></li>}
            {need.notify && <li><strong>Уведомления</strong><span>Сигнал, когда закончился отдых между подходами, — даже с заблокированным экраном.</span></li>}
            {need.background && <li><strong>Отправка в фоне</strong><span>Шаги уходят сами, примерно раз в 30 минут, даже когда приложение закрыто.</span></li>}
          </ul>
          {full && (
            <label className="ob-consent">
              <input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
              <span>Даю <a href={HEALTH_CONSENT_URL} target="_blank" rel="noopener noreferrer">отдельное согласие на обработку данных о здоровье</a>. Без него возьмём только шаги и тренировки.</span>
            </label>
          )}
          <p className="small muted">{need.health && !full ? 'Пульс, сон и вес не читаем. ' : ''}Без разрешений приложением можно пользоваться как обычно.</p>
        </>}
    </div>
    <footer className="onboarding__footer">
      {lines
        ? <button type="button" className="button button--primary button--block" onClick={onDone}>Перейти к занятиям</button>
        : <button type="button" className="button button--primary button--block" disabled={busy} onClick={run}>{busy ? 'Спрашиваем…' : 'Продолжить'}</button>}
    </footer>
  </main>;
}

/**
 * Тот же шаг в браузере (FT-577): сайт не может читать «Здоровье» и Health
 * Connect и не ставит сигнал отдыха телефоном, поэтому вместо системных
 * окон — короткое объяснение и ссылка на приложение. Один раз на устройстве;
 * «Продолжить в браузере» — полноценный путь, ничего не закрывается.
 */
const OFFER_KEY = 'fittrack_app_offer_v1';
const STORE = { ios: 'https://apps.apple.com/ru/app/id6816619723', android: '/site/#download' };

/** Платформа, для которой показать шаг, или null — уже показан, приложение, компьютер */
export function appOffer() {
  if (isNativeApp()) return null;
  try { if (localStorage.getItem(OFFER_KEY) === '1') return null; } catch (_) { /* приватный режим */ }
  const p = detectBrowser().platform;
  return p === 'ios' || p === 'android' ? p : null;
}

export function useAppOffer() {
  const [platform] = useState(appOffer);
  return platform;
}

export function AppOffer({ platform, onDone }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const done = () => { try { localStorage.setItem(OFFER_KEY, '1'); } catch (_) {} onDone(); };
  return <main className="onboarding">
    <div className="onboarding__content">
      <h1 ref={heading} tabIndex={-1}>Шаги и уведомления — в приложении</h1>
      <p className="onboarding__intro">В браузере всё остальное работает так же, но телефон не даёт сайту доступ к шагам, тренировкам с часов и сигналу конца отдыха.</p>
      <ul className="permissions__list">
        <li><strong>Шаги и тренировки</strong><span>Приложение берёт их из {platform === 'ios' ? '«Здоровья»' : 'Health Connect'} — видно вам и тренеру.</span></li>
        <li><strong>Сигнал конца отдыха</strong><span>Телефон подаст его, даже с заблокированным экраном.</span></li>
        {platform === 'ios' && <li><strong>Apple Watch</strong><span>Подходы и отдых — на часах.</span></li>}
      </ul>
      <p className="small muted">Войдите в приложении той же почтой — программа и ответы уже там.</p>
    </div>
    <footer className="ob__footer">
      <a className="button button--primary ob__next" href={STORE[platform]} target="_blank" rel="noopener noreferrer" onClick={done}>
        {platform === 'ios' ? 'Скачать в App Store' : 'Скачать для Android'}
      </a>
    </footer>
    <button type="button" className="ob-skip" onClick={done}>Продолжить в браузере</button>
  </main>;
}
