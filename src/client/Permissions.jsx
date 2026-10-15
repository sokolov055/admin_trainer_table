import React, { useEffect, useRef, useState } from 'react';
import { isNativeApp } from '../native-bridge.js';
import { stepsAvailability, stepsOn, connectHealth, healthHub, onIphone, workoutsAvailable } from '../native-steps.js';
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
 * Connect; тренировки — те, что записали телефон или часы. Пульс, сон и вес
 * не просим. Согласие на шаги и тренировки (редакция 2026-10-02) человек уже
 * подтвердил при регистрации.
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
  const notify = (await notifyPermission()) === 'prompt';
  const bgStatus = !onIphone() && backgroundSyncAvailable() ? await backgroundSyncStatus() : null;
  const background = !!(bgStatus && bgStatus.supported && !bgStatus.background);
  return { health, workouts: health && workoutsAvailable(), notify, background: background && health };
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
  const [lines, setLines] = useState(null);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [lines]);

  const run = async () => {
    setBusy(true);
    markAsked();
    const out = [];
    let health = null;
    if (need.health) {
      try { health = await connectHealth(); } catch (_) { health = { steps: 'error' }; }
      out.push(['Шаги и тренировки', healthLine(health)]);
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
            {need.workouts && <li><strong>Тренировки</strong><span>Записанные телефоном или часами: вид, время, калории и дистанция.</span></li>}
            {need.notify && <li><strong>Уведомления</strong><span>Сигнал, когда закончился отдых между подходами, — даже с заблокированным экраном.</span></li>}
            {need.background && <li><strong>Отправка в фоне</strong><span>Шаги уходят сами, примерно раз в 30 минут, даже когда приложение закрыто.</span></li>}
          </ul>
          <p className="small muted">{need.health ? 'Пульс, сон и вес не читаем. ' : ''}Без разрешений приложением можно пользоваться как обычно.</p>
        </>}
    </div>
    <footer className="onboarding__footer">
      {lines
        ? <button type="button" className="button button--primary button--block" onClick={onDone}>Перейти к занятиям</button>
        : <button type="button" className="button button--primary button--block" disabled={busy} onClick={run}>{busy ? 'Спрашиваем…' : 'Продолжить'}</button>}
    </footer>
  </main>;
}
