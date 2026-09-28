import React, { useEffect, useState } from 'react';
import { useData } from '../useData.js';
import { Section, Panel, Badge, formatNumber, formatTime } from '../ui.jsx';
import { isNativeApp } from '../native-bridge.js';
import { connectWorkouts, syncWorkouts, workoutsOn, workoutsAvailable, openHealthSettings, WORKOUTS_SENT } from '../native-steps.js';

/**
 * Тренировки с часов — в «Моих тренировках» владельца, рядом с шагами.
 *
 * Телефон отдаёт тренировки из «Здоровья» (native-steps.js), сервер
 * совмещает их с занятиями в приложении: пересеклись по времени — одна
 * тренировка. Часы включили позже, в приложении забыли закрыть занятие —
 * сервер это учитывает и пишет словами (health-workouts.js).
 *
 * Пока только iPhone и только владелец: клиентам — после юридической
 * проверки, Android — после новой сборки приложения.
 */
const DAYS = 30;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const TYPES = {
  running: 'Бег', runningTreadmill: 'Бег на дорожке', walking: 'Ходьба', hiking: 'Поход',
  cycling: 'Велосипед', bikingStationary: 'Велотренажёр',
  traditionalStrengthTraining: 'Силовая', functionalStrengthTraining: 'Функциональная',
  strengthTraining: 'Силовая', weightlifting: 'Силовая', coreTraining: 'Кор',
  highIntensityIntervalTraining: 'ВИИТ', crossTraining: 'Кросс-тренинг', mixedCardio: 'Кардио',
  yoga: 'Йога', pilates: 'Пилатес', flexibility: 'Растяжка', stretching: 'Растяжка', cooldown: 'Заминка',
  swimming: 'Плавание', swimmingPool: 'Плавание', swimmingOpenWater: 'Плавание',
  elliptical: 'Эллипс', rowing: 'Гребля', rowingMachine: 'Гребной тренажёр',
  stairClimbing: 'Степпер', stairs: 'Лестница', jumpRope: 'Скакалка',
  boxing: 'Бокс', kickboxing: 'Кикбоксинг', martialArts: 'Единоборства',
  dance: 'Танцы', cardioDance: 'Танцы', tennis: 'Теннис', soccer: 'Футбол', basketball: 'Баскетбол',
};

export function workoutLabel(type) {
  return TYPES[type] || 'Тренировка';
}

/** «27 сентября, 19:12» */
function when(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ', ' + formatTime(iso);
}

function facts(w) {
  const out = [Math.round(w.duration / 60) + ' мин'];
  if (w.kcal) out.push(formatNumber(Math.round(w.kcal)) + ' ккал');
  if (w.distance) out.push(formatNumber(w.distance / 1000, 1) + ' км');
  if (w.source) out.push(w.source);
  return out.join(' · ');
}

export default function HealthWorkouts({ clientRow }) {
  const phone = isNativeApp() && workoutsAvailable();
  const { loading, data, error, reload } = useData('health.workouts.list', { clientRow, days: DAYS }, [clientRow]);
  const [on, setOn] = useState(workoutsOn());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const again = () => reload();
    window.addEventListener(WORKOUTS_SENT, again);
    return () => window.removeEventListener(WORKOUTS_SENT, again);
  }, []);

  // Дополнение к прогрессу: старый сервер или нет связи — блока просто нет
  if (loading || error || !data) return null;
  const list = data.workouts || [];

  const connect = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = on ? await syncWorkouts(true) : await connectWorkouts();
      if (res.ok === false) setMessage(res.reason);
      else {
        setOn(true);
        if (res.sent) { setMessage('Готово: телефон передал тренировок — ' + res.sent + '.'); reload(); }
        else if (res.reason === 'empty') setMessage('За месяц тренировок нет — или в «Здоровье» не включён доступ к тренировкам для Fit Track.');
        else setMessage('Телефону пока нечего передать.');
      }
    } catch (e) {
      setMessage('Не получилось: ' + (e.message || 'ошибка связи') + '.');
    } finally {
      setBusy(false);
    }
  };

  if (!list.length) {
    if (!phone) return null;
    return (
      <Section title="Тренировки с часов">
        <Panel pad>
          <p className="steps__lead">
            {on ? 'Тренировки пока не пришли.' : 'Тренировки из «Здоровья» — рядом с занятиями из приложения.'}
          </p>
          <p className="small muted">
            {on
              ? 'Если на часах тренировки были, включите доступ: «Здоровье» → ваш профиль → «Приложения» → Fit Track → «Тренировки».'
              : 'Приложение читает тренировки с Apple Watch и iPhone: вид, время, калории и дистанцию. Совпала с занятием в приложении — покажем их как одну тренировку.'}
          </p>
          <div className="survey__actions">
            <button className="button button--primary" onClick={connect} disabled={busy}>
              {busy ? 'Проверяем…' : on ? 'Проверить ещё раз' : 'Подключить тренировки'}
            </button>
            {on && <button className="button" onClick={() => openHealthSettings().catch(() => {})}>Открыть «Здоровье»</button>}
          </div>
          {message && <p className="small" role="status" style={{ marginBottom: 0 }}>{message}</p>}
        </Panel>
      </Section>
    );
  }

  const merged = list.filter((w) => w.session).length;
  return (
    <Section
      title="Тренировки с часов"
      note={'за месяц: ' + list.length + (merged ? ', совмещено с приложением — ' + merged : '')}
    >
      <Panel>
        <ul className="hw">
          {list.map((w) => (
            <li key={w.id} className="hw__item">
              <div className="hw__head">
                <span className="hw__title">{workoutLabel(w.type)}</span>
                <span className="small muted">{when(w.startedAt)}</span>
              </div>
              <div className="small muted">{facts(w)}</div>
              {w.session && (
                <div className="hw__merged">
                  <Badge kind="good">{'Совмещено с «' + w.session.title + '»'}</Badge>
                  <span className="small">{' всего ' + w.session.minutes + ' мин'}</span>
                  {w.session.notes && w.session.notes.length > 0 && (
                    <div className="small muted">{w.session.notes.join('; ')}</div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {phone && (
          <div className="hw__foot">
            <button className="button" onClick={connect} disabled={busy}>{busy ? 'Проверяем…' : 'Обновить'}</button>
            {message && <span className="small" role="status">{message}</span>}
          </div>
        )}
      </Panel>
    </Section>
  );
}
