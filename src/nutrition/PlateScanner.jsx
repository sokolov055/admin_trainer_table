import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { SCAN_SIZE, scanStep, frameGray, SCAN_HINTS } from './plate-scan.js';
import './plate-scan.css';

/**
 * AI-сканер еды (FT-746, просьба владельца 25.10.2026): «не делать
 * фотографию, а просто наводить камеру на тарелку». Видоискатель во весь
 * экран; кадр снимается сам, когда телефон замер над едой (plate-scan.js),
 * и уходит в PlatePhoto — там список блюд с граммами, как раньше.
 *
 * Камера браузера (getUserMedia) — на сайте, в приложении iPhone и Android
 * одна и та же. Нет камеры или нет разрешения — onFallback: прежний лист со
 * снимком и выбором фото. Видео никуда не уходит: только один кадр, тот же
 * путь, что у снимка (уменьшение и отрезание метаданных — PlatePhoto).
 */
export function PlateScanner({ onShot, onFallback, onClose }) {
  const video = useRef(null), stream = useRef(null), state = useRef({}), shot = useRef(false), gallery = useRef(null);
  const [phase, setPhase] = useState('start'), [progress, setProgress] = useState(0);
  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  const shoot = () => {
    const v = video.current;
    if (shot.current || !v?.videoWidth) return;
    shot.current = true; setPhase('ready'); haptic('success');
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(blob => { stop(); if (blob) onShot(new File([blob], 'plate.jpg', { type: 'image/jpeg' })); else onFallback('nocamera'); }, 'image/jpeg', 0.9);
  };
  useEffect(() => {
    let on = true, timer;
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!media?.getUserMedia) { onFallback('nocamera'); return undefined; }
    media.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }).then(s => {
      if (!on) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      const v = video.current; v.srcObject = s; v.play().catch(() => {});
      const small = document.createElement('canvas'); small.width = small.height = SCAN_SIZE;
      const ctx = small.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (!on || shot.current) return;
        if (v.readyState >= 2 && v.videoWidth) {
          // Смотрим только квадрат в середине — то, что внутри рамки
          const side = Math.min(v.videoWidth, v.videoHeight);
          ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, SCAN_SIZE, SCAN_SIZE);
          const next = scanStep(state.current, frameGray(ctx.getImageData(0, 0, SCAN_SIZE, SCAN_SIZE).data), performance.now());
          state.current = next; setPhase(next.phase); setProgress(next.progress);
          if (next.phase === 'ready') { shoot(); return; }
        }
        timer = setTimeout(tick, 150);
      };
      tick();
    }).catch(e => { if (on) onFallback(e?.name === 'NotAllowedError' ? 'denied' : 'nocamera'); });
    return () => { on = false; clearTimeout(timer); stop(); };
  }, []);
  useEffect(() => {
    const key = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  return createPortal(<div className="plate-scan" role="dialog" aria-modal="true" aria-label="AI-сканер еды">
    <video ref={video} className="plate-scan__video" muted playsInline autoPlay aria-hidden="true" />
    <div className="plate-scan__top">
      <span className="plate-scan__badge"><span className="ai-badge">AI</span> Сканер еды</span>
      <button type="button" className="plate-scan__close" aria-label="Закрыть сканер" onClick={() => { stop(); onClose(); }}><IconClose size={22} /></button>
    </div>
    <div className={'plate-scan__frame is-' + phase} style={{ '--scan-progress': progress }} aria-hidden="true"><i /><i /><i /><i /><span className="plate-scan__beam" /></div>
    <div className="plate-scan__bottom">
      <p className="plate-scan__hint" role="status">{SCAN_HINTS[phase] || SCAN_HINTS.empty}</p>
      <div className="plate-scan__bar" aria-hidden="true"><span style={{ transform: 'scaleX(' + progress + ')' }} /></div>
      <div className="plate-scan__actions">
        <button type="button" className="plate-scan__ghost" onClick={() => gallery.current.click()}>Из галереи</button>
        <button type="button" className="plate-scan__now" disabled={phase === 'start' || shot.current} onClick={shoot}>Распознать сейчас</button>
      </div>
      <input ref={gallery} className="food-scan-file" type="file" accept="image/*" aria-label="Выбрать фото тарелки" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { shot.current = true; stop(); onShot(file); } }} />
    </div>
  </div>, document.body);
}
