/**
 * Шаги настройки тренажёра (владелец 16.11.2026, макет
 * trainer-final-mockup.html): фото с цифрами на деталях, шаги карточками со
 * стикером, «подробнее» по нажатию, галочка «сделано» и «Тренажёр готов».
 * Цифра на фото и шаг связаны: нажали одно — подсвечено другое.
 *
 * rows — [{ label, text }] (setupRows), meta — [{ s, p }] по тем же строкам
 * (стикер и место цифры на первом фото в процентах). Стикер не выбран —
 * подбирается по подписи; не подошёл — номер шага.
 */
import React, { useState } from 'react';
import { haptic } from './telegram.js';
import { mediaUrl } from './library.js';
import { splitStep } from './tech-sheet-model.js';
import { Sticker, stickerFor, stickerById, useStickerPack } from './setup-stickers.jsx';
import './setup-steps.css';

const word = (n, one, few, many) => {
  const m = n % 10; const h = n % 100;
  return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 12 || h > 14) ? few : many;
};

/** Фото с цифрами: src — готовый адрес; pins — [{ k, p:[x,y] }] */
export function PinnedPhoto({ src, pins, active = -1, done = [], onPin, children, className = '', onClick, refEl }) {
  return (
    <div className={'ss-photo ' + className} ref={refEl} onClick={onClick}>
      <img src={src} alt="" draggable="false" />
      {pins.map(({ k, p }) => (
        <button key={k} type="button" className={'ss-pin' + (active === k ? ' is-on' : '') + (done.includes(k) ? ' is-done' : '')}
          style={{ left: p[0] + '%', top: p[1] + '%' }} aria-label={'Шаг ' + (k + 1)}
          onClick={(e) => { e.stopPropagation(); if (onPin) onPin(k, e); }}>{k + 1}</button>
      ))}
      {children}
    </div>
  );
}

export default function SetupSteps({ photos = [], rows = [], meta = [], kind = 'machine', alt = '', children = null }) {
  const [open, setOpen] = useState(-1);
  const [done, setDone] = useState([]);
  const [plays, setPlays] = useState({});
  useStickerPack();
  const steps = rows.map((r, k) => {
    const { main, rest } = splitStep(r.text);
    const m = meta[k] || {};
    return { k, label: r.label, main: main ? main.charAt(0).toLocaleUpperCase('ru') + main.slice(1) : '', rest, sticker: (m.s && stickerById(m.s) ? m.s : '') || stickerFor(r.label, r.text), pin: Array.isArray(m.p) ? m.p : null };
  });
  const pins = steps.filter((s) => s.pin).map((s) => ({ k: s.k, p: s.pin }));
  const focus = (k, from) => {
    haptic();
    const on = open === k ? -1 : k;
    setOpen(on);
    if (on >= 0) setPlays((v) => ({ ...v, [k]: (v[k] || 0) + 1 }));
    if (on >= 0 && from === 'pin' && typeof document !== 'undefined') {
      const el = document.getElementById('ss-step-' + k);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  const toggle = (k) => { haptic(done.includes(k) ? undefined : 'success'); setDone((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k])); };
  const n = steps.length;
  const all = n > 0 && done.length === n;
  return (
    <div className="ss">
      {photos.length > 0 && (
        <div className={'ss-photos' + (photos.length > 1 ? ' ss-photos--many' : '')}>
          <PinnedPhoto src={mediaUrl(photos[0])} pins={pins} active={open} done={done} onPin={(k) => focus(k, 'pin')} />
          {photos.slice(1).map((u) => <div key={u} className="ss-photo"><img src={mediaUrl(u)} alt={alt} loading="lazy" draggable="false" /></div>)}
        </div>
      )}
      {children}
      {n > 0 && <>
        <div className="ss-meta"><span>{n} {word(n, 'шаг', 'шага', 'шагов')}</span>{pins.length > 0 && <span>цифры на фото</span>}</div>
        <div className="ss-prog"><div className="ss-bar"><i style={{ width: (done.length / n) * 100 + '%' }} /></div><b>{done.length} из {n}</b></div>
        {all && <div className="ss-ready">✓ {kind === 'equipment' ? 'Всё готово' : 'Тренажёр готов'} — можно начинать</div>}
        <div className="ss-cards">
          {steps.map((s) => (
            <div key={s.k} id={'ss-step-' + s.k} role="button" tabIndex={0}
              className={'ss-card' + (open === s.k ? ' is-on' : '') + (done.includes(s.k) ? ' is-done' : '')}
              onClick={() => focus(s.k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focus(s.k); } }}>
              <div className="ss-ico"><span className="ss-n">{s.k + 1}</span>{s.sticker ? <Sticker id={s.sticker} play={plays[s.k] || 0} /> : <b className="ss-num">{s.k + 1}</b>}</div>
              <div className="ss-t">
                <b>{s.label || s.main}</b>
                {s.label && s.main && <span>{s.main}</span>}
                {s.rest && <div className="ss-more"><div>{s.rest}</div></div>}
                {s.rest && <i className="ss-dn">подробнее</i>}
              </div>
              <button type="button" className="ss-tick" role="checkbox" aria-checked={done.includes(s.k)} aria-label={'Сделано: ' + (s.label || s.main)}
                onClick={(e) => { e.stopPropagation(); toggle(s.k); }}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
              </button>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}
