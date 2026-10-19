import React, { memo } from 'react';

import { ART } from './storyArt.jsx';
import { mediaUrl } from './library.js';
import { BADGES, STICKER_COLORS, bgCss, onColor, sectionOf } from './story-canvas.js';
import './story-canvas.css';

/**
 * Кадр истории из слоёв (FT-615, шаг 2): один и тот же рисунок в просмотре
 * у клиента, в редакторе и в миниатюрах ленты. Все размеры — в долях
 * ширины кадра (cqw), поэтому миниатюра в 42 пикселя — точная копия кадра
 * на весь экран. Данные — story-canvas.js.
 */

/** Место слоя: центр в долях кадра, поворот и масштаб вокруг центра */
export function placeStyle(L) {
  return {
    left: L.x * 100 + '%',
    top: L.y * 100 + '%',
    transform: `translate(-50%,-50%) rotate(${L.rotate || 0}deg) scale(${L.scale || 1})`,
  };
}

/** То же для картинки на весь кадр: сдвиг в долях кадра и масштаб */
export function bgImageStyle(I) {
  return { transform: `translate(${(I.x || 0) * 100}%,${(I.y || 0) * 100}%) scale(${I.scale || 1})` };
}

export function textClass(L) {
  return `sc-ly sc-text sc-st-${L.style} sc-al-${L.align} sc-pl-${L.plate || 0}`;
}

export function textVars(L) {
  return {
    '--c': L.color,
    '--on': onColor(L.color),
    '--fs': L.size + 'cqw',
    ...(L.width ? { width: L.width + 'cqw', maxWidth: 'none' } : null),
  };
}

function Sticker({ L }) {
  const c = STICKER_COLORS[(L.variant || 0) % STICKER_COLORS.length];
  switch (L.kind) {
    case 'link':
      return (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
          <span>{sectionOf(L.section).label}</span>
        </>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 130 70" fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 52 C 40 12, 82 8, 116 30" /><path d="M96 14 L118 31 L95 45" />
        </svg>
      );
    case 'ring':
      return (
        <svg viewBox="0 0 200 124" fill="none" stroke={c} strokeWidth="7" strokeLinecap="round" aria-hidden="true">
          <path d="M150 14 C 196 26, 202 88, 140 108 C 84 126, 14 114, 8 70 C 2 26, 60 6, 118 8 C 140 9, 160 14, 172 22" />
        </svg>
      );
    case 'step':
    case 'badge':
    case 'emoji':
      return L.kind === 'badge' ? BADGES[(L.value || 0) % BADGES.length].text : String(L.value ?? '');
    case 'photo':
      return L.src ? <img src={mediaUrl(L.src)} alt="" draggable="false" /> : <span className="sc-ph-missing">Картинка</span>;
    case 'art': {
      const Picture = ART[L.value];
      return Picture ? <Picture /> : null;
    }
    default:
      return null;
  }
}

function stickerClass(L) {
  const v = L.variant || 0;
  let cls = `sc-ly sc-stk sc-stk-${L.kind}`;
  if (L.kind === 'link') cls += ' sc-lk-' + (v % 3);
  if (L.kind === 'photo') cls += ' sc-ph-' + (v % 3);
  return cls;
}

function stickerVars(L) {
  if (L.kind === 'step') {
    const c = STICKER_COLORS[(L.variant || 0) % STICKER_COLORS.length];
    return { '--c': c, '--on': onColor(c) };
  }
  if (L.kind === 'badge') {
    const c = BADGES[(L.value || 0) % BADGES.length].color;
    return { '--c': c, '--on': onColor(c) };
  }
  if (L.kind === 'art') return { '--tint': L.color || '#8ec0f5' };
  return null;
}

export function Layer({ L, active = false, editing = false, handle = false }) {
  const state = (active ? ' is-active' : '') + (editing ? ' is-editing' : '');
  const hdl = active && handle
    ? <span className="sc-hdl" style={{ transform: `translate(50%,50%) scale(${1 / (L.scale || 1)})` }} />
    : null;
  if (L.type === 'text') {
    return (
      <div data-id={L.id} className={textClass(L) + state} style={{ ...placeStyle(L), ...textVars(L) }}>
        <span className="sc-tx">{L.text}</span>
        {hdl}
      </div>
    );
  }
  return (
    <div
      data-id={L.id}
      data-section={L.kind === 'link' ? L.section : undefined}
      className={stickerClass(L) + state}
      style={{ ...placeStyle(L), ...stickerVars(L) }}
    >
      <Sticker L={L} />
      {hdl}
    </div>
  );
}

// bare — без своего фона: в просмотре фон один на весь экран, иначе на
// телефоне выше 9:16 у краёв кадра виден шов градиента
function StoryCanvasBase({ canvas, className = '', active = null, editing = null, handle = false, bare = false, innerRef, children, ...rest }) {
  return (
    <div ref={innerRef} className={'sc ' + className} style={bare ? null : { background: bgCss(canvas.bg) }} {...rest}>
      {canvas.image && (
        <div className="sc-bg">
          <img src={mediaUrl(canvas.image.src)} alt="" draggable="false" style={bgImageStyle(canvas.image)} />
          <div className="sc-dim" style={{ opacity: canvas.image.dim || 0 }} />
        </div>
      )}
      {canvas.layers.map((L) => (
        <Layer key={L.id} L={L} active={L.id === active} editing={L.id === editing} handle={handle} />
      ))}
      {children}
    </div>
  );
}

/** Миниатюры перерисовываются, только когда поменялся их кадр */
export const StoryCanvas = memo(StoryCanvasBase);
export default StoryCanvas;
