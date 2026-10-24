import React, { useRef, useState } from 'react';
import { useData } from '../useData.js';
import { IconWatch } from '../icons.jsx';
import { formatNumber, formatTime } from '../ui.jsx';
import { requestQuick } from '../quick-actions.js';
import './watch-suggest.css';

/**
 * «Записать подходы?» на «Обзоре» клиента (пункт 12 плана трёх разборов,
 * 21.10.2026; в ONLYFITS — «Обнаружена активность»).
 *
 * Тренировки с часов приходят в «Прогресс» и засчитываются в цели с
 * 02.10.2026, но без занятия в приложении программа не двигается, а тренер
 * не видит, что делали. Показывать ли карточку, решает сервер
 * (health.workouts.suggest): сегодня силовая с часов, занятие в приложении
 * с ней не совместилось, в программе есть тренировка на сегодня. Здесь —
 * только «Не сейчас»: на этом устройстве и для этой тренировки часов.
 *
 * Только в своём кабинете: у тренера в карточке клиента — список в «Прогрессе».
 */
const HIDDEN_KEY = 'fittrack.watchSuggest.hidden';

function hiddenIds() {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}

function rememberHidden(id) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([id, ...hiddenIds().filter((x) => x !== id)].slice(0, 20))); } catch (_) {}
}

const KIND = {
  functionalStrengthTraining: 'Функциональная тренировка',
  bootCamp: 'Функциональная тренировка',
  coreTraining: 'Тренировка кора',
  calisthenics: 'Калистеника',
};

/** «1 ч», «48 мин», «1 ч 15 мин» */
function length(seconds) {
  const m = Math.round((Number(seconds) || 0) / 60);
  if (m < 60) return m + ' мин';
  return Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '');
}

// trainer — у клиента есть тренер: ему и пишем, что тренер увидит
export default function WatchSuggest({ trainer = true, onOpen }) {
  const { data, stale } = useData('health.workouts.suggest', {}, []);
  const [hidden, setHidden] = useState(hiddenIds);
  // Вчерашний ответ из кэша при запуске не показываем — только свежий.
  // Дальше перечитывание после записи (useData) карточку не мигает
  const fresh = useRef(false);
  if (data && !stale) fresh.current = true;
  const s = fresh.current && data ? data.suggestion : null;
  if (!s || !s.workout || !s.block || hidden.includes(s.workout.id)) return null;

  const w = s.workout;
  const title = s.block.title;
  const facts = [length(w.duration), w.kcal ? formatNumber(Math.round(w.kcal)) + ' ккал' : ''].filter(Boolean);
  const later = () => { rememberHidden(w.id); setHidden((list) => [...list, w.id]); };
  const record = () => {
    // Та же просьба, что у «Начать занятие» из «+» (quick-actions.js), но с
    // началом по часам: «Тренировки» заберут её, когда откроются и загрузят
    // программу (обработчик 'workout' в Plan, screens.jsx)
    requestQuick('workout', { blockId: s.block.id, title, startedAt: w.startedAt });
    onOpen('plan');
  };

  return (
    <section className="watch-suggest" aria-label="Тренировка с часов">
      <div className="watch-suggest__head">
        <span className="watch-suggest__icon"><IconWatch size={24} /></span>
        <div className="watch-suggest__what">
          <p className="watch-suggest__eyebrow">С часов · сегодня · в приложении не отмечено</p>
          <p className="watch-suggest__title">
            {(KIND[w.type] || 'Силовая тренировка') + ' ' + formatTime(w.startedAt) + '–' + formatTime(w.endedAt)}
          </p>
          <p className="watch-suggest__facts">{facts.join(' · ')}</p>
        </div>
      </div>
      <p className="watch-suggest__text">
        {`Следующая по программе — «${title}». Запишите подходы — ${trainer ? 'тренер увидит, что вы делали, а веса' : 'веса'} на следующий раз подстроятся.`}
      </p>
      <div className="watch-suggest__actions">
        <button className="button button--primary button--block" onClick={record}>{`Записать подходы к «${title}»`}</button>
        <button className="button button--block" onClick={later}>Не сейчас</button>
      </div>
    </section>
  );
}
