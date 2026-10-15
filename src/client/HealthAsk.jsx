import React, { useEffect, useRef, useState } from 'react';
import { isNativeApp, iosApp } from '../native-bridge.js';
import { stepsAvailability, stepsOn, connectHealth, healthHub, onIphone } from '../native-steps.js';
import { ensureBackgroundSync } from '../native-sync.js';
import './onboarding.css';
import './first-steps.css';

/**
 * Шаги и тренировки с часов — последний шаг анкеты (FT-510).
 *
 * Перед системным окном — свой экран: что возьмём, зачем и что не берём
 * (App Store 5.1.1, решение владельца 10.10.2026). «Не сейчас» ничего не
 * закрывает, подключить можно позже в «Прогрессе». Просим только шаги и
 * тренировки — не пульс, сон или вес. Согласие на них (редакция
 * 2026-10-02) человек уже подтвердил при входе: без него анкета не
 * открывается.
 *
 * iPhone: перед окном Apple только «Продолжить», без «Не сейчас» — App
 * Review (5.1.1(iv)) отклоняет экраны перед запросом разрешения с кнопкой
 * выхода и с «Разрешить» на своей кнопке. Отказаться можно в самом окне
 * «Здоровья». На Android — «Разрешить» и «Не сейчас», как решил владелец.
 *
 * После окна — честный итог. iPhone не говорит, выдан ли доступ: пустой
 * ответ там — «записей нет или доступ не включён», а не «готово».
 */

/** Нужен ли этот шаг: приложение, источник есть, шаги ещё не подключены */
export function useHealthAsk() {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    if (!isNativeApp() || stepsOn()) return undefined;
    let alive = true;
    stepsAvailability().then((a) => { if (alive) setNeeded(!!a.available); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return needed;
}

/** «из «Здоровья»», «из Health Connect» */
const fromHub = () => (healthHub() === '«Здоровье»' ? '«Здоровья»' : healthHub());

function outcome(r) {
  const hub = fromHub();
  if (r.steps === 'ok' || r.workouts === 'ok') {
    return r.steps === 'ok' && r.workouts === 'ok' ? 'Готово: шаги и тренировки пришли. Их видно в «Прогрессе».'
      : r.steps === 'ok' ? 'Готово: шаги пришли. Их видно в «Прогрессе».'
        : 'Готово: тренировки с часов пришли. Их видно в «Прогрессе».';
  }
  if (r.steps === 'error' || r.workouts === 'error') return `Не получилось прочитать данные из ${hub}. Попробуйте позже в «Прогрессе» — кнопка «Подключить шаги».`;
  if (r.steps === 'denied') return `Доступ не выдан. Включить его можно позже: «Прогресс» → «Подключить шаги» или настройки ${hub}.`;
  return onIphone()
    ? 'Записей за месяц нет — или в «Здоровье» не включён доступ для Fit Track. Проверить можно в «Прогрессе».'
    : 'Записей пока нет. Как только телефон или часы их запишут, они появятся в «Прогрессе».';
}

export default function HealthAsk({ onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [result]);
  const allow = async () => {
    setBusy(true);
    try {
      const r = await connectHealth();
      // Android: фоновая отправка, как после кнопок в «Прогрессе»
      if (r.ok) ensureBackgroundSync().catch(() => {});
      setResult(outcome(r));
    } catch (_) {
      setResult(outcome({ steps: 'error' }));
    } finally {
      setBusy(false);
    }
  };

  return <main className="onboarding" aria-busy={busy}>
    <div className="onboarding__content">
      <h1 ref={heading} tabIndex={-1}>{result ? 'Шаги и тренировки' : 'Шаги и тренировки с часов'}</h1>
      {result
        ? <p className="onboarding__intro" role="status">{result}</p>
        : <>
          <p className="onboarding__intro">
            Fit Track возьмёт из {fromHub()} шаги и тренировки, которые записали телефон и часы, — за последний месяц и дальше.
            Так в «Прогрессе» видна вся ваша активность, а не только занятия в приложении.
          </p>
          <ul className="health-ask__list">
            <li>Шаги по дням.</li>
            <li>Тренировки: вид, время, калории и дистанция.</li>
            <li>Пульс, сон и вес не читаем.</li>
          </ul>
          <p className="small muted">{iosApp()
            ? 'Дальше iPhone спросит, что разрешить, — можно отказаться прямо в его окне. Без этого приложением можно пользоваться как обычно.'
            : 'Отключить можно в «Прогрессе» или в настройках телефона. Без этого приложением можно пользоваться как обычно.'}</p>
        </>}
    </div>
    <footer className="onboarding__footer health-ask__footer">
      {result
        ? <button type="button" className="button button--primary button--block" onClick={onDone}>Перейти к занятиям</button>
        : <>
          <button type="button" className="button button--primary button--block" disabled={busy} onClick={allow}>{busy ? 'Подключаем…' : iosApp() ? 'Продолжить' : 'Разрешить'}</button>
          {!iosApp() && <button type="button" className="button button--ghost button--block" disabled={busy} onClick={onDone}>Не сейчас</button>}
        </>}
    </footer>
  </main>;
}
