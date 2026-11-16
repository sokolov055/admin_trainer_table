/**
 * Стикеры шагов настройки тренажёра (владелец 16.11.2026, макет
 * trainer-final-mockup.html): показ с анимацией, поиск по паку и подбор
 * стикера к шагу по подписи. Данные пака — setup-stickers-data.js.
 *
 * Анимация: CSS и SMIL внутри svg. Стикер проигрывается 2 раза при
 * появлении и по play (нажатие на шаг), потом стоит в «конечной» позе;
 * «Уменьшить движение» — сразу стоит.
 */
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { STICKER_CSS } from './setup-stickers-data.js';
import { stickerById, onStickerPack, stickerPackVersion, customStickerCss } from './setup-stickers-search.js';

let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined' || !document.head) return;
  cssDone = true;
  const el = document.createElement('style');
  el.id = 'stk-css';
  el.textContent = STICKER_CSS;
  document.head.appendChild(el);
  const extra = document.createElement('style');
  extra.id = 'stk-css-extra';
  extra.textContent = customStickerCss();
  document.head.appendChild(extra);
  onStickerPack(() => { extra.textContent = customStickerCss(); });
}

/** Перерисовка, когда пришли загруженные стикеры (remote-stickers.js) */
export const useStickerPack = () => useSyncExternalStore(onStickerPack, stickerPackVersion, stickerPackVersion);

function still() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/** Стикер: id из пака; play — меняется, когда надо проиграть заново */
export function Sticker({ id, className = '', play = 0, label }) {
  const pack = useStickerPack();
  const s = stickerById(id);
  const ref = useRef(null);
  ensureCss();
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return undefined;
    // CSS-анимации — перезапуск пересозданием узлов; SMIL — по времени
    svg.innerHTML = s ? s.svg : '';
    if (!svg.setCurrentTime || !svg.querySelector('animate,animateTransform')) return undefined;
    if (still()) { svg.setCurrentTime(1.5); svg.pauseAnimations(); return undefined; }
    svg.setCurrentTime(0);
    svg.unpauseAnimations();
    const t = setTimeout(() => { try { svg.setCurrentTime(1.5); svg.pauseAnimations(); } catch (_) { /* узел ушёл */ } }, 4800);
    return () => clearTimeout(t);
  }, [id, play, pack]);
  if (!s) return null;
  return <svg ref={ref} className={'stk-ic stk-' + s.id + (className ? ' ' + className : '')} viewBox="0 0 48 48" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} />;
}

export { STICKERS, STICKER_GROUPS, BUILTIN_IDS, stickerById, normQuery, oneTypo, searchStickers, stickerFor, setStickerPack } from './setup-stickers-search.js';
