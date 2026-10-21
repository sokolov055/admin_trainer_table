import React, { useRef, useState } from 'react';
import { CAREER, GAMES, ITEMS, coins, goalText, itemEffect, priceOf, rankComplete, rankOf } from './career-model.js';
import { useCareer } from './CareerSession.jsx';
import { useGameChrome, buzz } from './game-feel.js';
import { IconPlankGame, IconScooterGame, IconMatchGame, IconBliniGame } from './game-icons.jsx';
import GameProgressCard from './GameProgressCard.jsx';
import './career.css';

const GAME = {
  scooter: { name: 'На самокате до зала', Icon: IconScooterGame, item: 'energy' },
  plank: { name: 'Тренер в планке', Icon: IconPlankGame, item: 'cheat' },
  match: { name: 'Три в ряд', Icon: IconMatchGame, item: 'protein' },
  blini: { name: 'Блины', Icon: IconBliniGame, item: 'belt' },
};

function Coin() {
  return <svg className="career-coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9 7.5h4.2a2.6 2.6 0 0 1 0 5.2H9m0-5.2v9m-1.5-3.3h5" /></svg>;
}

/**
 * «Карьера в фитнесе» (FT-563): десять ступеней от турника во дворе до своей
 * сети клубов. На ступени — задание в каждой игре; все выполнены — повышение.
 */
export default function CareerHub({ onClose, onPlay }) {
  const root = useRef(null);
  useGameChrome(root);
  const career = useCareer();
  const { state } = career;
  const rank = rankOf(state);
  const [boost, setBoost] = useState({});
  const [promoted, setPromoted] = useState(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const complete = rankComplete(state);

  const play = game => {
    const item = GAME[game].item;
    buzz('tap');
    career.launch(game, rank[game], boost[game] && state.items[item] > 0 ? item : null);
    setBoost(b => ({ ...b, [game]: false }));
    onPlay(game);
  };
  const getPromotion = () => {
    const before = state.rank;
    const { bonus } = career.promote();
    buzz('great');
    setPromoted({ from: CAREER[before], to: CAREER[Math.min(before + 1, CAREER.length - 1)], bonus, last: before === CAREER.length - 1 });
  };

  return <section className="career" ref={root} aria-label="Карьера в фитнесе" data-no-gestures>
    <header className="career-top">
      <button type="button" className="career-icon" onClick={onClose} aria-label="Свернуть карьеру"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      <div className="career-wallet" aria-label={'Заработано: ' + coins(state.coins)}><Coin /><strong>{state.coins.toLocaleString('ru-RU')}</strong></div>
    </header>

    <div className="career-scroll">
      <div className="career-hero">
        <span className="career-step">Ступень {state.rank + 1} из {CAREER.length}</span>
        <h2>{state.finished ? 'Собственник сети' : rank.title}</h2>
        <p className="career-place">{rank.place}</p>
        <p className="career-story">{state.finished ? 'Путь пройден: от турника во дворе до собственной сети клубов. Можно играть в любые игры просто так — или начать карьеру заново.' : rank.story}</p>
        <ol className="career-ladder" aria-label="Карьерная лестница">
          {CAREER.map((r, i) => <li key={r.title} className={i < state.rank || state.finished ? 'is-done' : i === state.rank ? 'is-current' : ''} aria-current={i === state.rank ? 'step' : undefined}><span className="career-sr">{r.title}</span></li>)}
        </ol>
        <p className="career-next">{state.rank < CAREER.length - 1 ? <>Дальше: <b>{CAREER[state.rank + 1].title}</b></> : state.finished ? 'Карьера пройдена' : 'Последняя ступень'}</p>
      </div>

      {!state.finished && <>
        <h3 className="career-heading">Задания ступени</h3>
        <ul className="career-missions">
          {GAMES.map(game => {
            const { name, Icon, item } = GAME[game], done = state.done[game], owned = state.items[item];
            return <li key={game} className={'career-mission' + (done ? ' is-done' : '')}>
              <Icon size={56} />
              <div className="career-mission__text">
                <strong>{name}</strong>
                <span>{goalText(game, rank[game])}</span>
                <small>{done ? 'Выполнено' : `Зарплата +${coins(rank.salary)}`}</small>
                {!done && owned > 0 && <label className="career-boost"><input type="checkbox" checked={!!boost[game]} onChange={e => setBoost(b => ({ ...b, [game]: e.target.checked }))} />{ITEMS[item].name} ({owned}): {itemEffect(ITEMS[item])}</label>}
              </div>
              <button type="button" className={done ? 'career-again' : 'career-play'} onClick={() => play(game)}>{done ? 'Ещё раз' : 'Играть'}</button>
            </li>;
          })}
        </ul>
        {complete && <button type="button" className="career-promote" onClick={getPromotion}>Получить повышение · +{coins(rank.salary * 2)}</button>}
      </>}

      {/* Бонусы действуют только в заданиях — после финала их некуда взять */}
      {!state.finished && <>
        <h3 className="career-heading">Бонусы</h3>
        <p className="career-hint">Бонус берётся перед заданием и действует, пока ты не вернёшься в карьеру. Цена растёт вместе с должностью.</p>
        <ul className="career-shop">
          {Object.entries(ITEMS).map(([id, item]) => {
            const price = priceOf(state, id);
            return <li key={id}>
              <div><strong>{item.name}</strong><span>{item.effect}</span><small>{GAME[item.game].name} · есть {state.items[id]}</small></div>
              <button type="button" disabled={state.coins < price} onClick={() => { if (career.buy(id).ok) buzz('good'); }} aria-label={`Купить ${item.name} за ${coins(price)}`}><Coin />{coins(price)}</button>
            </li>;
          })}
        </ul>
      </>}
      {(state.finished || state.rank > 0) && <div className="career-restart">
        {confirmRestart ? <><p>Начать с первой ступени? Заработок и бонусы сбросятся.</p><button type="button" onClick={() => { career.restart(); setConfirmRestart(false); }}>Начать заново</button><button type="button" onClick={() => setConfirmRestart(false)}>Оставить</button></>
          : <button type="button" className="career-text" onClick={() => setConfirmRestart(true)}>Начать карьеру заново</button>}
      </div>}
      <GameProgressCard className="career-save" />
    </div>

    {promoted && <div className="career-overlay" role="dialog" aria-modal="true" aria-labelledby="career-promoted">
      <div className="career-panel">
        <div className="career-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--x': `${(i * 29 + 7) % 100}%`, '--d': `${i * 40}ms`, '--r': `${i * 53}deg` }} />)}</div>
        <span className="career-step">{promoted.last ? 'Карьера пройдена' : 'Повышение'}</span>
        <h2 id="career-promoted">{promoted.last ? 'Своя сеть клубов!' : promoted.to.title}</h2>
        <p>{promoted.last ? 'Путь пройден: от турника во дворе до своей сети клубов. Это было мощно!' : promoted.to.story}</p>
        <p className="career-bonus"><Coin />Премия +{coins(promoted.bonus)}</p>
        <button type="button" className="career-play" autoFocus onClick={() => setPromoted(null)}>{promoted.last ? 'Ура!' : 'К новым задачам'}</button>
      </div>
    </div>}
  </section>;
}
