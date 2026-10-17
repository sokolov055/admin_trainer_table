import React, { useEffect, useId, useRef, useState } from 'react';
import { useScooterSession } from './ScooterSession.jsx';
import { mountScooter } from './scooter-runtime.js';
import { pause, DIFFICULTIES } from './scooter-model.js';
import { restHere } from './rest-here.js';
import { plugin } from './native-bridge.js';
import './scooter.css';

export default function ScooterGame({ onClose, restLeft, restUntil = Infinity, immersive = false }) {
  const root = useRef(null), session = useScooterSession(), deadline = useRef(restUntil);
  deadline.current = restUntil;
  const title = useId(), [panel, setPanel] = useState(null), [, refresh] = useState(0);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [accept, setAccept] = useState(false);
  const [boardMode, setBoardMode] = useState(session.game.difficulty);
  const requestId = useRef(0);
  useEffect(() => session.subscribe(() => refresh(value => value + 1)), [session]);
  useEffect(() => {
    if (session.profile !== null) return;
    session.leaderboard().catch(err => {
      console.warn('Не удалось открыть рейтинг:', err);
      session.rankStatus = 'Рейтинг недоступен. Можно играть без него или повторить загрузку в меню рейтинга.';
      session.notify();
    });
  }, [session]);
  useEffect(() => mountScooter(root.current, session, () => {
    const until = Math.min(deadline.current, restHere()?.until ?? Infinity);
    return Date.now() >= until;
  }), [session]);
  useEffect(() => {
    const bar = plugin('StatusBar');
    let active = true;
    // Этот плагин уже входит в обе оболочки. Позднее hide не должно пережить выход.
    if (bar?.hide) bar.hide().then(() => { if (!active) bar.show?.().catch(() => {}); }).catch(() => {});
    return () => { active = false; bar?.show?.().catch(() => {}); };
  }, []);
  const request = async fn => { const id = ++requestId.current; setError(''); setLoading(true); try { await fn(); } catch (err) {
    console.warn('Игровой рейтинг:', err); if (id === requestId.current) setError(err.message || 'Не удалось загрузить рейтинг. Попробуй ещё раз.');
  } finally { if (id === requestId.current) setLoading(false); } };
  const openBoard = () => { pause(session.game); setPanel('board'); request(() => session.leaderboard(boardMode)); };
  return <section className={'scooter-game' + (immersive ? ' scooter-game--immersive' : '')} aria-label="На самокате до зала" role={immersive ? 'dialog' : undefined} aria-modal={immersive || undefined} data-no-gestures>
    <div className="game" ref={root}>
      <div className="viewport" data-scooter="viewport">
        <canvas data-scooter="scene" aria-label="Бесконечная городская трасса с тремя полосами" />
        <div className="hud">
          <div className="distance-counter"><strong data-scooter="distance">0</strong><span data-scooter="distance-unit">метров</span></div>
          <div className="ride-stats"><span><b data-scooter="time">0:00</b> в пути</span><span><b data-scooter="speed">0</b> км/ч</span></div>
          <button type="button" className="icon-button" data-scooter="pause" aria-label="Меню игры"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" /></svg></button>
        </div>
        <div className="combo" data-scooter="combo" hidden />
        <div className="crossing-warning" data-scooter="crossing-warning" hidden>Впереди дорога · смотри по сторонам</div>
        <p className="toast" data-scooter="toast" role="status" aria-live="polite" />
        <div className="countdown" data-scooter="countdown" hidden aria-live="off">3</div>
        <section className="overlay" data-scooter="overlay" aria-labelledby={title}>
          <div className="overlay-body">
            <h2 id={title} data-scooter="overlay-title">На самокате<br/>до зала</h2>
            <p data-scooter="overlay-copy">Город не заканчивается. Проедь дальше всех. Одно столкновение — конец заезда.</p>
            <div className="difficulty-picker" data-scooter="difficulty-picker" role="group" aria-label="Сложность заезда">
              {Object.entries(DIFFICULTIES).map(([key, config]) => <button type="button" key={key} data-difficulty={key} aria-pressed={session.game.difficulty === key}>{config.name}<small>{key === 'easy' ? 'Легко' : key === 'medium' ? 'Тяжело' : 'Почти невозможно'}</small></button>)}
            </div>
            <div className="result-stats" data-scooter="result-stats" hidden />
            <button type="button" className="primary" data-scooter="start">В путь</button>
            <button type="button" className="secondary" data-scooter="restart" hidden>Новый заезд</button>
            <p className="rank-status" role="status">{session.loading ? 'Готовим трассу…' : session.rankStatus}</p>
            {session.rankStatus.includes('Сохранить ещё раз') && <button className="secondary" type="button" onClick={() => session.finish()}>Сохранить ещё раз</button>}
            <div className="menu-links"><button type="button" onClick={openBoard}>Рейтинг игроков</button><button type="button" onClick={() => { pause(session.game); setPanel('settings'); }}>Управление</button>
              <button type="button" onClick={onClose}>{restLeft == null ? 'Свернуть игру' : 'К отдыху'}</button></div>
          </div>
        </section>
        <button type="button" className="nitro-button" data-scooter="nitro" aria-label="Включить нитро, зарядов 0" disabled>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 1 5.8 13h5.1L9.8 23 18.5 9.7h-5.1L14.2 1Z" /></svg>
          <span>Нитро</span><b data-scooter="nitro-count">0</b>
        </button>
        <div className="steering" data-scooter="steering" aria-label="Управление самокатом">
          <button type="button" data-scooter="left" aria-label="Влево" disabled><span className="arrow left-arrow" aria-hidden="true" /></button>
          <button type="button" data-scooter="right" aria-label="Вправо" disabled><span className="arrow" aria-hidden="true" /></button>
        </div>
        <section className="settings-panel" data-scooter="settings" hidden={panel !== 'settings'} aria-label="Настройки управления">
          <h2>Управление</h2><p>Свайпай по дороге, нажимай стрелки или наклоняй телефон.</p>
          <div className="modes" role="group" aria-label="Способ управления">
            <button type="button" data-scooter="buttons-mode" aria-pressed="true">Кнопки</button>
            <button type="button" data-scooter="tilt-mode" aria-pressed="false">Наклон телефона</button>
          </div>
          <p data-scooter="sensor-status" aria-live="polite">Свайпай или нажимай стрелки ← →</p>
          <label className="voice-choice"><input type="checkbox" checked={session.voice} onChange={e => { session.voice = e.target.checked; session.notify(); }} />Озвучивать реплики персонажей</label>
          <p>Текстовые реплики видны всегда. Для голоса используется установленный русский голос телефона.</p>
          <button type="button" className="primary" onClick={() => setPanel(null)}>К игре</button>
        </section>
      </div>
    </div>
    {panel === 'board' && <section className="leaderboard-panel" aria-label="Рейтинг игроков">
      <div className="board-heading"><h2>Рейтинг</h2><button type="button" className="secondary" onClick={() => setPanel(null)}>К игре</button></div>
      <p>Кто проехал дальше — тот выше. При равной дистанции первым остаётся более ранний рекорд.</p>
      <div className="modes" aria-label="Сложность рейтинга">{Object.entries(DIFFICULTIES).map(([key, config]) => <button key={key} type="button" aria-pressed={boardMode === key} onClick={() => { setBoardMode(key); request(() => session.leaderboard(key)); }}>{config.name}</button>)}</div>
      {loading && <p role="status">Загружаем…</p>}{error && <p role="alert">{error}</p>}
      {session.profile?.enabled ? <><p>Твой псевдоним: <b>{session.profile.alias}</b></p>
        <button className="text-button" type="button" disabled={loading} onClick={() => request(async () => { await session.withdraw(); setAccept(false); })}>Выйти из рейтинга и удалить рекорды</button></> :
        <div className="rank-join"><p>Участие по желанию. В таблице видны только псевдоним, дистанция и время. Имя клиента скрыто.</p>
          <label><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} /><span>Я согласен на <a href="https://app.fitness100.ru/game-consent.html" target="_blank" rel="noreferrer">обработку игровых результатов</a> для рейтинга.</span></label>
          <button className="primary" type="button" disabled={!accept || loading} onClick={() => request(async () => { await session.join(); await session.leaderboard(boardMode); })}>Участвовать в рейтинге</button></div>}
      {!loading && !error && (session.board.length ? <ol className="leaderboard-list">{session.board.map((entry, i) => <li key={entry.alias} className={entry.mine ? 'mine' : ''}><b>{i + 1}</b><span>{entry.alias}{entry.mine ? ' · ты' : ''}<small>{Math.floor(entry.elapsed)} сек</small></span><strong>{entry.distance.toLocaleString('ru-RU')} м</strong></li>)}</ol> : <p>Здесь пока нет рекордов. Начни первый заезд.</p>)}
      {error && <button className="secondary" type="button" disabled={loading} onClick={() => request(() => session.leaderboard(boardMode))}>Повторить загрузку</button>}
    </section>}
  </section>;
}
