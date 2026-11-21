import React, { useEffect, useRef, useState } from 'react';
import { haptic } from '../telegram.js';
import { n } from './diary-ui.jsx';
import { foodTitle } from './FoodFields.jsx';
import { carbLevel, carbTag } from './carbs.js';
import { foodEmoji } from './today-model.js';
import { ProductSwaps } from './DiaryExtras.jsx';
import './ideas.css';

/*
 * «Идеи» в питании — этап 4 макета nutrition-redesign-2026-11-20 (владелец
 * 20.11.2026: «делай всё как в макете»). Советы кружками-историями, карточка
 * холодильника, блюда под остаток колодой по одному: влево — дальше, вправо —
 * записать. Данные прежние: сервер не меняется.
 */

const SEEN_KEY = 'nutrition_tips_seen_v1';
const SWIPE_PX = 70, FLY_MS = 260;

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}

/** Советы кружками: непрочитанный — цветное кольцо, прочитанный — серое */
export function TipStories({ lessons, onOpen }) {
  const [seen, setSeen] = useState(readSeen);
  const open = (id) => {
    haptic();
    if (!seen.includes(id)) {
      const next = seen.concat(id);
      setSeen(next);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
    }
    onOpen(id);
  };
  // Непрочитанные — вперёд: кружок, который зовёт, должен быть виден без прокрутки
  // Порядок — на момент открытия экрана: прочитанный кружок не прыгает в конец под пальцем
  const [was] = useState(seen);
  const order = lessons.filter((a) => !was.includes(a.id)).concat(lessons.filter((a) => was.includes(a.id)));
  return (
    <div className="nt-tips" role="group" aria-label="Советы по питанию">
      {order.map((a) => (
        <button key={a.id} type="button" className={'nt-tip' + (seen.includes(a.id) ? ' is-seen' : '')} aria-label={'Совет: ' + a.title} onClick={() => open(a.id)}>
          <i aria-hidden="true"><b>{a.emoji}</b></i>
          <span>{a.short}</span>
        </button>
      ))}
    </div>
  );
}

/** Лист совета: картинка и короткие фразы карточками */
export function TipBody({ lesson }) {
  return (
    <div className="nt-tipview">
      <div className="nt-tipview__art" aria-hidden="true">{lesson.emoji}</div>
      <p className="nt-tipview__time">{lesson.time}</p>
      {lesson.paragraphs.map((p, i) => <p key={i} className="nt-tipview__card"><b>{i + 1}</b><span>{p}</span></p>)}
    </div>
  );
}

/** Карточка «Что приготовить из того, что дома» с тремя шагами */
export function FridgeCard({ onOpen }) {
  return (
    <div className="nt-fridge">
      <b className="nt-fridge__title">🧊 Что приготовить из того, что дома</b>
      <p className="nt-fridge__s">Отметьте продукты — соберём день под вашу норму</p>
      <div className="nt-fridge__steps" aria-hidden="true">
        <span><em>🥚</em>отметить</span><span><em>👍</em>выбрать блюда</span><span><em>🛒</em>день и покупки</span>
      </div>
      <button type="button" className="nt-fridge__btn" aria-label="Из того, что есть дома: открыть холодильник" onClick={() => { haptic(); onOpen(); }}>Открыть холодильник</button>
    </div>
  );
}

/**
 * Колода блюд: верхняя карточка тянется пальцем, под ней видна следующая.
 * Кнопки дублируют жест — ✕ дальше, 🔁 состав и замены, ＋ записать.
 */
export function DishDeck({ dishes, readOnly, canAsk, onAdd }) {
  const [at, setAt] = useState(0), [drag, setDrag] = useState(0), [fly, setFly] = useState(null), [swaps, setSwaps] = useState(false);
  const move = useRef(null), busy = useRef(false);
  const key = dishes.map((p) => p.id || p.name).join('|');
  useEffect(() => { setAt(0); setSwaps(false); }, [key]);
  if (!dishes.length) return null;
  const i = at % dishes.length, dish = dishes[i], next = dishes[(i + 1) % dishes.length];
  const decide = (dir) => {
    if (busy.current) return;
    if (dir === 'right' && readOnly) { setDrag(0); return; }
    busy.current = true; haptic(); setDrag(0); setFly(dir); setSwaps(false);
    const done = () => {
      setFly(null); busy.current = false;
      if (dir === 'right') onAdd(dish); else setAt((v) => v + 1);
    };
    if (reduced()) done(); else setTimeout(done, FLY_MS);
  };
  const handlers = {
    onPointerDown: (e) => { if (busy.current || e.target.closest('button')) return; e.currentTarget.setPointerCapture?.(e.pointerId); move.current = { x0: e.clientX, dx: 0 }; },
    onPointerMove: (e) => { if (!move.current) return; move.current.dx = e.clientX - move.current.x0; setDrag(move.current.dx); },
    onPointerUp: () => { const m = move.current; move.current = null; if (!m) return; if (m.dx > SWIPE_PX) decide('right'); else if (m.dx < -SWIPE_PX) decide('left'); else setDrag(0); },
    onPointerCancel: () => { move.current = null; setDrag(0); },
  };
  const style = fly ? { transform: `translateX(${fly === 'right' ? 120 : -120}%) rotate(${fly === 'right' ? 14 : -14}deg)`, opacity: 0, transition: `transform ${FLY_MS}ms ease-in, opacity ${FLY_MS}ms ease-in` }
    : drag ? { transform: `translateX(${drag}px) rotate(${drag / 18}deg)`, transition: 'none' } : undefined;
  const level = carbLevel(dish);
  return (
    <div className="nt-deck-wrap">
      <div className="nt-deck" aria-live="polite">
        {dishes.length > 1 && <div className="nt-dcard nt-dcard--under" aria-hidden="true"><span className="nt-dcard__em">{foodEmoji(next.name)}</span></div>}
        <div className="nt-dcard" style={style} {...handlers}>
          {drag > 30 && !readOnly && <span className="nt-dcard__stamp is-add">записать</span>}
          {drag < -30 && <span className="nt-dcard__stamp is-skip">дальше</span>}
          <span className="nt-dcard__em" aria-hidden="true">{foodEmoji(dish.name)}</span>
          <b className="nt-dcard__name">{foodTitle(dish)}</b>
          <span className="nt-dcard__s">{[dish.minutes ? dish.minutes + ' мин' : '', 'от тренера', (i + 1) + ' из ' + dishes.length].filter(Boolean).join(' · ')}</span>
          <span className="nt-dcard__chips">
            <span className="nt-dchip is-kcal">{n(dish.kcal)} ккал</span>
            <span className="nt-dchip is-p">💪 {n(dish.protein)} г белка</span>
            {level && <span className="nt-dchip">{carbTag(level)}</span>}
          </span>
          {!readOnly && <span className="nt-dcard__hint">← дальше · записать →</span>}
        </div>
      </div>
      <div className="nt-yn">
        <button type="button" className="nt-yn__b" aria-label="Дальше" onClick={() => decide('left')}>✕</button>
        <button type="button" className={'nt-yn__b is-mid' + (swaps ? ' is-on' : '')} aria-label="Состав и замены" aria-expanded={swaps} onClick={() => { haptic(); setSwaps((v) => !v); }}>🔁</button>
        {!readOnly && <button type="button" className="nt-yn__b is-add" aria-label={'Записать: ' + dish.name} onClick={() => decide('right')}>＋</button>}
      </div>
      {swaps && <div className="nt-deck__swaps"><ProductSwaps product={dish} canAsk={canAsk} /></div>}
    </div>
  );
}
