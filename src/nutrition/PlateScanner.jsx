import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiMutate } from '../api.js';
import { IconClose } from '../icons.jsx';
import { haptic } from '../telegram.js';
import { SCAN_SIZE, scanStep, frameGray, SCAN_HINTS } from './plate-scan.js';
import { LABEL_HINT } from './live-label.js';
import { shrink, LABEL_SIDE } from './plate-photo-io.js';
import { foodTitle, cap } from './FoodFields.jsx';
import './plate-scan.css';

/**
 * AI-сканер еды (FT-746, просьба владельца 25.10.2026): «не делать
 * фотографию, а просто наводить камеру на тарелку». Видоискатель во весь
 * экран; кадр снимается сам, когда телефон замер над едой (plate-scan.js).
 *
 * Камера браузера (getUserMedia) — на сайте, в приложении iPhone и Android
 * одна и та же. Нет камеры или нет разрешения — onFallback: прежний лист со
 * снимком и выбором фото. Видео никуда не уходит: только отдельные кадры.
 *
 * Один сканер на всё (FT-748): с onResult сканер сам спрашивает AI. Блюдо —
 * готовый список уходит в onResult. Упаковка без цифр — камера НЕ
 * закрывается: сверху «Это … — наведите на пищевую ценность», следующий кадр
 * читает AI (diary.photo.label); не прочиталось — «поднесите ближе» и снова.
 * labelFor — сразу этап этикетки (кнопка «Сканировать этикетку» в листе).
 * Без onResult — прежний режим: кадр в onShot.
 *
 * mode 'label' / 'barcode' — тот же видоискатель для FoodScan там, где нет
 * камеры приложения: кадр в onShot, читается на телефоне.
 */
const MODES = {
  plate: { title: 'Сканер еды', ai: true, aria: 'AI-сканер еды', hints: SCAN_HINTS },
  label: { title: 'Этикетка', aria: 'Сканер этикетки', hints: { ...SCAN_HINTS, empty: LABEL_HINT, steady: 'Держите ровно — читаю', ready: 'Читаю этикетку…' } },
  barcode: { title: 'Штрихкод', aria: 'Сканер штрихкода', hints: { ...SCAN_HINTS, empty: 'Наведите рамку на штрихкод', steady: 'Держите ровно — читаю', ready: 'Читаю штрихкод…' } },
};
const PACK_HINTS = { ...SCAN_HINTS, empty: 'Наведите на надпись «Пищевая ценность»', steady: 'Держите ровно — читаю', ready: 'AI читает этикетку…' };
const LABEL_TRIES = 4; // столько кадров этикетки, потом — «впишите вручную»: каждый кадр — запрос к модели
const packName = pack => [cap(pack?.product), pack?.brand].filter(Boolean).join(' · ') || 'продукт в упаковке';

export function PlateScanner({ mode = 'plate', note = '', onShot, onFallback, onClose, onResult, labelFor = null, base = null }) {
  const look = MODES[mode] || MODES.plate;
  const video = useRef(null), stream = useRef(null), state = useRef({}), shot = useRef(false), gallery = useRef(null), tick = useRef(null), alive = useRef(true);
  const [phase, setPhase] = useState('start'), [progress, setProgress] = useState(0);
  // stage: plate — ищем еду; label — узнали упаковку, ждём этикетку. busy — текст, пока отвечает AI
  const [stage, setStage] = useState(labelFor ? { kind: 'label', pack: labelFor, data: base?.data, image: base?.image, tries: 0, hint: '' } : { kind: 'plate' });
  const [busy, setBusy] = useState('');
  const stageRef = useRef(stage); stageRef.current = stage;
  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  const resume = () => { shot.current = false; state.current = {}; setPhase('empty'); setProgress(0); setBusy(''); tick.current?.(); };
  const grab = () => new Promise(resolve => {
    const v = video.current, c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob(blob => resolve(blob ? new File([blob], 'scan.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92);
  });
  // Кадр снят: без onResult — наружу; с onResult — спрашиваем AI, не закрывая камеру
  const handle = async file => {
    if (!file) { stop(); onFallback('nocamera'); return; }
    if (!onResult) { stop(); onShot(file); return; }
    const now = stageRef.current;
    if (now.kind === 'plate') {
      setBusy('AI смотрит, что это…');
      try {
        const image = await shrink(file);
        const data = await apiMutate('diary.photo', { image });
        if (!alive.current) return;
        const pack = data.package;
        if (pack && !pack.match && !pack.label) { haptic('success'); setStage({ kind: 'label', pack, data, image, tries: 0, hint: '' }); resume(); return; }
        stop(); onResult({ image, data });
      } catch (e) { if (alive.current) { stop(); onShot(file); } } // ошибку покажет лист: он повторит запрос сам
      return;
    }
    setBusy('AI читает этикетку…');
    try {
      const image = await shrink(file, LABEL_SIDE);
      const label = await apiMutate('diary.photo.label', { image });
      if (!alive.current) return;
      if (label.readable) { haptic('success'); stop(); onResult({ image: now.image || image, data: now.data, label }); return; }
      const tries = now.tries + 1;
      if (tries >= LABEL_TRIES) { stop(); onResult({ image: now.image || image, data: now.data, labelFailed: true }); return; }
      haptic('warning');
      setStage({ ...now, tries, hint: label.hint });
      setBusy(label.hint);
      // Пауза, чтобы человек успел поднести ближе, а не сняли тот же кадр
      setTimeout(() => { if (alive.current) resume(); }, 1500);
    } catch (e) { if (alive.current) { stop(); onResult({ image: now.image, data: now.data, labelFailed: true, error: e }); } }
  };
  const shoot = async () => {
    const v = video.current;
    if (shot.current || !v?.videoWidth) return;
    shot.current = true; setPhase('ready'); haptic('success');
    const file = await grab();
    if (!onResult) stop();
    void handle(file);
  };
  useEffect(() => {
    let timer;
    alive.current = true;
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
    if (!media?.getUserMedia) { onFallback('nocamera'); return undefined; }
    media.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }).then(s => {
      if (!alive.current) { s.getTracks().forEach(t => t.stop()); return; }
      stream.current = s;
      const v = video.current; v.srcObject = s; v.play().catch(() => {});
      const small = document.createElement('canvas'); small.width = small.height = SCAN_SIZE;
      const ctx = small.getContext('2d', { willReadFrequently: true });
      tick.current = () => {
        clearTimeout(timer);
        if (!alive.current || shot.current) return;
        if (v.readyState >= 2 && v.videoWidth) {
          // Смотрим только квадрат в середине — то, что внутри рамки
          const side = Math.min(v.videoWidth, v.videoHeight);
          ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, SCAN_SIZE, SCAN_SIZE);
          const next = scanStep(state.current, frameGray(ctx.getImageData(0, 0, SCAN_SIZE, SCAN_SIZE).data), performance.now());
          state.current = next; setPhase(next.phase); setProgress(next.progress);
          if (next.phase === 'ready') { void shoot(); return; }
        }
        timer = setTimeout(tick.current, 150);
      };
      tick.current();
    }).catch(e => { if (alive.current) onFallback(e?.name === 'NotAllowedError' ? 'denied' : 'nocamera'); });
    return () => { alive.current = false; clearTimeout(timer); stop(); };
  }, []);
  useEffect(() => {
    const key = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const packing = stage.kind === 'label';
  const hints = packing ? PACK_HINTS : look.hints;
  const wide = packing || mode !== 'plate';
  return createPortal(<div className="plate-scan" role="dialog" aria-modal="true" aria-label={packing ? 'Сканер этикетки' : look.aria}>
    <video ref={video} className="plate-scan__video" muted playsInline autoPlay aria-hidden="true" />
    <div className="plate-scan__top">
      <span className="plate-scan__badge">{look.ai && <><span className="ai-badge">AI</span> </>}{packing ? 'Этикетка' : note || look.title}</span>
      <button type="button" className="plate-scan__close" aria-label="Закрыть сканер" onClick={() => { stop(); onClose(); }}><IconClose size={22} /></button>
    </div>
    <div className="plate-scan__middle">
      {packing && <div className="plate-scan__found" role="status">
        <small>Это упаковка</small>
        <strong>{packName(stage.pack)}</strong>
        {stage.pack.options?.length > 0 && onResult && <div className="plate-scan__base" role="group" aria-label="Похожие в базе">
          <small>Похожие в базе — выберите, если это он:</small>
          {stage.pack.options.map(o => <button key={o.id} type="button" onClick={() => { stop(); onResult({ image: stage.image, data: { ...stage.data, package: { ...stage.pack, match: o } } }); }}><b>{foodTitle(o)}</b><span>{Math.round(o.kcal)} ккал / 100 {o.unit === 'ml' ? 'мл' : 'г'}</span></button>)}
        </div>}
        <span>{stage.pack.options?.length ? 'Нет в списке — наведите на «Пищевую ценность»: запишу новый продукт в базу.' : 'В базе такого нет — наведите на «Пищевую ценность» (таблицу или строку в составе): запишу новый продукт в базу.'}</span>
      </div>}
      <div className={'plate-scan__frame is-' + (busy ? 'ready' : phase) + (wide ? ' plate-scan__frame--wide' : '')} style={{ '--scan-progress': progress }} aria-hidden="true"><i /><i /><i /><i /><span className="plate-scan__beam" /></div>
    </div>
    <div className="plate-scan__bottom">
      <p className="plate-scan__hint" role="status">{busy || (packing && stage.hint) || hints[phase] || hints.empty}</p>
      <div className="plate-scan__bar" aria-hidden="true"><span style={{ transform: 'scaleX(' + progress + ')' }} /></div>
      <div className="plate-scan__actions">
        {packing && onResult
          ? <button type="button" className="plate-scan__ghost" onClick={() => { stop(); onResult({ image: stage.image, data: stage.data, labelFailed: true }); }}>Вписать вручную</button>
          : <button type="button" className="plate-scan__ghost" onClick={() => gallery.current.click()}>Из галереи</button>}
        <button type="button" className="plate-scan__now" disabled={phase === 'start' || shot.current} onClick={() => void shoot()}>{mode === 'plate' && !packing ? 'Распознать сейчас' : 'Прочитать сейчас'}</button>
      </div>
      <input ref={gallery} className="food-scan-file" type="file" accept="image/*" aria-label={mode === 'plate' ? 'Выбрать фото тарелки' : 'Выбрать фото этикетки'} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) { shot.current = true; if (!onResult) stop(); void handle(file); } }} />
    </div>
  </div>, document.body);
}
