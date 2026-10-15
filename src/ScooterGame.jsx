import React, { useEffect, useId, useRef } from 'react';
import { useScooterSession } from './ScooterSession.jsx';
import { mountScooter } from './scooter-runtime.js';
import { restHere } from './rest-here.js';
import { clock } from './workout-model.js';
import { IconBack } from './icons.jsx';
import './scooter.css';

export default function ScooterGame({ onClose, restLeft, restUntil = Infinity }) {
  const root = useRef(null);
  const session = useScooterSession();
  const deadline = useRef(restUntil);
  deadline.current = restUntil;
  const title = useId();
  useEffect(() => mountScooter(root.current, session, () => {
    const until = Math.min(deadline.current, restHere()?.until ?? Infinity);
    return Date.now() >= until;
  }), [session]);
  return <section className="scooter-game" aria-label="На самокате до зала" data-no-gestures>
    <div className="game" ref={root}>
      <header className="game-header">
        <button type="button" onClick={onClose} aria-label={restLeft == null ? 'Закрыть игру' : 'К отдыху'}><IconBack size={16} aria-hidden="true" />{restLeft == null ? 'Назад' : 'К отдыху'}</button>
        <span>{restLeft == null ? 'На самокате до зала' : `Отдых ${clock(Math.max(0, restLeft))}`}</span>
        <span className="test-label">Тест</span>
      </header>
      <div className="viewport" data-scooter="viewport">
        <canvas data-scooter="scene" aria-label="Улица с тремя полосами, препятствиями и самокатом" />
        <div className="hud">
          <div className="timer"><span>До тренировки</span><strong data-scooter="time" role="timer" aria-label="До начала тренировки">1:00</strong></div>
          <button type="button" className="icon-button" data-scooter="pause" aria-label="Пауза" disabled><span className="pause-icon" aria-hidden="true" /></button>
        </div>
        <div className="route-status"><div><span data-scooter="distance">До зала 900 м</span><span data-scooter="progress-label">0%</span></div><progress data-scooter="progress" defaultValue="0" max="900" aria-label="Путь до зала" /></div>
        <p className="toast" data-scooter="toast" role="status" aria-live="polite" />
        <div className="countdown" data-scooter="countdown" hidden aria-live="off">3</div>
        <section className="overlay" data-scooter="overlay" aria-labelledby={title}>
          <div className="overlay-body">
            <h2 id={title} data-scooter="overlay-title">Успеешь к началу?</h2>
            <p data-scooter="overlay-copy">900 метров за минуту. Объезжай прохожих и роботов: столкновение −4 сек, вода +2 сек.</p>
            <div className="result-stats" data-scooter="result-stats" hidden />
            <button type="button" className="primary" data-scooter="start">Поехали!</button>
            <button type="button" className="secondary" data-scooter="restart" hidden>Начать заново</button>
            <p className="overlay-hint" data-scooter="overlay-hint">Стрелки, свайп или наклон телефона</p>
          </div>
        </section>
        <div className="speed"><strong data-scooter="speed">0</strong><span>км/ч</span></div>
        <div className="steering" aria-label="Управление самокатом">
          <button type="button" data-scooter="left" aria-label="Влево" disabled><span className="arrow left-arrow" aria-hidden="true" /></button>
          <span data-scooter="steering-hint">Объезжай препятствия</span>
          <button type="button" data-scooter="right" aria-label="Вправо" disabled><span className="arrow" aria-hidden="true" /></button>
        </div>
      </div>
      <footer className="game-footer">
        <div className="modes" role="group" aria-label="Способ управления">
          <button type="button" data-scooter="buttons-mode" aria-pressed="true">Кнопки</button>
          <button type="button" data-scooter="tilt-mode" aria-pressed="false">Наклон телефона</button>
        </div>
        <p data-scooter="sensor-status" aria-live="polite">Свайпай или нажимай стрелки ← →</p>
      </footer>
    </div>
  </section>;
}
