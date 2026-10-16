import React, { useEffect, useId, useRef } from 'react';
import { useScooterSession } from './ScooterSession.jsx';
import { mountScooter } from './scooter-runtime.js';
import { restHere } from './rest-here.js';
import { clock } from './workout-model.js';
import { IconBack } from './icons.jsx';
import './scooter.css';

export default function ScooterGame({ onClose, restLeft, restUntil = Infinity, immersive = false }) {
  const root = useRef(null);
  const session = useScooterSession();
  const deadline = useRef(restUntil);
  deadline.current = restUntil;
  const title = useId();
  useEffect(() => mountScooter(root.current, session, () => {
    const until = Math.min(deadline.current, restHere()?.until ?? Infinity);
    return Date.now() >= until;
  }), [session]);
  return <section className={'scooter-game' + (immersive ? ' scooter-game--immersive' : '')} aria-label="На самокате до зала" role={immersive ? 'dialog' : undefined} aria-modal={immersive || undefined} data-no-gestures>
    <div className="game" ref={root}>
      <header className="game-header">
        <button type="button" onClick={onClose} aria-label={restLeft == null ? 'Свернуть игру' : 'К отдыху'}><IconBack size={17} aria-hidden="true" />{restLeft == null ? 'Свернуть' : 'К отдыху'}</button>
        <span>{restLeft == null ? 'Дорога до зала' : `Отдых ${clock(Math.max(0, restLeft))}`}</span>
        <span className="test-label">Тест</span>
      </header>
      <div className="viewport" data-scooter="viewport">
        <canvas data-scooter="scene" aria-label="Улица с тремя полосами, препятствиями и самокатом" />
        <div className="hud">
          <div className="timer"><span>До старта</span><strong data-scooter="time" role="timer" aria-label="До начала тренировки">1:00</strong></div>
          <div className="ride-stats" aria-label="Результат поездки">
            <span><b data-scooter="score">0</b> очков</span>
            <span><b data-scooter="speed">0</b> км/ч</span>
          </div>
          <button type="button" className="icon-button" data-scooter="pause" aria-label="Пауза" disabled><span className="pause-icon" aria-hidden="true" /></button>
        </div>
        <div className="route-status"><div><span data-scooter="distance">Зал через 900 м</span><span data-scooter="progress-label">0%</span></div><progress data-scooter="progress" defaultValue="0" max="900" aria-label="Путь до зала" /></div>
        <div className="combo" data-scooter="combo" hidden>Серия 0</div>
        <p className="toast" data-scooter="toast" role="status" aria-live="polite" />
        <div className="countdown" data-scooter="countdown" hidden aria-live="off">3</div>
        <section className="overlay" data-scooter="overlay" aria-labelledby={title}>
          <div className="overlay-body">
            <span className="overlay-kicker">60 секунд · 900 метров</span>
            <h2 id={title} data-scooter="overlay-title">Рывок до зала</h2>
            <p data-scooter="overlay-copy">Скорость растёт по дороге. Собирай воду и предтрен: заряд появится на кнопке нитро. Столкновение −4 сек.</p>
            <div className="result-stats" data-scooter="result-stats" hidden />
            <button type="button" className="primary" data-scooter="start">В путь</button>
            <button type="button" className="secondary" data-scooter="restart" hidden>Начать заново</button>
            <p className="overlay-hint" data-scooter="overlay-hint">Стрелки, свайп или наклон телефона</p>
          </div>
        </section>
        <button type="button" className="nitro-button" data-scooter="nitro" aria-label="Включить нитро, зарядов 0" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 1 5.8 13h5.1L9.8 23 18.5 9.7h-5.1L14.2 1Z" /></svg>
          <span>Нитро</span><b data-scooter="nitro-count">0</b>
        </button>
        <div className="steering" aria-label="Управление самокатом">
          <button type="button" data-scooter="left" aria-label="Влево" disabled><span className="arrow left-arrow" aria-hidden="true" /></button>
          <span data-scooter="steering-hint">Выбери свободную полосу</span>
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
