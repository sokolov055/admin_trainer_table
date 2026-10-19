import React, { useCallback, useState } from 'react';
import { coins, goalText, itemEffect, ITEMS } from './career-model.js';
import { useCareer } from './CareerSession.jsx';
import { buzz } from './game-feel.js';
import './career.css';

/**
 * Задание карьеры внутри игры (FT-563). Игра сообщает результат попытки,
 * здесь он засчитывается и превращается в подпись: что нужно и что вышло.
 */
export function useMission(game, enabled = true) {
  const career = useCareer();
  const mission = enabled && career?.mission?.game === game ? career.mission : null;
  const [outcome, setOutcome] = useState(null);
  const report = useCallback(result => {
    if (!mission) return;
    const before = career.state.done[game];
    const { met, earned } = career.record(game, result);
    if (earned) buzz('great');
    setOutcome({ met, earned, before, at: Date.now() });
  }, [career, mission, game]);
  return { mission, outcome, report };
}


/** Подпись задания: цель, взятый бонус, а после попытки — итог. */
export function MissionNote({ game, mission, outcome, className = '' }) {
  if (!mission) return null;
  const item = Object.values(ITEMS).find(i => i.game === game);
  return <div className={'career-note ' + (outcome ? (outcome.met ? 'is-met' : 'is-missed') : '') + ' ' + className} role="status">
    <span>{outcome ? (outcome.met ? (outcome.earned ? 'Задание выполнено' : 'Задание уже выполнено') : outcome.before ? 'Задание выполнено раньше · сейчас не вышло' : 'Пока не вышло') : 'Задание карьеры'}</span>
    <strong>{goalText(game, mission.goal, mission.boost)}</strong>
    {outcome?.earned > 0 && <b>Зарплата +{coins(outcome.earned)}</b>}
    {!outcome && mission.boost && item && <small>{item.name}: {itemEffect(item)}</small>}
  </div>;
}
